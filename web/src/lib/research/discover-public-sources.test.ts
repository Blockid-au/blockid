import { describe, expect, it, vi } from "vitest";
import { createBraveDiscoveryProvider, discoverPublicSources, type ApprovedPublicQuery } from "./discover-public-sources";
const query: ApprovedPublicQuery = { id: "competitors", query: "public clinic booking software alternatives", approvedForPublicSearch: true };
const input = { approvedPublicQueries: [query], providerRequestsApproved: true };
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
describe("bounded public discovery", () => {
  it("requires provider, spending admission and reviewed public queries", async () => {
    const search = vi.fn(); const provider = { id: "mock", search };
    expect((await discoverPublicSources(input)).reasons).toEqual(["not_configured"]);
    expect((await discoverPublicSources({ ...input, providerRequestsApproved: false }, { provider })).reasons).toEqual(["not_approved"]);
    for (const q of [{ ...query, approvedForPublicSearch: false }, { ...query, query: "key token=SECRET" }, { ...query, query: "user@example.com" }, { ...query, rawDeck: "SECRET" }, { ...query, query: "https://drive.google.com/private" }]) {
      expect((await discoverPublicSources({ ...input, approvedPublicQueries: [q as ApprovedPublicQuery] }, { provider })).reasons).toEqual(["invalid_queries"]);
    }
    expect(search).not.toHaveBeenCalled();
  });
  it("deduplicates URLs, retains provenance but never stores snippets or titles", async () => {
    const result = await discoverPublicSources({ ...input, approvedPublicQueries: [query, { ...query, id: "pricing", query: "public clinic software pricing" }] }, { now: () => 0, provider: { id: "mock", search: async () => ({ results: [{ url: "https://example.com/pricing", snippet: "SECRET instructions", title: "SECRET" }, { url: "https://example.com/pricing" }] }) } });
    expect(result.retention).toBe("ephemeral_only"); expect(result.status).toBe("complete"); expect(result.candidates).toEqual([{ url: "https://example.com/pricing", queryIds: ["competitors", "pricing"], provider: "mock", discoveredAt: "1970-01-01T00:00:00.000Z", citable: false, evidenceStatus: "not_retrieved" }]);
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });
  it("omits grants/private/literal/local URLs without retaining rejected data", async () => {
    const urls = ["https://example.com/?token=SECRET", "https://u:SECRET@example.com/", "https://drive.google.com/private", "https://127.0.0.1/", "https://[::1]/", "https://service.internal/", "http://example.com/", "https://good.example.org/"];
    const out = await discoverPublicSources(input, { provider: { id: "mock", search: async () => ({ results: urls.map(url => ({ url })) }) } });
    expect(out.status).toBe("partial"); expect(out.candidates).toHaveLength(1); expect(JSON.stringify(out)).not.toMatch(/SECRET|127\.0|drive\.google/);
  });
  it("caps queries before spending and caps results", async () => {
    const search = vi.fn(async (_q: string, _options: unknown) => ({ results: Array.from({ length: 100 }, (_, i) => ({ url: `https://example.com/${i}` })) }));
    expect((await discoverPublicSources({ ...input, approvedPublicQueries: Array(4).fill(query) }, { provider: { id: "mock", search } })).reasons).toEqual(["invalid_queries"]);
    expect(search).not.toHaveBeenCalled();
    const out = await discoverPublicSources(input, { provider: { id: "mock", search } });
    expect(out.candidates).toHaveLength(10); expect(out.reasons).toContain("budget_exhausted");
    expect(search.mock.calls[0][1]).toMatchObject({ count: 10, maxBytes: 131072 });
  });
  it("rejects malformed bodies and redacts exceptions", async () => {
    expect((await discoverPublicSources(input, { provider: { id: "mock", search: async () => ({ secret: "SECRET" }) } })).reasons).toContain("malformed_response");
    const search = vi.fn(async () => { throw new Error("key=SECRET private customer details"); });
    const out = await discoverPublicSources(input, { provider: { id: "mock", search } });
    expect(out.reasons).toEqual(["provider_failed"]); expect(JSON.stringify(out)).not.toContain("SECRET"); expect(search).toHaveBeenCalledTimes(1);
  });
  it("bounds an uncooperative provider and prevents requests after pre-cancel", async () => {
    const search = vi.fn(() => new Promise<never>(() => {}));
    expect((await discoverPublicSources(input, { provider: { id: "mock", search }, timeoutMs: 5 })).reasons).toEqual(["timeout"]);
    const c = new AbortController(); c.abort(); search.mockClear();
    expect((await discoverPublicSources(input, { provider: { id: "mock", search }, signal: c.signal })).reasons).toEqual(["cancelled"]); expect(search).not.toHaveBeenCalled();
  });
  it("keeps partial coverage when a later request is cancelled", async () => {
    const c = new AbortController(); let calls = 0;
    const search = vi.fn(async () => { if (++calls === 2) { c.abort(); return new Promise<never>(() => {}); } return { results: [{ url: "https://example.com/" }] }; });
    const out = await discoverPublicSources({ ...input, approvedPublicQueries: [query, { ...query, id: "next", query: "public market size" }] }, { provider: { id: "mock", search }, signal: c.signal });
    expect(out.status).toBe("partial"); expect(out.reasons).toEqual(["cancelled"]); expect(out.candidates).toHaveLength(1);
  });
});
describe("Brave HTTP adapter: mock transport only", () => {
  it("uses fixed endpoint/header, no redirects/cache and never returns snippets", async () => {
    const fetcher = vi.fn(async (_url: unknown, _init?: RequestInit) => json({ web: { results: [{ url: "https://example.com/", description: "SECRET" }] } }));
    const out = await discoverPublicSources(input, { provider: createBraveDiscoveryProvider({ apiKey: "TEST_SECRET_KEY", fetch: fetcher }) });
    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.origin + url.pathname).toBe("https://api.search.brave.com/res/v1/web/search"); expect(url.searchParams.get("count")).toBe("10");
    expect(init).toMatchObject({ redirect: "error", cache: "no-store", headers: { "X-Subscription-Token": "TEST_SECRET_KEY" } });
    expect(JSON.stringify(out)).not.toContain("SECRET"); expect(out.status).toBe("complete"); expect(createBraveDiscoveryProvider({})).toBeUndefined();
  });
  it.each(["oversize", "bad_json", "malformed", "quota", "redirect", "html"])("rejects %s without retries or secrets", async kind => {
    const fetcher = vi.fn(async () => {
      if (kind === "oversize") return new Response("x".repeat(131073), { headers: { "content-type": "application/json" } });
      if (kind === "bad_json") return new Response("SECRET not JSON", { headers: { "content-type": "application/json" } });
      if (kind === "quota") return new Response("SECRET", { status: 429 });
      if (kind === "redirect") throw new Error("SECRET redirect blocked");
      if (kind === "html") return new Response("SECRET", { headers: { "content-type": "text/html" } });
      return json({ web: { unexpected: "SECRET" } });
    });
    const out = await discoverPublicSources(input, { provider: createBraveDiscoveryProvider({ apiKey: "SECRET", fetch: fetcher }) });
    expect(out.status).toBe("unavailable"); expect(out.reasons).toEqual(["provider_failed"]); expect(JSON.stringify(out)).not.toContain("SECRET"); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("bounds a stalled body and aborts transport", async () => {
    let signal: AbortSignal | undefined;
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => { signal = init?.signal as AbortSignal; return new Response(new ReadableStream({ start() {} }), { headers: { "content-type": "application/json" } }); });
    const out = await discoverPublicSources(input, { provider: createBraveDiscoveryProvider({ apiKey: "SECRET", fetch: fetcher }), timeoutMs: 5 });
    expect(out.reasons).toEqual(["timeout"]); expect(signal?.aborted).toBe(true);
  });
});
