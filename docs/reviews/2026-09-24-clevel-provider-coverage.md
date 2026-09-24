# C-level provider coverage — 24/09/2026

Status: source implementation, not deployed or quality-qualified. This review inventories direct `callAI` customer adapters in BlockID, including the proxy used by SVI. It does not claim every provider in the independent SVI runtime has been migrated.

All `blockid-report-v1` calls now remain DeepInfra-only, including CEO synthesis after exhaustion; the former direct Groq fallback and its 40-second reserve were removed. Explicit trusted `providerPolicy: "deepinfra-only"` covers customer adapters that do not have a report spend scope. It is not a spend authorization, does not fabricate a durable report budget, and leaves pre-existing credit/billing logic unchanged. Generic/background calls retain their existing chain.

## Covered adapters

Previously updated: `api/cfo-advisor/route.ts` and `api/cfo-advisor/commentary/route.ts`.

The following paths are relative to `web/`. Every production direct customer `callAI` expression in these files now carries the explicit provider restriction, except the mixed/shared `generateResearchSummary` function in CMO, which has no identified customer callsite. A TypeScript AST regression test guards the enumerated boundaries, while behavioral suites exercise the adapters and dispatcher.

| Customer adapter | Coverage |
|---|---|
| `src/app/api/support/route.ts` | Explicit DeepInfra-only |
| `src/app/api/revaluation/route.ts` | Explicit DeepInfra-only |
| `src/app/api/competitive-positioning/positioning/route.ts` | Explicit DeepInfra-only |
| `src/app/api/svi/modular/route.ts` | Explicit DeepInfra-only |
| `src/app/api/svi/research/route.ts` | Explicit DeepInfra-only |
| `src/app/api/svi/full-report/route.ts` | Explicit DeepInfra-only |
| `src/app/api/svi/report/route.ts` | Explicit DeepInfra-only |
| `src/app/api/svi/report-section/route.ts` | Explicit DeepInfra-only |
| `src/app/api/svi/ai-score/route.ts` | Explicit DeepInfra-only |
| `src/app/api/svi/pitch-deck/route.ts` | Explicit DeepInfra-only |
| `src/app/api/svi/report/qa/route.ts` | Explicit DeepInfra-only |
| `src/app/api/svi/report/section/route.ts` | Explicit DeepInfra-only |
| `src/app/api/startup-package/analyze/route.ts` | Explicit DeepInfra-only |
| `src/app/api/evidence/analyze/route.ts` | Explicit DeepInfra-only |
| `src/app/api/ai/share-structure/route.ts` | Explicit DeepInfra-only |
| `src/app/api/ai/action-plan/route.ts` | Explicit DeepInfra-only |
| `src/app/api/ai/equity-split/route.ts` | Explicit DeepInfra-only |
| `src/app/api/ai/vesting/route.ts` | Explicit DeepInfra-only |
| `src/app/api/ai/vesting-review/route.ts` | Explicit DeepInfra-only |
| `src/app/api/ai/esop/route.ts` | Explicit DeepInfra-only |
| `src/app/api/evaluation/[criterionKey]/ai-suggest/route.ts` | Explicit DeepInfra-only |
| `src/app/api/evaluation/[criterionKey]/ai-score/route.ts` | Explicit DeepInfra-only |
| `src/app/api/journal/reflect/route.ts` | Explicit DeepInfra-only |
| `src/lib/agents/tech-intelligence.ts` | Explicit DeepInfra-only |
| `src/lib/agents/grant-advisor-narrative.ts` | Explicit DeepInfra-only |
| `src/lib/agents/abn-trademark-guide.ts` | Explicit DeepInfra-only |
| `src/lib/agents/rnd-idea-lab.ts` | Explicit DeepInfra-only |
| `src/lib/agents/accelerator-drafter.ts` | Explicit DeepInfra-only |
| `src/lib/agents/cto-next-best-action.ts` | Explicit DeepInfra-only |
| `src/lib/agents/chro-team.ts` | Explicit DeepInfra-only |
| `src/lib/agents/grant-application-drafter.ts` | Explicit DeepInfra-only |
| `src/lib/ai-equity.ts` | Explicit DeepInfra-only |
| `src/lib/competitive-intelligence.ts` | Explicit DeepInfra-only |
| `src/lib/rnd-analysis.ts` | Explicit DeepInfra-only |
| `src/lib/action-plan/generate.ts` | Explicit DeepInfra-only |
| `src/lib/agents/cmo-market-research.ts` | Explicit DeepInfra-only for competitor/GTM writers; shared summary excluded |
| `src/lib/intake/analyze-input.ts` | Explicit DeepInfra-only |
| `src/lib/intake/deck-sections.ts` | Explicit DeepInfra-only |
| `src/lib/analyses/first-analysis/job.ts` | Explicit DeepInfra-only |
| `src/app/api/svi/dimensions/stream/route.legacy.ts` | Explicit DeepInfra-only |
| `src/lib/expenses/categorise.ts` | Explicit DeepInfra-only |

## Existing scoped coverage

- `lib/analyses/first-analysis/report-v2-job.ts`, `lib/report-pipeline/run-for-project.ts`, `lib/report-pipeline/run-report-pipeline.ts`, `lib/paywall/report-generator.ts`: report policy selects DeepInfra with existing report admission/accounting.
- `lib/intake/visual-transcript.ts`: scoped vision and report budget.
- `api/investor-portal/ai-generate/route.ts`: existing scoped policy for SVI proxy calls/retries; visual/research have their additional gates. SVI `src/lib/ai/scoped-proxy.ts` validates DeepInfra and policy in returned responses.
- `lib/report-pipeline/agent-dispatcher.ts`, `orchestrator.ts`, `executive-summary.ts`: injected pipeline transports; do not add a second router at these abstraction layers.

## Exclusions and remaining work

- `api/cron/*`, `api/admin/rnd`, `lib/valuation/multiples-refresh.ts`: background/admin work, unchanged by the customer-provider migration.
- `api/feedback`, `api/journal/route.ts`: internal feedback evaluation and asynchronous journal reflection, excluded rather than reclassifying them as customer C-level generation. Explicit monthly reflection endpoint is covered above.
- `api/internal/ai-complete`, `lib/adk/agent.ts`, CMO `generateResearchSummary`: generic/injected/shared capabilities; caller-specific routing required before imposing a customer restriction.
- `lib/agents/cfo-financial-projection.ts` and `cfo-valuation.ts`: owned by the parallel valuation implementation; that owner has now added the explicit DeepInfra-only restriction at the narrative/pricing seams. Their behavioral changes/tests belong to that separate slice.
- Independent SVI `src/lib/ai/client.ts` still contains other provider chains. Scoped BlockID proxy validation does not prove all independent SVI tasks use that proxy; complete its caller/transport inventory before declaring cross-app closure.
- Legacy `api/svi/research` passes an Anthropic web-search tool that DeepInfra does not execute. Provider restriction does not supply search results; real research/source validation remains open.
- Provider coverage does not certify legacy scoring, equity, valuation prompts, fallback prose or deterministic heuristics. Those semantics remain subject to G31/G32 truth gates.

## Models and limits

No model admission or prices changed. Restricted paths use the existing admitted ladder: report V3.2 → Qwen3-235B Instruct → V4 Flash; synthesis admitted V3.2/V4 Flash; classify V4 Flash. Existing deadline-aware ordering may choose Flash earlier. Vision remains the admitted Qwen3-VL-235B lane. Flash-0731, smaller vision models and Llama judges were not promoted. Cheapest role-qualified selection still requires held-out quality and measured cost/accepted-report results.

No deployment, live inference or capacity benchmark was performed. Account concurrency, role quality, complete report costs and runtime activation remain unverified by this source change.

## Validation

Consolidated focused run: **27 suites / 752 tests passed**, including the 41-adapter AST boundary guard and existing customer behavior suites. Earlier dispatcher/CFO route slice: **3 suites / 240 tests passed**. `git diff --check` passed. These are local mocked/source checks, not production provider qualification.
