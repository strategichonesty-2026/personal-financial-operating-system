'use client';
import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  sent: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, sent: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, sent: false };
  }

  async sendReport() {
    try {
      await fetch('/api/v1/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'error',
          page: window.location.pathname,
          message: 'Page crashed — user sent report',
          error_details: {
            message: this.state.error?.message,
            stack: this.state.error?.stack,
          },
        }),
      });
      this.setState({ sent: true });
    } catch {
      this.setState({ sent: true });
    }
  }

  override render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '60vh', gap: '1rem',
        fontFamily: 'sans-serif', textAlign: 'center', padding: '2rem'
      }}>
        <div style={{ fontSize: '2.5rem' }}>😕</div>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 600, color: '#2E4057', margin: 0 }}>
          Something didn&apos;t work as expected
        </h2>
        <p style={{ color: '#666', maxWidth: '400px', margin: 0 }}>
          We&apos;re sorry about that. You can send a report so we can fix it,
          or go back to the home page.
        </p>
        {!this.state.sent ? (
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
            <button
              onClick={() => this.sendReport()}
              style={{
                background: '#2E4057', color: '#fff', border: 'none',
                borderRadius: '6px', padding: '0.6rem 1.4rem',
                fontSize: '0.95rem', cursor: 'pointer'
              }}
            >
              Send Report
            </button>
            <a href="/dashboard" style={{
              background: '#eee', color: '#333', border: 'none',
              borderRadius: '6px', padding: '0.6rem 1.4rem',
              fontSize: '0.95rem', textDecoration: 'none', display: 'inline-block'
            }}>
              Go Home
            </a>
          </div>
        ) : (
          <div style={{ color: '#2E4057', fontWeight: 600 }}>
            ✅ Report sent — thank you! <a href="/dashboard" style={{ color: '#2E4057' }}>Go Home</a>
          </div>
        )}
      </div>
    );
  }
}
