# `ai_runs` — the AI-run ledger (G24-B)

One row per structured LLM call the platform makes through
`lib/ai/call-structured.ts` (the report pipeline's owner, criterion and CEO
calls; the prompt-eval harness). Tables: `public.ai_runs` (0231) →
`public.prompt_versions` (0230). Nullable FK since 0435.

## What a row records

| column | meaning |
|---|---|
| `prompt_version_id` | the `prompt_versions` row the call ran with (see the rule below); `NULL` only on the exception path |
| `business_id` / `user_id` | `projects.id` being analysed (set null on erasure) / requesting `app_users.id` — pseudonymised, no PII |
| `model` | the model LABEL the caller asked for (`modelForAgent(role)`, e.g. `claude-opus-5`); **not** the provider that answered — the pipeline runs on the free chain through `modelCaller` |
| `input_hash` / `output_hash` | SHA-256 of canonical JSON — reproducibility without storing prompts or answers |
| `tokens_in` / `tokens_out` | provider usage on the direct Anthropic path; a `chars ÷ 4` estimate on the injected-transport path |
| `cost_usd` | list price for `model` × tokens (`MODEL_PRICING_USD_PER_1M`); 0 for a label not in the table |
| `latency_ms` | wall time incl. the one repair pass |
| `status` | `ok` · `schema_fail` (Zod failed twice) · `model_error` · `rate_limited` · `rejected` (guardrail) |
| `evidence_ids` | evidence rows the call was allowed to cite (the renderer cross-checks citations against it) |
| `purpose` | `customer_report` · `platform_self_upgrade` · `nightly_eval` · … |

Every terminal status writes a row, so a report's `runIds` always resolve.
An insert failure never fails the report — the caller gets a synthetic
`local-<ts>` id and the log line `[ai_runs] insert failed: …` (grep it).

## The prompt-version rule

Why the ledger was empty until v3.24: `prompt_versions` had never held a
row, so every `report-<role>` resolved to the NIL uuid
(`00000000-…`) and every insert failed on `ai_runs_prompt_version_id_fkey`.

Now:

1. **Register on first use.** `readOrRegisterPrompt(agent, defaults)`
   (`lib/ai/prompt-registry.ts`) returns the `prod` row for `agent`, or
   inserts the code-default prompt as `prod` — one row per
   `(agent, version)` with `version = CODE_PROMPT_VERSION`
   (`lib/report-pipeline/version.ts`), `model = modelForAgent(role)`,
   `purpose = customer_report` — and returns it. A race or an existing
   `(agent, version)` row of any status resolves to that row. Memoised
   10 min per role in the dispatcher (a canary promotion still reaches a
   running server).
2. **Bump `CODE_PROMPT_VERSION`** whenever `agent-prompts.ts` changes what
   the model sees. The next run registers `report-<role>@<new>` as prod
   (the old row stays for the rows that reference it); `ai_runs` can then
   be sliced by prompt generation.
3. **NULL is the exception path.** `call-structured.ts` writes
   `prompt_version_id = NULL` when the caller's id is NIL / not a uuid
   (Supabase was unavailable at resolve time) and retries an FK rejection
   once with NULL (a stale id after a manual `prompt_versions` delete).
   The row is never dropped. `ai_runs_unversioned_created_idx` finds them:

   ```sql
   select count(*), min(created_at) from public.ai_runs where prompt_version_id is null;
   ```

   A growing count means the DB was unreachable from the app or someone
   deleted a prompt row — check `[prompt_versions] register … failed` /
   `[ai_runs] prompt_version_id … is not registered` in the production log.

Canary / shadow / rollback (`promoteCanaryToProd`, `demoteCanary`, the
nightly eval) are unchanged; they operate on the same rows.

## Reading costs

Read-only, on the server:

```sh
docker exec supabase-db psql -U postgres -c "
select date_trunc('day', created_at) as day, purpose, count(*) runs,
       sum(tokens_in) tin, sum(tokens_out) tout, round(sum(cost_usd)::numeric, 4) usd_list,
       round(avg(latency_ms)) p_lat
from public.ai_runs where created_at > now() - interval '7 days'
group by 1, 2 order by 1 desc, 2;"
```

Per prompt version (which generation is expensive / failing):

```sh
docker exec supabase-db psql -U postgres -c "
select pv.agent, pv.version, pv.status, count(r.*) runs,
       sum(case when r.status <> 'ok' then 1 else 0 end) not_ok,
       round(sum(r.cost_usd)::numeric, 4) usd_list
from public.ai_runs r left join public.prompt_versions pv on pv.id = r.prompt_version_id
where r.created_at > now() - interval '30 days'
group by 1, 2, 3 order by runs desc;"
```

Caveats:

* `cost_usd` is the **list-price estimate for the model label**. The report
  pipeline is served by the free / quality-cost chain (DeepInfra-first,
  Anthropic API-key tier only when funded, Claude CLI fallback-only), so the
  ledger's USD is an upper bound on what those calls would cost on
  Anthropic — not the bill. Real paid spend is `lib/ai/spend-guard.ts` →
  `content/reports/ai-spend-daily.json` (`/api/status.ai`), and the per-run
  `costUsd` on `content/reports/tbr-quality.jsonl` is what the pipeline
  metered through `callAI`.
* Tokens on the injected-transport path are estimated (`chars ÷ 4`); treat
  ratios (repair-pass share, `schema_fail` rate, latency by role) as the
  reliable signals and USD as relative.
* `status <> 'ok'` by `purpose` is the fastest smoke check after a prompt
  change; `schema_fail` rising after a `CODE_PROMPT_VERSION` bump means the
  output contract and the prompt disagree.

## Degraded runs (G29-B)

A Trusted Business Report run that ends in `ReportFullyDegradedError`
(≥ 7 of 8 chapters on deterministic cards — G28-B) or throws mid-wave is
**not persisted and not charged**, but since G29-B it is diagnosable after
the fact from three places. Provider *names* only — never keys, project ids
or paths.

1. **The audit dump** — `content/reports/tbr-audit-latest.json` (gitignored)
   is written by `scripts/run-self-analysis.mjs --report --audit-dump` even
   when the run throws (the script then exits 1 and prints the path). On a
   degraded run the document carries:

   | field | meaning |
   | --- | --- |
   | `degraded: true` | the run produced no report; `reportId` / `snapshotId` are null |
   | `note` | `run degraded — no report persisted: <error>` |
   | `sections`, `register`, `summary` | every `SectionAuditRecord` the sweep produced before the throw (empty when the run died before the grounding sweep — `dumpAvailable: false`) |
   | `diagnostics.error` / `failedWave` | the thrown message and the wave the run was in (`gathering` · `wave1`–`wave4` · `synthesizing` …) |
   | `diagnostics.deadlineHit` / `deadlineHitWave` | whether the wall clock fired and the wave whose race it won (the soft W4-reserve deadline counts — `deadlineHitWave: "wave1"` with `deadlineHit: false` means W1 ate the whole W1–W3 window) |
   | `diagnostics.providersStruck` / `strikes` | the run-scoped strike ledger (`lib/ai/run-strikes.ts`): providers skipped for the rest of the run, and `provider → { strikes, timeout, overloaded }` for every provider that struck at all |
   | `diagnostics.waves` | per-wave timings `{ phase, startedAtMs, ms }` as run-for-project observed them (null when the pipeline predates the `run_diagnostics` event) |
   | `diagnostics.trail` | the script's own view: phases with timings, chapter outcomes (`dim`, `degraded`, `reason`, `score`) and `error` events, in order |

   The source is the `run_diagnostics` event `lib/report-pipeline/run-for-project.ts`
   emits right before re-throwing (`lib/report-pipeline/run-diagnostics.ts`);
   a good run has `degraded: false` and no `diagnostics` block.

2. **The quality row** — the `tbr-quality.jsonl` row of a degraded run
   (`words 0`, `degradedSections ≥ 7`) now also carries `providers_struck`
   (array) and `deadline_hit_wave` (string | null); the
   `[tbr-quality] …` log line prints both. Good rows are unchanged.

3. **Status + admin** — `/api/status.tbr_quality.last_degraded` is the latest
   no-report run in the 24 h window as `{ ts, providers_struck,
   deadline_hit_wave }` (null when every run produced a report). That row
   stays **excluded** from `groundedShareMedian` / `groundedShareLatest`
   (G28-B). `/admin/funnel` › Trust › "Report grounding" keeps the last GOOD
   run's share as its value and, when the latest run degraded, prefixes the
   note with `last run degraded at <ts> UTC (providers struck: …; deadline hit
   in <wave>) —` instead of printing the outage row's 0.

Reading a degraded dump:

```sh
node -e 'const d=require("./content/reports/tbr-audit-latest.json"); console.log(d.degraded, d.diagnostics?.failedWave, d.diagnostics?.deadlineHitWave, d.diagnostics?.providersStruck, d.diagnostics?.waves)'
```

`providersStruck` naming the first provider in the chain with
`deadlineHitWave: "wave1"` is the 2026-09-21 pattern (each W1 call sat
through the provider's model ladder before the ledger struck it) — a
provider-capacity problem, not a prompt problem. An empty ledger with a
`failedWave` and a thrown message is a code / schema failure: read the
`trail.errors`.

## Related

`docs/ops/ai-providers.md` (provider chain, the process-lifetime
`unconfigured` latch on a 401), `docs/ops/db-migrations.md` (apply 0435),
`docs/ops/slo.md` (the `tbr_quality` digest line).
