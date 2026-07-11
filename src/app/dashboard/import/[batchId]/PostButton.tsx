'use client';

import { useState } from 'react';

export default function PostButton({ batchId, pendingCount }: { batchId: string; pendingCount: number }) {
  const [state, setState] = useState<'idle' | 'posting' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<{ posted: number; skipped: number; errors: string[] } | null>(null);

  if (pendingCount === 0) return null;

  async function handlePost() {
    setState('posting');
    try {
      const res = await fetch('/api/v1/import/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setResult(data);
      setState('done');
    } catch (err) {
      setResult({ posted: 0, skipped: 0, errors: [String(err)] });
      setState('error');
    }
  }

  if (state === 'done' && result) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem', background: '#F1F8E9', borderRadius: '8px', border: '1px solid #C5E1A5', marginBottom: '1.5rem' }}>
        <span style={{ color: '#2E7D32', fontWeight: 600 }}>✓ {result.posted} transactions posted to journal</span>
        {result.skipped > 0 && <span style={{ color: '#888', fontSize: '0.85rem' }}>{result.skipped} skipped</span>}
        <button onClick={() => window.location.reload()} style={btnStyle}>Refresh</button>
      </div>
    );
  }

  if (state === 'error' && result) {
    return (
      <div style={{ padding: '0.75rem 1rem', background: '#FFF3F3', borderRadius: '8px', border: '1px solid #FFCDD2', marginBottom: '1.5rem', color: '#C62828', fontSize: '0.85rem' }}>
        {result.errors[0]}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem' }}>
      <button
        onClick={handlePost}
        disabled={state === 'posting'}
        style={{ ...btnStyle, background: state === 'posting' ? '#999' : '#2E7D32' }}
      >
        {state === 'posting' ? 'Posting...' : `Post All ${pendingCount} Transactions`}
      </button>
      <span style={{ fontSize: '0.8rem', color: '#888' }}>
        Creates double-entry journal entries for all pending transactions
      </span>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: '#2E7D32', color: '#fff', border: 'none', borderRadius: '6px',
  padding: '0.6rem 1.25rem', fontSize: '0.9rem', cursor: 'pointer', fontWeight: 600,
};
