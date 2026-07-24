#!/usr/bin/env node
// UX / Information-Architecture Startup Flow — autonomous goal loop.
// Reads docs/plans/ux-ia-startup-flow-goal.md and grinds unblocked
// phases via the reusable driver in scripts/cron/goal-loop.mjs.
//
// Kill switch: env UX_IA_GOAL_LOOP=off exits before any work.
// Dry-run:     node scripts/cron/ux-ia-goal-loop.mjs --dry-run

import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { runGoalLoop } from './goal-loop.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')

await runGoalLoop({
  goalFile: join(REPO_ROOT, 'docs', 'plans', 'ux-ia-startup-flow-goal.md'),
  historyFile: join(REPO_ROOT, 'web', 'content', 'reports', 'ux-ia-goal-history.jsonl'),
  statusFile: '/tmp/blockid-ux-ia-loop.status',
  killEnv: 'UX_IA_GOAL_LOOP',
  loopLabel: 'ux-ia-goal-loop',
  scriptName: 'ux-ia-goal-loop.mjs',
  doneMarker: '/tmp/blockid-ux-ia-goal-done',
  phaseTimeoutMinutes: 45,
  phasePlanReference: 'docs/plans/ux-ia-startup-flow-goal.md (P0–P9 tracks; enforce file_boundary_safe_zones — the nav files listed in the goal frontmatter are the only IA-mutable surfaces)',
})
