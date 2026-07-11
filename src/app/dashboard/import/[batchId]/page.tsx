const CATEGORY_LABELS: Record<string, string> = {
  '4011': 'Payroll',
  '4021': 'Rental Income',
  '1041': 'Investment',
  '5011': 'Mortgage',
  '5021': 'Groceries & Household',
  '5031': 'Gas & Fuel',
  '5041': 'Utilities',
  '5061': 'Shopping (Online)',
  '5071': 'Subscriptions & Streaming',
  '5081': 'Phone',
  '5082': 'Internet',
  '5091': 'Auto Insurance',
  '5101': 'Auto Loan',
  '6021': 'Software & Tools',
};

function categoryLabel(code: string | null): string {
  if (!code) return 'Uncategorized';
  return CATEGORY_LABELS[code] ?? code;
}

import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { importBatches, stagedTransactions } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { notFound } from 'next/navigation';

export default async function BatchReviewPage({ params }: { params: { batchId: string } }) {
  await requireAuth();

  const batch = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.id, params.batchId))
    .limit(1);

  if (!batch.length) notFound();
  const b = batch[0]!;

  const txns = await db
    .select()
    .from(stagedTransactions)
    .where(eq(stagedTransactions.batchId, params.batchId))
    .orderBy(desc(stagedTransactions.txnDate));

  const pending    = txns.filter(t => t.status === 'pending');
  const duplicates = txns.filter(t => t.status === 'duplicate');
  const transfers  = txns.filter(t => t.transferCandidate);

  return (
    <div style={{ maxWidth: '900px' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href="/dashboard/import" style={{ color: '#666', fontSize: '0.85rem', textDecoration: 'none' }}>
          Back to Import
        </a>
        <h1 style={{ fontSize: '1.6rem', color: '#2E4057', margin: '0.5rem 0' }}>
          Review Transactions
        </h1>
        <div style={{ fontSize: '0.85rem', color: '#888' }}>
          {b.institution} — {b.filename} — {txns.length} transactions
        </div>
      </div>

      {/* Summary bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        {[
          { label: 'Total', value: txns.length, color: '#2E4057' },
          { label: 'Pending', value: pending.length, color: '#2196F3' },
          { label: 'Transfers', value: transfers.length, color: '#FF9800' },
          { label: 'Duplicates', value: duplicates.length, color: '#999' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #E0E0E0', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.8rem', color: '#888' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Transaction table */}
      <div style={{ background: '#fff', border: '1px solid #E0E0E0', borderRadius: '8px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ background: '#F8F9FA', borderBottom: '1px solid #E0E0E0' }}>
              <th style={th}>Date</th>
              <th style={th}>Description</th>
              <th style={th}>Category</th>
              <th style={{ ...th, textAlign: 'right' }}>Amount</th>
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {txns.map((t, i) => (
              <tr key={t.id} style={{ borderBottom: '1px solid #F0F0F0', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                <td style={td}>{t.txnDate}</td>
                <td style={{ ...td, maxWidth: '300px' }}>
                  <div style={{ fontWeight: 500, color: '#2E4057' }}>{t.merchantName ?? t.description}</div>
                  {t.merchantName && t.rawDescription !== t.description && (
                    <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '2px' }}>{t.rawDescription.slice(0, 60)}</div>
                  )}
                  {t.transferCandidate && (
                    <span style={{ fontSize: '0.7rem', background: '#FFF3E0', color: '#E65100', padding: '1px 6px', borderRadius: '10px', marginTop: '2px', display: 'inline-block' }}>
                      Transfer
                    </span>
                  )}
                </td>
                <td style={td}>
                  <span style={{ fontSize: '0.8rem', color: t.categoryCode ? '#2E4057' : '#BBB' }}>
                    {categoryLabel(t.categoryCode)}
                  </span>
                </td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: t.direction === 'credit' ? '#2E7D32' : '#C62828' }}>
                  {t.direction === 'credit' ? '+' : '-'}${(t.amountCents / 100).toFixed(2)}
                </td>
                <td style={td}>
                  <span style={{
                    fontSize: '0.75rem', padding: '2px 8px', borderRadius: '10px',
                    background: t.status === 'pending' ? '#E3F2FD' : t.status === 'duplicate' ? '#F5F5F5' : '#E8F5E9',
                    color: t.status === 'pending' ? '#1565C0' : t.status === 'duplicate' ? '#999' : '#2E7D32',
                  }}>
                    {t.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#666', fontSize: '0.8rem' };
const td: React.CSSProperties = { padding: '0.75rem 1rem', color: '#444', verticalAlign: 'top' };
