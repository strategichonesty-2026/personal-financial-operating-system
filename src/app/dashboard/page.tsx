import { requireAuth } from '@/lib/auth';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';

export default async function DashboardPage() {
  const user = await requireAuth();

  // Log dashboard visit
  await logEvent({
    userId: user.id,
    eventType: AUDIT_EVENTS.REPORT_GENERATED,
    entityType: 'dashboard',
    payload: { view: 'dashboard_home' },
  });

  return (
    <div>
      {/* Welcome header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.8rem', color: '#2E4057', marginBottom: '0.5rem' }}>
          Welcome back, {user.fullName.split(' ')[0]}
        </h1>
        <p style={{ color: '#666' }}>
          Your financial operating system — Milestone 1 Foundation
        </p>
      </div>

      {/* Status cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2rem',
      }}>
        <StatusCard
          title="Authentication"
          status="✅ Active"
          detail={`Signed in as ${user.email}`}
          color="#2ECC71"
        />
        <StatusCard
          title="Database"
          status="✅ Connected"
          detail="Neon Postgres — us-east-2"
          color="#2ECC71"
        />
        <StatusCard
          title="Audit Log"
          status="✅ Running"
          detail="All events recorded"
          color="#2ECC71"
        />
        <StatusCard
          title="Import Pipeline"
          status="⏳ Milestone 3"
          detail="PDF/CSV import coming soon"
          color="#F39C12"
        />
      </div>

      {/* Milestone progress */}
      <div style={{
        background: '#fff',
        borderRadius: '8px',
        padding: '1.5rem',
        border: '1px solid #E0E0E0',
      }}>
        <h2 style={{ fontSize: '1.1rem', color: '#2E4057', marginBottom: '1rem' }}>
          Build Progress
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {MILESTONES.map((m) => (
            <MilestoneRow key={m.number} {...m} />
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusCard({
  title, status, detail, color,
}: {
  title: string; status: string; detail: string; color: string;
}) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: '8px',
      padding: '1.5rem',
      border: '1px solid #E0E0E0',
      borderLeft: `4px solid ${color}`,
    }}>
      <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '0.5rem' }}>
        {title}
      </div>
      <div style={{ fontWeight: 600, color: '#2E4057', marginBottom: '0.25rem' }}>
        {status}
      </div>
      <div style={{ fontSize: '0.85rem', color: '#666' }}>{detail}</div>
    </div>
  );
}

function MilestoneRow({
  number, name, status,
}: {
  number: string; name: string; status: 'complete' | 'active' | 'pending';
}) {
  const colors = {
    complete: { bg: '#E8F5E9', text: '#2ECC71', label: 'Complete' },
    active: { bg: '#E3F2FD', text: '#2196F3', label: 'In Progress' },
    pending: { bg: '#F5F5F5', text: '#999', label: 'Pending' },
  };
  const c = colors[status];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <span style={{ fontFamily: 'monospace', color: '#888', minWidth: '30px' }}>
        {number}
      </span>
      <span style={{ flex: 1, color: status === 'pending' ? '#999' : '#2E4057' }}>
        {name}
      </span>
      <span style={{
        background: c.bg, color: c.text,
        padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem',
      }}>
        {c.label}
      </span>
    </div>
  );
}

const MILESTONES = [
  { number: 'M0', name: 'Data Discovery', status: 'complete' as const },
  { number: 'M1', name: 'Project Foundation', status: 'active' as const },
  { number: 'M2', name: 'Accounting Foundation', status: 'pending' as const },
  { number: 'M3', name: 'Import Pipeline', status: 'pending' as const },
  { number: 'M4', name: 'Transaction Review & Posting', status: 'pending' as const },
  { number: 'M5', name: 'AI Categorization', status: 'pending' as const },
  { number: 'M6', name: 'Bank Reconciliation', status: 'pending' as const },
  { number: 'M7', name: 'Financial Reports', status: 'pending' as const },
];
