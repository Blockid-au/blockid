#!/usr/bin/env node
// GA4 nightly pull — self-contained ESM cron entry.
//
// Schedule: 02:15 UTC / 12:15 AEST daily (off-peak).
//   15 2 * * * cd /home/dovanlong/blockid.au && node scripts/cron/ga4-daily-pull.mjs \
//                >> web/content/reports/ga4-daily.log 2>&1
//
// Requires env (process env or existing root/web dotenv files):
//   GA4_PROPERTY_ID                       "properties/123456789" or "123456789"
//   GOOGLE_APPLICATION_CREDENTIALS_JSON   raw service-account JSON, OR
//   GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL / GOOGLE_DRIVE_PRIVATE_KEY
//   GA_PROPERTY_ID is accepted as a fallback property alias.
//
// Options: --dry-run previews configuration/scope only (no API calls or writes).
//          --no-notify explicitly disables notifications; none are sent in any mode.
// Behaviour:
//   - Missing env  → logs "not configured", writes cron-health line, exits 0.
//   - Skips only same-day/property/range/hostname-scoped snapshots.
//   - Filters every report request to blockid.au/www.blockid.au.
//   - Emits a heartbeat to web/content/reports/cron-health.jsonl except dry-run.
//
// Plain ESM helpers keep this cron independent of the application build.

import { readFile, appendFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { ga4Configuration, mergeEnvText, hasScopedSnapshot, collectDailySnapshot, cronOptions, HOSTNAME_SCOPE } from './ga4-daily-helpers.mjs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

// No notification hooks exist; --no-notify is an explicit supported guarantee.
const options = cronOptions(process.argv.slice(2))
const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')
const REPORTS_DIR = join(REPO_ROOT, 'web', 'content', 'reports')
const JSONL = join(REPORTS_DIR, 'ga4-daily.jsonl')
const HEALTH = join(REPORTS_DIR, 'cron-health.jsonl')

// Preserve explicit process env; accept the app's existing private env location.
for (const envFile of [join(REPO_ROOT, '.env.local'), join(REPO_ROOT, 'web', '.env.local'), join(REPO_ROOT, 'web', '.env')]) {
  try { if (existsSync(envFile)) mergeEnvText(process.env, await readFile(envFile, 'utf8')) } catch { /* non-fatal */ }
}

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

function utcOffsetDate(days) {
  const now = new Date()
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days))
  return d.toISOString().slice(0, 10)
}

// ── main ─────────────────────────────────────────────────────────────────
const { property, credentials } = ga4Configuration(process.env)
if (options.dryRun) {
  console.log(JSON.stringify({ dryRun: true, configured: Boolean(property && credentials), hostname_scope: HOSTNAME_SCOPE, date: utcOffsetDate(1), requestsPlanned: 5, googleRequestsSent: 0, writesPerformed: false, notifications: false }))
  process.exit(0)
}

if (!property || !credentials) {
  const msg = 'GA4 property or service-account credentials missing/invalid — skip'
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
const alreadyHasToday = hasScopedSnapshot(existing, date, property)
if (alreadyHasToday) {
  console.log(`[ga4-daily-pull] snapshot for ${date} already present — no-op`)
  await heartbeat(true, `no-op (${date} already recorded)`)
  process.exit(0)
}

let google
try {
  // Resolve the app's installed dependency; the root cron has no package install.
  const requireWeb = createRequire(join(REPO_ROOT, 'web', 'package.json'))
  ;({ google } = requireWeb('googleapis'))
} catch (e) {
  const msg = 'googleapis dependency unavailable'
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
try {
  const snapshot = await collectDailySnapshot({ runReport, property, date, start7, end7 })

  await mkdir(REPORTS_DIR, { recursive: true })
  await appendFile(JSONL, JSON.stringify(snapshot) + '\n', 'utf8')
  console.log(`[ga4-daily-pull] appended snapshot for ${date} (sessions=${snapshot.totals.sessions})`)
  await heartbeat(true, `appended ${date} sessions=${snapshot.totals.sessions}`)
} catch (e) {
  const msg = 'GA4 readonly pull failed — check API access and quota'
  console.error(`[ga4-daily-pull] ${msg}`)
  await heartbeat(false, msg)
  process.exit(1)
}
