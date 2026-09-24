# Live version test review — 24 September 2026

Scope: the whole running BlockID.au version (live SHA `a0b6f6f7d`, release `UWb-4fqM84OsmXgqVWEU5`, origin 4130) plus a light startupvalueindex.com check. The test ran after the peer stream-revision deploy finished and released the deploy lock. No code, schema or configuration was changed. Spend: 2 real free reports through the live-QA spec, approved by the founder, costing US$0.0015 of DeepInfra in total. Both QA accounts were erased and verified.

## What was run

| Check | Result | Notes |
|---|---|---|
| `/api/status` | 200, uptime 24 h 100 %, errors_1h 0, p95 marketing 188 ms | `tbr_quality.status = watch` despite `degradedShare 0.89`: the status does not go red on an outage |
| Live-QA full suite (`LIVE_QA_ALLOW_DB=1 LIVE_QA_ELEVATE=1`, no spend) | **307 passed · 0 failed · 15 skipped**, 12.4 min, erasure ok | Includes signed-in founder, evaluator and accelerator page sweeps. The 7 failures from 23/09 11:01 are resolved |
| Live-QA `43-free-reports` with `LIVE_QA_SPEND_OK` (2 real runs) | 6 passed, but **both runs fully degraded (8/8 sections, 0 words, US$0.0007 each)** | The spec treats a `failed` run as a pass with a `not-exercised` annotation (`43-free-reports.spec.ts:36–38`), so it reports green on an outage |
| Public page sweep | 140 pages, 0 defects | 59 dynamic routes skipped (no fixture) |
| Link check (BlockID, with sitemap) | 545 pages, 0 broken internal links, 464/464 sitemap URLs ok | 1 external timeout (treadstone.com.au); 19 pages slower than 3 s |
| Link check (SVI) | 46 pages, 0 broken | — |
| TypeScript `tsc --noEmit` | 0 errors (125 s) | — |
| Vitest (full) | **42 344 passed · 8 failed** in 4 files (2 102 files, 384 s) | All 8 are in the report-writer area changed by the immutable-revision rollout |
| Production logs, cron-health, guardian, backups, security posture | See findings | Read-only; the DB was only queried with SELECT |

## Findings (priority order)

### P0

1. **Report generation is effectively down.**
   - `tbr-quality.jsonl` shows 30 of 35 runs since 21/09 fully or mostly degraded, including both test runs today.
   - The transport diagnostics (`[ai-client:transport]`) show every failing DeepInfra call connecting in about 100 ms and uploading its body, then **no first byte before the fixed 60 s worker timeout** (`responseMs: null`, `responseBytes: 0`). Each run had 5–10 calls in flight.
   - The calls are non-streaming and request 2 600–4 000 output tokens (`agent-dispatcher.ts:561–590`). At open-model generation speeds that takes longer than 60 s.
   - Qwen3-235B also returned `429 engine_overloaded`.
   - Free-provider fallbacks (Groq, OpenRouter) returned empty responses.
   - Result: fully degraded, the job is retried up to 3 times, then fails and releases the free grant. Nothing false is delivered, but customers get nothing. Paid orders go through the same pipeline.
2. **The report budget ledger blocks the executive summary.** The log shows `CEO summary: Research attempt budget: reservation unavailable; reconciliation required` (`lib/ai/research-attempt-budget.ts:41`). Attempts whose outcome is unknown are left unreconciled, and later reservations fail closed. The summary becomes a placeholder, which by itself makes the run "fully degraded".
3. **The audit hash chain has been broken since 18/09.**
   - `audit-chain-verify` fails daily with `prev_hash_mismatch` at id 6702. It checks 6 636 rows and stops, so about 7 000 later rows are not verified.
   - Cause (read-only rows 6698–6706): two concurrent inserts 0.3 ms apart. Row 6703 was chained after 6701, and 6702 after 6703. The `BEFORE INSERT` trigger reads the "highest id" row without serialisation. This is a race, not tampering.
   - The runbook (`docs/AUDIT-CHAIN-RUNBOOK.md`) rates any break as P0.
4. **Monitoring and QA report green during the outage.**
   - The free-report spec passes on failed runs.
   - `/api/status` says `ok: true` and `tbr_quality: watch` with 89 % degraded.
   - `cron-health`, the watchdog for all crons, itself crashes (finding 6).

### P1

5. **The `svi-snapshot` cron fails every day at 16:00 (since at least 21/09):** `column svi_accounts.user_id does not exist` (code 42703). Daily snapshots, `current_svi`, index aggregates and movers are not refreshed.
6. **The `cron-health` cron crashes:** `TypeError … reading 'startsWith'`. One `cron-health.jsonl` row, from `ga4-daily-pull`, uses `at` instead of `ts`. Missed or failed cron detection has been blind since 23/09 00:30.
7. **8 unit tests fail after the writer rollout.**
   - Six tests in `run-for-project.test.ts` and `run-report-pipeline.test.ts` throw `report_revision_unconfirmed` or `rescore_revision_unconfirmed`, because their fakes do not model `report_revisions`.
   - Two contract tests fail: `report-quota.test.ts` and `report-generation-e2e.test.ts`.
   - These are drift from the "deploy without tests" directive. They are not verified as production defects, but the gate is now red.
8. **Deploy capacity.** The 6-origin cap failed a deploy at 00:47 (`No safe capacity/free origin port for candidate`). Each deploy currently needs a manual, checked retirement of an old origin.
9. **The `report_revisions` table is still empty.** The writer has not produced a revision in production, because no report has completed since the rollout. Its migration source file is still missing (0410 number collision, SOT §12.9).

### P2

10. **Security posture scanner false positives.**
    - `api/admin/comparables` is reported ungated but answers 401 anonymously (it uses the `sectorMultiplesAdminGate` helper).
    - The "secret leaks" are the scanner's own pattern list (`security-posture/route.ts:129–133`); gitleaks is clean.
    - The score of 68 (YELLOW) is therefore understated. Rate-limit coverage of 28/687 routes is real and still worth addressing.
11. **2 high-severity dependency CVEs:** `image-size` (DoS in parsers) via `pptxgenjs`. The fix is a semver-major change of pptxgenjs.
12. **Mail is sent to erased tombstone addresses.** Six mails on 23/09 went to `deleted+…@erased.blockid.au`. They are not in the drip or nurture queues; the sender has not been identified yet. No real person receives them, but erased identities should never be mailed.
13. **Offsite backup fails** (Drive quota). Deferred by the founder; host-loss recovery remains unverified.

### P3

14. `MaxListenersExceededWarning` (11 close listeners on `ServerResponse`, likely SSE) appears across releases.
15. 19 pages are slower than 3 s. `/tbr/demo` HTML is 1.09 MB.
16. The earlier `Failed to proxy https://localhost…` errors on `/funding/grants` are fixed (`1c30818be`) and absent from current releases.

## Healthy

- Public, signed-in and persona page renders pass.
- Internal links and the sitemap are clean.
- Typecheck is clean.
- 42 344 unit tests pass.
- Uptime is 100 % over 24 h, errors are 0 in the last hour, and the latency p95 is within target.
- Both QA accounts were erased and verified.
- SVI site links and health are fine.

Next plan: SOT §12.11 (G33).
