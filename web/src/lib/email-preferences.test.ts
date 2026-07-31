import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Colocated vitest for the previously-untested server-only
// `email-preferences.ts` — the P7 weekly-digest / consent surface that
// gates every automated marketing/nurture email BlockID sends. The lib is
// safety-critical: a silent regression here can either (a) leak
// unsubscribed users back into a nurture cohort (APP 3 + Spam Act 2003
// s16 "consent" breach), (b) let `payment_receipts` be silently disabled
// (transactional-email obligation under s16(5)(a)), or (c) blow the
// daily-1-marketing-email cap and get the domain shadow-banned. The tests
// pin the exact filter shapes, payload shapes, and short-circuits the
// downstream cron + Stripe-webhook + weekly-digest callers depend on.
//
// The fake Supabase covers the six chain shapes this module walks:
//   .from().select().eq().maybeSingle()             ← get* by (email|token)
//   .from().insert().select().single()               ← ensure insert
//   .from().update().eq()                            ← updatePreferences,
//                                                     unsubscribeCategoryByToken
//   .from().update().eq().select().maybeSingle()     ← unsubscribeByToken
//   .from().select(cols,{count,head}).eq().gte().in()← canSendMarketingToday
//   .from().select(cols,{count,head}).eq().eq()      ← emailSendChecklist dedup

interface CapturedEq {
  col: string;
  val: unknown;
}

interface CapturedCall {
  table: string;
  selectCols: string | null;
  selectOpts: Record<string, unknown> | null;
  insertPayload: Record<string, unknown> | null;
  updatePayload: Record<string, unknown> | null;
  eqs: CapturedEq[];
  gte: Array<{ col: string; val: unknown }>;
  in: Array<{ col: string; vals: unknown[] }>;
  terminal: "single" | "maybeSingle" | "await" | null;
}

interface FakeState {
  adminConfigured: boolean;
  queue: Array<{ data?: unknown; error?: unknown; count?: number | null }>;
  calls: CapturedCall[];
}

const state: FakeState = {
  adminConfigured: true,
  queue: [],
  calls: [],
};

function nextResponse(): { data: unknown; error: unknown; count: number | null } {
  const next = state.queue.shift() ?? {};
  return {
    data: next.data ?? null,
    error: next.error ?? null,
    count: next.count ?? null,
  };
}

function makeChain(table: string) {
  const op: CapturedCall = {
    table,
    selectCols: null,
    selectOpts: null,
    insertPayload: null,
    updatePayload: null,
    eqs: [],
    gte: [],
    in: [],
    terminal: null,
  };
  state.calls.push(op);

  const chain: Record<string, unknown> = {};
  chain.select = (cols?: string, opts?: Record<string, unknown>) => {
    op.selectCols = cols ?? null;
    op.selectOpts = opts ?? null;
    return chain;
  };
  chain.insert = (payload: Record<string, unknown>) => {
    op.insertPayload = payload;
    return chain;
  };
  chain.update = (payload: Record<string, unknown>) => {
    op.updatePayload = payload;
    return chain;
  };
  chain.eq = (col: string, val: unknown) => {
    op.eqs.push({ col, val });
    return chain;
  };
  chain.gte = (col: string, val: unknown) => {
    op.gte.push({ col, val });
    return chain;
  };
  chain.in = (col: string, vals: unknown[]) => {
    op.in.push({ col, vals });
    return chain;
  };
  chain.single = () => {
    op.terminal = "single";
    return Promise.resolve(nextResponse());
  };
  chain.maybeSingle = () => {
    op.terminal = "maybeSingle";
    return Promise.resolve(nextResponse());
  };
  chain.then = (
    onFulfilled: (v: unknown) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => {
    op.terminal = op.terminal ?? "await";
    return Promise.resolve(nextResponse()).then(onFulfilled, onRejected);
  };
  return chain;
}

vi.mock("server-only", () => ({}));

vi.mock("./supabase", () => ({
  getSupabaseAdmin: () => {
    if (!state.adminConfigured) return null;
    return {
      from: (table: string) => makeChain(table),
    };
  },
}));

const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

beforeEach(() => {
  state.adminConfigured = true;
  state.queue = [];
  state.calls = [];
  errorSpy.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

function callsFor(table: string): CapturedCall[] {
  return state.calls.filter((c) => c.table === table);
}

// ---------------------------------------------------------------------------
// getUnsubscribeUrl / getPreferencesUrl — pure URL builders
// ---------------------------------------------------------------------------

describe("email-preferences — getUnsubscribeUrl", () => {
  it("falls back to https://blockid.au when NEXT_PUBLIC_SITE_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const { getUnsubscribeUrl } = await import("./email-preferences");
    expect(getUnsubscribeUrl("tok-abc")).toBe("https://blockid.au/unsubscribe?token=tok-abc");
  });

  it("strips a single trailing slash off NEXT_PUBLIC_SITE_URL so URLs never double-slash", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.blockid.au/";
    const { getUnsubscribeUrl } = await import("./email-preferences");
    expect(getUnsubscribeUrl("tok-abc")).toBe(
      "https://staging.blockid.au/unsubscribe?token=tok-abc",
    );
  });

  it("appends &category=<cat> when a category is provided so the unsubscribe page can pre-select", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au";
    const { getUnsubscribeUrl } = await import("./email-preferences");
    expect(getUnsubscribeUrl("tok-1", "weekly_reports")).toBe(
      "https://blockid.au/unsubscribe?token=tok-1&category=weekly_reports",
    );
  });

  it("omits category when passed as undefined", async () => {
    const { getUnsubscribeUrl } = await import("./email-preferences");
    expect(getUnsubscribeUrl("tok-1", undefined)).toBe(
      "https://blockid.au/unsubscribe?token=tok-1",
    );
  });
});

describe("email-preferences — getPreferencesUrl", () => {
  it("returns the ?manage=1 URL under the default host when env is unset", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const { getPreferencesUrl } = await import("./email-preferences");
    expect(getPreferencesUrl("tok-xyz")).toBe(
      "https://blockid.au/unsubscribe?token=tok-xyz&manage=1",
    );
  });

  it("respects a custom NEXT_PUBLIC_SITE_URL with trailing slash stripped", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://preview.blockid.au/";
    const { getPreferencesUrl } = await import("./email-preferences");
    expect(getPreferencesUrl("tok-xyz")).toBe(
      "https://preview.blockid.au/unsubscribe?token=tok-xyz&manage=1",
    );
  });
});

// ---------------------------------------------------------------------------
// getEmailPreferences
// ---------------------------------------------------------------------------

describe("email-preferences — getEmailPreferences", () => {
  it("returns null when no supabase admin is configured (no throw, no DB call)", async () => {
    state.adminConfigured = false;
    const { getEmailPreferences } = await import("./email-preferences");
    const res = await getEmailPreferences("a@b.co");
    expect(res).toBeNull();
    expect(state.calls).toHaveLength(0);
  });

  it("lowercases + trims the email before the eq filter (so `  A@B.co  ` matches `a@b.co`)", async () => {
    state.queue.push({ data: { email: "a@b.co", weekly_reports: true } });
    const { getEmailPreferences } = await import("./email-preferences");
    await getEmailPreferences("  A@B.co  ");
    const [call] = callsFor("email_preferences");
    expect(call.eqs).toEqual([{ col: "email", val: "a@b.co" }]);
    expect(call.terminal).toBe("maybeSingle");
  });

  it("selects the full preference row shape (all 8 columns the callers destructure)", async () => {
    state.queue.push({ data: null });
    const { getEmailPreferences } = await import("./email-preferences");
    await getEmailPreferences("a@b.co");
    const [call] = callsFor("email_preferences");
    // Regression guard: dropping a column silently would break unsubscribe UI.
    expect(call.selectCols).toContain("email");
    expect(call.selectCols).toContain("weekly_reports");
    expect(call.selectCols).toContain("product_updates");
    expect(call.selectCols).toContain("promotions");
    expect(call.selectCols).toContain("svi_alerts");
    expect(call.selectCols).toContain("payment_receipts");
    expect(call.selectCols).toContain("unsubscribed_all");
    expect(call.selectCols).toContain("unsubscribe_token");
  });

  it("returns null + logs on error (never throws)", async () => {
    state.queue.push({ error: { message: "boom" } });
    const { getEmailPreferences } = await import("./email-preferences");
    const res = await getEmailPreferences("a@b.co");
    expect(res).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      "[blockid:email-prefs] getEmailPreferences failed",
      { message: "boom" },
    );
  });

  it("returns the mapped preferences row on happy path", async () => {
    state.queue.push({
      data: {
        email: "a@b.co",
        weekly_reports: false,
        product_updates: true,
        promotions: false,
        svi_alerts: true,
        payment_receipts: true,
        unsubscribed_all: false,
        unsubscribe_token: "tok-xyz",
      },
    });
    const { getEmailPreferences } = await import("./email-preferences");
    const res = await getEmailPreferences("a@b.co");
    expect(res?.unsubscribe_token).toBe("tok-xyz");
    expect(res?.svi_alerts).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ensureEmailPreferences
// ---------------------------------------------------------------------------

describe("email-preferences — ensureEmailPreferences", () => {
  it("returns '' when no admin is configured (no throw)", async () => {
    state.adminConfigured = false;
    const { ensureEmailPreferences } = await import("./email-preferences");
    const tok = await ensureEmailPreferences("a@b.co");
    expect(tok).toBe("");
    expect(state.calls).toHaveLength(0);
  });

  it("returns the existing token without insert when the row already exists", async () => {
    state.queue.push({ data: { unsubscribe_token: "existing-tok" } });
    const { ensureEmailPreferences } = await import("./email-preferences");
    const tok = await ensureEmailPreferences("a@b.co");
    expect(tok).toBe("existing-tok");
    // Only the SELECT ran — no INSERT round-trip.
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0].insertPayload).toBeNull();
  });

  it("inserts a new row with normalised email + user_id when no row exists, returning the fresh token", async () => {
    state.queue.push({ data: null }); // pre-check miss
    state.queue.push({ data: { unsubscribe_token: "fresh-tok" } }); // insert
    const { ensureEmailPreferences } = await import("./email-preferences");
    const tok = await ensureEmailPreferences("  A@B.co ", "user-1");
    expect(tok).toBe("fresh-tok");
    const [precheck, insert] = state.calls;
    expect(precheck.selectCols).toBe("unsubscribe_token");
    expect(precheck.eqs).toEqual([{ col: "email", val: "a@b.co" }]);
    expect(insert.insertPayload).toEqual({ email: "a@b.co", user_id: "user-1" });
    expect(insert.selectCols).toBe("unsubscribe_token");
    expect(insert.terminal).toBe("single");
  });

  it("defaults user_id to null when the caller omits it (so email-only signups still get a preference row)", async () => {
    state.queue.push({ data: null });
    state.queue.push({ data: { unsubscribe_token: "fresh-tok" } });
    const { ensureEmailPreferences } = await import("./email-preferences");
    await ensureEmailPreferences("a@b.co");
    const insert = state.calls[1];
    expect(insert.insertPayload).toEqual({ email: "a@b.co", user_id: null });
  });

  it("recovers from a 23505 unique-violation race by re-reading the winning row's token", async () => {
    state.queue.push({ data: null }); // pre-check miss
    state.queue.push({ error: { code: "23505", message: "dup" } }); // insert loses race
    state.queue.push({ data: { unsubscribe_token: "winner-tok" } }); // recovery read
    const { ensureEmailPreferences } = await import("./email-preferences");
    const tok = await ensureEmailPreferences("a@b.co");
    expect(tok).toBe("winner-tok");
    expect(state.calls).toHaveLength(3);
  });

  it("returns '' + logs when the insert fails with a non-race error", async () => {
    state.queue.push({ data: null });
    state.queue.push({ error: { code: "42501", message: "rls denied" } });
    const { ensureEmailPreferences } = await import("./email-preferences");
    const tok = await ensureEmailPreferences("a@b.co");
    expect(tok).toBe("");
    expect(errorSpy).toHaveBeenCalledWith(
      "[blockid:email-prefs] ensureEmailPreferences failed",
      { code: "42501", message: "rls denied" },
    );
  });

  it("returns '' when the recovery read after 23505 yields no row (data race edge)", async () => {
    state.queue.push({ data: null });
    state.queue.push({ error: { code: "23505" } });
    state.queue.push({ data: null }); // recovery miss — should degrade to ""
    const { ensureEmailPreferences } = await import("./email-preferences");
    const tok = await ensureEmailPreferences("a@b.co");
    expect(tok).toBe("");
  });
});

// ---------------------------------------------------------------------------
// canSendEmail
// ---------------------------------------------------------------------------

describe("email-preferences — canSendEmail", () => {
  it("always returns true for payment_receipts (transactional — legally required, no DB read)", async () => {
    const { canSendEmail } = await import("./email-preferences");
    const ok = await canSendEmail("a@b.co", "payment_receipts");
    expect(ok).toBe(true);
    expect(state.calls).toHaveLength(0);
  });

  it("returns true when no preferences row exists (first-time user, opt-in default)", async () => {
    state.queue.push({ data: null });
    const { canSendEmail } = await import("./email-preferences");
    const ok = await canSendEmail("a@b.co", "weekly_reports");
    expect(ok).toBe(true);
  });

  it("returns false when unsubscribed_all is true (global opt-out beats category flag)", async () => {
    state.queue.push({
      data: {
        email: "a@b.co",
        weekly_reports: true,
        product_updates: true,
        promotions: true,
        svi_alerts: true,
        payment_receipts: true,
        unsubscribed_all: true,
        unsubscribe_token: "t",
      },
    });
    const { canSendEmail } = await import("./email-preferences");
    const ok = await canSendEmail("a@b.co", "weekly_reports");
    expect(ok).toBe(false);
  });

  it("returns the category-specific bool when unsubscribed_all is false", async () => {
    state.queue.push({
      data: {
        email: "a@b.co",
        weekly_reports: false,
        product_updates: true,
        promotions: false,
        svi_alerts: true,
        payment_receipts: true,
        unsubscribed_all: false,
        unsubscribe_token: "t",
      },
    });
    const { canSendEmail } = await import("./email-preferences");
    expect(await canSendEmail("a@b.co", "weekly_reports")).toBe(false);
    // Second call re-queries — top up the queue.
    state.queue.push({
      data: {
        email: "a@b.co",
        weekly_reports: false,
        product_updates: true,
        promotions: false,
        svi_alerts: true,
        payment_receipts: true,
        unsubscribed_all: false,
        unsubscribe_token: "t",
      },
    });
    expect(await canSendEmail("a@b.co", "product_updates")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// updateEmailPreferences
// ---------------------------------------------------------------------------

describe("email-preferences — updateEmailPreferences", () => {
  it("no-ops when no admin is configured", async () => {
    state.adminConfigured = false;
    const { updateEmailPreferences } = await import("./email-preferences");
    await updateEmailPreferences("a@b.co", { weekly_reports: false });
    expect(state.calls).toHaveLength(0);
  });

  it("strips payment_receipts from the update payload (never allow disabling transactional)", async () => {
    state.queue.push({}); // update ok
    const { updateEmailPreferences } = await import("./email-preferences");
    await updateEmailPreferences("a@b.co", {
      payment_receipts: false,
      weekly_reports: false,
    });
    const [call] = state.calls;
    expect(call.updatePayload).not.toHaveProperty("payment_receipts");
    expect(call.updatePayload).toMatchObject({ weekly_reports: false });
  });

  it("stamps updated_at with a fresh ISO timestamp on every call", async () => {
    state.queue.push({});
    const before = Date.now();
    const { updateEmailPreferences } = await import("./email-preferences");
    await updateEmailPreferences("a@b.co", { promotions: false });
    const after = Date.now();
    const call = state.calls[0];
    const stamp = call.updatePayload?.updated_at as string;
    expect(typeof stamp).toBe("string");
    const t = new Date(stamp).getTime();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);
  });

  it("filters by lowercase+trimmed email", async () => {
    state.queue.push({});
    const { updateEmailPreferences } = await import("./email-preferences");
    await updateEmailPreferences("  Foo@Bar.io  ", { svi_alerts: false });
    const [call] = state.calls;
    expect(call.eqs).toEqual([{ col: "email", val: "foo@bar.io" }]);
  });

  it("swallows an update error but logs it (does not throw)", async () => {
    state.queue.push({ error: { message: "boom" } });
    const { updateEmailPreferences } = await import("./email-preferences");
    await expect(
      updateEmailPreferences("a@b.co", { weekly_reports: false }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// unsubscribeByToken
// ---------------------------------------------------------------------------

describe("email-preferences — unsubscribeByToken", () => {
  it("returns { ok: false } without any DB call when no admin is configured", async () => {
    state.adminConfigured = false;
    const { unsubscribeByToken } = await import("./email-preferences");
    expect(await unsubscribeByToken("t")).toEqual({ ok: false });
  });

  it("stamps unsubscribed_all=true + updated_at and filters by unsubscribe_token", async () => {
    state.queue.push({ data: { email: "a@b.co" } });
    const { unsubscribeByToken } = await import("./email-preferences");
    const res = await unsubscribeByToken("tok-1");
    expect(res).toEqual({ ok: true, email: "a@b.co" });
    const [call] = state.calls;
    expect(call.updatePayload).toMatchObject({ unsubscribed_all: true });
    expect(call.updatePayload?.updated_at).toBeTypeOf("string");
    expect(call.eqs).toEqual([{ col: "unsubscribe_token", val: "tok-1" }]);
    expect(call.terminal).toBe("maybeSingle");
  });

  it("returns { ok: false } when the token matches no row (data null, no error)", async () => {
    state.queue.push({ data: null });
    const { unsubscribeByToken } = await import("./email-preferences");
    expect(await unsubscribeByToken("nope")).toEqual({ ok: false });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("returns { ok: false } on error path (never leaks the email)", async () => {
    state.queue.push({ error: { message: "boom" } });
    const { unsubscribeByToken } = await import("./email-preferences");
    const res = await unsubscribeByToken("tok-1");
    expect(res).toEqual({ ok: false });
    expect(res).not.toHaveProperty("email");
  });
});

// ---------------------------------------------------------------------------
// unsubscribeCategoryByToken
// ---------------------------------------------------------------------------

describe("email-preferences — unsubscribeCategoryByToken", () => {
  it("rejects payment_receipts without a DB call (transactional guard)", async () => {
    const { unsubscribeCategoryByToken } = await import("./email-preferences");
    expect(await unsubscribeCategoryByToken("tok", "payment_receipts")).toEqual({
      ok: false,
    });
    expect(state.calls).toHaveLength(0);
  });

  it("returns { ok: false } when no admin is configured", async () => {
    state.adminConfigured = false;
    const { unsubscribeCategoryByToken } = await import("./email-preferences");
    expect(await unsubscribeCategoryByToken("tok", "weekly_reports")).toEqual({
      ok: false,
    });
  });

  it("sets the category flag to false + updated_at, filtered by unsubscribe_token", async () => {
    state.queue.push({});
    const { unsubscribeCategoryByToken } = await import("./email-preferences");
    const res = await unsubscribeCategoryByToken("tok-1", "promotions");
    expect(res).toEqual({ ok: true });
    const [call] = state.calls;
    expect(call.updatePayload).toMatchObject({ promotions: false });
    expect(call.updatePayload?.updated_at).toBeTypeOf("string");
    expect(call.eqs).toEqual([{ col: "unsubscribe_token", val: "tok-1" }]);
  });

  it("returns { ok: false } + logs on update error", async () => {
    state.queue.push({ error: { message: "boom" } });
    const { unsubscribeCategoryByToken } = await import("./email-preferences");
    expect(await unsubscribeCategoryByToken("tok-1", "svi_alerts")).toEqual({
      ok: false,
    });
    expect(errorSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getPreferencesByToken
// ---------------------------------------------------------------------------

describe("email-preferences — getPreferencesByToken", () => {
  it("returns null without a DB call when no admin is configured", async () => {
    state.adminConfigured = false;
    const { getPreferencesByToken } = await import("./email-preferences");
    expect(await getPreferencesByToken("tok")).toBeNull();
  });

  it("filters by unsubscribe_token and reads the full preference row", async () => {
    state.queue.push({
      data: {
        email: "a@b.co",
        weekly_reports: true,
        product_updates: true,
        promotions: false,
        svi_alerts: true,
        payment_receipts: true,
        unsubscribed_all: false,
        unsubscribe_token: "tok-1",
      },
    });
    const { getPreferencesByToken } = await import("./email-preferences");
    const prefs = await getPreferencesByToken("tok-1");
    expect(prefs?.email).toBe("a@b.co");
    const [call] = state.calls;
    expect(call.eqs).toEqual([{ col: "unsubscribe_token", val: "tok-1" }]);
    expect(call.terminal).toBe("maybeSingle");
    expect(call.selectCols).toContain("unsubscribe_token");
  });

  it("returns null + logs on error path", async () => {
    state.queue.push({ error: { message: "boom" } });
    const { getPreferencesByToken } = await import("./email-preferences");
    expect(await getPreferencesByToken("tok")).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// canSendMarketingToday — the daily-1-marketing-email cap
// ---------------------------------------------------------------------------

describe("email-preferences — canSendMarketingToday", () => {
  it("returns true when no admin is configured (fail-open — Stripe receipt path must not deadlock)", async () => {
    state.adminConfigured = false;
    const { canSendMarketingToday } = await import("./email-preferences");
    expect(await canSendMarketingToday("a@b.co")).toBe(true);
  });

  it("uses select(id,{count:'exact',head:true}) so no rows are transferred", async () => {
    state.queue.push({ count: 0 });
    const { canSendMarketingToday } = await import("./email-preferences");
    await canSendMarketingToday("a@b.co");
    const [call] = state.calls;
    expect(call.selectCols).toBe("id");
    expect(call.selectOpts).toEqual({ count: "exact", head: true });
    expect(call.table).toBe("svi_notifications");
  });

  it("filters by lowercased+trimmed email and gte today-midnight-UTC", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T15:22:00Z"));
    state.queue.push({ count: 0 });
    const { canSendMarketingToday } = await import("./email-preferences");
    await canSendMarketingToday("  Foo@Bar.io  ");
    const [call] = state.calls;
    expect(call.eqs).toEqual([{ col: "email", val: "foo@bar.io" }]);
    expect(call.gte).toEqual([{ col: "created_at", val: "2026-07-31T00:00:00Z" }]);
  });

  it("scopes the .in() to the marketing/nurture notification_type union (never counts one-off transactional rows)", async () => {
    state.queue.push({ count: 0 });
    const { canSendMarketingToday } = await import("./email-preferences");
    await canSendMarketingToday("a@b.co");
    const [call] = state.calls;
    expect(call.in).toHaveLength(1);
    const vals = call.in[0].vals as string[];
    // Regression guard: dropping "weekly_digest" would let the digest cron
    // double-send on the same day (the exact incident the cap prevents).
    expect(vals).toContain("weekly_digest");
    expect(vals).toContain("nurture_free_d2");
    expect(vals).toContain("reengage_30d");
    expect(vals).toContain("low_credit");
    // Never nurture-cap a payment_receipts row.
    expect(vals).not.toContain("payment_receipts");
  });

  it("returns true when the day's marketing count is 0", async () => {
    state.queue.push({ count: 0 });
    const { canSendMarketingToday } = await import("./email-preferences");
    expect(await canSendMarketingToday("a@b.co")).toBe(true);
  });

  it("returns false at the 1-marketing-email cap (count === 1)", async () => {
    state.queue.push({ count: 1 });
    const { canSendMarketingToday } = await import("./email-preferences");
    expect(await canSendMarketingToday("a@b.co")).toBe(false);
  });

  it("returns true when count is null (coerces to 0 — no-throw on Supabase-count edge)", async () => {
    state.queue.push({ count: null });
    const { canSendMarketingToday } = await import("./email-preferences");
    expect(await canSendMarketingToday("a@b.co")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// emailSendChecklist — the pre-send gate every automated email hits
// ---------------------------------------------------------------------------

describe("email-preferences — emailSendChecklist", () => {
  it("returns user_unsubscribed when canSendEmail is false", async () => {
    state.queue.push({
      data: {
        email: "a@b.co",
        weekly_reports: true,
        product_updates: true,
        promotions: true,
        svi_alerts: true,
        payment_receipts: true,
        unsubscribed_all: true, // global opt-out
        unsubscribe_token: "t",
      },
    });
    const { emailSendChecklist } = await import("./email-preferences");
    const res = await emailSendChecklist("a@b.co", "weekly_reports");
    expect(res).toEqual({ ok: false, reason: "user_unsubscribed" });
  });

  it("returns daily_cap_reached when the daily cap is hit", async () => {
    state.queue.push({ data: null }); // canSendEmail — no prefs, ok
    state.queue.push({ count: 1 }); // canSendMarketingToday — cap hit
    const { emailSendChecklist } = await import("./email-preferences");
    const res = await emailSendChecklist("a@b.co", "weekly_reports");
    expect(res).toEqual({ ok: false, reason: "daily_cap_reached" });
  });

  it("skips the daily-cap check entirely for payment_receipts (transactional bypass)", async () => {
    // No canSendEmail DB read either (payment_receipts short-circuits inside
    // canSendEmail), so no rows should be enqueued.
    const { emailSendChecklist } = await import("./email-preferences");
    const res = await emailSendChecklist("a@b.co", "payment_receipts");
    expect(res).toEqual({ ok: true });
    expect(state.calls).toHaveLength(0);
  });

  it("returns already_sent when the notification_type dedup finds an existing row", async () => {
    state.queue.push({ data: null }); // canSendEmail — no prefs
    state.queue.push({ count: 0 }); // canSendMarketingToday — under cap
    state.queue.push({ count: 1 }); // dedup — row exists
    const { emailSendChecklist } = await import("./email-preferences");
    const res = await emailSendChecklist(
      "a@b.co",
      "weekly_reports",
      "weekly_digest",
    );
    expect(res).toEqual({ ok: false, reason: "already_sent" });
    // Dedup call shape: table svi_notifications, filter (email, notification_type).
    const dedupCall = state.calls[state.calls.length - 1];
    expect(dedupCall.table).toBe("svi_notifications");
    expect(dedupCall.eqs).toEqual([
      { col: "email", val: "a@b.co" },
      { col: "notification_type", val: "weekly_digest" },
    ]);
  });

  it("returns ok when all three gates pass (opt-in, under cap, not previously sent)", async () => {
    state.queue.push({ data: null });
    state.queue.push({ count: 0 });
    state.queue.push({ count: 0 });
    const { emailSendChecklist } = await import("./email-preferences");
    const res = await emailSendChecklist(
      "a@b.co",
      "weekly_reports",
      "weekly_digest",
    );
    expect(res).toEqual({ ok: true });
  });

  it("skips the dedup check entirely when no notificationType is provided", async () => {
    state.queue.push({ data: null }); // canSendEmail
    state.queue.push({ count: 0 }); // canSendMarketingToday
    const { emailSendChecklist } = await import("./email-preferences");
    const res = await emailSendChecklist("a@b.co", "weekly_reports");
    expect(res).toEqual({ ok: true });
    // Only the two upstream calls ran, no dedup round-trip.
    expect(state.calls).toHaveLength(2);
  });
});
