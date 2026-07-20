import "server-only";

// Public API documentation registry (T_DEVREL_APIDOCS_0001).
//
// One source of truth for both the human-readable /developers/api pages and
// the machine-readable /api/openapi.json spec. Every entry documents a
// PUBLIC endpoint — no session or bearer auth required — so the shapes
// here must stay in lock-step with the real route handlers in
// `src/app/api/index/svi`, `src/app/api/pricing-test/*`, and
// `src/app/api/idea-questions`.
//
// PII / secret guard: no example may contain a real session id, bearer
// token, or user email. Fake placeholders only (e.g. "sess-example-1234").

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

export const API_ENDPOINTS: ApiEndpointDoc[] = [
  SVI_INDEX,
  PRICING_TEST_ASSIGN,
  PRICING_TEST_EVENT,
  IDEA_QUESTIONS,
];

export function getEndpointBySlug(slug: string): ApiEndpointDoc | null {
  return API_ENDPOINTS.find((e) => e.slug === slug) ?? null;
}
