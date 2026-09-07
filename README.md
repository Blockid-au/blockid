# BlockID.au

**Answer the three questions every founder faces:** _Where am I now? What am I worth? What should I do next?_

BlockID.au scores your startup on the 8-dimensional **Startup Value Index (SVI)** in 60 seconds, then guides you through 12 phases (Vision → Funding) with 11 C-Level AI agents, 17 free tools, and a 9-chapter investor-ready pack.

**Current version:** `v3.9.23` · **Entity:** Auschain PTY LTD · ACN 659 615 111 · ABN 79 659 615 111 · Sydney NSW · GST-registered

---

## What's shipped (v3.9.23)

- **SVI score in 60 seconds** — hero H1 "Know your startup's SVI score in 60 seconds." (`/score`)
- **8 SVI dimensions** — FTV / MPC / PTD / TRE / CGH / IRI / LCO / SVM (see `web/src/lib/svi-analysis.ts`)
- **11 C-Level AI agents** on cron — CEO / CTO / CFO / CMO / CPO / CRO / CLO / CHRO / CISO / COO / CDO
- **9-chapter investor pack** — Cover · Exec Summary · SVI Criteria · Cap Table · Traction · C-Level Financial Advisory · Forecast · Exit Strategy · Evidence Completeness (see `web/src/lib/pdf/investor-pack.tsx`)
- **17 free tools** — grouped by pillar under `/tools/*` (surfaced in the Free Tools nav dropdown)
- **12-chapter guided journey** — `/guide/01-vision` … `/guide/12-funding` (canonical growth phases in `web/src/lib/growth/phase-taxonomy.ts`)
- **3 sample listings** — SAMPLE-01 / SAMPLE-02 / SAMPLE-03 seeded for demo browsing
- **Under-promised capabilities now surfaced** at `/features` — cohort percentile, per-investor tracked share links, ATO tax invoice, dividend engine, 17 free tools, 12-chapter guide, evidence completeness, LP anonymisation
- **Universal 3-rung pricing ladder** — Free / Growth A$99/mo / Pro A$299/mo (see Pricing)
- **Private EVM blockchain** — Anvil chainId 420 + Otterscan explorer at port 5173 (Cosmos SDK remains long-term roadmap)

---

## Pricing (public ladder)

| Rung | Plan | Monthly | Highlights |
|---|---|---|---|
| Free | Free | A$0 | Free SVI score + 10-page mentor report + starter tools |
| 1 | **Growth** | **A$99/mo** | Investor pack, cap table, cohort percentile, evidence vault |
| 2 | **Pro** | **A$299/mo** | Everything in Growth + white-label PDF, dividend engine, share management |

**Contact Sales row** (custom quotes): Accelerator from A$500 · VC from A$349 · Enterprise custom.
**One-off:** `founder_package` A$149 grandfathered · A$3 One-Click Report.
**Sunset:** Founding-50 SUNSET 2026-09-01 — Stripe SKU preserved for grandfathered renewals only.

All prices GST-exclusive; ATO tax invoice issued at checkout.

---

## Tech stack

| Layer | Choice |
|---|---|
| Web | Next.js 16 App Router · standalone webpack build · port 4001 · systemd watchdog |
| Backend | Route handlers (`web/src/app/api/**`) — 495 API routes |
| DB | Self-hosted Supabase (Postgres) · 24 migrations · latest `20260907_sample_listings_seed.sql` |
| Auth | Google OAuth · fail-closed session cookie (Secure in prod) |
| Blockchain (current) | Private EVM · Anvil chainId 420 · Otterscan explorer |
| Blockchain (future) | Cosmos SDK / Tendermint — long-term roadmap only |
| AI | Registry (`ai-provider-registry.json`) + free-pool fallback chain |
| Ops | Bare-metal `deploy-live.sh` 12-gate CI/CD (**no Docker**, **no GitLab CI**, **no GitHub Actions**) |

**Surface counts (as-shipped):** 339 pages · 495 API routes · 24 migrations.

---

## Quick start

```bash
cd web
npm ci
cp .env.example .env.local   # populate Supabase, Stripe, AI keys
npm run dev                  # http://localhost:4001
```

## Test

```bash
cd web
npm run typecheck            # tsc --noEmit — required to be 0 pre-deploy
npm test                     # vitest run — colocated tests authoritative
npm run e2e:smoke            # Playwright smoke
```

## Deploy

Production deploy is **bare-metal**, gated by `web/scripts/deploy-live.sh` (12 gates including tsc, unit, smoke, hydrated post-deploy check). Never Docker, never CI/CD. Server IS production.

```bash
cd web && bash scripts/deploy-live.sh
```

---

## Where the docs live

| Topic | File |
|---|---|
| Architecture | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| SVI scoring goals | [`GOALS.md`](./GOALS.md) |
| Roadmap | [`ROADMAP.md`](./ROADMAP.md) |
| PRD (canonical) | [`blockid_prd.md`](./blockid_prd.md) |
| Blueprint (strategic vision) | [`blockid_master_project_blueprint_v1.md`](./blockid_master_project_blueprint_v1.md) |
| GTM plan | [`blockid_gtm_sales_first_v1.md`](./blockid_gtm_sales_first_v1.md) |
| Knowledge base index | [`KNOWLEDGE_BASE_INDEX.md`](./KNOWLEDGE_BASE_INDEX.md) |
| Source of truth (plans + G-goals) | [`docs/plans/SOURCE-OF-TRUTH.md`](./docs/plans/SOURCE-OF-TRUTH.md) |
| Financial projections | [`FINANCIAL_PROJECTIONS_3YEAR.md`](./FINANCIAL_PROJECTIONS_3YEAR.md) |
| ESOP design | [`ESOP_DESIGN.md`](./ESOP_DESIGN.md) |
| Web app changelog | [`web/CHANGELOG.md`](./web/CHANGELOG.md) |

_Do not commit secrets. `.env*` files are gitignored._

---

## AU compliance posture

- APP 1 / 3 / 5 / 6 / 8 / 11 / 12 covered · OAIC complaint pathway published · NDB scheme wired
- ATO tax invoice at checkout · GST-exclusive pricing
- Essential Eight ML1 direction · Zod on 5 public POSTs · rate-limit buckets · fail-closed auth · `redactPii` cron logs · gitleaks pre-commit
