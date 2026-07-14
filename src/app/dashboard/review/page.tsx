'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Batch = {
  id: string;
  filename: string;
  institution: string;
  accountRef: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  status: 'pending' | 'posted' | 'reconciled' | 'done';
  transactionCount: number;
  pendingCount: number;
  postedCount: number;
};

const INSTITUTION_LABELS: Record<string, string> = {
  wells_fargo: 'Wells Fargo',
  us_bank: 'US Bank',
  chase: 'Chase',
  citi: 'Citi',
  synchrony: 'Synchrony',
  bofa: 'Bank of America',
};

const INSTITUTION_COLORS: Record<string, { bg: string; text: string; logo: string }> = {
  wells_fargo: { bg: '#C8102E', text: '#fff', logo: 'WF' },
  us_bank:     { bg: '#003087', text: '#fff', logo: 'USB' },
  chase:       { bg: '#117ACA', text: '#fff', logo: 'C' },
  citi:        { bg: '#003B8E', text: '#fff', logo: 'Ci' },
  synchrony:   { bg: '#00A651', text: '#fff', logo: 'SY' },
  bofa:        { bg: '#E31837', text: '#fff', logo: 'BA' },
};

function formatDate(d: string | null) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m??'1') - 1]} ${parseInt(day??'1')}, ${y}`;
}

function StatusPill({ status, pendingCount }: { status: string; pendingCount: number }) {
  if (pendingCount > 0 && status === 'done') {
    return <span style={{ background: '#FFF3E0', color: '#E65100', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>Needs Post</span>;
  }
  if (status === 'done' || status === 'reconciled') {
    return <span style={{ background: '#E8F5E9', color: '#2E7D32', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>✓ Done</span>;
  }
  if (status === 'needs_review') {
    return <span style={{ background: '#FDE8E8', color: '#C62828', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>⚠ Review</span>;
  }
  if (status === 'posted') {
    return <span style={{ background: '#E3F2FD', color: '#1565C0', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>Posted</span>;
  }
  return <span style={{ background: '#FFF8E1', color: '#F57F17', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>Pending</span>;
}

export default function ReviewPage() {
  const router = useRouter();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [postingAll, setPostingAll] = useState(false);
  const [postAllResult, setPostAllResult] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchBatches(); }, []);

  async function fetchBatches() {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/import/batches');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      const b = data.batches ?? [];
      setBatches(b);
      // Auto-expand institutions with pending work, collapse completed ones
      const toExpand: Record<string, boolean> = {};
      const byInst: Record<string, typeof b> = {};
      for (const batch of b) {
        if (!byInst[batch.institution]) byInst[batch.institution] = [];
        byInst[batch.institution].push(batch);
      }
      for (const [inst, batches] of Object.entries(byInst)) {
        const hasPending = (batches as any[]).some((x: any) => x.pendingCount > 0 || x.status === 'posted');
        const allComplete = (batches as any[]).every((x: any) => (x.status === 'reconciled' || x.status === 'done') && x.pendingCount === 0);
        if (hasPending) toExpand[inst] = true;
        if (allComplete) toExpand[inst] = false;
      }
      setExpanded(prev => ({ ...prev, ...toExpand }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePostAll(batchId: string) {
    setActionLoading(prev => ({ ...prev, [batchId]: true }));
    try {
      await fetch(`/api/v1/import/${batchId}/post`, { method: 'POST' });
      await fetchBatches();
    } catch (e: any) {
      alert(`Post failed: ${e.message}`);
    } finally {
      setActionLoading(prev => ({ ...prev, [batchId]: false }));
    }
  }

  async function handlePostAllInstitutions() {
    setPostingAll(true);
    setPostAllResult(null);
    const pending = batches.filter(b => b.pendingCount > 0);
    let posted = 0;
    for (const batch of pending) {
      try {
        await fetch('/api/v1/import/post', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batchId: batch.id }) });
        posted++;
      } catch {}
    }
    setPostAllResult(`${posted} batch${posted !== 1 ? 'es' : ''} posted`);
    setPostingAll(false);
    await fetchBatches();
  }

  function handleReconcile(batch: Batch) {
    const params = new URLSearchParams({ batchId: batch.id });
    if (batch.periodStart) params.set('periodStart', batch.periodStart);
    if (batch.periodEnd) params.set('periodEnd', batch.periodEnd);
    router.push(`/dashboard/reconciliation?${params.toString()}`);
  }

  // Group by institution
  const institutionOrder = ['wells_fargo', 'us_bank', 'chase', 'citi', 'synchrony', 'bofa'];
  const grouped: Record<string, Batch[]> = {};
  for (const b of batches) {
    if (!grouped[b.institution]) grouped[b.institution] = [];
    grouped[b.institution]!.push(b);
  }
  // Group each institution's batches by accountRef
  const sortedInstitutions = [
    ...institutionOrder.filter(k => grouped[k]),
    ...Object.keys(grouped).filter(k => !institutionOrder.includes(k)),
  ];

  const hasPending = batches.some(b => b.pendingCount > 0);

  if (loading) return <div style={{ padding: 32, color: '#888' }}>Loading statements…</div>;
  if (error) return <div style={{ padding: 32, color: '#C62828' }}>Error: {error}</div>;

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '2rem 1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#1a1a2e', margin: 0 }}>Statement Review</h1>
          <div style={{ color: '#888', fontSize: 14, marginTop: 2 }}>{batches.length} statements across {sortedInstitutions.length} institutions</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {postAllResult && <span style={{ color: '#2E7D32', fontSize: 13, fontWeight: 600 }}>✓ {postAllResult}</span>}
          {hasPending && (
            <button
              onClick={handlePostAllInstitutions}
              disabled={postingAll}
              style={{ background: '#2E4057', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: postingAll ? 0.6 : 1 }}
            >
              {postingAll ? 'Posting…' : 'Post All'}
            </button>
          )}
        </div>
      </div>

      {/* Institution Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sortedInstitutions.map(institution => {
          const instBatches = grouped[institution] ?? [];
          const colors = INSTITUTION_COLORS[institution] ?? { bg: '#888', text: '#fff', logo: '?' };
          const label = INSTITUTION_LABELS[institution] ?? institution;
          const isExpanded = expanded[institution] ?? false;
          const needsAction = instBatches.some(b => b.pendingCount > 0 || b.status === 'posted');
          const allDone = instBatches.every(b => b.status === 'reconciled' || b.status === 'done' && b.pendingCount === 0);

          // Group by accountRef within institution
          const byAccount: Record<string, Batch[]> = {};
          for (const b of instBatches) {
            const key = b.accountRef ?? 'unknown';
            if (!byAccount[key]) byAccount[key] = [];
            byAccount[key].push(b);
          }

          return (
            <div key={institution} style={{ background: '#fff', borderRadius: 16, border: '1px solid #E8E8E8', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              {/* Institution Header */}
              <button
                onClick={() => setExpanded(prev => ({ ...prev, [institution]: allDone ? !isExpanded : !isExpanded }))}
                style={{ width: '100%', background: 'none', border: 'none', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, background: colors.bg, color: colors.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                  {colors.logo}
                </div>
                <span style={{ flex: 1, fontWeight: 700, fontSize: 16, color: '#1a1a2e' }}>{label}</span>
                {needsAction && <span style={{ background: '#FFF3E0', color: '#E65100', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>Action needed</span>}
                <span style={{ color: '#aaa', fontSize: 18 }}>{isExpanded ? '∧' : '∨'}</span>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid #F0F0F0' }}>
                  {Object.entries(byAccount).map(([accountRef, acctBatches]) => (
                    <div key={accountRef}>
                      {/* Account sub-header */}
                      <div style={{ padding: '10px 20px 6px', background: '#FAFAFA', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: colors.bg + '22', color: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                          ···
                        </div>
                        <span style={{ fontWeight: 600, fontSize: 14, color: '#444' }}>···{accountRef}</span>
                      </div>

                      {/* Batch rows */}
                      {acctBatches
                        .sort((a, b) => (a.periodStart ?? '').localeCompare(b.periodStart ?? ''))
                        .map((batch, idx) => (
                          <div key={batch.id} style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, borderTop: idx > 0 ? '1px solid #F5F5F5' : undefined }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 14, color: '#333', fontWeight: 500 }}>
                                {formatDate(batch.periodStart)} – {formatDate(batch.periodEnd)}
                              </div>
                              <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>
                                {batch.transactionCount} transactions
                                {batch.pendingCount > 0 && <span style={{ color: '#E65100' }}> · {batch.pendingCount} pending</span>}
                              </div>
                            </div>
                            <StatusPill status={batch.status} pendingCount={batch.pendingCount} />
                            <div style={{ display: 'flex', gap: 8 }}>
                              {batch.pendingCount > 0 && (
                                <button
                                  onClick={() => handlePostAll(batch.id)}
                                  disabled={actionLoading[batch.id]}
                                  style={{ background: '#2E4057', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: actionLoading[batch.id] ? 0.6 : 1 }}
                                >
                                  {actionLoading[batch.id] ? '…' : 'Post'}
                                </button>
                              )}
                              {batch.status === 'posted' && batch.pendingCount === 0 && (
                                <button
                                  onClick={() => handleReconcile(batch)}
                                  style={{ background: '#E8F5E9', color: '#2E7D32', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                                >
                                  Reconcile →
                                </button>
                              )}
                              <a
                                href={`/dashboard/import/${batch.id}`}
                                style={{ background: '#F5F5F5', color: '#555', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}
                              >
                                View
                              </a>
                            </div>
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
