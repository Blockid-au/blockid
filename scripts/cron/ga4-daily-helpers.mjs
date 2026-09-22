// Pure cron helpers: no env reads, network, filesystem writes or notifications.
// Credential/property behavior mirrors web/src/lib/analytics/ga4-credentials.ts.
export function cronOptions(args) {
  if (args.some(arg => !['--dry-run', '--no-notify'].includes(arg))) throw new Error('Only --dry-run and --no-notify are supported')
  return { dryRun: args.includes('--dry-run'), notifications: false }
}
export const HOSTNAME_SCOPE = Object.freeze(['blockid.au', 'www.blockid.au'])
export function ga4Configuration(env) {
  const id = (env.GA4_PROPERTY_ID ?? env.GA_PROPERTY_ID ?? '').trim().replace(/^properties\//, '')
  const property = /^\d+$/.test(id) ? `properties/${id}` : null
  let credentials = null
  const raw = env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim()
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (typeof parsed.client_email === 'string' && parsed.client_email && typeof parsed.private_key === 'string' && parsed.private_key) {
        credentials = { client_email: parsed.client_email, private_key: parsed.private_key.replace(/\\n/g, '\n') }
      }
    } catch { /* Invalid JSON may fall back to the existing service-account pair. */ }
  }
  if (!credentials) {
    const email = env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL?.trim()
    const key = env.GOOGLE_DRIVE_PRIVATE_KEY?.trim().replace(/^["']|["']$/g, '')
    if (email && key) credentials = { client_email: email, private_key: key.replace(/\\n/g, '\n') }
  }
  return { property, credentials }
}
export function mergeEnvText(env, text) {
  for (const line of text.split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!match || env[match[1]] !== undefined) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    env[match[1]] = value
  }
  return env
}
export function hasScopedSnapshot(jsonl, date, property) {
  return jsonl.split('\n').some(line => {
    try {
      const row = JSON.parse(line)
      return row.date === date && row.property_id === property && row.range_days === 1 &&
        Array.isArray(row.hostname_scope) && row.hostname_scope.length === HOSTNAME_SCOPE.length &&
        HOSTNAME_SCOPE.every(host => row.hostname_scope.includes(host))
    } catch { return false }
  })
}
function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
function readMetric(row, idx) { return num(row?.metricValues?.[idx]?.value) }
function readDim(row, idx) { return row?.dimensionValues?.[idx]?.value ?? '' }

export async function collectDailySnapshot({ runReport, property, date, start7, end7, now = new Date() }) {
  const runSiteReport = request => runReport({ ...request, dimensionFilter: { filter: {
    fieldName: 'hostName', inListFilter: { values: [...HOSTNAME_SCOPE], caseSensitive: false },
  } } })
  const totalsRes = await runSiteReport({
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

  const pagesRes = await runSiteReport({
    dateRanges: [{ startDate: date, endDate: date }],
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'sessions' }, { name: 'screenPageViews' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 5,
  })
  const topPages = (pagesRes.rows ?? []).map((r) => ({
    path: readDim(r, 0), sessions: readMetric(r, 0), views: readMetric(r, 1),
  }))

  const eventsRes = await runSiteReport({
    dateRanges: [{ startDate: date, endDate: date }],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 5,
  })
  const topEvents = (eventsRes.rows ?? []).map((r) => ({ name: readDim(r, 0), count: readMetric(r, 0) }))

  const srcRes = await runSiteReport({
    dateRanges: [{ startDate: date, endDate: date }],
    dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 5,
  })
  const sourceMedium = (srcRes.rows ?? []).map((r) => ({
    source: readDim(r, 0), medium: readDim(r, 1), sessions: readMetric(r, 0),
  }))

  const trendRes = await runSiteReport({
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
    captured_at: now.toISOString(),
    date,
    range_days: 1,
    property_id: property,
    hostname_scope: [...HOSTNAME_SCOPE],
    totals,
    topPages,
    topEvents,
    sourceMedium,
    trend7d,
  }

  return snapshot
}
