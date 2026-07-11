import { requireAuth } from '@/lib/auth';
import { getTrialBalance, toDollars } from '@/lib/accounting/engine';

function fmt(cents: number): string {
  return '$' + (Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 });
}

const TYPE_ORDER = ['asset', 'liability', 'equity', 'income', 'expense'];
const TYPE_LABELS: Record<string, string> = {
  asset:     'Assets',
  liability: 'Liabilities',
  equity:    'Equity',
  income:    'Income',
  expense:   'Expenses',
};

export default async function TrialBalancePage() {
  await requireAuth();
  const tb = await getTrialBalance();

  const grouped = TYPE_ORDER.reduce((acc, type) => {
    acc[type] = tb.accounts.filter(a => a.accountType === type && (a.debitTotal > 0 || a.creditTotal > 0));
    return acc;
  }, {} as Record<string, typeof tb.accounts>);

  return (
    <div style={{ maxWidth: '900px' }}>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', color: '#2E4057', marginBottom: '0.25rem' }}>Trial Balance</h1>
          <p style={{ color: '#888', fontSize: '0.85rem' }}>All accounts with activity — double-entry verified</p>
        </div>
        <div style={{ padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: 700, fontSize: '0.9rem', background: tb.isBalanced ? '#F1F8E9' : '#FFF3F3', color: tb.isBalanced ? '#2E7D32' : '#C62828', border: `1px solid ${tb.isBalanced ? '#C5E1A5' : '#FFCDD2'}` }}>
          {tb.isBalanced ? '✓ Balanced' : '⚠ Out of Balance'}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        {[
          { label: 'Total Debits',  value: fmt(tb.totalDebits) },
          { label: 'Total Credits', value: fmt(tb.totalCredits) },
          { label: 'Difference',    value: fmt(Math.abs(tb.totalDebits - tb.totalCredits)) },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #E0E0E0', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#2E4057' }}>{s.value}</div>
            <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.25rem' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E0E0E0', borderRadius: '8px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ background: '#F8F9FA', borderBottom: '2px solid #E0E0E0' }}>
              <th style={th}>Code</th>
              <th style={th}>Account Name</th>
              <th style={{ ...th, textAlign: 'right' }}>Debits</th>
              <th style={{ ...th, textAlign: 'right' }}>Credits</th>
              <th style={{ ...th, textAlign: 'right' }}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {TYPE_ORDER.map(type => {
              const accts = grouped[type] ?? [];
              if (!accts.length) return null;
              const typeDebit   = accts.reduce((s, a) => s + a.debitTotal, 0);
              const typeCredit  = accts.reduce((s, a) => s + a.creditTotal, 0);
              const typeBalance = accts.reduce((s, a) => s + a.balance, 0);
              return [
                <tr key={`hdr-${type}`} style={{ background: '#F0F4F8', borderTop: '1px solid #E0E0E0' }}>
                  <td colSpan={5} style={{ padding: '0.5rem 1rem', fontWeight: 700, color: '#2E4057', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {TYPE_LABELS[type]}
                  </td>
                </tr>,
                ...accts.map((a, i) => (
                  <tr key={a.accountCode} style={{ borderBottom: '1px solid #F0F0F0', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                    <td style={{ ...td, color: '#888', fontSize: '0.8rem' }}>{a.accountCode}</td>
                    <td style={td}>{a.accountName}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{a.debitTotal > 0 ? fmt(a.debitTotal) : '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{a.creditTotal > 0 ? fmt(a.creditTotal) : '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600, fontFamily: 'monospace', color: a.balance >= 0 ? '#2E4057' : '#C62828' }}>{fmt(a.balance)}</td>
                  </tr>
                )),
                <tr key={`sub-${type}`} style={{ background: '#F8F9FA', borderTop: '1px solid #E0E0E0', borderBottom: '2px solid #E0E0E0' }}>
                  <td colSpan={2} style={{ ...td, fontWeight: 600, color: '#666', fontSize: '0.8rem' }}>Total {TYPE_LABELS[type]}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>{fmt(typeDebit)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>{fmt(typeCredit)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>{fmt(Math.abs(typeBalance))}</td>
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#AAA', textAlign: 'right' }}>
        Generated from {tb.accounts.filter(a => a.debitTotal > 0 || a.creditTotal > 0).length} accounts with activity · {toDollars(tb.totalDebits - tb.totalCredits) === 0 ? 'Debits = Credits' : 'IMBALANCE DETECTED'}
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#666', fontSize: '0.8rem' };
const td: React.CSSProperties = { padding: '0.6rem 1rem', color: '#444', verticalAlign: 'top' };
