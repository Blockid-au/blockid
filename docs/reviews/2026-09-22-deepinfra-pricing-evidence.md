# DeepInfra report/review price evidence — 22 September 2026

This is a **non-executing pricing draft**, not a model-quality qualification, account entitlement, customer spend consent or live policy. The companion [machine-readable draft](2026-09-22-deepinfra-pricing-policy.draft.json) is outside runtime configuration and sets every model's `runtimeEligible` to false.

The inspected source is BlockID commit `6009f5da1` (`web/src/lib/ai-client.ts`). Its frozen report chain is V4 Flash → V3.2 → Qwen235B → gpt-oss120b; synthesis is V4 Flash → V3.2 → KimiK2.6. No IDs, ordering or providers were changed. Classify-only Llama is outside this research scope.

## Current official evidence

Observations were made at approximately 19:01 UTC on 22 September 2026 using official public model pages and unauthenticated **GET** model metadata. No account key, dashboard, inference, tokenizer, paid API call or customer data was used. All five exact IDs appear in the public catalog with no deprecation/replacement advertised. Catalog presence does not prove the particular account can execute an inference or that capacity is currently available.

| Exact existing model ID | Standard input USD / million | Standard output USD / million | Context tokens | Explicit provider output ceiling | Draft price/ceiling evidence complete |
| --- | ---: | ---: | ---: | ---: | --- |
| `deepseek-ai/DeepSeek-V4-Flash` | 0.09 | 0.18 | 1,048,576 | 65,536 | Yes; runtime still off |
| `deepseek-ai/DeepSeek-V3.2` | 0.26 | 0.38 | 163,840 | Unknown/null | No |
| `Qwen/Qwen3-235B-A22B-Instruct-2507` | 0.09 | 0.55 | 262,144 | Unknown/null | No |
| `openai/gpt-oss-120b` | 0.037 | 0.17 | 131,072 | 131,072 | Yes; runtime still off |
| `moonshotai/Kimi-K2.6` | 0.75 | 3.50 | 262,144 | Unknown/null | No |

Prices and context corroborate the official pages: [V4 Flash](https://deepinfra.com/deepseek-ai/DeepSeek-V4-Flash), [V3.2](https://deepinfra.com/deepseek-ai/DeepSeek-V3.2), [Qwen235B](https://deepinfra.com/Qwen/Qwen3-235B-A22B-Instruct-2507), [gpt-oss120b](https://deepinfra.com/openai/gpt-oss-120b), [KimiK2.6](https://deepinfra.com/moonshotai/Kimi-K2.6).

The exact output ceilings come from the `max_output_tokens` field of the official model-info endpoints: [V4 Flash metadata](https://api.deepinfra.com/models/deepseek-ai/DeepSeek-V4-Flash), [V3.2 metadata](https://api.deepinfra.com/models/deepseek-ai/DeepSeek-V3.2), [Qwen metadata](https://api.deepinfra.com/models/Qwen/Qwen3-235B-A22B-Instruct-2507), [gpt-oss metadata](https://api.deepinfra.com/models/openai/gpt-oss-120b), [Kimi metadata](https://api.deepinfra.com/models/moonshotai/Kimi-K2.6). Endpoint shape is documented in [DeepInfra model-info reference](https://docs.deepinfra.com/api-reference/models/models-info). The draft records observation timestamps and full-response SHA256 hashes with the extracted facts; it does not retain entire model cards or arbitrary API bodies.

The provider-owned [OpenRouter-format catalog](https://api.deepinfra.com/openrouter/models) also exposes no output maximum for the three null-ceiling models. Its name does not authorize an OpenRouter fallback. The general [chat guide](https://docs.deepinfra.com/chat/overview#max-output-tokens) describes a 16,384-token cap for most models, not an exact guarantee for every ID. The general [request schema](https://docs.deepinfra.com/api-reference/chat-completions/openai-chat-completions) accepts a much broader numeric range and applies each model's context limit. Neither generic number can safely replace the missing per-model ceiling. The current application's own 16,384 cap is a request bound, not provider evidence.

## Conservative reservation design

A request must remain one text-only system/user conversation, one completion, exact allowed model, standard service tier, and no explicit paid cache retention. Current source constructs that narrow payload. The [service-tier guide](https://docs.deepinfra.com/chat/overview#service-tier) states omitted tier uses standard pricing; optional priority is more expensive and flex can wait substantially longer or fall back to standard pricing when unsupported. Do not subtract a hoped-for cache/flex discount from a grant. The [reasoning guide](https://docs.deepinfra.com/chat/reasoning#notes) states reasoning contributes to output billing.

The proposed strongest bound is deliberately conservative:

```text
maximumCostMicroUsd = ceil(
  (verifiedContextTokens * inputNanoUsdPerToken
   + verifiedProviderMaxOutputTokens * outputNanoUsdPerToken) / 1000
)
```

These are integer nanoUSD/token prices, not floating dollar arithmetic. Input reserves the entire verified context; output independently reserves the full verified provider maximum. This overcounts mutually constrained input/output space intentionally. It needs no guessed chat-template overhead, characters-per-token conversion, or assumption that visible response text contains all billed reasoning tokens. It is an engineering upper-bound proposal derived from provider limits, **not a provider-issued quote**.

This yields a maximum held reservation of **106,169 microUSD ($0.106169)** for V4 Flash and **27,132 microUSD ($0.027132)** for gpt-oss120b at the observed prices. It is not the expected or final charge. Actual requests remain capped at 6,000 synthesis / 4,000 review output tokens. The draft also supplies smaller full-context-plus-requested-output examples, marked non-admissible until total billed reasoning/completion semantics are explicitly certified. Unknown output ceilings produce no reservable maximum and must be ineligible, even if a plausible estimate would be inexpensive.

A future trusted coordinator must atomically reserve this maximum against cumulative job/account budgets **before every internal model attempt**, bind it to the exact payload digest and durable job/purpose/batch identity, and deny replay. Authenticated reported total token usage may support reconciliation under the same immutable price version; missing, over-ceiling or ambiguous outcomes keep the full reservation. A timeout is not evidence of no charge. The final invoice remains a separate authority, including any account-specific tax/credit treatment not investigated here.

Use short-lived, reviewed evidence (proposed refresh no later than 24 hours after observation), exact endpoint/model/price-policy binding, and denial on stale/missing/changed facts. This refresh interval is an operational proposal, not a guarantee that public prices cannot change sooner. The present draft never becomes active merely because its date is recent.

## Remaining admission constraints

- Price/limit completeness is not business-analysis quality. Existing source candidates need task-specific grounding, contradiction, entity/date/unit and report-quality evaluation; model names, benchmark marketing or parameter counts do not certify them.
- No free fallback is qualified here. Preserve DeepInfra as primary and keep external fallback empty until an exact model's quality, zero-charge entitlement and account quota are independently verified.
- Preserve explicit unknowns for V3.2, Qwen and Kimi. Request official confirmation or an explicit updated model metadata ceiling; do not substitute another provider's limit or silently replace the model.
- The existing attempt-budget denial is terminal. Therefore an unqualified intermediate model in the frozen ladder stops execution instead of automatically reaching a later qualified model. A future reviewed allowed-model selection must explicitly handle this without changing the chain through discovery or treating denial as permission to try another provider.
- The current grant hook needs a real trusted coordinator and job-bound gateway authorization before activation. Nothing in these documentation files provides those authorities, validates account access, changes runtime flags or initiates a model call.

Validation was limited to JSON parsing, exact source-chain comparison, source-file hash, positive integer price/unit conversion, eligibility/null-ceiling checks and recomputing both conservative integer bounds. No compilation, deployment, primary-worktree edit or live runtime mutation was performed.
