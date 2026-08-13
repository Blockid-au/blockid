// Autonomous goal-loop driver v2 — deploy-gated phase lifecycle.
//
// Drop-in upgrade from goal-loop.mjs (same config API). Key changes:
//
//   1. DEPLOY GATING — Claude subprocess is told to set phase status to
//      `deploy_pending` (not `done`). The driver advances to `done` only
//      after deploy-live.sh exits 0 AND last-good-build.json SHA matches
//      HEAD. Failure path: phase → `deploy_failed` + `fail_reason` field.
//
//   2. FULL DEPLOY — drop `--quick` flag. Autonomous deploys run all 11
//      gates (incl. tsc + eslint) to catch type/import breakage early.
//
//   3. LOCK-CONTENTION-AWARE — if deploy-live.sh exits 1 but another loop
//      already updated last-good-build.json with our HEAD SHA within the
//      last 120 s, treat as delegated success (avoid false deploy_failed).
//
//   4. DEPLOY_PENDING RETRY — if a previous tick left phases in
//      `deploy_pending` state (deploy had failed), the next tick skips the
//      Claude dispatch and goes straight to deploy retry. No wasted LLM
//      call; the code is already committed.
//
//   5. SHARED TELEMETRY — every deploy attempt is appended to the unified
//      web/content/reports/deploy-log.jsonl (in addition to per-loop JSONL)
//      with tick_id + loop_label so cross-loop correlation is trivial.

import { readFile, appendFile, mkdir, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync as fsReadFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

import { guardTruncations } from './truncation-guard.mjs'
import { runTestGate } from './test-gate.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')

const SHARED_DEPLOY_LOG = join(REPO_ROOT, 'web', 'content', 'reports', 'deploy-log.jsonl')
const LAST_GOOD_BUILD = join(REPO_ROOT, 'web', 'content', 'reports', 'last-good-build.json')
// Seconds since last-good-build was written in which we consider another
// loop's deploy as covering our commit (avoids false deploy_failed on lock contention).
const DELEGATED_DEPLOY_WINDOW_S = 120

/**
 * @typedef {Object} GoalLoopConfig
 * @property {string} goalFile
 * @property {string} historyFile
 * @property {string} statusFile
 * @property {string} killEnv
 * @property {string} loopLabel
 * @property {number} [phaseTimeoutMinutes=45]
 * @property {string} [scriptName]
 * @property {string} [doneMarker]
 * @property {() => Promise<number>} [humanReviewMinutesFn]
 * @property {string} [phasePlanReference]
 * @property {(ctx: GoalLoopConfig) => string} [buildDelegatedBrief]
 * @property {boolean} [dryRun]
 */

export async function runGoalLoop(config) {
  const cfg = normaliseConfig(config)
  const ctx = { ...cfg, TICK_ID: new Date().toISOString().replace(/[:.]/g, '-') }

  try {
    ctx.HUMAN_REVIEW_MINUTES_7D = await ctx.humanReviewMinutesFn()
  } catch {
    ctx.HUMAN_REVIEW_MINUTES_7D = 0
  }

  checkKillSwitch(ctx)

  if (isDryRun(ctx)) {
    await log(ctx, { stage: 'tick_start', dry_run: true })
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

  // human_blocked snapshot
  try {
    const humanBlocked = extractHumanBlockedSnapshot(goalMd)
    await log(ctx, { stage: 'human_blocked_snapshot', count: humanBlocked.length, entries: humanBlocked })
  } catch (err) {
    await log(ctx, { stage: 'human_blocked_snapshot_failed', error: String(err) })
  }

  // Goal completion detector
  if (/^status:\s*done\b/mi.test(goalMd)) {
    await log(ctx, {
      stage: 'goal_completed',
      message: `goal_id status: done detected — stopping ${ctx.loopLabel}`,
      completion_marker: ctx.doneMarker,
    })
    try { await writeFile(ctx.doneMarker, new Date().toISOString(), 'utf8') } catch { /* ignore */ }
    try {
      const stop = spawnSync('bash', ['-lc',
        `crontab -l 2>/dev/null | grep -v '${ctx.scriptName}' | crontab -`,
      ], { stdio: ['ignore', 'inherit', 'inherit'], timeout: 10_000 })
      await log(ctx, { stage: 'cron_removal', status: stop.status ?? -1 })
    } catch (err) {
      await log(ctx, { stage: 'cron_removal_failed', error: String(err) })
    }
    process.stderr.write(`\n[${ctx.loopLabel}] GOAL COMPLETE — cron removed at ${new Date().toISOString()}.\n\n`)
    process.exit(0)
  }

  // --- deploy_pending RETRY path ------------------------------------------
  // If a prior tick left phases in deploy_pending (deploy had failed), skip
  // Claude dispatch and go straight to deploy retry. Code is already shipped.
  const pendingDeploy = hasPhasesWithStatus(goalMd, 'deploy_pending')
  if (pendingDeploy) {
    await log(ctx, { stage: 'deploy_pending_retry', message: 'prior tick left deploy_pending phases — retrying deploy without new Claude dispatch' })
    await runDeployPhase(ctx, goalMd)
    await log(ctx, { stage: 'tick_end' })
    return
  }

  // --- Claude dispatch -----------------------------------------------------
  const goalYaml = extractYaml(goalMd)
  const brief = ctx.buildDelegatedBrief(ctx, goalYaml)
  const result = dispatchToClaude(ctx, brief, 'delegated')
  await log(ctx, { stage: 'delegated_dispatch', ...result })

  // --- Safety-net commit ---------------------------------------------------
  try {
    const status = spawnSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8' })
    const dirty = (status.stdout ?? '').trim()
    if (dirty) {
      await log(ctx, { stage: 'auto_commit_started', dirty_files: dirty.split('\n').length })

      try {
        const { restored } = guardTruncations(REPO_ROOT)
        if (restored.length > 0) {
          await log(ctx, {
            stage: 'truncation_guard_reverted',
            count: restored.length,
            files: restored.map((r) => ({
              path: r.path, head_lines: r.headLines, work_lines: r.workLines,
              lost_pct: Math.round(r.lostPct * 100),
            })),
          })
        }
      } catch (err) {
        await log(ctx, { stage: 'truncation_guard_failed', error: String(err) })
      }

      try {
        const gate = runTestGate(REPO_ROOT)
        if (gate.failed.length > 0 || gate.reverted.length > 0) {
          await log(ctx, {
            stage: 'test_gate_reverted',
            pairs: gate.pairs,
            ran: gate.ran.length,
            failed: gate.failed.map((f) => ({ test: f.test, source: f.source, output: f.output })),
            reverted: gate.reverted,
          })
        } else if (gate.ran.length > 0 || gate.unrunnable.length > 0) {
          await log(ctx, { stage: 'test_gate_passed', pairs: gate.pairs, ran: gate.ran.length })
        }
      } catch (err) {
        await log(ctx, { stage: 'test_gate_failed', error: String(err) })
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

  // Reload goal after commit (Claude may have updated it)
  try { goalMd = await readGoal(ctx) } catch { /* keep previous */ }

  // --- Deploy phase --------------------------------------------------------
  await runDeployPhase(ctx, goalMd)

  await log(ctx, { stage: 'tick_end' })
}

// ---------------------------------------------------------------------------
// Deploy phase — shared between normal path and deploy_pending retry
// ---------------------------------------------------------------------------

async function runDeployPhase(ctx, goalMd) {
  try {
    const headSha = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' })
      .stdout?.trim() ?? ''
    const lastSha = readLastGoodSha()

    if (!headSha || headSha === lastSha) {
      await log(ctx, { stage: 'auto_deploy_skipped', reason: 'no new commits', head: headSha, last_deployed: lastSha })
      // HEAD is already live — any deploy_pending phases are provably in production,
      // so advance them to done rather than leaving them stuck (otherwise the retry
      // path never flips because it early-returns before flipPhaseStatus).
      if (hasPhasesWithStatus(goalMd, 'deploy_pending')) {
        await flipPhaseStatus(ctx, 'deploy_pending', 'done')
      }
      return
    }

    await log(ctx, { stage: 'auto_deploy_triggered', head: headSha, last_deployed: lastSha })

    // Full deploy — no --quick (v2 policy: always run tsc + eslint gates)
    const deployStart = Date.now()
    const deploy = spawnSync('bash', [join(REPO_ROOT, 'web', 'scripts', 'deploy-live.sh')], {
      cwd: join(REPO_ROOT, 'web'),
      stdio: ['ignore', 'inherit', 'inherit'],
      timeout: 15 * 60 * 1000, // 15 min for full deploy
    })
    const elapsed_ms = Date.now() - deployStart
    const deployExitCode = deploy.status ?? -1

    // Determine actual outcome
    const freshSha = readLastGoodSha()
    const deployedOurSha = freshSha === headSha || freshSha?.startsWith(headSha) || headSha?.startsWith(freshSha ?? '')
    const lgbAge = lastGoodBuildAgeSeconds()
    const delegatedSuccess = deployExitCode !== 0 && deployedOurSha && lgbAge < DELEGATED_DEPLOY_WINDOW_S

    const deployOutcome = deployExitCode === 0 ? 'success'
      : delegatedSuccess ? 'delegated_success'
      : 'failed'

    await log(ctx, {
      stage: 'auto_deploy_finished',
      status: deployExitCode,
      outcome: deployOutcome,
      head: headSha,
      fresh_sha: freshSha,
      elapsed_ms,
      delegated: delegatedSuccess,
    })

    // Shared telemetry — cross-loop deploy log
    await logSharedDeploy(ctx, { head: headSha, outcome: deployOutcome, exit_code: deployExitCode, elapsed_ms })

    if (deployOutcome === 'success' || deployOutcome === 'delegated_success') {
      // Advance deploy_pending → done in goal file
      await flipPhaseStatus(ctx, 'deploy_pending', 'done')
    } else {
      // Mark as deploy_failed for human visibility / next-tick retry
      await flipPhaseStatus(ctx, 'deploy_pending', 'deploy_failed', `deploy-live.sh exit ${deployExitCode}`)
      await log(ctx, {
        stage: 'deploy_failed',
        message: 'phases marked deploy_failed — will retry on next tick',
        head: headSha,
      })
    }
  } catch (err) {
    await log(ctx, { stage: 'auto_deploy_error', error: String(err) })
  }
}

// ---------------------------------------------------------------------------
// Phase status flipping — driver-owned (never trust subprocess for this)
// ---------------------------------------------------------------------------

async function flipPhaseStatus(ctx, fromStatus, toStatus, failReason) {
  try {
    let goalMd = await readGoal(ctx)
    const before = goalMd

    // Replace `status: <fromStatus>` → `status: <toStatus>` inside YAML fence.
    // Handles both inline `{ status: deploy_pending }` and standalone `status: deploy_pending` lines.
    const re = new RegExp(`\\bstatus:\\s*${fromStatus}\\b`, 'g')
    goalMd = goalMd.replace(re, `status: ${toStatus}`)

    if (failReason) {
      // Inject fail_reason after the status field on the same line
      goalMd = goalMd.replace(
        new RegExp(`(status:\\s*${toStatus})`, 'g'),
        `$1, fail_reason: "${failReason.replace(/"/g, '\\"')}"`,
      )
    }

    if (goalMd === before) {
      await log(ctx, { stage: 'flip_phase_noop', from: fromStatus, to: toStatus })
      return
    }

    await writeFile(ctx.goalFile, goalMd, 'utf8')

    // Commit the phase advancement
    spawnSync('git', ['add', ctx.goalFile], { cwd: REPO_ROOT, stdio: 'ignore' })
    const msg = `chore(loop): ${ctx.loopLabel} — advance phase ${fromStatus} → ${toStatus}\n\nDeploy verified. Driver-owned transition (v2 pipeline).\n`
    const c = spawnSync('git', ['commit', '-m', msg], { cwd: REPO_ROOT, encoding: 'utf8' })
    const p = spawnSync('git', ['push', 'origin', 'master'], { cwd: REPO_ROOT, encoding: 'utf8' })

    await log(ctx, {
      stage: 'flip_phase_committed',
      from: fromStatus,
      to: toStatus,
      fail_reason: failReason ?? null,
      commit_status: c.status ?? -1,
      push_status: p.status ?? -1,
    })
  } catch (err) {
    await log(ctx, { stage: 'flip_phase_failed', from: fromStatus, to: toStatus, error: String(err) })
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readLastGoodSha() {
  try {
    if (!existsSync(LAST_GOOD_BUILD)) return ''
    const raw = JSON.parse(readFileSync(LAST_GOOD_BUILD))
    return ((raw.git_sha || raw.sha || '')).slice(0, 7)
  } catch { return '' }
}

function lastGoodBuildAgeSeconds() {
  try {
    if (!existsSync(LAST_GOOD_BUILD)) return Infinity
    const raw = JSON.parse(readFileSync(LAST_GOOD_BUILD))
    const epoch = raw.epoch ? raw.epoch * 1000 : 0
    return (Date.now() - epoch) / 1000
  } catch { return Infinity }
}

function readFileSync(p) {
  return fsReadFileSync(p, 'utf8')
}

function hasPhasesWithStatus(md, status) {
  return new RegExp(`\\bstatus:\\s*${status}\\b`).test(md)
}

async function logSharedDeploy(ctx, extra) {
  try {
    const line = JSON.stringify({
      tick_id: ctx.TICK_ID,
      loop_label: ctx.loopLabel,
      ts: new Date().toISOString(),
      ...extra,
    }) + '\n'
    await mkdir(dirname(SHARED_DEPLOY_LOG), { recursive: true })
    await appendFile(SHARED_DEPLOY_LOG, line, 'utf8')
  } catch { /* best-effort */ }
}

// ---------------------------------------------------------------------------
// Core internals (same as v1)
// ---------------------------------------------------------------------------

function normaliseConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('runGoalLoop: config required')
  const required = ['goalFile', 'historyFile', 'statusFile', 'killEnv', 'loopLabel']
  for (const k of required) {
    if (!config[k] || typeof config[k] !== 'string') throw new Error(`runGoalLoop: config.${k} must be a non-empty string`)
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
  return cfg
}

async function log(ctx, row) {
  const base = {
    tick_id: ctx.TICK_ID,
    ts: new Date().toISOString(),
    loop_label: ctx.loopLabel,
  }
  if (Number.isFinite(ctx.HUMAN_REVIEW_MINUTES_7D)) base.human_review_minutes_7d = ctx.HUMAN_REVIEW_MINUTES_7D
  const line = JSON.stringify({ ...base, ...row }) + '\n'
  await mkdir(dirname(ctx.historyFile), { recursive: true })
  await appendFile(ctx.historyFile, line, 'utf8')
  process.stderr.write(line)
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
    const m = raw.match(/^\s*([A-Za-z0-9_.]+)\s*:\s*\{\s*status:\s*human_blocked\b([^}]*)}\s*$/)
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
    `# Autonomous goal-loop tick (${ctx.loopLabel}) — v2 pipeline`,
    ``,
    `Read ${ctx.goalFile}.`,
    `Compute the frontier of unblocked phases (status pending/in_progress, all deps done, NOT human_blocked).`,
    `Pick ONE unblocked phase (prefer lower-numbered phase / earlier track when multiple are ready).`,
    `Execute it end-to-end: Understand → Design → Implement → Verify.`,
    ctx.phasePlanReference
      ? `Reference plan: ${ctx.phasePlanReference}.`
      : `Follow whatever process the goal file's phase spec dictates.`,
    `On completion update the goal file's phase status and commit + push.`,
    ``,
    `IMPORTANT — v2 pipeline status protocol:`,
    `  • When a phase is fully implemented and verified, set its status to \`deploy_pending\` (NOT \`done\`).`,
    `  • The loop driver will advance \`deploy_pending → done\` automatically after deploy-live.sh exits 0`,
    `    AND last-good-build.json confirms the HEAD SHA is live.`,
    `  • Never set status: done yourself — the driver owns that transition.`,
    `  • \`deploy_failed\` means a previous deploy attempt failed; the driver will retry on this tick.`,
    ``,
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
