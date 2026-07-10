import { UserButton } from '@clerk/nextjs';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: '100vh', background: '#F5F5F5' }}>
      {/* Top navigation bar */}
      <nav style={{
        background: '#2E4057',
        padding: '0 2rem',
        height: '60px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: '1.1rem' }}>
            PFOS
          </span>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>
            Personal Financial Operating System
          </span>
        </div>
        <UserButton afterSignOutUrl="/sign-in" />
      </nav>

      {/* Main content */}
      <main style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
        {children}
      </main>
    </div>
  );
}
