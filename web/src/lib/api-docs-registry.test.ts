// Colocated vitest for the previously-untested server-only public API
// documentation registry at `web/src/lib/api-docs-registry.ts`.
//
// The registry is the single source of truth consumed by both the
// human-readable `/developers/api` pages and the machine-readable
// `/api/openapi.json` spec, so any silent drift here corrupts both surfaces.
// The module comment pins two non-negotiable invariants that these tests
// regression-guard at unit-test time:
//
//   1. Registry shapes stay in lock-step with the real public route handlers
//      in `src/app/api/index/svi`, `src/app/api/pricing-test/*`, and
//      `src/app/api/idea-questions` — a rename of a slug, a bumped rate
//      limit, or a shape drift in a snippet has to fail here first.
//   2. No example may contain a real session id, bearer token, or user email
//      (PII / secret guard) — fake placeholders only.

import { describe, expect, it } from "vitest";
import {
  API_ENDPOINTS,
  FAKE_BEARER,
  getEndpointBySlug,
  type ApiEndpointDoc,
  type ApiParamIn,
} from "./api-docs-registry";

const SLUGS = [
  "svi-index",
  "pricing-test-assign",
  "pricing-test-event",
  "idea-questions",
  "v1-evaluations-list",
  "v1-evaluations-dossier",
  "v1-evaluations-assessment-read",
  "v1-evaluations-assessment-write",
] as const;
const PARAM_INS: readonly ApiParamIn[] = ["query", "path", "body"] as const;

describe("api-docs-registry: registry integrity", () => {
  it("ships exactly the 8 documented endpoints (4 public no-auth + 4 Evaluator API v1)", () => {
    expect(API_ENDPOINTS).toHaveLength(8);
  });

  it("every slug is unique", () => {
    const slugs = API_ENDPOINTS.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every path is unique — no two endpoints share a route", () => {
    const paths = API_ENDPOINTS.map((e) => `${e.method} ${e.path}`);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("slugs match the canonical shipped set in a stable order", () => {
    expect(API_ENDPOINTS.map((e) => e.slug)).toEqual([...SLUGS]);
  });
});

describe("api-docs-registry: per-endpoint shape", () => {
  for (const slug of SLUGS) {
    describe(`slug=${slug}`, () => {
      const endpoint = API_ENDPOINTS.find((e) => e.slug === slug) as ApiEndpointDoc;

      it("exists and carries all required top-level fields", () => {
        expect(endpoint).toBeDefined();
        expect(endpoint.slug).toBe(slug);
        expect(endpoint.title.length).toBeGreaterThan(0);
        expect(endpoint.summary.length).toBeGreaterThan(0);
        expect(endpoint.description.length).toBeGreaterThan(0);
        expect(endpoint.responseExample.length).toBeGreaterThan(0);
        expect(endpoint.curlSnippet.length).toBeGreaterThan(0);
        expect(endpoint.jsSnippet.length).toBeGreaterThan(0);
      });

      it("method is GET or POST", () => {
        expect(["GET", "POST"]).toContain(endpoint.method);
      });

      it("path starts with /api/", () => {
        expect(endpoint.path.startsWith("/api/")).toBe(true);
      });

      it("rateLimit.perMinute is a positive integer with a non-empty bucket", () => {
        expect(Number.isInteger(endpoint.rateLimit.perMinute)).toBe(true);
        expect(endpoint.rateLimit.perMinute).toBeGreaterThan(0);
        expect(endpoint.rateLimit.bucket.length).toBeGreaterThan(0);
      });

      it("errorCodes rows are valid HTTP codes with a non-empty `when` cause", () => {
        expect(endpoint.errorCodes.length).toBeGreaterThan(0);
        for (const err of endpoint.errorCodes) {
          expect(Number.isInteger(err.code)).toBe(true);
          expect(err.code).toBeGreaterThanOrEqual(100);
          expect(err.code).toBeLessThan(600);
          expect(err.when.length).toBeGreaterThan(0);
        }
      });

      it("changelog dates are YYYY-MM-DD ISO with non-empty notes", () => {
        expect(endpoint.changelog.length).toBeGreaterThan(0);
        for (const entry of endpoint.changelog) {
          expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(Number.isNaN(Date.parse(entry.date))).toBe(false);
          expect(entry.note.length).toBeGreaterThan(0);
        }
      });

      it("every param has a valid `in` and non-empty name/type/description", () => {
        for (const p of endpoint.params) {
          expect(PARAM_INS).toContain(p.in);
          expect(p.name.length).toBeGreaterThan(0);
          expect(p.type.length).toBeGreaterThan(0);
          expect(p.description.length).toBeGreaterThan(0);
          expect(typeof p.required).toBe("boolean");
        }
      });

      it("curlSnippet references the endpoint path so operators cannot mis-copy", () => {
        expect(endpoint.curlSnippet).toContain(endpoint.path);
      });

      it("jsSnippet references the endpoint path", () => {
        expect(endpoint.jsSnippet).toContain(endpoint.path);
      });

      it("both snippets are anchored to the production base URL", () => {
        expect(endpoint.curlSnippet).toContain("https://blockid.au");
        expect(endpoint.jsSnippet).toContain("https://blockid.au");
      });
    });
  }
});

describe("api-docs-registry: requestBodyExample presence", () => {
  it("GET endpoints omit requestBodyExample", () => {
    for (const endpoint of API_ENDPOINTS.filter((e) => e.method === "GET")) {
      expect(endpoint.requestBodyExample).toBeUndefined();
    }
  });

  it("POST endpoints ship a non-empty requestBodyExample", () => {
    for (const endpoint of API_ENDPOINTS.filter((e) => e.method === "POST")) {
      expect(endpoint.requestBodyExample).toBeDefined();
      expect(typeof endpoint.requestBodyExample).toBe("string");
      expect((endpoint.requestBodyExample as string).length).toBeGreaterThan(0);
    }
  });

  it("body-typed params only appear on POST endpoints", () => {
    for (const endpoint of API_ENDPOINTS) {
      const hasBodyParam = endpoint.params.some((p) => p.in === "body");
      if (hasBodyParam) {
        expect(endpoint.method).toBe("POST");
      }
    }
  });
});

describe("api-docs-registry: PII / secret guard", () => {
  // Any real credential slipping into an example would ship straight to the
  // /developers/api page and the openapi.json spec. Fake placeholders only.
  const REAL_EMAIL_RE = /[A-Za-z0-9._%+-]+@(?!example\.(?:com|org|net))[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
  const BEARER_RE = /Bearer\s+[A-Za-z0-9._-]{16,}/i;
  const SESSION_RE = /sess[_-][a-z0-9]{16,}/i; // real session ids are long
  const AWS_KEY_RE = /AKIA[0-9A-Z]{16}/;

  const surfaces = (e: ApiEndpointDoc): string[] => [
    e.responseExample,
    e.curlSnippet,
    e.jsSnippet,
    ...(e.requestBodyExample ? [e.requestBodyExample] : []),
    ...e.params.map((p) => p.example ?? ""),
  ];

  it("no example carries a real email address", () => {
    for (const endpoint of API_ENDPOINTS) {
      for (const text of surfaces(endpoint)) {
        expect(text).not.toMatch(REAL_EMAIL_RE);
      }
    }
  });

  it("no example carries an Authorization: Bearer <token> header — EXCEPT the documented Evaluator API v1 endpoints (`auth` set), which may only ever show the literal FAKE_BEARER placeholder, never anything else matching the pattern", () => {
    for (const endpoint of API_ENDPOINTS) {
      for (const text of surfaces(endpoint)) {
        if (endpoint.auth) {
          const matches = text.match(new RegExp(BEARER_RE, "gi")) ?? [];
          for (const m of matches) expect(m).toBe(`Bearer ${FAKE_BEARER}`);
        } else {
          expect(text).not.toMatch(BEARER_RE);
        }
      }
    }
  });

  it("no example carries a realistic session id (fake `sess-example-*` only)", () => {
    // Placeholder session ids in the module use the `sess-example-` prefix.
    // Anything longer/random-looking would suggest a real id got pasted.
    for (const endpoint of API_ENDPOINTS) {
      for (const text of surfaces(endpoint)) {
        expect(text).not.toMatch(SESSION_RE);
      }
    }
  });

  it("no example carries an AWS-style access key id", () => {
    for (const endpoint of API_ENDPOINTS) {
      for (const text of surfaces(endpoint)) {
        expect(text).not.toMatch(AWS_KEY_RE);
      }
    }
  });
});

describe("api-docs-registry: per-endpoint anchor pins", () => {
  it("svi-index documents the anonymised aggregates contract", () => {
    const e = getEndpointBySlug("svi-index") as ApiEndpointDoc;
    expect(e.method).toBe("GET");
    expect(e.path).toBe("/api/index/svi");
    // Public read caps + bucket taxonomy pinned.
    expect(e.rateLimit.perMinute).toBe(60);
    expect(e.rateLimit.bucket).toBe("public-read");
    // Bucket enum values named in the `bucket` param description.
    const bucketParam = e.params.find((p) => p.name === "bucket");
    expect(bucketParam).toBeDefined();
    for (const bucket of ["overall", "sector", "stage"]) {
      expect(bucketParam!.description).toContain(bucket);
    }
    // k-anonymity guardrail cited verbatim.
    expect(e.description).toMatch(/k-anonymity/);
    // Disclaimer surfaced in the response example.
    expect(e.responseExample).toMatch(/Not investment, financial, or legal advice/);
  });

  it("pricing-test-assign documents 404 on non-running experiments", () => {
    const e = getEndpointBySlug("pricing-test-assign") as ApiEndpointDoc;
    expect(e.method).toBe("GET");
    expect(e.path).toBe("/api/pricing-test/assign");
    expect(e.rateLimit.perMinute).toBe(120);
    // 404 non-running experiment guard pinned.
    const has404 = e.errorCodes.some((c) => c.code === 404 && /running/i.test(c.when));
    expect(has404).toBe(true);
    // Required query params.
    for (const p of ["experiment", "bucket"]) {
      expect(e.params.find((x) => x.name === p && x.in === "query" && x.required)).toBeDefined();
    }
  });

  it("pricing-test-event pins the always-202 fire-and-forget contract", () => {
    const e = getEndpointBySlug("pricing-test-event") as ApiEndpointDoc;
    expect(e.method).toBe("POST");
    expect(e.path).toBe("/api/pricing-test/event");
    expect(e.rateLimit.perMinute).toBe(240);
    expect(e.rateLimit.bucket).toBe("public-write");
    // 202 semantic surfaced in errorCodes ("recorded: false" for unknown name).
    const has202 = e.errorCodes.some((c) => c.code === 202);
    expect(has202).toBe(true);
    // All four required body fields present.
    for (const name of ["experiment", "variantKey", "type", "sessionId"]) {
      const p = e.params.find((x) => x.name === name && x.in === "body");
      expect(p).toBeDefined();
      expect(p!.required).toBe(true);
    }
    // valueAud + userId are optional.
    expect(e.params.find((p) => p.name === "valueAud")!.required).toBe(false);
    expect(e.params.find((p) => p.name === "userId")!.required).toBe(false);
  });

  it("idea-questions documents the two-step Socratic contract", () => {
    const e = getEndpointBySlug("idea-questions") as ApiEndpointDoc;
    expect(e.method).toBe("POST");
    expect(e.path).toBe("/api/idea-questions");
    // Character caps cited in the description are load-bearing for the
    // real handler: ideaText 4000 chars, per-answer 1000 chars, ≤10 keys.
    expect(e.description).toMatch(/4000/);
    expect(e.description).toMatch(/1000/);
    expect(e.description).toMatch(/10 answer keys/);
    // ideaText is required, answers is optional.
    const ideaText = e.params.find((p) => p.name === "ideaText");
    const answers = e.params.find((p) => p.name === "answers");
    expect(ideaText?.required).toBe(true);
    expect(answers?.required).toBe(false);
  });
});

describe("api-docs-registry: Evaluator API v1 (G14-S38) — auth pins", () => {
  const V1_SLUGS = ["v1-evaluations-list", "v1-evaluations-dossier", "v1-evaluations-assessment-read", "v1-evaluations-assessment-write"] as const;

  it("every v1 evaluations endpoint declares `auth` (bearer + scope + the api.access plan gate); every pre-S38 endpoint has none", () => {
    for (const slug of V1_SLUGS) {
      const e = getEndpointBySlug(slug) as ApiEndpointDoc;
      expect(e.auth?.scheme).toBe("bearer");
      expect(e.auth?.header).toContain("Bearer bk_live_");
      expect(e.auth?.planGate).toMatch(/api\.access/);
      expect(e.auth?.planGate).toMatch(/Fund/);
      expect(e.auth?.planGate).toMatch(/Program/);
    }
    for (const slug of ["svi-index", "pricing-test-assign", "pricing-test-event", "idea-questions"] as const) {
      expect((getEndpointBySlug(slug) as ApiEndpointDoc).auth).toBeUndefined();
    }
  });

  it("read endpoints require evaluations:read; the write endpoint requires evaluations:write", () => {
    expect(getEndpointBySlug("v1-evaluations-list")!.auth!.scope).toBe("evaluations:read");
    expect(getEndpointBySlug("v1-evaluations-dossier")!.auth!.scope).toBe("evaluations:read");
    expect(getEndpointBySlug("v1-evaluations-assessment-read")!.auth!.scope).toBe("evaluations:read");
    expect(getEndpointBySlug("v1-evaluations-assessment-write")!.auth!.scope).toBe("evaluations:write");
  });

  it("every v1 endpoint documents the full 401/402/403/429 auth ladder", () => {
    for (const slug of V1_SLUGS) {
      const codes = (getEndpointBySlug(slug) as ApiEndpointDoc).errorCodes.map((c) => c.code);
      for (const required of [401, 402, 403, 429]) expect(codes).toContain(required);
    }
  });

  it("dossier and both assessment endpoints share the same path (GET /assessment, POST /assessment), distinct from the list path", () => {
    const dossier = getEndpointBySlug("v1-evaluations-dossier") as ApiEndpointDoc;
    const assessmentRead = getEndpointBySlug("v1-evaluations-assessment-read") as ApiEndpointDoc;
    const assessmentWrite = getEndpointBySlug("v1-evaluations-assessment-write") as ApiEndpointDoc;
    expect(assessmentRead.path).toBe(assessmentWrite.path);
    expect(assessmentRead.method).toBe("GET");
    expect(assessmentWrite.method).toBe("POST");
    expect(dossier.path).not.toBe(assessmentRead.path);
    expect(getEndpointBySlug("v1-evaluations-list")!.path).toBe("/api/v1/evaluations");
  });

  it("the write endpoint documents the decision+conviction submit gate (422) and the 0392 migration gate (503)", () => {
    const write = getEndpointBySlug("v1-evaluations-assessment-write") as ApiEndpointDoc;
    expect(write.errorCodes.some((c) => c.code === 422)).toBe(true);
    expect(write.errorCodes.some((c) => c.code === 503)).toBe(true);
    expect(write.requestBodyExample).toBeDefined();
    expect(write.description).toMatch(/evaluations:write/);
  });

  it("three v1 paths are exposed under /api/v1/evaluations", () => {
    const v1Paths = new Set(V1_SLUGS.map((s) => (getEndpointBySlug(s) as ApiEndpointDoc).path));
    expect(v1Paths).toEqual(new Set(["/api/v1/evaluations", "/api/v1/evaluations/{id}/dossier", "/api/v1/evaluations/{id}/assessment"]));
  });
});

describe("api-docs-registry: getEndpointBySlug", () => {
  it("returns the exact registry object reference for every documented slug", () => {
    for (const slug of SLUGS) {
      const found = getEndpointBySlug(slug);
      expect(found).toBeDefined();
      expect(found!.slug).toBe(slug);
      // Same identity — no defensive clone that would let a caller mutate
      // the returned envelope without touching the registry entry.
      expect(found).toBe(API_ENDPOINTS.find((e) => e.slug === slug));
    }
  });

  it("returns null for an unknown slug", () => {
    expect(getEndpointBySlug("nope-not-a-slug")).toBeNull();
  });

  it("returns null for an empty slug", () => {
    expect(getEndpointBySlug("")).toBeNull();
  });

  it("lookup is case-sensitive — SVI-INDEX does not resolve to svi-index", () => {
    expect(getEndpointBySlug("SVI-INDEX")).toBeNull();
    expect(getEndpointBySlug("Svi-Index")).toBeNull();
  });
});
