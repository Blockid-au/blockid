#!/usr/bin/env node
// Atlassian ↔ AU Investor Standard Mapping — autonomous goal loop.
// Reads docs/plans/atlassian-standard-mapping-goal.md and grinds unblocked
// phases via the reusable driver in scripts/cron/goal-loop.mjs.
//
// Kill switch: env ATLASSIAN_GOAL_LOOP=off exits before any work.
// Dry-run:     node scripts/cron/atlassian-goal-loop.mjs --dry-run

import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { runGoalLoop } from './goal-loop.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')

await runGoalLoop({
  goalFile: join(REPO_ROOT, 'docs', 'plans', 'atlassian-standard-mapping-goal.md'),
  historyFile: join(REPO_ROOT, 'web', 'content', 'reports', 'atlassian-goal-history.jsonl'),
  statusFile: '/tmp/blockid-atlassian-loop.status',
  killEnv: 'ATLASSIAN_GOAL_LOOP',
  loopLabel: 'atlassian-goal-loop',
  scriptName: 'atlassian-goal-loop.mjs',
  doneMarker: '/tmp/blockid-atlassian-goal-done',
  phaseTimeoutMinutes: 45,
  phasePlanReference: 'docs/plans/atlassian-standard-mapping-goal.md (P0–P9 tracks; do NOT touch reseller code — this is the demo/guidance track)',
})
