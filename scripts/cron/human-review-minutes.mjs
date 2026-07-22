// Human-review-minutes KPI helper — CHRO advisory §26 rec #1.
// Storage: web/content/reports/human-review-minutes.jsonl (append-only JSONL,
// one line per bump). Consumed by scripts/cron/reseller-goal-loop.mjs so every
// tick telemetry row carries human_review_minutes_7d, keeping the
// kpi.eng_weeks_burned=0 claim audit-able against real human handoff cost.
//
// Bump via scripts/cron/bump-human-review-minutes.mjs so appends stay
// consistent (schema below is the source of truth).
//
// Line schema: { ts: iso8601, minutes: number, reason: string, tick_id?: string }

import { readFile, appendFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')
export const COUNTER_FILE = join(REPO_ROOT, 'web', 'content', 'reports', 'human-review-minutes.jsonl')

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export async function sumHumanReviewMinutes7d(now = Date.now()) {
  if (!existsSync(COUNTER_FILE)) return 0
  let raw
  try {
    raw = await readFile(COUNTER_FILE, 'utf8')
  } catch {
    return 0
  }
  const cutoff = now - SEVEN_DAYS_MS
  let total = 0
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let row
    try {
      row = JSON.parse(trimmed)
    } catch {
      continue
    }
    const ts = Date.parse(row.ts)
    const minutes = Number(row.minutes)
    if (!Number.isFinite(ts) || !Number.isFinite(minutes)) continue
    if (ts < cutoff) continue
    total += minutes
  }
  return total
}

export async function appendHumanReviewMinutes({ minutes, reason, tick_id }) {
  const n = Number(minutes)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`appendHumanReviewMinutes: minutes must be positive number, got ${minutes}`)
  }
  if (typeof reason !== 'string' || !reason.trim()) {
    throw new Error('appendHumanReviewMinutes: reason must be non-empty string')
  }
  const row = { ts: new Date().toISOString(), minutes: n, reason: reason.trim() }
  if (tick_id) row.tick_id = String(tick_id)
  await mkdir(dirname(COUNTER_FILE), { recursive: true })
  await appendFile(COUNTER_FILE, JSON.stringify(row) + '\n', 'utf8')
  return row
}
