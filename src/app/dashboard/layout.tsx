import { UserButton } from '@clerk/nextjs';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#F5F5F5' }}>
      <nav style={{ background: '#2E4057', padding: '0 2rem', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <a href="/dashboard" style={{ color: '#fff', fontWeight: 700, fontSize: '1.1rem', textDecoration: 'none' }}>PFOS</a>
          <a href="/dashboard/import" style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.9rem', textDecoration: 'none' }}>Upload</a>
          <a href="/dashboard/review" style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.9rem', textDecoration: 'none' }}>Review</a>
          <a href="/dashboard/reconciliation" style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.9rem', textDecoration: 'none' }}>Check Statements</a>
          <a href="/dashboard/summary" style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.9rem', textDecoration: 'none' }}>Summary</a>
          <a href="/dashboard/reports/trial-balance" style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', textDecoration: 'none' }}>Trial Balance</a>
          <a href="/dashboard/reports/ledger" style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.9rem', textDecoration: 'none' }}>Transactions</a>
          <a href="/dashboard/reports/coverage" style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.9rem', textDecoration: 'none' }}>My Statements</a>
          <a href="/dashboard/admin" style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', textDecoration: 'none' }}>Admin</a>
        </div>
        <UserButton afterSignOutUrl="/sign-in" />
      </nav>
      <main style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </main>
    </div>
  );
}
