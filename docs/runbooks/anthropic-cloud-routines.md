# Anthropic Cloud Routines Runbook

Owner: CTO (primary), CEO (secondary — CEO daily brief is on the list).
Severity of a full-family outage: **P3** — the local `clevel-daily-reports`
cron backfills every C-Level daily brief on the server, so a dead cloud
routine does not show up in the CEO dashboard. It *does* mean the deeper
Anthropic-hosted audit (the version that clones the repo + runs a longer
prompt with `agent-deploy` code-patch capability) is not producing patches.

Do NOT confuse this system with the autonomous git loop
(`scripts/cron/goal-loop.mjs`, `truncation-guard.mjs`, `test-gate.mjs`).
Those have their own revert-protection guards; leave them alone.

---

## What "the Anthropic cloud routines" are

Seven routines hosted on `claude.ai/code/routines` (the `/schedule` +
`RemoteTrigger` system), each spawning an isolated cloud session that
clones `https://github.com/Blockid-au/blockid`, runs an agent-specific
audit prompt, and POSTs results to
`https://blockid.au/api/cron/agent-deploy` with
`Authorization: Bearer $CRON_SECRET`.

| Agent | Cadence (UTC) | AEST | Payload marker |
|---|---|---|---|
| CTO | 13:00 daily | 23:00 | `via:"cloud"` heartbeat |
| CFO | 14:00 daily | 00:00 | `via:"cloud"` heartbeat |
| COO | 15:00 daily | 01:00 | `via:"cloud"` heartbeat |
| CMO | Mon 15:30 | Mon 01:30 | `cmo-weekly-YYYY-MM-DD.md` file |
| IR | Wed 16:00 | Wed 02:00 | `ir-weekly-YYYY-MM-DD.md` file |
| RnD | 17:00 daily | 03:00 | `via:"cloud"` heartbeat |
| CEO | 19:00 daily | 05:00 | `via:"cloud"` heartbeat |

The two weekly routines don't stamp the heartbeat log because their real
output is a full markdown brief committed via PR — file freshness is the
detector.

---

## Check a routine is alive

```bash
# Daily agents — grep for their most recent cloud heartbeat.
grep '"via":"cloud"' /home/dovanlong/blockid.au/web/content/reports/routine-heartbeat.jsonl \
  | tail -20
```

A row within the last 25 h for a daily agent = healthy. Nothing for >25 h
= stale.

```bash
# Weekly agents — newest cmo-weekly / ir-weekly file mtime.
ls -lt /home/dovanlong/blockid.au/web/content/reports/cmo-weekly-*.md \
       /home/dovanlong/blockid.au/web/content/reports/ir-weekly-*.md 2>/dev/null \
  | head -5
```

Newest within 8 days = healthy. Older or missing = stale.

Full JSON view (all seven at once, plus the failing/dead list):

```bash
curl -sS "http://127.0.0.1:4001/api/cron/cron-health" \
     -H "Authorization: Bearer $(grep ^CRON_SECRET /home/dovanlong/blockid.au/web/.env | cut -d= -f2-)" \
  | jq '.cloudRoutines, .deadCloudRoutines'
```

Field meanings on each `cloudRoutines[]` row:

- `armed: true` — server has seen at least one tick from this agent (daily:
  a `via:"cloud"` heartbeat; weekly: any matching `{agent}-weekly-*.md` file).
- `stale: true` — a previously armed agent has gone quiet past its window
  (25 h for daily, 8 d for weekly).
- `deadCloudRoutines[]` — the intersection: armed AND stale. This is what
  the Telegram alert fires on.

If `armed: false` for every agent (current state as of 2026-07-31), the
routines have never checked in from the cloud side. See "Full-family
never-armed" below.

---

## Pause / kill a single routine

There is no server-side kill switch — the routines run on Anthropic
infrastructure. Pause happens on `claude.ai/code/routines`:

1. Sign in as the owner of the routines (same account that created them).
2. Open the routine (e.g. "CTO daily audit").
3. Toggle it off, or edit its schedule to an unreachable date.

If you need an emergency server-side block (e.g. `agent-deploy` is being
abused), set the env var `AGENT_DEPLOY_DISABLED=1` in `web/.env` and
restart the app — the handler at
`web/src/app/api/cron/agent-deploy/route.ts` will still accept the POST but
should refuse to apply patches. (If that gate doesn't exist yet, add it as
a one-line check at the top of `POST` — trivial, but the human should
decide whether to actually block.)

Kill switches for **local** loop-family routines (separate subsystem, listed
here for cross-reference so nobody mistakes one for the other):

- `RESELLER_AUTONOMOUS_LOOP=off` — reseller goal loop
- `ATLASSIAN_GOAL_LOOP=off` — atlassian mapping goal loop
- `UX_IA_GOAL_LOOP=off` — UX/IA startup flow goal loop

---

## Add a new cloud routine

1. **Prompt.** Write the audit prompt under
   `docs/agents/prompts/<agent>-cloud.md`. The prompt must end with an
   HTTP POST back to `https://blockid.au/api/cron/agent-deploy` with:

   ```json
   {
     "agent": "<agent>",
     "description": "<one-liner>",
     "via": "cloud",
     "files": [{"path": "content/reports/<agent>-daily-YYYY-MM-DD.md",
                "content": "…", "action": "write"}]
   }
   ```

   The `"via":"cloud"` field is load-bearing — without it, `agent-deploy`
   stamps `via:"local"` and the silent-death detector cannot tell it apart
   from a local backfill.

2. **Auth.** The prompt must include the header
   `Authorization: Bearer $CRON_SECRET` where `$CRON_SECRET` matches
   `web/.env` on the production box. Rotate as per §"CRON_SECRET rotation"
   below.

3. **Register.** On `claude.ai/code/routines`, create a new routine with:
   - `job_config.ccr.session_context.sources[].git_repository.url =
     https://github.com/Blockid-au/blockid` (must be GitHub — the GitLab
     source was decommissioned 2026-06-12).
   - `job_config.model` = a current Claude model id (check the `claude-api`
     skill for the current recommendation).
   - `job_config.schedule` = cron in UTC, inside AEST 22:00–06:00
     (UTC 12:00–20:00) so shipping never hits AU peak traffic.
   - The full prompt from step 1.

4. **Update the detector.** Add the new agent name to `CLOUD_DAILY` or
   `CLOUD_WEEKLY` in `web/src/app/api/cron/cron-health/route.ts` (lines
   23-24 as of this writing). Without this, the detector will not track it.

5. **Sanity check.** After the first scheduled run, grep for its
   heartbeat: `grep '"agent":"<agent>","via":"cloud"'
   web/content/reports/routine-heartbeat.jsonl`. If nothing appears within
   the first two windows, treat as broken and follow the debug flow below.

---

## Debug a broken cloud routine

Symptom: `deadCloudRoutines[]` includes an agent, or a weekly file is >8 d
stale, and a Telegram alert has fired (12 h cooldown on
`/tmp/blockid-cloud-routine-alert.json`).

1. **Check the Anthropic side.** On `claude.ai/code/routines`, open the
   routine and look at its most recent run. Common failures:
   - `The git_repository source could not be found.` — the
     `git_repository.url` still points at the decommissioned GitLab. Repoint
     to `https://github.com/Blockid-au/blockid`. When updating, send the
     COMPLETE `job_config` (partial updates replace the whole object,
     losing prompt/model/tools).
   - Model deprecation — the pinned model id no longer exists. Bump per
     the `claude-api` skill.
   - Auth 401 from `agent-deploy` — `CRON_SECRET` on the server was
     rotated and the routine still carries the old value.

2. **Check the server side.** `curl` `/api/cron/agent-deploy` locally with
   the current secret and a synthetic body to confirm the sink accepts
   posts:

   ```bash
   curl -sS -X POST "http://127.0.0.1:4001/api/cron/agent-deploy" \
     -H "Authorization: Bearer $(grep ^CRON_SECRET web/.env | cut -d= -f2-)" \
     -H "Content-Type: application/json" \
     -d '{"agent":"cto","description":"probe","via":"cloud","files":[]}'
   ```

   A 200 with `ok:true` = sink is fine, problem is on Anthropic side. A 401
   = server-side secret mismatch. A 500 = read the response body for the
   real error (usually a CI-gate failure on an empty patch, which is
   expected for the probe — but for a real cloud tick means the patch
   didn't compile).

3. **Do not re-enable a broken routine because "it looks fine now".** Point
   at the last-good tick before flipping it back on. If you can't, treat
   as dormant and follow §"Full-family never-armed".

---

## Full-family never-armed (current state as of 2026-07-31)

If `cron-health` shows `cloudRoutines[].armed: false` for every agent — as
it does today — the seven routines have never checked in from the cloud
side. The local `clevel-daily-reports` cron is fully covering the daily
briefs on the server, so nothing user-visible is broken. But the deeper
Anthropic-hosted audit + agent-deploy patch pipeline is not producing
patches.

Decision belongs to a human with `claude.ai/code/routines` access. Three
options:

1. **Restore.** Log in, verify each routine's `git_repository.url` is
   `https://github.com/Blockid-au/blockid`, model id is current, prompt
   still POSTs with `"via":"cloud"`. Trigger a manual run and watch for the
   heartbeat.
2. **Retire.** If we've decided the local `agent-guardian` +
   `agent-auto-improve` + `clevel-daily-reports` pipeline is enough, take
   the seven routines down on `claude.ai/code/routines` and remove the
   cloud-death detector branch from `web/src/app/api/cron/cron-health/route.ts`
   (lines 108-165). The `routine-heartbeat.jsonl` writer in `agent-deploy`
   should stay — it's not costly and it's the correct shape if the cloud
   layer ever returns.
3. **Downgrade the detector.** Convert the `armed` gate so a claimed cloud
   routine that has *never* been observed within N days of first crontab
   pass raises a "never armed" alert instead of staying silent. This is a
   behaviour change and needs a decision, not a rush job.

---

## CRON_SECRET rotation

The seven cloud routine prompts each carry the shared secret as a static
`Authorization: Bearer …` header. There is no way to inject the secret at
run time from the server side. Rotation flow:

1. Generate a new secret (32 bytes URL-safe, `openssl rand -base64 32`).
2. Update `web/.env` on the server: `CRON_SECRET=<new>`. Do not commit —
   `.env` is gitignored.
3. Restart the app so the running standalone process picks up the new env
   (`bash /home/dovanlong/blockid.au/web/scripts/deploy-live.sh --restart`
   if a hot restart script exists; otherwise a full deploy).
4. Local cron picks it up on the next tick — cron-runner re-reads `.env`
   per invocation, so no cron reload is needed.
5. **On `claude.ai/code/routines`**: edit each of the seven routines and
   replace the `Authorization: Bearer …` header value in the prompt. When
   updating, send the COMPLETE `job_config` — partial updates lose fields.
6. Manually trigger one routine on the cloud side and confirm a fresh
   heartbeat lands.

**This runbook does not perform rotation.** If a rotation is genuinely
needed (secret leak, staff turnover), file it as an out-of-band action for
a human. Rotating without step 5 will silently 401 every cloud tick.

---

## Related runbooks

- `docs/runbooks/secret-leak.md` — first responder flow if `CRON_SECRET`
  itself leaks.
- `docs/runbooks/rls-bypass.md` — separate concern, but worth reading if
  a rogue `agent-deploy` POST ever writes to a table it shouldn't.

## Related audit

- `web/content/reports/anthropic-routines-audit-2026-07-31.md` — the
  evidence base this runbook was written against. Refresh the audit before
  making the "restore vs retire" decision above.
