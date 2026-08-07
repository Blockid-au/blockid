// Colocated vitest for GET + POST /api/branding — P9-branding-route-test.
//
// The route is the founder's single source of truth for the report/PDF brand
// (logo + primary/accent colours + report header + footer text). It sits in
// front of two very different surfaces:
//
//   - GET  is unauthenticated-callable at the auth layer only in the sense
//     that anon → 401; behind the auth wall it is a read-your-own-brand
//     endpoint. It must ALWAYS hand the /branding form a renderable object,
//     which means: null Supabase → `{ settings: null }` (the form falls
//     back to defaults on the client), no row → `{ settings: null }`, and
//     stored row → camelCased projection with default hex colours for any
//     null column so the /branding <input type="color"> pickers never
//     render the empty string ("").
//
//   - POST is feature-gated at `pdf_branding` (Growth+/Scale/Enterprise —
//     see web/src/lib/feature-gates.manifest.ts:74 + entitlements.ts:48).
//     A gate rejection MUST be returned verbatim — the route must NOT
//     re-derive auth or re-derive the 402 shape, or free-tier founders
//     could bypass the paywall by hitting the endpoint directly. The upsert
//     stamps the payload with `user_id` from the gate's authenticated user
//     (NEVER from the request body), applies default hex colours when the
//     body sends nulls, sets `updated_at` to a fresh ISO timestamp, and
//     uses onConflict:"user_id" so the row is unique-per-founder.
//
// Silent regressions this suite pins against:
//
//   - Dropping the GET auth guard would let anon callers read every
//     founder's brand row via /api/branding without a cookie.
//   - Returning `{ settings: null }` with an outer `ok: false` on the
//     "no supabase" or "no row" branches would break the /branding form's
//     load — it expects `ok:true` before it reads `settings`.
//   - Reordering the `data.primary_color ?? "#2563eb"` default so an empty
//     string leaks into <input type="color">, which then renders black in
//     the picker and silently overwrites the founder's saved colour on the
//     next save.
//   - Regressing the POST feature-gate call so a free-tier founder can
//     upsert `brand_settings` and bypass the pdf_branding paywall. The gate
//     rejection response must be returned verbatim (401 for anon, 402 for
//     locked) so the client can route to /pricing?feature=pdf_branding
//     without a second server hop.
//   - Trusting `user_id` from the body instead of `gate.user.id` — that
//     would let a paying Growth founder overwrite ANOTHER founder's brand
//     row by POSTing `{ user_id: "other" }`.
//   - Regressing the JSON-parse `catch` so a malformed body 500s the
//     /branding form instead of returning the documented 400.
//   - Losing the `updated_at: new Date().toISOString()` stamp so
//     `brand_settings.updated_at` never advances and the cache invalidator
//     on the PDF renderer keeps serving a stale logo forever.
//   - Losing the `onConflict: "user_id"` upsert hint — the upsert would
//     then insert a duplicate row on every save and the GET `.maybeSingle()`
//     would 500 with `PGRST116` ("more than one row returned").
//   - Regressing the 500-on-error branch so a Supabase failure returns 200
//     and the /branding form's "Saved ✓" toast lies to the founder.
//   - Losing the 503 branch when `getSupabaseAdmin()` returns null so the
//     save handler 500s with a stack trace instead of the documented
//     503 `{ error: "Service unavailable" }` shape.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// --- Types --------------------------------------------------------------

interface AppUser {
  id: string;
  email: string;
}

interface BrandRow {
  logo_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
  report_header: string | null;
  footer_text: string | null;
}

interface UpsertPayload {
  user_id: string;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  report_header: string;
  footer_text: string;
  updated_at: string;
}

interface UpsertOptions {
  onConflict?: string;
}

interface FakeSupabaseState {
  selectRow: BrandRow | null;
  upsertError: { message: string } | null;
  captured: {
    fromCalls: string[];
    selectCols: string[];
    eqPairs: Array<{ col: string; val: unknown }>;
    upserts: Array<{ payload: UpsertPayload; opts: UpsertOptions | undefined }>;
  };
}

// --- Mocks (registered BEFORE route import) -------------------------------

const mocks = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn<() => Promise<AppUser | null>>(),
  gateRequireFeatureMock: vi.fn(),
  getSupabaseAdminMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUserMock(),
}));

vi.mock("@/lib/feature-gate", () => ({
  gateRequireFeature: (feature: string) => mocks.gateRequireFeatureMock(feature),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdminMock(),
}));

import { GET, POST, dynamic } from "./route";

// --- Helpers --------------------------------------------------------------

function makeFakeSupabase(): { client: unknown; state: FakeSupabaseState } {
  const state: FakeSupabaseState = {
    selectRow: null,
    upsertError: null,
    captured: {
      fromCalls: [],
      selectCols: [],
      eqPairs: [],
      upserts: [],
    },
  };

  const client = {
    from(table: string) {
      state.captured.fromCalls.push(table);
      return {
        select(cols: string) {
          state.captured.selectCols.push(cols);
          return {
            eq(col: string, val: unknown) {
              state.captured.eqPairs.push({ col, val });
              return {
                maybeSingle: async () => ({ data: state.selectRow }),
              };
            },
          };
        },
        upsert(payload: UpsertPayload, opts?: UpsertOptions) {
          state.captured.upserts.push({ payload, opts });
          return Promise.resolve({ error: state.upsertError });
        },
      };
    },
  };

  return { client, state };
}

function jsonPost(body: unknown, contentType = "application/json"): NextRequest {
  return new Request("http://localhost/api/branding", {
    method: "POST",
    headers: { "content-type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

function gateOk(user: AppUser) {
  return {
    ok: true,
    user,
    uwp: { id: user.id, plan: "growth", segment: "founder" },
  };
}

function gateFail(status: number, error: string, extra: Record<string, unknown> = {}) {
  return {
    ok: false,
    response: NextResponse.json({ ok: false, error, ...extra }, { status }),
  };
}

beforeEach(() => {
  mocks.getCurrentUserMock.mockReset();
  mocks.gateRequireFeatureMock.mockReset();
  mocks.getSupabaseAdminMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// --------------------------------------------------------------------------
describe("dynamic export", () => {
  it("forces dynamic — brand settings must never be pinned to a build-time cache", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// --------------------------------------------------------------------------
describe("GET /api/branding", () => {
  it("returns 401 when unauthenticated — anon must NEVER read a brand row", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Unauthorized" });
    // supabase must not be touched when auth fails
    expect(mocks.getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns { ok:true, settings:null } when Supabase is unavailable (config gap)", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "f@x.com" });
    mocks.getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    // The outer ok:true is load-bearing — the /branding form reads it
    // before deciding to render defaults on the client.
    expect(body).toEqual({ ok: true, settings: null });
  });

  it("returns { ok:true, settings:null } when no brand row exists for the user", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    state.selectRow = null;
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, settings: null });
  });

  it("queries the brand_settings table by user_id (never trusts any header/query)", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-auth", email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    state.selectRow = null;
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    await GET();
    expect(state.captured.fromCalls).toEqual(["brand_settings"]);
    // Pin the column projection so a future .select("*") doesn't ship the
    // whole row (including any future service-only columns) to the client.
    expect(state.captured.selectCols).toEqual([
      "logo_url, primary_color, accent_color, report_header, footer_text",
    ]);
    expect(state.captured.eqPairs).toEqual([{ col: "user_id", val: "u-auth" }]);
  });

  it("maps a stored row to camelCase and preserves non-null values verbatim", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    state.selectRow = {
      logo_url: "https://cdn/logo.png",
      primary_color: "#111111",
      accent_color: "#222222",
      report_header: "Acme Reports",
      footer_text: "© Acme",
    };
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      settings: {
        logoUrl: "https://cdn/logo.png",
        primaryColor: "#111111",
        accentColor: "#222222",
        reportHeader: "Acme Reports",
        footerText: "© Acme",
      },
    });
  });

  it("defaults primary_color to #2563eb when the stored column is null", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    state.selectRow = {
      logo_url: null,
      primary_color: null,
      accent_color: "#222222",
      report_header: "hdr",
      footer_text: "ftr",
    };
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    const body = await (await GET()).json();
    expect(body.settings.primaryColor).toBe("#2563eb");
    // Non-null accent must be preserved (no accidental double-defaulting)
    expect(body.settings.accentColor).toBe("#222222");
  });

  it("defaults accent_color to #f59e0b when the stored column is null", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    state.selectRow = {
      logo_url: null,
      primary_color: "#111111",
      accent_color: null,
      report_header: "hdr",
      footer_text: "ftr",
    };
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    const body = await (await GET()).json();
    expect(body.settings.accentColor).toBe("#f59e0b");
    expect(body.settings.primaryColor).toBe("#111111");
  });

  it("defaults reportHeader + footerText to empty string when stored columns are null", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    state.selectRow = {
      logo_url: null,
      primary_color: null,
      accent_color: null,
      report_header: null,
      footer_text: null,
    };
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    const body = await (await GET()).json();
    expect(body.settings.reportHeader).toBe("");
    expect(body.settings.footerText).toBe("");
  });

  it("preserves a null logoUrl verbatim (no coercion — the UI must render 'no logo')", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "f@x.com" });
    const { client, state } = makeFakeSupabase();
    state.selectRow = {
      logo_url: null,
      primary_color: "#111111",
      accent_color: "#222222",
      report_header: "hdr",
      footer_text: "ftr",
    };
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    const body = await (await GET()).json();
    // Only explicit null is expected — pins against a `?? ""` default that
    // would tell the /branding form there IS a logo when there isn't.
    expect(body.settings.logoUrl).toBeNull();
  });
});

// --------------------------------------------------------------------------
describe("POST /api/branding", () => {
  it("delegates auth + entitlement to gateRequireFeature('pdf_branding')", async () => {
    mocks.gateRequireFeatureMock.mockResolvedValue(gateFail(401, "Authentication required"));
    await POST(jsonPost({}));
    expect(mocks.gateRequireFeatureMock).toHaveBeenCalledTimes(1);
    expect(mocks.gateRequireFeatureMock).toHaveBeenCalledWith("pdf_branding");
  });

  it("returns the gate's 401 response verbatim when unauthenticated", async () => {
    const gateResponse = gateFail(401, "Authentication required");
    mocks.gateRequireFeatureMock.mockResolvedValue(gateResponse);
    const res = await POST(jsonPost({ logoUrl: "https://x/y.png" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Authentication required" });
    // Supabase must NOT be reached when the gate rejects
    expect(mocks.getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns the gate's 402 feature_locked response verbatim for free-tier callers", async () => {
    mocks.gateRequireFeatureMock.mockResolvedValue(
      gateFail(402, "feature_locked", { feature: "pdf_branding", reason: "plan_below" }),
    );
    const res = await POST(jsonPost({ logoUrl: "https://x/y.png" }));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "feature_locked",
      feature: "pdf_branding",
      reason: "plan_below",
    });
    expect(mocks.getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid JSON — must NOT 500 the /branding form", async () => {
    mocks.gateRequireFeatureMock.mockResolvedValue(gateOk({ id: "u-1", email: "f@x.com" }));
    const req = new Request("http://localhost/api/branding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ not json",
    }) as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "Invalid JSON" });
    expect(mocks.getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 503 when Supabase is unavailable (config gap) — never crashes", async () => {
    mocks.gateRequireFeatureMock.mockResolvedValue(gateOk({ id: "u-1", email: "f@x.com" }));
    mocks.getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(jsonPost({ logoUrl: "https://x/y.png" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "Service unavailable" });
  });

  it("stamps user_id from the gate's authenticated user — never trusts the body", async () => {
    mocks.gateRequireFeatureMock.mockResolvedValue(gateOk({ id: "u-real", email: "real@x.com" }));
    const { client, state } = makeFakeSupabase();
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    await POST(jsonPost({
      user_id: "u-forged",
      logoUrl: "https://x/y.png",
    }));
    expect(state.captured.upserts).toHaveLength(1);
    expect(state.captured.upserts[0]!.payload.user_id).toBe("u-real");
  });

  it("passes through logo/header/footer/colour values verbatim when supplied", async () => {
    mocks.gateRequireFeatureMock.mockResolvedValue(gateOk({ id: "u-1", email: "f@x.com" }));
    const { client, state } = makeFakeSupabase();
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    await POST(jsonPost({
      logoUrl: "https://cdn/logo.png",
      primaryColor: "#123456",
      accentColor: "#abcdef",
      reportHeader: "Report Header",
      footerText: "Footer Text",
    }));
    const p = state.captured.upserts[0]!.payload;
    expect(p.logo_url).toBe("https://cdn/logo.png");
    expect(p.primary_color).toBe("#123456");
    expect(p.accent_color).toBe("#abcdef");
    expect(p.report_header).toBe("Report Header");
    expect(p.footer_text).toBe("Footer Text");
  });

  it("defaults primary_color to #2563eb when the body omits it", async () => {
    mocks.gateRequireFeatureMock.mockResolvedValue(gateOk({ id: "u-1", email: "f@x.com" }));
    const { client, state } = makeFakeSupabase();
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    await POST(jsonPost({ logoUrl: "https://x/y.png" }));
    expect(state.captured.upserts[0]!.payload.primary_color).toBe("#2563eb");
  });

  it("defaults accent_color to #f59e0b when the body omits it", async () => {
    mocks.gateRequireFeatureMock.mockResolvedValue(gateOk({ id: "u-1", email: "f@x.com" }));
    const { client, state } = makeFakeSupabase();
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    await POST(jsonPost({ logoUrl: "https://x/y.png" }));
    expect(state.captured.upserts[0]!.payload.accent_color).toBe("#f59e0b");
  });

  it("defaults primary_color to #2563eb when the body sends null (nullish-coalescing)", async () => {
    mocks.gateRequireFeatureMock.mockResolvedValue(gateOk({ id: "u-1", email: "f@x.com" }));
    const { client, state } = makeFakeSupabase();
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    await POST(jsonPost({ primaryColor: null, accentColor: null }));
    const p = state.captured.upserts[0]!.payload;
    expect(p.primary_color).toBe("#2563eb");
    expect(p.accent_color).toBe("#f59e0b");
  });

  it("nulls logo_url when body omits logoUrl (?? null) so the row is not left undefined", async () => {
    mocks.gateRequireFeatureMock.mockResolvedValue(gateOk({ id: "u-1", email: "f@x.com" }));
    const { client, state } = makeFakeSupabase();
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    await POST(jsonPost({}));
    expect(state.captured.upserts[0]!.payload.logo_url).toBeNull();
  });

  it("defaults report_header + footer_text to empty string when omitted", async () => {
    mocks.gateRequireFeatureMock.mockResolvedValue(gateOk({ id: "u-1", email: "f@x.com" }));
    const { client, state } = makeFakeSupabase();
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    await POST(jsonPost({}));
    const p = state.captured.upserts[0]!.payload;
    expect(p.report_header).toBe("");
    expect(p.footer_text).toBe("");
  });

  it("stamps updated_at with a fresh ISO timestamp on every save", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T12:34:56.000Z"));
    mocks.gateRequireFeatureMock.mockResolvedValue(gateOk({ id: "u-1", email: "f@x.com" }));
    const { client, state } = makeFakeSupabase();
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    await POST(jsonPost({ logoUrl: "https://x/y.png" }));
    expect(state.captured.upserts[0]!.payload.updated_at).toBe("2026-08-07T12:34:56.000Z");
  });

  it("uses upsert onConflict:'user_id' — guarantees one row per founder", async () => {
    mocks.gateRequireFeatureMock.mockResolvedValue(gateOk({ id: "u-1", email: "f@x.com" }));
    const { client, state } = makeFakeSupabase();
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    await POST(jsonPost({ logoUrl: "https://x/y.png" }));
    expect(state.captured.upserts[0]!.opts).toEqual({ onConflict: "user_id" });
    // And the write MUST target brand_settings (never a mislabelled sibling table)
    expect(state.captured.fromCalls).toEqual(["brand_settings"]);
  });

  it("returns 500 when the upsert fails — the /branding toast must NOT lie 'Saved ✓'", async () => {
    mocks.gateRequireFeatureMock.mockResolvedValue(gateOk({ id: "u-1", email: "f@x.com" }));
    const { client, state } = makeFakeSupabase();
    state.upsertError = { message: "constraint violation" };
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    // Silence the console.error the route emits on failure so the test log
    // stays clean; the route contract is what matters, not the log line.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(jsonPost({ logoUrl: "https://x/y.png" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "Failed to save" });
    expect(errSpy).toHaveBeenCalled();
  });

  it("returns 200 { ok:true } on a clean upsert — never leaks the row back to the client", async () => {
    mocks.gateRequireFeatureMock.mockResolvedValue(gateOk({ id: "u-1", email: "f@x.com" }));
    const { client } = makeFakeSupabase();
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    const res = await POST(jsonPost({ logoUrl: "https://x/y.png" }));
    expect(res.status).toBe(200);
    // Response body is deliberately minimal — the /branding form re-fetches
    // via GET after a save so anything leaked here is dead weight (and a
    // potential future info-leak vector). Pinning the shape prevents drift.
    expect(await res.json()).toEqual({ ok: true });
  });

  it("treats a null-body (JSON.parse === null) as an empty object — never crashes destructuring", async () => {
    // The route destructures `(body as Record<string, string | null>) ?? {}`.
    // Sending literal JSON `null` used to crash old handlers before the `?? {}`
    // fallback landed. Pin the fallback so a legacy client cannot 500 the form.
    mocks.gateRequireFeatureMock.mockResolvedValue(gateOk({ id: "u-1", email: "f@x.com" }));
    const { client, state } = makeFakeSupabase();
    mocks.getSupabaseAdminMock.mockReturnValue(client);
    const req = new Request("http://localhost/api/branding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "null",
    }) as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(200);
    const p = state.captured.upserts[0]!.payload;
    // All fields must land on their documented defaults
    expect(p.logo_url).toBeNull();
    expect(p.primary_color).toBe("#2563eb");
    expect(p.accent_color).toBe("#f59e0b");
    expect(p.report_header).toBe("");
    expect(p.footer_text).toBe("");
  });
});
