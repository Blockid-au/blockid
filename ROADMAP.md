# BlockID.au + Startup Value Index — Master Roadmap

> **This is the single source of truth.** Every roadmap, plan, architecture diagram, or task list lives here or is linked from here. When in doubt, this file wins.

**Current version:** `0.5.1` (web) · queue `v1.3` · release `2026-06-21 v0.5.1` — Codex removed, auto-discover free models on rate-limit storm
**Last updated:** 2026-06-21 07:15 UTC

---

## 1. Canonical sources

| Topic | Source of truth | Owner |
|---|---|---|
| **Strategic vision (private capital markets trust layer)** | [`blockid_master_project_blueprint_v1.md`](./blockid_master_project_blueprint_v1.md) | Founder |
| **SVI scoring system goals** | [`GOALS.md`](./GOALS.md) | CTO |
| **Architecture (services, data flow, deployment)** | [`ARCHITECTURE.md`](./ARCHITECTURE.md) | CTO |
| **Active task queue (sprint backlog)** | [`web/content/reports/svi-exchange-tasks.json`](./web/content/reports/svi-exchange-tasks.json) | CTO |
| **Startup Value Index product vision** | [`web/content/reports/startup-index-vision.md`](./web/content/reports/startup-index-vision.md) | CPO |
| **SVI exchange product (startupvalueindex.com)** | [`/home/dovanlong/startupvalueindex.com/GOAL.md`](/home/dovanlong/startupvalueindex.com/GOAL.md) | CPO |
| **Trademark / IP positioning** | [`/home/dovanlong/startupvalueindex.com/TRADEMARK.md`](/home/dovanlong/startupvalueindex.com/TRADEMARK.md) | CLO |
| **Knowledge base index (AU accelerators, frameworks)** | [`KNOWLEDGE_BASE_INDEX.md`](./KNOWLEDGE_BASE_INDEX.md) + [`knowledge-base/`](./knowledge-base/) | CDO |
| **Financial projections (3-year)** | [`FINANCIAL_PROJECTIONS_3YEAR.md`](./FINANCIAL_PROJECTIONS_3YEAR.md) | CFO |
| **ESOP design / implementation / templates** | [`ESOP_DESIGN.md`](./ESOP_DESIGN.md), [`ESOP_IMPLEMENTATION.md`](./ESOP_IMPLEMENTATION.md), [`ESOP_LEGAL_TEMPLATES.md`](./ESOP_LEGAL_TEMPLATES.md) | CHRO + CLO |
| **Data room structure** | [`DATA_ROOM_STRUCTURE.md`](./DATA_ROOM_STRUCTURE.md) | CFO |
| **Production deploy mechanism** | [`web/scripts/deploy-live.sh`](./web/scripts/deploy-live.sh) (9-gate CI/CD) | Platform |
| **Post-mortem incidents** | `HARDENING_LESSONS_<date>.md` files at repo root | Platform |

**Rule:** if a document conflicts with this index, update both this index and the document with a single canonical statement.

---

## 2. Versioning convention

We use a **3-axis version**:

```
<web.package.json>    e.g. 0.3.0      ← semver, bumped per release wave
<queue_version>       e.g. v1.1       ← in svi-exchange-tasks.json
<release_id>          e.g. kXSx2gdr0e7BQ4xJYXn-c  ← BUILD_ID from deploy-live.sh
```

### When to bump

| Change type | web.version | queue_version | release_id |
|---|---|---|---|
| Bug fix only | patch (0.3.0 → 0.3.1) | unchanged | auto (every deploy) |
| New feature task shipped | minor (0.3.0 → 0.4.0) | minor (v1.1 → v1.2) | auto |
| Breaking schema / API / architecture | major (0.3.0 → 1.0.0) | major (v1.x → v2.0) | auto |
| Pivot / repositioning | major + new master plan section | major | auto |

### Per-upgrade checklist (REQUIRED)

When shipping any upgrade:

1. `web/package.json` — bump `version` per table above
2. `svi-exchange-tasks.json` — update task `status`, `deployed`, `last_action`, `last_action_at`; bump `queue_version` if minor/major
3. `ROADMAP.md` (this file) — update Current version + Section 4 (current sprint) + Section 5 (changelog)
4. `ARCHITECTURE.md` — only if data flow, service boundary, or deploy path changed
5. Source-of-truth links in Section 1 — only if a new canonical doc was created or moved
6. Git commit with version in subject: `chore(release): v0.4.0 — <one-line>`

---

## 3. Product phase tracker (SVI exchange)

| Phase | Status | Description |
|---|---|---|
| v0.1 listings | ✅ done | Ticker, sector, SVI score, valuation per startup |
| v0.2 investor layer | ✅ done | Watchlist, verified investor accounts |
| v0.3 sector pages | ✅ done | /sector/[sector] aggregates per industry |
| v0.4 embeddable widget | ✅ done | /embed/* for partner sites |
| v0.5 secondary offers prep | 🟡 in_progress | Founders post non-binding secondary offers |
| v0.6 EOI book | ✅ done (T_SVI_EXC_0013) | Verified investors submit Expressions of Interest — shipped v0.4.0 |
| v0.7 escrow settlement | ⚪ pending | Settlement layer for closed deals |
| v0.8 deal calendar | ⚪ pending | Upcoming offers, EOI close dates |
| v0.9 index licensing | ⚪ pending | Institutional API tier (T_SVI_EXC_0014) |

---

## 4. Current sprint (open tasks)

Pulled from [`svi-exchange-tasks.json`](./web/content/reports/svi-exchange-tasks.json) — that file is authoritative; this section is a human-readable mirror updated each ROADMAP version bump.

| Task | Phase | Priority | Status | Notes |
|---|---|---|---|---|
| **T_PRICE_0001** Founding 100 bump A$3 → A$5 | — | P0 | code-shipped, awaits Stripe-sync + redeploy | All UI + email + config updated. STRIPE_PRICE_FOUNDING50 env var still points at A$3 Stripe price — admin must run `/dashboard/admin/stripe-sync` then redeploy via `deploy-live.sh`. |
| **T_FEEDBACK_0001** Feedback-for-credits | — | P1 | pending | Score agent + DB schema + admin dashboard + weekly digest. ~6h. |
| **T_REVENUE_0001** Revenue + spend report | — | P1 | pending | Admin dashboard panel + weekly email cron. ~3h. |
| **T_EMAIL_0001** D1/D4/D9 nurture sequence | — | P1 | pending | Templates via email-sequence skill + queue wiring. ~2h. |
| **T_SVI_EXC_0014** Institutional API tier | v0.9 | P2 | pending | API key mgmt + Stripe billing, ~10h. |

### Recently shipped (this session)
- Founding 100 price bump: A$3 → A$5 (all UI/email/config — Stripe sync still needed)
- Memory refresh: `project_founding100_price.md` updated to A$5 + Stripe-sync caveat documented
- A/B test rebalanced: A$5 now control (0.40), A$3 legacy (0.10), A$10 (0.30), A$1 floor (0.20)

### Previous session shipped
- Dark exchange UI redesign for startupvalueindex.com (homepage + listings IPO-style)
- Founding 100 price update: A$1 → A$3
- Production hardening (deploy.sh pipefail, smoke tests, healthcheck API path)
- Cron error fixes (`@react-pdf/renderer` external packages copy)
- Discovery + documentation of bare-metal release mechanism (NOT docker)

---

## 5. Changelog

### 0.5.0 (2026-06-21 06:10 UTC, release pending Stripe-sync + redeploy)
- **Feat:** Founding 100 price bump A$3 → A$5 across all surfaces.
  - Source-of-truth `platform-config.ts → founding_price_cents: 500` (was 300).
  - UI: `pricing-data.ts` (price + CTA + FAQ), `founding-50/page.tsx` (early-access copy + testimonial), `founding-50/founding-50-form.tsx` (FULL_PRICE), `investors/page.tsx` (tier table), `admin/config/pricing-config.tsx` (auto-renders from config), `plans.ts` (default fallback cents).
  - Email: `lib/email.ts` Day-7 nurture subject + headline updated to A$5.
  - A/B test (`ab-pricing.ts`): A$5 now control (weight 0.40), A$3 demoted to legacy (0.10), A$10 (0.30), A$1 (0.20).
  - Legacy service mirror: `services/svi-engine/src/lib/svi-config.ts → founding_price_aud: 5`.
- **Action required (post-merge):** Admin must visit `/dashboard/admin/stripe-sync`, create new Stripe Price at 500¢, update `STRIPE_PRICE_FOUNDING50` env, redeploy via `web/scripts/deploy-live.sh`. Until then UI says A$5 but Stripe still charges A$3.
- **Queue:** `queue_version v1.2 → v1.3`. Three new P1 tasks queued: feedback-for-credits, revenue-report, D1/D4/D9 email sequence.

### 0.4.0 (2026-06-19 04:02 UTC, release `ujveHxHJR157-Kf0y_9PD`)
- **Feat:** T_SVI_EXC_0013 Investor EOI book live (`/api/eoi` GET+POST). v0.6 phase complete.
- **Fix:** cron routes 500 (`ERR_MODULE_NOT_FOUND @react-pdf/renderer`) — added all 11 packages to `serverExternalPackages` + extended `deploy-live.sh` copy list to 13 packages (was 3).
- **Fix:** `deploy.sh` smoke-test timing (warmup loop + 3× retry per route).
- **Fix:** `deploy.sh` + Dockerfile pipefail + API-aware healthcheck (catches root=200 but API=500 outage class).
- **Hardening:** 6 memory entries for deploy + Next 16 gotchas. `HARDENING_LESSONS_2026-06-18.md` post-mortem.
- **Doc:** ROADMAP.md created as single source of truth + 3-axis versioning convention.
- **Orchestration:** SVI exchange orchestrator + agent-orchestrator run successfully — 14 commits pushed, 3 new tasks added.

### 0.3.0 (prior)
- v0.1 → v0.4 SVI exchange phases shipped
- Watchlist, investor account, sector pages, embed widgets

### 0.3.0 (prior)
- v0.1 → v0.4 SVI exchange phases shipped
- Watchlist, investor account, sector pages, embed widgets

---

## 6. Architecture quick map

```
                     ┌──────────────────────┐
                     │   blockid.au (web)   │  bare-metal node @ port 4001
                     │   Next 16 standalone │  /data/releases/<id>/server.js
                     └────────┬─────────────┘  watchdog auto-restart */2 min
                              │
              ┌───────────────┼───────────────┐
              │               │               │
        ┌─────▼────┐    ┌─────▼────┐    ┌─────▼─────┐
        │ Supabase │    │  Redis   │    │  Anvil    │
        │  :8000   │    │  :6379   │    │  :8545    │
        └──────────┘    └──────────┘    └───────────┘

  startupvalueindex.com → calls blockid.au /api/index/{headlines,listings,listing}
  (standalone Next 15.5 @ port 4002, separate systemd service)
```

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for full diagram.

---

## 7. Operating principles (non-negotiable)

1. **Deploy via `web/scripts/deploy-live.sh` only.** Docker `deploy.sh` is sandbox/wrapper, not prod. See [`HARDENING_LESSONS_2026-06-18.md`](./HARDENING_LESSONS_2026-06-18.md).
2. **Production stays on Next 16 with default builder.** Webpack standalone breaks `cookies()` scoping (auth/me 500); turbopack needs `serverExternalPackages` for `@react-pdf/*` to avoid runtime ERR_MODULE_NOT_FOUND.
3. **Every change to `serverExternalPackages` in `next.config.ts` MUST update `deploy-live.sh` copy list** (line ~381). Mismatched lists = silent runtime failures.
4. **Smoke test every API route after deploy, not just `/`.** See gate 7 in deploy-live.sh.
5. **Versioning is mandatory.** No release without bumping web.version + recording in this file.
