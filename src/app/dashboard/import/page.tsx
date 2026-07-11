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

interface AccountOption {
  id: string;
  label: string;
  last4: string | null;
  inst: string | null;
}

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
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [institution, setInstitution] = useState('');

  // Load real account UUIDs from DB on mount
  useEffect(() => {
    fetch('/api/v1/accounts')
      .then(r => r.json())
      .then(data => {
        if (!data.data?.accounts) return;
        const opts: AccountOption[] = (data.data.accounts as Array<{
          id: string; name: string; accountRef: string | null; institution: string | null; type: string;
        }>)
          .filter(a => a.type === 'asset' || a.type === 'liability')
          .map(a => ({
            id:    a.id,
            label: accountLabel(a.name, a.accountRef),
            last4: a.accountRef,
            inst:  instKeyFromDb(a.institution),
          }));
        setAccounts(opts);
      })
      .catch(() => { /* silently ignore — user can still pick manually */ });
  }, []);

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
        const match = accounts.find(a => a.last4 === data.accountLast4 && a.inst === data.institution);
        if (match) setAccountId(match.id);
      }
      if (data.year)  setYear(data.year);
      if (data.month) setMonth(data.month);
      if (data.institution) setInstitution(data.institution);

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
    if (institution) formData.append('institution', institution);

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
    setAccountId(''); setResult(null); setError(''); setInstitution('');
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

            {!detected?.institution && (
              <div>
                <label style={labelStyle}>Institution</label>
                <select value={institution} onChange={e => setInstitution(e.target.value)} style={inputStyle}>
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

            <div>
              <label style={labelStyle}>Confirm Account</label>
              <select value={accountId} onChange={e => setAccountId(e.target.value)} style={inputStyle}>
                <option value="">— Select account —</option>
                {accounts.length === 0
                  ? <option disabled>Loading accounts…</option>
                  : accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
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
              <button onClick={handleImport} disabled={!accountId || (!detected?.institution && !institution)} style={{ ...btnStyle, background: (accountId && (detected?.institution || institution)) ? '#2E4057' : '#999', flex: 1 }}>
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
