# Next-Priority Queue — 2026-07-20 (post-reconcile)

Session shipped 35 commits across 14 C-Level agents plus product/ops/perf sweeps. This queue reflects what actually landed in `project-state.json`, what's still deferred from the verification pass, and the next 5 highest-value tasks per CEO north-star (paying customers + verified profiles + MRR).

---

## 1. Shipped this session (grouped by owner)

### CPO
- `T0130` First-Principles Question Engine — `7745c4a`
- `T0234` Fix `secondaryFeatures` empty (verification gap #2) — `fc4f27f`
- `T0232` Hero → live analyzer + per-project SVI page — `800c263`

### CFO
- `T0088` Fundraising Readiness v2 (checklist + AU comparables) — `7022b89`
- `T0120` 3-year financial projections tool — `82fca2e`
- `T0135` TAM/SAM/SOM bottom-up calculator (AU source library) — `31ff74a`

### CLO
- `T0087` Term Sheet AI v2 (persist + Lawyer Questions + SVI link) — `3dea034`

### CSO
- `T0206` Pricing & segment A/B test infra (`/admin/pricing-test`) — `1adb7f3`

### RND
- `T0016` Evidence Vault Phase 2 — OAuth (GitHub/Stripe/GA4) — `6c339da`
- `T0111` AI Idea Lab (sector-aware angle generator) — `d3db6e6`
- `T0121` / `T0123` Live pricing + CTA experiments — `94427ab`

### CDO
- `T0218` Public SVI Index dataset + `/dataset` page — `0c5e8ef`
- `T0225` Backfill + ongoing populator for `svi_index_snapshots` — `e8bc002`
- `T0235` Fix CSV endpoint header when snapshot empty (verification gap #1) — `208c4d6`

### CISO
- `T0217` Security hardening — rate-limit + 5 security headers + secrets audit — `140e24e`

### CCSO
- `T0219` Onboarding email drip + NPS pulse — `1d37b9f`

### CMO
- `T0220` SEO pillar batch A (valuation, readiness, ESIC/R&D) — `36c4091`
- `T0229` SEO pillar batch B (DCF/Berkus, cap table, SAFE) — `d1ab7c0`

### CHRO
- `T0223` ESOP grant tracker + Div 83A eligibility checker — `d456ece`

### COO
- `T0222` `/admin/ops` operational metrics dashboard — `d7bacf9`

### IR
- `T0221` Investor pack PDF generator — `bae37f1`

### DevRel
- `T0226` Public API documentation at `/developers/api` — `674afe3`

### QA
- `T0224` Playwright E2E smoke suite (5 specs) — `03f7e2e`

### CTO / Product / Ops
- `T0231` Perf audit + top 3 wins (image cache, `/insights` payload, `version.json` cache) — `cf82b1d`
- `T0230` Simplify external funnel + plan-based workspace unlocks — `d74a0c1`
- `T0227` Daily pg_dump cron fix — `abea284`
- `T0228` Release snapshot warning + backup verify — `a08d46b`
- `T0233` Wire crons for populator + drip + hygiene — `ed4b020`

---

## 2. Deferred / Partial (from `verification-2026-07-20.md`)

Two of the three PARTIALs from the verification pass are now closed (fixed by `208c4d6` and `fc4f27f`). Remaining:

- **CISO — rate-limit semantics.** `/api/svi` free-tier gate returns `402` after quota; verification called out lack of `429` + `X-RateLimit-*` / `Retry-After`. Behavior is safe (blocks abuse) but aggregators/monitors will misread `402`. Fix: split "quota exhausted" (429 + Retry-After: 86400) from "payment required" (402) — one-line branch in the same middleware. **Priority: M / next session.**

---

## 3. Next 5 highest-value tasks (per CEO north-star)

CEO scoreboard on `2026-07-20` shows 5 RED domains (CFO, CPO, CSO, CLO, RND) and 0 paying users / 0 analyses. Ranking is Impact (revenue proximity) + Effort + Risk. All ranks S / M / L.

| Rank | Task | Owner | Impact | Effort | Risk | Source (RED-status brief) |
|---|---|---|---|---|---|---|
| 1 | **First paying customer** — activate Stripe live keys + payment smoke + first hand-sold pack sold to a warm founder (unblocks CFO MRR = $0). | CRO + CFO | L | S | M | `cfo-daily-2026-07-19` (RED, KPI: "AUD $1k MRR"), `ceo-daily-2026-07-20` PRIORITY: acquire first paying customer |
| 2 | **T0213 — SVI brand landing page at `startupvalueindex.com`** (own pending CPO task; last CPO ship was `T0130`). Standalone SVI landing reusing `/svi` components; free assessment CTA → blockid.au. Direct funnel to paying flow. | CPO | L | M | M | `cpo-daily-2026-07-19` (RED, pending > 7d) |
| 3 | **CISO rate-limit semantics fix** — split 402 (payment) from 429 (quota) with `Retry-After`. Closes last PARTIAL in `verification-2026-07-20.md`; unblocks aggregator/API-tier trust (T_SVI_EXC_0014 pricing tier). | CISO | M | S | S | `verification-2026-07-20` finding #3 |
| 4 | **T0134 — Next-Best-Action Analytics Engine** (CDO pending). Translate SCN framework (Validation→Position→Value→Direction→Capital) into a routing signal per founder. Powers the paid-plan upgrade nudge — direct lever on free→paid conversion. | CDO | L | M | M | `cdo-daily-2026-07-19` (YELLOW, KPI: 100 structured profiles), CEO alignment: "Improving free→paid conversion" |
| 5 | **T0129 — Essential Eight / OWASP CI compliance module** (CTO pending). Blocks enterprise + investor DD trust. Small implementation (add scanner to CI pipeline) with outsized fundraise-readiness gain (feeds CLO RED status + IR investor pack). | CTO / CISO | M | M | S | `clo-daily-2026-07-19` (RED, legal-risk alignment), IR investor pack needs security posture attestation |

### Also-ran (deferred but tracked)
- `T0102` (dup id — CMO variant) AU percentile positioning model — needed for landing-page proof points.
- `T0211` LinkedIn page launch — Startup Value Index — awaits CMO cycle.
- `T0214` CTO — AI provider chain audit (Codex sub expired) — infra hygiene, not customer-facing.
- `T0216` CTO — orchestrator bug (`stageUpdateArtifacts` closes wrong tasks). Explains why this reconciliation is needed manually — fix would eliminate future drift.
- `T0133` CFO — R&D + ESIC valuation modifier (research shipped; not yet a multiplier in the engine).

---

_Generated by plan-updater agent 2026-07-20. Reconciled against `git log --since="2026-07-20 00:00"` (35 commits) and the 14 C-Level daily briefs from 2026-07-19._
