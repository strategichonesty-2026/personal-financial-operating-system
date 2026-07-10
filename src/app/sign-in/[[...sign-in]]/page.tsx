import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#1A1A2E',
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ color: '#fff', marginBottom: '2rem', fontSize: '1.5rem' }}>
          PFOS — Personal Financial Operating System
        </h1>
        <SignIn />
      </div>
    </main>
  );
}
