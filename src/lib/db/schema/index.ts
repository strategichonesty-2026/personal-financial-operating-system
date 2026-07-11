// Central schema export — all tables exported from here
// Drizzle Kit reads this file for migrations

export * from './users';
export * from './accounts';
export * from './audit';
export * from './journal-entries';

// Milestone 3 schemas:
export * from './import-batches';
export * from './staged-transactions';
export * from './merchant-patterns';

// Future milestone schemas:
// export * from './user-rules';          // Milestone 5
export { parserAudit } from './parser-audit';
export type { ParserAudit, NewParserAudit } from './parser-audit';

// Milestone 5 schemas:
export * from './reconciliations';
