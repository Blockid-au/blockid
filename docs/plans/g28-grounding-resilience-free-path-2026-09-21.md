# G28 — Grounding to the KPI · provider resilience · free-grant path on ReportV2 · print + SVI app parity

**Opened:** 2026-09-21 after G24–G27 closed at v3.26.1. Standing directive: continuous — lanes → merge → full suite once → deploy → full QA + ui-ux check + review → fixes → close.
**Tracked in:** `docs/plans/SOURCE-OF-TRUTH.md` § G28 · `ROADMAP.md` row G28.
**Status:** CLOSED 2026-09-22 — v3.27.0 → v3.27.2 live; lanes A/B/C/D shipped; review 2 P1 / 3 P2 / 3 P3 + 7 UX fixes shipped; KPI 0.85 pinned, not verified live (provider outage); see SOT § G28.

## 1. Sources
- G24-D / G27 close: showcase `groundedShare` 0.82 vs KPI 0.85; residuals = model-invented specifics the critic catches (customer_size "2.7 % conversion", gtm "1,400 entities", documents ASIC fee, website content strategy).
- Two showcase re-runs on 2026-09-21 degraded FULLY (8 deterministic chapters, no report persisted) because DeepInfra answered worker timeouts / `engine_overloaded`; 120 s × several models burned the 480 s wall-clock before the chain fell through to Gemini / Claude CLI / Groq.
- Review v3.26.0 P2: the free-grant path (G25-C) e-mails the S32 first-analysis PDF, not the v3 document the spec § 6 promises.
- G27 deviations: `@page` print rules for the web report; `/tbr/demo?band=` demo of the four verdict bands.
- startupvalueindex.com (separate repo, `reference_svi_app_separate_repo`) still on its own dark exchange UI — the founder's light template rule applies site-wide.

## 2. Lanes
### A — Grounding ≥ 0.85 on real data (skills: svi-scoring, prompt-engineer, cdo, code-reviewer)
Owner-prompt rules for the residual patterns: the model must not state a conversion rate / market-entity count / statutory fee / channel cadence that is not in the register or the computed-fact rows → either cite a row or write the sentence as a declared estimate ("we estimate … [unevidenced]"); add computed rows the prompts already rely on (ASIC annual review fee band from `lib/legal`, sector entity counts from the market anchor when present); critic evidence includes the computed rows' provenance; two paid runs max (US$0.07); `tbr_quality` → `ok`.
### B — Provider resilience (skills: monitoring-expert, debugging-wizard)
`ai-client`: per-model timeout 45 s for the report pipeline (120 s only for synthesis), a provider showing ≥ 2 worker timeouts / `engine_overloaded` in a run is skipped for the rest of that run (run-scoped strike), the wall-clock budget reserves 120 s for W4 so a slow W1–W3 never produces 8 degraded chapters; a fully-degraded run is NOT persisted as a quality row that lowers the window (already true) and raises one digest line; unit tests with a fake clock; `docs/ops/ai-providers.md`.
### C — Free-grant path on ReportV2 (skills: stripe-saas-billing, react-expert, pdf)
`POST /api/intake` free runs route through the report pipeline that produces ReportV2 (`runTrustReportForProject` / `run-report-pipeline`) so runs 1–2 = the v3 document; the e-mail carries the investment-view page + PDF link; cost guard unchanged (cap + IP); `docs/design/tbr-v3-investor-report-spec.md` § 6 back to "full standard document"; live-qa 43 real-run path behind `LIVE_QA_SPEND_OK`.
### D — Print rules + band demo + SVI app light template (skills: ui-ux-pro-max, nextjs-16-expert)
`globals.css` `@page` + section `break-before` for the web report print; `/tbr/demo?band=A|B|C|D` renders the fixture band (force-static → generateStaticParams or a client switch); startupvalueindex.com: light tokens + primitives from `docs/design/unicorn-template.md` v2 (separate repo on :4002 — build + `systemctl restart`; coordinate its deploy after this repo's).

## 3. Acceptance
Showcase `groundedShare ≥ 0.85` (audit dump attached); a forced-timeout unit run shows the pipeline still produces ≥ 7 prose chapters within budget; free run 1 renders the v3 document and e-mails the investment view; `/tbr/demo?band=D` renders; SVI app light on 375/1280; full unit + pdf; deploy 12/12; live-qa + link-check + sweep green; review + ui-ux check → fixes; SOT § G28 closed; `version.json` v3.27.0.
