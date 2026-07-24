#!/usr/bin/env node
// Reseller module autonomous goal loop — per docs/plans/reseller-module-plan.md § U.5, U.13.
// Cadence: off-peak windows only (aligned with existing cloud routines).
// Kill switch: env RESELLER_AUTONOMOUS_LOOP=off exits before any work.
//
// This file used to house the driver logic inline. That logic now lives in
// scripts/cron/goal-loop.mjs — the reusable core — and this file is a thin
// wrapper that injects the reseller-specific parameters. Observable
// behaviour is unchanged: same status file (/tmp/blockid-reseller-loop.status),
// same history JSONL (web/content/reports/reseller-goal-history.jsonl),
// same kill env (RESELLER_AUTONOMOUS_LOOP), same done marker
// (/tmp/blockid-reseller-goal-done), same 45-min per-phase timeout, and the
// same CHRO §26 human-review-minutes counter injected into every telemetry row.
//
// Constraints (from memory):
//   - No Docker / no CI (feedback_deploy_no_docker) — invoked from system crontab
//   - Server does periodic git reset --hard (feedback_autonomous_git_reset) — MUST commit + push
//     after every state-change edit
//   - Git source is GitHub (reference_gitlab_reverse_proxy) — push origin master

import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { runGoalLoop } from './goal-loop.mjs'
import { sumHumanReviewMinutes7d } from './human-review-minutes.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')

await runGoalLoop({
  goalFile: join(REPO_ROOT, 'docs', 'plans', 'reseller-module-goal.md'),
  historyFile: join(REPO_ROOT, 'web', 'content', 'reports', 'reseller-goal-history.jsonl'),
  statusFile: '/tmp/blockid-reseller-loop.status',
  killEnv: 'RESELLER_AUTONOMOUS_LOOP',
  loopLabel: 'reseller-goal-loop',
  scriptName: 'reseller-goal-loop.mjs',
  doneMarker: '/tmp/blockid-reseller-goal-done',
  phaseTimeoutMinutes: 45,
  humanReviewMinutesFn: sumHumanReviewMinutes7d,
  phasePlanReference: 'docs/plans/reseller-module-plan.md § U.13 (and § U.12 skill mapping, § U.15 / plan-delta-2026-07-23.md §D.3 CI rules)',
})
