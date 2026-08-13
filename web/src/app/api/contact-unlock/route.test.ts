// Colocated vitest for POST + OPTIONS /api/contact-unlock — P9-contact-unlock-route-test.
//
// /api/contact-unlock (T_SVI_EXC_0005) is the verified-investor → founder intro
// endpoint powering the Startup Value Index "Contact founder" CTA on the public
// listings page. It is one of two surfaces where an investor account can reach
// a founder's inbox (the other is the weekly-digest watchlist recap), so the
// authorization envelope has to be tight — a regression here would either
//
//   (a) leak a founder's email address to an unverified caller, or
//   (b) silently drop the CORS headers the cross-origin startupvalueindex.com
//       shell needs to actually read the JSON body.
//
// This suite pins the behaviour a silent regression could break:
//
//   1. `dynamic === "force-dynamic"` — the per-caller auth check must never
//      prerender into a static shell (a static "ok:true" body would grant
//      every anon caller a free intro).
//   2. POST 401 when no session — the "Sign in required" hint plus the CORS
//      envelope (browsers otherwise swallow the error string).
//   3. POST 500 when getSupabaseAdmin() returns null — never crash, never
//      500-with-html, and still stamp CORS so the client sees "DB unavailable".
//   4. POST 403 "Investor accounts only" when the app_users row is missing
//      entirely (deleted account race) OR the row exists but the caller is
//      neither `segment=investor_angel`/`investor_vc` NOR the legacy
//      `account_type=investor` fallback (pre-0073 rows). Regressing either
//      side of the OR would break one of the two live investor cohorts.
//   5. POST 403 "pending verification" when verified_at IS NULL — an
//      unverified investor must NEVER reach a founder inbox, even though the
//      account_type gate passed.
//   6. POST 400 on malformed JSON body — the try/catch around req.json()
//      returns "Invalid JSON" instead of throwing a 500.
//   7. POST 400 "Invalid ticker" when the ticker doesn't match the
//      `^[A-Z]{1,8}-[A-Z0-9]{1,8}$` regex — the ticker is echoed into the
//      outbound email subject so a regex loosening would open an injection
//      surface into the mail body.
//   8. POST 400 "Invalid ticker" tolerates lowercase input and whitespace —
//      the route uppercases + trims before validation, so `" acme-x1 "`
//      passes but `"acme_x"` (bad delimiter) fails.
//   9. POST 404 "Could not resolve founder" when the slug lookup returns no
//      analysis (or no email on the analysis) — never confirm slug existence
//      to a caller with no downstream permission.
//  10. POST 404 when the slug parameter is omitted entirely — the founderEmail
//      resolution branch guards against a missing slug.
//  11. POST 403 "founder has not opened their inbox" when the founder_profiles
//      row is missing OR contactable_by_investors=false — the founder opt-in
//      is authoritative, never soft-gated.
//  12. POST inserts into contact_unlock_requests with the exact
//      {investor_id, founder_email, ticker, slug, message} shape and
//      message → null coercion when the caller submits an empty string.
//  13. POST sends the intro email to the FOUNDER (not the investor) with the
//      canonical subject "Verified investor {fromName} wants to chat about
//      {ticker}" and HTML-escapes the user-supplied message body (a raw
//      `<script>` in the message must render as `&lt;script&gt;`).
//  14. POST uses investor_firm to render the "from <b>{firm}</b>" fragment
//      when set, and omits it entirely when null (never renders a naked
//      "from" preposition).
//  15. POST falls back from display_name → email for the {fromName} slot when
//      the investor has no display_name yet.
//  16. POST truncates message to 1500 chars and slug to 100 chars — the DB
//      columns are bounded and a mega-payload must not blow the row.
//  17. POST 200 happy path returns `{ ok: true }` and stamps the
//      startupvalueindex.com CORS allow-origin + allow-credentials.
//  18. OPTIONS returns 204 (NOT 200) with allow-origin=startupvalueindex.com,
//      allow-methods containing POST+OPTIONS, and allow-headers containing
//      Content-Type. A CDN caches 200 preflights in a different slot.
//  19. Every non-2xx response carries the same startupvalueindex.com CORS
//      envelope — cross-origin fetchers otherwise see "network error" instead
//      of the actual "Sign in required" / "Invalid ticker" / etc string.
//  20. Ticker uppercasing is applied BEFORE validation AND is what lands in
//      the outbound email subject and the DB row — so a caller who submits
//      `"acme-x1"` must see `ACME-X1` echoed both places.
//
// All three collaborators (getCurrentUser, getSupabaseAdmin, sendEmail) are
// mocked; the supabase fake is a small in-memory client that captures each
// `.from(table)` call so the insert payload and the founder-lookup chain are
// assertable per-test.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

// ─── getCurrentUser stub ─────────────────────────────────────────────
const getCurrentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

// ─── sendEmail stub ──────────────────────────────────────────────────
type EmailPayload = { to: string; subject: string; html: string };
const sendEmailMock = vi.fn<(payload: EmailPayload) => Promise<void>>();
vi.mock("@/lib/email", () => ({
  sendEmail: (payload: EmailPayload) => sendEmailMock(payload),
}));

// ─── getSupabaseAdmin stub ───────────────────────────────────────────
// The route hits three tables in sequence:
//   1. app_users            (select account_type/segment/verified_at/...)
//   2. svi_analyses         (select email by slug)
//   3. founder_profiles     (select contactable_by_investors/full_name)
//   4. contact_unlock_requests (insert the intro request)
//
// We build a per-test fake that lets each spec inject the row each table
// returns and captures the insert payload on contact_unlock_requests.

type Row = Record<string, unknown> | null;

interface SbState {
  appUserRow: Row;
  sviRow: Row;
  founderRow: Row;
  insertCaptured?: unknown;
  insertError?: { message: string } | null;
}

function makeSupabase(state: SbState) {
  return {
    from: vi.fn((table: string) => {
      if (table === "app_users") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: state.appUserRow }),
            }),
          }),
        };
      }
      if (table === "svi_analyses") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: state.sviRow }),
            }),
          }),
        };
      }
      if (table === "founder_profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: state.founderRow }),
            }),
          }),
        };
      }
      if (table === "contact_unlock_requests") {
        return {
          insert: vi.fn().mockImplementation((payload: unknown) => {
            state.insertCaptured = payload;
            return Promise.resolve({ error: state.insertError ?? null });
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
  };
}

const getSupabaseAdminMock = vi.fn<() => ReturnType<typeof makeSupabase> | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

// ─── import under test ───────────────────────────────────────────────
import { POST, OPTIONS, dynamic } from "./route";

// ─── fixtures ────────────────────────────────────────────────────────
const CORS_ORIGIN = "https://startupvalueindex.com";

const INVESTOR = {
  id: "inv-1",
  email: "angel@example.com",
};

const INVESTOR_ROW_ANGEL_VERIFIED = {
  account_type: "individual",
  segment: "investor_angel",
  verified_at: "2026-05-01T00:00:00.000Z",
  investor_firm: "Angel Capital",
  display_name: "Ada Angel",
  email: INVESTOR.email,
};

const INVESTOR_ROW_LEGACY_VERIFIED = {
  account_type: "investor",
  segment: null,
  verified_at: "2026-05-01T00:00:00.000Z",
  investor_firm: null,
  display_name: null,
  email: INVESTOR.email,
};

const FOUNDER_EMAIL = "founder@startup.com.au";

const SVI_ANALYSIS_ROW = { email: FOUNDER_EMAIL };

const FOUNDER_ROW_OPTED_IN = {
  contactable_by_investors: true,
  full_name: "Fiona Founder",
};

const DEFAULT_STATE: SbState = {
  appUserRow: INVESTOR_ROW_ANGEL_VERIFIED,
  sviRow: SVI_ANALYSIS_ROW,
  founderRow: FOUNDER_ROW_OPTED_IN,
};

function state(overrides: Partial<SbState> = {}): SbState {
  return { ...DEFAULT_STATE, ...overrides };
}

function postReq(
  body: unknown,
  opts: { badJson?: boolean } = {},
): NextRequest {
  return new Request("http://localhost/api/contact-unlock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts.badJson ? "{not-json" : JSON.stringify(body),
  }) as unknown as NextRequest;
}

const OK_BODY = {
  ticker: "ACME-X1",
  slug: "acme-corp",
  message: "Loved your traction — would love to chat.",
};

beforeEach(() => {
  getCurrentUserMock.mockReset();
  sendEmailMock.mockReset();
  getSupabaseAdminMock.mockReset();

  getCurrentUserMock.mockResolvedValue(INVESTOR);
  sendEmailMock.mockResolvedValue(undefined);
  getSupabaseAdminMock.mockReturnValue(makeSupabase(state()));
});

// ─── module contract ────────────────────────────────────────────────

describe("/api/contact-unlock — module contract", () => {
  it('exports dynamic = "force-dynamic" so per-caller auth never prerenders into a static shell', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// ─── auth gate ───────────────────────────────────────────────────────

describe("POST — auth gate", () => {
  it("401 'Sign in required' + CORS envelope when no session", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(postReq(OK_BODY));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body).toEqual({ ok: false, error: "Sign in required" });
    expect(res.headers.get("access-control-allow-origin")).toBe(CORS_ORIGIN);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    // Never touch downstream services on the unauth branch.
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("500 'DB unavailable' + CORS envelope when getSupabaseAdmin() is null (misconfigured env)", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(postReq(OK_BODY));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body).toEqual({ ok: false, error: "DB unavailable" });
    expect(res.headers.get("access-control-allow-origin")).toBe(CORS_ORIGIN);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

// ─── investor entitlement gate ──────────────────────────────────────

describe("POST — investor entitlement gate", () => {
  it("403 'Investor accounts only' when the app_users row is missing entirely (deleted-account race)", async () => {
    getSupabaseAdminMock.mockReturnValue(makeSupabase(state({ appUserRow: null })));
    const res = await POST(postReq(OK_BODY));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Investor accounts only");
    expect(res.headers.get("access-control-allow-origin")).toBe(CORS_ORIGIN);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("403 when segment is a non-investor value AND legacy account_type is not 'investor'", async () => {
    const row = { ...INVESTOR_ROW_ANGEL_VERIFIED, segment: "founder", account_type: "individual" };
    getSupabaseAdminMock.mockReturnValue(makeSupabase(state({ appUserRow: row })));
    const res = await POST(postReq(OK_BODY));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("Investor accounts only");
  });

  it("ALLOWS segment='investor_angel' (post-0073 rows)", async () => {
    // Default fixture is investor_angel — verify it reaches the happy path.
    const res = await POST(postReq(OK_BODY));
    expect(res.status).toBe(200);
  });

  it("ALLOWS segment='investor_vc' (post-0073 rows)", async () => {
    const row = { ...INVESTOR_ROW_ANGEL_VERIFIED, segment: "investor_vc" };
    getSupabaseAdminMock.mockReturnValue(makeSupabase(state({ appUserRow: row })));
    const res = await POST(postReq(OK_BODY));
    expect(res.status).toBe(200);
  });

  it("ALLOWS legacy account_type='investor' rows with a NULL segment (pre-0073 rows)", async () => {
    getSupabaseAdminMock.mockReturnValue(
      makeSupabase(state({ appUserRow: INVESTOR_ROW_LEGACY_VERIFIED })),
    );
    const res = await POST(postReq(OK_BODY));
    expect(res.status).toBe(200);
  });

  it("403 'pending verification' when the investor row exists but verified_at IS NULL", async () => {
    const row = { ...INVESTOR_ROW_ANGEL_VERIFIED, verified_at: null };
    getSupabaseAdminMock.mockReturnValue(makeSupabase(state({ appUserRow: row })));
    const res = await POST(postReq(OK_BODY));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("pending verification");
    expect(res.headers.get("access-control-allow-origin")).toBe(CORS_ORIGIN);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

// ─── body parsing + ticker regex ─────────────────────────────────────

describe("POST — body parsing + ticker validation", () => {
  it("400 'Invalid JSON' when the body is not parseable JSON (never bubble the parse error)", async () => {
    const res = await POST(postReq(null, { badJson: true }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid JSON");
    expect(res.headers.get("access-control-allow-origin")).toBe(CORS_ORIGIN);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("400 'Invalid ticker' when the ticker doesn't match ^[A-Z]{1,8}-[A-Z0-9]{1,8}$", async () => {
    const res = await POST(postReq({ ...OK_BODY, ticker: "ACME_X1" })); // underscore is not the delimiter
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("Invalid ticker");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("400 'Invalid ticker' when the ticker is missing entirely", async () => {
    const res = await POST(postReq({ slug: "acme-corp", message: "hi" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("Invalid ticker");
  });

  it("accepts lowercase + surrounding whitespace by uppercasing + trimming BEFORE regex validation", async () => {
    const res = await POST(postReq({ ...OK_BODY, ticker: "  acme-x1  " }));
    expect(res.status).toBe(200);
  });

  it("normalised (uppercased+trimmed) ticker is what lands in the outbound email subject", async () => {
    await POST(postReq({ ...OK_BODY, ticker: "acme-x1" }));
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const payload = sendEmailMock.mock.calls[0][0];
    expect(payload.subject).toContain("ACME-X1");
    expect(payload.subject).not.toContain("acme-x1");
  });

  it("normalised ticker is what lands in the contact_unlock_requests row", async () => {
    const st = state();
    getSupabaseAdminMock.mockReturnValue(makeSupabase(st));
    await POST(postReq({ ...OK_BODY, ticker: "acme-x1" }));
    expect((st.insertCaptured as { ticker: string }).ticker).toBe("ACME-X1");
  });
});

// ─── founder resolution ─────────────────────────────────────────────

describe("POST — founder resolution", () => {
  it("404 'Could not resolve founder' when slug is omitted from the payload (no lookup possible)", async () => {
    const res = await POST(postReq({ ticker: "ACME-X1", message: "hi" }));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Could not resolve founder");
    expect(res.headers.get("access-control-allow-origin")).toBe(CORS_ORIGIN);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("404 when the slug lookup returns no analysis row", async () => {
    getSupabaseAdminMock.mockReturnValue(makeSupabase(state({ sviRow: null })));
    const res = await POST(postReq(OK_BODY));
    expect(res.status).toBe(404);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("404 when the slug lookup returns a row but the email column is null (never send to '')", async () => {
    getSupabaseAdminMock.mockReturnValue(makeSupabase(state({ sviRow: { email: null } })));
    const res = await POST(postReq(OK_BODY));
    expect(res.status).toBe(404);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("403 'has not opened their inbox' when the founder_profiles row is missing", async () => {
    getSupabaseAdminMock.mockReturnValue(makeSupabase(state({ founderRow: null })));
    const res = await POST(postReq(OK_BODY));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toContain("has not opened their inbox");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("403 when the founder row exists but contactable_by_investors=false (opt-in is authoritative)", async () => {
    getSupabaseAdminMock.mockReturnValue(
      makeSupabase(state({ founderRow: { contactable_by_investors: false, full_name: "F F" } })),
    );
    const res = await POST(postReq(OK_BODY));
    expect(res.status).toBe(403);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

// ─── insert into contact_unlock_requests ─────────────────────────────

describe("POST — contact_unlock_requests insert", () => {
  it("inserts the exact {investor_id, founder_email, ticker, slug, message} shape on the happy path", async () => {
    const st = state();
    getSupabaseAdminMock.mockReturnValue(makeSupabase(st));
    const res = await POST(postReq(OK_BODY));
    expect(res.status).toBe(200);
    expect(st.insertCaptured).toEqual({
      investor_id: INVESTOR.id,
      founder_email: FOUNDER_EMAIL,
      ticker: "ACME-X1",
      slug: "acme-corp",
      message: OK_BODY.message,
    });
  });

  it("coerces an empty-string message to NULL in the insert payload (empty is not a message)", async () => {
    const st = state();
    getSupabaseAdminMock.mockReturnValue(makeSupabase(st));
    await POST(postReq({ ...OK_BODY, message: "   " })); // whitespace-only, trimmed to ""
    expect((st.insertCaptured as { message: string | null }).message).toBeNull();
  });

  it("truncates a mega-message to 1500 chars before insert (DB column is bounded)", async () => {
    const st = state();
    getSupabaseAdminMock.mockReturnValue(makeSupabase(st));
    const long = "a".repeat(3000);
    await POST(postReq({ ...OK_BODY, message: long }));
    expect(((st.insertCaptured as { message: string }).message).length).toBe(1500);
  });

  it("truncates a mega-slug to 100 chars before insert", async () => {
    const st = state();
    getSupabaseAdminMock.mockReturnValue(makeSupabase(st));
    const longSlug = "s".repeat(500);
    // sviRow lookup uses the truncated slug, so we still need a hit — the
    // supabase fake returns the fixed sviRow regardless of slug.
    await POST(postReq({ ...OK_BODY, slug: longSlug }));
    expect(((st.insertCaptured as { slug: string }).slug).length).toBe(100);
  });
});

// ─── outbound intro email ───────────────────────────────────────────

describe("POST — outbound intro email", () => {
  it("sends the email TO the founder (not the investor)", async () => {
    await POST(postReq(OK_BODY));
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].to).toBe(FOUNDER_EMAIL);
    expect(sendEmailMock.mock.calls[0][0].to).not.toBe(INVESTOR.email);
  });

  it("subject follows 'Verified investor {fromName} wants to chat about {ticker}' with display_name preferred", async () => {
    await POST(postReq(OK_BODY));
    const payload = sendEmailMock.mock.calls[0][0];
    expect(payload.subject).toBe(
      `Verified investor ${INVESTOR_ROW_ANGEL_VERIFIED.display_name} wants to chat about ACME-X1`,
    );
  });

  it("falls back from display_name → email for the {fromName} slot when display_name is null", async () => {
    const row = { ...INVESTOR_ROW_ANGEL_VERIFIED, display_name: null };
    getSupabaseAdminMock.mockReturnValue(makeSupabase(state({ appUserRow: row })));
    await POST(postReq(OK_BODY));
    const payload = sendEmailMock.mock.calls[0][0];
    expect(payload.subject).toBe(
      `Verified investor ${INVESTOR.email} wants to chat about ACME-X1`,
    );
  });

  it("renders the 'from <strong>{firm}</strong>' fragment when investor_firm is set", async () => {
    await POST(postReq(OK_BODY));
    const payload = sendEmailMock.mock.calls[0][0];
    expect(payload.html).toContain("from <strong>Angel Capital</strong>");
  });

  it("omits the 'from …' fragment entirely when investor_firm is null (no naked 'from' preposition)", async () => {
    getSupabaseAdminMock.mockReturnValue(
      makeSupabase(state({ appUserRow: INVESTOR_ROW_LEGACY_VERIFIED })),
    );
    await POST(postReq(OK_BODY));
    const payload = sendEmailMock.mock.calls[0][0];
    expect(payload.html).not.toContain("<strong>");
    // The " from " phrase must not appear as a dangling preposition.
    expect(payload.html).not.toMatch(/\sfrom\s+is\s+interested/);
  });

  it("HTML-escapes < and > in the user-supplied message body (never lets an injected <script> render)", async () => {
    await POST(postReq({ ...OK_BODY, message: "hi <script>alert(1)</script>" }));
    const payload = sendEmailMock.mock.calls[0][0];
    expect(payload.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(payload.html).not.toContain("<script>alert(1)</script>");
  });

  it("omits the quoted-message block entirely when the caller submits no message (never render an empty blockquote)", async () => {
    await POST(postReq({ ticker: "ACME-X1", slug: "acme-corp", message: "" }));
    const payload = sendEmailMock.mock.calls[0][0];
    expect(payload.html).not.toContain("<blockquote");
  });

  it("uses the investor's own email in the mailto: reply-to link (founder replies land in the investor's inbox)", async () => {
    await POST(postReq(OK_BODY));
    const payload = sendEmailMock.mock.calls[0][0];
    expect(payload.html).toContain(`mailto:${INVESTOR.email}`);
  });
});

// ─── happy path envelope ────────────────────────────────────────────

describe("POST — happy path envelope", () => {
  it("returns 200 {ok:true} with the startupvalueindex.com CORS + credentials envelope", async () => {
    const res = await POST(postReq(OK_BODY));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body).toEqual({ ok: true });
    expect(res.headers.get("access-control-allow-origin")).toBe(CORS_ORIGIN);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });
});

// ─── OPTIONS preflight ──────────────────────────────────────────────

describe("OPTIONS — CORS preflight", () => {
  it("returns 204 (not 200) so CDNs cache the preflight in the preflight-only slot", async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
  });

  it("stamps allow-origin = startupvalueindex.com (NOT '*' — the shell needs credentials)", async () => {
    const res = await OPTIONS();
    expect(res.headers.get("access-control-allow-origin")).toBe(CORS_ORIGIN);
  });

  it("stamps allow-credentials = true so the cross-origin session cookie is included", async () => {
    const res = await OPTIONS();
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("stamps allow-methods containing POST + OPTIONS so browsers accept the actual fetch", async () => {
    const res = await OPTIONS();
    const methods = res.headers.get("access-control-allow-methods") ?? "";
    expect(methods).toMatch(/POST/);
    expect(methods).toMatch(/OPTIONS/);
  });

  it("stamps allow-headers containing Content-Type so browsers accept the JSON payload", async () => {
    const res = await OPTIONS();
    const headers = res.headers.get("access-control-allow-headers") ?? "";
    expect(headers).toMatch(/Content-Type/);
  });

  it("returns an empty body (preflight responses must not carry a payload)", async () => {
    const res = await OPTIONS();
    const text = await res.text();
    expect(text).toBe("");
  });
});
