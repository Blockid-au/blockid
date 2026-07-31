// Generic autonomous goal-loop driver — reusable core extracted from
// scripts/cron/reseller-goal-loop.mjs (which was the canonical prototype).
//
// This module exports `runGoalLoop({ ... })`. It preserves EVERY safety
// property of the reseller driver:
//   - Kill-switch check first (env <killEnv>=off exits 0 before any work).
//   - Idempotent: two ticks racing (flock) collapse — status/history append
//     lines with unique tick_id, never rewrite state.
//   - human_blocked phases are logged as skipped-with-reason via the
//     human_blocked_snapshot stage; the loop does not spin trying to
//     advance them.
//   - Safety-net commit + push after every state change (server runs a
//     periodic `git reset --hard`, so uncommitted edits are lost).
//   - Post-phase auto-deploy hook (deploy-live.sh --quick) when new
//     commits landed since content/reports/last-good-build.json.
//   - Goal-completion detector: when the goal file's top-level status is
//     "done" we write /tmp/blockid-<label>-done, strip our own crontab
//     entry, and exit.
//
// Any reseller-specific string that used to live inline (kill env, goal
// path, history path, status path, cron self-removal grep) is now a
// constructor parameter.
//
// Optional param `humanReviewMinutesFn`: async () => number. The reseller
// loop injects the CHRO §26 counter; the other loops leave it as the
// default (returns 0) since human-review minutes are counted against the
// reseller escalation path only.

import { readFile, appendFile, mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')

/**
 * @typedef {Object} GoalLoopConfig
 * @property {string} goalFile        absolute path to docs/plans/<name>.md
 * @property {string} historyFile     absolute path to web/content/reports/<name>-history.jsonl
 * @property {string} statusFile      absolute path to /tmp/blockid-<name>-loop.status
 * @property {string} killEnv         env var name (e.g. 'ATLASSIAN_GOAL_LOOP')
 * @property {string} loopLabel       human-readable label (e.g. 'atlassian-goal-loop')
 * @property {number} [phaseTimeoutMinutes=45]
 * @property {string} [scriptName]    used for cron self-removal grep. Default: `${loopLabel}.mjs`
 * @property {string} [doneMarker]    Default: `/tmp/blockid-${loopLabel}-done`
 * @property {() => Promise<number>} [humanReviewMinutesFn]
 * @property {string} [phasePlanReference] optional string embedded in the default brief (e.g. "docs/plans/reseller-module-plan.md § U.13")
 * @property {(entry: any, goalYaml: string, ctx: GoalLoopConfig) => string} [buildPhaseBrief]
 * @property {(ctx: GoalLoopConfig) => string} [buildDelegatedBrief]
 * @property {boolean} [dryRun]       If true, log tick_start + exit without dispatching to Claude
 */

/** Public entry point. */
export async function runGoalLoop(config) {
  const cfg = normaliseConfig(config)
  const ctx = { ...cfg, TICK_ID: new Date().toISOString().replace(/[:.]/g, '-') }

  // Sample human-review minutes once per process. Best-effort; a bad counter
  // file must NEVER block a tick — matches original reseller behaviour.
  try {
    ctx.HUMAN_REVIEW_MINUTES_7D = await ctx.humanReviewMinutesFn()
  } catch {
    ctx.HUMAN_REVIEW_MINUTES_7D = 0
  }

  checkKillSwitch(ctx)

  if (isDryRun(ctx)) {
    await log(ctx, { stage: 'tick_start', dry_run: true })
    // eslint-disable-next-line no-console
    console.log(`[${ctx.loopLabel}] --dry-run — exiting before dispatch.`)
    process.exit(0)
  }

  await log(ctx, { stage: 'tick_start' })

  let goalMd
  try {
    goalMd = await readGoal(ctx)
  } catch (err) {
    await log(ctx, { stage: 'error', where: 'readGoal', error: String(err) })
    process.exit(1)
  }

  // human_blocked snapshot on every tick — machine-visible escalations
  try {
    const humanBlocked = extractHumanBlockedSnapshot(goalMd)
    await log(ctx, {
      stage: 'human_blocked_snapshot',
      count: humanBlocked.length,
      entries: humanBlocked,
    })
  } catch (err) {
    await log(ctx, { stage: 'human_blocked_snapshot_failed', error: String(err) })
  }

  // Goal completion detector — top-level `status: done` in the YAML fence.
  if (/^status:\s*done\b/mi.test(goalMd)) {
    await log(ctx, {
      stage: 'goal_completed',
      message: `goal_id status: done detected — stopping ${ctx.loopLabel}`,
      completion_marker: ctx.doneMarker,
    })
    try {
      await writeFile(ctx.doneMarker, new Date().toISOString(), 'utf8')
    } catch { /* ignore */ }
    try {
      const stop = spawnSync('bash', [
        '-lc',
        `crontab -l 2>/dev/null | grep -v '${ctx.scriptName}' | crontab -`,
      ], { stdio: ['ignore', 'inherit', 'inherit'], timeout: 10_000 })
      await log(ctx, { stage: 'cron_removal', status: stop.status ?? -1 })
    } catch (err) {
      await log(ctx, { stage: 'cron_removal_failed', error: String(err) })
    }
    process.stderr.write(
      `\n[${ctx.loopLabel}] GOAL COMPLETE — cron removed at ${new Date().toISOString()}. See ${ctx.goalFile} and ${ctx.historyFile} for the full run.\n\n`,
    )
    process.exit(0)
  }

  // Punt frontier computation to the Claude CLI (mirrors the reseller
  // driver — we intentionally avoid pulling a YAML dep).
  const goalYaml = extractYaml(goalMd)

  const brief = ctx.buildDelegatedBrief(ctx, goalYaml)
  const result = dispatchToClaude(ctx, brief, 'delegated')
  await log(ctx, { stage: 'delegated_dispatch', ...result })

  // Safety-net commit + push. The server's periodic `git reset --hard` will
  // wipe uncommitted edits, so we commit whatever the Claude subprocess left
  // behind under a catch-all message. Per-phase provenance stays in the goal
  // file + history JSONL.
  try {
    const status = spawnSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8' })
    const dirty = (status.stdout ?? '').trim()
    if (dirty) {
      await log(ctx, { stage: 'auto_commit_started', dirty_files: dirty.split('\n').length })

      // Veto accidental truncations before staging. The Claude subprocess
      // sometimes rewrites a large module and emits only a partial version;
      // `git add -A` would happily commit and push that. This has silently
      // broken the build at least four times (cfo-valuation.ts: 766->208 at
      // c86b2365, 539->151 at b39c5819, plus commit 8354fe01 "undo accidental
      // truncation"), each time blocking every deploy because Gate 3 of
      // deploy-live.sh requires zero TypeScript errors. The guard restores
      // only the truncated files; the rest of the tick still commits.
      try {
        const { restored } = guardTruncations(REPO_ROOT)
        if (restored.length > 0) {
          await log(ctx, {
            stage: 'truncation_guard_reverted',
            count: restored.length,
            files: restored.map((r) => ({
              path: r.path,
              head_lines: r.headLines,
              work_lines: r.workLines,
              lost_pct: Math.round(r.lostPct * 100),
            })),
          })
        }
      } catch (err) {
        await log(ctx, { stage: 'truncation_guard_failed', error: String(err) })
      }

      spawnSync('git', ['add', '-A'], { cwd: REPO_ROOT, stdio: 'ignore' })
      const msg = `chore(loop): autonomous tick ${ctx.TICK_ID} — commit uncommitted edits\n\nSafety-net commit from ${ctx.loopLabel}: the claude CLI subprocess landed edits but did not commit them itself. See ${relFromRepo(ctx.historyFile)} for phase provenance.\n`
      const c = spawnSync('git', ['commit', '-m', msg], { cwd: REPO_ROOT, encoding: 'utf8' })
      const p = spawnSync('git', ['push', 'origin', 'master'], { cwd: REPO_ROOT, encoding: 'utf8' })
      await log(ctx, { stage: 'auto_commit_finished', commit_status: c.status ?? -1, push_status: p.status ?? -1 })
    }
  } catch (err) {
    await log(ctx, { stage: 'auto_commit_failed', error: String(err) })
  }

  // Post-phase auto-deploy hook (deploy-live.sh --quick) — only if new
  // commits landed since content/reports/last-good-build.json. Shared
  // across every loop; deploy is idempotent (skipped when no new commits).
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
      await log(ctx, { stage: 'auto_deploy_triggered', head: headSha, last_deployed: lastSha })
      const deploy = spawnSync('bash', [join(REPO_ROOT, 'web', 'scripts', 'deploy-live.sh'), '--quick'], {
        cwd: join(REPO_ROOT, 'web'),
        stdio: ['ignore', 'inherit', 'inherit'],
        timeout: 10 * 60 * 1000,
      })
      await log(ctx, { stage: 'auto_deploy_finished', status: deploy.status ?? -1, head: headSha })
    } else {
      await log(ctx, { stage: 'auto_deploy_skipped', reason: 'no new commits', head: headSha, last_deployed: lastSha })
    }
  } catch (err) {
    await log(ctx, { stage: 'auto_deploy_failed', error: String(err) })
  }

  await log(ctx, { stage: 'tick_end' })
}

// -- internals ---------------------------------------------------------------

function normaliseConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('runGoalLoop: config required')
  const required = ['goalFile', 'historyFile', 'statusFile', 'killEnv', 'loopLabel']
  for (const k of required) {
    if (!config[k] || typeof config[k] !== 'string') {
      throw new Error(`runGoalLoop: config.${k} must be a non-empty string`)
    }
  }
  const cfg = {
    phaseTimeoutMinutes: 45,
    dryRun: false,
    humanReviewMinutesFn: async () => 0,
    scriptName: `${config.loopLabel}.mjs`,
    doneMarker: `/tmp/blockid-${config.loopLabel}-done`,
    phasePlanReference: null,
    ...config,
  }
  if (!cfg.buildDelegatedBrief) cfg.buildDelegatedBrief = defaultDelegatedBrief
  if (!cfg.buildPhaseBrief) cfg.buildPhaseBrief = defaultPhaseBrief
  return cfg
}

async function log(ctx, row) {
  const base = {
    tick_id: ctx.TICK_ID,
    ts: new Date().toISOString(),
    loop_label: ctx.loopLabel,
  }
  if (Number.isFinite(ctx.HUMAN_REVIEW_MINUTES_7D)) {
    base.human_review_minutes_7d = ctx.HUMAN_REVIEW_MINUTES_7D
  }
  const line = JSON.stringify({ ...base, ...row }) + '\n'
  await mkdir(dirname(ctx.historyFile), { recursive: true })
  await appendFile(ctx.historyFile, line, 'utf8')
  process.stderr.write(line)

  // Mirror compact "current activity" to a status file. Best-effort.
  try {
    const status = {
      loop_label: ctx.loopLabel,
      tick_id: ctx.TICK_ID,
      ts: new Date().toISOString(),
      current_stage: row.stage ?? 'unknown',
      ...row,
    }
    await writeFile(ctx.statusFile, JSON.stringify(status, null, 2), 'utf8')
  } catch { /* best-effort */ }
}

function checkKillSwitch(ctx) {
  if ((process.env[ctx.killEnv] || '').toLowerCase() === 'off') {
    // eslint-disable-next-line no-console
    console.log(`[${ctx.loopLabel}] ${ctx.killEnv}=off — exiting.`)
    process.exit(0)
  }
}

function isDryRun(ctx) {
  return process.argv.includes('--dry-run') || Boolean(ctx.dryRun)
}

async function readGoal(ctx) {
  if (!existsSync(ctx.goalFile)) throw new Error(`Goal file missing: ${ctx.goalFile}`)
  return readFile(ctx.goalFile, 'utf8')
}

function extractHumanBlockedSnapshot(md) {
  const entries = []
  for (const raw of md.split('\n')) {
    const m = raw.match(/^\s*([A-Za-z0-9_.]+)\s*:\s*\{\s*status:\s*human_blocked\b([^}]*)\}\s*$/)
    if (!m) continue
    const [, id, rest] = m
    const blockerMatch = rest.match(/blocker:\s*"((?:[^"\\]|\\.)*)"/)
    entries.push({ id, blocker: blockerMatch ? blockerMatch[1] : null })
  }
  return entries
}

function extractYaml(md) {
  const start = md.indexOf('```yaml')
  const end = md.indexOf('```', start + 7)
  if (start === -1 || end === -1) throw new Error('goal file: yaml fence not found')
  return md.slice(start + 7, end).trim()
}

function dispatchToClaude(ctx, brief, label) {
  const args = ['--print', '--dangerously-skip-permissions', '-p', brief]
  const started = Date.now()
  const res = spawnSync('claude', args, {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'inherit', 'inherit'],
    timeout: ctx.phaseTimeoutMinutes * 60 * 1000,
  })
  return { status: res.status ?? -1, elapsed_ms: Date.now() - started, signal: res.signal, label }
}

function relFromRepo(abs) {
  return abs.startsWith(REPO_ROOT + '/') ? abs.slice(REPO_ROOT.length + 1) : abs
}

function defaultDelegatedBrief(ctx, _goalYaml) {
  const lines = [
    `# Autonomous goal-loop tick (${ctx.loopLabel})`,
    ``,
    `Read ${ctx.goalFile}.`,
    `Compute the frontier of unblocked phases (status pending/in_progress, all deps done, NOT human_blocked).`,
    `Pick ONE unblocked phase (prefer lower-numbered phase / earlier track when multiple are ready).`,
    `Execute it end-to-end: Understand → Design → Implement → Verify → Sign-off.`,
    ctx.phasePlanReference
      ? `Reference plan: ${ctx.phasePlanReference}.`
      : `Follow whatever process the goal file's phase spec dictates.`,
    `On completion update the goal file's phase status and commit + push.`,
    `Append a row to ${ctx.historyFile}.`,
    `Kill switch env: ${ctx.killEnv}=off.`,
    `Constraints:`,
    `  - This is NOT the Next.js you know (web/AGENTS.md) — read node_modules/next/dist/docs/ before writing App Router code.`,
    `  - Commit + push after every state-change edit; server runs periodic git reset --hard.`,
    `  - No Docker, no GitHub Actions, no CI — deploy is build-from-src into the running server.`,
    `  - Apply migrations via docker exec psql + NOTIFY pgrst reload.`,
  ]
  return lines.join('\n')
}

function defaultPhaseBrief(frontier_entry, goalYaml, ctx) {
  const { track, phase, spec } = frontier_entry
  return [
    `# Autonomous phase execution brief (${ctx.loopLabel})`,
    ``,
    `## Track: ${track}   Phase: ${phase}   Status: ${spec.status}`,
    ``,
    ctx.phasePlanReference
      ? `You are the CEO orchestrator running this phase per ${ctx.phasePlanReference}.`
      : `You are the CEO orchestrator running this phase per the goal file's phase spec.`,
    `Execute the 5 stages: Understand → Design → Implement → Verify → Sign-off.`,
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
    `  - Apply migrations via docker exec psql + NOTIFY pgrst reload.`,
    ``,
    `On completion:`,
    `  1. Update ${ctx.goalFile} — set this phase's status to 'done' or 'revise'.`,
    `  2. Append a row to ${ctx.historyFile}.`,
    `  3. Commit and push.`,
    ``,
    `Goal file YAML (verbatim, current state):`,
    '```yaml',
    goalYaml,
    '```',
  ].join('\n')
}
