// Colocated vitest for GET /s/p/[slug]/pdf — P9-founder-pack-pdf-route-test.
//
// Master Upgrade Plan §Idea Phase. This route streams a Founder Pack as
// application/pdf so a user can save/print the exact same artifact they see
// on the share page. It mirrors /s/[slug]/pdf for the wedge Score artifact.
//
// The contract this suite pins is narrow but load-bearing:
//
//   - a missing slug MUST 404 with {ok:false, error:"Not found"} (never
//     stream a partial/empty PDF and never leak a stack trace);
//   - a hit MUST return status 200 with Content-Type: application/pdf and
//     Content-Disposition: inline; filename="blockid-founder-pack-<slug>.pdf"
//     so browsers open it in-place rather than downloading with a random name;
//   - Cache-Control MUST be "private, no-store" — the pack contains founder
//     identity (email, display name) and MUST NOT be cached by a shared
//     proxy that another founder's request might reuse;
//   - Content-Length MUST match buffer.length so range-requests and progress
//     bars behave (a wrong Content-Length silently truncates on some UAs);
//   - the response body MUST be the bytes returned by renderFounderPackPdf
//     (byte-for-byte, in the order returned) — anything else corrupts the PDF;
//   - the view MUST be logged AFTER the pack lookup succeeds, MUST include
//     the hashed IP (never a raw IP), and MUST be dispatched via `void` so
//     a slow Supabase insert does not block the PDF response;
//   - the share URL passed to the renderer MUST be
//     `${siteUrl}/s/p/${slug}` — the trailing slash on NEXT_PUBLIC_SITE_URL
//     is stripped, and the localhost:3000 fallback is used when unset.
//
// The 404 branch also MUST NOT call renderFounderPackPdf or logFounderPackView
// — a miss should be observably cheap.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HydratedFounderPack } from "@/lib/idea-phase/persist";

// --- Mocks (registered BEFORE route import) --------------------------------

const hydrateFounderPackBySlugMock = vi.fn<
  (slug: string) => Promise<HydratedFounderPack | null>
>();
const logFounderPackViewMock = vi.fn<
  (args: {
    packId: string;
    ipHash?: string | null;
    userAgent?: string | null;
    referer?: string | null;
  }) => Promise<number | null>
>();
const renderFounderPackPdfMock = vi.fn<
  (args: { pack: HydratedFounderPack; shareUrl: string }) => Promise<Buffer>
>();
const hashIpMock = vi.fn<(ip: string | null | undefined) => string | null>();
const clientIpFromHeadersMock = vi.fn<(headers: Headers) => string | null>();

vi.mock("@/lib/idea-phase/persist", () => ({
  hydrateFounderPackBySlug: (slug: string) =>
    hydrateFounderPackBySlugMock(slug),
  logFounderPackView: (args: Parameters<typeof logFounderPackViewMock>[0]) =>
    logFounderPackViewMock(args),
}));

vi.mock("@/lib/pdf/founder-pack-pdf", () => ({
  renderFounderPackPdf: (
    args: Parameters<typeof renderFounderPackPdfMock>[0],
  ) => renderFounderPackPdfMock(args),
}));

vi.mock("@/lib/iphash", () => ({
  hashIp: (ip: string | null | undefined) => hashIpMock(ip),
  clientIpFromHeaders: (headers: Headers) => clientIpFromHeadersMock(headers),
}));

// Route import MUST come after the mocks are registered.
import { GET, dynamic } from "./route";

// --- Helpers ---------------------------------------------------------------

function buildReq(headers: Record<string, string> = {}): Request {
  const h = new Headers();
  for (const [k, v] of Object.entries(headers)) h.set(k, v);
  return new Request("https://blockid.au/s/p/anything/pdf", { headers: h });
}

function ctx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

function fakePack(overrides: Partial<HydratedFounderPack> = {}): HydratedFounderPack {
  return {
    id: "pack-1",
    slug: "the-slug",
    ideaName: "Idea",
    createdAt: "2026-01-01T00:00:00.000Z",
    viewCount: 0,
    lastViewedAt: null,
    user: { email: "founder@example.com", displayName: "Founder" },
    evaluation: null,
    split: null,
    funding: null,
    ...overrides,
  } as HydratedFounderPack;
}

const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

beforeEach(() => {
  hydrateFounderPackBySlugMock.mockReset();
  logFounderPackViewMock.mockReset();
  renderFounderPackPdfMock.mockReset();
  hashIpMock.mockReset();
  clientIpFromHeadersMock.mockReset();
  logFounderPackViewMock.mockResolvedValue(1);
  clientIpFromHeadersMock.mockReturnValue(null);
  hashIpMock.mockReturnValue(null);
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL_SITE_URL === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL;
  }
});

// --- Module surface --------------------------------------------------------

describe("route module surface", () => {
  it('exports dynamic = "force-dynamic" so the pack is never statically cached', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// --- Miss branch (pack not found) ------------------------------------------

describe("GET /s/p/[slug]/pdf — miss branch", () => {
  it("returns 404 when the pack does not exist", async () => {
    hydrateFounderPackBySlugMock.mockResolvedValue(null);
    const res = await GET(buildReq(), ctx("missing"));
    expect(res.status).toBe(404);
  });

  it('miss branch body is {ok:false, error:"Not found"} JSON', async () => {
    hydrateFounderPackBySlugMock.mockResolvedValue(null);
    const res = await GET(buildReq(), ctx("missing"));
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Not found" });
  });

  it("miss branch does NOT call the PDF renderer (a miss must be cheap)", async () => {
    hydrateFounderPackBySlugMock.mockResolvedValue(null);
    await GET(buildReq(), ctx("missing"));
    expect(renderFounderPackPdfMock).not.toHaveBeenCalled();
  });

  it("miss branch does NOT log a view (nothing to attribute the view to)", async () => {
    hydrateFounderPackBySlugMock.mockResolvedValue(null);
    await GET(buildReq(), ctx("missing"));
    expect(logFounderPackViewMock).not.toHaveBeenCalled();
  });

  it("miss branch passes the slug from params through unchanged", async () => {
    hydrateFounderPackBySlugMock.mockResolvedValue(null);
    await GET(buildReq(), ctx("weird-Slug-123"));
    expect(hydrateFounderPackBySlugMock).toHaveBeenCalledWith("weird-Slug-123");
  });
});

// --- Hit branch (pack found) -----------------------------------------------

describe("GET /s/p/[slug]/pdf — hit branch", () => {
  it("returns 200 when the pack exists", async () => {
    hydrateFounderPackBySlugMock.mockResolvedValue(fakePack());
    renderFounderPackPdfMock.mockResolvedValue(Buffer.from("%PDF-1.4\n"));
    const res = await GET(buildReq(), ctx("the-slug"));
    expect(res.status).toBe(200);
  });

  it('Content-Type is "application/pdf"', async () => {
    hydrateFounderPackBySlugMock.mockResolvedValue(fakePack());
    renderFounderPackPdfMock.mockResolvedValue(Buffer.from("%PDF-1.4\n"));
    const res = await GET(buildReq(), ctx("the-slug"));
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it('Content-Disposition is inline; filename="blockid-founder-pack-<slug>.pdf"', async () => {
    hydrateFounderPackBySlugMock.mockResolvedValue(fakePack());
    renderFounderPackPdfMock.mockResolvedValue(Buffer.from("%PDF-1.4\n"));
    const res = await GET(buildReq(), ctx("acme-idea"));
    expect(res.headers.get("content-disposition")).toBe(
      'inline; filename="blockid-founder-pack-acme-idea.pdf"',
    );
  });

  it('Cache-Control is "private, no-store" (never cached by shared proxies)', async () => {
    hydrateFounderPackBySlugMock.mockResolvedValue(fakePack());
    renderFounderPackPdfMock.mockResolvedValue(Buffer.from("%PDF-1.4\n"));
    const res = await GET(buildReq(), ctx("the-slug"));
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("Content-Length matches the renderer buffer length", async () => {
    const buf = Buffer.from("%PDF-1.4\nHELLO-WORLD\n");
    hydrateFounderPackBySlugMock.mockResolvedValue(fakePack());
    renderFounderPackPdfMock.mockResolvedValue(buf);
    const res = await GET(buildReq(), ctx("the-slug"));
    expect(res.headers.get("content-length")).toBe(String(buf.length));
  });

  it("body is the exact bytes returned by the renderer (no re-encoding)", async () => {
    const buf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00, 0xff, 0x7f]);
    hydrateFounderPackBySlugMock.mockResolvedValue(fakePack());
    renderFounderPackPdfMock.mockResolvedValue(buf);
    const res = await GET(buildReq(), ctx("the-slug"));
    const out = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(out)).toEqual(Array.from(buf));
  });

  it("passes the hydrated pack straight through to the renderer", async () => {
    const pack = fakePack({ id: "pack-xyz", ideaName: "Custom" });
    hydrateFounderPackBySlugMock.mockResolvedValue(pack);
    renderFounderPackPdfMock.mockResolvedValue(Buffer.from("%PDF-1.4\n"));
    await GET(buildReq(), ctx("the-slug"));
    expect(renderFounderPackPdfMock).toHaveBeenCalledTimes(1);
    const callArgs = renderFounderPackPdfMock.mock.calls[0]![0];
    expect(callArgs.pack).toBe(pack);
  });

  it("hydrates by the slug from params (not from the request URL)", async () => {
    hydrateFounderPackBySlugMock.mockResolvedValue(fakePack());
    renderFounderPackPdfMock.mockResolvedValue(Buffer.from("%PDF-1.4\n"));
    // Request URL has one slug, params carries a different one — the route
    // MUST trust the router-supplied params.
    await GET(buildReq(), ctx("params-wins"));
    expect(hydrateFounderPackBySlugMock).toHaveBeenCalledWith("params-wins");
  });
});

// --- Share URL construction ------------------------------------------------

describe("GET /s/p/[slug]/pdf — shareUrl passed to the renderer", () => {
  it("uses NEXT_PUBLIC_SITE_URL + /s/p/<slug> when the env is set", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au";
    hydrateFounderPackBySlugMock.mockResolvedValue(fakePack());
    renderFounderPackPdfMock.mockResolvedValue(Buffer.from("%PDF-1.4\n"));
    await GET(buildReq(), ctx("my-idea"));
    const callArgs = renderFounderPackPdfMock.mock.calls[0]![0];
    expect(callArgs.shareUrl).toBe("https://blockid.au/s/p/my-idea");
  });

  it("strips a trailing slash from NEXT_PUBLIC_SITE_URL (no // in the URL)", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au/";
    hydrateFounderPackBySlugMock.mockResolvedValue(fakePack());
    renderFounderPackPdfMock.mockResolvedValue(Buffer.from("%PDF-1.4\n"));
    await GET(buildReq(), ctx("my-idea"));
    const callArgs = renderFounderPackPdfMock.mock.calls[0]![0];
    expect(callArgs.shareUrl).toBe("https://blockid.au/s/p/my-idea");
  });

  it("falls back to http://localhost:3000 when NEXT_PUBLIC_SITE_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    hydrateFounderPackBySlugMock.mockResolvedValue(fakePack());
    renderFounderPackPdfMock.mockResolvedValue(Buffer.from("%PDF-1.4\n"));
    await GET(buildReq(), ctx("my-idea"));
    const callArgs = renderFounderPackPdfMock.mock.calls[0]![0];
    expect(callArgs.shareUrl).toBe("http://localhost:3000/s/p/my-idea");
  });

  it("falls back to http://localhost:3000 when NEXT_PUBLIC_SITE_URL is empty string", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "";
    hydrateFounderPackBySlugMock.mockResolvedValue(fakePack());
    renderFounderPackPdfMock.mockResolvedValue(Buffer.from("%PDF-1.4\n"));
    await GET(buildReq(), ctx("my-idea"));
    const callArgs = renderFounderPackPdfMock.mock.calls[0]![0];
    expect(callArgs.shareUrl).toBe("http://localhost:3000/s/p/my-idea");
  });
});

// --- View logging ----------------------------------------------------------

describe("GET /s/p/[slug]/pdf — view logging", () => {
  it("logs a view against the hydrated pack.id (not the URL slug)", async () => {
    hydrateFounderPackBySlugMock.mockResolvedValue(fakePack({ id: "pack-abc" }));
    renderFounderPackPdfMock.mockResolvedValue(Buffer.from("%PDF-1.4\n"));
    await GET(buildReq(), ctx("the-slug"));
    expect(logFounderPackViewMock).toHaveBeenCalledTimes(1);
    expect(logFounderPackViewMock.mock.calls[0]![0].packId).toBe("pack-abc");
  });

  it("passes the hashed IP (from clientIpFromHeaders → hashIp) — never a raw IP", async () => {
    clientIpFromHeadersMock.mockReturnValue("203.0.113.5");
    hashIpMock.mockReturnValue("hashed-abc");
    hydrateFounderPackBySlugMock.mockResolvedValue(fakePack());
    renderFounderPackPdfMock.mockResolvedValue(Buffer.from("%PDF-1.4\n"));
    await GET(buildReq({ "x-forwarded-for": "203.0.113.5" }), ctx("the-slug"));
    expect(hashIpMock).toHaveBeenCalledWith("203.0.113.5");
    expect(logFounderPackViewMock.mock.calls[0]![0].ipHash).toBe("hashed-abc");
  });

  it("passes ipHash = null when no client IP header is present", async () => {
    clientIpFromHeadersMock.mockReturnValue(null);
    hashIpMock.mockReturnValue(null);
    hydrateFounderPackBySlugMock.mockResolvedValue(fakePack());
    renderFounderPackPdfMock.mockResolvedValue(Buffer.from("%PDF-1.4\n"));
    await GET(buildReq(), ctx("the-slug"));
    expect(logFounderPackViewMock.mock.calls[0]![0].ipHash).toBeNull();
  });

  it("forwards the user-agent header verbatim", async () => {
    hydrateFounderPackBySlugMock.mockResolvedValue(fakePack());
    renderFounderPackPdfMock.mockResolvedValue(Buffer.from("%PDF-1.4\n"));
    await GET(buildReq({ "user-agent": "Mozilla/5.0 (test)" }), ctx("the-slug"));
    expect(logFounderPackViewMock.mock.calls[0]![0].userAgent).toBe(
      "Mozilla/5.0 (test)",
    );
  });

  it("passes userAgent = null when the header is absent", async () => {
    hydrateFounderPackBySlugMock.mockResolvedValue(fakePack());
    renderFounderPackPdfMock.mockResolvedValue(Buffer.from("%PDF-1.4\n"));
    await GET(buildReq(), ctx("the-slug"));
    expect(logFounderPackViewMock.mock.calls[0]![0].userAgent).toBeNull();
  });

  it("forwards the referer header verbatim", async () => {
    hydrateFounderPackBySlugMock.mockResolvedValue(fakePack());
    renderFounderPackPdfMock.mockResolvedValue(Buffer.from("%PDF-1.4\n"));
    await GET(
      buildReq({ referer: "https://example.com/blog/founder-idea" }),
      ctx("the-slug"),
    );
    expect(logFounderPackViewMock.mock.calls[0]![0].referer).toBe(
      "https://example.com/blog/founder-idea",
    );
  });

  it("passes referer = null when the header is absent", async () => {
    hydrateFounderPackBySlugMock.mockResolvedValue(fakePack());
    renderFounderPackPdfMock.mockResolvedValue(Buffer.from("%PDF-1.4\n"));
    await GET(buildReq(), ctx("the-slug"));
    expect(logFounderPackViewMock.mock.calls[0]![0].referer).toBeNull();
  });

  it("view logging is dispatched via `void` — a slow insert MUST NOT block the PDF response", async () => {
    // If the route awaited logFounderPackView, a hanging Supabase insert would
    // stall the PDF. Simulate that hang and prove the response still resolves.
    hydrateFounderPackBySlugMock.mockResolvedValue(fakePack());
    renderFounderPackPdfMock.mockResolvedValue(Buffer.from("%PDF-1.4\n"));
    let neverResolve!: (v: number | null) => void;
    logFounderPackViewMock.mockImplementation(
      () => new Promise<number | null>((resolve) => {
        neverResolve = resolve;
      }),
    );
    const res = await Promise.race([
      GET(buildReq(), ctx("the-slug")),
      new Promise((_, reject) => setTimeout(() => reject(new Error("blocked")), 500)),
    ]);
    // Free the hanging promise so vitest teardown does not warn.
    neverResolve(null);
    expect((res as Response).status).toBe(200);
  });

  it("consults the request headers to extract the client IP", async () => {
    hydrateFounderPackBySlugMock.mockResolvedValue(fakePack());
    renderFounderPackPdfMock.mockResolvedValue(Buffer.from("%PDF-1.4\n"));
    const req = buildReq({ "x-forwarded-for": "198.51.100.7" });
    await GET(req, ctx("the-slug"));
    expect(clientIpFromHeadersMock).toHaveBeenCalledTimes(1);
    // First arg is the same Headers instance as req.headers.
    expect(clientIpFromHeadersMock.mock.calls[0]![0]).toBe(req.headers);
  });
});

// --- Ordering + integration ------------------------------------------------

describe("GET /s/p/[slug]/pdf — call ordering", () => {
  it("hydrates the pack BEFORE hashing IP or rendering (no wasted work on miss)", async () => {
    const order: string[] = [];
    hydrateFounderPackBySlugMock.mockImplementation(async () => {
      order.push("hydrate");
      return null;
    });
    hashIpMock.mockImplementation(() => {
      order.push("hashIp");
      return null;
    });
    renderFounderPackPdfMock.mockImplementation(async () => {
      order.push("render");
      return Buffer.from("");
    });
    await GET(buildReq({ "x-forwarded-for": "1.2.3.4" }), ctx("missing"));
    expect(order).toEqual(["hydrate"]);
  });

  it("logs the view before returning the PDF response on the hit branch", async () => {
    const order: string[] = [];
    hydrateFounderPackBySlugMock.mockImplementation(async () => {
      order.push("hydrate");
      return fakePack();
    });
    logFounderPackViewMock.mockImplementation(async () => {
      order.push("log");
      return 1;
    });
    renderFounderPackPdfMock.mockImplementation(async () => {
      order.push("render");
      return Buffer.from("%PDF-1.4\n");
    });
    await GET(buildReq(), ctx("the-slug"));
    // hydrate first, then log-dispatched (synchronous call), then render
    // awaited. Because logFounderPackView is void-called, its promise body
    // races with the render — but the .mockImplementation body runs
    // synchronously when the call happens, so the entry appears in order.
    expect(order.slice(0, 2)).toEqual(["hydrate", "log"]);
    expect(order).toContain("render");
  });

  it("still renders the PDF even when logFounderPackView rejects", async () => {
    hydrateFounderPackBySlugMock.mockResolvedValue(fakePack());
    logFounderPackViewMock.mockRejectedValue(new Error("db down"));
    renderFounderPackPdfMock.mockResolvedValue(Buffer.from("%PDF-1.4\n"));
    const res = await GET(buildReq(), ctx("the-slug"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });
});
