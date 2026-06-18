# Goal: SVI Exchange Orchestration — autonomous C-Level execution

> Created: 2026-06-18 · Owner: CEO · Status: in_progress
> Drives ship cadence for startupvalueindex.com from v0.1 → v0.9 per `/home/dovanlong/startupvalueindex.com/GOAL.md`.

## Why this exists

We've established the 4-phase north star for startupvalueindex.com. The next step is to ship it on autopilot — the C-Level agents pick the next task, do the work, and report progress every cycle without a human in the loop unless a hard blocker appears.

This goal defines the **orchestration model**: the data shape of a task, the queue, the picker logic, the cadence, the per-agent execution contract, and the human-in-the-loop escalation rules.

## Data model

### Task

```json
{
  "id": "T_SVI_EXC_0001",
  "phase": "v0.2",                            // v0.2 | v0.3 | ... | v0.9
  "title": "Watchlist API + table",
  "description": "Build /api/watchlist GET/POST + Supabase table for signed-in investors to bookmark tickers.",
  "agent_owner": "CTO",                       // primary C-Level owner
  "agent_collaborators": ["CPO", "CISO"],     // optional
  "status": "pending",                        // pending | in_progress | review | done | blocked
  "priority": "P0",                           // P0 (blocker for phase) | P1 (planned) | P2 (nice-to-have)
  "depends_on": [],
  "deliverables": [
    "supabase/migrations/0066_watchlist.sql",
    "src/app/api/watchlist/route.ts",
    "vitest test for the route"
  ],
  "research_done": false,
  "plan_done": false,
  "code_done": false,
  "deployed": false,
  "estimated_hours": 4,
  "blocker": null,
  "last_action": null,
  "last_action_at": null
}
```

### Queue file

`web/content/reports/svi-exchange-tasks.json` — array of Task. Append-only via the orchestrator (status field updated in place; never delete rows; archive done items by leaving them in the array).

### Cadence

- Orchestrator runs every **6 hours** via cron (`0 */6 * * *`)
- Each cycle: pick **1 task**, advance one stage (research → plan → code → deploy)
- Daily C-Level report (existing 23:45 UTC cron) summarises the day's task moves

## Execution contract per stage

| Stage | What the agent produces | Acceptance |
|---|---|---|
| **Research** | Markdown brief in `.claude/research/T_…-research.md` covering: alternatives evaluated, recommended approach, complexity estimate, risks | research_done = true |
| **Plan** | Markdown plan in `.claude/plans/T_…-plan.md` with file-level diff list, vitest cases, migrations, env vars, rollback plan | plan_done = true |
| **Code** | Branch `feat/T_SVI_EXC_xxx` with the diff. PR auto-created via gh CLI (or commit-direct to main if PR queue is empty). | code_done = true |
| **Deploy** | Deploy via `deploy-live.sh`. Smoke test the new route(s). Update GOAL.md phase status. | deployed = true |

## Picker logic (priority)

```
1. Any task with status = "in_progress" → continue advancing it
2. If none, pick highest-priority pending task whose dependencies are all done
3. If none, pick the highest-priority task in the lowest phase that still has open work
4. If queue is fully done, log "all phases caught up — extend queue from GOAL.md"
```

## Escalation rules (human in the loop)

The orchestrator pings Telegram + writes to `content/reports/orchestrator-escalations.jsonl` when:

- A task is `blocked` for > 48 hours
- A task fails the same execution stage twice in a row
- A migration deploys but smoke test fails 3 consecutive times
- Estimated hours exceeded 3× (cost runaway)

## C-Level agent role mapping for this orchestration

| Agent | Default ownership in SVI Exchange queue |
|---|---|
| **CTO** | API routes, migrations, deployment, scaling |
| **CPO** | UX flows, page IA, accessibility |
| **CDO** | Data quality, identity hashing, sparkline math |
| **CFO** | Valuation methodology, secondary-offer pricing model |
| **CMO** | Brand consistency, content (sector reports), press strategy |
| **CRO** | Funnel optimisation, A/B tests |
| **CLO** | Regulatory work (ASIC, PIDV, AFSL) for the liquidity layer |
| **CISO** | Verified-investor security, KYC, fraud rules |
| **CHRO** | Hiring brief drafts (brokerage / advisor for v0.5+) |
| **CSO** | Strategic alliances (Antler/Startmate cohort auto-listing) |
| **CCSO** | Founder success + opt-in funnel optimisation |
| **IR** | AU VC outreach copy + AVCAL / Cut Through partnerships |
| **R&D** | Embeddable widgets, mobile prototype, AI deal-flow tooling |
| **QA** | Cross-cutting — every PR runs through QA pre-merge checklist |

## Deliverables (v2.17 ships the orchestration plumbing)

1. **`web/content/reports/svi-exchange-tasks.json`** — seeded with 12-18 tasks covering all of v0.2 + first half of v0.3.
2. **`web/src/app/api/cron/svi-exchange-orchestrator/route.ts`** — POST endpoint (cron-secret gated) that runs one cycle of the picker + execution stage.
3. **`web/src/app/dashboard/admin/svi-exchange/page.tsx`** — admin dashboard showing the queue, status counts, escalations, last-cycle log.
4. **`web/scripts/crontab.production`** — add `0 */6 * * * curl …` entry for the new cron.
5. **Telegram alert** integrated when a task is auto-promoted to `done`.
6. Docs: `VERSION.md` v2.17 entry + `ROADMAP.md` Phase 2.6 row.

## Success criteria

- 1 cycle = 1 forward step on 1 task, no exceptions (auditable in escalations log)
- A new task can be appended to the queue and the orchestrator picks it up next cycle without manual restart
- Admin can view the queue, last log, escalations from one page
- No regression: existing blockid.au cron + dashboard untouched

## Anti-patterns

- **Don't** let the orchestrator commit straight to main when a CLO-owned task involves regulatory work — those need human review.
- **Don't** auto-deploy if a vitest fails (smoke test gates the deploy step).
- **Don't** let estimated_hours grow without recalibration — log a warning and pause when 3× overrun.
- **Don't** mix SVI Exchange tasks into the founder-facing BlockID roadmap — separate queues, separate reports.

## Future (phase 2 of orchestration itself)

- AI-generated task descriptions from GOAL.md sections (replace seed with self-extending queue)
- Multi-agent collaboration on one task (e.g. CTO writes API, CPO writes UI, CDO writes the migration)
- Reinforcement signal from production telemetry (e.g. low conversion → priority bump on CRO tasks)
