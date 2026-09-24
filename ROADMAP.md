# BlockID.au + Startup Value Index — Master Roadmap

> **Planning authority updated 2026-09-24:** [SOURCE-OF-TRUTH](docs/plans/SOURCE-OF-TRUTH.md) is the single active queue: G30 implementation in progress, G31 not implemented, G32 approved but not implemented, G33 partially deployed with acceptance still open. [Full-app review and traceability](docs/reviews/2026-09-24-full-app-g31-g32-g33-reconciliation.md), SOT §12.12 and [C-level DeepInfra policy §8](docs/plans/g30-ai-routing-model-policy-2026-09-23.md) supersede stale planning claims below. This documentation update does not activate runtime changes or new spend.

**Historical release/pricing snapshot (19/09, not current runtime):** `v3.16.0` (web/package.json = web/content/reports/version.json, aligned 2026-09-19 by G18-B) — Reliability (G15) · First dollar (G16) · Unicorn homepage (G17) · truth sweep (G18). Ladder: founders Free / Starter A$29 / Growth A$69 (Pro A$299 retired 2026-09-08); evaluators Scout A$79 / Firm A$149 / Program A$349 · Fund A$999 / Intake link A$249 / Index API A$299 · Cohort 25 A$5K/yr / Cohort 100 A$15K/yr; Trusted Business Report A$3. Positioning: "Startup Value Index … by BlockID", evaluator-first. Release log: `web/CHANGELOG.md`; goal status: §1–§3 below and `docs/plans/SOURCE-OF-TRUTH.md`.
**Planning last updated:** 2026-09-24 UTC. Public `/api/status` at 13:59 reports v3.33.3; exact build/live status must come from timestamped release receipts, not this version label.

> **[LEGACY — 2026-09-01 sunset, retained for archive]**
> All Founding-50 / Founding-100 marketing surfaces below (release-note bullets, deploy checklists, price bumps) describe a promo that ended on 2026-09-01. The `/founding-50` route was deleted on 2026-09-07 (Phase 3b) and the marketing surface is retired. The Stripe SKU id `founding50` is preserved in `web/src/lib/plans.ts` + `web/src/lib/stripe.ts` for grandfathered renewals only.

---

## 1. Canonical sources

> **24/09 — CFO implementation đang thực hiện:** yêu cầu “hãy làm toàn bộ” tiếp nối plan-only. Xem [spec](docs/plans/g32-cfo-projection-valuation-implementation-2026-09-24.md) và [execution receipt](docs/reviews/2026-09-24-cfo-implementation-receipt.md). Source/tests không thay cho nghiệm thu G31/G32/G33; positive producer, calibration và production rollout chưa được xác nhận.

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
| **Production deploy mechanism** | [`web/scripts/deploy-live.sh`](./web/scripts/deploy-live.sh) (9-gate CI/CD, bare-metal) | Platform |
| **Team / org (autonomous agent fleet)** | [`docs/TEAM_STRUCTURE.md`](./docs/TEAM_STRUCTURE.md) | Founder |
| **Reseller / wholesale module goal** | [`docs/plans/reseller-module-goal.md`](./docs/plans/reseller-module-goal.md) — driven by `reseller-goal-loop` cron | CRO + CFO |
| **Atlassian standard mapping goal** | [`docs/plans/atlassian-standard-mapping-goal.md`](./docs/plans/atlassian-standard-mapping-goal.md) — driven by `atlassian-goal-loop` cron | CPO |
| **Antler / fundraising knowledge pack (T0094–T0101)** | [`WORK_SUMMARY_T0094_T0101.md`](./WORK_SUMMARY_T0094_T0101.md) + `ESOP_*.md`, `FINANCIAL_PROJECTIONS_3YEAR.md`, `DATA_ROOM_STRUCTURE.md`, `SVI_BLOCKID_ANALYSIS.md`, `KNOWLEDGE_BASE_INDEX.md` | CFO + CLO |
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
| **T0097** ESOP UI implementation | — | P1 | **shipped** (`/workspace/esop` hub, G13 W2 tabs; S25–S29 ESS annex) | React/TS build against schema + API from T0096 (`ESOP_IMPLEMENTATION.md`). Estimated 2 sprints. |
| **T_FEEDBACK_0001** Feedback-for-credits | — | P1 | **shipped** (`/api/feedback`, `report-credit-cost.ts`; evaluator feedback letter G14-S34) | Score agent + DB schema + admin dashboard + weekly digest. ~6h. |
| **T_REVENUE_0001** Revenue + spend report | — | P1 | **shipped** (G14-S33 traction snapshot + `/api/status.traction`, `ai-spend-daily.json`, admin tile) | Admin dashboard panel + weekly email cron. ~3h. |
| **T_EMAIL_0001** D1/D4/D9 nurture sequence | — | P1 | **shipped** (`[nurture]` enqueue on register; `email-drip.ts`) | Templates via email-sequence skill + queue wiring. ~2h. |
| **T_SVI_EXC_0014** Institutional API tier | v0.9 | P2 | pending | API key mgmt + Stripe billing, ~10h. |
| **T_SVI_EXC_0015** Escrow settlement (v0.7) | v0.7 | P2 | pending | Settlement layer for closed EOI-book deals. |
| **G11-P1** Public nav → 5 items + "Do you need money?" CTA | — | P1 | **shipped 2026-09-10** (release `b119b8627`) | Goal doc [`docs/plans/money-finder-2026-09-10.md`](./docs/plans/money-finder-2026-09-10.md); SOT G11. Legacy navbar mirrors; E2E `menu-structure.spec.ts` updated same commit. |
| **G11-P2** Migration 0308 `au_grants`/`au_programs` + seed from `web/content/data/*.seed.json` | — | P1 | **shipped 2026-09-10** (migration 0311) | 56 grants + 199 programs (8 capitals) seeded 2026-09-10; weekly refresh cron in P7. |
| **G11-P3..P14** Grant-advisor agent, `/funding` A$3 report, Founder Radar (Starter) alerts/digest, dashboard tile | — | P2 | **shipped 2026-09-10** (S3–S5 releases; migrations 0315–0323) | Full phase table in SOT §2 rows G11-P0..P14 (P14 = speakable hero one-liners, founder + investor view). |
| **G20 F1–F3** Ready for sale: feature inventory + 19 hidden unfinished features, signed-in page sweep (35 defects fixed) + weekly cron, purchase-path lane, workspace copy | — | P0 | **live 2026-09-20 v3.17.0** (`c6a00850b`, 12/12, live-qa 210/1→0) | SOT § G20; `docs/ops/feature-inventory.md`, `docs/ops/page-sweep.md` |
| **G21 P0–P3** Evidence-backed assessment infrastructure (advisor-feedback upgrade): canonical legal identity + TrustBand, FI hero/nav/CTAs, paid Cohort Validation Pilot A$1,500/2,500, pitch v4 + score governance + claims register → Claim/EvidenceRecord model, Assessment Card (SVI + Evidence Confidence), benchmark n rules, corrections → BlockID Cohort (import, filters, overrides, cohort report) → outcome ledger, calibration, institutional API, connector evidence | — | P0 | **ALL LIVE — closed 2026-09-21 v3.21.0** (`6c5aba3e7` + review fixes); four phases, four deploys, four reviews in 24 h | SOT § G21; `docs/plans/g21-fi-upgrade-2026-09-20.md` |
| **G22 A–D** Upgrade hardening: dossier access for batch members, invited batches listed, weights editor, org_id on batches/intakes (org-scoped retention/export), VI parity for the trust/pilot bands, in-app institutional API docs, 375/dark UX pass, /admin/validation tracker + weekly G21 regression lane | — | P1 | **LIVE + closed 2026-09-21 v3.22.0** (`e7ab69042` + review fixes) | SOT § G22; `docs/plans/g22-upgrade-hardening-2026-09-21.md` |
| **G23 A–C** Report grounding to the 0.85 KPI (auto-citer, salvage, budgets, verdict trim), pilot proposal PDF + pilot → annual conversion credit (0434), ops hygiene (partial live-qa summaries, cron logs, ledger If-Match, status grounding row) | — | P1 | **LIVE + closed 2026-09-21 v3.23.0** (`c6e94a033` + review fixes `60a648e10`; live-qa 296/0) — 0.85 KPI carried to G24-D | SOT § G23; `docs/plans/g23-grounding-proposals-2026-09-21.md` |
| **G24 A–D** Citations as footnotes + evidence appendix (no raw markers), AI-run integrity (prompt-version registration 0435, 401 → unconfigured, funding_round feed), demo cohort for buyer demos (`is_demo` 0436, zero AI cost, excluded from benchmarks/index), showcase grounding 0.50 → 0.77 | — | P1 | **LIVE + closed 2026-09-21** (v3.24.0 `676cc46a4`; fixes in v3.26.0) | SOT § G24; `docs/plans/g24-report-readability-demo-cohort-2026-09-21.md` |
| **G33 S0–S6 · T01–T16k** Recovery, integrity, durable report foundation, then G31/G32 | — | **P0** | **PARTIAL LIVE / NOT ACCEPTED**: T01 status acceptance reopen; S1 QA13:36fail; S2 evidence incomplete; S3partial; S4–S6planned | SOT §12.11–12.12 · [full-app review](docs/reviews/2026-09-24-full-app-g31-g32-g33-reconciliation.md) |
| **G32 SV0–SV6 · A04/A05/V04** SVI = tổng điểm không trần do AI Agents BlockID chấm theo 52 câu hỏi (panel 3 phiếu, rubric 0–4, quote bắt buộc) + quy mô và track record đã xác minh theo thời gian − rủi ro; định giá từ phân tích cụ thể (CFO agent trích driver có nguồn, engine `valuation-core` thuần code, IPEV calibration); gỡ 8 đường SVI→tiền | — | P0/P1 | **partial source implementation 24/09; chưa deploy/accepted — xem execution receipt** | SOT §9.4–9.5 · [G31 §1.7](docs/plans/g31-investor-lens-biz-trust-report-2026-09-23.md)
| **G31 IL00–IL15** Investor Lens for the Trusted Business Report: 6 investor signals (Team · Traction · Moat · Liquidity · Cap Table · IP) with per-signal evidence confidence above an unchanged SVI; Snapshot + Priority Matrix, questions + risk engine, cap-table quality, path to liquidity, cohort lens | — | P1 | **NOT IMPLEMENTED / NOT ACCEPTED**, source audit24/09; D21 decisions retained | [G31 plan](docs/plans/g31-investor-lens-biz-trust-report-2026-09-23.md) · SOT §10.13
| **G29 A–D** Dead-rung pruning + unfunded-provider alerting, degraded-run diagnostics, free-report real-run verification, persona-aware copy + pill stacking, Startup Index movers logic | — | P1 | **open 2026-09-22** → v3.28.0 | SOT § G29; `docs/plans/g29-provider-capacity-verification-2026-09-22.md` |
| **G28 A–D** Grounding ≥ 0.85, provider resilience (45 s/model, run-scoped strikes, W4 reserve), free-grant runs on ReportV2 (v3 document + investment-view e-mail), print rules + `?band=` demo + startupvalueindex.com light template | — | P1 | **LIVE + closed 2026-09-22 v3.27.2** (`a6c8e38d0`; live-qa 306/0; KPI 0.85 unverified live) | SOT § G28; `docs/plans/g28-grounding-resilience-free-path-2026-09-21.md` |
| **G27 P1–P2** Trusted Business Report v3 — investor-grade valuation + investment report: page-1 verdict (investable? worth? improve?), identical 8-criteria chapter anatomy, deterministic investment-view rubric, risk matrix, 90-day plan, light-template layout, PDF/DOCX/e-mail parity | — | **P0 (founder priority)** | **LIVE + closed 2026-09-21 v3.26.1** (`280404ce3`; review + UX fixes) | SOT § G27; `docs/plans/g27-tbr-v3-investor-report-2026-09-21.md` |
| **G26 T/M/W1/W2/R** Light unicorn template on every page — light surfaces, dark high-contrast text, one navy/cyan palette; tokens + primitives + guard test, marketing + /vi, founder workspace, evaluator/accelerator/admin, reports/PDF/e-mail | — | P0 | **LIVE + closed 2026-09-21 v3.26.1** (`280404ce3`; live-qa 303/2, sweep 140·0) | SOT § G26; `docs/plans/g26-light-template-redesign-2026-09-21.md` |
| **G25 A–B** Remove the paid pilot + coupon conversion (301s, SKUs, checkout/webhook, validation levels on Cohort plans, Cohort proposal), Anthropic via the Claude CLI (key optional, `not_configured`), founder-only items resolved by AI (demo names cleared, 33-row funding CSV, founder-items.md) | — | P0 | **LIVE + closed 2026-09-21 v3.26.0** (`be1f41cf2`) | SOT § G25; `docs/plans/g25-remove-pilot-claude-cli-2026-09-21.md` |
| **G18 A–D** Truth sweep: pricing ↔ Stripe ↔ DB parity + GST rule + trial parity, v3.16.0 docs/version, one message + guard test, self-serve cancel + Billing Portal | — | P0 | **live 2026-09-20** (`32ea5b05e`, 12/12) | SOT § G18; `docs/ops/pricing-truth.md`, `docs/design/messaging.md`, `docs/ops/billing-portal.md` |
| **G17 P1–P2** Unicorn homepage + site template: evaluator-first hero, 5-item nav, `/product` + `/samples` intro pages, template primitives on every marketing page, link checker | — | P0 | **live 2026-09-19** (`5a0c3dbb1`, 12/12, live-qa 191/0, 0 broken links) | Goal doc [`docs/plans/unicorn-homepage-2026-09-19.md`](./docs/plans/unicorn-homepage-2026-09-19.md); SOT § G17 |
| **G16 A–C** First dollar: funnel events + daily funnel + real `/admin/funnel`, locked TBR preview → A$3 quote-then-pay + gate cards + nudge, evaluator pilot comp + `/pilot` | — | P0 | **live 2026-09-19** (`58406efa2`, 12/12, live-qa 184/0) | Goal doc [`docs/plans/first-dollar-2026-09-19.md`](./docs/plans/first-dollar-2026-09-19.md); SOT § G16 |
| **G15 R1–R3** Reliability: deploy manifest truth + lock etiquette, error digest + latency SLO + `/api/status` v2, weekly restore drill, AI health snapshot, stray-process sweep | — | P0 | **live 2026-09-18** (`7e86fb700`, 12/12, live-qa 177/0) | Goal doc [`docs/plans/reliability-2026-09-18.md`](./docs/plans/reliability-2026-09-18.md); SOT § G15 |
| **G12 T0268–T0275** Evaluator Traction: Scout A$79 / Firm A$149 / Program A$349 public, card-required 7-day trial, A$3 Trust BizReport per startup entered, batch scoring, Progress Radar, solutions + ChatGPT comparison pages | — | P1 | **shipped 2026-09-10** (Stripe prices minted; migrations 0309–0322) | Goal doc [`docs/plans/evaluator-traction-2026-09-10.md`](./docs/plans/evaluator-traction-2026-09-10.md); SOT G12. |

### Recently shipped (this session, 2026-08-13)
- **T0094–T0101 Antler / Series A knowledge pack DONE** (7 of 8 tasks — T0097 UI deferred to next sprint). Full detail in [`WORK_SUMMARY_T0094_T0101.md`](./WORK_SUMMARY_T0094_T0101.md).
  - T0094 ESOP pool structure (12%, 4yr/1yr cliff, A$0.10 strike) → `ESOP_DESIGN.md`
  - T0095 5 legal templates (Plan Deed, Offer Letter, Founder Vesting, Shareholders excerpt, Leaver) → `ESOP_LEGAL_TEMPLATES.md`
  - T0096 Supabase schema + API + vesting engine + cron spec → `ESOP_IMPLEMENTATION.md`
  - T0098 BlockID SVI self-analysis, score 68/100, valuation A$440K pre-money → `SVI_BLOCKID_ANALYSIS.md`
  - T0099 36-month projections, unit econ (LTV:CAC 10:1), 5-method valuation → `FINANCIAL_PROJECTIONS_3YEAR.md`
  - T0100 13-section professional data room framework → `DATA_ROOM_STRUCTURE.md`
  - T0101 Consolidated knowledge base (~99 KB) for agent infusion → `KNOWLEDGE_BASE_INDEX.md`
- **Reseller wholesale flow live**: `reseller-goal-loop` (every 5 min) + `atlassian-goal-loop` (every 10 min, staggered) driving Track A + B autonomously. Nightly commissions clearance, weekly Stripe promotion-code drift check, monthly reconciliation + KPI report crons all wired. Wholesale gate runbook at [`docs/runbooks/wholesale-gate-breach.md`](./docs/runbooks/wholesale-gate-breach.md).
- **Founding 100 stabilised at A$5** — Stripe-sync + redeploy from v0.5.0 completed. A/B test: A$5 control (0.40), A$10 (0.30), A$1 floor (0.20), A$3 legacy (0.10).
- **Team roster**: 11 active C-Level AI agents via `web/content/team-roster.json`, documented in `docs/TEAM_STRUCTURE.md` v4.0.

### Previous session shipped
- v0.5.0 (2026-06-21): Founding 100 A$3 → A$5 code push (Stripe-sync now complete)
- v0.4.0 (2026-06-19): T_SVI_EXC_0013 EOI book (v0.6 phase complete), cron @react-pdf fixes, deploy-live.sh hardening
- Dark exchange UI redesign for startupvalueindex.com (homepage + listings IPO-style)
- Discovery + documentation of bare-metal release mechanism (NOT docker)

---

## 5. Changelog

> From v3.10.0 (2026-09-08) onward the release log is `web/CHANGELOG.md` (rendered at `/changelog`): v3.10.0
> context-aware intake + light-first design · v3.11.0 → v3.15.0 Money Finder, evaluator ladder, release readiness,
> G13 investor clarity, G14 investor feedback · **v3.16.0 (2026-09-19)** G15 reliability, G16 first dollar, G17
> unicorn homepage, G18 truth sweep. The entries below are the pre-v3.10 history.

### v3.9.23 (2026-09-07 UTC) — Recently landed

Approved plan `h-y-review-t-on-b-foamy-pixel` — full messaging↔code synchronisation sprint.

- **A workstream — message truth on marketing surface:**
  - A1 score-first hero H1 "Know your startup's SVI score in 60 seconds." + quantified subheadline + outcome CTA "Get my SVI score" (`a2b5c8971`)
  - A2 quick-tag chips route to real targets: Competitor → `/score?q=`, Valuation → `/tools/idea-valuation`, GTM → `/tools/funding-plan` (`4b5288699`); chips now render as `<a href>` for SEO (`8ed44c24a`)
  - A3 how-it-works "50+ AI agents" → "11 C-Level agents" (`f8001541a`)
  - A4+A5 "13 criteria" → "8 SVI dimensions" verbatim PRD labels across `/how-it-works` + `/for/[segment]` (`7080aecc8`)
  - A6 CTA subtext scrub — no implicit user-count claim (`5f853225a`)
  - A7 Nav Free Tools dropdown (17 tools grouped) + Sprocketbay/BlockID demo + unify `/solutions/*`, hide Compare (`9c247175d`)
  - A8 Revenue Tracker card → Trust Report share links (real capability) (`dccb78487`)
- **B workstream — pricing simplification:**
  - B1+B2 pricing consolidated to Free / Growth / Pro public ladder + `public:false` flag on hidden SKUs (`5f45f0b63`)
  - B3-lite legacy `PRICING_TIERS` array retired (`d68a37eb9`)
  - B3-tail Founding-50 legacy marketing surface purged; Stripe SKU kept for grandfathered renewals only (`1ec7f2657`)
  - B4 GST-exclusive copy unified across pricing page + matrix + plans-v2 comments (`1820f99f8`) + FAQ JSON-LD + body copy stragglers (`20a7541fb`)
  - B5 persona pages deep-link to `#tier-growth`/`#tier-pro` fragment (`da9f36000` + `e6c99cbc3`)
  - B6 share_management gate resolved — A$99 Growth users no longer 402 on Cap Table (`1188c130e`)
  - B7 trial-days copy reconciled — 7-day public tiers, 14-day pilot contact-sales (`2ddc7381d`)
  - B8 3-card public ladder + ContactSalesRow (Accelerator / VC / Enterprise) + credit-pack monotonic fix (`58f34d45d`)
- **C1 workstream — investor pack CLevelChapter render + ToC bumped to 9 chapters** (`2dd695b98` + `f50a42be1` + colocated test)
- **D workstream — surface under-promised capability:**
  - D1 new `/features` page surfacing 8 under-promised capabilities (cohort percentile, per-investor tracked share links, ATO tax invoice, dividend engine, 17 free tools, 12-chapter guide, evidence completeness, LP anonymisation) (`aead3ed1e`)
  - D2 `/features` surfaced in sitemap + primary nav (`0850f2b25`)
  - D3 `/tbr/demo` tertiary link surfaced in hero (`947057278`)
- **Followups:** homepage title + og:image:alt match new score-first hero (`abeca292e`); Playwright post-deploy smoke tests updated for 3-rung ladder (`b6d83a852`).

### 0.6.0 (2026-08-13 UTC)
- **Feat:** T0094–T0101 fundraising knowledge pack (ESOP + valuation + data room + SVI self-analysis + master knowledge index). 99 KB of investor-ready documentation.
- **Feat:** Reseller wholesale channel live end-to-end — Track A (self-serve) + Track B (partner-managed) driven by autonomous `reseller-goal-loop` cron; Atlassian standard mapping via `atlassian-goal-loop`. Both loops have kill-switch envs (`RESELLER_AUTONOMOUS_LOOP=off`, `ATLASSIAN_GOAL_LOOP=off`) and self-disable when their goal plan is complete.
- **Feat:** SVI standalone site (startupvalueindex.com) production-stable on Next 15.5 @ port 4002, systemd `startupvalueindex.service`, dark exchange UI, consuming blockid.au `/api/index/*` endpoints.
- **Ops:** Founding 100 = A$5 lifetime fully synced across UI + Stripe + email + A/B config + platform-config.ts.
- **Ops:** 11-agent C-Level fleet documented in `docs/TEAM_STRUCTURE.md` v4.0; CEO orchestrator runs 8× daily (12/14/16/18 UTC); guardian every 10 min.
- **Queue:** `queue_version v1.3 → v1.4`. T0097 (ESOP UI) queued as P1 next-up.

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

See `web/content/reports/architecture.md` (living, v3.16.0) and [`ARCHITECTURE.md`](./ARCHITECTURE.md) (v3.9.23 snapshot) for the fuller picture; nginx sits in front of :4001 (`docs/ops/nginx/blockid-live.conf`) and the DB is the self-hosted Supabase stack.

---

## 7. Operating principles (non-negotiable)

1. **Deploy via `web/scripts/deploy-live.sh` only.** Docker `deploy.sh` is sandbox/wrapper, not prod. See [`HARDENING_LESSONS_2026-06-18.md`](./HARDENING_LESSONS_2026-06-18.md).
2. **Production stays on Next 16 with default builder.** Webpack standalone breaks `cookies()` scoping (auth/me 500); turbopack needs `serverExternalPackages` for `@react-pdf/*` to avoid runtime ERR_MODULE_NOT_FOUND.
3. **Every change to `serverExternalPackages` in `next.config.ts` MUST update `deploy-live.sh` copy list** (line ~381). Mismatched lists = silent runtime failures.
4. **Smoke test every API route after deploy, not just `/`.** See gate 7 in deploy-live.sh.
5. **Versioning is mandatory.** No release without bumping web.version + recording in this file.
