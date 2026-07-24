#!/usr/bin/env node
// GA4 nightly pull — self-contained ESM cron entry.
//
// Schedule: 02:15 UTC / 12:15 AEST daily (off-peak).
//   15 2 * * * cd /home/dovanlong/blockid.au && node scripts/cron/ga4-daily-pull.mjs \
//                >> web/content/reports/ga4-daily.log 2>&1
//
// Requires env (loaded from .env.local):
//   GA4_PROPERTY_ID                       "properties/123456789" or "123456789"
//   GOOGLE_APPLICATION_CREDENTIALS_JSON   raw service-account JSON string
//
// Behaviour:
//   - Missing env  → logs "not configured", writes cron-health line, exits 0.
//   - Skips duplicate if a snapshot line already exists for the UTC "yesterday".
//   - Emits a heartbeat to web/content/reports/cron-health.jsonl on every run.
//
// This script implements the pull inline (rather than importing the TS
// client) so it needs no build step — same pattern as sibling *-goal-loop.mjs.

import { readFile, appendFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')
const REPORTS_DIR = join(REPO_ROOT, 'web', 'content', 'reports')
const JSONL = join(REPORTS_DIR, 'ga4-daily.jsonl')
const HEALTH = join(REPORTS_DIR, 'cron-health.jsonl')

// ── env loader (dotenv is optional; skip if not installed) ───────────────
try {
  const envFile = join(REPO_ROOT, '.env.local')
  if (existsSync(envFile)) {
    const raw = await readFile(envFile, 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (!m) continue
      if (process.env[m[1]] !== undefined) continue
      let v = m[2]
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
      process.env[m[1]] = v
    }
  }
} catch { /* non-fatal */ }

// ── heartbeat ────────────────────────────────────────────────────────────
async function heartbeat(ok, note) {
  try {
    await mkdir(REPORTS_DIR, { recursive: true })
    await appendFile(
      HEALTH,
      JSON.stringify({ cron: 'ga4-daily-pull', ok, note: note ?? null, at: new Date().toISOString() }) + '\n',
      'utf8',
    )
  } catch { /* ignore */ }
}

function getPropertyId() {
  const raw = (process.env.GA4_PROPERTY_ID ?? '').trim()
  if (!raw) return null
  return raw.startsWith('properties/') ? raw : `properties/${raw}`
}

function utcOffsetDate(days) {
  const now = new Date()
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days))
  return d.toISOString().slice(0, 10)
}

// ── main ─────────────────────────────────────────────────────────────────
const property = getPropertyId()
const credsRaw = (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ?? '').trim()

if (!property || !credsRaw) {
  const msg = 'GA4_PROPERTY_ID or GOOGLE_APPLICATION_CREDENTIALS_JSON missing — skip'
  console.log(`[ga4-daily-pull] ${msg}`)
  await heartbeat(false, msg)
  process.exit(0)
}

// Idempotence: yesterday (UTC).
const date = utcOffsetDate(1)
const start7 = utcOffsetDate(7)
const end7 = utcOffsetDate(1)

let existing = ''
try { existing = await readFile(JSONL, 'utf8') } catch { /* new */ }
const alreadyHasToday = existing
  .split('\n')
  .filter(Boolean)
  .some((line) => {
    try { return JSON.parse(line).date === date } catch { return false }
  })
if (alreadyHasToday) {
  console.log(`[ga4-daily-pull] snapshot for ${date} already present — no-op`)
  await heartbeat(true, `no-op (${date} already recorded)`)
  process.exit(0)
}

let google
try {
  ({ google } = await import('googleapis'))
} catch (e) {
  const msg = `googleapis import failed: ${e?.message ?? e}`
  console.error(`[ga4-daily-pull] ${msg}`)
  await heartbeat(false, msg)
  process.exit(1)
}

let credentials
try {
  credentials = JSON.parse(credsRaw)
} catch (e) {
  const msg = 'GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON'
  console.error(`[ga4-daily-pull] ${msg}`)
  await heartbeat(false, msg)
  process.exit(1)
}

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
})
const analytics = google.analyticsdata({ version: 'v1beta', auth })

async function runReport(requestBody) {
  const res = await analytics.properties.runReport({ property, requestBody })
  return res.data ?? {}
}
function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
function readMetric(row, idx) { return num(row?.metricValues?.[idx]?.value) }
function readDim(row, idx) { return row?.dimensionValues?.[idx]?.value ?? '' }

try {
  const totalsRes = await runReport({
    dateRanges: [{ startDate: date, endDate: date }],
    metrics: [
      { name: 'sessions' }, { name: 'activeUsers' }, { name: 'newUsers' },
      { name: 'screenPageViews' }, { name: 'conversions' },
      { name: 'engagementRate' }, { name: 'averageSessionDuration' },
    ],
  })
  const tRow = totalsRes.rows?.[0] ?? totalsRes.totals?.[0]
  const totals = {
    sessions: readMetric(tRow, 0),
    activeUsers: readMetric(tRow, 1),
    newUsers: readMetric(tRow, 2),
    screenPageViews: readMetric(tRow, 3),
    conversions: readMetric(tRow, 4),
    engagementRate: readMetric(tRow, 5),
    averageSessionDuration: readMetric(tRow, 6),
  }

  const pagesRes = await runReport({
    dateRanges: [{ startDate: date, endDate: date }],
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'sessions' }, { name: 'screenPageViews' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 5,
  })
  const topPages = (pagesRes.rows ?? []).map((r) => ({
    path: readDim(r, 0), sessions: readMetric(r, 0), views: readMetric(r, 1),
  }))

  const eventsRes = await runReport({
    dateRanges: [{ startDate: date, endDate: date }],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 5,
  })
  const topEvents = (eventsRes.rows ?? []).map((r) => ({ name: readDim(r, 0), count: readMetric(r, 0) }))

  const srcRes = await runReport({
    dateRanges: [{ startDate: date, endDate: date }],
    dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 5,
  })
  const sourceMedium = (srcRes.rows ?? []).map((r) => ({
    source: readDim(r, 0), medium: readDim(r, 1), sessions: readMetric(r, 0),
  }))

  const trendRes = await runReport({
    dateRanges: [{ startDate: start7, endDate: end7 }],
    dimensions: [{ name: 'date' }],
    metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'conversions' }],
    orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }],
    limit: 14,
  })
  const trend7d = (trendRes.rows ?? []).map((r) => {
    const raw = readDim(r, 0)
    const iso = raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw
    return {
      date: iso,
      sessions: readMetric(r, 0),
      users: readMetric(r, 1),
      conversions: readMetric(r, 2),
    }
  })

  const snapshot = {
    captured_at: new Date().toISOString(),
    date,
    range_days: 1,
    property_id: property,
    totals,
    topPages,
    topEvents,
    sourceMedium,
    trend7d,
  }

  await mkdir(REPORTS_DIR, { recursive: true })
  await appendFile(JSONL, JSON.stringify(snapshot) + '\n', 'utf8')
  console.log(`[ga4-daily-pull] appended snapshot for ${date} (sessions=${totals.sessions})`)
  await heartbeat(true, `appended ${date} sessions=${totals.sessions}`)
} catch (e) {
  const msg = `GA4 pull failed: ${e?.message ?? e}`
  console.error(`[ga4-daily-pull] ${msg}`)
  await heartbeat(false, msg)
  process.exit(1)
}
