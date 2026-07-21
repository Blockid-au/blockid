#!/usr/bin/env node
// Reseller module autonomous goal loop — per docs/plans/reseller-module-plan.md § U.5, U.13.
// Cadence: off-peak windows only (aligned with existing cloud routines).
// Kill switch: env RESELLER_AUTONOMOUS_LOOP=off exits before any work.
//
// This script is the driver. On each tick it:
//   1. Reads docs/plans/reseller-module-goal.md
//   2. Computes the frontier of unblocked phases (status pending/in_progress, no blocked_by unfulfilled)
//   3. For each frontier phase, spawns a Claude Code CLI session with a self-contained brief
//      that runs the phase through Understand → Design → Implement → Verify → Sign-off
//   4. Records the tick to web/content/reports/reseller-goal-history.jsonl (same shape as cron-health.jsonl)
//   5. Updates the goal file on phase completion (status + exit_criteria checked)
//
// Constraints (from memory):
//   - No Docker / no CI (feedback_deploy_no_docker) — invoked from system crontab
//   - Server does periodic git reset --hard (feedback_autonomous_git_reset) — MUST commit + push
//     after every state-change edit
//   - Git source is GitHub (reference_gitlab_reverse_proxy) — push origin master
//
// This file is a working skeleton. The Claude Code CLI invocation is the load-bearing wire; it
// dispatches the phase brief to `claude` (see claude-api / claude-code skills) which then runs
// the multi-agent workflow inside a git worktree.

import { readFile, appendFile, mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')

// -- config ------------------------------------------------------------------

const GOAL_FILE = join(REPO_ROOT, 'docs', 'plans', 'reseller-module-goal.md')
const HISTORY_FILE = join(REPO_ROOT, 'web', 'content', 'reports', 'reseller-goal-history.jsonl')
const KILL_ENV = 'RESELLER_AUTONOMOUS_LOOP'
const TICK_ID = new Date().toISOString().replace(/[:.]/g, '-')

// -- helpers -----------------------------------------------------------------

/** Emit a telemetry row matching cron-health.jsonl / guardian-history.jsonl format. */
async function log(row) {
  const line = JSON.stringify({ tick_id: TICK_ID, ts: new Date().toISOString(), ...row }) + '\n'
  await mkdir(dirname(HISTORY_FILE), { recursive: true })
  await appendFile(HISTORY_FILE, line, 'utf8')
  process.stderr.write(line)

  // Also mirror a compact "current activity" line to a status file so
  // show-next-reseller-tick.sh (and any dashboard) can render live state
  // without parsing the whole JSONL.
  try {
    const status = {
      tick_id: TICK_ID,
      ts: new Date().toISOString(),
      current_stage: row.stage ?? 'unknown',
      ...row,
    }
    await writeFile('/tmp/blockid-reseller-loop.status', JSON.stringify(status, null, 2), 'utf8')
  } catch { /* status file is best-effort */ }
}

/** Kill-switch check. Exits 0 (not error) so cron doesn't spam alerts. */
function checkKillSwitch() {
  if ((process.env[KILL_ENV] || '').toLowerCase() === 'off') {
    // eslint-disable-next-line no-console
    console.log(`[reseller-goal-loop] ${KILL_ENV}=off — exiting.`)
    process.exit(0)
  }
}

/** Read the goal file. Returns the raw markdown; downstream parsers pull the YAML fence. */
async function readGoal() {
  if (!existsSync(GOAL_FILE)) {
    throw new Error(`Goal file missing: ${GOAL_FILE}`)
  }
  return readFile(GOAL_FILE, 'utf8')
}

/** Extract the fenced ```yaml block from the goal markdown. Minimal parser — string search + YAML.parse. */
function extractYaml(md) {
  const start = md.indexOf('```yaml')
  const end = md.indexOf('```', start + 7)
  if (start === -1 || end === -1) throw new Error('goal file: yaml fence not found')
  return md.slice(start + 7, end).trim()
}

/** Compute frontier phases across all tracks: phase is READY if status pending/in_progress AND all blocked_by satisfied. */
function computeFrontier(goal) {
  const frontier = []
  const trackNames = Object.keys(goal.tracks || {})
  const phaseStatus = {}
  for (const t of trackNames) {
    for (const [name, ph] of Object.entries(goal.tracks[t].phases || {})) {
      phaseStatus[`${t}:${name}`] = ph.status
    }
  }
  for (const t of trackNames) {
    for (const [name, ph] of Object.entries(goal.tracks[t].phases || {})) {
      const status = ph.status
      if (typeof status === 'string' && (status === 'pending' || status === 'in_progress')) {
        const deps = ph.deps || (ph.blocked_by ? [ph.blocked_by].flat() : [])
        const ready = deps.every(d => {
          // dep can be "P0", "track_A_P1", or a full "A:P0" key
          const key = d.includes(':') ? d : (d.startsWith('track_') ? d.replace('track_', '').replace('_', ':') : `${t}:${d}`)
          return phaseStatus[key] === 'done'
        })
        if (ready) frontier.push({ track: t, phase: name, spec: ph })
      }
    }
  }
  return frontier
}

/** Compose a self-contained brief for a phase — passed verbatim to `claude` CLI. */
function buildPhaseBrief(frontier_entry, goalYaml) {
  const { track, phase, spec } = frontier_entry
  return [
    `# Autonomous phase execution brief`,
    ``,
    `## Track: ${track}   Phase: ${phase}   Status: ${spec.status}`,
    ``,
    `You are the CEO orchestrator running this phase per docs/plans/reseller-module-plan.md § U.13.`,
    `Execute the 5 stages: Understand → Design → Implement → Verify → Sign-off.`,
    `Use skill mapping from § U.12. Enforce the CI rules from § U.15 / plan-delta-2026-07-23.md §D.3.`,
    ``,
    `Exit criteria (all must pass):`,
    ...(spec.exit_criteria || []).map(c => `  - ${c}`),
    ``,
    `Migration files to author (if any): ${JSON.stringify(spec.migration_files || [])}.`,
    ``,
    `Constraints:`,
    `  - This is NOT the Next.js you know (web/AGENTS.md) — read node_modules/next/dist/docs/ before writing App Router code.`,
    `  - Commit + push after every state-change edit; server runs periodic git reset --hard.`,
    `  - No Docker, no GitHub Actions, no CI — deploy is build-from-src into the running server.`,
    `  - Apply migrations via docker exec psql + NOTIFY pgrst reload (reference_db_migrations).`,
    ``,
    `On completion:`,
    `  1. Update docs/plans/reseller-module-goal.md — set this phase's status to 'done' or 'revise'.`,
    `  2. Append a row to web/content/reports/reseller-goal-history.jsonl.`,
    `  3. Commit and push.`,
    ``,
    `Goal file YAML (verbatim, current state):`,
    '```yaml',
    goalYaml,
    '```',
  ].join('\n')
}

/** Dispatch to Claude Code CLI. Returns the child's exit code. */
function dispatchToClaude(brief, label) {
  // The `claude` CLI is expected to be on PATH in the deploy environment.
  // Non-interactive mode: --print streams to stdout.
  //   --dangerously-skip-permissions grants write + bash access without an
  //   interactive prompt so the autonomous loop can actually land edits.
  //   User has explicitly opted into continuous autonomous execution.
  const args = ['--print', '--dangerously-skip-permissions', '-p', brief]
  const started = Date.now()
  const res = spawnSync('claude', args, {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'inherit', 'inherit'],
    timeout: 45 * 60 * 1000, // 45 min per phase; align to off-peak window length
  })
  const elapsed_ms = Date.now() - started
  return { status: res.status ?? -1, elapsed_ms, signal: res.signal, label }
}

// -- main --------------------------------------------------------------------

async function main() {
  checkKillSwitch()

  await log({ stage: 'tick_start' })

  let goalMd
  try {
    goalMd = await readGoal()
  } catch (err) {
    await log({ stage: 'error', where: 'readGoal', error: String(err) })
    process.exit(1)
  }

  // Goal completion detector — if the goal file's top-level status is 'done',
  // (a) log a completion summary, (b) attempt to remove this cron entry so
  // subsequent ticks stop firing, (c) exit. Per user direction: "when the
  // entire plan is complete, stop the cron and report a summary here".
  if (/^status:\s*done\b/mi.test(goalMd)) {
    await log({
      stage: 'goal_completed',
      message: 'goal_id status: done detected — stopping loop',
      completion_marker: '/tmp/blockid-reseller-goal-done',
    })
    try {
      await writeFile('/tmp/blockid-reseller-goal-done', new Date().toISOString(), 'utf8')
    } catch { /* ignore */ }
    // Attempt to strip our own crontab entry. Non-fatal if it fails — the
    // kill switch env var and the completion marker are backup mechanisms.
    try {
      const stop = spawnSync('bash', [
        '-lc',
        `crontab -l 2>/dev/null | grep -v 'reseller-goal-loop.mjs' | crontab -`,
      ], { stdio: ['ignore', 'inherit', 'inherit'], timeout: 10_000 })
      await log({ stage: 'cron_removal', status: stop.status ?? -1 })
    } catch (err) {
      await log({ stage: 'cron_removal_failed', error: String(err) })
    }
    // Final human-readable summary line.
    process.stderr.write(
      `\n[reseller-goal-loop] GOAL COMPLETE — cron removed at ${new Date().toISOString()}. See docs/plans/reseller-module-goal.md and web/content/reports/reseller-goal-history.jsonl for the full run.\n\n`,
    )
    process.exit(0)
  }

  // Minimal YAML parse: since we don't want a yaml dependency in this skeleton,
  // we hand off the raw YAML to the Claude CLI which can parse it. The frontier
  // computation below expects a parsed object — replace with `yaml.parse()` when a
  // dependency is added or when running under `--experimental-vm-modules` with
  // a JSON goal file.
  const goalYaml = extractYaml(goalMd)

  let goalObj
  try {
    // Poor-man's YAML: only supports the specific shape of reseller-module-goal.md.
    // In production, install `yaml` npm module and use yaml.parse(goalYaml).
    // For now, we punt frontier computation to the Claude CLI itself when parsing fails.
    goalObj = null // triggers "delegate to claude" branch below
  } catch (err) {
    goalObj = null
  }

  if (goalObj) {
    const frontier = computeFrontier(goalObj)
    await log({ stage: 'frontier_computed', frontier_count: frontier.length, frontier })

    if (frontier.length === 0) {
      await log({ stage: 'idle', reason: 'no unblocked phases' })
      process.exit(0)
    }

    // Dispatch each frontier phase sequentially per off-peak tick; parallelism happens
    // INSIDE the Claude CLI via the Workflow tool (§U.13 concurrency cap 16).
    for (const entry of frontier) {
      const brief = buildPhaseBrief(entry, goalYaml)
      const result = dispatchToClaude(brief, `${entry.track}:${entry.phase}`)
      await log({ stage: 'phase_dispatched', ...result })
      if (result.status !== 0) {
        await log({ stage: 'phase_failed', label: result.label, status: result.status })
        break // Stop the tick on first failure; next tick re-evaluates
      }
    }
  } else {
    // Delegate frontier + dispatch to Claude CLI as a single call.
    // The Claude CLI reads the goal file itself, picks the frontier, and runs one phase.
    const brief = [
      `# Autonomous goal-loop tick`,
      ``,
      `Read /home/dovanlong/blockid.au/docs/plans/reseller-module-goal.md.`,
      `Compute the frontier of unblocked phases (status pending/in_progress, all deps done).`,
      `Pick ONE unblocked phase (prefer track A over track B when both are ready).`,
      `Execute it per docs/plans/reseller-module-plan.md § U.13 (Understand → Design → Implement → Verify → Sign-off).`,
      `On completion update the goal file and commit + push.`,
      `Kill switch env: ${KILL_ENV}=off.`,
    ].join('\n')
    const result = dispatchToClaude(brief, 'delegated')
    await log({ stage: 'delegated_dispatch', ...result })
  }

  // Post-phase auto-deploy hook. If new commits landed since the last
  // recorded deploy (content/reports/last-good-build.json), rebuild + swap
  // via deploy-live.sh --quick. This gives the loop end-to-end coverage:
  // phase → code → commit → deploy → verify. Skipped when nothing changed
  // (cheap check via `git rev-parse HEAD` vs last-good-build sha).
  try {
    const lastGoodPath = join(REPO_ROOT, 'web', 'content', 'reports', 'last-good-build.json')
    let lastSha = ''
    if (existsSync(lastGoodPath)) {
      const raw = await readFile(lastGoodPath, 'utf8')
      try {
        const parsed = JSON.parse(raw)
        lastSha = (parsed.git_sha || parsed.sha || '').slice(0, 7)
      } catch { /* ignore */ }
    }
    const headSha = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' })
      .stdout?.trim() ?? ''
    if (headSha && headSha !== lastSha) {
      await log({ stage: 'auto_deploy_triggered', head: headSha, last_deployed: lastSha })
      const deploy = spawnSync('bash', [join(REPO_ROOT, 'web', 'scripts', 'deploy-live.sh'), '--quick'], {
        cwd: join(REPO_ROOT, 'web'),
        stdio: ['ignore', 'inherit', 'inherit'],
        timeout: 10 * 60 * 1000, // 10 min deploy budget
      })
      await log({ stage: 'auto_deploy_finished', status: deploy.status ?? -1, head: headSha })
    } else {
      await log({ stage: 'auto_deploy_skipped', reason: 'no new commits', head: headSha, last_deployed: lastSha })
    }
  } catch (err) {
    await log({ stage: 'auto_deploy_failed', error: String(err) })
  }

  await log({ stage: 'tick_end' })
}

main().catch(async err => {
  await log({ stage: 'fatal', error: String(err), stack: err.stack })
  process.exit(1)
})
