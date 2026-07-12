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

interface Account { id: string; code: string; name: string; type: string; }

const INST_LABELS: Record<string, string> = {
  wells_fargo: 'Wells Fargo', us_bank: 'U.S. Bank', citi: 'Citi',
  synchrony: 'Synchrony', chase: 'Chase', bofa: 'BofA',
};

const fmt = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

function statusBadge(batch: BatchMeta) {
  const r = batch.reconciliation;
  if (!r) return <span style={{ color: '#6b7280', background: '#f3f4f6', padding: '0.2rem 0.6rem', borderRadius: '99px', fontSize: '0.75rem' }}>Not reconciled</span>;
  if (r.status === 'complete') return <span style={{ color: '#16a34a', background: '#f0fdf4', padding: '0.2rem 0.6rem', borderRadius: '99px', fontSize: '0.75rem', fontWeight: 600 }}>✅ Reconciled</span>;
  return <span style={{ color: '#d97706', background: '#fffbeb', padding: '0.2rem 0.6rem', borderRadius: '99px', fontSize: '0.75rem', fontWeight: 600 }}>⚠️ Review ({fmt(Math.abs(r.differenceCents))} diff)</span>;
}

function dedupBatches(batches: BatchMeta[]): BatchMeta[] {
  const seen = new Set<string>();
  return batches.filter(b => {
    const key = `${b.filename}|${b.accountId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ReconciliationPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [batches, setBatches] = useState<BatchMeta[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [reconRunning, setReconRunning] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'detail'>('list');

  const batchId = searchParams.get('batchId');

  useEffect(() => {
    if (batchId) { setView('detail'); return; }
    fetch('/api/v1/import/batches').then(r => r.json()).then(d => {
      if (d.ok) setBatches(dedupBatches(d.batches));
    }).finally(() => setLoading(false));
    fetch('/api/v1/accounts').then(r => r.json()).then(d => {
      if (d.data?.accounts) setAccounts(d.data.accounts);
    });
  }, [batchId]);

  if (view === 'detail' || batchId) {
    return <DetailView batchId={batchId!} accounts={accounts} onBack={() => { router.push('/dashboard/reconciliation'); setView('list'); }} />;
  }

  const grouped = batches.reduce((acc, b) => {
    const key = b.institution ?? 'unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(b);
    return acc;
  }, {} as Record<string, BatchMeta[]>);

  const totalReconciled = batches.filter(b => b.reconciliation?.status === 'complete').length;
  const totalReview = batches.filter(b => b.reconciliation && b.reconciliation.status !== 'complete').length;
  const totalPending = batches.filter(b => !b.reconciliation).length;

  return (
    <div style={{ maxWidth: '900px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', color: '#2E4057', marginBottom: '0.25rem' }}>Bank Reconciliation</h1>
          <p style={{ color: '#666' }}>Review and reconcile all imported statements</p>
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
        Object.entries(grouped).map(([inst, instBatches]) => (
          <div key={inst} style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#2E4057', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {INST_LABELS[inst] ?? inst}
            </h2>
            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
              {instBatches.map((batch, i) => (
                <div key={batch.id} style={{ display: 'flex', alignItems: 'center', padding: '0.875rem 1rem', borderBottom: i < instBatches.length-1 ? '1px solid #f3f4f6' : 'none', gap: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.9rem', color: '#1f2937' }}>{batch.filename}</div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.1rem' }}>
                      {batch.txnCount} transactions · {new Date(batch.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div>{statusBadge(batch)}</div>
                  <button
                    onClick={() => { const p = new URLSearchParams({ batchId: batch.id, accountId: batch.accountId ?? '' }); if (batch.periodStart) p.set('periodStart', batch.periodStart); if (batch.periodEnd) p.set('periodEnd', batch.periodEnd); if (batch.openingBalanceCents != null) p.set('opening', String(batch.openingBalanceCents / 100)); if (batch.closingBalanceCents != null) p.set('closing', String(batch.closingBalanceCents / 100)); router.push('/dashboard/reconciliation?' + p.toString()); }}
                    style={{ background: '#1d4ed8', color: 'white', border: 'none', borderRadius: '6px', padding: '0.4rem 0.875rem', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {batch.reconciliation ? 'Re-reconcile' : 'Reconcile →'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function DetailView({ batchId, accounts, onBack }: { batchId: string; accounts: Account[]; onBack: () => void }) {
  const searchParams = useSearchParams();
  const [accountId, setAccountId] = useState(searchParams.get('accountId') ?? '');
  const [periodStart, setPeriodStart] = useState(searchParams.get('periodStart') ?? '');
  const [periodEnd, setPeriodEnd] = useState(searchParams.get('periodEnd') ?? '');
  const [openingBalance, setOpeningBalance] = useState(searchParams.get('opening') ?? '');
  const [closingBalance, setClosingBalance] = useState(searchParams.get('closing') ?? '');
  const [txnInput, setTxnInput] = useState('');
  const [loadingTxns, setLoadingTxns] = useState(false);
  const [txnsLoaded, setTxnsLoaded] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');


  useEffect(() => {
    const id = searchParams.get('accountId') ?? '';
    if (id && accounts.length > 0) setAccountId(id);
  }, [accounts]);
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
