import { db } from '../index';
import { merchantPatterns } from '../schema';

const patterns = [
  // ── Groceries ────────────────────────────────────────────────────────────
  { pattern: 'SAM%CLUB%',          merchantName: "Sam's Club",          defaultCategoryCode: '5021', isTransfer: false },
  { pattern: 'SAMSCLUB%',          merchantName: "Sam's Club",          defaultCategoryCode: '5021', isTransfer: false },
  { pattern: 'COSTCO WHSE%',       merchantName: 'Costco Warehouse',    defaultCategoryCode: '5021', isTransfer: false },
  { pattern: 'WALMART%',           merchantName: 'Walmart',             defaultCategoryCode: '5021', isTransfer: false },
  { pattern: 'TARGET%',            merchantName: 'Target',              defaultCategoryCode: '5021', isTransfer: false },
  { pattern: 'WHOLE FOODS%',       merchantName: 'Whole Foods',         defaultCategoryCode: '5021', isTransfer: false },
  { pattern: 'TRADER JOE%',        merchantName: "Trader Joe's",        defaultCategoryCode: '5021', isTransfer: false },
  { pattern: 'ALDI%',              merchantName: 'Aldi',                defaultCategoryCode: '5021', isTransfer: false },

  // ── Fuel ─────────────────────────────────────────────────────────────────
  { pattern: 'COSTCO GAS%',        merchantName: 'Costco Gas',          defaultCategoryCode: '5031', isTransfer: false },
  { pattern: 'KWIK TRIP%',         merchantName: 'Kwik Trip',           defaultCategoryCode: '5031', isTransfer: false },
  { pattern: 'HOLIDAY STATION%',   merchantName: 'Holiday Station',     defaultCategoryCode: '5031', isTransfer: false },
  { pattern: 'BP%',                merchantName: 'BP Gas',              defaultCategoryCode: '5031', isTransfer: false },
  { pattern: 'SHELL%',             merchantName: 'Shell Gas',           defaultCategoryCode: '5031', isTransfer: false },

  // ── Online Shopping ───────────────────────────────────────────────────────
  { pattern: 'AMAZON MKTPL%',      merchantName: 'Amazon Marketplace',  defaultCategoryCode: '5061', isTransfer: false },
  { pattern: 'AMZN MKTP%',         merchantName: 'Amazon Marketplace',  defaultCategoryCode: '5061', isTransfer: false },

  // ── Subscriptions ─────────────────────────────────────────────────────────
  { pattern: 'AMAZON PRIME%',      merchantName: 'Amazon Prime',        defaultCategoryCode: '5071', isTransfer: false },
  { pattern: 'NETFLIX%',           merchantName: 'Netflix',             defaultCategoryCode: '5071', isTransfer: false },
  { pattern: 'SPOTIFY%',           merchantName: 'Spotify',             defaultCategoryCode: '5071', isTransfer: false },
  { pattern: 'APPLE.COM/BILL%',    merchantName: 'Apple Subscriptions', defaultCategoryCode: '5071', isTransfer: false },
  { pattern: 'YOUTUBE PREMIUM%',   merchantName: 'YouTube Premium',     defaultCategoryCode: '5071', isTransfer: false },

  // ── AI Tools (Schedule C deductible) ─────────────────────────────────────
  { pattern: 'OPENAI%',            merchantName: 'ChatGPT/OpenAI',      defaultCategoryCode: '6021', isTransfer: false },
  { pattern: 'ANTHROPIC%',         merchantName: 'Anthropic/Claude',    defaultCategoryCode: '6021', isTransfer: false },
  { pattern: 'GITHUB%',            merchantName: 'GitHub',              defaultCategoryCode: '6021', isTransfer: false },
  { pattern: 'VERCEL%',            merchantName: 'Vercel',              defaultCategoryCode: '6021', isTransfer: false },

  // ── Rent ─────────────────────────────────────────────────────────────────
  { pattern: 'NSM%COOPER%',        merchantName: 'Cooper/NSM',          defaultCategoryCode: '5011', isTransfer: false },
  { pattern: 'MR. COOPER%',        merchantName: 'Cooper/NSM',          defaultCategoryCode: '5011', isTransfer: false },

  // ── Solar ─────────────────────────────────────────────────────────────────
  { pattern: 'CONCERTFIN%',        merchantName: 'ConcertFin Solar',    defaultCategoryCode: '5041', isTransfer: false },

  // ── Phone / Internet ──────────────────────────────────────────────────────
  { pattern: 'T-MOBILE%',          merchantName: 'T-Mobile',            defaultCategoryCode: '5081', isTransfer: false },
  { pattern: 'COMCAST%',           merchantName: 'Xfinity',             defaultCategoryCode: '5082', isTransfer: false },
  { pattern: 'XFINITY%',           merchantName: 'Xfinity',             defaultCategoryCode: '5082', isTransfer: false },

  // ── Insurance ─────────────────────────────────────────────────────────────
  { pattern: 'NATIONWIDE%',        merchantName: 'Nationwide Auto',     defaultCategoryCode: '5091', isTransfer: false },

  // ── Auto Loan ─────────────────────────────────────────────────────────────
  { pattern: 'TD AUTO FINANCE%',   merchantName: 'TD Auto Finance',     defaultCategoryCode: '5101', isTransfer: false },

  // ── Investment ────────────────────────────────────────────────────────────
  { pattern: 'ACORNS INVEST%',     merchantName: 'Acorns Invest',       defaultCategoryCode: '1041', isTransfer: false },

  // ── Income ────────────────────────────────────────────────────────────────
  { pattern: 'WELLS FARGO BANK PAYRLL%', merchantName: 'Payroll',       defaultCategoryCode: '4011', isTransfer: false },
  { pattern: 'ZELLE%SABIN THAPA%', merchantName: 'Rental Income',       defaultCategoryCode: '4021', isTransfer: false },

  // ── Transfers (flag, do not categorize as income/expense) ────────────────
  { pattern: 'ZELLE%GOPU%BOA%',    merchantName: 'Zelle Transfer',      defaultCategoryCode: null,   isTransfer: true  },
  { pattern: 'ZELLE%COSTO%',       merchantName: 'Zelle Transfer',      defaultCategoryCode: null,   isTransfer: true  },
  { pattern: 'ONLINE TRANSFER%',   merchantName: 'Bank Transfer',       defaultCategoryCode: null,   isTransfer: true  },
  { pattern: 'BILL PAY%',          merchantName: 'Bill Payment',        defaultCategoryCode: null,   isTransfer: true  },
  { pattern: 'AUTOPAY%',           merchantName: 'AutoPay',             defaultCategoryCode: null,   isTransfer: true  },
  { pattern: 'PAYMENT%THANK YOU%', merchantName: 'CC Payment',          defaultCategoryCode: null,   isTransfer: true  },
];

export async function seedMerchantPatterns() {
  console.log('Seeding merchant patterns...');
  for (const p of patterns) {
    await db.insert(merchantPatterns).values(p).onConflictDoNothing();
  }
  console.log(`✅ ${patterns.length} merchant patterns seeded`);
}
