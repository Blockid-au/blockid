# BlockID.au Module Architecture

## Module Map

Each module represents an independently deployable unit. Currently all run in one Next.js monolith, but the code is organized to enable future splitting.

### Module Boundaries

| Module | API Routes | Core Libs | Purpose |
|--------|-----------|-----------|---------|
| **auth** | /api/auth/* | lib/auth.ts, lib/rate-limit.ts | Authentication, sessions, passwords |
| **svi** | /api/rnd/*, /api/svi/*, /api/score | lib/svi-analysis.ts, lib/rnd-analysis.ts, lib/rnd-input.ts, lib/ai-client.ts | SVI scoring, R&D reports, AI analysis |
| **evidence** | /api/evidence/*, /api/website-tech-audit | lib/github-repo-audit.ts | Evidence vault, tech audits |
| **equity** | /api/cap-table/*, /api/equity/*, /api/vesting/*, /api/share-structure, /api/dividends | lib/vesting.ts, lib/share-structure.ts | Cap table, equity, vesting |
| **billing** | /api/credits/*, /api/stripe/* | lib/credits.ts, lib/pricing-data.ts | Payments, credits, subscriptions |
| **cron** | /api/cron/* | (uses libs from other modules) | Scheduled jobs, background tasks |
| **oauth** | /api/oauth/* | (uses lib/auth.ts) | GitHub, LinkedIn OAuth connectors |
| **admin** | /api/admin/* | (uses libs from other modules) | Admin dashboard, configuration |
| **blockchain** | /api/blockchain/*, /api/tokenization | (chain-specific) | Cosmos chain, tokens |

### Shared Dependencies

These libraries are used by multiple modules and would become shared packages:

| Package | Used By |
|---------|---------|
| `lib/supabase.ts` | ALL |
| `lib/auth.ts` | ALL (session checks) |
| `lib/credits.ts` | svi, evidence, billing |
| `lib/ai-client.ts` | svi, evidence, cron |
| `lib/email.ts` | auth, cron, svi |
| `lib/analytics.ts` | ALL (client-side) |

### Rules for Module Independence

1. A module MUST NOT import directly from another module's API routes
2. A module CAN import from shared libs (lib/)
3. Inter-module communication happens via API calls or shared database
4. Each module should have its own Supabase queries (not share query builders)
5. New features should be added to the correct module, not scattered

### Future: Independent Deployment

When ready to split, each module becomes its own container:
- `blockid-web` (pages + auth + billing)
- `blockid-ai` (svi + evidence AI analysis)
- `blockid-cron` (all cron jobs)
- `blockid-equity` (cap table + vesting + blockchain)

Nginx routes requests to the correct container based on URL prefix.
