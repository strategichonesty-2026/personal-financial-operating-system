// Central schema export — all tables exported from here
// Drizzle Kit reads this file for migrations

export * from './users';
export * from './accounts';
export * from './audit';
export * from './journal-entries';

// Future milestone schemas:
// export * from './import-batches';      // Milestone 3
// export * from './staged-transactions'; // Milestone 3
// export * from './merchant-patterns';   // Milestone 5
// export * from './user-rules';          // Milestone 5
