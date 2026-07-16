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
    .toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}
function dollars(cents: number | null): string {
  if (cents === null) return '';
  return '$' + (Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 0 });
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

  const totalMissing = accounts.reduce((s, a) => s + a.missing_count, 0);
  const filtered = filter === 'missing' ? accounts.filter(a => a.missing_count > 0) : accounts;

  if (loading) return <div style={{ padding: '2rem', color: '#888' }}>Loading coverage report...</div>;
  if (error)   return <div style={{ padding: '2rem', color: '#dc2626' }}>Error: {error}</div>;

  return (
    <div style={{ maxWidth: '1100px' }}>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', color: '#2E4057', marginBottom: '0.25rem' }}>Statement Coverage</h1>
          <p style={{ color: '#888', fontSize: '0.85rem' }}>
            {months.length} months · {accounts.length} accounts
            {totalMissing > 0 && <span style={{ color: '#dc2626', marginLeft: '0.5rem' }}>· {totalMissing} missing</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(['all', 'missing'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              border: '1px solid #d1d5db', borderRadius: '6px', padding: '0.375rem 0.75rem',
              fontSize: '0.875rem', cursor: 'pointer',
              background: filter === f ? (f === 'missing' ? '#dc2626' : '#2E4057') : '#fff',
              color: filter === f ? '#fff' : '#374151',
            }}>
              {f === 'all' ? 'All accounts' : 'Missing only'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem', fontSize: '0.8rem', color: '#6b7280', alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ background: '#dcfce7', color: '#166534', padding: '1px 8px', borderRadius: '4px', fontWeight: 700 }}>✓</span> Reconciled
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ background: '#dbeafe', color: '#1e40af', padding: '1px 8px', borderRadius: '4px', fontWeight: 700 }}>●</span> Imported
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ background: '#fee2e2', color: '#dc2626', padding: '1px 8px', borderRadius: '4px', fontWeight: 700 }}>✗</span> Missing
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', minWidth: '220px', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280' }}>Account</th>
              {months.map(m => (
                <th key={m} style={{ padding: '0.5rem 0.25rem', textAlign: 'center', minWidth: '52px', fontSize: '0.65rem', color: '#6b7280' }}>{fmtMonth(m)}</th>
              ))}
              <th style={{ padding: '0.5rem', textAlign: 'center', minWidth: '80px', fontSize: '0.7rem', color: '#6b7280' }}>Coverage</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((acct, i) => (
              <tr key={acct.account_id} style={{ borderTop: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <td style={{ padding: '0.625rem 1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', background: '#f3f4f6', color: '#4b5563', padding: '1px 6px', borderRadius: '3px' }}>{acct.account_code}</span>
                    <span style={{ color: '#111827', fontWeight: 500 }}>{acct.account_name}</span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: TYPE_COLORS[acct.account_type] ?? '#6b7280', textTransform: 'capitalize', marginTop: '2px', paddingLeft: '2px' }}>{acct.account_type}</div>
                </td>
                {acct.months.map(m => {
                  const isReconciled = m.batch_status === 'reconciled';
                  const isImported   = m.status === 'imported';
                  const bg    = isReconciled ? '#dcfce7' : isImported ? '#dbeafe' : '#fee2e2';
                  const color = isReconciled ? '#166534' : isImported ? '#1e40af' : '#dc2626';
                  const label = isReconciled ? '✓' : isImported ? '●' : '✗';
                  const o = dollars(m.opening); const c = dollars(m.closing);
                  const tip = isImported || isReconciled
                    ? (o && c ? 'Open: ' + o + ' → Close: ' + c : m.batch_status ?? '')
                    : 'Missing — not yet imported';
                  return (
                    <td key={m.month} title={tip} style={{ padding: '0.25rem', textAlign: 'center' }}>
                      <div style={{ background: bg, borderRadius: '4px', padding: '0.35rem 0.25rem',
                        fontSize: '0.8rem', fontWeight: 700, color }}>
                        {label}
                      </div>
                    </td>
                  );
                })}
                <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: '99px',
                    background: acct.missing_count === 0 ? '#dcfce7' : '#fee2e2',
                    color: acct.missing_count === 0 ? '#166534' : '#dc2626' }}>
                    {acct.imported_count}/{acct.imported_count + acct.missing_count}
                  </span>
                  {acct.missing_count > 0 && (
                    <div style={{ fontSize: '0.65rem', color: '#dc2626', marginTop: '2px' }}>
                      {acct.months.filter(m => m.status === 'missing').map(m => {
                        const [y, mo] = m.month.split('-');
                        return new Date(Number(y), Number(mo)-1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                      }).join(', ')}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <div style={{ textAlign: 'center', color: '#9ca3af', padding: '3rem' }}>All statements imported!</div>}
    </div>
  );
}
