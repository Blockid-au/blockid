# AI providers — tiering, keys, limits, cost (S31-A, 2026-09-13)

Every AI call on blockid.au goes through `web/src/lib/ai-client.ts`
(`callAI()`), which dispatches across providers by **tier**, **real
headroom** and **validity**. This runbook is the operator view: which env
var unlocks what, what the status page tells you, what a trial wave costs,
and how the guardrails stop a surprise bill.

## 1. Tiers (what runs first)

| Tier | Providers | When it is used |
| --- | --- | --- |
| **quality** | `claude-apikey` — Anthropic API via `@anthropic-ai/sdk` 0.125 (`web/src/lib/ai/anthropic-tier.ts`) | **First**, whenever `ANTHROPIC_API_KEY` is valid and the daily cap has headroom |
| **free** | Groq, Cerebras, SambaNova, OpenRouter free models, Ollama, Claude subscription OAuth (`~/.claude/.credentials.json`) | Overflow for the quality tier; the whole platform when no key is funded |
| **paid overflow** | DeepInfra, `ANTHROPIC_HAIKU_API_KEY`, proxy | Only when every free provider is saturated or cooling, never past the daily cap |

Within a tier the dispatcher picks the provider with the most **remaining
capacity** (Anthropic: the `anthropic-ratelimit-requests-remaining` /
`-tokens-remaining` headers of the last response; others: a per-minute RPM
window). A provider whose last probe says `invalid_key`, `quota_exceeded`
or `low_credit` is **never dialled** while that verdict is fresh (15 min); an
Anthropic 401 latches the key invalid for 1 h and logs once.

### Model routing on the quality tier (by task class)

| `taskClass` | Model | Effort | Used for |
| --- | --- | --- | --- |
| `classify` | `claude-haiku-4-5` | – | categorisers, extractors, OCR/deck classifiers, SVI signal parsing, any call with `maxTokens ≤ 600` |
| `report` (default) | `claude-sonnet-5` | `medium` | reports, narratives, chat |
| `synthesis` | `claude-opus-5` | `high` | CEO final synthesis (`orchestrator.ts` executive summary), valuation certificate narrative |

Inferred from `agentId` / `maxTokens` when a caller does not pass
`taskClass`. Override per class with `ANTHROPIC_MODEL_CLASSIFY|REPORT|SYNTHESIS`.
The stable system prompt is sent first as a `cache_control: ephemeral`
block (cache reads = 10 % of input price); calls with `max_tokens > 8000`
stream. Adaptive thinking is on by default on Opus 5 — no `budget_tokens`,
no prefill, no `temperature` on Sonnet 5 / Opus 5.

## 2. Environment variables

| Var | Default | Meaning |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | – | **Unlocks the quality tier.** Console → API keys. Restart the app (`scripts/deploy-live.sh` or `pm2 restart`) — the key is read at call time, the probe within 15 min. |
| `AI_DAILY_SPEND_CAP_AUD` | `50` | Paid tiers (Anthropic, DeepInfra, Haiku-direct…) are skipped once today's estimated paid spend reaches this. Free tiers + OAuth keep serving. `0` disables. Resets 00:00 UTC. |
| `OPENROUTER_MIN_CREDIT_USD` | `2` | OpenRouter is skipped when `GET /api/v1/credits` reports fewer remaining credits. |
| `AI_USD_AUD_RATE` | `1.55` | FX used for the AUD cap. |
| `ANTHROPIC_MODEL_CLASSIFY/REPORT/SYNTHESIS` | see table | Pin a class to another model. |
| `AI_MAX_CONCURRENT` / `AI_MAX_QUEUED` | `120` / `400` | Dispatcher concurrency + bounded wait queue. |
| `AI_MAX_PER_USER` / `AI_USER_QUEUE` | `2` / `6` | Per-user fairness: in-flight cap + short queue, then 503. |
| `AI_BACKGROUND_RESERVE` | `0.25` | Share of slots crons may never take (kept for users). |
| `AI_QUEUE_WAIT_MS` | `45000` | Max time a queued call waits before a 503. |
| `AI_MODEL_PRUNE_STRIKES` | `3` | Consecutive failed health checks before a free model is pruned. |
| `AI_PROVIDER_PROBE` | – | `off` disables the boot-time probe kick. |
| `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `CEREBRAS_API_KEY`, `SAMBANOVA_API_KEY`, `DEEPINFRA_API_KEY`, `ANTHROPIC_HAIKU_API_KEY`, `ANTHROPIC_PROXY_API_KEY` + `ANTHROPIC_PROXY_BASE_URL`, `OLLAMA_HOST` | – | Free / overflow providers (unchanged). |

Never paste a key into a log, doc or chat — code only ever prints key
**length** and the first three characters.

## 3. Adding the Anthropic key (founder steps)

1. Create a key at console.anthropic.com → API keys, fund the org (Billing →
   add credit; prepay ≥ A$150 for a 1,000-founder trial wave, see §6).
2. On the server: set `ANTHROPIC_API_KEY=sk-ant-…` in `web/.env.runtime`
   (the file the PM2 process loads), then `bash scripts/deploy-live.sh` or
   `pm2 restart blockid` so the process re-reads env.
3. Verify without spending: `cd web && npx tsx --env-file=.env.runtime
   scripts/ai/probe-providers.ts --force` → expect `anthropic  valid  rpm=…
   tpm=…`. The same probe runs every 30 min in `ai-health-check` and lazily
   on the first request after boot.
4. Check `/api/status` (Bearer `STATUS_FULL_TOKEN`): `ai_providers.
   quality_tier_ready: true`. From then on every report / chat / classifier
   call takes the Anthropic tier first; the free tiers stay as overflow.
5. Optional: top up OpenRouter (openrouter.ai/credits) above
   `OPENROUTER_MIN_CREDIT_USD` so the free-model overflow is not skipped.

Rotate: replace the value, restart, re-run the probe. A revoked key is
detected within one request (401 → latched 1 h) and shows as `invalid_key`.

## 4. Expected Anthropic limits by usage tier

Rate limits are per organisation and grow automatically with cumulative
spend (Console → Limits shows the live figures). Approximate, Sep 2026:

| Usage tier | Prepay to reach | RPM (Sonnet 5 / Opus 5) | Input TPM | Output TPM | What it means for a trial wave |
| --- | --- | --- | --- | --- | --- |
| 1 | US$5 | 50 | 30–50k | 8–10k | ~5 concurrent reports; a wave queues (503s) |
| 2 | US$40 | 1,000 | 450k | 90k | ~50 concurrent reports — enough for 100 founders/hour |
| 3 | US$200 | 2,000 | 800k | 160k | 1,000-founder day without queueing |
| 4 | US$400 | 4,000 | 2M | 400k | headroom for launch-day spikes |

The dispatcher reads the real remaining RPM/TPM off every response and
ranks Anthropic accordingly, so a tier upgrade is used the moment Anthropic
grants it — nothing to redeploy.

## 5. Cost model (list prices, USD per 1M tokens)

| Model | Input | Output | Cache read (10 %) |
| --- | --- | --- | --- |
| claude-haiku-4-5 | 1 | 5 | 0.10 |
| claude-sonnet-5 | 2 | 10 | 0.20 |
| claude-opus-5 | 5 | 25 | 0.50 |

## 6. Trial wave: 1,000 users × 3 reports

Per founder (typical SVI journey: 3 reports = ~8 Sonnet calls + 1 Opus
synthesis + ~6 Haiku classifications; system prompts ≈ 4k tokens cached,
user content ≈ 6k tokens fresh, outputs ≈ 3k tokens each):

| Item | Tokens (in / out) | Model | USD |
| --- | --- | --- | --- |
| 8 report calls | 8 × (6k fresh + 4k cached) / 8 × 3k | Sonnet 5 | 8 × (0.012 + 0.0008 + 0.030) = **0.342** |
| 1 CEO synthesis | 12k fresh + 4k cached / 3k | Opus 5 | 0.060 + 0.002 + 0.075 = **0.137** |
| 6 classifications | 6 × 3k / 0.3k | Haiku 4.5 | 6 × (0.003 + 0.0015) = **0.027** |
| **Per founder** | | | **≈ US$0.51 (A$0.79)** |
| **1,000 founders** | | | **≈ US$510 (A$790)** |

Rule of thumb: **A$0.80 per founder for three reports** at list price,
~A$0.55 with a warm prompt cache. At the default `AI_DAILY_SPEND_CAP_AUD=50`
the platform serves ≈ 60 founders/day on the quality tier before it falls
back to the free tiers; raise the cap to `800` for a one-day 1,000-founder
wave, or `200` to spread it over a week. The monthly hard stop is US$100
(`MONTHLY_BUDGET_USD` in `ai-client.ts`) — raise it in code for a wave.

## 7. Reading `ai_providers` on `/api/status`

`GET /api/status` with `Authorization: Bearer $STATUS_FULL_TOKEN` (trusted
payload only — never on the public payload):

```json
"ai_providers": {
  "updated_at": "2026-09-13T23:52:41.806Z",
  "providers": {
    "anthropic":    { "status": "invalid_key", "checked_at": "…", "detail": "API key is invalid." },
    "claude-oauth": { "status": "valid", "checked_at": "…", "detail": "subscription (personal CLI credential — not a product licence)" },
    "claude-proxy": { "status": "invalid_key", "checked_at": "…", "detail": "Invalid API key" },
    "openrouter":   { "status": "low_credit", "checked_at": "…", "headroom": { "credits_remaining_usd": 1.55 } },
    "groq":         { "status": "valid", "checked_at": "…", "headroom": { "rpm_remaining": 999, "tpm_remaining": 7927 } },
    "cerebras":     { "status": "not_configured", "checked_at": "…" }
  },
  "usable": 2,
  "quality_tier_ready": false
},
"ai_queue_depth": { "queued": 0, "queued_user": 0, "queued_background": 0, "running": 0, "max_concurrent": 120 }
```

| status | meaning | action |
| --- | --- | --- |
| `valid` | key accepted; `headroom` = what the provider granted | – |
| `invalid_key` | 401/403 | rotate the key (§3); provider is skipped |
| `quota_exceeded` | 402 / 429 / daily cap on the provider side | wait or fund; skipped |
| `low_credit` | OpenRouter credits < `OPENROUTER_MIN_CREDIT_USD` | top up |
| `unreachable` | timeout / DNS / 5xx | provider or proxy down |
| `not_configured` | no key | set the env var if wanted |

`quality_tier_ready` is the single boolean the founder needs: **true** = the
Anthropic key is present and valid. `ai_queue_depth.queued > 0` sustained
means the wave is bigger than `AI_MAX_CONCURRENT`; `queued_user` growing is
the signal to raise the Anthropic usage tier.

`/api/health` is an alias of `/api/status` and carries the same fields.

## 8. Guardrails in one place

- **Daily cap** — `AI_DAILY_SPEND_CAP_AUD`; ledger `content/reports/ai-spend-daily.json`
  (estimated from real Anthropic `usage`, list prices, cache reads at 10 %).
  At the cap every paid provider is skipped, free tiers + OAuth continue, the
  founder gets ONE `ai_capacity` notification (feed + bell + Telegram) per day.
- **OpenRouter floor** — `OPENROUTER_MIN_CREDIT_USD`.
- **Invalid key latch** — 1 h, logged once, never retried on the hot path.
- **Backpressure** — bounded two-lane queue (users before crons, 25 %
  reserve), max 2 in-flight per user; overflow is a **503 + `Retry-After`**
  with `{ code: "ai_capacity_busy", retry_after_sec }` on every user-facing
  AI route (`web/src/lib/ai/capacity.ts`), never a 500.
- **Dead-model pruning** — `ai-health-check` (every 30 min) removes a free
  model from `content/reports/ai-free-models.json` after 3 consecutive failed
  checks and keeps it out of `refresh-models` / `discover-models` for 7 days
  (`content/reports/ai-model-strikes.json`).

## 9. Files

| Path | Role |
| --- | --- |
| `web/src/lib/ai-client.ts` | dispatcher: tiers, capacity, queues, cooldowns |
| `web/src/lib/ai/anthropic-tier.ts` | SDK tier: routing, caching, streaming, errors, headers |
| `web/src/lib/ai/provider-status.ts` | probes + `ai-provider-status.json` + status summary |
| `web/src/lib/ai/spend-guard.ts` | daily cap, OpenRouter floor, founder notification |
| `web/src/lib/ai/capacity.ts` | `AICapacityError` → 503 contract for routes |
| `web/src/lib/ai/model-strikes.ts` | dead-model strikes + pruning memory |
| `web/scripts/ai/probe-providers.ts` | on-demand probe CLI (exit 2 = no usable provider) |
| `web/src/app/api/cron/ai-health-check/route.ts` | 30-min cron: model pings + provider probe + pruning |
