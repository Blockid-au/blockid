// Unit tests for POST /api/dataroom/populate-from-template — P1-populate-route.
//
// Asserts the route contract branches from route.ts:
//   1. 401 when the feature gate rejects (unauthenticated).
//   2. 400 invalid_json on unparseable body.
//   3. 400 invalid_body on schema violation.
//   4. 400 template_not_implemented for a non-atlassian template.
//   5. 429 rate_limited when the persistent bucket denies (with Retry-After header).
//   6. 200 dry_run returns preview from the underlying lib, no analytics_events insert count assertion needed.
//   7. 200 append success returns created/updated/skipped and best-effort audit is fired.
//   8. 500 error passthrough when populateFromTemplate returns ok:false.
//   9. Uses project_id from the body when supplied; falls back to getActiveProject otherwise.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const gateMock = vi.fn();
vi.mock("@/lib/feature-gate", () => ({
  gateRequireFeature: (feature: string) => gateMock(feature),
}));

const supabaseInsertMock = vi.fn<(payload: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>>(
  async () => ({ data: null, error: null }),
);
const supabaseFromMock = vi.fn<(table: string) => { insert: (payload: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> }>(
  () => ({
    insert: (payload: Record<string, unknown>) => supabaseInsertMock(payload),
  }),
);
const getSupabaseAdminMock = vi.fn<() => { from: typeof supabaseFromMock } | null>(
  () => ({ from: supabaseFromMock }),
);
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

const getActiveProjectMock = vi.fn<(userId: string) => Promise<{ id: string } | null>>();
vi.mock("@/lib/projects", () => ({
  getActiveProject: (userId: string) => getActiveProjectMock(userId),
}));

const populateMock = vi.fn<(params: Record<string, unknown>) => Promise<Record<string, unknown>>>();
vi.mock("@/lib/dataroom/populate", () => ({
  populateFromTemplate: (params: Record<string, unknown>) => populateMock(params),
}));

const consumeRateLimitMock = vi.fn<(opts: Record<string, unknown>) => Promise<Record<string, unknown>>>();
vi.mock("@/lib/rate-limit/persistent", () => ({
  consumeRateLimit: (opts: Record<string, unknown>) => consumeRateLimitMock(opts),
}));

// ATLASSIAN_DATAROOM_TEMPLATE is passed through as-is; assert on identity.
const { templateSentinel } = vi.hoisted(() => ({
  templateSentinel: [{ __sentinel: true }] as unknown[],
}));
vi.mock("@/lib/dataroom/atlassian-template", () => ({
  ATLASSIAN_DATAROOM_TEMPLATE: templateSentinel,
}));

import { POST } from "./route";

function jsonReq(body: unknown): NextRequest {
  return new Request("http://x/api/dataroom/populate-from-template", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

function gateOk(user: { id: string; email: string }) {
  return {
    ok: true,
    user,
    uwp: { id: user.id, plan: "free", segment: "founder" },
  };
}

function gateFail(status: number, error: string) {
  return {
    ok: false,
    response: NextResponse.json({ ok: false, error }, { status }),
  };
}

function allowRate() {
  return {
    allowed: true,
    limit: 5,
    remaining: 4,
    reset_at: "2026-07-30T21:00:00.000Z",
  };
}

function denyRate(retry: number) {
  return {
    allowed: false,
    limit: 5,
    remaining: 0,
    reset_at: "2026-07-30T21:00:00.000Z",
    retry_after_seconds: retry,
  };
}

const VALID_BODY = { template: "atlassian", mode: "append" };
const USER = { id: "u-1", email: "founder@x.co" };

beforeEach(() => {
  gateMock.mockReset();
  supabaseInsertMock.mockReset();
  supabaseInsertMock.mockResolvedValue({ data: null, error: null });
  supabaseFromMock.mockClear();
  getSupabaseAdminMock.mockReset();
  getSupabaseAdminMock.mockReturnValue({ from: supabaseFromMock });
  getActiveProjectMock.mockReset();
  populateMock.mockReset();
  consumeRateLimitMock.mockReset();
});

describe("POST /api/dataroom/populate-from-template", () => {
  it("401s when the feature gate rejects (anonymous caller)", async () => {
    gateMock.mockResolvedValue(gateFail(401, "Authentication required"));
    const res = await POST(jsonReq(VALID_BODY));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Authentication required");
    expect(consumeRateLimitMock).not.toHaveBeenCalled();
    expect(populateMock).not.toHaveBeenCalled();
  });

  it("503s when the Supabase admin client is unavailable", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(jsonReq(VALID_BODY));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("supabase_unavailable");
    expect(populateMock).not.toHaveBeenCalled();
  });

  it("400 invalid_json on a body that is not JSON", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    const req = new Request("http://x/api/dataroom/populate-from-template", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "<not json>",
    }) as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_json");
    expect(populateMock).not.toHaveBeenCalled();
  });

  it("400 invalid_body when the schema rejects the payload", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    const res = await POST(jsonReq({ template: "atlassian" })); // mode missing
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_body");
    expect(body.detail).toBeDefined();
    expect(populateMock).not.toHaveBeenCalled();
  });

  it("400 template_not_implemented for a valid-but-unshipped template", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    const res = await POST(
      jsonReq({ template: "canva", mode: "append" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("template_not_implemented");
    expect(body.hint).toContain("atlassian");
    expect(consumeRateLimitMock).not.toHaveBeenCalled();
  });

  it("429 rate_limited passes through the retry_after and Retry-After header", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    consumeRateLimitMock.mockResolvedValue(denyRate(1234));
    const res = await POST(jsonReq(VALID_BODY));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("1234");
    const body = await res.json();
    expect(body.error).toBe("rate_limited");
    expect(body.limit).toBe(5);
    expect(body.retry_after_seconds).toBe(1234);
    expect(populateMock).not.toHaveBeenCalled();
  });

  it("passes the atlassian template sentinel + mapped mode into populateFromTemplate", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getActiveProjectMock.mockResolvedValue({ id: "proj-active" });
    populateMock.mockResolvedValue({
      ok: true,
      created: 3,
      updated: 0,
      skipped: 2,
      summary_by_phase: { "1": { count: 5, missing: 3, present: 2 } },
    });
    const res = await POST(jsonReq(VALID_BODY));
    expect(res.status).toBe(200);
    const [params] = populateMock.mock.calls[0];
    expect(params.userId).toBe("u-1");
    expect(params.email).toBe("founder@x.co");
    expect(params.template).toBe(templateSentinel);
    expect(params.mode).toBe("append");
    expect(params.projectId).toBe("proj-active");
  });

  it("uses project_id from the body when supplied and skips getActiveProject", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    populateMock.mockResolvedValue({
      ok: true,
      created: 0,
      updated: 0,
      skipped: 0,
      summary_by_phase: {},
    });
    const projectId = "c0ffee00-1234-4abc-8def-abcdef012345";
    const res = await POST(
      jsonReq({ ...VALID_BODY, project_id: projectId }),
    );
    expect(res.status).toBe(200);
    expect(getActiveProjectMock).not.toHaveBeenCalled();
    const [params] = populateMock.mock.calls[0];
    expect(params.projectId).toBe(projectId);
  });

  it("dry_run returns the preview from populateFromTemplate", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getActiveProjectMock.mockResolvedValue(null);
    populateMock.mockResolvedValue({
      ok: true,
      created: 0,
      updated: 0,
      skipped: 0,
      summary_by_phase: {},
      preview: [{ category: "Vision", title: "Deck", phaseSlug: "1" }],
    });
    const res = await POST(
      jsonReq({ template: "atlassian", mode: "dry_run" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.preview).toEqual([
      { category: "Vision", title: "Deck", phaseSlug: "1" },
    ]);
    const [params] = populateMock.mock.calls[0];
    expect(params.mode).toBe("dry_run");
    expect(params.projectId).toBeNull();
  });

  it("fires a best-effort analytics_events audit with the populate summary", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getActiveProjectMock.mockResolvedValue({ id: "proj-a" });
    populateMock.mockResolvedValue({
      ok: true,
      created: 7,
      updated: 1,
      skipped: 4,
      summary_by_phase: {},
    });
    const res = await POST(jsonReq(VALID_BODY));
    expect(res.status).toBe(200);
    expect(supabaseFromMock).toHaveBeenCalledWith("analytics_events");
    expect(supabaseInsertMock).toHaveBeenCalledTimes(1);
    const [payload] = supabaseInsertMock.mock.calls[0];
    expect(payload).toMatchObject({
      user_id: "u-1",
      event_name: "dataroom.populate_from_template",
      params: {
        template: "atlassian",
        mode: "append",
        project_id: "proj-a",
        ok: true,
        created: 7,
        updated: 1,
        skipped: 4,
      },
    });
  });

  it("swallows analytics_events insert failures without failing the request", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getActiveProjectMock.mockResolvedValue(null);
    supabaseInsertMock.mockRejectedValueOnce(new Error("audit table missing"));
    populateMock.mockResolvedValue({
      ok: true,
      created: 1,
      updated: 0,
      skipped: 0,
      summary_by_phase: {},
    });
    const res = await POST(jsonReq(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.created).toBe(1);
  });

  it("returns 500 when populateFromTemplate reports ok:false and stamps the audit with created=0", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getActiveProjectMock.mockResolvedValue(null);
    populateMock.mockResolvedValue({
      ok: false,
      error: "fetch_failed",
      detail: "boom",
    });
    const res = await POST(jsonReq(VALID_BODY));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("fetch_failed");
    expect(body.detail).toBe("boom");
    // Audit still fires and records created=0 on failure.
    expect(supabaseInsertMock).toHaveBeenCalledTimes(1);
    const [payload] = supabaseInsertMock.mock.calls[0];
    expect(payload.params).toMatchObject({ ok: false, created: 0, skipped: 0 });
  });

  it("uses the correct rate-limit bucket + window + actor id", async () => {
    gateMock.mockResolvedValue(gateOk(USER));
    consumeRateLimitMock.mockResolvedValue(allowRate());
    getActiveProjectMock.mockResolvedValue(null);
    populateMock.mockResolvedValue({
      ok: true,
      created: 0,
      updated: 0,
      skipped: 0,
      summary_by_phase: {},
    });
    await POST(jsonReq(VALID_BODY));
    expect(consumeRateLimitMock).toHaveBeenCalledTimes(1);
    const [opts] = consumeRateLimitMock.mock.calls[0];
    expect(opts).toEqual({
      bucket: "dataroom.populate",
      actorId: "u-1",
      limit: 5,
      windowSeconds: 3600,
    });
  });
});
