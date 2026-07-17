# Goal 5A — T-1100 Scaffold Notes

Short design note explaining why the T-1100 pass ships stub content instead of
waiting for the real LLM wiring. Read this before touching the review pipeline
so you know which bits are load-bearing and which are placeholders.

## What T-1100 delivers

- `web/scripts/nightly-clevel-review.mjs` — an ESM orchestrator that walks the
  six C-level personas (cto, cfo, cdo, ciso, cro, cmo), finds each persona's
  most recent review on disk, and writes a fresh
  `web/content/reports/{persona}-review-{version}.md` scaffold if one does
  not already exist for the current version.
- `web/src/app/api/cron/nightly-clevel-review/route.ts` — a Next 16 route that
  fail-closes on `CRON_SECRET` and shells out to the script.
- `web/scripts/crontab.production` — a new 04:30 UTC entry that hits the
  route once a night.

## Why the stubs exist before the LLM wiring

The alternative is to block on T-1102 (real Anthropic call) before we get any
of the plumbing in place. That coupling would keep the pipeline dark — no cron
entry, no deploy history, no history JSONL, no dashboard card wired to the
persona files — until every piece landed at once.

Shipping the scaffold first buys us three things:

1. **A stable file path** for the dashboard, weekly digest, and deploy gate to
   read. They can start consuming `{persona}-review-{version}.md` today and
   pick up richer content once T-1102 lands, with no schema churn.
2. **A running cron with observability**. The route already writes
   `clevel-review-history.jsonl` and returns exit code + stdout, so
   `cron-health` and `routine-heartbeat` start reporting the job immediately.
3. **A concrete target for the LLM prompt author**. The scaffold defines the
   sections (Ship summary / Findings / Top-3 actions) that T-1102's prompt has
   to fill in, so the prompt work does not have to guess at output shape.

## What T-1102 will change

- Replace the placeholder body inside `scaffoldMarkdown()` with a call to the
  Anthropic Messages API (Claude Opus or Sonnet — see `docs/models.md`).
- Feed the persona prompt plus the prior review text into the request so the
  LLM can compute the delta explicitly.
- Keep the same section headings and the same file path — no downstream
  consumer should have to change.
- Keep the fail-closed `CRON_SECRET` route and the history JSONL contract.

Everything else in T-1100 (enumeration, prior-review lookup, idempotent write,
history entry, dry-run and single-persona flags) stays as-is.

## Version-bump interaction

The script reads `web/content/reports/version.json` and uses it as the version
suffix on the generated file. That means:

- A release cycle bumps `version.json` (via the existing release automation).
- The next nightly run sees a new version string, does not find a file that
  matches `{persona}-review-{new-version}.md`, and writes fresh scaffolds.
- Subsequent runs within the same version are no-ops (the file already exists
  and the script refuses to overwrite).

Net effect: exactly one review per persona per version, refreshed within
24 hours of the release.

## Coexistence with `clevel-daily-reports`

The platform already runs a `clevel-daily-reports` cron at 23:45 UTC that
produces `clevel-daily-*` reports (customer-facing daily briefings via the
C-level agents). That job is unrelated to Goal 5A — it powers the customer
reports pipeline, not the internal quality gate.

The two crons coexist safely because:

- **Different file names.** `clevel-daily-reports` writes
  `clevel-daily-{date}.md` (or `{persona}-daily-{date}.md` per the ecosystem
  memory). T-1100 writes `{persona}-review-{version}.md`. No prefix or suffix
  collision.
- **Different history sinks.** `clevel-daily-reports` appends to its own
  history file; T-1100 appends to `clevel-review-history.jsonl`.
- **Different schedules.** 23:45 UTC vs. 04:30 UTC — no lock contention on
  `web/content/reports/` because the writes are file-per-persona and the
  filenames do not overlap.

The only risk is developer confusion: someone greps for `clevel` and finds
both. Mitigation is the naming split above and this note.

## Guardrails baked into the script

- `--dry-run` prints intended writes but touches nothing on disk (safe to run
  from a shell against production).
- `--persona=<name>` limits the run to a single persona, for iteration.
- Missing or unreadable `version.json` exits 1 (the cron route surfaces this
  as `ok: false` with the exit code, so `cron-health` catches it).
- No LLM call and no npm dep additions in this pass — that is T-1102's job.
