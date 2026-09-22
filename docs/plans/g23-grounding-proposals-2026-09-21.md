# G23 — Report grounding to KPI · pilot proposals + conversion · ops hygiene

> **Planning authority — 2026-09-22:** [G30 SOURCE OF TRUTH](./SOURCE-OF-TRUTH.md) consolidates the next upgrade, priorities, dependencies and sale gates. **PROPOSED / awaiting founder review; implementation not started.** This document is a historical component plan. Its shipped work is retained; residual work is mapped into G30 §3/§12. Older “continuous”, “defaults ship” or lane-launch instructions do not authorise G30 implementation.

**Opened:** 2026-09-21 (standing founder loop: commit → deploy live after every phase → full QA → fix → next phase).
**Owner:** Claude session loop — worktree lanes → merge → full `--project unit` + pdf → 12-gate deploy → elevated live-qa + link-check + sweep → read-only review → fixes → close.
**Tracked in:** `docs/plans/SOURCE-OF-TRUTH.md` § G23 · `ROADMAP.md` row G23.
**Sources:** G19's one open P1 (`groundedShare` 0.41 vs KPI 0.85 — `tbr_quality` status `watch`); the advisor plan's validation Level 3 ("two written pilot proposals") and § 33 funnel ("offer paid pilot → run cohort → convert to annual"); the G22 follow-ups (partial live-qa marker, log rotation, ledger write lock, `pilot.*` literal fallbacks).

**Status:** CLOSED 2026-09-21 — v3.23.0 live (`c6e94a033` + review fixes `60a648e10`); live-qa 296/0, link-check 0, sweep 0; review 3 P1 / 3 P2 / 3 P3 fixed. The `groundedShare ≥ 0.85` acceptance line is NOT met (showcase 0.50, up from 0.41) — carried into G24 lane D. Findings + follow-ups in SOT § G23.

## Lanes

### A — Report grounding to the KPI (skills: svi-scoring, prompt-engineer, cdo, code-reviewer)
Files: `lib/report-pipeline/**` (dimension owners, W4 chapter contract, auditor sweep), `lib/report-v2/**` (grounding metrics), `content/prompt-eval/**` fixtures, `scripts/run-self-analysis.mjs`, `content/reports/tbr-quality.jsonl` (read), `/api/status.tbr_quality`.
1. Measure first: run the pipeline on the BlockID showcase project (`node scripts/run-self-analysis.mjs --report`; DeepInfra-first routing, Claude CLI fallback only) and record `groundedShare`, uncited claims per chapter, token overruns, W4 verdict failures (the run appends to `tbr-quality.jsonl`).
2. Fix the three named causes: (a) dimension owners cite few `[ev:…]` ids → the owner prompt lists the evidence register ids it may cite, requires ≥ 1 citation per factual sentence, and the auditor pass downgrades (not drops) uncited sentences; (b) CMO criteria overrun tokens → per-criterion budgets sized to the contract (as S46 did for W4) + a hard trim before the JSON parse; (c) a W4 verdict > 80 words fails the chapter → trim to the last full sentence under 80 words instead of failing; prompt-eval fixtures for each.
3. Target: `groundedShare ≥ 0.85` on the showcase run and on the demo fixture; `tbr_quality` status `watch` → `ok` in `/api/status`; the showcase report re-published (`revalidateTag`); no new AI spend path.
4. Tests: unit for the trim / downgrade / budget helpers, prompt-eval fixtures, `report.test` typography guard; **FULL unit + pdf suite**; a before/after table in the report.

### B — Pilot proposal generator + pilot → annual conversion (skills: pitch-deck-builder, stripe-saas-billing, ui-ux-pro-max, cro, au-compliance)
Files: `lib/validation/proposal.ts`, `lib/pdf/pilot-proposal-pdf.tsx`, `api/admin/validation/[id]/proposal` (PDF; admin), `admin/validation` row action "Generate proposal", `workspace/accelerator/pilot` conversion card, `api/stripe/checkout` (`convert_from_pilot`), `api/stripe/webhook` (conversion write), `lib/pricing/pilot-skus.ts`, `docs/ops/{pricing-truth,pilots}.md`.
1. Proposal PDF (react-pdf, pdf project): cover (organisation, contact role, date, prepared by `LEGAL_ENTITY`), the problem in their words (entry note / objection), scope (Cohort Validation Pilot — A$1,500 ≤ 25 / A$2,500 ≤ 50 inc. GST), what is delivered (the shipped six-stage bullets), success metrics (`PILOT_SUCCESS_METRICS`), timeline, data & consent (`DATA_PRINCIPLE_SENTENCE`, applicant consent, retention), after the pilot (Cohort 25 / Cohort 100 annual — pilot fee credited on conversion within 60 days), acceptance + signature block, entity/ABN footer, disclaimer. Numbers from constants only. Generated on demand (not stored); the entry gains `proposal_generated_at`.
2. Conversion: `/workspace/accelerator/pilot` card "Convert to Cohort 25 / 100 (annual)" → checkout of the existing annual prices with the pilot fee credited via a founder-minted coupon (`STRIPE_COUPON_PILOT_CREDIT_25` / `_50` — env NAMES only; unset → the card explains the credit and links `/contact?topic=pilot`); checkout accepts `convert_from_pilot: <order id>` (order owner, within 60 days of `entitlement_until`), webhook records `pilot_orders.converted_at` + plan and emits `subscription_started` with `channel: "pilot_conversion"`. No Stripe writes from code.
3. `/admin/validation` auto rows: L5 also counts a converted pilot.
4. Tests: proposal builder, PDF (≤ 4 pages, byte ceiling), route (admin gate), checkout branch (coupon applied when env set; 409 `coupon_unconfigured` otherwise), webhook conversion write, live-qa `34-purchase-path` conversion-card fallback for a non-pilot account, anonymous 401 on the proposal route. **FULL unit + pdf suite.**

### C — Ops hygiene (skills: qa-lead, coo, monitoring-expert)
Files: `scripts/qa-live.sh`, `scripts/crontab.production`, `lib/validation/ledger.ts`, `components/marketing/PilotBuyButton.tsx`, `app/(marketing)/pilot/pilot-page-body.tsx`, `lib/i18n/messages/*`, `docs/ops/live-qa.md`, `lib/status/*`, `lib/funnel/institutional.ts`.
1. `qa-live.sh -- <specs>` → `live-qa-latest-partial.json` + history rows `partial: true, specs: [...]`; `live-qa-latest.json` only from full runs.
2. Live-qa + calibration cron logs → `content/reports/logs/` (gitignored), 8-week prune.
3. Validation ledger: writes serialised through a module-level promise chain + `If-Match` on `updated_at` (409 stale); tests.
4. `pilot.*` fallback literals → catalogue keys (EN/VI).
5. `/api/status.tbr_quality` exposes `grounded_share` + the KPI; `/admin/funnel` Trust shows it.

## Acceptance
`groundedShare ≥ 0.85` on showcase + demo; proposal PDF from `/admin/validation`; conversion card live with the contact fallback; ops items merged; full unit + pdf green; deploy 12/12; elevated live-qa green incl. lane 42; link-check 0; sweep 0; review → fixes; `version.json` v3.23.0; SOT § G23 closed.

## Founder-only
Mint `STRIPE_COUPON_PILOT_CREDIT_25/50` (amount-off once, on the Cohort annual prices) and set the env names; approve the proposal wording once generated for a real target.
