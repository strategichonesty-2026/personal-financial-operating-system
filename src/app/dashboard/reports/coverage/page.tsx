'use client';
import { useEffect, useState, useCallback } from 'react';

interface MonthCoverage {
  month: string; status: 'imported' | 'missing';
  batch_id: string | null; opening: number | null;
  closing: number | null; batch_status?: string;
}
interface AccountCoverage {
  account_id: string; account_code: string;
  account_name: string; account_type: string;
  months: MonthCoverage[];
  imported_count: number; missing_count: number;
}

function fmtMonth(m: string): string {
  const [year, month] = m.split('-');
  return new Date(Number(year), Number(month) - 1, 1)
    .toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
function dollars(cents: number | null): string {
  if (cents === null) return '—';
  return '$' + (Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 });
}
const TYPE_COLORS: Record<string, string> = {
  asset: '#2563eb', liability: '#9333ea', income: '#16a34a', expense: '#dc2626',
};

export default function CoveragePage() {
  const [accounts, setAccounts] = useState<AccountCoverage[]>([]);
  const [months, setMonths]     = useState<string[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [filter, setFilter]     = useState<'all' | 'missing'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/v1/coverage');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setAccounts(data.accounts ?? []);
      setMonths(data.months ?? []);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => setExpanded(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const totalMissing = accounts.reduce((s, a) => s + a.missing_count, 0);
  const filtered = filter === 'missing' ? accounts.filter(a => a.missing_count > 0) : accounts;
  const dateRange = months.length > 0
    ? fmtMonth(months[0]!) + ' – ' + fmtMonth(months[months.length - 1]!)
    : '';

  if (loading) return <div style={{ padding: '2rem', color: '#888' }}>Loading coverage report...</div>;
  if (error)   return <div style={{ padding: '2rem', color: '#dc2626' }}>Error: {error}</div>;

  return (
    <div style={{ maxWidth: '900px' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', color: '#2E4057', marginBottom: '0.25rem' }}>Statement Coverage</h1>
          <p style={{ color: '#888', fontSize: '0.85rem' }}>
            {dateRange} &middot; {accounts.length} accounts
            {totalMissing > 0
              ? <span style={{ color: '#dc2626', marginLeft: '0.5rem', fontWeight: 600 }}>· {totalMissing} statements missing</span>
              : <span style={{ color: '#16a34a', marginLeft: '0.5rem', fontWeight: 600 }}>· All complete!</span>
            }
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(['all', 'missing'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              border: '1px solid #d1d5db', borderRadius: '6px',
              padding: '0.375rem 0.75rem', fontSize: '0.875rem', cursor: 'pointer',
              background: filter === f ? (f === 'missing' ? '#dc2626' : '#2E4057') : '#fff',
              color: filter === f ? '#fff' : '#374151',
            }}>
              {f === 'all' ? 'All accounts' : 'Missing only'}
            </button>
          ))}
          <button onClick={() => setExpanded(new Set(filtered.map(a => a.account_id)))}
            style={{ border: '1px solid #d1d5db', borderRadius: '6px', padding: '0.375rem 0.75rem', fontSize: '0.875rem', cursor: 'pointer', background: '#fff' }}>
            Expand all
          </button>
          <button onClick={() => setExpanded(new Set())}
            style={{ border: '1px solid #d1d5db', borderRadius: '6px', padding: '0.375rem 0.75rem', fontSize: '0.875rem', cursor: 'pointer', background: '#fff' }}>
            Collapse all
          </button>
        </div>
      </div>

      {/* Accordion */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {filtered.map(acct => {
          const isOpen      = expanded.has(acct.account_id);
          const allGood     = acct.missing_count === 0;
          const missingList = acct.months.filter(m => m.status === 'missing').map(m => fmtMonth(m.month));
          const color       = TYPE_COLORS[acct.account_type] ?? '#6b7280';

          return (
            <div key={acct.account_id} style={{ border: '1px solid #e5e7eb', borderRadius: '10px', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>

              {/* Account header */}
              <button onClick={() => toggle(acct.account_id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', background: '#f3f4f6', color: '#4b5563', padding: '2px 8px', borderRadius: '4px' }}>{acct.account_code}</span>
                  <span style={{ fontWeight: 600, color: '#111827' }}>{acct.account_name}</span>
                  <span style={{ fontSize: '0.75rem', color, fontWeight: 500, textTransform: 'capitalize' }}>{acct.account_type}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  {/* Coverage pill */}
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '2px 10px', borderRadius: '99px',
                    background: allGood ? '#dcfce7' : '#fee2e2',
                    color: allGood ? '#166534' : '#dc2626' }}>
                    {acct.imported_count}/{acct.imported_count + acct.missing_count} months
                  </span>
                  {/* Missing summary */}
                  {!allGood && (
                    <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>
                      Missing: {missingList.join(', ')}
                    </span>
                  )}
                  <span style={{ color: '#9ca3af' }}>{isOpen ? '▲' : '▼'}</span>
                </div>
              </button>

              {/* Month detail */}
              {isOpen && (
                <div style={{ borderTop: '1px solid #e5e7eb' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: '#f9fafb' }}>
                        <th style={{ padding: '0.5rem 1.25rem', textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280' }}>Period</th>
                        <th style={{ padding: '0.5rem 1rem', textAlign: 'right', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280' }}>Opening</th>
                        <th style={{ padding: '0.5rem 1rem', textAlign: 'right', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280' }}>Closing</th>
                        <th style={{ padding: '0.5rem 1rem', textAlign: 'center', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {acct.months.map((m, i) => {
                        const missing      = m.status === 'missing';
                        const reconciled   = m.batch_status === 'reconciled';
                        const rowBg        = missing ? '#fff5f5' : i % 2 === 0 ? '#fff' : '#f9fafb';
                        const statusStyle  = reconciled
                          ? { background: '#dcfce7', color: '#166534' }
                          : missing
                          ? { background: '#fee2e2', color: '#dc2626' }
                          : { background: '#dbeafe', color: '#1e40af' };
                        const statusLabel  = reconciled ? 'Reconciled' : missing ? '⚠ Missing' : 'Imported';
                        return (
                          <tr key={m.month} style={{ borderTop: '1px solid #f3f4f6', background: rowBg }}>
                            <td style={{ padding: '0.625rem 1.25rem', fontWeight: missing ? 400 : 500, color: missing ? '#9ca3af' : '#374151' }}>
                              {fmtMonth(m.month)}
                            </td>
                            <td style={{ padding: '0.625rem 1rem', textAlign: 'right', color: '#6b7280' }}>
                              {missing ? '—' : dollars(m.opening)}
                            </td>
                            <td style={{ padding: '0.625rem 1rem', textAlign: 'right', fontWeight: missing ? 400 : 600, color: missing ? '#9ca3af' : '#111827' }}>
                              {missing ? '—' : dollars(m.closing)}
                            </td>
                            <td style={{ padding: '0.625rem 1rem', textAlign: 'center' }}>
                              <span style={{ ...statusStyle, fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: '99px' }}>
                                {statusLabel}
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

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: '3rem', fontSize: '1rem' }}>
          All statements imported! Nothing missing.
        </div>
      )}
    </div>
  );
}
