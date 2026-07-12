'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

interface Account { id: string; code: string; name: string; type: string; }
interface StatementTxn { description: string; date: string; amountCents: number; direction: 'debit' | 'credit'; }
interface ReconcileResult {
  reconciliationId: string; statementCreditsCents: number; statementDebitsCents: number;
  calculatedBalanceCents: number; differenceCents: number; statementBalances: boolean;
  matchedCount: number; unmatchedStatementCount: number; unmatchedLedgerCount: number;
  confidenceScore: number; status: string;
  suggestions: Array<{ category: string; description: string; amountCents?: number; probability: number }>;
  items: Array<{
    matchType: string; matchScore: number;
    statementDescription?: string; statementDate?: string;
    statementAmountCents?: number; statementDirection?: string;
    journalEntryId?: string; ledgerDescription?: string; ledgerAmountCents?: number;
  }>;
}

const fmt = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

const MATCH_COLORS: Record<string, string> = {
  exact: '🟢', fuzzy: '🟡', unmatched_statement: '🔴', unmatched_ledger: '🟠',
};

const HARDCODED_ACCOUNTS: Account[] = [
  { id: 'ea3dc024-95ca-412d-90d7-ab93a0de4ea9', code: '1011', name: 'WF Everyday Checking (4184)', type: 'asset' },
  { id: '26f24223-a34d-42f0-9cc8-81e049b233d8', code: '1013', name: 'WF Way2Save Savings (8029)', type: 'asset' },
  { id: '55a0b455-9512-4ba9-a063-1bab7fdee6d7', code: '1014', name: 'USB Gold Checking (6820)', type: 'asset' },
  { id: '3a9dc5de-be96-46a9-b4ef-fee55bb928c7', code: '1015', name: 'USB Smartly Joint (1353)', type: 'asset' },
  { id: 'af26b25b-5fb4-478b-91a9-6ccc6fa5efd6', code: '1016', name: 'BofA Adv Plus Checking (1961)', type: 'asset' },
  { id: '8bbe8b88-e09b-411f-9dd8-0d23970726da', code: '1017', name: 'BofA Regular Savings (6951)', type: 'asset' },
  { id: 'b01b6747-c5e4-45f1-8bfd-3499388d5108', code: '2011', name: 'SamsClub Mastercard (1629)', type: 'liability' },
  { id: 'c653eb83-ca2d-49e7-9a73-4c9934bb2b73', code: '2012', name: 'Chase Amazon Visa (2877)', type: 'liability' },
  { id: '8ad3001a-486d-498a-ab5c-c1582915025f', code: '2013', name: 'Citi Costco Visa (4621)', type: 'liability' },
];

function ReconciliationForm() {
  const searchParams = useSearchParams();
  const [accounts] = useState<Account[]>(HARDCODED_ACCOUNTS);
  const [accountId, setAccountId]       = useState(searchParams.get('accountId') ?? '');
  const [periodStart, setPeriodStart]   = useState(searchParams.get('periodStart') ?? '');
  const [periodEnd, setPeriodEnd]       = useState(searchParams.get('periodEnd') ?? '');
  const [openingBalance, setOpeningBalance] = useState(searchParams.get('opening') ?? '');
  const [closingBalance, setClosingBalance] = useState(searchParams.get('closing') ?? '');
  const [txnInput, setTxnInput]         = useState('');
  const [result, setResult]             = useState<ReconcileResult | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [activeTab, setActiveTab]       = useState<'all'|'matched'|'unmatched'|'suggestions'>('all');

  const isPreFilled = !!(searchParams.get('accountId') && searchParams.get('opening') && searchParams.get('closing'));

  function parseTxns(): StatementTxn[] {
    return txnInput.trim().split('\n').filter(Boolean).map(line => {
      const parts = line.split('|');
      if (parts.length < 4) return null;
      return {
        description: (parts[0] ?? '').trim(),
        date: (parts[1] ?? '').trim(),
        amountCents: Math.round(parseFloat((parts[2] ?? '0').trim()) * 100),
        direction: (parts[3] ?? 'debit').trim() as 'debit' | 'credit',
      };
    }).filter(Boolean) as StatementTxn[];
  }

  async function runReconcile() {
    setError(''); setResult(null);
    if (!openingBalance) { setError('Enter the opening balance from your statement.'); return; }
    if (!closingBalance) { setError('Enter the closing balance from your statement.'); return; }
    if (!txnInput.trim()) { setError('Enter at least one statement transaction.'); return; }
    setLoading(true);
    try {
      const txns = parseTxns();
      const res = await fetch('/api/v1/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId, periodStart, periodEnd,
          openingBalanceCents: Math.round(parseFloat(openingBalance) * 100),
          closingBalanceCents: Math.round(parseFloat(closingBalance) * 100),
          statementTransactions: txns,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
      setActiveTab('all');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const filteredItems = result?.items.filter(i => {
    if (activeTab === 'matched')   return i.matchType === 'exact' || i.matchType === 'fuzzy';
    if (activeTab === 'unmatched') return i.matchType === 'unmatched_statement' || i.matchType === 'unmatched_ledger';
    return true;
  }) ?? [];

  const scoreColor = (s: number) => s >= 80 ? '#22c55e' : s >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>Bank Reconciliation</h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem' }}>Reconcile your bank statement against PFOS journal entries</p>

      {!result && (
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
          {isPreFilled && (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.875rem', color: '#1d4ed8' }}>
              ✅ Account, period, and balances pre-filled from your import. Just add the transaction list below and click Run.
            </div>
          )}
          <h2 style={{ fontWeight: 600, marginBottom: '1rem' }}>Statement Details</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={lbl}>Account</label>
              <select value={accountId} onChange={e => setAccountId(e.target.value)} style={inp}>
                <option value="">Select account...</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div>
                <label style={lbl}>Period Start</label>
                <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} style={inp} />
              </div>
              <div>
                <label style={lbl}>Period End</label>
                <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} style={inp} />
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={lbl}>Opening Balance ($)</label>
              <input type="number" step="0.01" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} placeholder="0.00" style={inp} />
            </div>
            <div>
              <label style={lbl}>Closing Balance ($)</label>
              <input type="number" step="0.01" value={closingBalance} onChange={e => setClosingBalance(e.target.value)} placeholder="0.00" style={inp} />
            </div>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={lbl}>
              Statement Transactions
              <span style={{ color: '#6b7280', fontWeight: 400 }}> — one per line: Description | Date | Amount | debit/credit</span>
            </label>
            <textarea value={txnInput} onChange={e => setTxnInput(e.target.value)} rows={8}
              placeholder={"PAYROLL DEPOSIT|2025-12-30|2500.00|credit\nWALMART|2025-12-31|87.45|debit"}
              style={{ ...inp, fontFamily: 'monospace', fontSize: '0.8rem' }} />
          </div>
          {error && <p style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</p>}
          <button onClick={runReconcile} disabled={loading || !accountId}
            style={{ background: loading || !accountId ? '#9ca3af' : '#1d4ed8', color: 'white', padding: '0.625rem 1.5rem', borderRadius: '6px', border: 'none', cursor: loading || !accountId ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
            {loading ? 'Reconciling...' : 'Run Reconciliation'}
          </button>
        </div>
      )}

      {result && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            {[
              { label: 'Confidence Score', value: `${result.confidenceScore}%`, color: scoreColor(result.confidenceScore) },
              { label: 'Status', value: result.status.toUpperCase(), color: result.status === 'complete' ? '#22c55e' : '#f59e0b' },
              { label: 'Difference', value: fmt(Math.abs(result.differenceCents)), color: result.differenceCents === 0 ? '#22c55e' : '#ef4444' },
              { label: 'Balance Check', value: result.statementBalances ? '✅ Pass' : '❌ Fail', color: result.statementBalances ? '#22c55e' : '#ef4444' },
            ].map(card => (
              <div key={card.label} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>{card.label}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: card.color }}>{card.value}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            {[
              { label: 'Matched', value: result.matchedCount, color: '#22c55e' },
              { label: 'Unmatched (Statement)', value: result.unmatchedStatementCount, color: '#ef4444' },
              { label: 'Unmatched (Ledger)', value: result.unmatchedLedgerCount, color: '#f59e0b' },
            ].map(card => (
              <div key={card.label} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>{card.label}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: card.color }}>{card.value}</div>
              </div>
            ))}
          </div>
          {result.suggestions.length > 0 && (
            <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem' }}>
              <h3 style={{ fontWeight: 600, marginBottom: '0.75rem' }}>💡 Suggestions</h3>
              {result.suggestions.map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: i < result.suggestions.length-1 ? '1px solid #fde68a' : 'none' }}>
                  <div>
                    <span style={{ background: '#fcd34d', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, marginRight: '0.5rem' }}>{s.category.toUpperCase()}</span>
                    {s.description}
                  </div>
                  <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>{s.probability}% likely</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
              {(['all','matched','unmatched','suggestions'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  style={{ padding: '0.75rem 1.25rem', border: 'none', background: activeTab === tab ? '#1d4ed8' : 'transparent', color: activeTab === tab ? 'white' : '#6b7280', cursor: 'pointer', fontWeight: 500, textTransform: 'capitalize' }}>
                  {tab} ({tab==='all'?result.items.length:tab==='matched'?result.matchedCount:tab==='unmatched'?result.unmatchedStatementCount+result.unmatchedLedgerCount:result.suggestions.length})
                </button>
              ))}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Match</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Statement</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>Stmt Amt</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>PFOS Ledger</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>PFOS Amt</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center' }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.75rem' }}>{MATCH_COLORS[item.matchType]} {item.matchType.replace(/_/g,' ')}</td>
                    <td style={{ padding: '0.75rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.statementDescription || '—'}
                      {item.statementDate && <div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{item.statementDate?.slice(0,10)}</div>}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', color: item.statementDirection==='credit'?'#22c55e':'#ef4444' }}>
                      {item.statementAmountCents != null ? fmt(item.statementAmountCents) : '—'}
                    </td>
                    <td style={{ padding: '0.75rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.ledgerDescription || '—'}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>{item.ledgerAmountCents != null ? fmt(item.ledgerAmountCents) : '—'}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>{item.matchScore > 0 ? <span style={{ color: scoreColor(item.matchScore) }}>{item.matchScore}%</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
            <button onClick={() => setResult(null)} style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: '6px', background: 'white', cursor: 'pointer' }}>
              ← New Reconciliation
            </button>
            <span style={{ color: '#6b7280', fontSize: '0.875rem', alignSelf: 'center' }}>ID: {result.reconciliationId}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReconciliationPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem' }}>Loading...</div>}>
      <ReconciliationForm />
    </Suspense>
  );
}

const lbl: React.CSSProperties = { display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' };
const inp: React.CSSProperties = { width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' };
