# Anthropic Cloud Routines — Audit (2026-07-31)

Author: cron-audit pass, 2026-07-31.

## Scope

Master Upgrade Plan §5 identifies a set of routines that run via Anthropic's
cloud (the `claude.ai/code/routines` `/schedule` system), distinct from local
cron on the box. Per project memory
(`project_cloud_routines`) there are seven of them (the "C-Level cloud
agents") — CTO, CFO, CMO, COO, CEO, RnD, IR. Each is meant to run an audit
prompt inside an Anthropic-hosted sandbox, clone the repo, and POST results
back to `POST /api/cron/agent-deploy` with `via:"cloud"` in the body — which
appends a heartbeat row to `web/content/reports/routine-heartbeat.jsonl`.

Everything else in `web/scripts/crontab.production` is local — that scope is
out of this audit (I checked it in passing while grepping; nothing in it
touches an Anthropic-cloud pathway).

## Method (evidence-first)

1. `web/content/reports/routine-heartbeat.jsonl` — every row is a `via:"cloud"`
   or `via:"local"` heartbeat stamped by `agent-deploy`. This is the only
   ground-truth signal of a cloud tick landing back on the server.
2. `web/content/reports/cron-health.jsonl` — tail-window health log written by
   `web/scripts/cron-runner.sh`. Only reflects endpoints hit through cron-runner,
   and is truncated at 200 KB, so absence here does not prove absence of runs.
3. Local `*-daily-*.md` and `*-weekly-*.md` file mtimes under
   `web/content/reports/` — the cloud routines were the original writers of
   these files; today the local `clevel-daily-reports` cron backfills all of
   them, so file freshness alone no longer proves cloud liveness.
4. `POST /api/cron/agent-deploy` (`web/src/app/api/cron/agent-deploy/route.ts`)
   — the only sink for cloud posts. Handler is present and correct.
5. `GET /api/cron/cron-health` (`web/src/app/api/cron/cron-health/route.ts`) —
   contains the silent-death detector referenced in memory. Detector is
   self-arming: it only alerts on agents that have been observed once.

The Anthropic-side routine config lives in Anthropic's backend, not in the
repo. `RemoteTrigger` (the tool used to inspect/mutate cloud routines from
Claude Code) is not available in this environment, so I cannot enumerate the
current cloud-side state — only the server-side receipt evidence.

## Findings — headline

| # | Cloud routine | Owner file | Transport | Cadence (per memory) | Last cloud tick | Verdict |
|---|---|---|---|---|---|---|
| 1 | CTO daily brief | `agent-deploy` webhook | Anthropic cloud | UTC 13:00 daily | **NEVER** | dormant |
| 2 | CFO daily brief | `agent-deploy` webhook | Anthropic cloud | UTC 14:00 daily | **NEVER** | dormant |
| 3 | COO daily brief | `agent-deploy` webhook | Anthropic cloud | UTC 15:00 daily | **NEVER** | dormant |
| 4 | CMO weekly brief | `agent-deploy` webhook | Anthropic cloud | Mon UTC 15:30 | **NEVER** (no `cmo-weekly-*.md`) | dormant |
| 5 | IR weekly brief | `agent-deploy` webhook | Anthropic cloud | Wed UTC 16:00 | **NEVER** (no `ir-weekly-*.md`) | dormant |
| 6 | RnD daily brief | `agent-deploy` webhook | Anthropic cloud | UTC 17:00 daily | **NEVER** | dormant |
| 7 | CEO daily brief | `agent-deploy` webhook | Anthropic cloud | UTC 19:00 daily | **NEVER** | dormant |

**Total routines in scope: 7. Verdict counts: 0 healthy, 0 stale, 0 broken,
7 dormant.**

"Dormant" means: `agent-deploy` has never received a `via:"cloud"` heartbeat
in the entire 73-row history of `routine-heartbeat.jsonl` (2026-06-13T12:03Z
→ 2026-07-31T08:36Z), and there is no `cmo-weekly-*.md` or `ir-weekly-*.md`
file anywhere in `web/content/reports/` for the weekly agents. The 2026-06-12
git-source repoint (GitLab → GitHub) documented in
`project_cloud_routines.md` does not appear to have restored these routines —
after the repoint, every observed heartbeat is still `via:"local"`.

## Local supporting routes (in scope)

| Route | File | Role | Last-good | Verdict |
|---|---|---|---|---|
| `agent-deploy` | `web/src/app/api/cron/agent-deploy/route.ts` | Webhook sink for cloud patches + heartbeat writer | Never received cloud POST | healthy (code is fine; nothing has called it) |
| `clevel-daily-reports` | `web/src/app/api/cron/clevel-daily-reports/route.ts` | Local backfill for all 14 C-Level daily briefs — deterministic, no AI | 23:45 UTC daily; `web/content/reports/*-daily-2026-07-30.md` mtimes 2026-07-30T23:45Z | healthy — but see caller-drift note below |
| `ceo-daily-summary` | `web/src/app/api/cron/ceo-daily-summary/route.ts` | 00:00 UTC aggregator across all C-Level daily briefs | `ceo-daily-2026-07-31.md` mtime 2026-07-31T00:00Z | healthy |
| `cron-health` | `web/src/app/api/cron/cron-health/route.ts` | Silent-death detector for cloud routines | 00:30 UTC daily; alert-state file `/tmp/blockid-cloud-routine-alert.json` does not exist | broken-by-design — see §"Detector caller-drift" |
| `nightly-clevel-review` | `web/src/app/api/cron/nightly-clevel-review/route.ts` | Wraps `web/scripts/nightly-clevel-review.mjs`; stub until T-1102 wires real Anthropic Messages call | Failing 16s on every run (07-22, 07-23, 07-31 all `fail`) | stale — script is documented stub; failure is expected; out of Anthropic-cloud scope but flagged |
| `prompt-eval-nightly` | `web/src/app/api/cron/prompt-eval-nightly/route.ts` | Nightly canary eval using `callStructured` (paid-key path) | Never observed in cron-health log (never ran or never succeeded through runner) | dormant — no shadow/canary rows to evaluate yet |

Secrets: every route above authenticates on `Bearer $CRON_SECRET` sourced
from `web/.env` by `web/scripts/cron-runner.sh`. Cloud routines carry their
own auth headers set inside the Anthropic-side prompt config.

## Detector caller-drift (`cron-health` cloud check)

`web/src/app/api/cron/cron-health/route.ts` lines 108-165 contain a
"cloud routine silent-death" check. Two ways it goes silent:

1. **Self-arming.** `armed = !!lastCloudHeartbeat[agent]` for daily agents,
   and `armed = !!newestWeeklyReport(agent)` for weekly agents. Alerts only
   fire on `armed && stale`. Because no cloud routine has ever posted a
   heartbeat *and* no weekly cloud-only file has ever existed, `armed` is
   always false — the alert branch is unreachable. The doc comment on line 21
   explicitly names this as a design choice ("a not-yet-rolled-out marker
   never raises a false alarm"), but combined with never-armed-in-production
   it means the silent-death detector has itself been silent since inception.
2. **Local backfill masks the death.** `clevel-daily-reports` writes
   `{agent}-daily-YYYY-MM-DD.md` for all 14 agents every night. This is
   great for the UI (no missing brief), but it means "the CEO's dashboard
   looks healthy" is not evidence that cloud is alive.

I did not change the detector. Changing self-arming behaviour is a
policy decision (should we alert on "cloud routine set up per docs but has
never been observed"?) and belongs with whoever decides whether cloud
routines should still exist. Recorded here for the human.

## Root-cause hypotheses (for the human)

I cannot verify these without `RemoteTrigger`; listing so the human can
pick which to check on `claude.ai/code/routines`:

1. The 2026-06-12 GitLab→GitHub `git_repository.url` fix landed on the
   server-side documentation but was never actually applied to the seven
   cloud routines, so every scheduled run still fails on
   "git_repository source could not be found". Symptom would match: 0
   ever-observed cloud heartbeats.
2. The fix landed but the routines were paused (or their prompts still send
   POSTs without the `via:"cloud"` marker, in which case heartbeats *would*
   appear as `via:"local"` — but the 14-agent local fan-out from
   `clevel-daily-reports` would then double-write, and I don't see that
   duplication in the log either).
3. The routines were deliberately taken down (the `agent-guardian` and
   `agent-auto-improve` local pipeline is doing the same work; keeping both
   layers is expensive on Claude subscription budget).

Hypothesis 3 is consistent with what I can see from the server: local
routines cover the same ground and are healthy. If a human confirms the
seven cloud routines are intentionally dormant, the follow-up is to drop the
cloud-death detector from `cron-health` (or convert its `armed` gate to
"alert if a cloud routine claimed to exist has never been observed within N
days of its schedule").

## Rewires landed in this pass

None. Per the task rules: "Never enable a broken routine because it looks
fine now. Only re-enable when you can point at the last-good tick and the
specific fault that made it stale." No cloud routine has a last-good tick to
point at. The local backfill is healthy on its own and needs no change.

## Routines with no entrypoint / bare crontab entries

None. Every `bash $RUN <name>` line in `web/scripts/crontab.production`
resolves to a route directory under `web/src/app/api/cron/<name>/`. The
crontab is internally consistent.

## What a human still needs to decide

1. **Should the seven cloud routines still exist?** If yes — someone with
   `claude.ai/code/routines` access has to inspect them, confirm the
   `git_repository.url` really was repointed to
   `https://github.com/Blockid-au/blockid`, and force a manual run to see
   what actually happens. If no — remove the cloud-death branch from
   `cron-health` so we stop pretending to guard something that isn't there.
2. **If they should exist, does the prompt still send `"via":"cloud"` in the
   POST body?** The heartbeat writer at `agent-deploy` line 128 keys off
   exactly that. A prompt drift that dropped the field would show every
   cloud tick as `via:"local"` and be indistinguishable from a local run.
3. **`CRON_SECRET` rotation.** The cloud routines carry a static
   `Authorization: Bearer $CRON_SECRET` header baked into each prompt. Any
   rotation of `CRON_SECRET` on the server requires the human to reissue
   all seven routines on `claude.ai/code/routines` — this is not automated.
   Runbook at `docs/runbooks/anthropic-cloud-routines.md` records the
   procedure.
4. **`nightly-clevel-review` stub.** T-1102 to wire the real Anthropic
   Messages call was scoped but never landed; the script has been in stub
   mode since 2026-07-16 (route file mtime), and cron-runner records
   `status:"fail"` every night at 04:30 UTC because the wrapper HTTP call
   times out at 16s. Not touched by this pass — it's a real code work item,
   not a cron-wire fault.

## Files consulted

- `web/scripts/crontab.production`
- `web/scripts/cron-runner.sh`
- `web/src/app/api/cron/agent-deploy/route.ts`
- `web/src/app/api/cron/cron-health/route.ts`
- `web/src/app/api/cron/clevel-daily-reports/route.ts`
- `web/src/app/api/cron/ceo-daily-summary/route.ts`
- `web/src/app/api/cron/nightly-clevel-review/route.ts`
- `web/src/app/api/cron/prompt-eval-nightly/route.ts`
- `web/content/reports/routine-heartbeat.jsonl` (73 rows, all local)
- `web/content/reports/cron-health.jsonl` (tail window)
- `web/content/reports/{agent}-daily-*.md` (all present, all local-written)
- `/home/dovanlong/.claude/projects/-home-dovanlong-blockid-au/memory/project_cloud_routines.md`
