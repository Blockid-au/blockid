import { beforeEach, describe, expect, it, vi } from "vitest";

const acquireWebsiteCorpusMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/intake/website-corpus", () => ({
  acquireWebsiteCorpus: acquireWebsiteCorpusMock,
}));

vi.mock("@/lib/svi-analysis", () => ({
  extractSignals: () => ({
    hasProduct: true,
    hasCustomers: false,
    hasSocialProof: false,
    hasRevenue: true,
    hasAnalytics: false,
    sector: "healthtech",
  }),
}));

import { GET } from "./route";

beforeEach(() => {
  acquireWebsiteCorpusMock.mockReset().mockImplementation(async (_url, opts) => {
    const page = {
      id: "page:root",
      requestedUrl: "https://example.com/",
      finalUrl: "https://example.com/",
      status: "available",
      httpStatus: 200,
      title: "Example",
      description: "",
      text: "Investor workflow product with pricing",
      observedAt: "2026-09-23T00:00:00.000Z",
      truncated: false,
      error: null,
    };
    opts?.onEvent?.({ type: "page", page });
    return {
      version: "website-corpus-v1",
      seedUrl: "https://example.com/",
      pages: [page],
      combinedText: page.text,
      complete: true,
      limits: { maxPages: 6, pageChars: 12_000, corpusChars: 60_000 },
    };
  });
});

describe("GET /api/site-crawl/stream", () => {
  it("streams the same versioned corpus producer used by intake", async () => {
    const response = await GET(new Request("https://blockid.au/api/site-crawl/stream?url=example.com"));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(acquireWebsiteCorpusMock).toHaveBeenCalledWith(
      "example.com",
      expect.objectContaining({ onEvent: expect.any(Function) }),
    );
    expect(body).toContain("event: page_fetch");
    expect(body).toContain('"sourceId":"page:root"');
    expect(body).toContain("event: signal_extract");
    expect(body).toContain('"producer":"website-corpus-v1"');
  });

  it("rejects missing and invalid targets before starting a stream", async () => {
    const missing = await GET(new Request("https://blockid.au/api/site-crawl/stream"));
    const invalid = await GET(new Request("https://blockid.au/api/site-crawl/stream?url=javascript%3Aalert(1)"));

    expect(missing.status).toBe(400);
    expect(invalid.status).toBe(400);
    expect(acquireWebsiteCorpusMock).not.toHaveBeenCalled();
  });
});
