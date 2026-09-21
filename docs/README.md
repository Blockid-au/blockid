# `docs/` — index

> Last verified: **2026-09-19** (G18-B truth sweep, release v3.16.0). One line per document: what it is for and
> when it was last checked against the shipped platform. "Living" = maintained on every goal; "verified" = read
> and found accurate on that date; "historical" = kept for the record, header note says what superseded it.
> Retired material is in [`archive/`](./archive/) — never deleted, every file carries a RETIRED header.
>
> Rules: every new plan is merged into [`plans/SOURCE-OF-TRUTH.md`](./plans/SOURCE-OF-TRUTH.md) (never a standalone
> doc); pricing figures are owned by `ops/pricing-truth.md` + `web/src/config/pricing/plans.csv`; the schedule is
> owned by `web/scripts/crontab.production`; the deploy pipeline by `web/scripts/deploy-live.sh`.

## Start here

| Doc | Purpose | Status |
|---|---|---|
| [`plans/SOURCE-OF-TRUTH.md`](./plans/SOURCE-OF-TRUTH.md) | Every goal (G1–G17), the requirements register, the human-blocked queue, sync-back rules, the deploy-by-deploy change log | living · 2026-09-19 |
| [`../ROADMAP.md`](../ROADMAP.md) | Goal tables with live / closed status; §5 change-log header | living · 2026-09-19 |
| [`../README.md`](../README.md) | Product, pricing, stack, how to run / test / deploy / migrate | verified 2026-09-19 |
| [`API-REFERENCE.md`](./API-REFERENCE.md) | Session, cron, Evaluator API v1, partner and public endpoints; env / credit / plan appendices | verified 2026-09-19 |
| [`design/unicorn-template.md`](./design/unicorn-template.md) | Design contract for every marketing page and `/vi` mirror (G17) | living · 2026-09-19 |
| [`design-system.md`](./design-system.md) | Canonical token spec (light-first rev.3, AA verified) | verified 2026-09-08 |

## Goal documents (`plans/`)

| Doc | Purpose | Status |
|---|---|---|
| [`plans/unicorn-homepage-2026-09-19.md`](./plans/unicorn-homepage-2026-09-19.md) | G17 — evaluator-first home, one template, link check | closed 2026-09-19 |
| [`plans/first-dollar-2026-09-19.md`](./plans/first-dollar-2026-09-19.md) | G16 — funnel truth, A$3 paywall, evaluator pilots | closed 2026-09-19 |
| [`plans/reliability-2026-09-18.md`](./plans/reliability-2026-09-18.md) | G15 — ship safety, observability, data safety, AI resilience | closed 2026-09-18 |
| [`plans/g14-investor-feedback-2026-09-16.md`](./plans/g14-investor-feedback-2026-09-16.md) + [`folder`](./plans/g14-investor-feedback-2026-09-16/) | G14 — deck v3, pricing v4, feedback letter, intake link, verification integrity, Evaluator API, backtest, open signals; 90-day evaluator GTM | closed 2026-09-17 (GTM founder-led) |
| [`plans/investor-clarity-2026-09-15.md`](./plans/investor-clarity-2026-09-15.md) + [`folder`](./plans/investor-clarity-2026-09-15/) · [`plans/investor-dossier-taxonomy-2026-09-15.md`](./plans/investor-dossier-taxonomy-2026-09-15.md) | G13 — nav v4, Trusted Business Report v2, Investor Dossier, taxonomy; codebase audits | closed 2026-09-16 |
| [`plans/evaluator-traction-2026-09-10.md`](./plans/evaluator-traction-2026-09-10.md) | G12 — evaluator ladder Scout / Firm / Program, A$3 report, differentiators, traction plan T1–T4 | closed 2026-09-10 (T1–T4 founder-led) |
| [`plans/money-finder-2026-09-10.md`](./plans/money-finder-2026-09-10.md) | G11 — AU grants + programs, Money Finder report, Founder Radar | closed 2026-09-11 |
| [`plans/value-first-hero-goal.md`](./plans/value-first-hero-goal.md) · [`plans/hero-one-liner-test-protocol.md`](./plans/hero-one-liner-test-protocol.md) | G9 — outcome copy on the hero; A/B protocol (GA4 `hero_variant` dimension still founder-blocked) | closed; hero rewritten again by G17 |
| [`plans/unlock-next-level-2026-07-31.md`](./plans/unlock-next-level-2026-07-31.md) | G8 — progressive unlock matrix (`/docs/unlocks`) | closed 2026-09-18 |
| [`plans/ux-ia-startup-flow-goal.md`](./plans/ux-ia-startup-flow-goal.md) | G7 — startup-flow IA; decisions Q1–Q4 recorded | closed 2026-09-11; nav superseded by G13 v4 |
| [`plans/atlassian-standard-mapping-goal.md`](./plans/atlassian-standard-mapping-goal.md) · [`plans/real-world-workflow-parity-audit-2026-07-23.md`](./plans/real-world-workflow-parity-audit-2026-07-23.md) | G2 — real-world workflow parity (Atlassian / Canva / Airwallex / Xero / Culture Amp) | closed; #10 founder-review |
| [`plans/reseller-module-goal.md`](./plans/reseller-module-goal.md) · [`plans/reseller-module-plan.md`](./plans/reseller-module-plan.md) · [`plans/plan-delta-2026-07-23.md`](./plans/plan-delta-2026-07-23.md) · `plans/p10-*.md` | G1 — reseller / wholesale module (Stripe stays single-account) | closed; InfoVision seed founder-blocked |
| [`plans/clean-code-plan-2026-08-07.md`](./plans/clean-code-plan-2026-08-07.md) | Clean-code sweep plan | historical 2026-08 |
| `plans/mega-2026-07-24/`, `plans/uiux-sync-2026-07-24/`, `plans/tier-menu-2026-07-24/`, `plans/mentor-console-2026-07-24/`, `plans/how-it-works-2026-07-25/`, `plans/role-based-2026-07-25/`, `plans/misc/` | July 2026 batch specs (menu by growth phase, tour v2, affiliate tiers, GA4 dashboard, role-based gaps) | historical; shipped items in SOT §3/§8 |
| [`plans/reviews/`](./plans/reviews/) | Read-only post-ship reviews, release QA-1…QA-4, capacity / perf / a11y / API-security audits, live-QA lane reports (2026-09-10 → 14) | record |
| [`pricing-upgrade-plan-2026-07-16.md`](./pricing-upgrade-plan-2026-07-16.md) | Pricing plan v2 → **§ v4 ladder** (the current one) | § v4 verified 2026-09-16; earlier sections historical |

## Ops runbooks (`ops/`)

| Doc | Purpose | Status |
|---|---|---|
| [`ops/deploy.md`](./ops/deploy.md) | The 12-gate `deploy-live.sh`: lock, dirty-tree + manifest truth, gate list, live-bundle verification, rollback | verified 2026-09-19 |
| [`ops/live-qa.md`](./ops/live-qa.md) | `npm run qa:live` — what it provisions and erases, spec map, reading the report; weekly cron Sun 07:00 UTC | verified 2026-09-19 |
| [`ops/link-check.md`](./ops/link-check.md) | `scripts/link-check.mjs` — gate-8 hook, daily cron, triage | verified 2026-09-19 |
| [`ops/slo.md`](./ops/slo.md) | Latency / error targets, `latency-sample.mjs`, alerting, runbook | verified 2026-09-18 |
| [`ops/crontab-setup.md`](./ops/crontab-setup.md) | Catalogue of host crons (three families) with dry-run commands per job | verified 2026-09-19 |
| [`ops/db-migrations.md`](./ops/db-migrations.md) | `scripts/db/apply-migration.sh`, ledger, `migration-status.mjs`, deferred list | verified 2026-09-19 |
| [`ops/ai-providers.md`](./ops/ai-providers.md) | Provider tiering, keys, limits, cost; DeepInfra-first routing | verified 2026-09-15 |
| [`ops/pilots.md`](./ops/pilots.md) | **Retired 2026-09-21 (G25)** — historical runbook for the evaluator pilot comps; `/admin/pilots` is a read-only ledger, no new pilots | retired 2026-09-21 |
| [`ops/google-sign-in.md`](./ops/google-sign-in.md) | Two Google flows, console settings, error codes | verified 2026-09-15 |
| [`ops/public-page-caching.md`](./ops/public-page-caching.md) | Hash-mode CSP + edge cache for public pages | verified 2026-09-14 |
| [`ops/analytics.md`](./ops/analytics.md) | GTM / GA4 under the strict CSP; server-side money events | verified 2026-09-16 |
| [`ops/data-sources.md`](./ops/data-sources.md) | Open AU data sources (ABR, R&DTI, ACS …): licences, attribution, refresh | verified 2026-09-19 (0412) |
| [`ops/sector-multiples.md`](./ops/sector-multiples.md) | How a valuation picks its ARR multiple | verified 2026-09-13 |
| [`ops/stripe-env-audit.md`](./ops/stripe-env-audit.md) · `ops/pricing-truth.md` | Stripe price ids (read-only audit) · the price figures — **lane A owns both** | 2026-09-19 |
| [`ops/nginx/blockid-live.conf`](./ops/nginx/blockid-live.conf) | The live nginx site config (timing log format, canonical redirects) | verified 2026-09-18 |

## Incident runbooks (`runbooks/`, `AUDIT-CHAIN-RUNBOOK.md`)

| Doc | Purpose | Status |
|---|---|---|
| [`runbooks/db-restore.md`](./runbooks/db-restore.md) | Partial / full / cold-start restore, verification, off-site state, weekly restore drill (§9) | verified 2026-09-18 |
| [`runbooks/secret-leak.md`](./runbooks/secret-leak.md) · [`runbooks/secret-rotation-log.md`](./runbooks/secret-rotation-log.md) | Public-repo leak response; rotation ledger (Telegram token + GitLab PAT still founder-pending) | verified 2026-09-18 |
| [`runbooks/anthropic-cloud-routines.md`](./runbooks/anthropic-cloud-routines.md) | The 7 cloud-hosted C-Level routines (separate from the host crontab) | verified 2026-09-19 |
| [`runbooks/privacy-act-72h-clock.md`](./runbooks/privacy-act-72h-clock.md) | Notifiable Data Breach clock and steps | verified 2026-09-12 |
| [`runbooks/rls-bypass.md`](./runbooks/rls-bypass.md) | Service-role vs RLS incident handling | verified 2026-09-12 |
| [`runbooks/vc-issuer-key-rotation.md`](./runbooks/vc-issuer-key-rotation.md) | Verifiable-credential issuer key rotation | verified 2026-09-12 |
| [`runbooks/wholesale-gate-breach.md`](./runbooks/wholesale-gate-breach.md) | s708 wholesale gate breach response | verified 2026-09-12 |
| [`AUDIT-CHAIN-RUNBOOK.md`](./AUDIT-CHAIN-RUNBOOK.md) | Hash-chained `audit_events` integrity (nightly verify, P0 on break) | verified 2026-09-12 |

## Architecture, team, conventions

| Doc | Purpose | Status |
|---|---|---|
| `../web/content/reports/architecture.md` | **Living** architecture summary + change notes, rendered by the CEO loop | v3.16.0 · 2026-09-19 |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Mermaid stack / request-path diagrams — snapshot of v3.3.2 with a drift note at the top | historical (2026-08-07) |
| [`../ARCHITECTURE.md`](../ARCHITECTURE.md) | Repo-root surface summary at v3.9.23 | historical (2026-09-07) |
| [`TEAM_STRUCTURE.md`](./TEAM_STRUCTURE.md) | 11-agent C-Level org chart, cadence, how work ships (sessions + CEO loop) | verified 2026-09-19 |
| [`FEATURE_LIFECYCLE.md`](./FEATURE_LIFECYCLE.md) | Beta → GA chip convention on menus | verified 2026-09-19 (still the rule) |
| [`VERSION.md`](./VERSION.md) | Version log v2.3 → v3.4; pointer to `web/CHANGELOG.md` for everything after | historical |
| [`ROADMAP.md`](./ROADMAP.md) | Phase log Phase 1 → 3.0 (to v3.4.0) | historical |
| [`analyzer/CODE_WEBSITE_ANALYZER.md`](./analyzer/CODE_WEBSITE_ANALYZER.md) | Code & website analyzer (PTD sub-score) | verified 2026-09-04 |
| [`analytics/dashboards.md`](./analytics/dashboards.md) · [`analytics/showcase-events.md`](./analytics/showcase-events.md) | BI dashboard spec; GA4 event catalogue for showcase surfaces | 2026-07 |

## Product, research, marketing, user-facing

| Doc | Purpose | Status |
|---|---|---|
| [`research/evaluator-interviews-2026-09.md`](./research/evaluator-interviews-2026-09.md) | Evaluator interview instrument (G14 C9) | living (founder-led) |
| [`marketing/traction-kit-2026-09/`](./marketing/traction-kit-2026-09/) | T1 angel groups, T2 accelerator pilots, LinkedIn week-1 posts, Product Hunt kit | 2026-09-10 |
| [`design/menu-a11y-audit.md`](./design/menu-a11y-audit.md) · [`design/screenshots/`](./design/screenshots/) | Menu a11y audit (G7 §P7); G17 screenshots 1440 / 375 | 2026-09-19 |
| [`user/menu-walkthrough.md`](./user/menu-walkthrough.md) | What unlocks when, for users | verified 2026-09-18 (`/docs/unlocks`) |
| [`guides/startup-journey/`](./guides/startup-journey/) | 12-chapter founder guide source (`/guide/01…12`) | living |
| [`knowledge-base/startup-data-room-professional-guide.md`](./knowledge-base/startup-data-room-professional-guide.md) | Data-room professional guide (feeds the C-Level knowledge base) | 2026-07 |
| [`usecases/`](./usecases/) · [`showcase/atlassian/`](./showcase/atlassian/) · [`demos/atlassian.md`](./demos/atlassian.md) | Use-case library, Atlassian showcase research and demo walkthrough | 2026-07 |
| [`NVIDIA-Application-Proposal-CV.md`](./NVIDIA-Application-Proposal-CV.md) (+ `.pdf`) | NVIDIA academic grant application (accepted into NVIDIA Inception) | record |
| `blockid_financial_model*.py`, `blockid_valuation_2026*.xlsx` | Financial model scripts and valuation workbooks | 2026-07 |

## Archive (`archive/`)

Retired 2026-09-19, each with a header saying why and what replaced it: `DEPLOYMENT.md` (Docker Compose /
Caddy / GitLab CI, 2026-05), `CONTINUOUS-DEPLOY.md` (Goal-4 ship loop + guardian), `UPTIME_GUARD.md` (v2.14.1),
`orchestrator-goal-tracking.md` and `goal-5a…5d-*.md` (goal-loop era plans), `goal-i18n-auto-mt.md`,
`IMPLEMENTATION-PLAN-v2.md` / `v3.md` / `v3.1-amended.md` (2026-07 master plans, A$99 / A$499 era).
