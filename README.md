# BlockID.au — Startup Value Index

**Startup Value Index … by BlockID.** One evidence-linked score for every Australian startup —
evaluators (investors, accelerators, advisors) pay for the workspace, the reports and the API;
founders score for free and can unlock the full Trusted Business Report for A$3.

**Current release:** `v3.16.0` (2026-09-19) · **Live:** https://blockid.au · **Status:** https://blockid.au/status
**Entities (deliberate split):** marketing = PPL Food PTY LTD · billing / legal / invoices / JSON-LD = Auschain PTY LTD (ACN 659 615 111 · ABN 79 659 615 111), Sydney NSW, GST-registered.
**Credentials:** Founder Institute · Spacecubed AI Fellowship · NVIDIA Inception (no others are claimed).

---

## What the product is

- **SVI — 8 public dimensions** FTV · MPC · PTD · TRE · CGH · IRI · LCO · SVM, each owned by one C-Level agent
  and scored from a 13-criteria internal rubric (`web/src/lib/svi-analysis.ts`, `dimension-owners.ts`).
  Evidence confidence is capped by its origin and an L0–L5 ABN verification multiplier (`/methodology`);
  calibration backtest v0 published at `/methodology/calibration` (N = 49, ρ 0.76 round / 0.94 valuation).
- **Trusted Business Report v2** — 8 chapters, deterministic SVG visuals, AUD valuation range calibrated to AU
  medians; A$3 per startup for anyone, included in evaluator plan quotas (`/tbr/demo`).
- **Evaluator surfaces** — deal flow, Investor Dossier, versioned assessments, program intake link `/apply/[slug]`,
  batch scoring + LP report, weekly Progress Radar, Evaluator API v1 with Slack / Affinity / Airtable destinations.
- **Founder surfaces** — `/analyze` (deck, website or idea in one field), Money Finder (AU grants + programs,
  Founder Radar), data room, cap table / ESOP / vesting, dividend + FY tax statements, investor links, 12-phase
  guided journey on the canonical 8-stage vocabulary.
- **11 C-Level AI agents** (CTO / CFO / CPO / CMO / CRO / CLO / CHRO / CISO / CDO / COO + Customer Success —
  roster `web/content/team-roster.json`) run the daily research / report crons and power customer reports.

## Pricing (GST-inclusive AUD; source of truth `docs/ops/pricing-truth.md` + `web/src/config/pricing/plans.csv`)

| Segment | Plans |
|---|---|
| Founders | Free · Starter A$29/mo · Growth A$69/mo · Startup Package A$149 once (+ 25 credits) |
| Evaluators | Scout A$79 · Firm A$149 · Program A$349 (7-day card-required trial) · Fund A$999 · Intake link A$249 · Index API A$299 |
| Accelerators | Cohort 25 A$5K/yr · Cohort 100 A$15K/yr |
| Anyone | Trusted Business Report A$3 per startup · credit packs (1 credit ≈ A$1 list) |

All payments run through the single BlockID Stripe account (resellers never get their own). No prices on the home page (G17).

---

## Tech stack

| Layer | Choice |
|---|---|
| Web | Next.js 16 App Router · standalone **webpack** build (`next build --webpack`) · port 4001 behind system nginx + Cloudflare · systemd watchdog |
| Backend | Route handlers under `web/src/app/api/**` (650+ handlers; every mutating route wrapped by `apiRoute()` and hash-chain audited) |
| DB | **Self-hosted Supabase** Postgres (`supabase-db` container) · migrations `web/supabase/migrations/0001…0412` applied **by hand** and recorded in `schema_migrations` |
| Auth | Google sign-in (server-side OAuth redirect + GIS popup) · magic link · password · fail-closed `blockid_session` cookie |
| Billing | Stripe (one account) · webhooks · Billing Portal · GST-inclusive prices · `plans.csv` → `plans.generated.ts` |
| AI | DeepInfra-first report chain → Anthropic / Gemini → Claude CLI fallback → Groq; daily free-model refresh (`content/reports/ai-free-models.json`); provider health on `/api/status.ai` |
| Blockchain | Private EVM (Anvil chainId 420) + Otterscan explorer — optional, off-chain-first vesting; verifiable credentials from `/id/[slug]` |
| Ops | Bare-metal `web/scripts/deploy-live.sh` (12 gates) · **never Docker for the app, never GitLab CI / GitHub Actions** · crontab `web/scripts/crontab.production` · Telegram alerts with e-mail fallback |

**Surface (as-shipped 2026-09-19):** 369 pages · 653 route handlers · 412 numbered migrations · live QA 191 checks · link check 525 pages / 0 broken.

---

## Quick start

```bash
cd web
npm ci
cp .env.example .env            # Supabase, Stripe, AI keys — see docs/API-REFERENCE.md appendix
npm run dev                     # http://localhost:4001
```

The CSP has no `unsafe-eval`, so React dev mode does not hydrate — test interactivity against a production build
or on the live site (`docs/ops/deploy.md`).

## Test

```bash
cd web
npm run typecheck               # tsc --noEmit (heap 8 GB) — must be 0 errors
npm run lint                    # eslint — 0 errors (warnings allowed)
npm test                        # vitest — colocated *.test.ts(x) are authoritative (~37k tests)
npm run e2e:smoke               # Playwright smoke tier
npm run qa:live                 # live QA suite against production — provisions + erases its own account (docs/ops/live-qa.md)
node scripts/link-check.mjs --base https://blockid.au --include-sitemap   # docs/ops/link-check.md
```

## Deploy (bare metal, the server is production)

```bash
cd web
DEPLOY_NOTE="what shipped" bash scripts/deploy-live.sh      # 12 gates: gitleaks → env → DB/Redis → tsc → eslint → vitest → build → temp-port smoke + e2e + link check → DB query → port swap → live verify (bundle SHA) → hydrated smoke
bash scripts/deploy-live.sh --wait                           # queue behind a running deploy (one at a time, wait for a peer session)
bash scripts/deploy-live.sh --rollback [--dry-run]           # previous release back
```

Runbook: `docs/ops/deploy.md`. After every deploy: review → test → fix before the next phase.

## Migrations, backups, restore

```bash
cd web
scripts/db/apply-migration.sh supabase/migrations/0413_x.sql   # the only supported way; records the ledger + NOTIFY pgrst
node scripts/db/migration-status.mjs --strict                  # release gate: nothing pending
../scripts/db/restore-drill.sh --dry-run                       # weekly drill runs Sun 03:45 UTC (docs/runbooks/db-restore.md)
```

Off-site backups need a one-time founder authorisation: `node --env-file=web/.env scripts/db-backup-offsite-auth.mjs`.

## Crons

`web/scripts/crontab.production` is the single source (`crontab web/scripts/crontab.production`). Three families:
**system** (watchdog, DDNS, token guardian, off-peak auto-deploy, backups + restore drill, error digest + latency
sampler, link check, funnel report, pilot expiry), the **daily C-Level pipeline** (research → reports → CEO summary
→ orchestrator implementing-plan loop, 8× daily), and **weekly** jobs (live QA Sun 07:00 UTC, comparables ingest,
external signals, backtest). Catalogue: `docs/ops/crontab-setup.md`. Cloud routines run separately
(`docs/runbooks/anthropic-cloud-routines.md`).

---

## Where the docs live

| Topic | File |
|---|---|
| **Source of truth** (goals G1–G17, requirements, human-blocked queue) | [`docs/plans/SOURCE-OF-TRUTH.md`](./docs/plans/SOURCE-OF-TRUTH.md) |
| Roadmap (goal tables) | [`ROADMAP.md`](./ROADMAP.md) · public `/roadmap` |
| Docs index (every document, last-verified date) | [`docs/README.md`](./docs/README.md) |
| Architecture (living, rendered by the CEO loop) | [`web/content/reports/architecture.md`](./web/content/reports/architecture.md) · [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| Ops runbooks | [`docs/ops/`](./docs/ops/) — deploy, live QA, link check, SLO, crontab, migrations, AI providers, pricing truth, Stripe env audit |
| Incident runbooks | [`docs/runbooks/`](./docs/runbooks/) — DB restore, secret leak / rotation, RLS bypass, Privacy Act 72 h clock, VC issuer keys |
| Design contract | [`docs/design/unicorn-template.md`](./docs/design/unicorn-template.md) · [`docs/design-system.md`](./docs/design-system.md) |
| API reference | [`docs/API-REFERENCE.md`](./docs/API-REFERENCE.md) · `/developers/api` · `/api/openapi.json` |
| Web app changelog | [`web/CHANGELOG.md`](./web/CHANGELOG.md) · public `/changelog` |
| Release manifest | [`web/content/reports/version.json`](./web/content/reports/version.json) (→ `/api/status`, footer badge) |
| Goals, PRD, GTM, blueprint (strategy, older) | [`GOALS.md`](./GOALS.md) · [`blockid_prd.md`](./blockid_prd.md) · [`blockid_gtm_sales_first_v1.md`](./blockid_gtm_sales_first_v1.md) · [`blockid_master_project_blueprint_v1.md`](./blockid_master_project_blueprint_v1.md) |

_Do not commit secrets. `.env*` files are gitignored; the repo is public (`docs/runbooks/secret-leak.md`)._

---

## Data and compliance posture

- **Data principle:** the startup owns its data; BlockID stores it only to process it and give the AI the best
  context for that case. Founder-consented access tiers control who sees what.
- Privacy policy v2.2 (`/legal/privacy`), APP 1 / 3 / 5 / 6 / 8 / 11 / 12 covered, OAIC pathway, NDB scheme wired,
  weekly retention sweep mirroring the policy table.
- ATO tax invoice at checkout; prices GST-inclusive.
- Essential Eight direction · Zod on public POSTs · rate-limit buckets · fail-closed auth · constant-time cron auth ·
  SSRF guards on every outbound fetch · `redactPii` logs · gitleaks pre-commit + deploy gate 1.
