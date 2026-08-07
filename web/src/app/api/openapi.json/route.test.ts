// Colocated vitest for GET /api/openapi.json — P9-openapi-route-test.
//
// The route is the ONLY machine-readable projection of the public API. It is
// consumed by third-party importers (Postman, Insomnia, code generators) and
// MUST stay in lock-step with the human-readable /developers/api registry
// (@/lib/api-docs-registry -> API_ENDPOINTS). Silent regressions this pins:
//   - dropping the 3600-second Cache-Control so CDN/edges hammer the route
//     on every partner refresh;
//   - flipping "openapi" from "3.1.0" to a value most generators reject;
//   - dropping the slug -> operationId dash->underscore rename (Postman
//     rejects hyphenated operationIds as identifiers);
//   - dropping the (summary + description) concatenation into
//     operation.description so importers lose the human context;
//   - regressing tagFor()'s prefix rules so /api/index/* endpoints get
//     bucketed under "Public" instead of "SVI Index" and every SDK's
//     namespacing shifts overnight;
//   - dropping the `requestBody` block on POST endpoints so generators emit
//     zero-argument client stubs and every partner integration goes dark;
//   - flipping requestBody.required to true when NO body param is required
//     (idea-questions accepts an idea-only step-1 call) so partners get 400s
//     on legitimate step-1 traffic;
//   - dropping the errorCodes -> responses[code] fan-out so partners lose
//     the "what does 404 mean here" contract;
//   - dropping the `parameters` array on GET endpoints with query params so
//     generators emit signature-less stubs;
//   - dropping the request/response `example` on the schema payloads so the
//     "try it" panels in Swagger UI go blank.
//
// The transformer is a pure function of API_ENDPOINTS with zero I/O, no auth,
// and no external fetch — so the test uses the real registry (no mocks) and
// asserts structural invariants that must hold across future registry growth,
// plus specific invariants tied to each currently-published endpoint.

import { describe, expect, it } from "vitest";
import { GET, dynamic, runtime } from "./route";
import { API_ENDPOINTS, type ApiEndpointDoc } from "@/lib/api-docs-registry";

// ─── envelope helper ──────────────────────────────────────────────────────

interface OpenApiParameter {
  name: string;
  in: "query" | "path" | "header" | "cookie";
  required: boolean;
  description: string;
  schema: { type: string };
  example?: string;
}

interface OpenApiResponse {
  description: string;
  content?: Record<string, { schema: { type: string }; example?: unknown }>;
}

interface OpenApiOperation {
  operationId: string;
  summary: string;
  description: string;
  tags: string[];
  parameters?: OpenApiParameter[];
  requestBody?: {
    required: boolean;
    content: Record<string, { schema: { type: string }; example?: unknown }>;
  };
  responses: Record<string, OpenApiResponse>;
  "x-rate-limit"?: { perMinute: number; bucket: string };
  "x-changelog"?: Array<{ date: string; note: string }>;
}

interface OpenApiPathItem {
  get?: OpenApiOperation;
  post?: OpenApiOperation;
}

interface OpenApiDocument {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
    contact: { name: string; url: string };
    license: { name: string; url: string };
  };
  servers: Array<{ url: string; description: string }>;
  tags: Array<{ name: string; description: string }>;
  paths: Record<string, OpenApiPathItem>;
}

async function callGet(): Promise<{
  status: number;
  headers: Headers;
  body: OpenApiDocument;
}> {
  const res = GET();
  const body = (await res.json()) as OpenApiDocument;
  return { status: res.status, headers: res.headers, body };
}

function operationFor(
  doc: OpenApiDocument,
  ep: ApiEndpointDoc,
): OpenApiOperation {
  const item = doc.paths[ep.path];
  expect(item, `paths["${ep.path}"] must exist`).toBeDefined();
  const op = ep.method === "GET" ? item.get : item.post;
  expect(op, `paths["${ep.path}"].${ep.method.toLowerCase()} must exist`).toBeDefined();
  return op as OpenApiOperation;
}

// ─── module invariants ────────────────────────────────────────────────────

describe("module invariants", () => {
  it("dynamic is force-dynamic (registry is a compile-time import but the docs surface must not be prerendered as a stale artefact)", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("runtime is nodejs (JSON.parse in tryParseExample is fine on edge, but the human /developers/api sibling uses nodejs — keep both on the same runtime to avoid divergent behaviour)", () => {
    expect(runtime).toBe("nodejs");
  });
});

// ─── HTTP envelope ────────────────────────────────────────────────────────

describe("HTTP envelope", () => {
  it("returns 200", async () => {
    const { status } = await callGet();
    expect(status).toBe(200);
  });

  it("Content-Type is application/json", async () => {
    const { headers } = await callGet();
    expect(headers.get("Content-Type") ?? "").toMatch(/^application\/json/);
  });

  it("Cache-Control is public, max-age=3600 (partners pull this on cold-start; hammering the route on every generator init is wasteful)", async () => {
    const { headers } = await callGet();
    expect(headers.get("Cache-Control")).toBe("public, max-age=3600");
  });

  it("body parses as a plain JSON object", async () => {
    const { body } = await callGet();
    expect(body).toBeTypeOf("object");
    expect(body).not.toBeNull();
    expect(Array.isArray(body)).toBe(false);
  });
});

// ─── document root ────────────────────────────────────────────────────────

describe("document root", () => {
  it("openapi === '3.1.0' (generators dispatch on the exact string)", async () => {
    const { body } = await callGet();
    expect(body.openapi).toBe("3.1.0");
  });

  it("has info, servers, tags, paths at the top level", async () => {
    const { body } = await callGet();
    expect(body.info).toBeDefined();
    expect(body.servers).toBeDefined();
    expect(body.tags).toBeDefined();
    expect(body.paths).toBeDefined();
  });
});

// ─── info block ───────────────────────────────────────────────────────────

describe("info block", () => {
  it("title is 'BlockID Public API'", async () => {
    const { body } = await callGet();
    expect(body.info.title).toBe("BlockID Public API");
  });

  it("version is a non-empty string", async () => {
    const { body } = await callGet();
    expect(body.info.version).toBeTypeOf("string");
    expect(body.info.version.length).toBeGreaterThan(0);
  });

  it("description mentions Sydney AU and the Privacy Act (kept for the AU-jurisdiction promise on the public docs)", async () => {
    const { body } = await callGet();
    expect(body.info.description).toMatch(/Sydney AU/);
    expect(body.info.description).toMatch(/Privacy Act 1988/);
  });

  it("contact points at BlockID Developer Relations and /developers", async () => {
    const { body } = await callGet();
    expect(body.info.contact.name).toBe("BlockID Developer Relations");
    expect(body.info.contact.url).toBe("https://blockid.au/developers");
  });

  it("license points at /legal/terms", async () => {
    const { body } = await callGet();
    expect(body.info.license.name).toBe("Terms of Use");
    expect(body.info.license.url).toBe("https://blockid.au/legal/terms");
  });
});

// ─── servers ──────────────────────────────────────────────────────────────

describe("servers", () => {
  it("has at least one server", async () => {
    const { body } = await callGet();
    expect(body.servers.length).toBeGreaterThanOrEqual(1);
  });

  it("production server URL is https://blockid.au (Sydney AU)", async () => {
    const { body } = await callGet();
    const prod = body.servers.find((s) => s.url === "https://blockid.au");
    expect(prod).toBeDefined();
    expect(prod?.description).toMatch(/Sydney AU/);
  });
});

// ─── tags ─────────────────────────────────────────────────────────────────

describe("tags derivation", () => {
  it("every tag has a name and a description", async () => {
    const { body } = await callGet();
    for (const t of body.tags) {
      expect(t.name).toBeTypeOf("string");
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.description).toBeTypeOf("string");
    }
  });

  it("tags are deduplicated (Set semantics — no repeat entries even when many endpoints share a tag)", async () => {
    const { body } = await callGet();
    const names = body.tags.map((t) => t.name);
    expect(names.length).toBe(new Set(names).size);
  });

  it("every operation.tags[0] appears in the document-level tags array (SDK generators walk this to build namespaces)", async () => {
    const { body } = await callGet();
    const documentTagNames = new Set(body.tags.map((t) => t.name));
    for (const ep of API_ENDPOINTS) {
      const op = operationFor(body, ep);
      expect(op.tags.length).toBeGreaterThanOrEqual(1);
      expect(documentTagNames.has(op.tags[0])).toBe(true);
    }
  });
});

// ─── paths registry coverage ──────────────────────────────────────────────

describe("paths registry coverage", () => {
  it("has at least one path per registered endpoint (grows with the registry, never shrinks)", async () => {
    const { body } = await callGet();
    expect(Object.keys(body.paths).length).toBeGreaterThanOrEqual(
      new Set(API_ENDPOINTS.map((e) => e.path)).size,
    );
  });

  it("every registry endpoint has a matching paths[<path>] entry", async () => {
    const { body } = await callGet();
    for (const ep of API_ENDPOINTS) {
      expect(body.paths[ep.path], `missing paths["${ep.path}"]`).toBeDefined();
    }
  });

  it("GET endpoints land under .get and POST under .post (never crossed)", async () => {
    const { body } = await callGet();
    for (const ep of API_ENDPOINTS) {
      const item = body.paths[ep.path];
      if (ep.method === "GET") {
        expect(item.get).toBeDefined();
      } else {
        expect(item.post).toBeDefined();
      }
    }
  });
});

// ─── per-endpoint operation shape ─────────────────────────────────────────

describe.each(API_ENDPOINTS.map((ep) => [ep.slug, ep] as const))(
  "operation shape — %s",
  (_slug, ep) => {
    it("operationId is ep.slug with dashes rewritten to underscores (identifier-safe for generated SDKs)", async () => {
      const { body } = await callGet();
      const op = operationFor(body, ep);
      expect(op.operationId).toBe(ep.slug.replace(/-/g, "_"));
      expect(op.operationId).not.toMatch(/-/);
    });

    it("summary === ep.title", async () => {
      const { body } = await callGet();
      const op = operationFor(body, ep);
      expect(op.summary).toBe(ep.title);
    });

    it("description concatenates ep.summary and ep.description with a blank line", async () => {
      const { body } = await callGet();
      const op = operationFor(body, ep);
      expect(op.description).toBe(`${ep.summary}\n\n${ep.description}`);
    });

    it("has exactly one tag (single-tag namespacing keeps generated SDKs tidy)", async () => {
      const { body } = await callGet();
      const op = operationFor(body, ep);
      expect(op.tags.length).toBe(1);
    });

    it("responses['200'] is populated with application/json and an example payload derived from ep.responseExample", async () => {
      const { body } = await callGet();
      const op = operationFor(body, ep);
      const r200 = op.responses["200"];
      expect(r200).toBeDefined();
      expect(r200.description).toBe("Success");
      const json = r200.content?.["application/json"];
      expect(json).toBeDefined();
      expect(json?.schema.type).toBe("object");
      expect(json?.example).toBeDefined();
    });

    it("x-rate-limit is passed through from the registry (partners depend on this to auto-throttle)", async () => {
      const { body } = await callGet();
      const op = operationFor(body, ep);
      expect(op["x-rate-limit"]).toEqual(ep.rateLimit);
    });

    it("x-changelog is passed through from the registry", async () => {
      const { body } = await callGet();
      const op = operationFor(body, ep);
      expect(op["x-changelog"]).toEqual(ep.changelog);
    });

    it("every ep.errorCodes entry surfaces as a responses[code] with description === when", async () => {
      const { body } = await callGet();
      const op = operationFor(body, ep);
      for (const err of ep.errorCodes) {
        const key = String(err.code);
        const resp = op.responses[key];
        expect(resp, `missing responses["${key}"] on ${ep.slug}`).toBeDefined();
        expect(resp.description).toBe(err.when);
        expect(resp.content?.["application/json"]?.schema.type).toBe("object");
      }
    });
  },
);

// ─── requestBody vs parameters routing ────────────────────────────────────

describe("requestBody vs parameters routing", () => {
  it("endpoints with at least one body param have a requestBody block", async () => {
    const { body } = await callGet();
    for (const ep of API_ENDPOINTS) {
      const hasBody = ep.params.some((p) => p.in === "body");
      const op = operationFor(body, ep);
      if (hasBody) {
        expect(op.requestBody, `${ep.slug} should carry requestBody`).toBeDefined();
        expect(op.requestBody?.content["application/json"]).toBeDefined();
      } else {
        expect(op.requestBody, `${ep.slug} should NOT carry requestBody`).toBeUndefined();
      }
    }
  });

  it("requestBody.required is true iff any body param is required (idea-questions accepts an idea-only step-1 call — flipping this to true would 400 legitimate traffic)", async () => {
    const { body } = await callGet();
    for (const ep of API_ENDPOINTS) {
      const bodyParams = ep.params.filter((p) => p.in === "body");
      if (bodyParams.length === 0) continue;
      const op = operationFor(body, ep);
      const anyRequired = bodyParams.some((p) => p.required);
      expect(op.requestBody?.required).toBe(anyRequired);
    }
  });

  it("requestBody example is set from ep.requestBodyExample when present (parsed as JSON when valid)", async () => {
    const { body } = await callGet();
    for (const ep of API_ENDPOINTS) {
      const bodyParams = ep.params.filter((p) => p.in === "body");
      if (bodyParams.length === 0) continue;
      const op = operationFor(body, ep);
      if (ep.requestBodyExample) {
        // valid JSON should parse to an object; invalid would fall back to the raw string
        expect(op.requestBody?.content["application/json"].example).toBeDefined();
      }
    }
  });

  it("endpoints with at least one query or path param expose an .parameters array (generators emit signature-less stubs otherwise)", async () => {
    const { body } = await callGet();
    for (const ep of API_ENDPOINTS) {
      const nonBody = ep.params.filter((p) => p.in !== "body");
      const op = operationFor(body, ep);
      if (nonBody.length > 0) {
        expect(op.parameters, `${ep.slug} should carry parameters`).toBeDefined();
        expect(op.parameters?.length).toBe(nonBody.length);
      } else {
        expect(op.parameters, `${ep.slug} should NOT carry parameters`).toBeUndefined();
      }
    }
  });

  it("each parameter carries name, in, required, description, schema.type from the registry", async () => {
    const { body } = await callGet();
    for (const ep of API_ENDPOINTS) {
      const nonBody = ep.params.filter((p) => p.in !== "body");
      if (nonBody.length === 0) continue;
      const op = operationFor(body, ep);
      const params = op.parameters ?? [];
      for (const src of nonBody) {
        const dst = params.find((p) => p.name === src.name);
        expect(dst, `missing parameter ${src.name} on ${ep.slug}`).toBeDefined();
        expect(dst?.in).toBe(src.in);
        expect(dst?.required).toBe(src.required);
        expect(dst?.description).toBe(src.description);
        expect(dst?.schema.type).toBe(src.type);
        if (src.example !== undefined) {
          expect(dst?.example).toBe(src.example);
        } else {
          expect(dst?.example).toBeUndefined();
        }
      }
    }
  });
});

// ─── tagFor() prefix rules (checked via observed operation.tags) ──────────

describe("tagFor prefix rules", () => {
  it("/api/index/* -> 'SVI Index'", async () => {
    const { body } = await callGet();
    const svi = API_ENDPOINTS.find((e) => e.path.startsWith("/api/index/"));
    expect(svi, "registry regression — no /api/index/ endpoint left to sanity-check the tagFor rule").toBeDefined();
    if (svi) {
      const op = operationFor(body, svi);
      expect(op.tags[0]).toBe("SVI Index");
    }
  });

  it("/api/pricing-test/* -> 'Pricing Experiments'", async () => {
    const { body } = await callGet();
    const pt = API_ENDPOINTS.find((e) => e.path.startsWith("/api/pricing-test/"));
    expect(pt, "registry regression — no /api/pricing-test/ endpoint to sanity-check the tagFor rule").toBeDefined();
    if (pt) {
      const op = operationFor(body, pt);
      expect(op.tags[0]).toBe("Pricing Experiments");
    }
  });

  it("/api/idea-questions -> 'Idea Engine'", async () => {
    const { body } = await callGet();
    const ideas = API_ENDPOINTS.find((e) => e.path.startsWith("/api/idea-questions"));
    expect(ideas).toBeDefined();
    if (ideas) {
      const op = operationFor(body, ideas);
      expect(op.tags[0]).toBe("Idea Engine");
    }
  });

  it("fallback bucket is 'Public' — every observed tag is one of the four known buckets (any drift means a new prefix rule was added without extending the tag whitelist)", async () => {
    const { body } = await callGet();
    const allowed = new Set(["SVI Index", "Pricing Experiments", "Idea Engine", "Public"]);
    for (const t of body.tags) {
      expect(allowed.has(t.name), `unexpected tag "${t.name}"`).toBe(true);
    }
  });
});

// ─── tryParseExample behaviour (verified through payloads) ────────────────

describe("tryParseExample behaviour", () => {
  it("response example for /api/index/svi is parsed as JSON, not left as a raw string (Swagger UI 'try it' renders the object)", async () => {
    const { body } = await callGet();
    const svi = API_ENDPOINTS.find((e) => e.slug === "svi-index");
    expect(svi).toBeDefined();
    if (svi) {
      const op = operationFor(body, svi);
      const ex = op.responses["200"].content?.["application/json"]?.example;
      expect(ex).toBeTypeOf("object");
      expect(ex).not.toBeNull();
      // sanity — the registered example carries the "bucket" key
      expect((ex as { bucket?: unknown }).bucket).toBeDefined();
    }
  });

  it("request body example for POST /api/pricing-test/event is parsed as JSON", async () => {
    const { body } = await callGet();
    const ev = API_ENDPOINTS.find((e) => e.slug === "pricing-test-event");
    expect(ev).toBeDefined();
    if (ev) {
      const op = operationFor(body, ev);
      const ex = op.requestBody?.content["application/json"].example;
      expect(ex).toBeTypeOf("object");
      expect(ex).not.toBeNull();
      expect((ex as { experiment?: unknown }).experiment).toBeDefined();
    }
  });
});

// ─── determinism ──────────────────────────────────────────────────────────

describe("determinism", () => {
  it("two back-to-back calls return byte-identical JSON (no Date.now, no Math.random, no per-request drift)", async () => {
    const a = await callGet();
    const b = await callGet();
    expect(JSON.stringify(a.body)).toBe(JSON.stringify(b.body));
  });
});
