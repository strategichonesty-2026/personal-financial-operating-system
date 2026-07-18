'use client';
import { useEffect, useState } from 'react';

interface FeedbackItem {
  id: string;
  user_id: string;
  type: string;
  page: string;
  message: string;
  error_details: Record<string, string>;
  status: string;
  created_at: string;
}

export default function AdminFeedbackPage() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [selected, setSelected] = useState<FeedbackItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/v1/feedback')
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setItems(d.feedback ?? []);
        setLoading(false);
      });
  }, []);

  async function resolve(id: string) {
    await fetch('/api/v1/feedback', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'resolved' }),
    });
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'resolved' } : i));
    setSelected(null);
  }

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>;
  if (error) return <div style={{ padding: '2rem', color: 'red' }}>Access denied: {error}</div>;

  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#2E4057', marginBottom: '1.5rem' }}>
        Feedback & Error Reports
      </h1>
      {items.length === 0 && (
        <div style={{ color: '#666' }}>No feedback yet.</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {items.map(item => (
          <div
            key={item.id}
            onClick={() => setSelected(item)}
            style={{
              background: '#fff', border: '1px solid #e0e0e0',
              borderLeft: `4px solid ${item.status === 'resolved' ? '#4caf50' : item.type === 'error' ? '#e53935' : '#2E4057'}`,
              borderRadius: '6px', padding: '0.9rem 1.2rem',
              cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}
          >
            <div>
              <span style={{
                fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase',
                color: item.type === 'error' ? '#e53935' : '#2E4057', marginRight: '0.75rem'
              }}>
                {item.type}
              </span>
              <span style={{ fontSize: '0.9rem', color: '#333' }}>
                {item.message ?? 'No message'}
              </span>
              <div style={{ fontSize: '0.78rem', color: '#999', marginTop: '0.25rem' }}>
                {item.page} · {new Date(item.created_at).toLocaleString()}
              </div>
            </div>
            <span style={{
              fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '999px',
              background: item.status === 'resolved' ? '#e8f5e9' : '#fff3e0',
              color: item.status === 'resolved' ? '#2e7d32' : '#e65100'
            }}>
              {item.status}
            </span>
          </div>
        ))}
      </div>

      {selected && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            background: '#fff', borderRadius: '10px', padding: '2rem',
            maxWidth: '600px', width: '90%', maxHeight: '80vh', overflowY: 'auto'
          }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', color: '#2E4057' }}>
              Report Detail
            </h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              {[
                ['Type', selected.type],
                ['Page', selected.page],
                ['User', selected.user_id],
                ['Status', selected.status],
                ['Time', new Date(selected.created_at).toLocaleString()],
                ['Message', selected.message],
              ].map(([k, v]) => (
                <tr key={k} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '0.5rem', fontWeight: 600, color: '#666', width: '30%' }}>{k}</td>
                  <td style={{ padding: '0.5rem', color: '#333' }}>{v ?? '—'}</td>
                </tr>
              ))}
            </table>
            {selected.error_details && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ fontWeight: 600, color: '#666', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                  Technical Details
                </div>
                <pre style={{
                  background: '#f5f5f5', padding: '0.75rem', borderRadius: '6px',
                  fontSize: '0.78rem', overflowX: 'auto', whiteSpace: 'pre-wrap'
                }}>
                  {JSON.stringify(selected.error_details, null, 2)}
                </pre>
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              {selected.status !== 'resolved' && (
                <button
                  onClick={() => resolve(selected.id)}
                  style={{
                    background: '#2E4057', color: '#fff', border: 'none',
                    borderRadius: '6px', padding: '0.5rem 1.2rem', cursor: 'pointer'
                  }}
                >
                  Mark Resolved
                </button>
              )}
              <button
                onClick={() => setSelected(null)}
                style={{
                  background: '#eee', color: '#333', border: 'none',
                  borderRadius: '6px', padding: '0.5rem 1.2rem', cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
