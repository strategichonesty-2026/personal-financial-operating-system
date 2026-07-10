export interface ParsedTransaction {
  date: string;          // ISO format: YYYY-MM-DD
  rawDescription: string;
  amountCents: number;   // always positive integer
  direction: 'debit' | 'credit';
  balance?: number;      // running balance in cents if available
}

export interface StatementPeriod {
  year: number;
  month: number; // 1-12
}

export interface StatementParser {
  institution: string;
  parse(text: string, period: StatementPeriod): ParsedTransaction[];
}
