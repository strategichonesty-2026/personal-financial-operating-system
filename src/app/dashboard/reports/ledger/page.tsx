'use client';
import { useEffect, useState, useCallback } from 'react';

interface LedgerRow {
  account_id: string; account_code: string; account_name: string;
  account_type: string; normal_balance: string; batch_id: string;
  institution: string; period_start: string; period_end: string;
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
  staged_amount_cents: number; direction: string; staged_status: string;
  side: string | null; posted_amount_cents: number | null;
  memo: string | null; entry_date: string | null;
}

function dollars(cents: number | null | string): string {
  if (cents === null || cents === undefined) return '—';
  return (Number(cents) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
function fmtMonth(d: string): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}
function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    reconciled: 'bg-green-100 text-green-800',
    posted: 'bg-blue-100 text-blue-800',
    staged: 'bg-yellow-100 text-yellow-700',
    pending: 'bg-gray-100 text-gray-500',
  };
  const cls = styles[status] ?? 'bg-gray-100 text-gray-500';
  return <span className={'px-2 py-0.5 rounded-full text-xs font-medium ' + cls}>{status}</span>;
}

function TransactionModal({ batchId, accountId, title, onClose }: {
  batchId: string; accountId: string; title: string; onClose: () => void;
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
         onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {!loading && <p className="text-xs text-gray-400 mt-0.5">{txns.length} transactions</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-1">x</button>
        </div>
        <div className="overflow-auto flex-1">
          {loading && <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>}
          {error   && <div className="p-8 text-center text-red-500 text-sm">{'Error: ' + error}</div>}
          {!loading && !error && txns.length === 0 && (
            <div className="p-8 text-center text-gray-400 text-sm">No transactions for this period.</div>
          )}
          {!loading && !error && txns.length > 0 && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-5 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Description</th>
                  <th className="px-4 py-3 text-right">Debit</th>
                  <th className="px-4 py-3 text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {txns.map((t, i) => {
                  const amt = t.posted_amount_cents ?? t.staged_amount_cents;
                  const rowCls = 'border-t ' + (i % 2 === 0 ? 'bg-white' : 'bg-gray-50');
                  return (
                    <tr key={t.staged_id} className={rowCls}>
                      <td className="px-5 py-2.5 text-gray-500 whitespace-nowrap text-xs">{fmtDate(t.entry_date ?? t.txn_date)}</td>
                      <td className="px-4 py-2.5 text-gray-800">{t.description}</td>
                      <td className="px-4 py-2.5 text-right text-blue-600">{t.side === 'debit'  ? dollars(amt) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-green-600">{t.side === 'credit' ? dollars(amt) : '—'}</td>
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
  const [modal, setModal] = useState<{ batchId: string; accountId: string; title: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/v1/ledger');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const map = new Map<string, AccountGroup>();
      for (const row of data.rows as LedgerRow[]) {
        if (!map.has(row.account_id)) {
          map.set(row.account_id, {
            account_id: row.account_id, account_code: row.account_code,
            account_name: row.account_name, account_type: row.account_type, rows: [],
          });
        }
        map.get(row.account_id)!.rows.push(row);
      }
      const all = Array.from(map.values());
      setGroups(all);
      setExpanded(new Set(all.map(g => g.account_id)));
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => setExpanded(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const types    = ['all', ...Array.from(new Set(groups.map(g => g.account_type))).sort()];
  const filtered = filterType === 'all' ? groups : groups.filter(g => g.account_type === filterType);

  if (loading) return <div className="p-10 text-center text-gray-400">Loading ledger...</div>;
  if (error)   return <div className="p-10 text-center text-red-500 text-sm">{'Error: ' + error}</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Account Ledger</h1>
          <p className="text-sm text-gray-500 mt-1">Month-by-month — click any row to see transactions</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm">
            {types.map(t => (
              <option key={t} value={t}>
                {t === 'all' ? 'All types' : t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
          <button onClick={() => setExpanded(new Set(filtered.map(g => g.account_id)))}
            className="text-xs px-3 py-2 border rounded-lg hover:bg-gray-50">Expand all</button>
          <button onClick={() => setExpanded(new Set())}
            className="text-xs px-3 py-2 border rounded-lg hover:bg-gray-50">Collapse all</button>
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map(group => {
          const isOpen     = expanded.has(group.account_id);
          const reconciled = group.rows.filter(r => r.batch_status === 'reconciled').length;
          return (
            <div key={group.account_id} className="border rounded-xl bg-white shadow-sm overflow-hidden">
              <button onClick={() => toggle(group.account_id)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 text-left">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">{group.account_code}</span>
                  <span className="font-semibold text-gray-900 truncate">{group.account_name}</span>
                  <span className="text-xs text-gray-400 capitalize">{group.account_type}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-400 flex-shrink-0 ml-4">
                  <span className="text-xs">{reconciled}/{group.rows.length} reconciled</span>
                  <span>{isOpen ? '▲' : '▼'}</span>
                </div>
              </button>
              {isOpen && (
                <div className="border-t">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                        <th className="px-5 py-2.5 text-left">Period</th>
                        <th className="px-4 py-2.5 text-right">Opening</th>
                        <th className="px-4 py-2.5 text-right">Debits</th>
                        <th className="px-4 py-2.5 text-right">Credits</th>
                        <th className="px-4 py-2.5 text-right">Txns</th>
                        <th className="px-4 py-2.5 text-right">Closing</th>
                        <th className="px-4 py-2.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row, i) => {
                        const rowCls = 'border-t cursor-pointer transition-colors hover:bg-blue-50 ' + (i % 2 === 0 ? 'bg-white' : 'bg-gray-50');
                        return (
                          <tr key={row.batch_id}
                            onClick={() => setModal({ batchId: row.batch_id, accountId: row.account_id, title: group.account_name + ' — ' + fmtMonth(row.period_start) })}
                            className={rowCls}>
                            <td className="px-5 py-3 font-medium text-gray-700">{fmtMonth(row.period_start)}</td>
                            <td className="px-4 py-3 text-right text-gray-500">{dollars(row.opening_balance_cents)}</td>
                            <td className="px-4 py-3 text-right text-blue-600">{dollars(row.total_debits_cents)}</td>
                            <td className="px-4 py-3 text-right text-green-600">{dollars(row.total_credits_cents)}</td>
                            <td className="px-4 py-3 text-right text-gray-400">{Number(row.transaction_count)}</td>
                            <td className="px-4 py-3 text-right font-semibold text-gray-800">{dollars(row.closing_balance_cents)}</td>
                            <td className="px-4 py-3 text-center"><StatusBadge status={row.batch_status} /></td>
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
      {modal && (
        <TransactionModal batchId={modal.batchId} accountId={modal.accountId}
          title={modal.title} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
