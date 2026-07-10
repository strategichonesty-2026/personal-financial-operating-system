import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// Validate env at startup
if (!process.env['DATABASE_URL']) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// Neon serverless HTTP connection
const sql = neon(process.env['DATABASE_URL']);

// Drizzle ORM instance with full schema
export const db = drizzle(sql, { schema });

// Export schema for use in services
export { schema };

// Export types
export type Database = typeof db;
