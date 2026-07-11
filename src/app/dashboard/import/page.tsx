'use client';

import { useState } from 'react';

const ACCOUNTS = [
  { id: '', label: '— Select account —' },
  { id: 'wf-4184', label: 'Wells Fargo Checking ****4184' },
  { id: 'wf-8029', label: 'Wells Fargo Way2Save ****8029' },
  { id: 'wf-team', label: 'Wells Fargo Team Member Checking' },
  { id: 'usb-6820', label: 'U.S. Bank Gold Checking ****6820' },
  { id: 'usb-1353', label: 'U.S. Bank Smartly Joint ****1353' },
  { id: 'bofa-1961', label: 'BofA Checking ****1961' },
  { id: 'bofa-6951', label: 'BofA Savings ****6951' },
  { id: 'chase-2877', label: 'Chase Amazon Visa ****2877' },
  { id: 'sync-1629', label: 'Synchrony Sam\'s Club ****1629' },
  { id: 'citi-4621', label: 'Citi Costco Visa ****4621' },
  { id: 'bofa-9292', label: 'BofA Visa ****9292' },
];

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

interface UploadResult {
  batchId: string;
  institution: string;
  pages: number;
  parsed: number;
  inserted: number;
  duplicates: number;
}

export default function ImportPage() {
  const [file, setFile]           = useState<File | null>(null);
  const [accountId, setAccountId] = useState('');
  const [year, setYear]           = useState(new Date().getFullYear());
  const [month, setMonth]         = useState(new Date().getMonth() + 1);
  const [status, setStatus]       = useState<UploadStatus>('idle');
  const [result, setResult]       = useState<UploadResult | null>(null);
  const [error, setError]         = useState('');

  async function handleUpload() {
    if (!file || !accountId) {
      setError('Please select a file and account.');
      return;
    }

    setStatus('uploading');
    setError('');
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('accountId', accountId);
    formData.append('year', String(year));
    formData.append('month', String(month));

    try {
      const res = await fetch('/api/v1/import', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setResult(data);
      setStatus('success');
    } catch (err) {
      setError(String(err));
      setStatus('error');
    }
  }

  return (
    <div style={{ maxWidth: '640px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.8rem', color: '#2E4057', marginBottom: '0.5rem' }}>
          Import Statement
        </h1>
        <p style={{ color: '#666' }}>
          Upload a PDF bank or credit card statement to extract and stage transactions.
        </p>
      </div>

      <div style={{
        background: '#fff',
        borderRadius: '8px',
        padding: '2rem',
        border: '1px solid #E0E0E0',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
      }}>

        {/* File picker */}
        <div>
          <label style={labelStyle}>Statement PDF</label>
          <input
            type="file"
            accept=".pdf"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            style={inputStyle}
          />
          {file && (
            <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.4rem' }}>
              {file.name} ({(file.size / 1024).toFixed(0)} KB)
            </div>
          )}
        </div>

        {/* Account selector */}
        <div>
          <label style={labelStyle}>Account</label>
          <select
            value={accountId}
            onChange={e => setAccountId(e.target.value)}
            style={inputStyle}
          >
            {ACCOUNTS.map(a => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </div>

        {/* Statement period */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>Statement Month</label>
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              style={inputStyle}
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Statement Year</label>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              style={inputStyle}
            >
              {[2024, 2025, 2026].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: '#FFF3F3', border: '1px solid #FFCDD2',
            borderRadius: '6px', padding: '0.75rem 1rem',
            color: '#C62828', fontSize: '0.9rem',
          }}>
            {error}
          </div>
        )}

        {/* Success */}
        {status === 'success' && result && (
          <div style={{
            background: '#F1F8E9', border: '1px solid #C5E1A5',
            borderRadius: '6px', padding: '1rem',
          }}>
            <div style={{ fontWeight: 600, color: '#2E7D32', marginBottom: '0.5rem' }}>
              ✅ Import complete
            </div>
            <div style={{ fontSize: '0.85rem', color: '#444', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div>Institution: <strong>{result.institution}</strong></div>
              <div>Pages: <strong>{result.pages}</strong></div>
              <div>Transactions parsed: <strong>{result.parsed}</strong></div>
              <div>Staged: <strong>{result.inserted}</strong></div>
              <div>Duplicates skipped: <strong>{result.duplicates}</strong></div>
              <div style={{ marginTop: '0.5rem' }}>
                Batch ID: <code style={{ fontSize: '0.8rem' }}>{result.batchId}</code>
              </div>
            </div>
            
              href={`/dashboard/import/${result.batchId}`}
              style={{
                display: 'inline-block', marginTop: '1rem',
                background: '#2E4057', color: '#fff',
                padding: '0.5rem 1rem', borderRadius: '6px',
                textDecoration: 'none', fontSize: '0.9rem',
              }}
            >
              Review staged transactions →
            </a>
          </div>
        )}

        {/* Upload button */}
        <button
          onClick={handleUpload}
          disabled={status === 'uploading' || !file || !accountId}
          style={{
            background: status === 'uploading' ? '#999' : '#2E4057',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            cursor: status === 'uploading' ? 'not-allowed' : 'pointer',
            fontWeight: 600,
          }}
        >
          {status === 'uploading' ? 'Processing...' : 'Upload & Import'}
        </button>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.85rem',
  fontWeight: 600,
  color: '#2E4057',
  marginBottom: '0.4rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.6rem 0.75rem',
  border: '1px solid #D0D0D0',
  borderRadius: '6px',
  fontSize: '0.95rem',
  color: '#2E4057',
  background: '#fff',
  boxSizing: 'border-box',
};
