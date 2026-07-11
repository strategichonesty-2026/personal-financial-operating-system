'use client';

import { useState, useEffect } from 'react';

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface StatementTxn {
  description: string;
  date: string;
  amountCents: number;
  direction: 'debit' | 'credit';
}

interface ReconcileResult {
  reconciliationId:        string;
  statementCreditsCents:   number;
  statementDebitsCents:    number;
  calculatedBalanceCents:  number;
  differenceCents:         number;
  statementBalances:       boolean;
  matchedCount:            number;
  unmatchedStatementCount: number;
  unmatchedLedgerCount:    number;
  confidenceScore:         number;
  status:                  string;
  suggestions:             Array<{ category: string; description: string; amountCents?: number; probability: number }>;
  items:                   Array<{
    matchType: string; matchScore: number;
    statementDescription?: string; statementDate?: string;
    statementAmountCents?: number; statementDirection?: string;
    journalEntryId?: string; ledgerDescription?: string; ledgerAmountCents?: number;
  }>;
}

const fmt = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

const MATCH_COLORS: Record<string, string> = {
  exact:                '🟢',
  fuzzy:                '🟡',
  unmatched_statement:  '🔴',
  unmatched_ledger:     '🟠',
};

export default function ReconciliationPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState('');
  const [periodStart, setPeriodStart] = useState('2025-12-20');
  const [periodEnd, setPeriodEnd] = useState('2026-01-21');
  const [openingBalance, setOpeningBalance] = useState('');
  const [closingBalance, setClosingBalance] = useState('');
  const [txnInput, setTxnInput] = useState('');
  const [result, setResult] = useState<ReconcileResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'all'|'matched'|'unmatched'|'suggestions'>('all');

  useEffect(() => {
    fetch('/api/v1/accounts')
      .then(r => r.json())
      .then(d => setAccounts((d.accounts || []).filter((a: Account) =>
        a.type === 'asset' || a.type === 'liability'
      )));
  }, []);

  function parseTxns(): StatementTxn[] {
    return txnInput.trim().split('\n').filter(Boolean).map(line => {
      const parts = line.split('|');
      if (parts.length < 4) return null;
      const desc = parts[0] ?? '';
      const date = parts[1] ?? '';
      const amt  = parts[2] ?? '0';
      const dir  = parts[3] ?? 'debit';
      return {
        description: desc.trim(),
        date: date.trim(),
        amountCents: Math.round(parseFloat(amt.trim()) * 100),
        direction: dir.trim() as 'debit' | 'credit',
      };
    }).filter(Boolean) as StatementTxn[];
  }

  async function runReconcile() {
    setError(''); setResult(null); setLoading(true);
    try {
      const txns = parseTxns();
      const res = await fetch('/api/v1/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          periodStart,
          periodEnd,
          openingBalanceCents:  Math.round(parseFloat(openingBalance) * 100),
          closingBalanceCents:  Math.round(parseFloat(closingBalance)  * 100),
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

  const scoreColor = (score: number) =>
    score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>Bank Reconciliation</h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem' }}>Reconcile your bank statement against PFOS journal entries</p>

      {/* Input Form */}
      {!result && (
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
          <h2 style={{ fontWeight: 600, marginBottom: '1rem' }}>Statement Details</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Account</label>
              <select value={accountId} onChange={e => setAccountId(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px' }}>
                <option value="">Select account...</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Period Start</label>
                <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Period End</label>
                <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px' }} />
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Opening Balance ($)</label>
              <input type="number" step="0.01" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)}
                placeholder="1711.57"
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Closing Balance ($)</label>
              <input type="number" step="0.01" value={closingBalance} onChange={e => setClosingBalance(e.target.value)}
                placeholder="1979.62"
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px' }} />
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              Statement Transactions
              <span style={{ color: '#6b7280', fontWeight: 400 }}> — one per line: Description | Date | Amount | debit/credit</span>
            </label>
            <textarea value={txnInput} onChange={e => setTxnInput(e.target.value)} rows={8}
              placeholder={"Zelle payment from GOPU SHRESTHA|2025-12-30|250.00|credit\nWELLS FARGO BANK PAYRLL DEP|2026-01-02|296.69|credit\nWFCU DIRECT DB|2025-12-29|25.00|debit"}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', fontFamily: 'monospace', fontSize: '0.8rem' }} />
          </div>

          {error && <p style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</p>}

          <button onClick={runReconcile} disabled={loading || !accountId || !openingBalance || !closingBalance}
            style={{ background: '#1d4ed8', color: 'white', padding: '0.625rem 1.5rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
            {loading ? 'Reconciling...' : 'Run Reconciliation'}
          </button>
        </div>
      )}

      {/* Results Dashboard */}
      {result && (
        <div>
          {/* L5 Dashboard */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            {[
              { label: 'Confidence Score', value: `${result.confidenceScore}%`, color: scoreColor(result.confidenceScore), big: true },
              { label: 'Status', value: result.status.toUpperCase(), color: result.status === 'complete' ? '#22c55e' : '#f59e0b' },
              { label: 'Difference', value: fmt(Math.abs(result.differenceCents)), color: result.differenceCents === 0 ? '#22c55e' : '#ef4444' },
              { label: 'L1 Balance Check', value: result.statementBalances ? '✅ Pass' : '❌ Fail', color: result.statementBalances ? '#22c55e' : '#ef4444' },
            ].map(card => (
              <div key={card.label} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>{card.label}</div>
                <div style={{ fontSize: card.big ? '2rem' : '1.25rem', fontWeight: 700, color: card.color }}>{card.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            {[
              { label: 'Opening Balance', value: fmt(result.calculatedBalanceCents - result.statementCreditsCents + result.statementDebitsCents) },
              { label: 'Statement Credits', value: fmt(result.statementCreditsCents) },
              { label: 'Statement Debits', value: fmt(result.statementDebitsCents) },
              { label: 'Closing Balance', value: fmt(result.calculatedBalanceCents) },
            ].map(card => (
              <div key={card.label} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>{card.label}</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{card.value}</div>
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

          {/* Suggestions */}
          {result.suggestions.length > 0 && (
            <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem' }}>
              <h3 style={{ fontWeight: 600, marginBottom: '0.75rem' }}>💡 Intelligent Suggestions</h3>
              {result.suggestions.map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: i < result.suggestions.length-1 ? '1px solid #fde68a' : 'none' }}>
                  <div>
                    <span style={{ background: '#fcd34d', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, marginRight: '0.5rem' }}>
                      {s.category.toUpperCase()}
                    </span>
                    {s.description}
                  </div>
                  <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>{s.probability}% likely</div>
                </div>
              ))}
            </div>
          )}

          {/* Transaction Table */}
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid #e5e7eb' }}>
              {(['all', 'matched', 'unmatched', 'suggestions'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  style={{ padding: '0.75rem 1.25rem', border: 'none', background: activeTab === tab ? '#1d4ed8' : 'transparent',
                    color: activeTab === tab ? 'white' : '#6b7280', cursor: 'pointer', fontWeight: 500, textTransform: 'capitalize' }}>
                  {tab} {tab === 'all' ? `(${result.items.length})` : tab === 'matched' ? `(${result.matchedCount})` : tab === 'unmatched' ? `(${result.unmatchedStatementCount + result.unmatchedLedgerCount})` : `(${result.suggestions.length})`}
                </button>
              ))}
            </div>

            {activeTab === 'suggestions' ? (
              <div style={{ padding: '1rem' }}>
                {result.suggestions.length === 0
                  ? <p style={{ color: '#6b7280', textAlign: 'center', padding: '2rem' }}>No suggestions — everything looks good!</p>
                  : result.suggestions.map((s, i) => (
                    <div key={i} style={{ padding: '0.75rem', borderBottom: '1px solid #f3f4f6' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 500 }}>{s.description}</span>
                        <span style={{ color: '#6b7280' }}>{s.probability}% probability</span>
                      </div>
                    </div>
                  ))
                }
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 600 }}>Match</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 600 }}>Statement</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600 }}>Stmt Amount</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 600 }}>PFOS Ledger</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600 }}>PFOS Amount</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: 600 }}>Score</th>
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
                      <td style={{ padding: '0.75rem', textAlign: 'right', color: item.statementDirection === 'credit' ? '#22c55e' : '#ef4444' }}>
                        {item.statementAmountCents != null ? fmt(item.statementAmountCents) : '—'}
                      </td>
                      <td style={{ padding: '0.75rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.ledgerDescription || '—'}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        {item.ledgerAmountCents != null ? fmt(item.ledgerAmountCents) : '—'}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        {item.matchScore > 0 ? <span style={{ color: scoreColor(item.matchScore) }}>{item.matchScore}%</span> : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
            <button onClick={() => { setResult(null); setTxnInput(''); }}
              style={{ padding: '0.5rem 1rem', border: '1px solid #d1d5db', borderRadius: '6px', background: 'white', cursor: 'pointer' }}>
              ← New Reconciliation
            </button>
            <span style={{ color: '#6b7280', fontSize: '0.875rem', alignSelf: 'center' }}>
              ID: {result.reconciliationId}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
