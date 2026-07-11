'use client';

import { useState } from 'react';

const INSTITUTION_LABELS: Record<string, string> = {
  wells_fargo: 'Wells Fargo',
  us_bank:     'U.S. Bank',
  citi:        'Citi Costco Visa',
  synchrony:   "Synchrony Sam's Club",
  chase:       'Chase Amazon',
  bofa:        'Bank of America',
};

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const ACCOUNTS = [
  { id: 'wf-4184',   label: 'Wells Fargo Checking ****4184',      last4: '4184', inst: 'wells_fargo' },
  { id: 'wf-8029',   label: 'Wells Fargo Way2Save ****8029',       last4: '8029', inst: 'wells_fargo' },
  { id: 'wf-team',   label: 'Wells Fargo Team Member Checking',    last4: null,   inst: 'wells_fargo' },
  { id: 'usb-6820',  label: 'U.S. Bank Gold Checking ****6820',    last4: '6820', inst: 'us_bank' },
  { id: 'usb-1353',  label: 'U.S. Bank Smartly Joint ****1353',    last4: '1353', inst: 'us_bank' },
  { id: 'bofa-1961', label: 'BofA Checking ****1961',              last4: '1961', inst: 'bofa' },
  { id: 'bofa-6951', label: 'BofA Savings ****6951',               last4: '6951', inst: 'bofa' },
  { id: 'chase-2877',label: 'Chase Amazon Visa ****2877',          last4: '2877', inst: 'chase' },
  { id: 'sync-1629', label: "Synchrony Sam's Club ****1629",       last4: '1629', inst: 'synchrony' },
  { id: 'citi-4621', label: 'Citi Costco Visa ****4621',           last4: '4621', inst: 'citi' },
  { id: 'bofa-9292', label: 'BofA Visa ****9292',                  last4: '9292', inst: 'bofa' },
];

interface Detected {
  filename: string;
  institution: string | null;
  accountLast4: string | null;
  year: number | null;
  month: number | null;
  pages: number;
}

interface UploadResult {
  batchId: string;
  institution: string;
  pages: number;
  parsed: number;
  inserted: number;
  duplicates: number;
}

type Stage = 'pick' | 'detecting' | 'confirm' | 'importing' | 'done' | 'error';

export default function ImportPage() {
  const [stage, setStage]       = useState<Stage>('pick');
  const [file, setFile]         = useState<File | null>(null);
  const [detected, setDetected] = useState<Detected | null>(null);
  const [accountId, setAccountId] = useState('');
  const [year, setYear]         = useState<number>(new Date().getFullYear());
  const [month, setMonth]       = useState<number>(new Date().getMonth() + 1);
  const [result, setResult]     = useState<UploadResult | null>(null);
  const [error, setError]       = useState('');

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (!f) return;

    setStage('detecting');
    setError('');

    const formData = new FormData();
    formData.append('file', f);

    try {
      const res = await fetch('/api/v1/import/detect', { method: 'POST', body: formData });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      setDetected(data);

      // Auto-select account if last4 matches
      if (data.accountLast4) {
        const match = ACCOUNTS.find(a => a.last4 === data.accountLast4 && a.inst === data.institution);
        if (match) setAccountId(match.id);
      }
      if (data.year)  setYear(data.year);
      if (data.month) setMonth(data.month);

      setStage('confirm');
    } catch (err) {
      setError(String(err));
      setStage('error');
    }
  }

  async function handleImport() {
    if (!file || !accountId) { setError('Please select an account.'); return; }
    setStage('importing');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('accountId', accountId);
    formData.append('year', String(year));
    formData.append('month', String(month));

    try {
      const res = await fetch('/api/v1/import', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Import failed');
      setResult(data);
      setStage('done');
    } catch (err) {
      setError(String(err));
      setStage('error');
    }
  }

  function reset() {
    setStage('pick'); setFile(null); setDetected(null);
    setAccountId(''); setResult(null); setError('');
  }

  return (
    <div style={{ maxWidth: '640px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.8rem', color: '#2E4057', marginBottom: '0.5rem' }}>Import Statement</h1>
        <p style={{ color: '#666' }}>Upload a PDF — we will auto-detect the bank, account, and period.</p>
      </div>

      <div style={{ background: '#fff', borderRadius: '8px', padding: '2rem', border: '1px solid #E0E0E0', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {/* Stage: pick file */}
        {(stage === 'pick' || stage === 'detecting') && (
          <div>
            <label style={labelStyle}>Choose PDF Statement</label>
            <input type="file" accept=".pdf" onChange={handleFileChange} style={inputStyle} disabled={stage === 'detecting'} />
            {stage === 'detecting' && (
              <div style={{ marginTop: '0.75rem', color: '#666', fontSize: '0.9rem' }}>
                Analyzing PDF...
              </div>
            )}
          </div>
        )}

        {/* Stage: confirm detected values */}
        {stage === 'confirm' && detected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ background: '#F8F9FA', borderRadius: '6px', padding: '1rem', fontSize: '0.9rem' }}>
              <div style={{ fontWeight: 600, color: '#2E4057', marginBottom: '0.5rem' }}>Detected</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', color: '#444' }}>
                <div>File: <strong>{detected.filename}</strong></div>
                <div>Institution: <strong>{detected.institution ? INSTITUTION_LABELS[detected.institution] ?? detected.institution : 'Unknown'}</strong></div>
                <div>Account last 4: <strong>{detected.accountLast4 ? '****' + detected.accountLast4 : 'Not detected'}</strong></div>
                <div>Period: <strong>{detected.month ? MONTHS[detected.month-1] : '?'} {detected.year ?? '?'}</strong></div>
                <div>Pages: <strong>{detected.pages}</strong></div>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Confirm Account</label>
              <select value={accountId} onChange={e => setAccountId(e.target.value)} style={inputStyle}>
                <option value="">— Select account —</option>
                {ACCOUNTS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Month</label>
                <select value={month} onChange={e => setMonth(Number(e.target.value))} style={inputStyle}>
                  {MONTHS.map((m,i) => <option key={m} value={i+1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Year</label>
                <select value={year} onChange={e => setYear(Number(e.target.value))} style={inputStyle}>
                  {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={handleImport} disabled={!accountId} style={{ ...btnStyle, background: accountId ? '#2E4057' : '#999', flex: 1 }}>
                Confirm and Import
              </button>
              <button onClick={reset} style={{ ...btnStyle, background: '#fff', color: '#2E4057', border: '1px solid #D0D0D0' }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Stage: importing */}
        {stage === 'importing' && (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
            Importing transactions...
          </div>
        )}

        {/* Stage: done */}
        {stage === 'done' && result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: '#F1F8E9', border: '1px solid #C5E1A5', borderRadius: '6px', padding: '1rem' }}>
              <div style={{ fontWeight: 600, color: '#2E7D32', marginBottom: '0.5rem' }}>Import complete</div>
              <div style={{ fontSize: '0.85rem', color: '#444', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <div>Institution: <strong>{result.institution}</strong></div>
                <div>Pages: <strong>{result.pages}</strong></div>
                <div>Parsed: <strong>{result.parsed}</strong></div>
                <div>Staged: <strong>{result.inserted}</strong></div>
                <div>Duplicates skipped: <strong>{result.duplicates}</strong></div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <a href={'/dashboard/import/' + result.batchId} style={{ ...btnStyle, background: '#2E4057', textDecoration: 'none', textAlign: 'center', flex: 1 }}>
                Review transactions
              </a>
              <button onClick={reset} style={{ ...btnStyle, background: '#fff', color: '#2E4057', border: '1px solid #D0D0D0' }}>
                Import another
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {stage === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: '#FFF3F3', border: '1px solid #FFCDD2', borderRadius: '6px', padding: '0.75rem 1rem', color: '#C62828', fontSize: '0.9rem' }}>
              {error}
            </div>
            <button onClick={reset} style={btnStyle}>Try again</button>
          </div>
        )}

      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#2E4057', marginBottom: '0.4rem' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #D0D0D0', borderRadius: '6px', fontSize: '0.95rem', color: '#2E4057', background: '#fff', boxSizing: 'border-box' };
const btnStyle: React.CSSProperties = { background: '#2E4057', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.75rem 1.5rem', fontSize: '1rem', cursor: 'pointer', fontWeight: 600 };
