# DeepInfra smoke harness

Preparation for packet option A only. Eight fictional cases × eight existing role/model combinations = 64 attempts. No customer input, app imports, database writes, live retrieval, automatic promotion, fallback or retry. Python standard library only.

Dry run (no credential needed; refuses an existing artifact path):

```bash
python3 web/scripts/eval/g30-deepinfra-smoke.py --output /tmp/g30-deepinfra-smoke-manifest.json
```

Offline tests, including mocked transport:

```bash
python3 web/scripts/eval/g30-deepinfra-smoke.test.py
```

Only after root reconciles explicit numeric approval and account availability, with the key supplied privately through the process environment, example execution for the packet's proposed $0.50 ceiling:

```bash
python3 web/scripts/eval/g30-deepinfra-smoke.py --execute --budget-usd 0.50 --output /tmp/g30-deepinfra-smoke-execution.json
```

The command is not approval and has not been run. Do not put keys in command arguments. Existing artifacts cannot be overwritten; do not retry a stopped execution by changing filenames without reconciling the previous reservation and aggregate authorized spend. There is no automatic resume.

Budget assumptions: standard uncached rates checked 2026-09-22 on each exact model's official DeepInfra page (Llama via `/api`), listed in `/tmp/g30-deepinfra-eval-packet.md`. Requests reserve 4,000 input +1,000 output tokens each, $0.098944 total. Before execution confirm prices remain applicable and `max_tokens` bounds all billed output, including reasoning, for these exact IDs. Input guard uses UTF-8 content bytes plus 512 chat-template overhead as a conservative envelope; this is not certified model-specific tokenization. Actual usage above either reservation or provider estimated cost above the charge reservation halts subsequent work and requires reconciliation. A local reservation cannot recover charges already incurred if provider cap semantics differ. Do not claim an unconditional invoice guarantee.

Every attempt is reserved and fsynced before sending. Timeout, malformed output, absent usage/provider estimated cost, price overrun or returned-model mismatch stops the run; reservations are never refunded locally. A known standard-price calculation is recorded separately from provider `usage.estimated_cost`; missing provider cost stays null, never zero. Provider estimated cost is still an estimate, not a final invoice. Execution is serial, endpoint-pinned, refuses redirects and ignores environment proxies.

Deterministic checks require exact observed facts and expected source IDs, applicable missing-input markers, unavailable valuation, no unsupported/duplicate competitor names, competitor-source support, and a bounded EN/VI summary shape. Fact keys provide the requested extraction schema; expected numeric answers/source mappings are not sent. The gap vocabulary is shared across cases, not an answer key. The prompt requests no assessed company value because this tiny corpus contains none. This does not test available-valuation quality or certify all report roles.

All summaries still require human review for unsupported prose, semantic completeness and EN/VI equivalence. Passing JSON/fact checks does not imply the prose is accurate. Results record deterministic errors, returned model, latency, request/corpus/harness hashes, raw structured usage and separate standard-price/provider cost fields. No 40-development/20-holdout or full-report quality claim is supported. Compare cold/repeated prefix behavior in a separately approved phase; no cache savings, batch discounts or throughput claim here.
