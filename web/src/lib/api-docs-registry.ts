import "server-only";

// API documentation registry (T_DEVREL_APIDOCS_0001; G14-S38 adds the
// authenticated Evaluator API v1 entries).
//
// One source of truth for both the human-readable /developers/api pages and
// the machine-readable /api/openapi.json spec. Most entries document a
// PUBLIC endpoint — no session or bearer auth required (`src/app/api/index/svi`,
// `src/app/api/pricing-test/*`, `src/app/api/idea-questions`). The
// `/api/v1/evaluations*` entries (G14-S38) are the exception: they require
// `Authorization: Bearer bk_live_…` plus a scope (`ApiEndpointDoc.auth`) and
// stay in lock-step with `src/app/api/v1/evaluations/**` + `lib/api-v1/auth.ts`
// + `lib/api-scopes.ts` — see docs/API-REFERENCE.md §9 for the prose version.
//
// PII / secret guard: no example may contain a real session id, bearer
// token, or user email. Fake placeholders only (e.g. "sess-example-1234",
// "bk_live_example00000000000000000000000000000000000000").

export type ApiParamIn = "query" | "path" | "body";

export interface ApiParamDoc {
  name: string;
  in: ApiParamIn;
  type: string;
  required: boolean;
  description: string;
  example?: string;
}

export interface ApiErrorCodeDoc {
  code: number;
  when: string;
}

export interface ApiChangelogEntry {
  date: string;
  note: string;
}

export interface ApiRateLimitDoc {
  perMinute: number;
  bucket: string;
}

/** G14-S38: bearer-key auth for the Evaluator API v1 endpoints. Absent = public, no-auth (every pre-S38 entry). */
export interface ApiAuthDoc {
  scheme: "bearer";
  header: string;
  scope: string;
  planGate: string;
  note: string;
}

export interface ApiEndpointDoc {
  slug: string;
  method: "GET" | "POST";
  path: string;
  title: string;
  summary: string;
  description: string;
  params: ApiParamDoc[];
  requestBodyExample?: string;
  responseExample: string;
  curlSnippet: string;
  jsSnippet: string;
  rateLimit: ApiRateLimitDoc;
  errorCodes: ApiErrorCodeDoc[];
  changelog: ApiChangelogEntry[];
  /** G14-S38: set only on the authenticated Evaluator API v1 entries. */
  auth?: ApiAuthDoc;
}

const BASE_URL = "https://blockid.au";

const SVI_INDEX: ApiEndpointDoc = {
  slug: "svi-index",
  method: "GET",
  path: "/api/index/svi",
  title: "SVI Index — Anonymised Aggregates",
  summary:
    "Public anonymised aggregates from the Startup Value Index. Returns overall percentiles, per-sector or per-stage rollups.",
  description:
    "Serves the same numbers that power the /dataset page. Data is aggregated from svi_index_snapshots with a k-anonymity threshold of 5 — no company names, emails, user ids, raw inputs, or analysis JSON ever leave the aggregate helpers. Cache: public, max-age=300, stale-while-revalidate=600.",
  params: [
    {
      name: "bucket",
      in: "query",
      type: "string",
      required: false,
      description: "Aggregation bucket. One of `overall`, `sector`, `stage`. Defaults to `overall`.",
      example: "sector",
    },
    {
      name: "format",
      in: "query",
      type: "string",
      required: false,
      description: "Response format. `json` (default) or `csv` (downloadable attachment).",
      example: "json",
    },
  ],
  responseExample: `{
  "bucket": "overall",
  "data": {
    "count": 214,
    "medianSvi": 68,
    "mean": 66.4,
    "p10": 41,
    "p25": 54,
    "p50": 68,
    "p75": 79,
    "p90": 88,
    "updatedAt": "2026-07-20T00:15:00.000Z"
  },
  "disclaimer": "General information only. Aggregated from anonymised SVI snapshots. Not investment, financial, or legal advice.",
  "source": "svi_index_snapshots (anonymised)"
}`,
  curlSnippet: `curl "${BASE_URL}/api/index/svi?bucket=sector&format=json"`,
  jsSnippet: `const res = await fetch(
  "${BASE_URL}/api/index/svi?bucket=sector&format=json",
);
const { bucket, data, disclaimer } = await res.json();
console.log(bucket, data.length, disclaimer);`,
  rateLimit: {
    perMinute: 60,
    bucket: "public-read",
  },
  errorCodes: [
    { code: 400, when: "`bucket` or `format` is not in the allowed enum." },
    { code: 500, when: "Aggregate read from the anonymised snapshot table failed." },
  ],
  changelog: [
    { date: "2026-07-14", note: "Initial public release with overall/sector/stage buckets and CSV export." },
    { date: "2026-07-20", note: "Documented under /developers/api and published in openapi.json." },
  ],
};

const PRICING_TEST_ASSIGN: ApiEndpointDoc = {
  slug: "pricing-test-assign",
  method: "GET",
  path: "/api/pricing-test/assign",
  title: "Pricing Experiment — Assign Variant",
  summary:
    "Deterministic per-bucket variant assignment for a running pricing / segment A/B experiment.",
  description:
    "Any SSR page or client bundle can call this to decide which variant to render without importing the admin experiments lib. Returns 404 if the experiment doesn't exist or is not in the `running` state — a paused or concluded experiment must not silently keep serving variants. Assignment is stable: the same `bucket` value always maps to the same variant while the experiment definition is unchanged.",
  params: [
    {
      name: "experiment",
      in: "query",
      type: "string",
      required: true,
      description: "The experiment `name` (not id). Case sensitive.",
      example: "hero_price_2026_q3",
    },
    {
      name: "bucket",
      in: "query",
      type: "string",
      required: true,
      description: "Stable per-visitor key — typically the session id, or the user id for logged-in visitors.",
      example: "sess-example-1234",
    },
  ],
  responseExample: `{
  "ok": true,
  "experimentId": "8c1e0b3a-4d7c-4e88-9c33-2a1f0f0a11aa",
  "variantKey": "b",
  "payload": {
    "headline": "From $19/mo",
    "ctaLabel": "Start free"
  }
}`,
  curlSnippet: `curl "${BASE_URL}/api/pricing-test/assign?experiment=hero_price_2026_q3&bucket=sess-example-1234"`,
  jsSnippet: `const params = new URLSearchParams({
  experiment: "hero_price_2026_q3",
  bucket: "sess-example-1234",
});
const res = await fetch(\`${BASE_URL}/api/pricing-test/assign?\${params}\`);
if (res.ok) {
  const { variantKey, payload } = await res.json();
  console.log(variantKey, payload);
}`,
  rateLimit: {
    perMinute: 120,
    bucket: "public-read",
  },
  errorCodes: [
    { code: 400, when: "`experiment` or `bucket` query param missing / empty." },
    { code: 404, when: "Experiment not found, or exists but is not in the `running` state." },
  ],
  changelog: [
    { date: "2026-07-10", note: "Public release alongside the pricing experiments admin surface." },
    { date: "2026-07-20", note: "Documented under /developers/api." },
  ],
};

const PRICING_TEST_EVENT: ApiEndpointDoc = {
  slug: "pricing-test-event",
  method: "POST",
  path: "/api/pricing-test/event",
  title: "Pricing Experiment — Record Event",
  summary:
    "Record an impression or conversion for a running pricing experiment. Best-effort — always returns 202.",
  description:
    "Write endpoint for the pricing A/B harness. Insert is fired and forgotten so a slow database never blocks a conversion click. Even an unknown experiment name returns 202 — the caller can trust that this path never rejects a live click; operators inspect the admin surface to confirm rows landed.",
  params: [
    {
      name: "experiment",
      in: "body",
      type: "string",
      required: true,
      description: "The experiment `name` the event belongs to.",
      example: "hero_price_2026_q3",
    },
    {
      name: "variantKey",
      in: "body",
      type: "string",
      required: true,
      description: "Variant key returned from `/api/pricing-test/assign`.",
      example: "b",
    },
    {
      name: "type",
      in: "body",
      type: "string",
      required: true,
      description: "Event type. One of `impression`, `conversion`.",
      example: "conversion",
    },
    {
      name: "sessionId",
      in: "body",
      type: "string",
      required: true,
      description: "Same bucket value used at assignment time — dedupes per session.",
      example: "sess-example-1234",
    },
    {
      name: "userId",
      in: "body",
      type: "string",
      required: false,
      description: "Optional logged-in user id, associates the event with the account.",
      example: "user-example-abcd",
    },
    {
      name: "valueAud",
      in: "body",
      type: "number",
      required: false,
      description: "Optional monetary value in AUD attributed to the conversion.",
      example: "499",
    },
  ],
  requestBodyExample: `{
  "experiment": "hero_price_2026_q3",
  "variantKey": "b",
  "type": "conversion",
  "sessionId": "sess-example-1234",
  "userId": "user-example-abcd",
  "valueAud": 499
}`,
  responseExample: `{
  "ok": true,
  "recorded": true
}`,
  curlSnippet: `curl -X POST "${BASE_URL}/api/pricing-test/event" \\
  -H "Content-Type: application/json" \\
  -d '{
    "experiment": "hero_price_2026_q3",
    "variantKey": "b",
    "type": "conversion",
    "sessionId": "sess-example-1234",
    "valueAud": 499
  }'`,
  jsSnippet: `await fetch("${BASE_URL}/api/pricing-test/event", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    experiment: "hero_price_2026_q3",
    variantKey: "b",
    type: "impression",
    sessionId: "sess-example-1234",
  }),
});`,
  rateLimit: {
    perMinute: 240,
    bucket: "public-write",
  },
  errorCodes: [
    { code: 400, when: "Invalid JSON, or any of `experiment`, `variantKey`, `type`, `sessionId` missing or the wrong shape." },
    { code: 202, when: "Accepted. `recorded: false` when the experiment name was unknown." },
  ],
  changelog: [
    { date: "2026-07-10", note: "Public release alongside the assign endpoint." },
    { date: "2026-07-20", note: "Documented under /developers/api." },
  ],
};

const IDEA_QUESTIONS: ApiEndpointDoc = {
  slug: "idea-questions",
  method: "POST",
  path: "/api/idea-questions",
  title: "First-Principles Socratic Questions",
  summary:
    "Two-step first-principles engine. Call once with just an idea for tailored questions, then again with the answers to receive a recommendation.",
  description:
    "Step 1: POST with `ideaText` only — returns 5–7 Socratic questions whose triggers are absent from the idea, so the founder is never asked to restate what they already said. Step 2: POST with `ideaText` plus an `answers` object mapping question id → free-text answer — returns a `Recommendation` naming the best-fit BlockID feature to try next and up to three alternates. Idea text is trimmed to 4000 chars, each answer to 1000 chars, and no more than 10 answer keys are read.",
  params: [
    {
      name: "ideaText",
      in: "body",
      type: "string",
      required: true,
      description: "Free-text description of the startup idea. Trimmed to 4000 characters.",
      example: "A marketplace connecting Australian tradies with commercial builders.",
    },
    {
      name: "answers",
      in: "body",
      type: "object",
      required: false,
      description: "Optional object of `{ questionId: answer }`. Omit for step 1 (get questions). Provide for step 2 (get recommendation).",
      example: "{ \"customer\": \"Site managers at mid-tier builders in NSW.\" }",
    },
  ],
  requestBodyExample: `{
  "ideaText": "A marketplace connecting Australian tradies with commercial builders.",
  "answers": {
    "customer": "Site managers at mid-tier builders in NSW.",
    "status_quo": "They use SMS and gumtree today.",
    "unfair_advantage": "I ran ops at Hutchies for 6 years."
  }
}`,
  responseExample: `{
  "ok": true,
  "recommendation": {
    "primaryFeature": "Startup Value Index",
    "primaryFeatureHref": "/tools/svi",
    "rationale": "Get a quick AUD range for your marketplace idea before deciding on the next step.",
    "secondaryFeatures": [
      { "label": "Cap Table Builder", "href": "/tools/cap-table" },
      { "label": "Investor-Ready Score", "href": "/tools/investor-ready" }
    ]
  }
}`,
  curlSnippet: `curl -X POST "${BASE_URL}/api/idea-questions" \\
  -H "Content-Type: application/json" \\
  -d '{
    "ideaText": "A marketplace connecting Australian tradies with commercial builders."
  }'`,
  jsSnippet: `// Step 1 — get tailored questions
const q = await fetch("${BASE_URL}/api/idea-questions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    ideaText: "A marketplace connecting Australian tradies with commercial builders.",
  }),
}).then((r) => r.json());
console.log(q.questions);

// Step 2 — submit answers, get a recommendation
const r = await fetch("${BASE_URL}/api/idea-questions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    ideaText: "A marketplace connecting Australian tradies with commercial builders.",
    answers: { customer: "Site managers at mid-tier builders in NSW." },
  }),
}).then((r) => r.json());
console.log(r.recommendation.primaryFeature);`,
  rateLimit: {
    perMinute: 30,
    bucket: "public-write",
  },
  errorCodes: [
    { code: 400, when: "Invalid JSON body, missing `ideaText`, or `answers` is not an object of string → string." },
  ],
  changelog: [
    { date: "2026-07-12", note: "Public release of the first-principles engine." },
    { date: "2026-07-20", note: "Documented under /developers/api." },
  ],
};

// ── Evaluator API v1 (G14-S38) — Bearer bk_live_… + scope, api.access plan
// gate (Fund / Program only). See docs/API-REFERENCE.md §9 and
// src/app/api/v1/evaluations/**.

const V1_AUTH_READ: ApiAuthDoc = {
  scheme: "bearer",
  header: "Authorization: Bearer bk_live_…",
  scope: "evaluations:read",
  planGate: "api.access (Fund and Program plans)",
  note: "Create a key under Workspace → Settings → Enterprise → API keys, with the `evaluations:read` scope (evaluator accounts only).",
};

const V1_AUTH_WRITE: ApiAuthDoc = {
  ...V1_AUTH_READ,
  scope: "evaluations:write",
  note: "Create a key under Workspace → Settings → Enterprise → API keys, with the `evaluations:write` scope (evaluator accounts only; it also carries `evaluations:read`).",
};

const V1_AUTH_ERRORS: ApiErrorCodeDoc[] = [
  { code: 401, when: "Missing, malformed or unknown/revoked `Authorization: Bearer bk_live_…` key." },
  { code: 402, when: "`plan_required` — the key owner's plan no longer carries `api.access` (Fund / Program only; re-checked on every call, not just at key creation)." },
  { code: 403, when: "`insufficient_scope` — the key lacks the scope this endpoint needs." },
  { code: 429, when: "`rate_limited` — the key's per-minute budget (default 60/min) is spent. `Retry-After` header carries the wait." },
];

// PII / secret guard (api-docs-registry.test.ts): the ONLY bearer token
// string any example may ever contain. Exported so the test asserts every
// "Bearer <token>" match equals exactly this literal, never a real key.
export const FAKE_BEARER = "bk_live_example1234567890abcdef1234567890abcdef";

const V1_EVALUATIONS_LIST: ApiEndpointDoc = {
  slug: "v1-evaluations-list",
  method: "GET",
  path: "/api/v1/evaluations",
  title: "Evaluator API v1 — List Your Evaluations",
  summary: "The key owner's \"Startups I'm evaluating\" list — same rows as the workspace table, keyset-paginated.",
  description:
    "Requires scope `evaluations:read`. Rows are the caller's own evaluations only — ids, the project card, consent state, latest SVI and the fit score of the key owner's PRIMARY mandate (`meta.fit_source: \"no_mandate\"` when they have none, so `min_fit` filtering degrades visibly instead of silently returning nothing). Pagination is a keyset cursor over (created_at desc, id desc) — pass `next_cursor` back as `cursor` for the following page; `has_more` says whether one exists. Internals never leave: invite tokens, the founder's email/user id, the evaluator's private notes.",
  params: [
    { name: "limit", in: "query", type: "number", required: false, description: "Page size, 1–100. Defaults to 25.", example: "25" },
    { name: "cursor", in: "query", type: "string", required: false, description: "Opaque keyset cursor from a previous page's `next_cursor`." },
    { name: "industry", in: "query", type: "string", required: false, description: "Case-insensitive equals on the project's industry.", example: "saas" },
    { name: "stage", in: "query", type: "number", required: false, description: "Project stage (0–12, canonical SCN stage index).", example: "5" },
    { name: "min_fit", in: "query", type: "number", required: false, description: "0–100 — minimum fit score against the key owner's primary investment mandate.", example: "60" },
  ],
  responseExample: `{
  "ok": true,
  "data": [
    {
      "id": "e1a2b3c4-0000-4000-8000-000000000001",
      "project": { "id": "p1", "slug": "acme", "name": "Acme Pty Ltd", "industry": "saas", "stage": 5, "description": "…", "website": "https://acme.example.com", "state": "NSW" },
      "owner_kind": "founder_claimed",
      "consent_tier": "full",
      "founder_claimed": true,
      "label": null,
      "svi": { "total": 68, "at": "2026-09-16T00:00:00.000Z" },
      "fit": { "score": 74, "computed_at": "2026-09-15T00:00:00.000Z" },
      "links": { "dossier": "/api/v1/evaluations/e1a2b3c4-0000-4000-8000-000000000001/dossier", "assessment": "/api/v1/evaluations/e1a2b3c4-0000-4000-8000-000000000001/assessment", "workspace": "/workspace/investor/dossier/e1a2b3c4-0000-4000-8000-000000000001" },
      "created_at": "2026-09-10T00:00:00.000Z",
      "updated_at": "2026-09-16T00:00:00.000Z"
    }
  ],
  "next_cursor": null,
  "has_more": false,
  "meta": { "fit_source": "primary_mandate", "mandate_id": "m1" }
}`,
  curlSnippet: `curl "${BASE_URL}/api/v1/evaluations?limit=25&min_fit=60" \\
  -H "Authorization: Bearer ${FAKE_BEARER}"`,
  jsSnippet: `const res = await fetch(
  "${BASE_URL}/api/v1/evaluations?limit=25&min_fit=60",
  { headers: { Authorization: "Bearer ${FAKE_BEARER}" } },
);
const { data, next_cursor, has_more } = await res.json();
console.log(data.length, has_more);`,
  rateLimit: { perMinute: 60, bucket: "v1-api-key" },
  errorCodes: [...V1_AUTH_ERRORS, { code: 400, when: "`invalid_query` — `limit`/`stage`/`min_fit` out of range or `cursor` malformed." }],
  changelog: [{ date: "2026-09-17", note: "v1 evaluations (read/write assessment, dossier) — initial release." }],
  auth: V1_AUTH_READ,
};

const V1_EVALUATIONS_DOSSIER: ApiEndpointDoc = {
  slug: "v1-evaluations-dossier",
  method: "GET",
  path: "/api/v1/evaluations/{id}/dossier",
  title: "Evaluator API v1 — Investor Dossier",
  summary: "The Investor Dossier (ReportV2 + blocks) for one evaluation — the same loader the workspace dossier page uses.",
  description:
    "Requires scope `evaluations:read`. Consent masking is identical to the workspace UI: the evidence block is projected by `evaluations.consent_tier`, the assessment block by the viewer's role. Counted as a dossier view in the audit trail (surface `\"api\"`), so the founder's \"Δ since last view\" reflects API reads too. 404 (never 403) for an unknown id or a row the key owner does not evaluate — the id must not confirm a row exists.",
  params: [{ name: "id", in: "path", type: "string", required: true, description: "The evaluation id (from the list endpoint's `id` / `links.dossier`).", example: "e1a2b3c4-0000-4000-8000-000000000001" }],
  responseExample: `{
  "ok": true,
  "dossier": {
    "id": "e1a2b3c4-0000-4000-8000-000000000001",
    "viewer": { "role": "assessor" },
    "cover": { "startup_name": "Acme Pty Ltd", "svi_total": 68 },
    "evidence": { "…": "projected by consent_tier" },
    "assessment": { "…": "projected by viewer role" }
  }
}`,
  curlSnippet: `curl "${BASE_URL}/api/v1/evaluations/{id}/dossier" \\
  -H "Authorization: Bearer ${FAKE_BEARER}"
# replace {id} with an id from GET /api/v1/evaluations`,
  jsSnippet: `// replace {id} with an id from GET /api/v1/evaluations
const res = await fetch(
  "${BASE_URL}/api/v1/evaluations/{id}/dossier",
  { headers: { Authorization: "Bearer ${FAKE_BEARER}" } },
);
const { dossier } = await res.json();
console.log(dossier.cover.svi_total);`,
  rateLimit: { perMinute: 60, bucket: "v1-api-key" },
  errorCodes: [...V1_AUTH_ERRORS, { code: 404, when: "Unknown id, or the key owner is not the evaluator on that row (never 403 — the id must not confirm a row exists)." }],
  changelog: [{ date: "2026-09-17", note: "v1 evaluations (read/write assessment, dossier) — initial release." }],
  auth: V1_AUTH_READ,
};

const V1_EVALUATIONS_ASSESSMENT_READ: ApiEndpointDoc = {
  slug: "v1-evaluations-assessment-read",
  method: "GET",
  path: "/api/v1/evaluations/{id}/assessment",
  title: "Evaluator API v1 — Read Your Assessment",
  summary: "The key owner's own current Evaluator Assessment on one evaluation, plus its version history.",
  description:
    "Requires scope `evaluations:read`. Returns the same masked-by-role read the workspace assessment form does — the key owner IS the assessor, so the full assessor projection applies. `available: false` when nothing has been submitted yet.",
  params: [{ name: "id", in: "path", type: "string", required: true, description: "The evaluation id.", example: "e1a2b3c4-0000-4000-8000-000000000001" }],
  responseExample: `{
  "ok": true,
  "available": true,
  "assessment": { "decision": "proceed", "conviction": 4, "version": 2, "status": "submitted" },
  "history": [{ "version": 1, "submitted_at": "2026-09-10T00:00:00.000Z" }]
}`,
  curlSnippet: `curl "${BASE_URL}/api/v1/evaluations/{id}/assessment" \\
  -H "Authorization: Bearer ${FAKE_BEARER}"
# replace {id} with an id from GET /api/v1/evaluations`,
  jsSnippet: `// replace {id} with an id from GET /api/v1/evaluations
const res = await fetch(
  "${BASE_URL}/api/v1/evaluations/{id}/assessment",
  { headers: { Authorization: "Bearer ${FAKE_BEARER}" } },
);
const { available, assessment } = await res.json();`,
  rateLimit: { perMinute: 60, bucket: "v1-api-key" },
  errorCodes: [...V1_AUTH_ERRORS, { code: 404, when: "Unknown id, the key owner is not the evaluator on that row, or a lapsed evaluator persona." }],
  changelog: [{ date: "2026-09-17", note: "v1 evaluations (read/write assessment, dossier) — initial release." }],
  auth: V1_AUTH_READ,
};

const V1_EVALUATIONS_ASSESSMENT_WRITE: ApiEndpointDoc = {
  slug: "v1-evaluations-assessment-write",
  method: "POST",
  path: "/api/v1/evaluations/{id}/assessment",
  title: "Evaluator API v1 — Submit or Update Your Assessment",
  summary: "Create or update the key owner's Evaluator Assessment on one evaluation (same as PUT — both delegate to the workspace write path).",
  description:
    "Requires scope `evaluations:write` (implies `evaluations:read`). Every field of the body is optional EXCEPT to submit: send `status: \"submitted\"` with `decision` and `conviction` set, or the write is refused (422). Delegates to the same `upsertAssessment` the workspace form uses, so Zod validation, draft-in-place / v(n+1) versioning, audit rows and the `assessment.submitted` webhook all fire identically — the API cannot bypass any of it. `PUT` on this path behaves identically to `POST`.",
  params: [
    { name: "id", in: "path", type: "string", required: true, description: "The evaluation id.", example: "e1a2b3c4-0000-4000-8000-000000000001" },
    { name: "decision", in: "body", type: "string", required: false, description: "`pass` | `track` | `proceed`. Required (with `conviction`) to submit.", example: "proceed" },
    { name: "conviction", in: "body", type: "number", required: false, description: "1–5. Required to submit.", example: "4" },
    { name: "status", in: "body", type: "string", required: false, description: "Send `\"submitted\"` to submit; omit to save a draft-in-place.", example: "submitted" },
    { name: "notes", in: "body", type: "string", required: false, description: "Free-text evaluator notes (private — never shown to the founder)." },
  ],
  requestBodyExample: `{
  "decision": "proceed",
  "conviction": 4,
  "status": "submitted",
  "notes": "Strong technical team, needs a commercial co-founder."
}`,
  responseExample: `{
  "ok": true,
  "assessment": { "decision": "proceed", "conviction": 4, "version": 3, "status": "submitted" },
  "created": false,
  "version": 3,
  "history": [{ "version": 2, "submitted_at": "2026-09-10T00:00:00.000Z" }]
}`,
  curlSnippet: `curl -X POST "${BASE_URL}/api/v1/evaluations/{id}/assessment" \\
  -H "Authorization: Bearer ${FAKE_BEARER}" \\
  -H "Content-Type: application/json" \\
  -d '{ "decision": "proceed", "conviction": 4, "status": "submitted" }'
# replace {id} with an id from GET /api/v1/evaluations`,
  jsSnippet: `// replace {id} with an id from GET /api/v1/evaluations
await fetch(
  "${BASE_URL}/api/v1/evaluations/{id}/assessment",
  {
    method: "POST",
    headers: { Authorization: "Bearer ${FAKE_BEARER}", "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "proceed", conviction: 4, status: "submitted" }),
  },
);`,
  rateLimit: { perMinute: 60, bucket: "v1-api-key" },
  errorCodes: [
    ...V1_AUTH_ERRORS,
    { code: 404, when: "Unknown id, the key owner is not the evaluator on that row, or a lapsed evaluator persona." },
    { code: 400, when: "`invalid_body` — Zod validation failed; `issues[]` carries each field path." },
    { code: 413, when: "Body larger than 64 kB." },
    { code: 422, when: "`missing_decision` / `missing_conviction` — `status: \"submitted\"` without both set." },
    { code: 503, when: "Migration 0392 (assessments) is not applied yet." },
  ],
  changelog: [{ date: "2026-09-17", note: "v1 evaluations (read/write assessment, dossier) — initial release." }],
  auth: V1_AUTH_WRITE,
};

export const API_ENDPOINTS: ApiEndpointDoc[] = [
  SVI_INDEX,
  PRICING_TEST_ASSIGN,
  PRICING_TEST_EVENT,
  IDEA_QUESTIONS,
  V1_EVALUATIONS_LIST,
  V1_EVALUATIONS_DOSSIER,
  V1_EVALUATIONS_ASSESSMENT_READ,
  V1_EVALUATIONS_ASSESSMENT_WRITE,
];

export function getEndpointBySlug(slug: string): ApiEndpointDoc | null {
  return API_ENDPOINTS.find((e) => e.slug === slug) ?? null;
}
