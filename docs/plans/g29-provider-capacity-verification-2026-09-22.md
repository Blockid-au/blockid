# G29 — Provider capacity automation · degraded-run diagnostics · free-report verification · persona copy · index sample logic

> **Planning authority — 2026-09-22:** [G30 SOURCE OF TRUTH](./SOURCE-OF-TRUTH.md) consolidates the next upgrade, priorities, dependencies and sale gates. **PROPOSED / awaiting founder review; implementation not started.** This document is a historical component plan. Its shipped work is retained; residual work is mapped into G30 §3/§12. Older “continuous”, “defaults ship” or lane-launch instructions do not authorise G30 implementation.

**Opened:** 2026-09-22 after G28 closed at v3.27.2. Standing directive: continuous.
**Tracked in:** `docs/plans/SOURCE-OF-TRUTH.md` § G29 · `ROADMAP.md` row G29.
**Status:** OPEN — lanes launching on v3.27.2 (`a6c8e38d0`).

## 1. Sources
- The free AI chain failed end-to-end on 2026-09-21 (DeepInfra worker timeouts, Gemini 429/503, Claude CLI 429, Groq 429, **Cerebras 402** = free tier exhausted, **SambaNova 404** = models gone) — 27 wasted attempts per run on dead rungs; the free-report funnel then fails after 3 attempts.
- Lane G28-A: the audit dump is not written when a run throws `ReportFullyDegradedError`, so a degraded run cannot be diagnosed after the fact; degraded quality rows carry the placeholder audit line.
- `ready-to-sale.md` gaps 3–4: the free real run is not exercised on production; evaluator seat on a Program plan sees founder-phase copy; `/startup-index` sample movers print "−99.0 1d" and list a +100 mover under "Biggest drops"; cookie / feedback pills overlap content on long phone pages; `/ja` login prints a report-only CSP line for the Google button.

## 2. Lanes (touched suites only; merge session runs the full suite once)
### A — Dead-rung pruning + capacity alerting (skills: monitoring-expert, debugging-wizard)
`scripts/cron/discover-models` (or the `/api/cron/discover-models` route) + `content/reports/ai-free-models.json`: a model that answered 402 / 404 / `model_archived` / `model_not_found` in the last 24 h is removed from the ladder until the next successful probe; provider-level 402 marks the provider "unfunded" on `/api/status.ai` and `/admin/ai-keys` with the founder item; the rate-limit storm hook already POSTs discover-models — make it also drop the dead rungs; one digest line when < 2 providers are healthy for > 1 h; unit tests on the pruning rule with the 2026-09-21 log lines as fixtures; `docs/ops/ai-providers.md`.
### B — Degraded-run diagnostics (skills: debugging-wizard, cdo)
`scripts/lib/self-report-core.mjs` + `run-for-project.ts`: write `tbr-audit-latest.json` (and a `degraded: true` marker with the provider strike ledger + per-wave timings) even when `ReportFullyDegradedError` is thrown; the quality row for a degraded run carries `providers_struck` and `deadline_hit_wave`; `/admin/funnel` Trust row shows "last run degraded (providers: …)" instead of the stale share; tests.
### C — Free-report real-run verification + persona copy (skills: playwright-e2e, cpo, customer-success)
Once providers are healthy (probe: `/api/status.ai` ≥ 2 healthy providers), run live-qa 43 with `LIVE_QA_SPEND_OK=1` ONCE (≈ US$0.07) from the merge session and attach the result to the close-out; lane C itself: the evaluator seat on a Program / Scout / Firm plan never sees founder-only chrome (phase banner "Phase 1 of 12", "Scout keeps doing…" copy on a Program plan) — persona-aware copy map + tests + live-qa 33 persona pin; cookie-prefs + feedback pills stack instead of overlapping content at 375 (one fixed slot); `/ja` login: allow-list the report-only CSP line for `accounts.google.com` in the page sweep with a reason.
### D — Startup Index sample logic (skills: svi-scoring, dataviz, ui-ux-pro-max)
`/startup-index` movers: a +100 % mover must never appear under "Biggest drops"; "−99.0 1d" from a placeholder baseline is suppressed (no prior close → "new"); sample data labelled as sample; unit pins; VI parity.

## 3. Acceptance
Dead rungs pruned automatically with a test on the 2026-09-21 fixture; a forced degraded run leaves a dump + provider ledger; free real run exercised once with a screenshot of the v3 report reaching a throwaway inbox (or an honest "providers still down"); persona copy pinned; index movers pinned; full unit + pdf; deploy 12/12; live-qa + link-check + sweep green; review + ui-ux check → fixes; SOT § G29 closed; `version.json` v3.28.0.
