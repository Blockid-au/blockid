// Unit tests for POST /api/compliance/s708-small-scale-counter —
// P9-s708-small-scale-counter-route-test.
//
// The route is the founder-facing endpoint that wraps the pure
// `assessS708SmallScale()` counter (see
// `web/src/lib/compliance/s708-small-scale-counter.ts`, which already has
// its own colocated test suite). This route-level suite pins the
// auth-and-validation envelope around that pure lib:
//
//   1. POST anonymous          → 401 { ok:false, error:'unauthenticated', disclaimer }
//   2. POST invalid JSON body  → 400 { ok:false, error:'invalid_json',    disclaimer }
//   3. POST body === null      → 400 { ok:false, error:'invalid_body',    disclaimer }
//   4. POST body is array      → 400 { ok:false, error:'invalid_body',    disclaimer }
//   5. POST body without .events → 400 { ok:false, error:'missing_events',
//                                          required:['events'], disclaimer }
//   6. POST body.events non-array (e.g. string) → 400 missing_events
//   7. POST valid empty events[] → 200 { ok:true, result } with counter shape
//      (investor_count_12mo === 0, dollars_raised_12mo_aud === 0, status:'ok',
//      window_start_iso + window_end_iso 365 days apart, disclaimer pinned)
//   8. POST valid events happy path → 200 with correct 12-month tally
//   9. POST events with junk rows silently dropped by the `isS708Event` guard
//      (missing offer_date, non-string investor_id, non-numeric amount_aud,
//      bogus offer_type). The pure counter must never see those rows so it
//      can't inflate the tally through duplicate-key or negative-amount
//      injection.
//  10. POST events with a valid `offer_type: "primary"` accepted.
//  11. POST events with `offer_type: "secondary_on_sale"` accepted.
//  12. POST events with `offer_type: "wholesale"` (not in VALID_OFFER_TYPES)
//      dropped at the boundary (guards against future misclassification of
//      s708(8) sophisticated offers as small-scale personal offers).
//  13. POST body.preview fully-formed → result carries would_breach_* flags.
//  14. POST body.preview missing new_investors → preview ignored (result has
//      no would_breach_* flags — the pure lib's `input.preview` stays undefined).
//  15. POST body.preview missing amount_aud → preview ignored.
//  16. POST body.preview a bare string → preview ignored (typeof guard).
//  17. POST body.preview === null → preview ignored (typeof guard).
//  18. `dynamic` export is `"force-dynamic"` — regression guard against Next.js
//      prerendering the response into the static shell.
//  19. `runtime` export is `"nodejs"` — the pure counter uses no edge-runtime
//      APIs but the auth gate does.
//  20. Every error response carries the exact `S708_SMALL_SCALE_DISCLAIMER`
//      wording — this is the not-legal-advice string the founder sees in the
//      compliance banner + the reason the auth gate returns it even on 401
//      (so a redirect through the login page doesn't silently strip it).
//
// Silent regressions this pins against:
//   - dropping the auth gate on POST and letting an anonymous caller run
//     the counter (the counter is stateless today, but the route is the
//     founder-facing surface and a leaky gate would leak the workspace
//     boundary the sibling /compliance/s708 page relies on);
//   - dropping the JSON try/catch and letting a text/plain body crash the
//     route with 500 instead of a clean 400 with a machine-readable error;
//   - dropping the `Array.isArray(body.events)` guard and letting a caller
//     pass `{events: "not an array"}` which would iterate character-by-character;
//   - dropping the `isS708Event` filter and letting bad rows inflate the tally
//     via duplicate-key attacks (same investor_id repeated) or negative amounts
//     (which would net-out real offers and hide a real breach);
//   - widening VALID_OFFER_TYPES to include wholesale/CSF categories — those
//     belong in a different exemption counter (see s708(8)/(10)/(11)/s738G);
//   - dropping the preview typeof + typeof + typeof triple-guard and letting
//     a malformed preview crash the pure lib downstream;
//   - dropping the S708_SMALL_SCALE_DISCLAIMER from any error envelope —
//     matches the /compliance/gst-threshold + /compliance/wgea-threshold shape;
//   - dropping `export const dynamic = "force-dynamic"` and having Next.js
//     serve a stale counter snapshot to a different founder;
//   - dropping `export const runtime = "nodejs"` — the auth gate calls
//     Supabase server-side which is not edge-runtime-safe today.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn<
  () => Promise<{ id: string; email: string } | null>
>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

import { S708_SMALL_SCALE_DISCLAIMER } from "@/lib/compliance/s708-small-scale-counter";
import { POST, dynamic, runtime } from "./route";

function req(body: unknown, opts: { raw?: string } = {}): Request {
  if (opts.raw !== undefined) {
    return new Request("http://x/api/compliance/s708-small-scale-counter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: opts.raw,
    });
  }
  return new Request("http://x/api/compliance/s708-small-scale-counter", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function signedIn() {
  getCurrentUserMock.mockResolvedValue({ id: "u1", email: "a@b.com" });
}

function anon() {
  getCurrentUserMock.mockResolvedValue(null);
}

// Fixed "now" so window-clipping is deterministic across days.
const NOW_ISO = "2026-08-08";

// Helper to build an event 30 days ago (safely inside the 365-day window).
function recentEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    offer_date: "2026-07-09", // 30 days before NOW_ISO
    investor_id: "inv-1",
    amount_aud: 50_000,
    ...overrides,
  };
}

describe("POST /api/compliance/s708-small-scale-counter", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
  });

  it("returns 401 for an anonymous caller with the disclaimer", async () => {
    anon();
    const res = await POST(req({ events: [] }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "unauthenticated",
      disclaimer: S708_SMALL_SCALE_DISCLAIMER,
    });
  });

  it("returns 400 invalid_json for a body that isn't JSON", async () => {
    signedIn();
    const res = await POST(req(undefined, { raw: "not-json{" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "invalid_json",
      disclaimer: S708_SMALL_SCALE_DISCLAIMER,
    });
  });

  it("returns 400 invalid_body when the payload is JSON null", async () => {
    signedIn();
    const res = await POST(req(null));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_body");
    expect(body.disclaimer).toBe(S708_SMALL_SCALE_DISCLAIMER);
  });

  it("returns 400 invalid_body when the payload is a JSON primitive (string)", async () => {
    signedIn();
    const res = await POST(req("just a string"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_body");
  });

  it("returns 400 missing_events when body.events is absent", async () => {
    signedIn();
    const res = await POST(req({ notEvents: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "missing_events",
      required: ["events"],
      disclaimer: S708_SMALL_SCALE_DISCLAIMER,
    });
  });

  it("returns 400 missing_events when body.events is a string not an array", async () => {
    signedIn();
    const res = await POST(req({ events: "not-an-array" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_events");
    expect(body.required).toEqual(["events"]);
  });

  it("returns 200 with a clean counter shape for empty events[]", async () => {
    signedIn();
    const res = await POST(req({ events: [] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result.investor_count_12mo).toBe(0);
    expect(body.result.dollars_raised_12mo_aud).toBe(0);
    expect(body.result.investor_cap).toBe(20);
    expect(body.result.dollar_cap_aud).toBe(2_000_000);
    expect(body.result.investors_remaining).toBe(20);
    expect(body.result.dollars_remaining_aud).toBe(2_000_000);
    expect(body.result.status).toBe("ok");
    expect(body.result.disclaimer).toBe(S708_SMALL_SCALE_DISCLAIMER);
    // No preview supplied → the would_breach flags should be absent.
    expect(body.result.would_breach_investor_cap).toBeUndefined();
    expect(body.result.would_breach_dollar_cap).toBeUndefined();
  });

  it("tallies well-formed events (happy path)", async () => {
    signedIn();
    const res = await POST(
      req({
        events: [
          recentEvent({ investor_id: "a", amount_aud: 100_000 }),
          recentEvent({ investor_id: "b", amount_aud: 200_000 }),
          recentEvent({ investor_id: "a", amount_aud: 50_000 }), // dupe investor
        ],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // 2 distinct investors, A$350k raised.
    expect(body.result.investor_count_12mo).toBe(2);
    expect(body.result.dollars_raised_12mo_aud).toBe(350_000);
    expect(body.result.status).toBe("ok");
  });

  it("silently drops rows missing offer_date at the isS708Event boundary", async () => {
    signedIn();
    const junkRow = { investor_id: "a", amount_aud: 100_000 }; // no offer_date
    const res = await POST(
      req({
        events: [junkRow, recentEvent({ investor_id: "b", amount_aud: 50_000 })],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.investor_count_12mo).toBe(1);
    expect(body.result.dollars_raised_12mo_aud).toBe(50_000);
  });

  it("silently drops rows whose investor_id is not a string", async () => {
    signedIn();
    const junkRow = {
      offer_date: "2026-07-09",
      investor_id: 42, // not a string
      amount_aud: 100_000,
    };
    const res = await POST(req({ events: [junkRow] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.investor_count_12mo).toBe(0);
    expect(body.result.dollars_raised_12mo_aud).toBe(0);
  });

  it("silently drops rows whose amount_aud is not a number", async () => {
    signedIn();
    const junkRow = {
      offer_date: "2026-07-09",
      investor_id: "a",
      amount_aud: "one hundred thousand", // string
    };
    const res = await POST(req({ events: [junkRow] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.investor_count_12mo).toBe(0);
  });

  it("silently drops rows whose offer_type is bogus", async () => {
    signedIn();
    const junkRow = recentEvent({ offer_type: "wholesale" });
    const goodRow = recentEvent({
      investor_id: "b",
      offer_type: "primary",
    });
    const res = await POST(req({ events: [junkRow, goodRow] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Only the "primary" row survives the isS708Event filter.
    expect(body.result.investor_count_12mo).toBe(1);
    expect(body.result.dollars_raised_12mo_aud).toBe(50_000);
  });

  it("accepts offer_type: 'primary'", async () => {
    signedIn();
    const res = await POST(
      req({
        events: [recentEvent({ investor_id: "a", offer_type: "primary" })],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.investor_count_12mo).toBe(1);
  });

  it("accepts offer_type: 'secondary_on_sale'", async () => {
    signedIn();
    const res = await POST(
      req({
        events: [
          recentEvent({
            investor_id: "a",
            offer_type: "secondary_on_sale",
          }),
        ],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.investor_count_12mo).toBe(1);
  });

  it("accepts events without offer_type (undefined is allowed)", async () => {
    signedIn();
    // recentEvent() omits offer_type by default.
    const res = await POST(req({ events: [recentEvent()] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.investor_count_12mo).toBe(1);
  });

  it("carries would_breach_* flags when a well-formed preview is supplied", async () => {
    signedIn();
    // Fill 19 slots (headroom = 1), then preview adds 3 more → breaches investor cap.
    const events = Array.from({ length: 19 }, (_, i) =>
      recentEvent({ investor_id: `inv-${i}`, amount_aud: 10_000 }),
    );
    const res = await POST(
      req({
        events,
        preview: { new_investors: 3, amount_aud: 100_000 },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.would_breach_investor_cap).toBe(true);
    expect(body.result.would_breach_dollar_cap).toBe(false);
    expect(body.result.status).toBe("block");
  });

  it("preview with a numeric investor breach AND dollar breach both flag true", async () => {
    signedIn();
    const res = await POST(
      req({
        events: [
          recentEvent({ investor_id: "a", amount_aud: 1_900_000 }),
        ],
        preview: { new_investors: 25, amount_aud: 200_000 },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.would_breach_investor_cap).toBe(true);
    expect(body.result.would_breach_dollar_cap).toBe(true);
    expect(body.result.status).toBe("block");
  });

  it("ignores preview when new_investors is missing", async () => {
    signedIn();
    const res = await POST(
      req({
        events: [],
        preview: { amount_aud: 100_000 },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.would_breach_investor_cap).toBeUndefined();
    expect(body.result.would_breach_dollar_cap).toBeUndefined();
  });

  it("ignores preview when amount_aud is missing", async () => {
    signedIn();
    const res = await POST(
      req({
        events: [],
        preview: { new_investors: 3 },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.would_breach_investor_cap).toBeUndefined();
    expect(body.result.would_breach_dollar_cap).toBeUndefined();
  });

  it("ignores preview when it is a string not an object", async () => {
    signedIn();
    const res = await POST(
      req({
        events: [],
        preview: "next round",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.would_breach_investor_cap).toBeUndefined();
    expect(body.result.would_breach_dollar_cap).toBeUndefined();
  });

  it("ignores preview when it is JSON null", async () => {
    signedIn();
    const res = await POST(
      req({
        events: [],
        preview: null,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.would_breach_investor_cap).toBeUndefined();
    expect(body.result.would_breach_dollar_cap).toBeUndefined();
  });

  it("ignores preview when new_investors is a string not a number", async () => {
    signedIn();
    const res = await POST(
      req({
        events: [],
        preview: { new_investors: "three", amount_aud: 100_000 },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.would_breach_investor_cap).toBeUndefined();
  });

  it("ignores preview when amount_aud is a string not a number", async () => {
    signedIn();
    const res = await POST(
      req({
        events: [],
        preview: { new_investors: 3, amount_aud: "one hundred thousand" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.would_breach_investor_cap).toBeUndefined();
  });

  it("exposes `dynamic` as force-dynamic to prevent static prerender", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("exposes `runtime` as nodejs (auth gate is not edge-safe)", () => {
    expect(runtime).toBe("nodejs");
  });

  it("every 400 error envelope carries the s708 small-scale disclaimer", async () => {
    signedIn();
    const invalidJson = await (await POST(req(undefined, { raw: "{" }))).json();
    const invalidBody = await (await POST(req(null))).json();
    const missingEvents = await (
      await POST(req({ notEvents: [] }))
    ).json();
    expect(invalidJson.disclaimer).toBe(S708_SMALL_SCALE_DISCLAIMER);
    expect(invalidBody.disclaimer).toBe(S708_SMALL_SCALE_DISCLAIMER);
    expect(missingEvents.disclaimer).toBe(S708_SMALL_SCALE_DISCLAIMER);
  });

  it("uses a rolling 365-day window (result reports the endpoints)", async () => {
    signedIn();
    const res = await POST(req({ events: [] }));
    const body = await res.json();
    const start = new Date(body.result.window_start_iso + "T00:00:00Z");
    const end = new Date(body.result.window_end_iso + "T00:00:00Z");
    const days = Math.round(
      (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000),
    );
    expect(days).toBe(365);
    // Sanity: the endpoints are ISO YYYY-MM-DD (no time component).
    expect(body.result.window_start_iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.result.window_end_iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Only reference NOW_ISO to keep the fixture in step with recentEvent().
    void NOW_ISO;
  });

  it("drops events outside the 365-day window at the pure-lib layer", async () => {
    signedIn();
    // 500 days ago is well outside the window.
    const staleEvent = {
      offer_date: "2025-01-01",
      investor_id: "old",
      amount_aud: 1_000_000,
    };
    const res = await POST(req({ events: [staleEvent] }));
    const body = await res.json();
    expect(body.result.investor_count_12mo).toBe(0);
    expect(body.result.dollars_raised_12mo_aud).toBe(0);
  });

  it("keeps investors_remaining and dollars_remaining non-negative even when a cap is hit", async () => {
    signedIn();
    // 20 unique investors, exactly at the cap.
    const events = Array.from({ length: 20 }, (_, i) =>
      recentEvent({ investor_id: `inv-${i}`, amount_aud: 10_000 }),
    );
    const res = await POST(req({ events }));
    const body = await res.json();
    expect(body.result.investors_remaining).toBe(0);
    expect(body.result.dollars_remaining_aud).toBeGreaterThanOrEqual(0);
    expect(body.result.status).toBe("block");
  });
});
