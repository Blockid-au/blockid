# O01 second free candidate and atomic quota boundary — 2026-09-22

Following `aff0184ad` on isolated `g30-free-fallback-qualification`. No paid calls, purchase, customer input, private deck, live Redis mutation, configuration activation or deployment.

## Second candidate: availability failure, no quality verdict

Selected `google/gemma-4-31b-it:free` for a bounded public/synthetic evaluation. Google documents multilingual support across140+ languages; this supports trying EN/VI, not assuming accuracy or investor-report quality. The current exact `google-ai-studio` endpoint reported zero token pricing, response_format support and context262144. [Google model card](https://ai.google.dev/gemma/docs/core/model_card_4)

The first request used explicit English instructions, fixed free model/endpoint, zero prompt/completion/request maximum prices, no paid fallback/plugins, and standard public-input privacy policy. It returned429 after150ms with no Retry-After. The batch stopped immediately:1 attempted,0 completions,13 unrun. No cost was returned and none is inferred. No third model or retry was attempted. Exact request, synthetic source, provider metadata and sanitized status are retained under `web/content/ai-qualification/evaluations/2026-09-22-gemma-free/`.

Both candidate histories remain preserved: Nemotron's locale/detail weaknesses and availability failures are not overwritten by the Gemma attempt. Neither is approved. The manifest remains empty because no complete reviewed quality evidence exists yet, not because model size or a ping is treated as qualification.

## Implemented quota observation/reservation

`free-quota.ts` adds a fixed-origin authenticated `/key` observer that returns only provider-account ID, timestamp and documented free-request counters. It does not return keys, account labels or credit balances. Missing/inconsistent counters fail closed; credit usage and is_free_tier never substitute for request quota. The API does not provide current minute allowance, so production needs a shared account ledger. [OpenRouter limits](https://openrouter.ai/docs/api_reference/limits)

The Redis adapter uses one Lua transaction with same-account hash-tagged keys. Concurrent requests reserve one daily slot and one rolling-minute slot atomically. It leaves five daily and two minute slots of headroom, clamps observations against already reserved capacity, prevents replay of one operation for7 days, and persists monotone account backoff. It uses Redis TIME for freshness checks. Failed/crashed dispatches are not speculatively refunded; conservative capacity may be lost until reset. New attempts need distinct operation identities. Outage fails closed; there is no in-memory fallback. Existing generic rate-limit code is untouched because its read/set path and fail-open behavior do not provide this guarantee.

Auth/account mapping must group every key/caller for the same OpenRouter account; this is provider capacity, not a shared BlockID/SVI customer wallet. `allAccountCallersUseLedger` must stay false until integration proves adoption by every relevant dispatcher/probe/cron. The adapter itself cannot discover external-account traffic; fresh provider counters and headroom remain necessary. Counter observations alone are not a race-safe reservation.

429/503/402 can set account backoff without shortening an existing block. Missing Retry-After uses conservative defaults; failures never trigger purchase or paid spillover. `executionAllowed=false` remains on quota reservations: qualification, policy-bound exact transport and response identity/cost enforcement still precede useful report output.

The qualification request now explicitly uses JSON-object response format and requires the corresponding endpoint capability, plus actual passing schema tests. It does not require a separate `structured_outputs` metadata flag when the requested mode is JSON-object rather than strict provider JSON-schema. This aligns capability checking to the request; it is not a quality exemption.

## Remaining integration

Wire trusted provider-account identity and an existing Redis connection into the observer/adapter. Observe counter, reserve an operation, then pass the exact account/day, observed timestamp, remaining daily/minute slots and confirmed ledger adoption into the reviewed qualification loader. Private data scope cannot use public-only evidence. If qualification subsequently rejects, keep the slot conservatively consumed; do not blindly retry or claim a charge. No live dispatcher wiring is enabled here.

A later scheduled bounded attempt may retry a candidate after provider cooldown, with unchanged zero-cost constraints, public-only fixtures, explicit EN/VI output requirements and all failures retained. Gemma has no semantic quality verdict from this attempt. No model receives approval until its complete scoped rubric passes and retained response cost/identity evidence supports it.

## Verification

Four real Redis scenarios passed in a disposable existing `redis:7-alpine` container (`--network none`, no hostports/mounts, memory limit, persistence disabled):25-way minute contention grants18; duplicate intent grants1; daily headroom cannot refill from a larger stale observation; backoff is monotone and accounts isolated. Container removed afterward. Twelve focused unit cases passed through private `/tmp` Vitest config/cache. Targeted lint passed. No broad build/typecheck.
