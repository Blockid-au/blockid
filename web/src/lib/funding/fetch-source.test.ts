// Colocated vitest for the funding fetch helper + dependency-free parsers (T0243).

import { describe, expect, it, vi } from "vitest";

// S20-B review P2-3 — without an injected fetchImpl the helper goes through
// the DNS-pinned transport; stubbed so the suite stays off the network.
const pinnedFetchMock = vi.fn<(url: string, init: RequestInit, addresses: readonly string[]) => Promise<Response>>();
vi.mock("@/lib/security/pinned-fetch", () => ({
  pinnedFetch: (url: string, init: RequestInit, addresses: readonly string[]) => pinnedFetchMock(url, init, addresses),
}));

import {
  FUNDING_BOT_UA,
  MAX_BODY_BYTES,
  MAX_REDIRECTS,
  decodeEntities,
  discoverFeedUrl,
  extractStatusHints,
  fetchText,
  findIsoDate,
  htmlToText,
  parseCsv,
  parseCsvRecords,
  parseRssItems,
} from "./fetch-source";

const noSleep = async () => {};
// SSRF guard (S8-C): every fetchText call resolves through this stub so the
// suite never touches DNS and every host is "public".
const pub = async () => ["13.54.1.1"];

function fakeFetch(seq: Array<{ status: number; body?: string; throws?: string; location?: string }>) {
  let i = 0;
  const calls: Array<{ url: string; ua: string | undefined }> = [];
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const step = seq[Math.min(i, seq.length - 1)];
    i++;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url: String(url), ua: headers["user-agent"] });
    if (step.throws) {
      const e = new Error(step.throws);
      if (step.throws === "abort") e.name = "AbortError";
      throw e;
    }
    return new Response(step.body ?? "", { status: step.status, headers: step.location ? { location: step.location } : {} });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

describe("fetchText", () => {
  it("returns ok + body with the browser-like UA on 200", async () => {
    const { impl, calls } = fakeFetch([{ status: 200, body: "<html>hi</html>" }]);
    const r = await fetchText("https://example.gov.au/x", { fetchImpl: impl, resolve: pub, sleep: noSleep });
    expect(r).toMatchObject({ ok: true, status: 200, text: "<html>hi</html>", blocked: false, truncated: false, attempts: 1 });
    expect(calls[0].ua).toBe(FUNDING_BOT_UA);
    expect(FUNDING_BOT_UA).toMatch(/^Mozilla\/5\.0 \(compatible; BlockID-FundingBot\/1\.0; \+https:\/\/blockid\.au\/funding\)$/);
  });

  it("403 is blocked immediately — no retries", async () => {
    const { impl, calls } = fakeFetch([{ status: 403, body: "Forbidden" }]);
    const r = await fetchText("https://www.grants.gov.au/go/list", { fetchImpl: impl, resolve: pub, sleep: noSleep, retries: 3 });
    expect(r).toMatchObject({ ok: false, status: 403, blocked: true, text: "", attempts: 1 });
    expect(calls).toHaveLength(1);
  });

  it("429 retries once with backoff, then blocked", async () => {
    const sleeps: number[] = [];
    const { impl, calls } = fakeFetch([{ status: 429 }, { status: 429 }, { status: 200, body: "never" }]);
    const r = await fetchText("https://x.gov.au", { fetchImpl: impl, resolve: pub, retries: 5, backoffMs: 100, sleep: async (ms) => { sleeps.push(ms); } });
    expect(r).toMatchObject({ ok: false, status: 429, blocked: true, attempts: 2 });
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([100]);
  });

  it("5xx and network errors retry with exponential backoff and can recover", async () => {
    const sleeps: number[] = [];
    const { impl } = fakeFetch([{ status: 503 }, { status: 0, throws: "ECONNRESET" }, { status: 200, body: "ok" }]);
    const r = await fetchText("https://x.gov.au", { fetchImpl: impl, resolve: pub, retries: 2, backoffMs: 250, sleep: async (ms) => { sleeps.push(ms); } });
    expect(r).toMatchObject({ ok: true, status: 200, text: "ok", attempts: 3 });
    expect(sleeps).toEqual([250, 500]);
  });

  it("gives up after retries with the last error (timeout → AbortError)", async () => {
    const { impl } = fakeFetch([{ status: 0, throws: "abort" }]);
    const r = await fetchText("https://x.gov.au", { fetchImpl: impl, resolve: pub, retries: 1, sleep: noSleep, timeoutMs: 1234 });
    expect(r.ok).toBe(false);
    expect(r.blocked).toBe(false);
    expect(r.status).toBe(0);
    expect(r.attempts).toBe(2);
    expect(r.error).toMatch(/timeout after 1234ms/);
  });

  it("404 is not ok, not blocked, not retried", async () => {
    const { impl, calls } = fakeFetch([{ status: 404, body: "gone" }]);
    const r = await fetchText("https://x.gov.au", { fetchImpl: impl, resolve: pub, retries: 3, sleep: noSleep });
    expect(r).toMatchObject({ ok: false, status: 404, blocked: false, text: "gone" });
    expect(calls).toHaveLength(1);
  });

  it("passes redirect: manual and follows a public redirect hop, re-checking every hop", async () => {
    const seen: string[] = [];
    const { impl, calls } = fakeFetch([
      { status: 301, location: "https://www.business.gov.au/grants" },
      { status: 302, location: "/grants/igp" },
      { status: 200, body: "landed" },
    ]);
    const r = await fetchText("https://business.gov.au/x", { fetchImpl: impl, sleep: noSleep, resolve: async (h) => { seen.push(h); return ["13.54.1.1"]; } });
    expect(r).toMatchObject({ ok: true, status: 200, text: "landed", attempts: 1, finalUrl: "https://www.business.gov.au/grants/igp" });
    expect(calls.map((c) => c.url)).toEqual(["https://business.gov.au/x", "https://www.business.gov.au/grants", "https://www.business.gov.au/grants/igp"]);
    expect(seen).toEqual(["business.gov.au", "www.business.gov.au", "www.business.gov.au"]);
    const init = (impl as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls[0][1];
    expect(init.redirect).toBe("manual");
  });

  it("P2-3: the default transport pins every hop's socket to the addresses the guard validated for THAT hop", async () => {
    const byHost: Record<string, string[]> = { "business.gov.au": ["13.54.1.1"], "www.business.gov.au": ["13.54.2.2", "2400:cb00::1"] };
    pinnedFetchMock.mockReset();
    pinnedFetchMock
      .mockResolvedValueOnce(new Response("", { status: 301, headers: { location: "https://www.business.gov.au/grants" } }))
      .mockResolvedValueOnce(new Response("landed", { status: 200 }));
    const r = await fetchText("https://business.gov.au/x", { sleep: noSleep, resolve: async (h) => byHost[h] });
    expect(r).toMatchObject({ ok: true, status: 200, text: "landed" });
    expect(pinnedFetchMock).toHaveBeenCalledTimes(2);
    expect(pinnedFetchMock.mock.calls[0][0]).toBe("https://business.gov.au/x");
    expect(pinnedFetchMock.mock.calls[0][2]).toEqual(["13.54.1.1"]);
    expect(pinnedFetchMock.mock.calls[1][0]).toBe("https://www.business.gov.au/grants");
    expect(pinnedFetchMock.mock.calls[1][2]).toEqual(["13.54.2.2", "2400:cb00::1"]);
    expect(pinnedFetchMock.mock.calls[1][1].redirect).toBe("manual");
  });

  it("SSRF: refuses the cloud metadata address, loopback and non-http schemes without fetching", async () => {
    for (const bad of ["http://169.254.169.254/latest/meta-data/", "http://127.0.0.1:54321/admin", "http://localhost/", "file:///etc/passwd", "ftp://business.gov.au/"]) {
      const { impl, calls } = fakeFetch([{ status: 200, body: "secret" }]);
      const r = await fetchText(bad, { fetchImpl: impl, sleep: noSleep, resolve: pub, retries: 3 });
      expect(r.ok, bad).toBe(false);
      expect(r.refused, bad).toBe(true);
      expect(r.error, bad).toMatch(/^ssrf_refused:/);
      expect(r.text).toBe("");
      expect(calls, bad).toHaveLength(0);
    }
  });

  it("SSRF: refuses a redirect from a seed host to a private address (no retry, body never read)", async () => {
    const { impl, calls } = fakeFetch([
      { status: 302, location: "http://169.254.169.254/latest/meta-data/iam/" },
      { status: 200, body: "secret" },
    ]);
    const r = await fetchText("https://business.gov.au/x", { fetchImpl: impl, sleep: noSleep, resolve: pub, retries: 3 });
    expect(r).toMatchObject({ ok: false, refused: true, status: 0, text: "", attempts: 1, error: "ssrf_refused:hostname_forbidden" });
    expect(calls).toHaveLength(1);
  });

  it("SSRF: refuses a host that resolves to a private address (rebinding / internal CNAME)", async () => {
    const { impl, calls } = fakeFetch([{ status: 200, body: "secret" }]);
    const r = await fetchText("https://evil.example.com/", { fetchImpl: impl, sleep: noSleep, resolve: async () => ["10.0.0.7"] });
    expect(r).toMatchObject({ ok: false, refused: true, error: "ssrf_refused:private_ip" });
    expect(calls).toHaveLength(0);
  });

  it("stops after MAX_REDIRECTS hops", async () => {
    const seq = Array.from({ length: 10 }, (_, i) => ({ status: 301, location: `https://business.gov.au/hop${i}` }));
    const { impl, calls } = fakeFetch(seq);
    const r = await fetchText("https://business.gov.au/start", { fetchImpl: impl, sleep: noSleep, resolve: pub, retries: 0 });
    expect(r.ok).toBe(false);
    expect(r.refused).toBeUndefined();
    expect(r.error).toMatch(/too many redirects/);
    expect(calls).toHaveLength(MAX_REDIRECTS + 1);
  });

  it("caps the body at 2 MB and flags truncation", async () => {
    const big = "a".repeat(MAX_BODY_BYTES + 5000);
    const { impl } = fakeFetch([{ status: 200, body: big }]);
    const r = await fetchText("https://x.gov.au", { fetchImpl: impl, resolve: pub, sleep: noSleep });
    expect(r.ok).toBe(true);
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBe(MAX_BODY_BYTES);
  });
});

describe("parseRssItems", () => {
  const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>GrantConnect - Current Grant Opportunities</title>
  <item>
    <title><![CDATA[GO7654 - Regional Precincts &amp; Partnerships Program - Stream 2]]></title>
    <link>https://www.grants.gov.au/Go/Show?GoUuid=abc-123</link>
    <pubDate>Mon, 07 Sep 2026 00:00:00 GMT</pubDate>
    <description><![CDATA[<p>Closing Date &amp; Time: 30-Oct-2026 5:00 pm AEDT</p>]]></description>
  </item>
  <item>
    <title>GO7660 - Australia&#8217;s Economic Accelerator Ignite</title>
    <link>https://www.grants.gov.au/Go/Show?GoUuid=def-456</link>
    <pubDate>Tue, 08 Sep 2026 00:00:00 GMT</pubDate>
    <description>Applications close 2026-11-15</description>
  </item>
</channel></rss>`;

  it("extracts title/link/pubDate/description, unwrapping CDATA and entities", () => {
    const items = parseRssItems(RSS);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      title: "GO7654 - Regional Precincts & Partnerships Program - Stream 2",
      link: "https://www.grants.gov.au/Go/Show?GoUuid=abc-123",
      pubDate: "Mon, 07 Sep 2026 00:00:00 GMT",
      description: "Closing Date & Time: 30-Oct-2026 5:00 pm AEDT",
    });
    expect(items[1].title).toBe("GO7660 - Australia’s Economic Accelerator Ignite");
    expect(items[1].description).toBe("Applications close 2026-11-15");
  });

  it("returns [] for HTML error pages and empty input", () => {
    expect(parseRssItems("<html><body>403 Forbidden</body></html>")).toEqual([]);
    expect(parseRssItems("")).toEqual([]);
  });

  it("tolerates Atom entries with <link href>", () => {
    const atom = `<feed><entry><title>Entry A</title><link href="https://a.example/1"/><updated>2026-09-01</updated><summary>S</summary></entry></feed>`;
    expect(parseRssItems(atom)).toEqual([{ title: "Entry A", link: "https://a.example/1", pubDate: "2026-09-01", description: "S" }]);
  });
});

describe("parseCsv", () => {
  const CSV = '﻿name,status,"closing date",notes\r\n' +
    'Ignite Ideas Fund,Open,2026-10-31,"Round 12, ""tech"" only"\r\n' +
    'Business Growth Fund,Closed,,"multi\nline note"\n' +
    '\n' +
    'Female Founders,Upcoming,2027-02-01,\n';

  it("handles BOM, CRLF/LF, quoted commas, escaped quotes and embedded newlines", () => {
    const rows = parseCsv(CSV);
    expect(rows).toEqual([
      ["name", "status", "closing date", "notes"],
      ["Ignite Ideas Fund", "Open", "2026-10-31", 'Round 12, "tech" only'],
      ["Business Growth Fund", "Closed", "", "multi\nline note"],
      ["Female Founders", "Upcoming", "2027-02-01", ""],
    ]);
  });

  it("parseCsvRecords keys by lower-cased header", () => {
    const recs = parseCsvRecords(CSV);
    expect(recs).toHaveLength(3);
    expect(recs[0]).toEqual({ name: "Ignite Ideas Fund", status: "Open", "closing date": "2026-10-31", notes: 'Round 12, "tech" only' });
    expect(recs[2]["closing date"]).toBe("2027-02-01");
  });

  it("empty input → []", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsvRecords("only,header")).toEqual([]);
  });
});

describe("findIsoDate / decodeEntities / htmlToText", () => {
  it("parses ISO, day-month-year, month-day-year and AU dd/mm/yyyy", () => {
    expect(findIsoDate("closes 2026-10-31")).toBe("2026-10-31");
    expect(findIsoDate("Closing date: 30 April 2027")).toBe("2027-04-30");
    expect(findIsoDate("Applications close 5th Sept 2026 at 5pm")).toBe("2026-09-05");
    expect(findIsoDate("Deadline: October 31, 2026")).toBe("2026-10-31");
    expect(findIsoDate("Closes 31/10/2026")).toBe("2026-10-31");
    expect(findIsoDate("no date here")).toBeNull();
    expect(findIsoDate("2026-13-40")).toBeNull();
  });

  it("decodes named, decimal and hex entities", () => {
    expect(decodeEntities("R&amp;D &#8211; &#x2019;x&#x2019; &nbsp;y")).toBe("R&D – ’x’  y");
  });

  it("htmlToText drops script/style and collapses whitespace", () => {
    const t = htmlToText("<html><head><style>p{}</style><script>var x=1;</script></head><body><h1>Title</h1><p>Status:   <b>Open</b></p></body></html>");
    expect(t).toBe("Title\nStatus: Open");
  });
});

describe("extractStatusHints", () => {
  const NOW = new Date("2026-09-10T00:00:00Z");

  // business.gov.au-style block: explicit status badge + closing date.
  const BUSINESS_GOV_HTML = `
    <html><body>
      <nav>Home &gt; Grants and programs</nav>
      <h1>Industry Growth Program – Early-Stage Commercialisation</h1>
      <div class="status"><span>Status:</span> <span class="badge">Open</span></div>
      <dl><dt>Closing date</dt><dd>30 April 2027, 5:00pm AEST</dd></dl>
      <p>Applications are now open for eligible SMEs.</p>
      <script>window.dataLayer=[{"status":"closed"}]</script>
    </body></html>`;

  // State-portal style: no status badge, only a past closing date.
  const STATE_PORTAL_HTML = `
    <html><body>
      <h1>Boosting Female Founders – Round 3</h1>
      <p>Applications close: 12/05/2026.</p>
      <p>Successful applicants will be notified in July.</p>
    </body></html>`;

  it("business.gov.au: explicit Status: Open + closing date → medium, explicit_open", () => {
    expect(extractStatusHints(BUSINESS_GOV_HTML, NOW)).toEqual({
      status: "open",
      closes_at: "2027-04-30",
      confidence: "medium",
      explicit_open: true,
      evidence: expect.stringContaining("Status: Open"),
    });
  });

  it("state portal: past closing date with no status phrase → inferred closed, low", () => {
    expect(extractStatusHints(STATE_PORTAL_HTML, NOW)).toMatchObject({
      status: "closed",
      closes_at: "2026-05-12",
      confidence: "low",
    });
  });

  it("future closing date with no status phrase → date only, no status", () => {
    const h = extractStatusHints("<p>Applications close 2026-12-01</p>", NOW);
    expect(h).toEqual({ closes_at: "2026-12-01", confidence: "low", evidence: expect.any(String) });
    expect(h.status).toBeUndefined();
  });

  it("'This grant is closed' / 'no longer accepting applications' → closed, medium", () => {
    expect(extractStatusHints("<h1>X</h1><p>This grant is now closed.</p>", NOW)).toMatchObject({ status: "closed", confidence: "medium" });
    expect(extractStatusHints("<p>We are no longer accepting applications for this round.</p>", NOW)).toMatchObject({ status: "closed", confidence: "medium" });
    expect(extractStatusHints("<p>Applications have closed.</p>", NOW).explicit_open).toBeUndefined();
    expect(extractStatusHints("<p>Applications for Round 4 have closed.</p>", NOW)).toMatchObject({ status: "closed", confidence: "medium" });
    expect(extractStatusHints("<p>Applications for the 2026 intake are now open.</p>", NOW)).toMatchObject({ status: "open", explicit_open: true });
  });

  it("'Applications open in March' / 'opening soon' → upcoming, not explicit_open", () => {
    expect(extractStatusHints("<p>Applications open in March 2027.</p>", NOW)).toMatchObject({ status: "upcoming", confidence: "medium" });
    expect(extractStatusHints("<p>Round 4 — opening soon</p>", NOW).status).toBe("upcoming");
    expect(extractStatusHints("<p>The next round will open in early 2027.</p>", NOW).status).toBe("upcoming");
    // wa.gov.au share widgets: "(Opens in a new tab/window)" is not a timing statement.
    expect(extractStatusHints("<p>Share Facebook share (Opens in a new tab/window) X (Opens in a new tab/window)</p>", NOW)).toEqual({ confidence: "low" });
    expect(extractStatusHints("<p>Applications open in March 2027.</p>", NOW).explicit_open).toBeUndefined();
  });

  it("'Applications are now open' without a status badge → open, medium, explicit_open", () => {
    expect(extractStatusHints("<p>Applications are now open. Closes 15 November 2026.</p>", NOW)).toEqual({
      status: "open",
      closes_at: "2026-11-15",
      confidence: "medium",
      explicit_open: true,
      evidence: expect.any(String),
    });
  });

  it("status evidence overrides closing-date evidence", () => {
    const h = extractStatusHints("<p>Closing date: 30 April 2027</p><p>Ignite Ideas Fund — Applications are now open.</p>", NOW);
    expect(h).toMatchObject({ status: "open", closes_at: "2027-04-30", explicit_open: true });
    expect(h.evidence).toContain("Applications are now open");
  });

  it("earliest phrase wins when a page mentions both open and closed", () => {
    const html = "<h1>Round 2</h1><p>Applications are now open.</p><footer>Round 1 is closed.</footer>";
    expect(extractStatusHints(html, NOW).status).toBe("open");
    const html2 = "<h1>Round 1</h1><p>Round 1 is now closed.</p><aside>Applications open for Round 2 in 2027</aside>";
    expect(extractStatusHints(html2, NOW).status).toBe("closed");
  });

  it("'Status: Closing soon' still means open; 'Status: Paused' / IGP wording → paused", () => {
    expect(extractStatusHints("<p>Status: Closing soon</p>", NOW)).toMatchObject({ status: "open", confidence: "medium" });
    expect(extractStatusHints("<p>Status: Closing soon</p>", NOW).explicit_open).toBeUndefined();
    expect(extractStatusHints("<p>Status: Paused</p>", NOW).status).toBe("paused");
    // Verbatim business.gov.au Industry Growth Program wording (probe 2026-09-10).
    expect(extractStatusHints("<h1>Industry Growth Program</h1><p>This program is currently paused to new applications.</p>", NOW)).toMatchObject({
      status: "paused",
      confidence: "medium",
    });
    // Verbatim business.gov.au EMDG wording (probe 2026-09-10).
    expect(extractStatusHints("<span>Closed</span><p>This grant is currently closed to applications</p>", NOW).status).toBe("closed");
  });

  it("discoverFeedUrl finds the advertised RSS on an HTML list page", () => {
    const html = `<html><head><link rel="alternate" type="application/rss+xml" title="GrantConnect" href="/public_data/rss/rss.xml"></head><body>x</body></html>`;
    expect(discoverFeedUrl(html, "https://www.grants.gov.au/go/list")).toBe("https://www.grants.gov.au/public_data/rss/rss.xml");
    expect(discoverFeedUrl(`<a href="/public_data/rss/rss.xml">RSS</a>`, "https://www.grants.gov.au/go/list")).toBe("https://www.grants.gov.au/public_data/rss/rss.xml");
    expect(discoverFeedUrl("<html><body>no feed</body></html>", "https://x.gov.au")).toBeNull();
    expect(discoverFeedUrl("", "https://x.gov.au")).toBeNull();
  });

  it("nothing recognisable → low confidence with no fields", () => {
    expect(extractStatusHints("<html><body><p>Welcome to our website.</p></body></html>", NOW)).toEqual({ confidence: "low" });
    expect(extractStatusHints("", NOW)).toEqual({ confidence: "low" });
  });
});
