'use client';
import { useEffect, useState, useCallback } from 'react';

interface LedgerRow {
  account_id: string; account_code: string; account_name: string;
  account_type: string; batch_id: string; period_start: string;
  opening_balance_cents: number | null; closing_balance_cents: number | null;
  batch_status: string; total_debits_cents: number;
  total_credits_cents: number; transaction_count: number;
}
interface AccountGroup {
  account_id: string; account_code: string;
  account_name: string; account_type: string; rows: LedgerRow[];
}
interface Transaction {
  staged_id: string; txn_date: string; description: string;
  staged_amount_cents: number; side: string | null;
  posted_amount_cents: number | null; entry_date: string | null;
}

function dollars(cents: number | null | string): string {
  if (cents === null || cents === undefined) return '—';
  return '$' + (Math.abs(Number(cents)) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 });
}
function fmtMonth(d: string): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}
function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

const TYPE_COLORS: Record<string, string> = {
  asset: '#2563eb', liability: '#9333ea', income: '#16a34a', expense: '#dc2626', equity: '#d97706',
};
const STATUS_STYLES: Record<string, { background: string; color: string }> = {
  reconciled: { background: '#dcfce7', color: '#166534' },
  posted:     { background: '#dbeafe', color: '#1e40af' },
  staged:     { background: '#fef9c3', color: '#854d0e' },
  pending:    { background: '#f3f4f6', color: '#6b7280' },
};

function TransactionModal({ batchId, accountId, title, onClose, openingCents, closingCents, accountType }: {
  batchId: string; accountId: string; title: string; onClose: () => void;
  openingCents: number | null; closingCents: number | null; accountType: string;
}) {
  const [txns, setTxns]       = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/ledger/transactions?batchId=' + batchId + '&accountId=' + accountId)
      .then(r => r.json()).then(d => setTxns(d.transactions ?? []))
      .catch(e => setError(String(e))).finally(() => setLoading(false));
  }, [batchId, accountId]);

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
               display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
      <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                    width: '100%', maxWidth: '720px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '1rem 1.5rem', borderBottom: '1px solid #e5e7eb' }}>
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827', margin: 0 }}>{title}</h2>
            {!loading && <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: '2px 0 0' }}>{txns.length} transactions</p>}
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: '#9ca3af', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading && <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>Loading...</div>}
          {error   && <div style={{ padding: '2rem', textAlign: 'center', color: '#dc2626' }}>Error: {error}</div>}
          {!loading && !error && txns.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>No transactions for this period.</div>
          )}
          {!loading && !error && txns.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Date','Description','Debit','Credit'].map((h, i) => (
                    <th key={h} style={{ padding: '0.625rem 1rem', textAlign: i < 2 ? 'left' : 'right',
                      fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280',
                      fontWeight: 500, borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {txns.map((t, i) => {
                  const amt = t.posted_amount_cents ?? t.staged_amount_cents;
                  return (
                    <tr key={t.staged_id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb', borderTop: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '0.625rem 1rem', color: '#6b7280', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>{fmtDate(t.entry_date ?? t.txn_date)}</td>
                      <td style={{ padding: '0.625rem 1rem', color: '#111827' }}>{t.description}</td>
                      <td style={{ padding: '0.625rem 1rem', textAlign: 'right', color: '#2563eb' }}>{t.side === 'debit'  ? dollars(amt) : '—'}</td>
                      <td style={{ padding: '0.625rem 1rem', textAlign: 'right', color: '#16a34a' }}>{t.side === 'credit' ? dollars(amt) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LedgerPage() {
  const [groups, setGroups]     = useState<AccountGroup[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState('all');
  const [modal, setModal] = useState<{ batchId: string; accountId: string; title: string; openingCents: number | null; closingCents: number | null; accountType: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/v1/ledger');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const map = new Map<string, AccountGroup>();
      for (const row of data.rows as LedgerRow[]) {
        if (!map.has(row.account_id)) {
          map.set(row.account_id, { account_id: row.account_id, account_code: row.account_code,
            account_name: row.account_name, account_type: row.account_type, rows: [] });
        }
        map.get(row.account_id)!.rows.push(row);
      }
      const all = Array.from(map.values());
      setGroups(all);
      setExpanded(new Set());
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => setExpanded(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const types    = ['all', ...Array.from(new Set(groups.map(g => g.account_type))).sort()];
  const filtered = filterType === 'all' ? groups : groups.filter(g => g.account_type === filterType);

  if (loading) return <div style={{ padding: '2rem', color: '#888' }}>Loading ledger...</div>;
  if (error)   return <div style={{ padding: '2rem', color: '#dc2626' }}>Error: {error}</div>;

  return (
    <div style={{ maxWidth: '960px' }}>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', color: '#2E4057', marginBottom: '0.25rem' }}>Account Ledger</h1>
          <p style={{ color: '#888', fontSize: '0.85rem' }}>Month-by-month — click any row to see transactions</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            style={{ border: '1px solid #d1d5db', borderRadius: '6px', padding: '0.375rem 0.75rem', fontSize: '0.875rem' }}>
            {types.map(t => <option key={t} value={t}>{t === 'all' ? 'All types' : t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
          <button onClick={() => setExpanded(new Set(filtered.map(g => g.account_id)))}
            style={{ border: '1px solid #d1d5db', borderRadius: '6px', padding: '0.375rem 0.75rem', fontSize: '0.75rem', cursor: 'pointer', background: '#fff' }}>
            Expand all</button>
          <button onClick={() => setExpanded(new Set())}
            style={{ border: '1px solid #d1d5db', borderRadius: '6px', padding: '0.375rem 0.75rem', fontSize: '0.75rem', cursor: 'pointer', background: '#fff' }}>
            Collapse all</button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {filtered.map(group => {
          const isOpen      = expanded.has(group.account_id);
          const reconciled  = group.rows.filter(r => r.batch_status === 'reconciled').length;
          const color       = TYPE_COLORS[group.account_type] ?? '#6b7280';
          return (
            <div key={group.account_id}
              style={{ border: '1px solid #e5e7eb', borderRadius: '10px', background: '#fff',
                       boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
              <button onClick={() => toggle(group.account_id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                         padding: '0.875rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', background: '#f3f4f6',
                                 color: '#4b5563', padding: '2px 8px', borderRadius: '4px' }}>{group.account_code}</span>
                  <span style={{ fontWeight: 600, color: '#111827' }}>{group.account_name}</span>
                  <span style={{ fontSize: '0.75rem', color, fontWeight: 500, textTransform: 'capitalize' }}>{group.account_type}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: '#9ca3af', fontSize: '0.75rem' }}>
                  <span>{reconciled}/{group.rows.length} reconciled</span>
                  <span>{isOpen ? '▲' : '▼'}</span>
                </div>
              </button>

              {isOpen && (
                <div style={{ borderTop: '1px solid #e5e7eb' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ background: '#f9fafb' }}>
                        {['Period','Opening','Debits','Credits','Txns','Closing','Status'].map((h, i) => (
                          <th key={h} style={{ padding: '0.5rem 1rem', textAlign: i === 0 ? 'left' : 'right',
                            fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em',
                            color: '#6b7280', fontWeight: 500 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row, i) => {
                        const ss = STATUS_STYLES[row.batch_status] ?? STATUS_STYLES['pending'];
                        return (
                          <tr key={row.batch_id} onClick={() => setModal({
                                batchId: row.batch_id, accountId: row.account_id,
                                title: group.account_name + ' — ' + fmtMonth(row.period_start),
                                openingCents: row.opening_balance_cents,
                                closingCents: row.closing_balance_cents,
                                accountType: group.account_type })}
                            style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb', borderTop: '1px solid #f3f4f6',
                                     cursor: 'pointer' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
                            onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#f9fafb')}>
                            <td style={{ padding: '0.625rem 1rem', fontWeight: 500, color: '#374151' }}>{fmtMonth(row.period_start)}</td>
                            <td style={{ padding: '0.625rem 1rem', textAlign: 'right', color: '#6b7280' }}>{dollars(row.opening_balance_cents)}</td>
                            <td style={{ padding: '0.625rem 1rem', textAlign: 'right', color: '#2563eb' }}>{dollars(row.total_debits_cents)}</td>
                            <td style={{ padding: '0.625rem 1rem', textAlign: 'right', color: '#16a34a' }}>{dollars(row.total_credits_cents)}</td>
                            <td style={{ padding: '0.625rem 1rem', textAlign: 'right', color: '#9ca3af' }}>{Number(row.transaction_count)}</td>
                            <td style={{ padding: '0.625rem 1rem', textAlign: 'right', fontWeight: 600, color: '#111827' }}>{dollars(row.closing_balance_cents)}</td>
                            <td style={{ padding: '0.625rem 1rem', textAlign: 'right' }}>
                              <span style={{ ...ss, padding: '2px 8px', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 500 }}>
                                {row.batch_status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {modal && <TransactionModal
        batchId={modal.batchId} accountId={modal.accountId}
        title={modal.title} onClose={() => setModal(null)}
        openingCents={modal.openingCents} closingCents={modal.closingCents}
        accountType={modal.accountType} />}
    </div>
  );
}
