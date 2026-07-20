// GET /api/openapi.json
//
// OpenAPI 3.1 spec generated from the same `API_ENDPOINTS` registry that
// renders the human docs under /developers/api — so both surfaces stay in
// lock-step and there's exactly one source of truth for the public API.

import { NextResponse } from "next/server";
import {
  API_ENDPOINTS,
  type ApiEndpointDoc,
  type ApiParamDoc,
} from "@/lib/api-docs-registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  openapi: "3.1.0";
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

function tryParseExample(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function paramToOpenApi(p: ApiParamDoc): OpenApiParameter {
  // The registry uses `in: "body"` for request-body fields — those are
  // handled separately below as `requestBody`, not as parameters.
  const inMap: Record<Exclude<ApiParamDoc["in"], "body">, OpenApiParameter["in"]> = {
    query: "query",
    path: "path",
  };
  return {
    name: p.name,
    in: inMap[p.in as "query" | "path"],
    required: p.required,
    description: p.description,
    schema: { type: p.type },
    ...(p.example !== undefined ? { example: p.example } : {}),
  };
}

function buildOperation(ep: ApiEndpointDoc): OpenApiOperation {
  const queryOrPathParams = ep.params
    .filter((p): p is ApiParamDoc & { in: "query" | "path" } => p.in !== "body")
    .map(paramToOpenApi);

  const bodyParams = ep.params.filter((p) => p.in === "body");
  const bodyProperties: Record<string, {
    type: string;
    description: string;
    example?: string;
  }> = {};
  const requiredBodyKeys: string[] = [];
  for (const p of bodyParams) {
    bodyProperties[p.name] = {
      type: p.type,
      description: p.description,
      ...(p.example !== undefined ? { example: p.example } : {}),
    };
    if (p.required) requiredBodyKeys.push(p.name);
  }

  const op: OpenApiOperation = {
    operationId: ep.slug.replace(/-/g, "_"),
    summary: ep.title,
    description: `${ep.summary}\n\n${ep.description}`,
    tags: [tagFor(ep.path)],
    responses: {
      "200": {
        description: "Success",
        content: {
          "application/json": {
            schema: { type: "object" },
            example: tryParseExample(ep.responseExample),
          },
        },
      },
      ...Object.fromEntries(
        ep.errorCodes.map((e) => [
          String(e.code),
          {
            description: e.when,
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          } satisfies OpenApiResponse,
        ]),
      ),
    },
    "x-rate-limit": ep.rateLimit,
    "x-changelog": ep.changelog,
  };

  if (queryOrPathParams.length > 0) op.parameters = queryOrPathParams;

  if (bodyParams.length > 0) {
    op.requestBody = {
      required: requiredBodyKeys.length > 0,
      content: {
        "application/json": {
          schema: {
            type: "object",
          },
          example: ep.requestBodyExample
            ? tryParseExample(ep.requestBodyExample)
            : undefined,
        },
      },
    };
  }

  return op;
}

function tagFor(path: string): string {
  if (path.startsWith("/api/index/")) return "SVI Index";
  if (path.startsWith("/api/pricing-test/")) return "Pricing Experiments";
  if (path.startsWith("/api/idea-questions")) return "Idea Engine";
  return "Public";
}

function buildDocument(): OpenApiDocument {
  const paths: Record<string, OpenApiPathItem> = {};
  const tagSet = new Set<string>();

  for (const ep of API_ENDPOINTS) {
    const item: OpenApiPathItem = paths[ep.path] ?? {};
    const op = buildOperation(ep);
    tagSet.add(op.tags[0]);
    if (ep.method === "GET") item.get = op;
    else item.post = op;
    paths[ep.path] = item;
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "BlockID Public API",
      version: "1.0.0",
      description:
        "Public, no-auth endpoints for ecosystem partners. Human-readable docs at https://blockid.au/developers/api. API served from Sydney AU. Data anonymised per Privacy Act 1988.",
      contact: {
        name: "BlockID Developer Relations",
        url: "https://blockid.au/developers",
      },
      license: {
        name: "Terms of Use",
        url: "https://blockid.au/legal/terms",
      },
    },
    servers: [
      {
        url: "https://blockid.au",
        description: "Production (Sydney AU)",
      },
    ],
    tags: Array.from(tagSet).map((name) => ({
      name,
      description: `${name} endpoints`,
    })),
    paths,
  };
}

export function GET(): NextResponse {
  const doc = buildDocument();
  return NextResponse.json(doc, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
