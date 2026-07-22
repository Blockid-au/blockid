#!/usr/bin/env node
// Bump the human-review-minutes counter — CHRO advisory §26 rec #1.
// Usage:
//   node scripts/cron/bump-human-review-minutes.mjs <minutes> <reason...>
// Example:
//   node scripts/cron/bump-human-review-minutes.mjs 12 "H.20 InfoVision ABN confirmation call"
//
// Appends one JSONL row to web/content/reports/human-review-minutes.jsonl and
// prints the new rolling-7d total so operators see the KPI immediately.

import { appendHumanReviewMinutes, sumHumanReviewMinutes7d } from './human-review-minutes.mjs'

const args = process.argv.slice(2)
if (args.length < 2) {
  process.stderr.write('usage: bump-human-review-minutes.mjs <minutes> <reason...>\n')
  process.exit(2)
}

const minutes = Number(args[0])
const reason = args.slice(1).join(' ')

try {
  const row = await appendHumanReviewMinutes({ minutes, reason })
  const total = await sumHumanReviewMinutes7d()
  process.stdout.write(
    `appended ${row.minutes}min "${row.reason}" at ${row.ts}\nhuman_review_minutes_7d = ${total}\n`,
  )
} catch (err) {
  process.stderr.write(`bump failed: ${String(err.message || err)}\n`)
  process.exit(1)
}
