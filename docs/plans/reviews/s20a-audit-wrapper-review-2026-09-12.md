> **Disposition (2026-09-12):** no P0/P1; the live check before this review found the real defect (every insert failing on `digest()` search_path → fixed by 0337). Six P2 → fix in flight (0338).

# S20-A review — apiRoute() wrapper across 298 mutating routes (+0337)

Scope: 96988ccc5 (merge), 43da8a63f / 47ff07162 / 5cd2948ed (worktree), c2fbecced (0337).
Read: web/src/lib/audit/{api-route,context,sink,redact,events,chain-verify}.ts, allowlist.json, coverage.test.ts,
migrations 0076/0335/0337, api/cron/audit-chain-verify, api/audit-log/export, workspace/audit-log/page.tsx.
Sampled 28 wrapped routes: svi/dimensions/stream + rnd + rnd/sections (SSE), auth/logout + unsubscribe +
investor-data-room (redirects), svi/pdf, svi/docx, valuation/pdf, financial-projections, investor-pack/generate,
upload, evidence/upload, admin/drive/upload (multipart/file), keys, stripe/checkout, projects/[id], projects/members/accept,
v1/vc/[jti]/revoke (api-key actor), admin/resellers/[code], tbr/[token]/lead, evaluations/claim/[token],
notifications/[id]/read (arity-0 `_req`), startup-package/deliverable/[slug], mentor/access-grant/[grantId],
legal/wholesale-verify, admin/affiliate/attributions/[attributionId]/revoke, billing/cancel-trial.
Live DB checked (read-only): 1 v1 row written after 0337 (funding.preview.create, 400) — the fix works;
`audit_events_verify_chain(0,50000)` → checked=1, no break. `vitest run src/lib/audit` → 120/120 pass.

**Verdict: no P0/P1. Behaviour of the 298 routes is unchanged; the audit path cannot throw into a handler.
Six P2 hardening items, two of them worth doing before the log is relied on as evidence.**

## Findings

P2-1  SSE / streaming: first byte delayed by the audit write; status recorded before the stream ends
  api-route.ts:265 — `await finalizeAudit(...)` runs before `return response`. For svi/dimensions/stream/route.ts:754,
  rnd/route.ts:487, rnd/sections/route.ts:292 the handler returns `new Response(ReadableStream)` immediately, so the
  wrapper does NOT wait for the stream to finish (`start()` keeps running in the ALS store), but the SSE headers are held
  until the insert completes (≤1.5 s under a slow DB / advisory-lock pile-up) and the row says status 200 even when the
  stream later emits `fatal_error`. Standalone Node server, so awaiting is not needed for durability.
  Fix: `void finalizeAudit(...)` on both the success and the throw path (it never rejects), or at least when
  `response.body instanceof ReadableStream` / content-type is `text/event-stream`. Same applies to the throw path
  (api-route.ts:250) which delays the 500 by up to 1.5 s.

P2-2  `redirect()` / `notFound()` thrown inside a handler would be logged as 500 + threw
  api-route.ts:247-258 catches everything and records status 500 before rethrowing. The error IS rethrown unchanged
  (Next still turns NEXT_REDIRECT into 307 / NEXT_NOT_FOUND into 404), so no behaviour change — but the row is wrong.
  Checked: no wrapped route or lib helper they call imports next/navigation (only lib/entitlements/require-tier-for-page.ts,
  page-only), so this is latent today.
  Fix: in the catch, map `err.digest` starting with `NEXT_REDIRECT` → 307/308 and `NEXT_NOT_FOUND` → 404, `threw` omitted.

P2-3  ip_hash is spoofable — first x-forwarded-for hop is client-controlled
  redact.ts:196-204 takes `xff.split(",")[0]`. nginx (sites-enabled/blockid-live:103) uses `$proxy_add_x_forwarded_for`
  behind Cloudflare, so a request carrying its own `X-Forwarded-For: <victim-ip>` yields the victim's ip_hash
  (attribution poisoning; the rate-limit key in lib/iphash.ts has the same pre-existing weakness).
  Fix: prefer `cf-connecting-ip`, else the LAST xff hop; log once when the salt resolves to "" (AUDIT_IP_SALT unset in
  .env.runtime today — CRON_SECRET fallback is present, so prod is salted, but rotating CRON_SECRET silently re-keys).

P2-4  Viewer/export queries cannot use the new project index
  0335 line 68-70: `audit_events_project_ts_idx ON ((detail->>'project_id'), ts DESC) WHERE detail ? 'project_id'`.
  events.ts:136-138 runs `detail->>'project_id' = $1 ORDER BY id DESC` — the planner cannot prove the partial predicate
  from that filter (verified with EXPLAIN, enable_seqscan=off: falls back to a PK backward scan + Filter). On a large
  table every /workspace/audit-log page and CSV export scans the table.
  Fix: drop the WHERE clause and index `((detail->>'project_id'), id DESC)`; same `id DESC` for the user index.

P2-5  audit_events: anon/authenticated hold TRUNCATE (and UPDATE/DELETE) grants; TRUNCATE bypasses RLS + the no-mutate triggers
  Live grants (information_schema.role_table_grants): anon/authenticated/service_role all have TRUNCATE. RLS is fine for
  reads (anon has no matching policy; `audit_events_owner_read` uses auth.uid() which BlockID never sets — events.ts:9
  comment "service-only for reads" is therefore accurate in effect but not in policy text). PostgREST exposes no TRUNCATE
  path, so not exploitable today; still, append-only should be enforced at the grant level.
  Fix (0338): `REVOKE ALL ON audit_events FROM anon, authenticated; REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM
  service_role;` (inserts go through the trigger) + `CREATE TRIGGER ... BEFORE TRUNCATE ... EXECUTE audit_events_no_mutate()`.

P2-6  `auditNote(entityId)` stores the raw string as resource_id without the id-like check
  context.ts:387 slices to 128 chars but skips `isIdLike`; `note` extras are redacted at write time, entityId is not.
  No handler calls auditNote yet; CSV is formula-guarded (events.ts:169-175) and the page renders via React, so no
  injection — but an email/token could land verbatim in resource_id once someone uses it.
  Fix: `if (entityId && isIdLike(String(entityId))) ctx.entityId = ...`.

## Checked OK
- (1) Body/stream never touched: wrapper reads only `request.headers` and `response.status` (api-route.ts:210,261-264).
- (2) Write bounded: `withTimeout(…,1500)` with unref'd timer; `Promise.race` keeps the late rejection handled; sink and
  `finalizeAudit` swallow + console.error; `defaultSink` is a no-op under vitest unless `setAuditSink` is installed.
- (3) Errors rethrown unchanged (`throw err`, same object); tests cover 2xx/4xx/5xx/throw/undefined-return/hang.
- (4) Redaction: no body, no query string, params filtered by `pickIdParams` (`[token]` params dropped by SENSITIVE_KEY_RE
  — tbr/[token]/*, evaluations/claim/[token] store no token; `[code]` is a public reseller code); UA reduced to family;
  IP salted SHA-256/32 hex; CSV omits ip_hash/params/note entirely.
- (5) Allow-list: all 14 entries verified — every api/cron/* route gates on `isCronAuthorised`; ai-complete is
  CRON_SECRET bearer; stripe/webhook + webhook/github are signature-gated external actors and keep their own ledgers;
  the 7 telemetry routes mutate no state of record; health/healthz/status have no mutating exports.
- (6) Codemod: 0 files with a raw `export async function POST|PUT|PATCH|DELETE` left beside a wrapper, 0 duplicate
  exports, every `route:` meta string equals the file path (the 10 "mismatches" grep surfaced are pre-existing
  rate-limit `route:` keys, not apiRoute meta), every meta method equals its export name; `export { GET as POST }`
  only in api/cron/** (allow-listed). `dynamic` / `runtime` / `maxDuration` remain static `export const` in all 292 files
  that have them; no `after()`/`waitUntil`, no edge runtime among wrapped routes. Arity pinned via defineProperty.
- getCurrentUser/React `cache`: the ALS store opens before the handler, so the first (memoised) call runs inside it and
  `setAuditActor` fires; ALS propagates into `ReadableStream.start()`; a null lookup never erases a set actor
  (context.ts:352). `setAuditProject` (projects.ts:398,656) overrides role only once a project resolves.
- (7) Viewer scoping: `resolveAuditViewerScope` forces `user_id = self` for editor/viewer/no-project; owner/admin get the
  project's rows via `detail->>project_id = scope.projectId` — URL `project`/`actor` cannot widen it (events.ts:100-126);
  CSV export is owner-only (`canExport = isOwner`), 5000-row cap, formula guard on `= + - @ \t \r`, nosniff.
- (8) RLS after 0335/0337: insert only via `auth.role()='service_role'`; anon has no usable read policy; the no-update /
  no-delete triggers are intact; 0337 pins `search_path = public, extensions, pg_temp` on both functions and the
  write path is proven live.
- (9) Verifier: PK range scan `id >= from ORDER BY id LIMIT ≤50000`, one sha256 per row, 5000/page, 2M cap, `STABLE`;
  advisory xact lock removes the concurrent-insert fork; a fork inside the window is caught because `v_prev` seeds from
  the row just before `p_from_id` and every row's prev_hash is compared. Default run is a full scan (from 0), so the only
  unobserved case is an operator setting `AUDIT_CHAIN_VERIFY_FROM` — then rows before it are trusted from the DB, not
  from the previous run's persisted last_hash (document, or compare `last_hash` from audit-chain-verify.json when set).
