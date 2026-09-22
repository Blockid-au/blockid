# G30 final revalidation — 22/09/2026

Evidence annex only. The only implementation plan remains [G30 SOURCE OF TRUTH](../plans/SOURCE-OF-TRUTH.md). Review is read-only; no application code, database/Stripe/config changes, inference, checkout, customer sends or deployment performed in this review. Documentation edits are proposed, not implementation approval.

## Baselines and limits

- Local HEAD `83c6a55d381d390719667a7b96564472ba2bfc74`, package3.28.1;382 page.tsx,682 API route.ts,5305 src files at review. Risk-based whole-project inventory and focused paths, not every line read or all authenticated states exercised.
- Local deployment manifest: same full SHA, deployed_at2026-09-22T04:20:22Z. Direct HTTP and browser04:23–04:24UTC: `/api/status`, `/version`, `/pricing`, `/showcase/blockid/report` returned200 with v3.28.1 indicators. Public version string plus local manifest is consistent, but does not independently prove every running process has identical code.
- `/version.json` returned404; use `/api/status` and `/version`. Web search rendered cached pricing with v3.17.0; direct fetch/browser was v3.28.1. Do not classify stale search copy as latest live defect. A later urllib request with its default user-agent got403 on status, so status access may differ by client; earlier explicit review-agent request returned200.
- Production private DB/migration ledger, account-specific Stripe mapping and provider quotas/balances were not audited. Public model pricing from prior plan review remains a time-bound shortlist, not measured model quality or available capacity.
- Existing `live-qa-latest.json` records306passed/0failed/15skipped at2026-09-21T23:13:01.845Z; predates current deployment, not new v3.28.1 QA evidence. `project-state.json` remains3.17.0. Generated telemetry is not planning authority.

## Independent review lanes

Root integrated three bounded read-only agents: `report_review` (report/research/valuation/routing), `billing_data_review` (Stripe/credits/persistence/dashboard), `design_review` (source and public browser). Design agent used ui-ux-pro-max and playwright; browser closed without submissions. Their recommendations are reconciled in G30, not separate agent plans.

## Findings retained and new precision

| Finding | Source evidence | Plan disposition |
|---|---|---|
| Citation numeric match/model quote still accepted | `web/src/lib/report-pipeline/auto-cite.ts:152`,193; `report-v2/grounding.ts:56` | I01/I02; E03 remains required |
| Streaming before audit; context/cache/default economics issues remain | `orchestrator.ts:653`,676,710; `run-report-pipeline.ts:452`,477,544; `agents/cfo-valuation.ts:842` | I03–I10; F01–F04/E02/V01 remain required |
| Market branch uses general knowledge | `web/src/lib/adk/agents/market-research.ts:22`,83 | R01–R04 source retrieval, baseline external research required |
| Same-day snapshot update reuses identity/share token | `web/src/lib/report-pipeline/run-for-project.ts:799–850` | New I35; immutable report revision separate from daily score projection; two runs/day preserve both versions |
| DeepInfra-first config is not hard allowlist | `web/src/lib/ai-client.ts:964`,1071–1114 | I36; report/classify/interactive/default append must obey per-task policy |
| Shared AI registry consumed by excluded domain | `web/src/lib/ai/registry.ts:1–3` | I36; consumer-scoped BlockID policy, preserve registry compatibility |
| Credit grant read/upsert/ledger are separate | `web/src/lib/credits.ts:877–931` | I37; P0 atomic grant+ledger+fulfillment, preserve existing local atomic debit RPC715–792 |
| Top-up grant false can still ACK200 | `web/src/app/api/stripe/webhook/route.ts:310–354`,141–148 | I37; durable fulfillment state and retry, no false completed benefit |
| Duplicate webhook ID prevents failed-event retry | `web/src/lib/stripe/verify.ts:50–69`; webhook57–60 | I37; event lease/retry separate from purchase-level idempotency |
| Reconciliation exists but grant/revenue separate | `web/src/app/api/cron/stripe-reconcile/route.ts:86`,247–264 | Reuse common fulfillment op; missing revenue row is not proof credits ungranted |
| Remote spend ambiguous timeout may fallback locally | `web/src/lib/credits.ts:34–53`,631–652 | B03 operation lookup before retry, cross-backend idempotency |
| Update0rows can count as stored | `web/src/lib/report-v2/storage.ts:56–64`,72–80,103–111 | I38; affected-row/read-back and failed persistence gate |
| Latest/history scope not unified | `dashboard/landing-data.ts:81–120`,176–194; `analyses/dashboard-bridge.ts:65–92`; reports/history54–98 | T02/U07 typed identity, project scope, comparable deltas, pagination/error states |

## Progress to preserve

G29 provider dead-rung/unfunded/capacity/degraded diagnostics landed before release3.28.0. Free ReportV2 path already shares orchestrator. Local spend RPC, canonical credit pack ladder, retired-pilot handling and legacy checkout mapping exist. Release3.28.1 adds hub min-width and equity wizard h1 fixes. These are implementation baseline, not proof new G30 quality/cost/credits gates pass. Do not rebuild these components from scratch.

## Fresh public UX/output observations

Homepage remains programs/cohort-first; proposed business/investor copy is not shipped. At375×812 no body overflow; input aroundy633, Analysey685 with44px height; cookie buttonsy735. Multiple hero CTAs/intro leave limited intake space. Report dashboard starts aroundy1318 after long introduction; compact disclosure should follow key report assessment rather than precede it.

Showcase still snapshot136a49f5, generated21September, SVI135/composite87, evidence0%, verdictD, valuationA$3M–6.6M/ask aligned; confident narrative includes nearly100% margin. This confirms the problematic historical snapshot remains visible; it does not prove it was regenerated by3.28.1 or identify private metric inputs. Two CSP inline errors persisted, rendering worked; exact blocked script/function impact needs investigation.

Browser artifacts: `.playwright-cli/page-2026-09-22T04-23-33-796Z.yml`, `.playwright-cli/page-2026-09-22T04-24-02-485Z.yml`.

## Verification performed in this review

- `npm run typecheck`: passed exit0; `/tmp/blockid-g30-final-typecheck.log`.
- Scoped Vitest (report-pipeline/report-v2/credits/Stripe verify-webhook-reconcile/model-strikes/run-strikes):56 files,1061 tests passed,17.73seconds. `/tmp/blockid-g30-final-tests.log`.
- Targeted structured-result confirmation (auto-cite, Stripe verify, model-strikes):45 tests passed; `/tmp/blockid-g30-targeted-results.json`. These overlap scoped tests, not another45 independent cases.
- Existing tests passing does not cover the new adversarial/production cases above and is not a factual-accuracy, billing-integrity or sale-readiness sign-off. Full repository suite, paid E2E, private DB and fresh PDF generation not run.

## Final concurrent-release delta —04:30:29UTC

Another release process advanced HEAD to `3396adc00e78144ec86788db3fb03edf51abb1bc` / package3.28.2 during documentation integration. Reviewed diff: only `web/src/components/workspace/hub-tabs.tsx` adds relative positioning to contain a locked-tab sr-only span, plus CHANGELOG/version metadata. Report/billing/provider modules reviewed above unchanged. Public `/api/status` still returnedv3.28.1; local manifest3.28.2 had empty deployed_at. Thus latest source is3.28.2 but observed live is3.28.1 at this checkpoint, and3.28.2 browser/release verification remains unclaimed. This review did not author or deploy that code. G30 states both baselines explicitly.
