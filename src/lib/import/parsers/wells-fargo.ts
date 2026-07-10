import type { ParsedTransaction, StatementParser, StatementPeriod } from './types';

export const WellsFargoParser: StatementParser = {
  institution: 'wells_fargo',

  parse(text: string, period: StatementPeriod): ParsedTransaction[] {
    const results: ParsedTransaction[] = [];
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    const rowRegex = /^(\d{1,2}\/\d{2})\s+(.+?)\s+(\d{1,3}(?:,\d{3})*\.\d{2})(?:\s+(\d{1,3}(?:,\d{3})*\.\d{2}))?$/;

    for (const line of lines) {
      const match = line.match(rowRegex);
      if (!match) continue;

      const dateStr    = match[1] ?? '';
      const description = match[2] ?? '';
      const amount1    = match[3] ?? '';
      const amount2    = match[4];

      const parts = dateStr.split('/');
      const month = parseInt(parts[0] ?? '0', 10);
      const day   = parseInt(parts[1] ?? '0', 10);
      if (!month || !day) continue;

      let year = period.year;
      if (month > period.month) year = period.year - 1;

      const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      const txnAmountStr = amount1;
      const balanceStr   = amount2;

      const amountCents = Math.round(
        parseFloat(txnAmountStr.replace(/,/g, '')) * 100
      );

      const balanceCents = balanceStr
        ? Math.round(parseFloat(balanceStr.replace(/,/g, '')) * 100)
        : undefined;

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
