import type { StatementParser } from './types';
import { WellsFargoParser } from './wells-fargo';
import { CitiParser }       from './citi';
import { SynchronyParser }  from './synchrony';
import { ChaseParser }      from './chase';
import { USBankParser }     from './us-bank';
import { parseBofa }        from './bofa';

export const parsers: Record<string, StatementParser> = {
  wells_fargo: WellsFargoParser,
  citi:        CitiParser,
  synchrony:   SynchronyParser,
  chase:       ChaseParser,
  us_bank:     USBankParser,
  bofa:         { institution: 'bofa', parse: () => [] },
  wf_credit:   { institution: 'wf_credit', parse: () => [] },
  usb_credit:  { institution: 'usb_credit', parse: () => [] },
};

export function getParser(institution: string): StatementParser | null {
  return parsers[institution] ?? null;
}

export * from './types';
