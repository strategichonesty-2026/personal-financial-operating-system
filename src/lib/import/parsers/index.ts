import type { StatementParser } from './types';
import { WellsFargoParser } from './wells-fargo';

export const parsers: Record<string, StatementParser> = {
  wells_fargo: WellsFargoParser,
  // us_bank:     USBankParser,    // Step 9
  // bofa:        BofAParser,      // Step 9
  // chase:       ChaseParser,     // Step 9
  // synchrony:   SynchronyParser, // Step 9
  // citi:        CitiParser,      // Step 9
};

export function getParser(institution: string): StatementParser | null {
  return parsers[institution] ?? null;
}

export * from './types';
