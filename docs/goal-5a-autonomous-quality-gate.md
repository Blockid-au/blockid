# Goal 5A — Autonomous Quality Gate

**Owner:** CTO (primary) + Chief of Staff (orchestrator)
**Status:** Planned — Q4 2026 target
**Baseline:** v2.0.0-beta.7 (git sha `1e747b4`)
**Source:** `docs/IMPLEMENTATION-PLAN-v3.1-amended.md` §4 Goal 5A
**Task ID range:** `T-1101` .. `T-1112`
**Size:** 4 weeks (was 2 weeks in v3.1 — extended to include false-positive tuning, alerting integration, and per-role budget guards)

---

## 1. Rationale

Three lines from the v3.1 amendment, expanded with the evidence that motivated each.

### 1.1 The one-off review process misses regressions between cycles

The 6-C-Level review that produced `cto-review-v2.0.0-beta.6.md`, `cfo-review-v2.0.0-beta.6.md`, `cdo-review-v2.0.0-beta.6.md`, `ciso-review-v2.0.0-beta.6.md`, and `cro-cmo-review-v2.0.0-beta.6.md` on 2026-07-17 caught 5 categories of regression that had been shipping to prod for days-to-weeks:

- **10/10 CRO triggers dead** since beta.4 (2026-07-14). Three shipping cycles wrote copy, wired analytics, and released; nobody noticed `.request()` was never called.
- **4/4 A/B experiments dead** since beta.4. Same shape as above — infrastructure without a producer.
- **27/76 typed client analytics keys dark**. Discovered by CDO review §1b via grep, not by any monitoring alert.
- **audit_events row count = 0** despite migration `0076` shipping in beta.5 (2026-07-15) with an HMAC chain and nightly verifier — the verifier returned `chain length = 0` which passed as a false-green.
- **publish-insight cron stale 26 days** — last successful run 2026-06-20 21:30 UTC, broken by a JSON parse error on a truncated LLM completion. No producer alert fired.

If a nightly review had been running from beta.4 onward, each of the five findings would have surfaced within 24 hours of the ship that introduced them — instead of at the code-freeze cliff before v3.

### 1.2 Nightly review is cheaper than one-off review

The 2026-07-17 6-review cycle took roughly a person-day of orchestration + agent-time. A nightly cron running the same 6 agents in parallel over a git-diff-scoped window (default: HEAD~24h) costs an order of magnitude less because each agent audits only the delta, not the entire tree. Cost profile:

- **One-off review over full tree:** ~6 agents × ~180k input tokens × Opus tier = ~1.08M input tokens per cycle, human orchestration ~2h.
- **Nightly review over 24h diff:** ~6 agents × ~30k input tokens × Opus tier = ~180k input tokens per cycle, no human orchestration (cron-triggered).

Weekly aggregate cost is 7× the nightly = ~1.26M input tokens for 7 cycles, still cheaper than one full-tree review because the full-tree cost scales with codebase growth while the diff cost scales with commit velocity (approximately constant).

### 1.3 Reuse the parallel-agent execution model already proven in beta.4-beta.6

Per CTO review §4.a, the parallel-agent execution model was used to ship beta.4, beta.5, and beta.6 in a single day. The model works on strictly disjoint file domains — each agent owns a directory subtree, and no two agents touch the same file. The nightly review pipeline uses the same isolation contract in read-only mode: each C-Level agent gets a domain, produces a report artifact under `web/content/reports/<role>-nightly-YYYY-MM-DD.md`, and never mutates code.

The 6 C-Level agent skills (cto, cfo, cdo, ciso, cro, cmo — plus optional clo, cpo) are already defined in `.claude/agents/` and already invoked manually today. Wiring them into a cron adds a shell driver, not a new capability.

---

## 2. Architecture

### 2.1 Component map

```
                                 crontab.production
                                        │
                                        │  0 15 * * *  (01:00 AEST)
                                        ▼
                        web/scripts/cron-runner.sh nightly-clevel-review
                                        │
                                        ▼
                   web/scripts/nightly-clevel-review.mjs  (orchestrator)
                       │        │        │        │        │        │
                       ▼        ▼        ▼        ▼        ▼        ▼
                     CTO      CFO      CDO     CISO      CRO      CMO
                    agent    agent    agent    agent    agent    agent
                       │        │        │        │        │        │
                       ▼        ▼        ▼        ▼        ▼        ▼
   web/content/reports/{cto,cfo,cdo,ciso,cro,cmo}-nightly-YYYY-MM-DD.md
                                        │
                                        ▼
                         web/scripts/nightly-review-digest.mjs
                                        │
                                        ▼
   web/content/reports/nightly-digest-YYYY-MM-DD.md  +  Telegram alert
                                        │
                                        ▼
                     web/content/reports/cron-health.jsonl
```

### 2.2 Isolation contract per agent

Each sub-agent runs in a subshell with strict file-domain isolation. The orchestrator passes each agent a `--scope` argument that expands into a shell glob restricting reads to a single domain. This mirrors the beta.4-beta.6 parallel execution model.

| Agent | Scope glob | Report path template |
|-------|-----------|---------------------|
| CTO | `web/src/{app,lib,components}/**/*.{ts,tsx}` + `web/scripts/**/*.{sh,mjs,ts}` | `web/content/reports/cto-nightly-YYYY-MM-DD.md` |
| CFO | `web/src/lib/{plans-v2.ts,credits.ts,revenue.ts,entitlements.ts}` + `web/src/app/admin/{pricing-metrics,cfo-ledger}/**` + `web/supabase/migrations/**` | `web/content/reports/cfo-nightly-YYYY-MM-DD.md` |
| CDO | `web/src/lib/analytics/**` + `web/src/lib/analytics.ts` + `web/scripts/bq-export-events.ts` | `web/content/reports/cdo-nightly-YYYY-MM-DD.md` |
| CISO | `web/src/proxy.ts` + `web/src/instrumentation.ts` + `web/scripts/dns/**` + `web/supabase/migrations/**` + `docs/runbooks/**` + `web/public/.well-known/**` | `web/content/reports/ciso-nightly-YYYY-MM-DD.md` |
| CRO | `web/src/lib/conversion/**` + `web/src/hooks/useUpgradePrompt.ts` + `web/src/components/{upsell,entitlement,onboarding}/**` + `web/src/config/experiments.json` | `web/content/reports/cro-nightly-YYYY-MM-DD.md` |
| CMO | `web/src/app/(marketing)/**` + `web/content/marketing/**` + `web/public/sitemap.ts` + `web/src/app/api/cron/publish-insight/**` | `web/content/reports/cmo-nightly-YYYY-MM-DD.md` |

### 2.3 Diff window

Default scope is `HEAD@{24h}..HEAD`. The orchestrator computes the window with `git rev-list --since=@{24h} HEAD` and passes the file list to each agent as `--changed-files`. Agents may read files outside the changed set for context but their findings must anchor to a file:line inside the window. This keeps each nightly report bounded and comparable across days.

An escape hatch flag `--full-tree` re-runs against the entire tree; reserved for weekly deep-audit cycles (Sundays 01:00 AEST) and for post-incident manual invocation.

### 2.4 Orchestrator implementation

`web/scripts/nightly-clevel-review.mjs`:

```
#!/usr/bin/env node
// Nightly C-Level review orchestrator (Goal 5A / T-1101)
// Spawns 6 read-only C-Level agents in parallel against HEAD@{24h}..HEAD
// Writes per-role reports + a digest to web/content/reports/
// Emits a cron-health.jsonl row and (on any finding) a Telegram alert
```

Concrete responsibilities:

1. **Preflight** — verify git worktree clean; compute diff window; abort with `exit 2` if diff empty AND `--force` not passed.
2. **Fan-out** — spawn 6 child processes, each invoking the Claude Agent SDK with the role's skill preset, scope glob, and changed-files list. Bound each to 10-minute wall clock, 200k input token budget. Kill any that exceed either.
3. **Fan-in** — collect the 6 report artifacts; parse each for a machine-readable `findings:` block (JSON-in-fence) at the head of the file.
4. **Digest** — call `web/scripts/nightly-review-digest.mjs` which cross-cuts by severity (P0/P1/P2), owner, and file-domain; produces `web/content/reports/nightly-digest-YYYY-MM-DD.md`.
5. **Alerting** — if any P0/P1 finding surfaced, post the digest URL to Telegram via existing `web/src/lib/telegram.ts` helper. Only P0/P1 pages the on-call; P2 stays in the digest.
6. **Health log** — append a single JSONL row to `web/content/reports/cron-health.jsonl` with `{ ts, cron: "nightly-clevel-review", ok, ms, findings_by_severity, cost_tokens }`.

### 2.5 Sub-agent contract

Each C-Level sub-agent MUST emit a report file whose head is a fenced JSON block matching this schema:

```
findings:
  - id: NL-CTO-2026-07-18-001
    severity: P0 | P1 | P2
    title: string (<=80 chars)
    file: string (repo-relative path)
    line: integer | null
    evidence: string (<=400 chars, code excerpt or grep hit)
    remediation: string (<=400 chars)
    est_effort: S | M | L
    cost_tokens: integer
    cost_wall_ms: integer
```

Followed by prose. The digest only consumes the fenced block; the prose is for human readers who click through from the digest.

`NL-` prefix distinguishes nightly-review finding IDs from `T-` implementation task IDs.

### 2.6 False-positive suppression

Each finding-ID that recurs 3 nights in a row without a code change is auto-suppressed into `web/content/reports/nightly-review-suppressions.json`. Suppressed findings still appear in per-role reports but are excluded from the digest and from the alert path. Suppressions expire after 14 days OR when the file in question is touched by a commit — whichever comes first.

This mirrors the pattern already used in `verify-audit-chain.ts` for known-benign chain gaps.

### 2.7 Budget guards

Per-cycle budget: 200k input tokens per agent × 6 agents = 1.2M tokens max. Per-week budget: 8.4M tokens. Orchestrator refuses to spawn any agent whose 7-day rolling cost exceeds 1.4× fair share (i.e. 1.68M tokens per agent per week). Enforcement lives in `web/scripts/nightly-clevel-review.mjs` reading `web/content/reports/nightly-review-costs.jsonl`.

If the budget is tripped, the agent is skipped for that cycle and a P1 finding is emitted from the orchestrator itself: `NL-ORCH-YYYY-MM-DD-budget-tripped-<role>`.

### 2.8 Failure modes

| Failure | Detection | Response |
|---------|-----------|---------|
| Sub-agent times out (>10 min) | orchestrator wall-clock | Skip agent, P1 finding NL-ORCH-timeout-<role> |
| Sub-agent exceeds token budget | orchestrator counter | Skip agent, P1 finding NL-ORCH-budget-tripped-<role> |
| Sub-agent crashes (non-zero exit) | orchestrator waitpid | Skip agent, P0 finding NL-ORCH-crash-<role>, include stderr tail |
| No commits in 24h | orchestrator preflight | Exit 0 with health-log row `{ ok: true, skipped: "no diff" }`, no alert |
| git worktree dirty | orchestrator preflight | Exit 3 with health-log row `{ ok: false, reason: "worktree dirty" }`, alert |
| cron-runner.sh cannot find CRON_SECRET | cron-runner.sh | Fail closed (per beta.5 H2 fix), health-log row, no orchestrator invocation |

### 2.9 Integration with existing infra

- **Cron:** append to `web/scripts/crontab.production` between the existing `clevel-daily-reports` block (45 23 * * *) and the BQ-export block; schedule `0 15 * * *` (01:00 AEST) to avoid overlap with 23:45 UTC `clevel-daily-reports`, 02:15 UTC `bq-export`, and 01:00 UTC `verify-audit-chain`.
- **cron-runner.sh:** existing wrapper handles logging, telegram-on-failure, and log rotation — no change needed. New endpoint name `nightly-clevel-review`.
- **cron-health-watchdog:** T-1016 from v3.1 (cron widespread-failure detector) already exists per plan; this cron's row lands in the same jsonl.
- **Telegram alert path:** reuse `web/src/lib/telegram.ts` `sendTelegram()` — same channel as `agent-guardian` alerts.
- **Reports directory:** `web/content/reports/` already houses `clevel-daily-reports`, `cron-health.jsonl`, and manual review artifacts — nightly reports coexist with the same naming convention.

---

## 3. Task list T-11xx

Effort: S=1 (≤4h), M=2 (≤1d), L=3 (≤3d). WSJF = (bv+tc+rr)/effort.

| id | task | effort | bv | tc | rr | wsjf | dependencies |
|----|------|--------|----|----|----|------|--------------|
| T-1101 | Ship orchestrator `web/scripts/nightly-clevel-review.mjs` (spawn 6 child agents, fan-in JSON, wall-clock + token budget guards, exit codes per §2.8) | L | 5 | 4 | 5 | 4.67 | none |
| T-1102 | Per-role scope glob table + `--changed-files` computation (git rev-list HEAD@{24h}); pass into each agent | S | 4 | 4 | 4 | 12.0 | none |
| T-1103 | JSON-schema validator `web/scripts/nightly-review-schema.json` (Ajv) + orchestrator validates each report head-block before digest | S | 4 | 3 | 5 | 12.0 | T-1101 |
| T-1104 | Digest builder `web/scripts/nightly-review-digest.mjs` (severity cross-cut, owner/file grouping, top-10 finding list, MD output) | M | 5 | 4 | 4 | 6.5 | T-1101, T-1103 |
| T-1105 | Telegram alert on P0/P1 (reuse `web/src/lib/telegram.ts`); one message per cycle, includes digest link + P0/P1 count | S | 4 | 5 | 4 | 13.0 | T-1104 |
| T-1106 | False-positive suppression: 3-night recurrence auto-suppress + 14-day expiry + touch-file expiry; state in `web/content/reports/nightly-review-suppressions.json` | M | 3 | 3 | 3 | 4.5 | T-1104 |
| T-1107 | Cost tracker: append per-agent `{ role, tokens, ms }` to `web/content/reports/nightly-review-costs.jsonl`; weekly rollup script for Chief of Staff | S | 3 | 3 | 4 | 10.0 | T-1101 |
| T-1108 | Per-role budget guard: refuse spawn if 7-day rolling cost > 1.4× fair share; emit P1 finding NL-ORCH-budget-tripped | S | 3 | 3 | 4 | 10.0 | T-1107 |
| T-1109 | Crontab entry `0 15 * * * bash $RUN nightly-clevel-review --timeout 90` + weekly full-tree entry `0 15 * * 0` | S | 4 | 5 | 3 | 12.0 | T-1101 |
| T-1110 | cron-runner.sh endpoint mapping for `nightly-clevel-review` (already generic — validate wiring only); jsonl row shape validated by T-1016 watchdog | S | 3 | 3 | 3 | 9.0 | T-1109 |
| T-1111 | Workspace surface: read latest digest into `/workspace/reports?type=nightly-review` (reuse existing report reader pattern from `/workspace/reports/[id]`); role-badge chip per finding | M | 3 | 3 | 2 | 4.0 | T-1104 |
| T-1112 | Documentation: `docs/runbooks/nightly-clevel-review.md` — how to interpret findings, how to file a suppression, how to bump per-role scope | S | 2 | 2 | 3 | 7.0 | T-1101 through T-1109 |

12 tasks. WSJF-ordered priority: T-1105 (13.0), T-1102 / T-1103 / T-1109 (12.0), T-1107 / T-1108 (10.0), T-1110 (9.0), T-1112 (7.0), T-1104 (6.5), T-1106 (4.5), T-1101 (4.67), T-1111 (4.0).

Note: T-1101 has a low WSJF because it is L-effort, but it is a hard blocker for 8 of the other 11 tasks. Sequence T-1101 first regardless of WSJF.

---

## 4. Success metrics

### 4.1 Findings-addressed rate

- **Target:** ≥ 1 P0/P1 finding remediated per week AND time-to-remediation < 5 days median.
- **Measurement:** join `web/content/reports/nightly-review-costs.jsonl` (finding IDs by cycle) with `git log --grep="NL-"` to count NL-ID mentions in commits. A commit that mentions the NL-ID closes it.
- **Baseline:** UNKNOWN. Measure by running the pipeline for 2 weeks post-launch and recording the rate before setting a stretch target.

### 4.2 Review cycle time

- **Target:** end-to-end orchestrator wall time < 60 minutes.
- **Measurement:** `cron-health.jsonl` field `ms`.
- **Baseline:** UNKNOWN. The 2026-07-17 manual review took roughly 2 hours across 6 agents in parallel. Nightly diff-scoped is expected to complete in 15-30 minutes.

### 4.3 False-positive rate

- **Target:** < 20% of P1/P2 findings suppressed after 3 nights (i.e. false positive rate).
- **Measurement:** ratio of finding IDs entering `nightly-review-suppressions.json` to total finding count over 30 days.
- **Baseline:** UNKNOWN. Set after first 4 weeks of operation.

### 4.4 Regression catch rate

- **Target:** ≥ 1 shipping-day regression caught per week that would have otherwise reached prod. Per v3.1 amendment success criterion.
- **Measurement:** count of P0/P1 findings whose `remediation` field references a commit merged within the diff window (i.e. same-day regression). Requires human classification.
- **Baseline:** UNKNOWN.

### 4.5 Budget adherence

- **Target:** 100% of cycles land under 1.2M total tokens.
- **Measurement:** `nightly-review-costs.jsonl` sum.
- **Baseline:** target set from §1.2 estimate; validate against first 2 weeks of real cost data.

### 4.6 Alert signal-to-noise

- **Target:** ≥ 70% of Telegram alerts result in a linked commit within 5 days.
- **Measurement:** `git log --grep="NL-"` referencing alerts logged to `web/content/reports/nightly-review-alerts.jsonl`.
- **Baseline:** UNKNOWN.

---

## 5. Four-week rollout

### Week 1 — Orchestrator + fan-out

- Ship T-1101 (orchestrator skeleton, no real agent calls yet — mock each sub-agent with a fixed report).
- Ship T-1102 (scope globs + diff window).
- Ship T-1103 (schema validator).
- Ship T-1109 in a DISABLED state (comment out the crontab line but push the file).
- Run manually with `--dry-run` against beta.7 HEAD daily; validate scope globs cover the right domains without cross-contamination.

Exit criteria for Week 1: orchestrator spawns 6 mock agents in parallel, collects 6 valid-schema reports, no cross-domain reads leak.

### Week 2 — Real sub-agents + digest

- Replace mocks with real Claude Agent SDK calls per role (T-1101 completion).
- Ship T-1104 (digest builder).
- Ship T-1107 (cost tracker).
- Ship T-1112 (runbook — first draft).
- Enable crontab line but at `--dry-run` (writes reports, no Telegram, no state changes).
- Human review of every digest for the week. Catalog false positives.

Exit criteria for Week 2: 7 consecutive nightly cycles complete under 60 minutes each; digest produced every night; no P0 false positive from orchestrator itself.

### Week 3 — Alerting + suppression

- Ship T-1105 (Telegram alert).
- Ship T-1106 (suppression list).
- Ship T-1108 (budget guard).
- Ship T-1110 (cron-runner wiring validation).
- Move crontab to full run (drop `--dry-run`).
- Tune suppression list based on Week 2 catalog.

Exit criteria for Week 3: P0/P1 alert pages the on-call ≤ 5 minutes after cycle end; ≥ 90% of Week 2 false positives auto-suppressed.

### Week 4 — Workspace surface + hardening

- Ship T-1111 (workspace `/workspace/reports?type=nightly-review`).
- Finalise T-1112 (runbook, second draft with actual failure scenarios).
- Load-test: simulate a 500-file commit and verify orchestrator holds under 60 min.
- Chaos: kill one sub-agent mid-run; verify orchestrator emits NL-ORCH-crash P0 and doesn't hang the cycle.

Exit criteria for Week 4: workspace surface shows ≥ 7 days of nightly digests; on-call runbook validated by dry-run drill; goal 5A closed.

---

## 6. Dependencies

### 6.1 Upstream (this goal depends on)

- **T-1016** (cron widespread-failure watchdog) already scheduled in v3.1 Week 1. Nightly review's health-log row feeds into the same watchdog. If T-1016 slips, this goal can still ship — the watchdog is nice-to-have not blocker.
- **T-1005** (retire NEXT_PUBLIC_UPGRADE_V2 dual-branch) not blocker but simplifies CTO agent scope (one homepage tree not two).
- **Cost telemetry from Anthropic SDK** — SDK must expose `input_tokens` / `output_tokens` per request. Available as of Claude API v2024-01-01 (well established as of the review date).
- **Cron-runner.sh + cron-health.jsonl format** — already stable per beta.6 Phase 8 shipping.

### 6.2 Downstream (goals blocked on this)

- **Goal 5B (Investor Pack v2):** auto-review of investor-pack templates and PDF renderers benefits from nightly review coverage. If Goal 5A slips, investor pack still ships but without the safety net.
- **Goal 5D (VI cohort):** VI SEO surfaces need nightly SEO-drift detection; CMO nightly review is the mechanism.
- **v3.1 §7 success gate #4** (`audit_events` genesis rows) — nightly review reads the same table via CISO agent; helps catch chain gaps.

### 6.3 No dependencies for parallel work

- Goals 5B and 5C can start Week 1 of their own timelines in parallel with Goal 5A Week 1. See `docs/orchestrator-goal-tracking.md` for the cross-goal grid.

---

## 7. Non-goals

Explicitly OUT of scope for Goal 5A:

- **Auto-remediation.** The nightly review reports and alerts; it never mutates code. Auto-fix belongs to a future Goal 5E or 6A.
- **Product-analytics review** (GA4 / BigQuery). CDO daily reports already cover this via a different cron; nightly review is code-drift-focused not funnel-focused.
- **Security scanning** (SAST/DAST tooling). CISO nightly review reads code with a security lens but does not replace a proper SAST layer; that is a v2.2 conversation.
- **Cross-repo review.** Only `blockid.au` is in scope. Any future auschain.io or media-studio repos are out of scope for this goal.
- **Non-English review outputs.** All reports and alerts are English. VI translation of digests is a Goal 5D nice-to-have.
- **Sub-agent generation of NEW skills.** The 6 existing C-Level skills are the pipeline; adding a 7th (e.g. CPO) is out of scope for this goal — reserved for post-launch expansion.

---

## 8. Risks

### 8.1 Alert fatigue

- **Probability:** Medium (3/5).
- **Impact:** High (4/5) — if the on-call ignores Telegram, the value proposition collapses.
- **EMV:** 3 × 4 × 1.2 (Technical weight) = 14.4 — Mitigate.
- **Mitigation:** hard cap of 5 Telegram messages per 24h; digest link only, no per-finding paging; T-1106 suppression list; weekly Chief-of-Staff review of alert volume with a mandate to raise the P1 bar if > 10 alerts/week.

### 8.2 Runaway cost

- **Probability:** Medium (3/5).
- **Impact:** Medium (3/5) — a runaway cycle at 6× budget = ~7.2M tokens per night = ~$65/night at Opus rates.
- **EMV:** 3 × 3 × 1.4 (Financial weight) = 12.6 — Mitigate.
- **Mitigation:** T-1108 per-role budget guard; hard token limit per agent process; orchestrator kills any agent process exceeding 200k tokens.

### 8.3 Sub-agent hallucinated findings

- **Probability:** High (4/5) — LLM agents produce plausible-looking false positives especially on unfamiliar code paths.
- **Impact:** Medium (3/5) — P2 hallucinations are digest noise; P0/P1 hallucinations trigger noise pages.
- **EMV:** 4 × 3 × 1.2 = 14.4 — Mitigate.
- **Mitigation:** every finding requires `file:line` + `evidence` field. Digest builder validates `file` exists in the diff window and `line` is within the file. Findings failing validation are demoted to P2 or dropped.

### 8.4 Overlap with existing clevel-daily-reports cron

- **Probability:** High (4/5) — the existing 23:45 UTC clevel-daily cron writes daily reports for each C-Level role from a different lens (business KPIs not code drift).
- **Impact:** Low (2/5) — reader confusion, not functional collision.
- **EMV:** 4 × 2 × 1.0 = 8.0 — Accept with monitoring.
- **Mitigation:** filename convention differentiates (`cto-daily-YYYY-MM-DD.md` vs `cto-nightly-YYYY-MM-DD.md`); workspace UI groups them separately.

### 8.5 Sub-agent SDK breaking change

- **Probability:** Low (2/5).
- **Impact:** High (4/5) — pipeline halts.
- **EMV:** 2 × 4 × 1.2 = 9.6 — Accept with monitoring.
- **Mitigation:** T-1101 pins SDK version; cron-runner.sh alerts on any non-zero exit from orchestrator.

### 8.6 Findings ignored (organisational risk)

- **Probability:** Medium (3/5) — the org-wide response to alerts matters more than the alert itself.
- **Impact:** High (5/5) — nullifies the goal.
- **EMV:** 3 × 5 × 1.1 = 16.5 — Mitigate.
- **Mitigation:** T-1104 digest links to `web/content/reports/nightly-triage-log.jsonl` — a lightweight append-only log where the on-call must record "accepted / rejected / suppressed" per P0/P1. Weekly report to Chief of Staff includes the untriaged count. Escalation trigger: > 3 untriaged P0 findings in 5 days → Chief of Staff escalation.

---

## 9. Open questions

- Should nightly review cover the auschain and media-studio submodules if/when they migrate into the monorepo? Deferred until they do.
- Should each agent produce a machine-readable `diff-summary:` block for use as a git-annotate overlay in a future workspace surface? Nice-to-have; deferred to post-launch.
- Should the pipeline write findings to `audit_events` for cross-verification with the audit chain? Under consideration — depends on whether audit-chain writer performance is comfortable with an extra ~50 rows/night.

---

## 10. Cross-references

- v3.1 amendment: `docs/IMPLEMENTATION-PLAN-v3.1-amended.md` §4 Goal 5A
- Implementation trunk: `docs/IMPLEMENTATION-PLAN-v3.md`
- Related task in Week 1: T-1016 (cron widespread-failure watchdog)
- Related manual review artifacts: `web/content/reports/*-review-v2.0.0-beta.6.md`
- Related cron infra: `web/scripts/crontab.production`, `web/scripts/cron-runner.sh`
- Related workspace surface: `/workspace/reports/*`
- Related agent skills: `.claude/agents/{cto,cfo,cdo,ciso,cro,cmo}.md`
- Orchestrator meta-doc: `docs/orchestrator-goal-tracking.md`

---

## 11. Comparison to prior manual reviews

The 2026-07-17 manual C-Level review cycle produced 5 review artifacts (`cto-review-v2.0.0-beta.6.md`, `cfo-review-v2.0.0-beta.6.md`, `cdo-review-v2.0.0-beta.6.md`, `ciso-review-v2.0.0-beta.6.md`, `cro-cmo-review-v2.0.0-beta.6.md`). Baseline characteristics of that cycle:

- Total findings surfaced: 25 new T-10xx tasks in v3.1 amendment (of which 15 are H-severity WSJF ≥ 6.0).
- Findings introduced within the last 3 shipping cycles: at least 5 categories (dead triggers, dead A/Bs, dark analytics keys, zero audit rows, stale publish-insight).
- Reviewer wall time: full day of orchestration.
- Reader latency: reviews were consumed same-day but findings had already been shipping for days.

Goal 5A's nightly review aims to shift review latency from days-to-weeks to under 24h. It does NOT replace the manual quarterly deep review — the deep review remains valuable for cross-cutting themes and architectural drift that a diff-scoped nightly review will miss.

### 11.1 Kinds of findings nightly review will catch

- **Dead code paths** (dead triggers, dead A/Bs, dark analytics keys) — grep for producer callsites within diff window.
- **Contract drift** (registry vs. hard-coded literals) — cross-check registry state at HEAD vs. imports at HEAD.
- **Cron staleness** (last successful run > threshold) — read `cron-health.jsonl`.
- **Migration numbering collision** — grep against `web/supabase/migrations/`.
- **Undocumented public API surface** (routes added without OpenAPI entry) — cross-check.
- **CSP / header regression** — grep proxy.ts + instrumentation.ts for `unsafe-inline` etc.
- **Legal disclaimer chain gap** — read `disclaimer_registry` + compare to hard-coded literals.
- **RLS body drift** — parse migration bodies for `USING (true)` patterns.

### 11.2 Kinds of findings nightly review will MISS

- **Cross-cutting architectural drift** — 6 agents reading disjoint domains cannot see whole-system patterns.
- **UX / design regression** — no visual QA in the pipeline.
- **Performance regression** — no perf harness invocation.
- **Data model migrations at scale** — a schema change that requires N+1 downstream fixes cannot be caught in a single-night window.
- **Regulatory changes** — external ASIC / ACL updates require human tracking.

These stay in the quarterly deep-review scope.

## 12. Post-launch measurement plan

### 12.1 Instrumentation added at launch

- `web/content/reports/nightly-review-costs.jsonl` — one row per cycle per agent with `{ ts, role, tokens_in, tokens_out, ms, ok }`.
- `web/content/reports/nightly-review-alerts.jsonl` — one row per Telegram alert with `{ ts, severity, finding_ids, digest_url }`.
- `web/content/reports/nightly-triage-log.jsonl` — one row per triage decision with `{ ts, finding_id, decision, actor }`.
- `web/content/reports/cron-health.jsonl` — extended with `nightly-clevel-review` cron entries.

### 12.2 Weekly Chief-of-Staff rollup

Every Monday, a rollup script `web/scripts/nightly-review-weekly-rollup.mjs` reads the last 7 days of JSONL files and produces `web/content/reports/nightly-review-weekly-YYYY-MM-DD.md` with:

- Finding count by severity by role.
- Alert count and P0/P1 acceptance rate.
- Suppression state (net-new suppressions this week).
- Cost breakdown by role vs. 7-day budget.
- Top-5 unaddressed findings by age.

The Chief of Staff review references this rollup during the Monday portfolio review (per `docs/orchestrator-goal-tracking.md` §4.1).

### 12.3 30-day gate

At 30 days post-launch, Goal 5A goes through a formal gate:
1. Did the pipeline catch ≥ 1 regression per week that would otherwise have shipped? If yes, promote to production-critical status.
2. Did false-positive rate stay below 20%? If no, tune the suppression list before promoting.
3. Did total token cost land under the 8.4M weekly budget? If no, restrict `--full-tree` weekly cycle to bi-weekly.
4. Did any P0 finding go untriaged for > 5 days? If yes, escalate the triage workflow, not the pipeline.

Promoting to production-critical means the pipeline joins the beta.5 audit-chain, cron-health-watchdog, and stripe-webhook validators as a system whose downtime pages the on-call.

### 12.4 Continuous improvement loop

Every quarter, Chief of Staff runs a retrospective on:
- Were the right domains assigned to the right roles?
- Should any role be split (e.g. add CPO as a 7th agent)?
- Are the severity thresholds calibrated correctly?
- Should the diff window be shorter (12h) or longer (48h)?

Adjustments land as T-11xx-vN follow-up tasks in a follow-up planning cycle, not a hot rewrite of the goal.

---

*End of Goal 5A. Owned by CTO + Chief of Staff. Next review: after Week 2 tuning phase.*
