# PFOS — Personal Financial Operating System

> "An accounting engine with personal finance features."

Professional personal accounting platform with double-entry accounting,
AI-assisted categorization, bank reconciliation, and financial reporting.

---

## Current Status: Milestone 1 — Foundation ✅

## Stack
| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript strict |
| Database | Neon Postgres + Drizzle ORM |
| Auth | Clerk |
| Storage | Cloudflare R2 |
| AI | Claude API (Sonnet) |
| Hosting | Vercel |

## Setup

### 1. Clone and install
```bash
git clone https://github.com/strategichonesty-2026/personal-financial-operating-system
cd personal-financial-operating-system
npm install
```

### 2. Environment variables
```bash
cp .env.example .env.local
# Fill in all values in .env.local
```

### 3. Run database migrations
```bash
npm run db:push
```

### 4. Start development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Available Commands
```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run typecheck    # TypeScript check
npm run lint         # ESLint
npm run db:push      # Push schema to Neon
npm run db:studio    # Open Drizzle Studio (DB browser)
npm run db:generate  # Generate migration files
```

## Health Check
```
GET /api/v1/health
```

## Documentation
See `/docs` folder for full architecture and design documentation.

## Milestone Roadmap
- ✅ M0: Data Discovery
- ✅ M1: Foundation
- ⏳ M2: Accounting Foundation
- ⏳ M3: Import Pipeline
- ⏳ M4: Transaction Review
- ⏳ M5: AI Categorization
- ⏳ M6: Bank Reconciliation
- ⏳ M7: Financial Reports
