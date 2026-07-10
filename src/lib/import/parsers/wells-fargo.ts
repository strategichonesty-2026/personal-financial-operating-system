import type { ParsedTransaction, StatementParser, StatementPeriod } from './types';

// Wells Fargo checking/savings statement format:
// Date | Check# | Description | Deposits/Credits | Withdrawals/Debits | Balance
// Date format: M/DD (no year — infer from statement period)
// Example row: "1/15 PURCHASE COSTCO WHSE 500.00 1,234.56"

export const WellsFargoParser: StatementParser = {
  institution: 'wells_fargo',

  parse(text: string, period: StatementPeriod): ParsedTransaction[] {
    const results: ParsedTransaction[] = [];
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // Match lines starting with M/DD date pattern
    // Captures: date, description, and one or two dollar amounts at end
    const rowRegex = /^(\d{1,2}\/\d{2})\s+(.+?)\s+(\d{1,3}(?:,\d{3})*\.\d{2})(?:\s+(\d{1,3}(?:,\d{3})*\.\d{2}))?$/;

    for (const line of lines) {
      const match = line.match(rowRegex);
      if (!match) continue;

      const [, dateStr, description, amount1, amount2] = match;

      // Parse date — no year on WF statements, infer from period
      const [monthStr, dayStr] = dateStr.split('/');
      const month = parseInt(monthStr, 10);
      const day = parseInt(dayStr, 10);

      // If transaction month is after statement month, it's prior year
      // (e.g. Dec statement may have Nov transactions)
      let year = period.year;
      if (month > period.month) {
        year = period.year - 1;
      }

      const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      // WF layout: if two amounts → first=transaction, second=balance
      //            if one amount  → it's the transaction amount
      let txnAmountStr: string;
      let balanceStr: string | undefined;

      if (amount2) {
        txnAmountStr = amount1;
        balanceStr = amount2;
      } else {
        txnAmountStr = amount1;
      }

      const amountCents = Math.round(
        parseFloat(txnAmountStr.replace(/,/g, '')) * 100
      );

      const balanceCents = balanceStr
        ? Math.round(parseFloat(balanceStr.replace(/,/g, '')) * 100)
        : undefined;

      // Determine direction from keywords in description
      const desc = description.toUpperCase();
      const isCredit =
        desc.includes('DEPOSIT') ||
        desc.includes('DIRECT DEP') ||
        desc.includes('PAYROLL') ||
        desc.includes('ZELLE FROM') ||
        desc.includes('TRANSFER IN') ||
        desc.includes('REFUND') ||
        desc.includes('INTEREST PAID') ||
        desc.includes('CASHBACK');

      results.push({
        date: isoDate,
        rawDescription: description.trim(),
        amountCents,
        direction: isCredit ? 'credit' : 'debit',
        balance: balanceCents,
      });
    }

    return results;
  },
};
