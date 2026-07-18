'use client';
import { useEffect, useState } from 'react';

function fmt(cents: number) {
  return '$' + (Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 });
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type Account = { code: string; name: string; type: string; closing_balance_cents: number; period_end: string; };
type Summary = {
  assets: Account[];
  liabilities: Account[];
  totalCashCents: number;
  totalOwedCents: number;
  netWorthCents: number;
  moneyInCents: number;
  moneyOutCents: number;
};

export default function SummaryPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [showBanks, setShowBanks] = useState(true);
  const [showCards, setShowCards] = useState(true);

  useEffect(() => {
    fetch('/api/v1/summary').then(r => r.json()).then(setData);
  }, []);

  if (!data) return <div style={{ padding: '2rem', color: '#666' }}>Loading your financial snapshot...</div>;

  const ahead = data.netWorthCents > 0;

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: '800px' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#2E4057', marginBottom: '0.25rem' }}>
        Your financial snapshot
      </h1>
      <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '2rem' }}>
        Based on your most recent bank statements
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '1.5rem' }}>
        {[
          { label: 'Money in', value: fmt(data.moneyInCents), sub: 'income received', color: '#16a34a' },
          { label: 'Money out', value: fmt(data.moneyOutCents), sub: 'total spending', color: '#dc2626' },
          { label: 'In your banks', value: fmt(data.totalCashCents), sub: 'current balance', color: '#2E4057' },
          { label: 'You owe', value: fmt(data.totalOwedCents), sub: 'credit card balances', color: '#9333ea' },
        ].map(({ label, value, sub, color }) => (
          <div key={label} style={{ background: '#f8f9fa', borderRadius: '8px', padding: '1rem', border: '1px solid #e0e0e0' }}>
            <p style={{ fontSize: '0.8rem', color: '#666', margin: '0 0 4px' }}>{label}</p>
            <p style={{ fontSize: '1.4rem', fontWeight: 600, color, margin: '0 0 4px' }}>{value}</p>
            <p style={{ fontSize: '0.75rem', color: '#999', margin: 0 }}>{sub}</p>
          </div>
        ))}
      </div>

      <div style={{
        background: ahead ? '#f0fdf4' : '#fef2f2',
        border: `1px solid ${ahead ? '#bbf7d0' : '#fecaca'}`,
        borderRadius: '8px', padding: '1rem 1.25rem',
        marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px'
      }}>
        <span style={{ fontSize: '1.5rem' }}>{ahead ? '📈' : '📉'}</span>
        <div>
          <span style={{ fontSize: '1rem', fontWeight: 600, color: ahead ? '#15803d' : '#dc2626' }}>
            {ahead ? `You are ahead by ${fmt(data.netWorthCents)}` : `You owe more than you have by ${fmt(Math.abs(data.netWorthCents))}`}
          </span>
          <span style={{ fontSize: '0.85rem', color: '#666', marginLeft: '8px' }}>
            {ahead ? 'more cash than credit card debt' : 'more credit card debt than cash'}
          </span>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '10px', marginBottom: '1rem', overflow: 'hidden' }}>
        <div onClick={() => setShowBanks(!showBanks)} style={{ padding: '0.75rem 1.25rem', borderBottom: showBanks ? '1px solid #f0f0f0' : 'none', background: '#f8f9fa', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: '#2E4057' }}>Your bank accounts</p>
          <span style={{ color: '#666', fontSize: '0.8rem' }}>{showBanks ? '▲' : '▼'}</span>
        </div>
        {showBanks && data.assets.map(a => (
          <div key={a.code} style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid #f5f5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#333' }}>{a.name}</p>
              <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#999' }}>as of {fmtDate(a.period_end)}</p>
            </div>
            <span style={{ fontWeight: 600, color: '#2E4057', fontSize: '0.95rem' }}>{fmt(a.closing_balance_cents)}</span>
          </div>
        ))}
        {showBanks && <div style={{ padding: '0.75rem 1.25rem', display: 'flex', justifyContent: 'space-between', background: '#f0f7ff' }}>
          <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#2563eb' }}>Total cash</span>
          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#2563eb' }}>{fmt(data.totalCashCents)}</span>
        </div>}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '10px', overflow: 'hidden' }}>
        <div onClick={() => setShowCards(!showCards)} style={{ padding: '0.75rem 1.25rem', borderBottom: showCards ? '1px solid #f0f0f0' : 'none', background: '#f8f9fa', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: '#2E4057' }}>Your credit cards</p>
          <span style={{ color: '#666', fontSize: '0.8rem' }}>{showCards ? '▲' : '▼'}</span>
        </div>
        {showCards && data.liabilities.map(a => (
          <div key={a.code} style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid #f5f5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#333' }}>{a.name}</p>
              <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#999' }}>as of {fmtDate(a.period_end)}</p>
            </div>
            <span style={{ fontWeight: 600, color: '#9333ea', fontSize: '0.95rem' }}>{fmt(a.closing_balance_cents)}</span>
          </div>
        ))}
        {showCards && <div style={{ padding: '0.75rem 1.25rem', display: 'flex', justifyContent: 'space-between', background: '#faf5ff' }}>
          <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#9333ea' }}>Total owed</span>
          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#9333ea' }}>{fmt(data.totalOwedCents)}</span>
        </div>}
      </div>

      <p style={{ fontSize: '0.75rem', color: '#aaa', marginTop: '1rem', textAlign: 'center' }}>
        Your data is private. Only you can see this.
      </p>
    </div>
  );
}
