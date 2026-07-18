'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

interface BatchMeta {
  id: string; filename: string; institution: string; accountId: string;
  status: string; createdAt: string; txnCount: number;
  openingBalanceCents: number | null; closingBalanceCents: number | null;
  periodStart: string | null; periodEnd: string | null;
  reconciliation: { status: string; differenceCents: number; confidenceScore: number; createdAt: string } | null;
}

interface Account { id: string; code: string; name: string; type: string; institution: string | null; }

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const fmt = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

function dedupBatches(batches: BatchMeta[]): BatchMeta[] {
  const seen = new Set<string>();
  return batches.filter(b => {
    const key = `${b.filename}|${b.accountId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Returns { year-month: batch } map for an account's batches
function batchByMonth(batches: BatchMeta[]): Record<string, BatchMeta> {
  const map: Record<string, BatchMeta> = {};
  for (const b of batches) {
    if (!b.periodStart) continue;
    const d = new Date(b.periodStart);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2,'0')}`;
    map[key] = b;
  }
  return map;
}

function ReconciliationPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [batches, setBatches] = useState<BatchMeta[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [postReconRunning, setPostReconRunning] = useState(false);
  const [postReconResult, setPostReconResult] = useState<string | null>(null);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

  const toggleAccount = (accountId: string) => setExpandedAccounts(prev => {
    const n = new Set(prev); n.has(accountId) ? n.delete(accountId) : n.add(accountId); return n;
  });

  async function handlePostAndReconcileAll() {
    setPostReconRunning(true);
    setPostReconResult(null);
    try {
      const batchRes = await fetch('/api/v1/import/batches');
      const batchData = await batchRes.json();
      const pending = (batchData.batches ?? []).filter((b: any) => b.pendingCount > 0);
      for (const batch of pending) {
        await fetch('/api/v1/import/post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchId: batch.id }),
        });
      }
      const reconRes = await fetch('/api/v1/reconcile-all', { method: 'POST' });
      const reconData = await reconRes.json();
      if (reconData.ok) {
        setPostReconResult(`${pending.length} batches posted · ${reconData.reconciled} reconciled · ${reconData.needsReview} need review`);
      } else {
        setPostReconResult('Error: ' + reconData.error);
      }
      fetch('/api/v1/import/batches').then(r => r.json()).then(d => {
        if (d.batches) setBatches(dedupBatches(d.batches));
      });
    } catch (e: any) {
      setPostReconResult('Error: ' + e.message);
    } finally {
      setPostReconRunning(false);
    }
  }

  const batchId = searchParams.get('batchId');

  useEffect(() => {
    if (batchId) return;
    fetch('/api/v1/import/batches').then(r => r.json()).then(d => {
      if (d.batches) setBatches(dedupBatches(d.batches));
    }).finally(() => setLoading(false));
    fetch('/api/v1/accounts').then(r => r.json()).then(d => {
      if (d.data?.accounts) setAccounts(d.data.accounts);
    });
  }, [batchId]);

  if (batchId) {
    const sp = searchParams;
    return <DetailView
      batchId={batchId}
      initialAccountId={sp.get('accountId') ?? ''}
      initialPeriodStart={sp.get('periodStart') ?? ''}
      initialPeriodEnd={sp.get('periodEnd') ?? ''}
      initialOpening={sp.get('opening') ?? ''}
      initialClosing={sp.get('closing') ?? ''}
      onBack={() => router.push('/dashboard/reconciliation')}
    />;
  }

  // Group batches by accountId
  const byAccount: Record<string, BatchMeta[]> = {};
  for (const b of batches) {
    if (!byAccount[b.accountId]) byAccount[b.accountId] = [];
    byAccount[b.accountId]!.push(b);
  }

  // Build sorted month list across all batches
  const allMonths = Array.from(new Set(
    batches
      .filter(b => b.periodStart)
      .map(b => {
        const d = new Date(b.periodStart!);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
      })
  )).sort();

  const totalReconciled = batches.filter(b => b.reconciliation?.status === 'complete').length;
  const totalReview = batches.filter(b => b.reconciliation && b.reconciliation.status !== 'complete').length;
  const totalPending = batches.filter(b => !b.reconciliation).length;

  // Sort accounts by code
  const sortedAccountIds = Object.keys(byAccount).sort((a, b) => {
    const accA = accounts.find(ac => ac.id === a);
    const accB = accounts.find(ac => ac.id === b);
    return (accA?.code ?? '').localeCompare(accB?.code ?? '');
  });

  function navigateToBatch(batch: BatchMeta) {
    const p = new URLSearchParams({ batchId: batch.id, accountId: batch.accountId ?? '' });
    if (batch.periodStart) p.set('periodStart', batch.periodStart);
    if (batch.periodEnd) p.set('periodEnd', batch.periodEnd);
    if (batch.openingBalanceCents != null) p.set('opening', String(batch.openingBalanceCents / 100));
    if (batch.closingBalanceCents != null) p.set('closing', String(batch.closingBalanceCents / 100));
    router.push('/dashboard/reconciliation?' + p.toString());
  }

  return (
    <div style={{ maxWidth: '1100px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', color: '#2E4057', marginBottom: '0.25rem' }}>Bank Reconciliation</h1>
          <p style={{ color: '#666' }}>Statement status by account and month</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {postReconResult && <span style={{ fontSize: '0.85rem', color: '#2E7D32', fontWeight: 600 }}>✓ {postReconResult}</span>}
          <button
            onClick={handlePostAndReconcileAll}
            disabled={postReconRunning}
            style={{ background: '#2E4057', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: postReconRunning ? 0.6 : 1 }}
          >
            {postReconRunning ? 'Working…' : '⚡ Reconcile All'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: '✅ Reconciled', value: totalReconciled, color: '#16a34a' },
          { label: '⚠️ Needs Review', value: totalReview, color: '#d97706' },
          { label: '⏳ Not Started', value: totalPending, color: '#6b7280' },
        ].map(c => (
          <div key={c.label} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{c.label}</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: '2rem', color: '#6b7280' }}>Loading statements...</div>
      ) : batches.length === 0 ? (
        <div style={{ padding: '2rem', color: '#6b7280', textAlign: 'center' }}>
          No imported statements yet. <a href="/dashboard/import" style={{ color: '#1d4ed8' }}>Import PDFs →</a>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {sortedAccountIds.map(accountId => {
            const acctBatches = byAccount[accountId] ?? [];
            const acct = accounts.find(a => a.id === accountId);
            const monthMap = batchByMonth(acctBatches);
            const reconCount = acctBatches.filter(b => b.reconciliation?.status === 'complete').length;
            const isOpen = expandedAccounts.has(accountId);
            const allReconciled = reconCount === acctBatches.length;

            return (
              <div key={accountId} style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden', background: 'white' }}>
                {/* Account header */}
                <button
                  onClick={() => toggleAccount(accountId)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#2E4057' }}>
                      {acct ? `${acct.code} — ${acct.name}` : accountId}
                    </span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: '99px',
                      background: allReconciled ? '#dcfce7' : '#fee2e2',
                      color: allReconciled ? '#166534' : '#dc2626' }}>
                      {reconCount}/{acctBatches.length} reconciled
                    </span>
                  </div>
                  <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>{isOpen ? '▲' : '▼'}</span>
                </button>

                {/* Month grid */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid #e5e7eb', padding: '1rem 1.25rem' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {allMonths.map(ym => {
                        const batch = monthMap[ym];
                        if (!batch) return null;
                        const [yr, mo] = ym.split('-');
                        const label = `${MONTH_LABELS[parseInt(mo!)-1]} ${yr!.slice(2)}`;
                        const isReconciled = batch.reconciliation?.status === 'complete';
                        const isReview = batch.reconciliation && batch.reconciliation.status !== 'complete';

                        return (
                          <button
                            key={ym}
                            onClick={() => navigateToBatch(batch)}
                            title={`${batch.txnCount} transactions · ${batch.filename}`}
                            style={{
                              display: 'flex', flexDirection: 'column', alignItems: 'center',
                              padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1.5px solid',
                              cursor: 'pointer', minWidth: '70px', gap: '0.2rem',
                              background: isReconciled ? '#f0fdf4' : isReview ? '#fffbeb' : '#f9fafb',
                              borderColor: isReconciled ? '#86efac' : isReview ? '#fcd34d' : '#e5e7eb',
                            }}
                          >
                            <span style={{ fontSize: '1rem' }}>
                              {isReconciled ? '✅' : isReview ? '⚠️' : '⏳'}
                            </span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>{label}</span>
                            <span style={{ fontSize: '0.65rem', color: '#9ca3af' }}>{batch.txnCount} txn</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DetailView({ batchId, initialAccountId, initialPeriodStart, initialPeriodEnd, initialOpening, initialClosing, onBack }: { batchId: string; initialAccountId: string; initialPeriodStart: string; initialPeriodEnd: string; initialOpening: string; initialClosing: string; onBack: () => void }) {
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState(initialAccountId);
  const [periodStart, setPeriodStart] = useState(initialPeriodStart);
  const [periodEnd, setPeriodEnd] = useState(initialPeriodEnd);
  const [openingBalance, setOpeningBalance] = useState(initialOpening);
  const [closingBalance, setClosingBalance] = useState(initialClosing);
  const [txnInput, setTxnInput] = useState('');
  const [loadingTxns, setLoadingTxns] = useState(false);
  const [txnsLoaded, setTxnsLoaded] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');


  useEffect(() => {
    fetch('/api/v1/accounts').then(r => r.json()).then(d => {
      if (d.data?.accounts) {
        setAccounts((d.data.accounts as Array<{id:string;code:string;name:string;type:string;institution:string|null}>).filter(a => a.type==='asset'||a.type==='liability'));
        // Use initialAccountId from props (already set in useState), don't overwrite
        if (initialAccountId) setAccountId(initialAccountId);
      }
    }).catch(()=>{});
  }, []);
  useEffect(() => {
    if (!batchId) return;
    setLoadingTxns(true);
    fetch(`/api/v1/import/batch?batchId=${batchId}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok && data.transactions?.length) {
          setTxnInput(data.transactions.map((t: any) => `${t.description}|${t.date}|${(t.amountCents/100).toFixed(2)}|${t.direction}`).join('\n'));
          setTxnsLoaded(true);
        }
      }).finally(() => setLoadingTxns(false));
  }, [batchId]);

  async function runReconcile() {
    setError(''); setResult(null);
    if (!accountId) { setError('Select an account.'); return; }
    if (!openingBalance) { setError('Enter opening balance.'); return; }
    if (!closingBalance) { setError('Enter closing balance.'); return; }
    if (!txnInput.trim()) { setError('No transactions loaded.'); return; }
    setLoading(true);
    try {
      const txns = txnInput.trim().split('\n').filter(Boolean).map(line => {
        const p = line.split('|');
        return { description: (p[0]??'').trim(), date: (p[1]??'').trim(), amountCents: Math.round(parseFloat((p[2]??'0').trim())*100), direction: (p[3]??'debit').trim() };
      });
      const res = await fetch('/api/v1/reconcile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, periodStart, periodEnd, openingBalanceCents: Math.round(parseFloat(openingBalance)*100), closingBalanceCents: Math.round(parseFloat(closingBalance)*100), statementTransactions: txns }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
    } catch(e) { setError(String(e)); } finally { setLoading(false); }
  }

  const scoreColor = (s: number) => s >= 80 ? '#22c55e' : s >= 50 ? '#f59e0b' : '#ef4444';
  const fmt2 = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents/100);

  return (
    <div style={{ maxWidth: '1100px' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#1d4ed8', cursor: 'pointer', fontSize: '0.9rem', marginBottom: '1rem', padding: 0 }}>← Back to all statements</button>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Bank Reconciliation</h1>

      {!result && (
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
          {txnsLoaded && <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '0.75rem', marginBottom: '1rem', fontSize: '0.875rem', color: '#1d4ed8' }}>✅ {txnInput.split('\n').filter(Boolean).length} transactions loaded from import. Review and click Run.</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={lbl}>Account</label>
              <select value={accountId} onChange={e => setAccountId(e.target.value)} style={inp}>
                <option value="">Select account...</option>
                {accounts.filter(a => a.type==='asset'||a.type==='liability').map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div><label style={lbl}>Period Start</label><input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} style={inp} /></div>
              <div><label style={lbl}>Period End</label><input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} style={inp} /></div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div><label style={lbl}>Opening Balance ($)</label><input type="number" step="0.01" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} style={inp} /></div>
            <div><label style={lbl}>Closing Balance ($)</label><input type="number" step="0.01" value={closingBalance} onChange={e => setClosingBalance(e.target.value)} style={inp} /></div>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={lbl}>Transactions {txnsLoaded && <span style={{ color: '#22c55e' }}>✅ Auto-loaded</span>}</label>
            {loadingTxns ? <div style={{ padding: '1rem', color: '#6b7280' }}>Loading...</div> : <textarea value={txnInput} onChange={e => setTxnInput(e.target.value)} rows={8} style={{ ...inp, fontFamily: 'monospace', fontSize: '0.8rem' }} />}
          </div>
          {error && <p style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</p>}
          <button onClick={runReconcile} disabled={loading || !accountId} style={{ background: !accountId ? '#9ca3af' : '#1d4ed8', color: 'white', padding: '0.625rem 1.5rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
            {loading ? 'Reconciling...' : 'Run Reconciliation'}
          </button>
        </div>
      )}

      {result && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            {[
              { label: 'Confidence', value: `${result.confidenceScore}%`, color: scoreColor(result.confidenceScore) },
              { label: 'Status', value: result.status.toUpperCase(), color: result.status==='complete'?'#22c55e':'#f59e0b' },
              { label: 'Difference', value: fmt2(Math.abs(result.differenceCents)), color: result.differenceCents===0?'#22c55e':'#ef4444' },
              { label: 'Balance Check', value: result.statementBalances?'✅ Pass':'❌ Fail', color: result.statementBalances?'#22c55e':'#ef4444' },
            ].map(c => (
              <div key={c.label} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{c.label}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: c.color }}>{c.value}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            {[{ label: 'Matched', value: result.matchedCount, color: '#22c55e' }, { label: 'Unmatched (Stmt)', value: result.unmatchedStatementCount, color: '#ef4444' }, { label: 'Unmatched (Ledger)', value: result.unmatchedLedgerCount, color: '#f59e0b' }].map(c => (
              <div key={c.label} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{c.label}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: c.color }}>{c.value}</div>
              </div>
            ))}
          </div>
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead><tr style={{ background: '#f9fafb' }}>
                <th style={{ padding: '0.75rem', textAlign: 'left' }}>Match</th>
                <th style={{ padding: '0.75rem', textAlign: 'left' }}>Statement</th>
                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Amt</th>
                <th style={{ padding: '0.75rem', textAlign: 'left' }}>Ledger</th>
                <th style={{ padding: '0.75rem', textAlign: 'center' }}>Score</th>
              </tr></thead>
              <tbody>
                {result.items.map((item: any, i: number) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.75rem' }}>{item.matchType==='exact'?'🟢':item.matchType==='fuzzy'?'🟡':item.matchType==='unmatched_statement'?'🔴':'🟠'} {item.matchType.replace(/_/g,' ')}</td>
                    <td style={{ padding: '0.75rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.statementDescription||'—'}<div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{item.statementDate?.slice(0,10)}</div></td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', color: item.statementDirection==='credit'?'#22c55e':'#ef4444' }}>{item.statementAmountCents!=null?fmt2(item.statementAmountCents):'—'}</td>
                    <td style={{ padding: '0.75rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.ledgerDescription||'—'}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>{item.matchScore>0?<span style={{ color: scoreColor(item.matchScore) }}>{item.matchScore}%</span>:'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
            <button onClick={() => setResult(null)} style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: '6px', background: 'white', cursor: 'pointer' }}>← New Reconciliation</button>
            <button onClick={onBack} style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: '6px', background: 'white', cursor: 'pointer' }}>← All Statements</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<div style={{ padding: '2rem' }}>Loading...</div>}><ReconciliationPage /></Suspense>;
}

const lbl: React.CSSProperties = { display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' };
const inp: React.CSSProperties = { width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' };
