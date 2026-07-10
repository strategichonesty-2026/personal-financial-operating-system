// Auth abstraction layer
// All auth calls go through this interface
// Swap Clerk for any other provider without touching business logic

import { auth, currentUser } from '@clerk/nextjs/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

export type AuthUser = {
  id: string;         // PFOS internal user ID
  clerkId: string;
  email: string;
  fullName: string;
  role: string;
};

// Get current authenticated user from DB
// Returns null if not authenticated
export async function getCurrentUser(): Promise<AuthUser | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.clerkId, userId))
    .limit(1);

  return user[0] ?? null;
}

// Require authentication — throws if not authenticated
// Use in API routes and Server Actions
export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('UNAUTHORIZED');
  }
  return user;
}

// Sync Clerk user to PFOS database on first login
// Called from webhook or sign-in event
export async function syncUserToDatabase(): Promise<AuthUser> {
  const clerkUser = await currentUser();
  if (!clerkUser) throw new Error('No Clerk user found');

  const email = clerkUser.emailAddresses[0]?.emailAddress ?? '';
  const fullName = `${clerkUser.firstName ?? ''} ${clerkUser.lastName ?? ''}`.trim();

  // Upsert user
  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.clerkId, clerkUser.id))
    .limit(1);

  if (existing[0]) return existing[0];

  const newUser = await db
    .insert(schema.users)
    .values({
      clerkId: clerkUser.id,
      email,
      fullName,
      role: 'owner',
    })
    .returning();

  if (!newUser[0]) throw new Error('Failed to create user');
  return newUser[0];
}
