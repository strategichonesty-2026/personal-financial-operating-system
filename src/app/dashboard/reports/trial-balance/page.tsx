'use client';

import { useState, useEffect, useCallback } from 'react';

function fmt(cents: number): string {
  return '$' + (Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 });
}

const SECTION_ORDER = ['income', 'expense', 'asset', 'liability', 'equity'];
const SECTION_LABELS: Record<string, string> = {
  income: 'Income', expense: 'Expenses', asset: 'Assets', liability: 'Liabilities', equity: 'Equity',
};
const SECTION_COLORS: Record<string, string> = {
  income: '#16a34a', expense: '#dc2626', asset: '#2563eb', liability: '#9333ea', equity: '#d97706',
};

type Account = { accountId: string; accountCode: string; accountName: string; accountType: string; debitTotal: number; creditTotal: number; balance: number; };
type TrialBalance = { accounts: Account[]; totalDebits: number; totalCredits: number; isBalanced: boolean; };
type Transaction = { entryId: string; entryDate: string; description: string; amountCents: number; side: string; memo: string | null; reference: string | null; };

export default function TrialBalancePage() {
  const [tb, setTb] = useState<TrialBalance | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ income: false, expense: false, asset: false, liability: false, equity: false });
  const [modal, setModal] = useState<{ account: Account; transactions: Transaction[] } | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  useEffect(() => { fetch('/api/v1/trial-balance').then(r => r.json()).then(d => setTb(d)); }, []);

  const openDrillDown = useCallback(async (account: Account) => {
    setModalLoading(true);
    setModal({ account, transactions: [] });
    const res = await fetch(`/api/v1/trial-balance/transactions?accountId=${account.accountId}`);
    const data = await res.json();
    setModal({ account, transactions: data.transactions ?? [] });
    setModalLoading(false);
  }, []);

  if (!tb) return <div style={{ padding: '2rem', color: '#888' }}>Loading trial balance...</div>;

  const grouped: Record<string, Account[]> = {};
  for (const type of SECTION_ORDER) {
    grouped[type] = tb.accounts.filter(a => a.accountType === type && (a.debitTotal > 0 || a.creditTotal > 0));
  }

  return (
    <div style={{ maxWidth: '900px' }}>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', color: '#2E4057', marginBottom: '0.25rem' }}>Trial Balance</h1>
          <p style={{ color: '#888', fontSize: '0.85rem' }}>Click any account to see its transactions</p>
        </div>
        <div style={{ padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: 700, fontSize: '0.9rem', background: tb.isBalanced ? '#F1F8E9' : '#FFF3F3', color: tb.isBalanced ? '#2E7D32' : '#C62828', border: `1px solid ${tb.isBalanced ? '#C5E1A5' : '#FFCDD2'}` }}>
          {tb.isBalanced ? '✓ Balanced' : '⚠ Out of Balance'}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        {[{ label: 'Total Debits', value: fmt(tb.totalDebits) }, { label: 'Total Credits', value: fmt(tb.totalCredits) }, { label: 'Difference', value: fmt(Math.abs(tb.totalDebits - tb.totalCredits)) }].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #E0E0E0', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#2E4057' }}>{s.value}</div>
            <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.25rem' }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {SECTION_ORDER.map(type => {
          const accts = grouped[type] ?? [];
          if (!accts.length) return null;
          const typeDebit = accts.reduce((s, a) => s + a.debitTotal, 0);
          const typeCredit = accts.reduce((s, a) => s + a.creditTotal, 0);
          const typeBalance = accts.reduce((s, a) => s + a.balance, 0);
          const isOpen = expanded[type] ?? false;
          const color = SECTION_COLORS[type] ?? '#2E4057';
          return (
            <div key={type} style={{ background: '#fff', border: '1px solid #E0E0E0', borderRadius: '10px', overflow: 'hidden' }}>
              <button onClick={() => setExpanded(prev => ({ ...prev, [type]: !isOpen }))} style={{ width: '100%', background: '#F0F4F8', border: 'none', padding: '0.875rem 1rem', display: 'flex', alignItems: 'center', cursor: 'pointer', textAlign: 'left', gap: '0.75rem' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontWeight: 700, fontSize: '0.95rem', color: '#2E4057', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {SECTION_LABELS[type]} <span style={{ fontWeight: 400, fontSize: '0.8rem', color: '#888' }}>({accts.length} accounts)</span>
                </span>
                <div style={{ display: 'flex', gap: '2rem', fontSize: '0.85rem', fontFamily: 'monospace' }}>
                  <span style={{ color: '#555' }}>Dr: <strong>{fmt(typeDebit)}</strong></span>
                  <span style={{ color: '#555' }}>Cr: <strong>{fmt(typeCredit)}</strong></span>
                  <span style={{ color, fontWeight: 700 }}>{fmt(Math.abs(typeBalance))}</span>
                </div>
                <span style={{ color: '#aaa', fontSize: '1.1rem', marginLeft: '0.5rem' }}>{isOpen ? '∧' : '∨'}</span>
              </button>
              {isOpen && (
                <div style={{ borderTop: '1px solid #F0F0F0' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: '#F8F9FA' }}>
                        {['Code', 'Account Name', 'Debits', 'Credits', 'Balance'].map((h, i) => (
                          <th key={h} style={{ padding: '0.5rem 1rem', textAlign: i > 1 ? 'right' : 'left', color: '#888', fontWeight: 600, fontSize: '0.75rem' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {accts.map((a, i) => (
                        <tr key={a.accountCode}
                          onClick={() => openDrillDown(a)}
                          style={{ borderTop: '1px solid #F5F5F5', background: i % 2 === 0 ? '#fff' : '#FAFAFA', cursor: 'pointer' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#EEF4FF')}
                          onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#FAFAFA')}
                        >
                          <td style={{ padding: '0.5rem 1rem', color: '#aaa', fontSize: '0.78rem' }}>{a.accountCode}</td>
                          <td style={{ padding: '0.5rem 1rem', color: '#333' }}>{a.accountName} <span style={{ color: '#aaa', fontSize: '0.75rem' }}>↗</span></td>
                          <td style={{ padding: '0.5rem 1rem', textAlign: 'right', fontFamily: 'monospace', color: '#555' }}>{a.debitTotal > 0 ? fmt(a.debitTotal) : '—'}</td>
                          <td style={{ padding: '0.5rem 1rem', textAlign: 'right', fontFamily: 'monospace', color: '#555' }}>{a.creditTotal > 0 ? fmt(a.creditTotal) : '—'}</td>
                          <td style={{ padding: '0.5rem 1rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: a.balance >= 0 ? '#2E4057' : '#C62828' }}>{fmt(a.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#AAA', textAlign: 'right' }}>
        {tb.accounts.filter(a => a.debitTotal > 0 || a.creditTotal > 0).length} accounts with activity
      </div>

      {/* DRILL-DOWN MODAL */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => setModal(null)}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '800px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#2E4057' }}>{modal.account.accountCode} — {modal.account.accountName}</div>
                <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.2rem' }}>
                  Balance: {fmt(modal.account.balance)} &nbsp;·&nbsp; {modal.transactions.length} transactions
                </div>
              </div>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#888', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {modalLoading ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>Loading transactions...</div>
              ) : modal.transactions.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>No transactions found.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#F8F9FA', zIndex: 1 }}>
                    <tr>
                      {['Date', 'Description', 'Debit', 'Credit'].map((h, i) => (
                        <th key={h} style={{ padding: '0.6rem 1rem', textAlign: i > 1 ? 'right' : 'left', color: '#888', fontWeight: 600, fontSize: '0.75rem', borderBottom: '1px solid #eee' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {modal.transactions.map((t, i) => (
                      <tr key={t.entryId + t.side} style={{ borderBottom: '1px solid #F5F5F5', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                        <td style={{ padding: '0.5rem 1rem', color: '#888', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          {new Date(t.entryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td style={{ padding: '0.5rem 1rem', color: '#333', maxWidth: '350px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</td>
                        <td style={{ padding: '0.5rem 1rem', textAlign: 'right', fontFamily: 'monospace', color: '#2563eb' }}>{t.side === 'debit' ? fmt(t.amountCents) : '—'}</td>
                        <td style={{ padding: '0.5rem 1rem', textAlign: 'right', fontFamily: 'monospace', color: '#16a34a' }}>{t.side === 'credit' ? fmt(t.amountCents) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
