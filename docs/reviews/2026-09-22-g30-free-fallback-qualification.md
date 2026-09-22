# O01 exact free fallback qualification — 2026-09-22

Baseline: isolated `g30-free-fallback-qualification` from `b05afeffb`. No primary edits, live provider activation, credentials read, authenticated account requests, inference, purchases or deployment. Network research was public documentation and two unauthenticated metadata GETs only.

## Current source evidence

- `web/src/lib/ai-client.ts`, `callAITracked`: `blockid-report-v1` bypasses the legacy gateway and restricts its chain to configured DeepInfra. Legacy discovery/probes remain outside this scoped chain. This implementation does not alter that behavior.
- `web/content/reports/ai-free-models-verified.json`: checked-in date 2026-09-13, nine OpenRouter IDs. `api/cron/verify-models/route.ts` sends a four-token `ok` ping and admits both successful and rate-limited responses. This establishes neither report-quality evidence nor available quota. A successful ping can also lack response content. These artifacts cannot qualify the report fallback.
- `known-good-pool.ts` uses curated families/context and availability assumptions; these are not evidence of investor-report quality, exact current endpoint pricing, privacy permission or account entitlement. No pool/discovery configuration changed.

## Official current provider contract

A free variant is its own catalog entry with its own endpoints and pricing. The official documentation explicitly describes these listed variants as access without cost; the exact `:free` entry must exist. We preserve a dated quote artifact bound to the sampled ID. This can attest an omitted optional request-price field, but cannot override any nonzero endpoint price. [OpenRouter Free Variant](https://openrouter.ai/docs/guides/routing/model-variants/free)

Official published baseline is 50 requests/day and 20/minute, with higher daily allowance associated with prior credit purchases. No purchase is proposed or made. Models share account capacity: choosing more model IDs or keys does not multiply the account allowance. Runtime must read actual counters, not infer entitlement from a boolean paid/free label. [Official OpenRouter overview](https://openrouter.ai/blog/tutorials/any-coding-agent/), [limits API](https://openrouter.ai/docs/api_reference/limits)

The limits reference exposes `free_model_daily_requests` used/limit/remaining through `GET /api/v1/key`; `usage_daily` is credit usage, not the remaining free-request count. It says minute quota is not exposed there; retain an account-wide synchronized minute ledger. Honor 429/Retry-After and 402, without switching to paid models or purchasing quota. Account quota/auth availability was not checked in this task. [OpenRouter limits](https://openrouter.ai/docs/api_reference/limits)

Routing can constrain provider endpoint, accepted prices and supported parameters. Use exact model plus endpoint, zero prompt/completion/request maximum price, no fallback, no plugins, required parameters, data collection denied and ZDR. If these constraints leave no eligible endpoint, return unavailable. They do not prove an endpoint meets private-data policy without separate authorization. [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)

The random free router cannot preserve qualification of one specific model; it remains excluded from this mechanism. [Free Models Router](https://openrouter.ai/openrouter/free)

## Collected public metadata, not qualification

Unauthenticated `GET https://openrouter.ai/api/v1/models` returned 21 exact `:free` entries at the saved timestamp. The factual ID/pricing/capability snapshot is `web/content/ai-qualification/openrouter-candidates-2026-09-22.json`. This is a point-in-time response, not an exhaustive availability promise, current quota or ranking. The separately rendered free-router page showed a different count; use the exact endpoint response at dispatch and do not reconcile counts by inventing availability.

One existing registry ID, `nvidia/nemotron-3-super-120b-a12b:free`, was sampled through its public `/endpoints` GET. Its reported endpoint tag was `nvidia`, token prices zero, context 262144 and structured-output parameters present. No request-price field appeared. The documented free-variant contract covers that optional omission when fresh and model-bound. Model size, context and uptime do not establish analytical quality. [Endpoint API contract](https://openrouter.ai/docs/api/api-reference/endpoints/list-all-endpoints-for-a-model)

No model has new quality evidence from this work. The reviewed manifest is deliberately empty; all candidates remain unqualified for actual report dispatch.

## Implemented mechanism and boundaries

`free-fallback-qualification.ts` reads a strict reviewed manifest and SHA-256-bound artifacts. `free-fallback-artifacts.ts` reads only deployment-owned content paths. No browser-supplied artifact path, secret, network call or account mutation is accepted.

- Exact free model ID and endpoint identity; ambiguity and duplicates reject. Official endpoint snapshot freshness <=1 hour; review, quality and documented zero-cost contract <=7 days; future dates reject.
- Explicit zero prompt/completion pricing and every emitted charge component. Missing optional request price requires the documented zero-cost contract. Unknown/nonzero prices reject. Context/output capacity and required structured-output parameters must satisfy the requested workload.
- Scope is **scoped_assessment only**, not blanket approval for every report task. Required EN and VI rubric cases: source attribution, wrong entity/same number, missing evidence, contradiction, injection, investor implication and score abstention. Every case must pass schema and reviewed assertions within 60 seconds with zero unsupported claims/fabricated citations/cost, and attest the served exact model/endpoint. Preserve original prompt, fixtures and each result by hash. A summary claiming passed without retained artifacts rejects. Repository review is the trust boundary; hashes are integrity checks, not automated semantic proof.
- Authenticated inference/privacy permission and matching account quota are required. Quota snapshot <=30 seconds, same UTC day, no active throttle, at least six daily requests and two minute slots remaining. This leaves headroom; thresholds are product policy, not provider guarantees. Missing shared-account ledger sync rejects.
- Even an eligible candidate has `executionAllowed=false`. Acquire an atomic account-wide quota reservation and wire the scoped transport before dispatch. This loader does not make a stale snapshot safe against concurrent dispatches by itself. Failed requests/retries require fresh quota policy, never blind paid fallback.

## Next bounded implementation / evaluation

1. Add synchronized authenticated quota observer + atomic request reservation across all users/keys sharing an OpenRouter account. Confirm existing authorized auth context without exposing tokens. Do not assume paid status grants 1000 daily requests; consume actual counters.
2. Recheck endpoint metadata and documented zero-cost contract, then run only synthetic/public-data EN/VI fixtures through the exact pinned endpoint with zero-price/no-plugin/no-fallback constraints. Set a small total request budget, respect quota headroom/Retry-After, preserve returned exact model/provider, receipt cost and raw output. No private decks in qualification fixtures.
3. Review assertion quality, concrete investor usefulness, uncertainty, contradictions and JSON completeness. Compare against the existing approved DeepInfra baseline without starting new paid calls; if no comparable evidence exists, report that gap. Passing 14 minimum cases is bounded qualification evidence, not proof of general best quality.
4. Commit reviewed result artifacts and one exact scoped manifest entry only after evidence passes. Integrate behind scoped policy with complete account/quota reservation and response identity/cost checks. DeepInfra remains primary; no qualification means fallback unavailable, not a silent downgrade.

## Verification

Seven focused synthetic tests passed using a standalone `/tmp/g30-free-vitest.config.mjs` and private `/tmp/g30-free-qualification-cache/vite` cache after root confirmed the dependency snapshot complete. Cases cover exact free ID vs paid/random aliases, current documented cost contract vs missing/nonzero pricing, stale/tampered artifacts, full EN/VI rubric and served identity, account/quota boundaries, duplicates and insufficient capacity. Targeted ESLint passed. No broad build/typecheck or live inference performed.
