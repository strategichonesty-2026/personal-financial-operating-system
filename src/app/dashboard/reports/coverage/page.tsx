'use client';
import { useEffect, useState, useCallback } from 'react';

interface MonthCoverage {
  month: string; status: 'imported' | 'missing';
  batch_id: string | null; opening: number | null;
  closing: number | null; batch_status?: string;
  period_start?: string | null; period_end?: string | null;
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
function fmtDate(d: string): string {
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function fmtDateRange(periodStart: string | null | undefined, periodEnd: string | null | undefined, fallback: string): string {
  if (!periodStart || !periodEnd) return fallback;
  const startYear = new Date(periodStart + 'T00:00:00Z').getUTCFullYear();
  const endYear   = new Date(periodEnd   + 'T00:00:00Z').getUTCFullYear();
  const start = fmtDate(periodStart);
  const end   = fmtDate(periodEnd);
  return startYear === endYear
    ? `${start} – ${end}, ${endYear}`
    : `${start}, ${startYear} – ${end}, ${endYear}`;
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
  const [modal, setModal] = useState<{
    batchId: string; accountId: string; title: string;
    openingCents: number | null; closingCents: number | null; accountType: string;
  } | null>(null);
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

  // Upload redirects to Import page — uses full detect→confirm→import flow

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
                          <tr key={m.month}
                            onClick={() => !missing && m.batch_id && setModal({
                              batchId: m.batch_id, accountId: acct.account_id,
                              title: acct.account_name + ' — ' + fmtDateRange(m.period_start, m.period_end, fmtMonth(m.month)),
                              openingCents: m.opening, closingCents: m.closing,
                              accountType: acct.account_type,
                            })}
                            onMouseEnter={e => { if (!missing) e.currentTarget.style.background = '#eff6ff'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = rowBg; }}
                            style={{ borderTop: '1px solid #f3f4f6', background: rowBg, cursor: missing ? 'default' : 'pointer' }}>
                            <td style={{ padding: '0.625rem 1.25rem', fontWeight: missing ? 400 : 500, color: missing ? '#9ca3af' : '#374151' }}>
                              {missing ? fmtMonth(m.month) : fmtDateRange(m.period_start, m.period_end, fmtMonth(m.month))}
                            </td>
                            <td style={{ padding: '0.625rem 1rem', textAlign: 'right', color: '#6b7280' }}>
                              {missing ? '—' : dollars(m.opening)}
                            </td>
                            <td style={{ padding: '0.625rem 1rem', textAlign: 'right', fontWeight: missing ? 400 : 600, color: missing ? '#9ca3af' : '#111827' }}>
                              {missing ? '—' : dollars(m.closing)}
                            </td>
                            <td style={{ padding: '0.625rem 1rem', textAlign: 'center' }}>
                              {!missing ? (
                                <a href={'/dashboard/reports/ledger?account=' + acct.account_code}
                                  style={{ ...statusStyle, fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px',
                                    borderRadius: '99px', textDecoration: 'none', display: 'inline-block' }}>
                                  {statusLabel} →
                                </a>
                              ) : (
                                <span style={{ ...statusStyle, fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: '99px' }}>
                                  {statusLabel}
                                </span>
                              )}
                            {missing && (
                              <a href={`/dashboard/import?accountId=${acct.account_id}`}
                                style={{ marginLeft: '0.5rem', fontSize: '0.7rem', fontWeight: 600,
                                  padding: '2px 8px', borderRadius: '99px', cursor: 'pointer',
                                  background: '#eff6ff', color: '#1d4ed8',
                                  border: '1px solid #93c5fd', textDecoration: 'none' }}>
                                ↑ Import
                              </a>
                            )}
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
      {modal && (
        <CoverageModal batchId={modal.batchId} accountId={modal.accountId}
          title={modal.title} onClose={() => setModal(null)}
          openingCents={modal.openingCents} closingCents={modal.closingCents}
          accountType={modal.accountType} />
      )}
    </div>
  );
}

function CoverageModal({ batchId, accountId, title, onClose, openingCents, closingCents, accountType }: {
  batchId: string; accountId: string; title: string; onClose: () => void;
  openingCents: number | null; closingCents: number | null; accountType: string;
}) {
  const [txns, setTxns]       = useState<{staged_id:string;txn_date:string;description:string;staged_amount_cents:number;side:string|null;posted_amount_cents:number|null;entry_date:string|null}[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string|null>(null);
  useEffect(() => {
    fetch('/api/v1/ledger/transactions?batchId=' + batchId + '&accountId=' + accountId)
      .then(r => r.json()).then(d => setTxns(d.transactions ?? []))
      .catch(e => setError(String(e))).finally(() => setLoading(false));
  }, [batchId, accountId]);
  const fd = (d: string|null) => !d ? '—' : new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
  const $ = (c: number|null) => c===null||c===undefined ? '—' : '$'+(Math.abs(Number(c))/100).toLocaleString('en-US',{minimumFractionDigits:2});
  return (
    <div onClick={e=>{if(e.target===e.currentTarget)onClose();}}
      style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50,padding:'1rem'}}>
      <div style={{background:'#fff',borderRadius:'12px',boxShadow:'0 20px 60px rgba(0,0,0,0.2)',width:'100%',maxWidth:'760px',maxHeight:'85vh',display:'flex',flexDirection:'column'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'1rem 1.5rem',borderBottom:'1px solid #e5e7eb'}}>
          <div>
            <h2 style={{fontSize:'1rem',fontWeight:600,color:'#111827',margin:0}}>{title}</h2>
            {!loading && <p style={{fontSize:'0.75rem',color:'#9ca3af',margin:'2px 0 0'}}>{txns.length} transactions</p>}
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:'1.5rem',color:'#9ca3af',cursor:'pointer'}}>x</button>
        </div>
        <div style={{overflowY:'auto',flex:1}}>
          {loading && <div style={{padding:'2rem',textAlign:'center',color:'#9ca3af'}}>Loading...</div>}
          {error   && <div style={{padding:'2rem',textAlign:'center',color:'#dc2626'}}>Error: {error}</div>}
          {!loading && !error && txns.length === 0 && <div style={{padding:'2rem',textAlign:'center',color:'#9ca3af'}}>No transactions.</div>}
          {!loading && !error && txns.length > 0 && (()=>{
            const isLiab = accountType === 'liability';
            let running = openingCents ?? 0;
            const rows = txns.map(t => {
              const amt = t.posted_amount_cents ?? t.staged_amount_cents ?? 0;
              running = isLiab ? (t.side==='debit' ? running+amt : running-amt) : (t.side==='credit' ? running+amt : running-amt);
              return {...t, bal: running};
            });
            return (
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.85rem'}}>
                <thead style={{position:'sticky',top:0,background:'#f9fafb'}}>
                  <tr style={{fontSize:'0.7rem',textTransform:'uppercase',color:'#6b7280'}}>
                    <th style={{padding:'0.5rem 1rem',textAlign:'left'}}>Date</th>
                    <th style={{padding:'0.5rem 1rem',textAlign:'left'}}>Description</th>
                    <th style={{padding:'0.5rem 1rem',textAlign:'right'}}>Debit</th>
                    <th style={{padding:'0.5rem 1rem',textAlign:'right'}}>Credit</th>
                    <th style={{padding:'0.5rem 1rem',textAlign:'right'}}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{background:'#f0fdf4',borderBottom:'2px solid #bbf7d0'}}>
                    <td colSpan={4} style={{padding:'0.5rem 1rem',color:'#15803d',fontWeight:600,fontSize:'0.75rem'}}>Opening Balance</td>
                    <td style={{padding:'0.5rem 1rem',textAlign:'right',fontWeight:700,color:'#15803d'}}>{$(openingCents)}</td>
                  </tr>
                  {rows.map((t,i)=>{
                    const amt = t.posted_amount_cents ?? t.staged_amount_cents;
                    return (
                      <tr key={t.staged_id} style={{borderTop:'1px solid #f3f4f6',background:i%2===0?'#fff':'#f9fafb'}}>
                        <td style={{padding:'0.5rem 1rem',color:'#6b7280',whiteSpace:'nowrap',fontSize:'0.75rem'}}>{fd(t.entry_date??t.txn_date)}</td>
                        <td style={{padding:'0.5rem 1rem',color:'#111827'}}>{t.description}</td>
                        <td style={{padding:'0.5rem 1rem',textAlign:'right',color:'#2563eb'}}>{t.side==='debit' ? $(amt) : '—'}</td>
                        <td style={{padding:'0.5rem 1rem',textAlign:'right',color:'#16a34a'}}>{t.side==='credit' ? $(amt) : '—'}</td>
                        <td style={{padding:'0.5rem 1rem',textAlign:'right',fontWeight:500,color:'#374151'}}>{$(t.bal)}</td>
                      </tr>
                    );
                  })}
                  <tr style={{borderTop:'2px solid #bfdbfe',background:'#eff6ff'}}>
                    <td colSpan={4} style={{padding:'0.5rem 1rem',color:'#1d4ed8',fontWeight:600,fontSize:'0.75rem'}}>Closing Balance</td>
                    <td style={{padding:'0.5rem 1rem',textAlign:'right',fontWeight:700,color:'#1d4ed8'}}>{closingCents!==null ? $(closingCents) : $(running)}</td>
                  </tr>
                </tbody>
              </table>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
