// Colocated vitest for GET /api/pitch-deck — P9-pitch-deck-route-test.
//
// The route is the single public entry point that generates and streams the
// BlockID Antler pitch deck PDF (12 landscape A4 slides, no auth). It is the
// URL we hand out on Twitter / LinkedIn / cold intros — every silent
// regression here shows up in a would-be investor's browser as either a
// broken download, a stalled tab, or a leaked stack trace.
//
// Silent regressions this suite pins against:
//
//   - Dropping the enforceRateLimit call, so a public flood of GETs can
//     stall the single-instance Node event loop on synchronous @react-pdf
//     renderToBuffer work (comment on line 14 of route.ts is explicit about
//     this — the guard IS the reason the route survives being public).
//   - Drifting the rate-limit key/args: bucket "pitch-deck-public" (used to
//     rank the limiter in the admin snapshot), null identity (public — no
//     user id/email; enforceRateLimit falls back to IP), max=20, window=1h.
//     Renaming the bucket detaches the admin snapshot; loosening 20/hr
//     re-opens the flood; tightening the window shortens the block.
//   - Passing the request object to enforceRateLimit — without it the
//     limiter cannot read cf-connecting-ip / x-forwarded-for and every
//     caller collapses to "anon", meaning one bad actor rate-limits the
//     entire internet.
//   - Losing the early return on the 429 — the flood-protection is only
//     effective if the render never runs when the limiter says no.
//   - Regressing Content-Type from application/pdf — browsers would
//     download-as-octet-stream instead of previewing inline.
//   - Regressing Content-Disposition — the exact "inline" disposition and
//     the "BlockID-Pitch-Deck-Antler-2026.pdf" filename are what we hand
//     out; flipping "inline" → "attachment" forces every visitor into a
//     download instead of the in-tab preview, and renaming the filename
//     rots every existing hotlink in shared decks / DMs.
//   - Losing the Cache-Control: public, max-age=3600 — without it every
//     hit re-renders the PDF (CPU cost), and switching to "private" or
//     "no-store" would defeat CDN / browser reuse we deliberately allow
//     because this deck is public.
//   - Leaking the underlying @react-pdf error message in the 500 body —
//     the route deliberately returns a fixed { error: "Failed to generate
//     pitch deck" } string, not err.message; regressing this could leak
//     library version / stack info to an anonymous caller.
//   - Losing the 500 Content-Type: application/json — the callers key off
//     the JSON envelope; a stray text/plain would break the error banner.
//   - Losing `export const dynamic = "force-dynamic"` — the per-request
//     rate-limit read MUST NOT be pinned to a build-time snapshot,
//     otherwise every visitor gets the same cached response and the
//     limiter is silently disabled at build time.
//   - Calling PitchDeckPDF() more than once per request — the deck factory
//     is invoked exactly once and its result handed to renderToBuffer; a
//     duplicate invocation would double the CPU cost per hit.
//   - Regressing the console.error breadcrumb on the catch branch — the
//     admin logs are what we use to know the public URL is broken (no
//     external alerting on this route).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── mocks (declared before the module-under-test import) ─────────────

const enforceRateLimitMock = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: (...args: unknown[]) => enforceRateLimitMock(...args),
}));

const renderToBufferMock = vi.fn();
vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer: (...args: unknown[]) => renderToBufferMock(...args),
}));

const pitchDeckPdfMock = vi.fn();
vi.mock("@/lib/pdf/pitch-deck-pdf", () => ({
  PitchDeckPDF: (...args: unknown[]) => pitchDeckPdfMock(...args),
}));

// Import AFTER the mocks so the route binds to the fakes.
import { GET, dynamic } from "./route";

const FAKE_PDF = Buffer.from("%PDF-1.7 fake pitch deck bytes\n");
const FAKE_ELEMENT = { __marker: "pitch-deck-element" };

function callGET(headers: Record<string, string> = {}): Promise<Response> {
  return GET(
    new Request("https://blockid.au/api/pitch-deck", { headers }),
  );
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  enforceRateLimitMock.mockReturnValue(null);
  pitchDeckPdfMock.mockReturnValue(FAKE_ELEMENT);
  renderToBufferMock.mockResolvedValue(FAKE_PDF);
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

// ─────────────────────────────────────────────────────────────────────
// Force-dynamic export
// ─────────────────────────────────────────────────────────────────────

describe("dynamic export", () => {
  it("declares force-dynamic so the per-request rate check is not build-time cached", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Rate limit wiring
// ─────────────────────────────────────────────────────────────────────

describe("rate limit", () => {
  it("calls enforceRateLimit with the pinned (route, identity, request, max, window)", async () => {
    await callGET();

    expect(enforceRateLimitMock).toHaveBeenCalledTimes(1);
    const args = enforceRateLimitMock.mock.calls[0];
    expect(args[0]).toBe("pitch-deck-public");
    expect(args[1]).toBeNull();
    expect(args[2]).toBeInstanceOf(Request);
    expect(args[3]).toBe(20);
    expect(args[4]).toBe(60 * 60 * 1000);
  });

  it("passes the SAME request object the handler received to the limiter (so IP headers reach the store)", async () => {
    let capturedRequest: Request | null = null;
    enforceRateLimitMock.mockImplementation((_r, _i, req: Request) => {
      capturedRequest = req;
      return null;
    });

    const req = new Request("https://blockid.au/api/pitch-deck", {
      headers: { "cf-connecting-ip": "203.0.113.5" },
    });
    await GET(req);

    expect(capturedRequest).toBe(req);
    expect(capturedRequest!.headers.get("cf-connecting-ip")).toBe("203.0.113.5");
  });

  it("returns the limiter's 429 response verbatim and skips the render entirely", async () => {
    const limited = new Response(
      JSON.stringify({ ok: false, error: "Rate limit exceeded" }),
      { status: 429, headers: { "Retry-After": "42" } },
    );
    enforceRateLimitMock.mockReturnValue(limited);

    const res = await callGET();

    expect(res).toBe(limited);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(pitchDeckPdfMock).not.toHaveBeenCalled();
    expect(renderToBufferMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Happy path — PDF headers + body
// ─────────────────────────────────────────────────────────────────────

describe("happy path", () => {
  it("returns 200 with the rendered PDF body as bytes", async () => {
    const res = await callGET();

    expect(res.status).toBe(200);
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.equals(FAKE_PDF)).toBe(true);
  });

  it("serves Content-Type: application/pdf so browsers preview inline", async () => {
    const res = await callGET();
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });

  it('serves Content-Disposition: inline with the exact "BlockID-Pitch-Deck-Antler-2026.pdf" filename', async () => {
    const res = await callGET();
    const cd = res.headers.get("Content-Disposition");
    expect(cd).toBe(
      'inline; filename="BlockID-Pitch-Deck-Antler-2026.pdf"',
    );
    // Explicit sub-asserts so a partial regression (inline→attachment,
    // year drift, brand rename) fails on the specific dimension.
    expect(cd).toMatch(/^inline;/);
    expect(cd).toContain("BlockID-Pitch-Deck-Antler-2026.pdf");
  });

  it("serves Cache-Control: public, max-age=3600 so the CDN + browsers can reuse the render", async () => {
    const res = await callGET();
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
  });

  it("invokes PitchDeckPDF() exactly once per request and hands the element to renderToBuffer", async () => {
    await callGET();
    expect(pitchDeckPdfMock).toHaveBeenCalledTimes(1);
    expect(renderToBufferMock).toHaveBeenCalledTimes(1);
    expect(renderToBufferMock).toHaveBeenCalledWith(FAKE_ELEMENT);
  });

  it("checks the rate limiter BEFORE calling the (expensive, synchronous) PDF renderer", async () => {
    const order: string[] = [];
    enforceRateLimitMock.mockImplementation(() => {
      order.push("limit");
      return null;
    });
    pitchDeckPdfMock.mockImplementation(() => {
      order.push("factory");
      return FAKE_ELEMENT;
    });
    renderToBufferMock.mockImplementation(async () => {
      order.push("render");
      return FAKE_PDF;
    });

    await callGET();

    expect(order).toEqual(["limit", "factory", "render"]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Error path — 500 with fixed JSON envelope, no error message leakage
// ─────────────────────────────────────────────────────────────────────

describe("error path", () => {
  it("returns 500 with a JSON envelope when renderToBuffer rejects", async () => {
    renderToBufferMock.mockRejectedValue(new Error("react-pdf boom v3.4.5"));

    const res = await callGET();

    expect(res.status).toBe(500);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("Failed to generate pitch deck");
  });

  it("does NOT leak the underlying error message / stack to the response body", async () => {
    renderToBufferMock.mockRejectedValue(
      new Error("react-pdf internal: /var/lib/node_modules/foo.js line 42"),
    );

    const res = await callGET();
    const text = await res.text();
    expect(text).not.toContain("react-pdf");
    expect(text).not.toContain("/var/lib");
    expect(text).not.toContain("line 42");
  });

  it("returns 500 when PitchDeckPDF() itself throws synchronously (bad slide data)", async () => {
    pitchDeckPdfMock.mockImplementation(() => {
      throw new Error("slide 7 out of range");
    });

    const res = await callGET();
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("Failed to generate pitch deck");
    expect(renderToBufferMock).not.toHaveBeenCalled();
  });

  it("logs the failure to console.error so the admin log tail surfaces the outage", async () => {
    const err = new Error("boom");
    renderToBufferMock.mockRejectedValue(err);

    await callGET();

    expect(consoleErrorSpy).toHaveBeenCalled();
    // At least one call carries the underlying error object (or its message)
    // — the exact breadcrumb text is stable-enough to pin.
    const flat = consoleErrorSpy.mock.calls.flat();
    expect(flat.some((a) => a === err || (typeof a === "string" && a.includes("pitch-deck")))).toBe(true);
  });
});
