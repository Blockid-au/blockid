# Institutional API (read-only) — `/api/v1/institutional/*`

**Shipped:** G21 P3-B (2026-09-21). Routes: `web/src/app/api/v1/institutional/**`; core:
`web/src/lib/api-v1/institutional.ts` (auth, budget, audit, ETag, envelope) and
`web/src/lib/api-v1/institutional-data.ts` (the loaders and the PII whitelist). Machine-readable copy:
`GET /api/openapi.json`; human copy: `/developers/api` (registry slugs `v1-institutional-*`) and
`docs/API-REFERENCE.md` § 11.

## Who it is for

Accelerators, innovation programs and funds that run **BlockID Cohorts** and want the assessment numbers in their
own systems — a program CRM, a portfolio dashboard, an LP data room. It is the read side of the institutional
workflow: what the BlockID Cohort view, the Cohort Report and the Assessment Card show, without the UI.

It is **read-only**. Writes (assessments, overrides, shortlist) stay in the workspace and the Evaluator API v1
(`/api/v1/evaluations/{id}/assessment`), where every change goes through the same validation, versioning and
audit rows as the form. The institutional API never changes a score, a decision or a record.

## Endpoints

| Method | Path | Returns |
|---|---|---|
| GET | `/api/v1/institutional/cohorts?limit=` | the key owner's readable cohorts — the ones they created plus the ones they hold a reviewer / viewer seat on (`evaluation_batch_members`) |
| GET | `/api/v1/institutional/cohorts/{id}` | one cohort + its items: project id, company, stage, sector, SVI, evidence confidence, BlockID Verified level, gaps count, Δ, decision, review status, shortlist, weighted score, override count, risk flags |
| GET | `/api/v1/institutional/cohorts/{id}/snapshots?limit=` | the cohort's snapshots, newest first: summary + one row per project (svi, evidence confidence, verification level, gaps, dims) |
| GET | `/api/v1/institutional/companies/{projectId}` | the Assessment Card for one company the key owner evaluates + the published benchmark (with `n`) |
| GET | `/api/v1/institutional/benchmarks?stage=&sector=` | the published benchmark segments (stage, stage × sector) — median, p25, p75, `n`, band |
| GET | `/api/v1/institutional/methodology` | `svi_version`, score bands, dimensions + weights, the evidence confidence ladder, the benchmark n-rules, the governance URL |

Ids are UUIDs. A malformed id reads as **404**, exactly like an unknown one, and a cohort or company the key
owner may not read is also **404** — never 403 — so the id space cannot be enumerated.

## Auth

`Authorization: Bearer bk_live_…` — the same key as the Evaluator API v1, minted under Workspace → Settings →
Enterprise → API keys with the **`evaluations:read`** scope (evaluator accounts only). The key owner's plan must
carry **`api.access`** (Fund, Program and Index API plans) — re-checked on every call. The ladder, in order:

| Status | `error` | When |
|---|---|---|
| 401 | `unauthorized` | missing / malformed / unknown / revoked key |
| 429 | `rate_limited` | the key's per-minute budget is spent (`Retry-After`) |
| 402 | `plan_required` | the owner's plan lost `api.access` |
| 403 | `insufficient_scope` | the key lacks `evaluations:read` |
| 429 | `rate_limited` | the **600 reads / key / hour** institutional ceiling is spent (`Retry-After`, `X-RateLimit-Window: hour`) |

## Limits

- **600 reads per key per hour** (`INSTITUTIONAL_HOURLY_LIMIT`) on top of the key's per-minute budget. Every
  response carries `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset` for the hourly window.
- `limit` query params are 1–100.
- Responses carry an **`ETag`** (weak, over the JSON body) and `Cache-Control: private, max-age=60`. Send
  `If-None-Match` to get a **304** when nothing changed — the read is still audited. `/methodology` changes only
  with a release; cache it and re-read on a 200.
- Everything is keyed to the calling key's owner; there is no organisation-wide or cross-tenant read.

## Error envelope

Every non-2xx body is

```json
{ "ok": false, "error": "<code>", "message": "<one sentence>" }
```

plus `retry_after_seconds` on 429, `issues[]` (`{ path, message }`) on 400 `invalid_query`, and
`required_scope` on 403. 2xx bodies are `{ "ok": true, "data": …, "meta": … }`.

## PII stance

No response carries founder personal data. The projections in `institutional-data.ts` are the whitelist:
**company name + ids + scores + counts + the evaluator's own recorded decision**. Never: a founder's e-mail or user
id, an invite token, a private note, a reviewer's name, the decision log, `created_by` on a snapshot, evidence
records or claims. The company endpoint returns the Assessment Card — the evaluator-visible summary the dossier
header shows — not the evidence behind it; evidence and claims remain subject to the founder's consent tier in the
workspace and the Evaluator API dossier.

Every read writes one **`institutional.read`** row to the hash-chained audit log (actor `api`, resource type +
id, the key's sha256 handle — never the key) and one `institutional_api_read` analytics event (resource + key id,
no PII). The organisation owner can export these rows from Settings → Audit log.

## Benchmarks: the n-rules

`/benchmarks` and the `benchmark` block on `/companies/{projectId}` follow `docs/product/score-governance.md`
§ 7. Segments are recomputed nightly (`/api/cron/benchmark-segments`, 03:25 UTC) from **one latest score per
company** — never one per analysis — and published only where **n ≥ 10**: 10–29 `indicative`, 30–99
`benchmark`, 100+ `segmented`. A stage × sector segment under the floor is not in the list; the company endpoint
then falls back to the stage segment and says so (`fellBackToStage: true`, `segment: "Stage 4"`). `n` and the
band are on every row. An empty `data` means nothing at that filter has reached the floor yet — it is not an
error.

## Versioning

- The path carries the major version (`/api/v1/`). Fields are **added**, never renamed or removed, inside v1;
  a breaking change ships as `/api/v2/…` alongside v1 with a deprecation note on `/developers/api` and in
  `docs/API-REFERENCE.md`.
- The methodology version (`svi_version`, e.g. `2.2.0`) is independent of the API version and is on every
  company response (`methodology_version`) and on `/methodology`. A methodology change is announced on
  `/methodology/governance`; scores are versioned, not rewritten.
- Rate limits and the PII whitelist may tighten without a version bump; they never loosen silently.

## Quick start

```sh
curl "https://blockid.au/api/v1/institutional/cohorts" \
  -H "Authorization: Bearer bk_live_example1234567890abcdef1234567890abcdef"
```

```ts
const res = await fetch("https://blockid.au/api/v1/institutional/benchmarks?stage=4", {
  headers: { Authorization: "Bearer bk_live_example1234567890abcdef1234567890abcdef" },
});
const { ok, data, error, message } = await res.json();
if (!ok) throw new Error(`${error}: ${message}`);
for (const s of data) console.log(s.segment_key, s.median, `n = ${s.n}`, s.band);
```

## Related

- Institutional admin (organisation owners): Settings → Audit log (organisation CSV export,
  `GET /api/org/audit-export.csv?from=&to=`) and Settings → Retention (`org_settings.retention_days`,
  `docs/ops/retention.md`).
- Evaluator API v1 (read/write): `docs/API-REFERENCE.md` § 9.
- Score governance and the benchmark rules: `docs/product/score-governance.md` § 7.
