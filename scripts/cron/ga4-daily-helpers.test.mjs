// Runs under vitest via web/vitest.config.ts's `../scripts/**/*.test.mjs`
// glob, so the runner must be vitest's `test` — with `node:test` the suite
// collected zero cases and the whole file was reported FAIL. The node
// assertions below are unchanged and work as-is inside vitest.
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { ga4Configuration, mergeEnvText, hasScopedSnapshot, collectDailySnapshot, HOSTNAME_SCOPE, cronOptions } from './ga4-daily-helpers.mjs'

const pair = { GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL: 'fixture@example.invalid', GOOGLE_DRIVE_PRIVATE_KEY: '"fixture\\nkey"' }
test('pair, JSON priority/fallback, property aliases and invalid IDs match reader contract', () => {
  assert.deepEqual(ga4Configuration({ ...pair, GA_PROPERTY_ID: ' properties/123 ' }), { property: 'properties/123', credentials: { client_email: 'fixture@example.invalid', private_key: 'fixture\nkey' } })
  const json = JSON.stringify({ client_email: 'json@example.invalid', private_key: 'json\\nkey' })
  assert.equal(ga4Configuration({ ...pair, GOOGLE_APPLICATION_CREDENTIALS_JSON: json }).credentials.client_email, 'json@example.invalid')
  for (const raw of ['broken', '{}', '{"client_email":1,"private_key":2}']) assert.equal(ga4Configuration({ ...pair, GOOGLE_APPLICATION_CREDENTIALS_JSON: raw }).credentials.client_email, pair.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL)
  for (const id of ['https://property/123','properties/notnumeric','']) assert.equal(ga4Configuration({GA4_PROPERTY_ID:id}).property, null)
  assert.equal(ga4Configuration({GA4_PROPERTY_ID:'456',GA_PROPERTY_ID:'123'}).property, 'properties/456')
  assert.equal(ga4Configuration({}).credentials,null)
})
test('dotenv merges preserve inherited configuration and normalize single-quoted pair', () => {
  const env = { GA4_PROPERTY_ID: '123' }
  mergeEnvText(env, "GA4_PROPERTY_ID=999\nGOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL='fixture@example.invalid'\nGOOGLE_DRIVE_PRIVATE_KEY='fixture\\nkey'\n")
  mergeEnvText(env, 'GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL=ignored@example.invalid')
  assert.equal(ga4Configuration(env).property, 'properties/123')
  assert.equal(ga4Configuration(env).credentials.private_key,'fixture\nkey')
  assert.equal(env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL,'fixture@example.invalid')
})
test('daily dedup requires same property, date, one-day range and exact hostname scope', () => {
  const row={date:'2026-09-21',property_id:'properties/123',range_days:1,hostname_scope:[...HOSTNAME_SCOPE]}
  assert.equal(hasScopedSnapshot(JSON.stringify(row),'2026-09-21','properties/123'),true)
  for(const changed of [{...row,hostname_scope:undefined},{...row,hostname_scope:['startupvalueindex.com']},{...row,hostname_scope:[...HOSTNAME_SCOPE,'staging.blockid.au']},{...row,hostname_scope:['blockid.au','blockid.au']},{...row,property_id:'properties/999'},{...row,range_days:7},{...row,date:'2026-09-20'}]) assert.equal(hasScopedSnapshot(JSON.stringify(changed),'2026-09-21','properties/123'),false)
  assert.equal(hasScopedSnapshot('broken\n'+JSON.stringify({...row,hostname_scope:[...HOSTNAME_SCOPE].reverse()}),'2026-09-21','properties/123'),true)
})
test('all five actual collector requests are hostname-filtered and metadata is explicit', async () => {
  const requests=[]
  const snapshot=await collectDailySnapshot({ property:'properties/123',date:'2026-09-21',start7:'2026-09-15',end7:'2026-09-21',now:new Date('2026-09-22T02:15:00Z'),runReport:async request=>{requests.push(request);return request.dimensions ? {rows:[]} : {rows:[{metricValues:[{value:'7'}]}]}} })
  assert.equal(requests.length,5)
  for (const request of requests) assert.deepEqual(request.dimensionFilter,{filter:{fieldName:'hostName',inListFilter:{values:['blockid.au','www.blockid.au'],caseSensitive:false}}})
  assert.deepEqual(requests.map(r=>r.dimensions?.map(d=>d.name)??[]),[[],['pagePath'],['eventName'],['sessionSource','sessionMedium'],['date']])
  assert.deepEqual(snapshot.hostname_scope,[...HOSTNAME_SCOPE]);assert.equal(snapshot.totals.sessions,7);assert.equal(snapshot.property_id,'properties/123')
  assert.equal(snapshot.captured_at,'2026-09-22T02:15:00.000Z')
})
test('dry-run and explicit no-notify never enable messaging',()=>{
  assert.deepEqual(cronOptions(['--dry-run','--no-notify']),{dryRun:true,notifications:false})
  assert.deepEqual(cronOptions([]),{dryRun:false,notifications:false})
  assert.throws(()=>cronOptions(['--notify']))
})
