'use client';

import { useState, useEffect } from 'react';

const INSTITUTION_LABELS: Record<string, string> = {
  wells_fargo: 'Wells Fargo',
  us_bank:     'U.S. Bank',
  citi:        'Citi Costco Visa',
  synchrony:   "Synchrony Sam's Club",
  chase:       'Chase Amazon',
  bofa:        'Bank of America',
};

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

interface AccountOption { id: string; label: string; last4: string | null; inst: string | null; }

function instKeyFromDb(institution: string | null): string | null {
  if (!institution) return null;
  const s = institution.toLowerCase();
  if (s.includes('wells fargo'))  return 'wells_fargo';
  if (s.includes('u.s. bank') || s.includes('us bank')) return 'us_bank';
  if (s.includes('citi'))         return 'citi';
  if (s.includes('synchrony'))    return 'synchrony';
  if (s.includes('chase'))        return 'chase';
  if (s.includes('bank of america') || s.includes('bofa')) return 'bofa';
  return null;
}

function accountLabel(name: string, accountRef: string | null): string {
  return accountRef ? `${name} ****${accountRef}` : name;
}

interface Detected {
  filename: string; institution: string | null; accountLast4: string | null;
  year: number | null; month: number | null; pages: number;
  periodStart: string | null; periodEnd: string | null;
}

interface UploadResult {
  batchId: string; institution: string; pages: number; parsed: number;
  inserted: number; duplicates: number;
  openingBalanceCents: number | null; closingBalanceCents: number | null;
  periodStart: string; periodEnd: string; accountId: string;
  detectedPeriodStart: string | null; detectedPeriodEnd: string | null;
}

type FileStatus = 'queued' | 'detecting' | 'needs_confirm' | 'importing' | 'done' | 'error';

interface QueuedFile {
  id: string; file: File; status: FileStatus; detected: Detected | null;
  accountId: string; institution: string; year: number; month: number;
  result: UploadResult | null; error: string;
  detectedPeriodStart: string | null; detectedPeriodEnd: string | null;
}

const fmt = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export default function ImportPage() {
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [bulkDone, setBulkDone] = useState(false);

  useEffect(() => {
    fetch('/api/v1/accounts').then(r => r.json()).then(data => {
      if (!data.data?.accounts) return;
      const opts: AccountOption[] = (data.data.accounts as Array<{
        id: string; name: string; accountRef: string | null; institution: string | null; type: string;
      }>).filter(a => a.type === 'asset' || a.type === 'liability').map(a => ({
        id: a.id, label: accountLabel(a.name, a.accountRef),
        last4: a.accountRef, inst: instKeyFromDb(a.institution),
      }));
      setAccounts(opts);
    }).catch(() => {});
  }, []);

  function updateFile(id: string, patch: Partial<QueuedFile>) {
    setQueue(q => q.map(f => f.id === id ? { ...f, ...patch } : f));
  }

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setBulkDone(false);
    const newItems: QueuedFile[] = files.map(file => ({
      id: crypto.randomUUID(), file, status: 'queued' as FileStatus,
      detected: null, accountId: '', institution: '',
      year: new Date().getFullYear(), month: new Date().getMonth() + 1,
      result: null, error: '',
      detectedPeriodStart: null, detectedPeriodEnd: null,
    }));
    setQueue(prev => [...prev, ...newItems]);
    for (const item of newItems) {
      updateFile(item.id, { status: 'detecting' });
      setActiveId(item.id);
      try {
        const fd = new FormData();
        fd.append('file', item.file);
        const res  = await fetch('/api/v1/import/detect', { method: 'POST', body: fd });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error);
        const detected: Detected = data;
        // Auto-match by last4 first, then by institution if needed
        let matchedAccount = accounts.find(a => a.last4 === detected.accountLast4);
        if (!matchedAccount && detected.institution) {
          matchedAccount = accounts.find(a => a.inst === detected.institution);
        }
        updateFile(item.id, {
          status: 'needs_confirm', detected,
          accountId: matchedAccount?.id ?? '',
          institution: detected.institution ?? '',
          year: detected.year ?? new Date().getFullYear(),
          month: detected.month ?? new Date().getMonth() + 1,
          detectedPeriodStart: detected.periodStart ?? null,
          detectedPeriodEnd: detected.periodEnd ?? null,
        });
      } catch (err) {
        updateFile(item.id, { status: 'error', error: String(err) });
      }
    }
    setActiveId(null);
  }

  async function handleImportOne(id: string) {
    const item = queue.find(f => f.id === id);
    if (!item || !item.accountId) return;
    updateFile(id, { status: 'importing' });
    try {
      const fd = new FormData();
      fd.append('file', item.file);
      fd.append('accountId', item.accountId);
      fd.append('year', String(item.year));
      fd.append('month', String(item.month));
      if (item.institution) fd.append('institution', item.institution);
      const res  = await fetch('/api/v1/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Import failed');
      updateFile(id, { status: 'done', result: data });
    } catch (err) {
      updateFile(id, { status: 'error', error: String(err) });
    }
  }

  async function handleImportAll() {
    const toImport = queue.filter(f => f.status === 'needs_confirm' && f.accountId);
    for (const item of toImport) await handleImportOne(item.id);
    setBulkDone(true);
  }

  function removeFile(id: string) { setQueue(q => q.filter(f => f.id !== id)); }
  function reset() { setQueue([]); setBulkDone(false); setActiveId(null); }

  function reconcileUrl(result: UploadResult, item: QueuedFile): string {
    const params = new URLSearchParams({ batchId: result.batchId,
      accountId:   result.accountId,
      periodStart: item.detectedPeriodStart ?? result.periodStart,
      periodEnd:   item.detectedPeriodEnd   ?? result.periodEnd,
      ...(result.openingBalanceCents != null ? { opening: String(result.openingBalanceCents / 100) } : {}),
      ...(result.closingBalanceCents != null ? { closing: String(result.closingBalanceCents / 100) } : {}),
    });
    return `/dashboard/reconciliation?${params.toString()}`;
  }

  const readyToImport = queue.filter(f => f.status === 'needs_confirm' && f.accountId);
  const totalInserted = queue.reduce((sum, f) => sum + (f.result?.inserted ?? 0), 0);
  const totalDupes    = queue.reduce((sum, f) => sum + (f.result?.duplicates ?? 0), 0);

  return (
    <div style={{ maxWidth: '720px' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.8rem', color: '#2E4057', marginBottom: '0.4rem' }}>Import Statements</h1>
        <p style={{ color: '#666' }}>Select one or more PDF statements — we will auto-detect each bank and period.</p>
      </div>

      <div style={{ background: '#fff', borderRadius: '8px', padding: '1.5rem', border: '1px solid #E0E0E0', marginBottom: '1rem' }}>
        <label style={labelStyle}>Choose PDF Statements (select multiple)</label>
        <input type="file" accept=".pdf" multiple onChange={handleFilesSelected} style={inputStyle} disabled={activeId !== null} />
        {activeId && <div style={{ marginTop: '0.5rem', color: '#666', fontSize: '0.85rem' }}>Analyzing PDFs...</div>}
      </div>

      {queue.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {readyToImport.length > 0 && !bulkDone && (
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '1rem', background: '#F1F8E9', borderRadius: '8px', border: '1px solid #C5E1A5' }}>
              <div style={{ flex: 1, fontSize: '0.9rem', color: '#2E7D32' }}>
                <strong>{readyToImport.length}</strong> file{readyToImport.length > 1 ? 's' : ''} ready to import
              </div>
              <button onClick={handleImportAll} style={btnStyle}>Import All</button>
              <button onClick={reset} style={{ ...btnStyle, background: '#fff', color: '#2E4057', border: '1px solid #D0D0D0' }}>Clear All</button>
            </div>
          )}

          {bulkDone && (
            <div style={{ padding: '1rem', background: '#F1F8E9', borderRadius: '8px', border: '1px solid #C5E1A5' }}>
              <div style={{ fontWeight: 600, color: '#2E7D32', marginBottom: '0.25rem' }}>All imports complete</div>
              <div style={{ fontSize: '0.85rem', color: '#444' }}>{totalInserted} transactions staged · {totalDupes} duplicates skipped</div>
              <button onClick={reset} style={{ ...btnStyle, marginTop: '0.75rem', fontSize: '0.85rem', padding: '0.5rem 1rem' }}>Import more</button>
            </div>
          )}

          {queue.map(item => (
            <div key={item.id} style={{ background: '#fff', borderRadius: '8px', border: '1px solid #E0E0E0', padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#2E4057', fontSize: '0.95rem' }}>{item.file.name}</div>
                  {item.detected && (
                    <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.2rem' }}>
                      {item.detected.institution ? INSTITUTION_LABELS[item.detected.institution] ?? item.detected.institution : 'Unknown institution'}
                      {item.detected.month && item.detected.year ? ` · ${MONTHS[item.detected.month-1]} ${item.detected.year}` : ''}
                      {` · ${item.detected.pages} pages`}
                    </div>
                  )}
                </div>
                <StatusBadge status={item.status} />
              </div>

              {item.status === 'detecting' && <div style={{ fontSize: '0.85rem', color: '#888' }}>Analyzing PDF...</div>}

              {item.status === 'needs_confirm' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {!item.detected?.institution && (
                    <div>
                      <label style={labelStyle}>Institution</label>
                      <select value={item.institution} onChange={e => updateFile(item.id, { institution: e.target.value })} style={inputStyle}>
                        <option value="">— Select institution —</option>
                        <option value="wells_fargo">Wells Fargo</option>
                        <option value="us_bank">U.S. Bank</option>
                        <option value="citi">Citi Costco Visa</option>
                        <option value="synchrony">Synchrony Sam's Club</option>
                        <option value="chase">Chase Amazon</option>
                        <option value="bofa">Bank of America</option>
                      </select>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={labelStyle}>Account</label>
                      <select value={item.accountId} onChange={e => updateFile(item.id, { accountId: e.target.value })} style={inputStyle}>
                        <option value="">— Select —</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Month</label>
                      <select value={item.month} onChange={e => updateFile(item.id, { month: Number(e.target.value) })} style={inputStyle}>
                        {MONTHS.map((m,i) => <option key={m} value={i+1}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Year</label>
                      <select value={item.year} onChange={e => updateFile(item.id, { year: Number(e.target.value) })} style={inputStyle}>
                        {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => handleImportOne(item.id)} disabled={!item.accountId} style={{ ...btnStyle, fontSize: '0.85rem', padding: '0.5rem 1rem', background: item.accountId ? '#2E4057' : '#999' }}>
                      Import this file
                    </button>
                    <button onClick={() => removeFile(item.id)} style={{ ...btnStyle, background: '#fff', color: '#999', border: '1px solid #E0E0E0', fontSize: '0.85rem', padding: '0.5rem 1rem' }}>
                      Remove
                    </button>
                  </div>
                </div>
              )}

              {item.status === 'importing' && <div style={{ fontSize: '0.85rem', color: '#888' }}>Importing transactions...</div>}

              {item.status === 'done' && item.result && (
                <div style={{ fontSize: '0.85rem', color: '#444' }}>
                  <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                    <span><strong>{item.result.inserted}</strong> staged</span>
                    <span><strong>{item.result.duplicates}</strong> dupes skipped</span>
                    <span><strong>{item.result.pages}</strong> pages</span>
                  </div>
                  {(item.result.openingBalanceCents != null || item.result.closingBalanceCents != null) && (
                    <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.5rem', color: '#555' }}>
                      {item.result.openingBalanceCents != null && <span>Opening: <strong>{fmt(item.result.openingBalanceCents)}</strong></span>}
                      {item.result.closingBalanceCents != null && <span>Closing: <strong>{fmt(item.result.closingBalanceCents)}</strong></span>}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <a href={`/dashboard/import/${item.result.batchId}`} style={{ color: '#2E4057', fontWeight: 600 }}>Review →</a>
                    <a href={reconcileUrl(item.result, item)} style={{ color: '#1d4ed8', fontWeight: 600, background: '#eff6ff', padding: '0.2rem 0.75rem', borderRadius: '4px' }}>
                      🔁 Reconcile →
                    </a>
                  </div>
                </div>
              )}

              {item.status === 'error' && <div style={{ fontSize: '0.85rem', color: '#C62828' }}>{item.error}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: FileStatus }) {
  const map: Record<FileStatus, { label: string; color: string; bg: string }> = {
    queued:        { label: 'Queued',     color: '#888',    bg: '#F5F5F5' },
    detecting:     { label: 'Analyzing',  color: '#1565C0', bg: '#E3F2FD' },
    needs_confirm: { label: 'Needs info', color: '#E65100', bg: '#FFF3E0' },
    importing:     { label: 'Importing',  color: '#1565C0', bg: '#E3F2FD' },
    done:          { label: 'Done ✓',    color: '#2E7D32', bg: '#F1F8E9' },
    error:         { label: 'Error',      color: '#C62828', bg: '#FFF3F3' },
  };
  const s = map[status];
  return (
    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: s.color, background: s.bg, padding: '0.2rem 0.6rem', borderRadius: '99px', whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#2E4057', marginBottom: '0.4rem' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #D0D0D0', borderRadius: '6px', fontSize: '0.95rem', color: '#2E4057', background: '#fff', boxSizing: 'border-box' };
const btnStyle: React.CSSProperties = { background: '#2E4057', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.75rem 1.5rem', fontSize: '1rem', cursor: 'pointer', fontWeight: 600 };
