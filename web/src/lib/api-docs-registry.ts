import "server-only";

// API documentation registry (T_DEVREL_APIDOCS_0001; G14-S38 adds the
// authenticated Evaluator API v1 entries).
//
// One source of truth for both the human-readable /developers/api pages and
// the machine-readable /api/openapi.json spec. Five entries document a
// PUBLIC endpoint — no session or bearer auth required (`src/app/api/index/svi`,
// `src/app/api/pricing-test/*`, `src/app/api/idea-questions`,
// `src/app/api/v1/id/[slug]`). The `/api/v1/evaluations*` entries (G14-S38)
// and `/api/v1/analyze` require `Authorization: Bearer bk_live_…` plus a scope
// (`ApiEndpointDoc.auth`) and stay in lock-step with `src/app/api/v1/**` +
// `lib/api-v1/auth.ts` + `lib/api-auth.ts` + `lib/api-scopes.ts` — see
// docs/API-REFERENCE.md §9–§10 for the prose version.
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

/** Bearer-key auth (Evaluator API v1 G14-S38, and the partner `analyze` endpoint). Absent = public, no-auth. */
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
    "headline": "From A$29/mo",
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
// gate (Fund, Program and Index API plans per plans.csv). See docs/API-REFERENCE.md §9 and
// src/app/api/v1/evaluations/**.

const V1_AUTH_READ: ApiAuthDoc = {
  scheme: "bearer",
  header: "Authorization: Bearer bk_live_…",
  scope: "evaluations:read",
  planGate: "api.access (Fund, Program and Index API plans)",
  note: "Create a key under Workspace → Settings → Enterprise → API keys, with the `evaluations:read` scope (evaluator accounts only).",
};

const V1_AUTH_WRITE: ApiAuthDoc = {
  ...V1_AUTH_READ,
  scope: "evaluations:write",
  note: "Create a key under Workspace → Settings → Enterprise → API keys, with the `evaluations:write` scope (evaluator accounts only; it also carries `evaluations:read`).",
};

const V1_AUTH_ERRORS: ApiErrorCodeDoc[] = [
  { code: 401, when: "Missing, malformed or unknown/revoked `Authorization: Bearer bk_live_…` key." },
  { code: 402, when: "`plan_required` — the key owner's plan no longer carries `api.access` (Fund, Program and Index API plans; re-checked on every call, not just at key creation)." },
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

// ── Partner API (pre-S38, documented G18-B 2026-09-19) ────────────────────
// `POST /api/v1/analyze` is the original bk_live_ endpoint (scope `analyze`,
// the default on every key; credit-metered, no plan gate — see
// src/app/api/v1/analyze/route.ts + lib/api-auth.ts). `GET /api/v1/id/{slug}`
// is the anonymous-allowed public verified-profile JSON (optional partner
// bearer lifts the rate limit; see src/app/api/v1/id/[slug]/route.ts).

const V1_AUTH_ANALYZE: ApiAuthDoc = {
  scheme: "bearer",
  header: "Authorization: Bearer bk_live_…",
  scope: "analyze",
  planGate: "none — any plan; every call spends one `svi_analysis` credit (402 `insufficient_credits` when the balance is empty)",
  note: "Create a key under Workspace → Settings → Enterprise → API keys. `analyze` is the default scope on every key; the per-key budget defaults to 60 calls / minute.",
};

const V1_ANALYZE: ApiEndpointDoc = {
  slug: "v1-analyze",
  method: "POST",
  path: "/api/v1/analyze",
  title: "Analyze — SVI score from a startup description",
  summary:
    "Score a startup description on the 8-dimension Startup Value Index and get the stage, the per-dimension scores and the top evidence gaps.",
  description:
    "The partner entry point to the SVI engine. Send a plain-text description (optionally with `startupName`, `websiteUrl`, `industry`, `stage` — they are appended to the text as extra signal) and receive the same deterministic `computeSVI` result the workspace uses: total score, detected stage, the 8 dimension scores and the three highest-impact evidence gaps, plus a `meta` block (engine version, confidence %, summary, risk-flag count, top 5 gaps with a suggested action). Each successful call spends one `svi_analysis` credit from the key owner's balance and returns the remaining balance as `creditsRemaining`. Legacy field names `name` / `rawText` / `text` / `website` are still accepted.",
  params: [
    { name: "description", in: "body", type: "string", required: true, description: "Free-text description of the startup (problem, product, market, team, traction). Also accepted as `rawText` or `text`.", example: "Marketplace connecting Australian tradies with commercial builders; 40 paying builders in NSW, A$18k MRR." },
    { name: "startupName", in: "body", type: "string", required: false, description: "Company name (also `name`).", example: "Example Trades Pty Ltd" },
    { name: "websiteUrl", in: "body", type: "string", required: false, description: "Public website (also `website`). Appended as signal; not crawled by this endpoint.", example: "https://example.com" },
    { name: "industry", in: "body", type: "string", required: false, description: "Free-text industry hint.", example: "marketplace" },
    { name: "stage", in: "body", type: "string", required: false, description: "Free-text stage hint (idea, mvp, revenue, growth, scale).", example: "revenue" },
  ],
  requestBodyExample: `{
  "startupName": "Example Trades Pty Ltd",
  "description": "Marketplace connecting Australian tradies with commercial builders; 40 paying builders in NSW, A$18k MRR, two full-time founders.",
  "websiteUrl": "https://example.com",
  "industry": "marketplace",
  "stage": "revenue"
}`,
  responseExample: `{
  "ok": true,
  "sviScore": 58,
  "stage": "revenue",
  "stageLabel": "Early revenue",
  "dimensions": [
    { "key": "ftv", "label": "Founder-Team Viability", "score": 61 },
    { "key": "mpc", "label": "Market & Problem Clarity", "score": 66 },
    { "key": "tre", "label": "Traction & Revenue Evidence", "score": 54 }
  ],
  "topGaps": [
    { "label": "No connected revenue source", "impact": 8 },
    { "label": "Team size and roles not evidenced", "impact": 6 },
    { "label": "No customer references", "impact": 5 }
  ],
  "creditsRemaining": 24,
  "meta": {
    "version": "svi-2026-09",
    "confidence": 62,
    "summary": "Early-revenue marketplace with founder-declared traction; connect Stripe or upload invoices to lift TRE.",
    "riskFlags": 1,
    "allGaps": [{ "priority": "high", "label": "No connected revenue source", "action": "Connect Stripe or upload the last 3 months of invoices.", "impact": 8 }]
  }
}`,
  curlSnippet: `curl -X POST "${BASE_URL}/api/v1/analyze" \\
  -H "Authorization: Bearer ${FAKE_BEARER}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "startupName": "Example Trades Pty Ltd",
    "description": "Marketplace connecting Australian tradies with commercial builders; 40 paying builders in NSW, A$18k MRR.",
    "stage": "revenue"
  }'`,
  jsSnippet: `const res = await fetch("${BASE_URL}/api/v1/analyze", {
  method: "POST",
  headers: { Authorization: "Bearer ${FAKE_BEARER}", "Content-Type": "application/json" },
  body: JSON.stringify({
    startupName: "Example Trades Pty Ltd",
    description: "Marketplace connecting Australian tradies with commercial builders; 40 paying builders in NSW, A$18k MRR.",
    stage: "revenue",
  }),
});
const { sviScore, stage, dimensions, topGaps, creditsRemaining } = await res.json();
console.log(sviScore, stage, dimensions.length, topGaps[0], creditsRemaining);`,
  rateLimit: { perMinute: 60, bucket: "v1-api-key" },
  errorCodes: [
    { code: 401, when: "`unauthorized` — missing, malformed, unknown, inactive, expired or rate-limited `Authorization: Bearer bk_live_…` key (a spent per-minute budget also answers 401 on this endpoint)." },
    { code: 402, when: "`insufficient_credits` — the key owner's balance cannot cover one `svi_analysis`; `balance` is returned." },
    { code: 400, when: "`invalid_input` — body is not JSON or `description` (/ `rawText` / `text`) is empty." },
    { code: 500, when: "`analysis_failed` — the engine threw; nothing was charged." },
  ],
  changelog: [
    { date: "2026-08-20", note: "Partner API v1 — bk_live_ keys, credit-metered SVI analysis." },
    { date: "2026-09-17", note: "G14-S38: `analyze` became the explicit default scope on every key (migration 0409)." },
    { date: "2026-09-19", note: "Documented under /developers/api and openapi.json (G18-B)." },
  ],
  auth: V1_AUTH_ANALYZE,
};

const V1_ID_PROFILE: ApiEndpointDoc = {
  slug: "v1-id-profile",
  method: "GET",
  path: "/api/v1/id/{slug}",
  title: "Business ID — Public Verified Profile JSON",
  summary:
    "The PII-whitelisted public profile behind /id/{slug}: legal name, verification level, trust score, badges, capability scores and attestations.",
  description:
    "Returns exactly the projection `readPublicProfile()` renders on the public /id/{slug} page — nothing that is not on that page can reach this endpoint (`PublicBusinessProfileSchema`). Anonymous callers are allowed because the profile is already public and indexable; an unindexed or missing slug is a 404, never an empty 200, so the slug space cannot be enumerated. Sending `Authorization: Bearer …` is optional: a valid partner token with the `id:public:read` scope lifts the per-minute ceiling from 200 (per IP) to 2,000; an invalid token is a 401 rather than a silent fall-back. Cache: `public, max-age=300, s-maxage=3600, stale-while-revalidate=60`; CORS `*`. The W3C Verifiable Credential for the same profile is `GET /api/v1/id/{slug}/vc` (see docs/API-REFERENCE.md §10).",
  params: [
    { name: "slug", in: "path", type: "string", required: true, description: "The business's public slug — the same one in the /id/{slug} URL.", example: "example-trades" },
  ],
  responseExample: `{
  "ok": true,
  "data": {
    "slug": "example-trades",
    "legalName": "Example Trades Pty Ltd",
    "verificationLevel": 3,
    "trustScore": 71.5,
    "lastVerifiedAt": "2026-09-01T02:14:00.000Z",
    "badges": ["abn_verified", "connected_source"],
    "capabilityScores": { "ftv": 61, "mpc": 66, "tre": 54 },
    "attestations": [],
    "jurisdiction": "AU-NSW",
    "publicUrl": "https://blockid.au/id/example-trades",
    "rowKind": "live"
  },
  "_meta": { "authenticated": false, "rateLimitRemaining": 199 }
}`,
  curlSnippet: `# replace {slug} with the business's public slug (the /id/{slug} URL)
curl "${BASE_URL}/api/v1/id/{slug}"`,
  jsSnippet: `// replace {slug} with the business's public slug (the /id/{slug} URL)
const res = await fetch("${BASE_URL}/api/v1/id/{slug}");
if (res.status === 404) throw new Error("no public profile for that slug");
const { data } = await res.json();
console.log(data.legalName, data.verificationLevel, data.trustScore);`,
  rateLimit: { perMinute: 200, bucket: "v1-id-public (2,000 with a partner bearer)" },
  errorCodes: [
    { code: 404, when: "`not_found` — no indexed public profile for that slug (identical for missing and unindexed)." },
    { code: 401, when: "An `Authorization` header was sent but the partner token is invalid or lacks `id:public:read`." },
    { code: 429, when: "`rate_limited` — 200 / min per IP anonymous, 2,000 / min with a partner bearer." },
  ],
  changelog: [
    { date: "2026-08-12", note: "Public Verified Business Profile JSON (Master Upgrade Plan §11.1) + Verifiable Credential sibling." },
    { date: "2026-09-19", note: "Documented under /developers/api and openapi.json (G18-B)." },
  ],
};

// ── Institutional API (read-only) — G21 P3-B (2026-09-21) ────────────────
// `/api/v1/institutional/*`: the same bk_live_ key ladder as the Evaluator
// API (scope `evaluations:read`, `api.access` plan gate) PLUS a 600 reads /
// key / hour ceiling; every read writes an `institutional.read` audit row;
// responses never carry founder PII (company name + ids + scores only);
// ETag + `Cache-Control: private, max-age=60`; one error envelope
// `{ ok:false, error, message }`. Prose: docs/api/institutional.md, rendered
// in-app at INSTITUTIONAL_DOCS_PATH (G22-C) — link there, not to GitHub.

/** The in-app contract page (`app/(marketing)/docs/api/institutional`); /developers/api links here. */
export const INSTITUTIONAL_DOCS_PATH = "/docs/api/institutional";

const INSTITUTIONAL_AUTH: ApiAuthDoc = {
  scheme: "bearer",
  header: "Authorization: Bearer bk_live_…",
  scope: "evaluations:read",
  planGate: "api.access (Fund, Program and Index API plans) — re-checked on every call",
  note: `Create a key under Workspace → Settings → Enterprise → API keys with the \`evaluations:read\` scope (evaluator accounts only). Read-only: no institutional endpoint accepts a write. 600 reads per key per hour on top of the per-minute budget. Full contract: ${INSTITUTIONAL_DOCS_PATH}.`,
};

const INSTITUTIONAL_ERRORS: ApiErrorCodeDoc[] = [
  { code: 401, when: "`unauthorized` — missing, malformed, unknown or revoked `Authorization: Bearer bk_live_…` key." },
  { code: 402, when: "`plan_required` — the key owner's plan no longer carries `api.access`." },
  { code: 403, when: "`insufficient_scope` — the key lacks `evaluations:read`." },
  { code: 429, when: "`rate_limited` — the per-minute budget or the 600 / hour institutional ceiling is spent; `Retry-After` + `X-RateLimit-*` (window `hour`) carry the wait." },
];

const INSTITUTIONAL_RATE: ApiRateLimitDoc = { perMinute: 60, bucket: "v1-api-key (+ 600 / hour institutional)" };

const V1_INSTITUTIONAL_COHORTS: ApiEndpointDoc = {
  slug: "v1-institutional-cohorts",
  method: "GET",
  path: "/api/v1/institutional/cohorts",
  title: "Institutional API — List Cohorts",
  summary: "The key owner's readable BlockID Cohorts — the ones they created plus the ones they hold a reviewer / viewer seat on.",
  description:
    "Read-only. Rows are cohort summaries (id, name, program, status, your role, item counts, weights version, links to the items and snapshots endpoints) — never a private note or a reviewer's name. Every call writes one `institutional.read` audit row carrying the key's sha256 handle. `ETag` + `Cache-Control: private, max-age=60`: send `If-None-Match` to get a 304 when nothing changed.",
  params: [{ name: "limit", in: "query", type: "number", required: false, description: "Page size, 1–100. Defaults to 50.", example: "50" }],
  responseExample: `{
  "ok": true,
  "data": [
    {
      "id": "e1a2b3c4-0000-4000-8000-000000000001",
      "name": "Cohort 5",
      "program_name": "Example Accelerator",
      "status": "done",
      "role": "owner",
      "total": 24,
      "done_count": 24,
      "failed_count": 0,
      "weights_version": 2,
      "created_at": "2026-09-10T00:00:00.000Z",
      "finished_at": "2026-09-11T02:10:00.000Z",
      "links": { "items": "/api/v1/institutional/cohorts/e1a2b3c4-0000-4000-8000-000000000001", "snapshots": "/api/v1/institutional/cohorts/e1a2b3c4-0000-4000-8000-000000000001/snapshots" }
    }
  ],
  "meta": { "count": 1, "limit": 50 }
}`,
  curlSnippet: `curl "${BASE_URL}/api/v1/institutional/cohorts?limit=50" \\
  -H "Authorization: Bearer ${FAKE_BEARER}"`,
  jsSnippet: `const res = await fetch("${BASE_URL}/api/v1/institutional/cohorts?limit=50", {
  headers: { Authorization: "Bearer ${FAKE_BEARER}" },
});
const { data } = await res.json();
console.log(data.map((c) => [c.name, c.role, c.done_count]));`,
  rateLimit: INSTITUTIONAL_RATE,
  errorCodes: [...INSTITUTIONAL_ERRORS, { code: 400, when: "`invalid_query` — `limit` out of range; `issues[]` names the parameter." }],
  changelog: [{ date: "2026-09-21", note: "Institutional API v1 (read-only) — initial release (G21 P3-B)." }],
  auth: INSTITUTIONAL_AUTH,
};

const V1_INSTITUTIONAL_COHORT: ApiEndpointDoc = {
  slug: "v1-institutional-cohort",
  method: "GET",
  path: "/api/v1/institutional/cohorts/{id}",
  title: "Institutional API — Cohort Items",
  summary: "One cohort with its items: project id, company, stage, sector, SVI, evidence confidence, BlockID Verified level, gaps count, decision, shortlist.",
  description:
    "Read-only. Each item is the BlockID Cohort row without its internals: no private notes, no reviewer name, no decision log — company name + ids + scores + counts + the recorded decision / review status / shortlist flag, the program's weighted score and the override count (the canonical SVI is never altered by an override). 404 — never 403 — for an unknown id and for a cohort the key owner has no seat on, so the id space cannot be enumerated.",
  params: [{ name: "id", in: "path", type: "string", required: true, description: "Cohort id (an `evaluation_batches` uuid from GET /api/v1/institutional/cohorts).", example: "e1a2b3c4-0000-4000-8000-000000000001" }],
  responseExample: `{
  "ok": true,
  "data": {
    "cohort": { "id": "e1a2b3c4-0000-4000-8000-000000000001", "name": "Cohort 5", "role": "owner", "status": "done", "total": 24, "done_count": 24 },
    "items": [
      {
        "item_id": 101,
        "project_id": "e1a2b3c4-0000-4000-8000-0000000000aa",
        "evaluation_id": "e1a2b3c4-0000-4000-8000-0000000000bb",
        "company": "Example Trades Pty Ltd",
        "stage": 4,
        "stage_label": "Seed",
        "sector": "saas",
        "svi": 63,
        "evidence_confidence": 48,
        "verification": "L2",
        "verification_level": 2,
        "gaps_count": 3,
        "delta": 2,
        "decision": "proceed",
        "review_status": "reviewed",
        "shortlisted": true,
        "weighted_score": 61.5,
        "overrides_count": 1,
        "risk_flags": [],
        "status": "done",
        "scored_at": "2026-09-11T02:10:00.000Z"
      }
    ]
  },
  "meta": { "items": 1 }
}`,
  curlSnippet: `curl "${BASE_URL}/api/v1/institutional/cohorts/{id}" \\
  -H "Authorization: Bearer ${FAKE_BEARER}"
# replace {id} with an id from GET /api/v1/institutional/cohorts`,
  jsSnippet: `// replace {id} with an id from GET /api/v1/institutional/cohorts
const res = await fetch("${BASE_URL}/api/v1/institutional/cohorts/{id}", {
  headers: { Authorization: "Bearer ${FAKE_BEARER}" },
});
const { data } = await res.json();
console.log(data.items.map((i) => [i.company, i.svi, i.evidence_confidence, i.decision]));`,
  rateLimit: INSTITUTIONAL_RATE,
  errorCodes: [...INSTITUTIONAL_ERRORS, { code: 404, when: "`not_found` — unknown id, or the key owner holds no seat on that cohort (identical body)." }, { code: 503, when: "`unavailable` — cohorts are not provisioned on this deployment (migration 0322)." }],
  changelog: [{ date: "2026-09-21", note: "Institutional API v1 (read-only) — initial release (G21 P3-B)." }],
  auth: INSTITUTIONAL_AUTH,
};

const V1_INSTITUTIONAL_SNAPSHOTS: ApiEndpointDoc = {
  slug: "v1-institutional-cohort-snapshots",
  method: "GET",
  path: "/api/v1/institutional/cohorts/{id}/snapshots",
  title: "Institutional API — Cohort Snapshots",
  summary: "The cohort's point-in-time snapshots, newest first — the rows behind the Δ column and the Cohort Report movement chart.",
  description:
    "Read-only. Each snapshot carries `taken_at`, `reason` (batch_complete · manual · rescore), `weights_version`, a summary (n, scored, median SVI / confidence / verification / gaps) and one row per project (svi, evidence confidence, verification level, gaps count, the eight dimension scores, status). `created_by` never leaves. 404 for an unknown id or no seat.",
  params: [
    { name: "id", in: "path", type: "string", required: true, description: "Cohort id.", example: "e1a2b3c4-0000-4000-8000-000000000001" },
    { name: "limit", in: "query", type: "number", required: false, description: "Snapshots returned, 1–100. Defaults to 20.", example: "20" },
  ],
  responseExample: `{
  "ok": true,
  "data": {
    "cohort": { "id": "e1a2b3c4-0000-4000-8000-000000000001", "name": "Cohort 5", "role": "owner" },
    "snapshots": [
      {
        "id": "e1a2b3c4-0000-4000-8000-0000000000cc",
        "taken_at": "2026-09-15T00:00:00.000Z",
        "reason": "rescore",
        "weights_version": 2,
        "summary": { "n": 24, "scored": 24, "median_svi": 61, "median_confidence": 47, "median_verification": 2, "median_gaps": 3, "dims": { "ftv": 66, "mpc": 60, "ptd": 55, "tre": 34, "cgh": 52, "iri": 47, "lco": 63, "svm": 58 } },
        "rows": [{ "project_id": "e1a2b3c4-0000-4000-8000-0000000000aa", "item_id": 101, "svi": 63, "evidence_confidence": 48, "verification_level": 2, "gaps_count": 3, "dims": { "ftv": 70, "tre": 31 }, "status": "done" }]
      }
    ]
  },
  "meta": { "count": 1, "limit": 20 }
}`,
  curlSnippet: `curl "${BASE_URL}/api/v1/institutional/cohorts/{id}/snapshots?limit=20" \\
  -H "Authorization: Bearer ${FAKE_BEARER}"
# replace {id} with an id from GET /api/v1/institutional/cohorts`,
  jsSnippet: `// replace {id} with an id from GET /api/v1/institutional/cohorts
const res = await fetch("${BASE_URL}/api/v1/institutional/cohorts/{id}/snapshots?limit=20", {
  headers: { Authorization: "Bearer ${FAKE_BEARER}" },
});
const { data } = await res.json();
console.log(data.snapshots.map((s) => [s.taken_at, s.summary.median_svi]));`,
  rateLimit: INSTITUTIONAL_RATE,
  errorCodes: [...INSTITUTIONAL_ERRORS, { code: 400, when: "`invalid_query` — `limit` out of range." }, { code: 404, when: "`not_found` — unknown id, or the key owner holds no seat on that cohort." }],
  changelog: [{ date: "2026-09-21", note: "Institutional API v1 (read-only) — initial release (G21 P3-B)." }],
  auth: INSTITUTIONAL_AUTH,
};

const V1_INSTITUTIONAL_COMPANY: ApiEndpointDoc = {
  slug: "v1-institutional-company",
  method: "GET",
  path: "/api/v1/institutional/companies/{projectId}",
  title: "Institutional API — Company Assessment Card",
  summary: "The Assessment Card for one company the key owner evaluates: SVI + band, evidence confidence, BlockID Verified level, top strength / gap and the published benchmark with its n.",
  description:
    "Read-only. Available only when the key owner has an evaluation on the project or a cohort seat whose items include it; otherwise 404 (same body as an unknown id). The benchmark is the nightly stage × sector segment when it is published (n ≥ 10), else the stage segment, else absent — always with `n` and the label (`indicative` 10–29 · `benchmark` 30–99 · `segmented` 100+). Evidence records and claims are not on this endpoint; the card is the evaluator-visible summary the dossier header shows.",
  params: [{ name: "projectId", in: "path", type: "string", required: true, description: "Project id (from a cohort item's `project_id`).", example: "e1a2b3c4-0000-4000-8000-0000000000aa" }],
  responseExample: `{
  "ok": true,
  "data": {
    "project_id": "e1a2b3c4-0000-4000-8000-0000000000aa",
    "company": "Example Trades Pty Ltd",
    "slug": "example-trades",
    "stage_label": "Seed",
    "sector": "SaaS / Software",
    "svi": 63,
    "svi_band": "developing",
    "evidence_confidence": 48,
    "verification": { "level": 2, "short": "L2", "label": "BlockID Verified L2", "tier": "ABN verified" },
    "pending_dims": 1,
    "unverified_material_claims": 2,
    "top_strength": { "dim": "ftv", "title": "Founder & Team Value", "score": 70, "weight": 15 },
    "top_gap": { "dim": "tre", "title": "Traction & Revenue Evidence", "score": 31, "weight": 15 },
    "benchmark": { "median": 58, "n": 41, "label": "benchmark", "segment": "Stage 4 · SaaS / Software", "fellBackToStage": false },
    "methodology_version": "2.2.0",
    "last_updated": "2026-09-15T00:00:00.000Z"
  }
}`,
  curlSnippet: `curl "${BASE_URL}/api/v1/institutional/companies/{projectId}" \\
  -H "Authorization: Bearer ${FAKE_BEARER}"
# replace {projectId} with a cohort item's project_id`,
  jsSnippet: `// replace {projectId} with a cohort item's project_id
const res = await fetch("${BASE_URL}/api/v1/institutional/companies/{projectId}", {
  headers: { Authorization: "Bearer ${FAKE_BEARER}" },
});
if (res.status === 404) throw new Error("not a company this key evaluates");
const { data } = await res.json();
console.log(data.company, data.svi, data.evidence_confidence, data.benchmark?.n);`,
  rateLimit: INSTITUTIONAL_RATE,
  errorCodes: [...INSTITUTIONAL_ERRORS, { code: 404, when: "`not_found` — unknown id, or the key owner does not evaluate that company (identical body)." }],
  changelog: [{ date: "2026-09-21", note: "Institutional API v1 (read-only) — initial release (G21 P3-B)." }],
  auth: INSTITUTIONAL_AUTH,
};

const V1_INSTITUTIONAL_BENCHMARKS: ApiEndpointDoc = {
  slug: "v1-institutional-benchmarks",
  method: "GET",
  path: "/api/v1/institutional/benchmarks",
  title: "Institutional API — Benchmark Segments",
  summary: "The published stage and stage × sector SVI benchmark segments — median, p25, p75, always with n and the publication band.",
  description:
    "Read-only. Segments are recomputed nightly from one latest score per company (never one per analysis) and published only where n ≥ 10 (score governance § 7): 10–29 `indicative`, 30–99 `benchmark`, 100+ `segmented`. A segment under the floor is never in the list. `sector` is normalised (`SaaS / Software` and `saas` are the same segment). An empty `data` means nothing at that filter has reached the floor yet.",
  params: [
    { name: "stage", in: "query", type: "number", required: false, description: "Stage 0–12 (canonical SVI stage index).", example: "4" },
    { name: "sector", in: "query", type: "string", required: false, description: "Sector key or label — `saas`, `fintech`, `SaaS / Software` …", example: "saas" },
  ],
  responseExample: `{
  "ok": true,
  "data": [
    { "segment_key": "stage:4", "stage": 4, "sector": null, "sector_label": null, "n": 41, "median": 58, "p25": 51, "p75": 66, "band": "benchmark", "label": "benchmark (n = 41)", "computed_at": "2026-09-21T03:25:00.000Z" },
    { "segment_key": "stage:4|sector:saas", "stage": 4, "sector": "saas", "sector_label": "SaaS / Software", "n": 12, "median": 61, "p25": 55, "p75": 68, "band": "indicative", "label": "indicative (n = 12)", "computed_at": "2026-09-21T03:25:00.000Z" }
  ],
  "meta": { "count": 2, "stage": 4, "sector": null, "floor": 10, "rule": "published where n >= 10; 10–29 indicative, 30–99 benchmark, 100+ segmented (stage × sector)", "governance": "https://blockid.au/methodology/governance" }
}`,
  curlSnippet: `curl "${BASE_URL}/api/v1/institutional/benchmarks?stage=4&sector=saas" \\
  -H "Authorization: Bearer ${FAKE_BEARER}"`,
  jsSnippet: `const res = await fetch("${BASE_URL}/api/v1/institutional/benchmarks?stage=4", {
  headers: { Authorization: "Bearer ${FAKE_BEARER}" },
});
const { data } = await res.json();
for (const s of data) console.log(s.segment_key, s.median, \`n = \${s.n}\`, s.band);`,
  rateLimit: INSTITUTIONAL_RATE,
  errorCodes: [...INSTITUTIONAL_ERRORS, { code: 400, when: "`invalid_query` — `stage` outside 0–12 or `sector` with characters other than letters, digits, space, `/ & . _ -`." }],
  changelog: [{ date: "2026-09-21", note: "Institutional API v1 (read-only) — initial release (G21 P3-B)." }],
  auth: INSTITUTIONAL_AUTH,
};

const V1_INSTITUTIONAL_METHODOLOGY: ApiEndpointDoc = {
  slug: "v1-institutional-methodology",
  method: "GET",
  path: "/api/v1/institutional/methodology",
  title: "Institutional API — Methodology",
  summary: "The methodology facts an integration should pin: SVI_VERSION, score bands, the eight dimensions with weights, the evidence confidence ladder, the benchmark n-rules and the governance URL.",
  description:
    "Read-only and static per deployment — the ETag changes only with a release, so poll it with `If-None-Match` and re-read your cached copy on a 200. `principles` restates the governance stance: BlockID structures the evidence and standardises the first pass; humans make the decision; overrides append, never overwrite; no benchmark without its n.",
  params: [],
  responseExample: `{
  "ok": true,
  "data": {
    "svi_version": "2.2.0",
    "bands": [{ "band": "strong", "min": 70, "max": 100 }, { "band": "developing", "min": 40, "max": 69 }, { "band": "early", "min": 0, "max": 39 }, { "band": "pending", "min": null, "max": null, "note": "no confident number yet — dimensions still pending" }],
    "dimensions": [{ "key": "tre", "title": "Traction & Revenue Evidence", "weight": 15 }],
    "evidence_confidence_levels": ["self_declared", "public_url", "document_uploaded", "connected_source", "transaction_data", "third_party_verified"],
    "benchmark_rules": { "floor": 10, "n_rules": [{ "band": "none", "min_n": 0, "max_n": 9, "shows": "no percentile, no rank — “not enough comparable companies (n = N)”" }], "counting": "n counts companies — one latest score per company, never one per analysis" },
    "principles": ["BlockID structures the evidence and standardises the first-pass analysis. Humans make the decision."],
    "urls": { "methodology": "https://blockid.au/methodology", "governance": "https://blockid.au/methodology/governance", "api_docs": "https://blockid.au/developers/api" }
  }
}`,
  curlSnippet: `curl "${BASE_URL}/api/v1/institutional/methodology" \\
  -H "Authorization: Bearer ${FAKE_BEARER}"`,
  jsSnippet: `const res = await fetch("${BASE_URL}/api/v1/institutional/methodology", {
  headers: { Authorization: "Bearer ${FAKE_BEARER}" },
});
const { data } = await res.json();
console.log(data.svi_version, data.benchmark_rules.floor, res.headers.get("etag"));`,
  rateLimit: INSTITUTIONAL_RATE,
  errorCodes: [...INSTITUTIONAL_ERRORS],
  changelog: [{ date: "2026-09-21", note: "Institutional API v1 (read-only) — initial release (G21 P3-B)." }],
  auth: INSTITUTIONAL_AUTH,
};

export const INSTITUTIONAL_ENDPOINTS: ApiEndpointDoc[] = [
  V1_INSTITUTIONAL_COHORTS,
  V1_INSTITUTIONAL_COHORT,
  V1_INSTITUTIONAL_SNAPSHOTS,
  V1_INSTITUTIONAL_COMPANY,
  V1_INSTITUTIONAL_BENCHMARKS,
  V1_INSTITUTIONAL_METHODOLOGY,
];

export const API_ENDPOINTS: ApiEndpointDoc[] = [
  SVI_INDEX,
  PRICING_TEST_ASSIGN,
  PRICING_TEST_EVENT,
  IDEA_QUESTIONS,
  V1_ANALYZE,
  V1_ID_PROFILE,
  V1_EVALUATIONS_LIST,
  V1_EVALUATIONS_DOSSIER,
  V1_EVALUATIONS_ASSESSMENT_READ,
  V1_EVALUATIONS_ASSESSMENT_WRITE,
  ...INSTITUTIONAL_ENDPOINTS,
];

export function getEndpointBySlug(slug: string): ApiEndpointDoc | null {
  return API_ENDPOINTS.find((e) => e.slug === slug) ?? null;
}
