'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Batch = {
  id: string;
  filename: string;
  institution: string;
  accountRef: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  status: 'pending' | 'posted' | 'reconciled';
  transactionCount: number;
  pendingCount: number;
  postedCount: number;
};

type GroupedBatches = Record<string, Batch[]>;

const INSTITUTION_LABELS: Record<string, string> = {
  wells_fargo: 'Wells Fargo',
  us_bank: 'US Bank',
  chase: 'Chase',
  citi: 'Citi',
  synchrony: 'Synchrony',
  bofa: 'Bank of America',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  posted: 'bg-blue-100 text-blue-800',
  reconciled: 'bg-green-100 text-green-800',
};

export default function ReviewPage() {
  const router = useRouter();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBatches();
  }, []);

  async function fetchBatches() {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/import/batches');
      if (!res.ok) throw new Error('Failed to load batches');
      const data = await res.json();
      setBatches(data.batches ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePostAll(batchId: string) {
    setActionLoading(prev => ({ ...prev, [batchId]: true }));
    try {
      const res = await fetch(`/api/v1/import/${batchId}/post`, { method: 'POST' });
      if (!res.ok) throw new Error('Post failed');
      await fetchBatches(); // refresh
    } catch (e: any) {
      alert(`Post failed: ${e.message}`);
    } finally {
      setActionLoading(prev => ({ ...prev, [batchId]: false }));
    }
  }

  function handleReconcile(batch: Batch) {
    const params = new URLSearchParams({ batchId: batch.id });
    if (batch.periodStart) params.set('periodStart', batch.periodStart);
    if (batch.periodEnd) params.set('periodEnd', batch.periodEnd);
    router.push(`/dashboard/reconciliation?${params.toString()}`);
  }

  const grouped: GroupedBatches = batches.reduce((acc, b) => {
    const key = b.institution || 'unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(b);
    return acc;
  }, {} as GroupedBatches);

  const institutionOrder = ['wells_fargo', 'us_bank', 'chase', 'citi', 'synchrony', 'bofa'];
  const sortedInstitutions = [
    ...institutionOrder.filter(k => grouped[k]),
    ...Object.keys(grouped).filter(k => !institutionOrder.includes(k)),
  ];

  if (loading) {
    return (
      <div className="p-6 text-gray-500 text-sm">Loading statements…</div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-red-600 text-sm">Error: {error}</div>
    );
  }

  if (batches.length === 0) {
    return (
      <div className="p-6 text-gray-500 text-sm">
        No imported statements yet.{' '}
        <a href="/dashboard/import" className="text-blue-600 underline">Import PDFs →</a>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Statement Review</h1>
        <span className="text-sm text-gray-500">{batches.length} statements across {sortedInstitutions.length} institutions</span>
      </div>

      <div className="space-y-8">
        {sortedInstitutions.map(institution => (
          <div key={institution}>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
              {INSTITUTION_LABELS[institution] ?? institution}
            </h2>

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2 text-gray-500 font-medium">Account</th>
                    <th className="text-left px-4 py-2 text-gray-500 font-medium">Period</th>
                    <th className="text-left px-4 py-2 text-gray-500 font-medium">Transactions</th>
                    <th className="text-left px-4 py-2 text-gray-500 font-medium">Status</th>
                    <th className="text-right px-4 py-2 text-gray-500 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {grouped[institution]
                    .sort((a, b) => (a.periodStart ?? '').localeCompare(b.periodStart ?? ''))
                    .map(batch => (
                      <tr key={batch.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-gray-800">
                          ···{batch.accountRef ?? '????'}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {batch.periodStart && batch.periodEnd
                            ? `${formatDate(batch.periodStart)} – ${formatDate(batch.periodEnd)}`
                            : <span className="text-gray-400 italic">No period</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {batch.transactionCount} total
                          {batch.pendingCount > 0 && (
                            <span className="ml-2 text-yellow-600">({batch.pendingCount} pending)</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[batch.status]}`}>
                            {batch.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right space-x-2">
                          {batch.status === 'pending' && (
                            <button
                              onClick={() => handlePostAll(batch.id)}
                              disabled={actionLoading[batch.id]}
                              className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                            >
                              {actionLoading[batch.id] ? 'Posting…' : 'Post All'}
                            </button>
                          )}
                          {batch.status === 'posted' && (
                            <button
                              onClick={() => handleReconcile(batch)}
                              className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                            >
                              Reconcile →
                            </button>
                          )}
                          {batch.status === 'reconciled' && (
                            <span className="text-xs text-green-600 font-medium">✓ Done</span>
                          )}
                          <a
                            href={`/dashboard/import/${batch.id}`}
                            className="px-3 py-1 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-100 inline-block"
                          >
                            View
                          </a>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(month) - 1]} ${parseInt(day)}, ${year}`;
}
