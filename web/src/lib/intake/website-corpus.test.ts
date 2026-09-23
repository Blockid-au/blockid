import { describe, expect, it } from "vitest";
import { acquireWebsiteCorpus } from "./website-corpus";
import type { FetchTextResult } from "@/lib/funding/fetch-source";

function ok(text: string, finalUrl?: string): FetchTextResult {
  return { ok: true, status: 200, text, blocked: false, truncated: false, attempts: 1, finalUrl, contentType: "text/html; charset=utf-8" };
}

describe("acquireWebsiteCorpus", () => {
  it("prioritises material same-host pages and includes them in the report corpus", async () => {
    const seen: string[] = [];
    const pages = new Map([
      ["https://example.com/", ok('<title>Home</title><a href="/blog">Blog</a><a href="/pricing?utm_source=x">Pricing</a><a href="/about">About</a><p>Clinic workflow product</p>')],
      ["https://example.com/pricing", ok("<title>Pricing</title><p>A$50 per clinic per month</p>")],
      ["https://example.com/about", ok("<title>About</title><p>Founded by two clinicians</p>")],
    ]);
    const result = await acquireWebsiteCorpus("example.com", { maxPages: 3 }, {
      now: () => new Date("2026-09-23T00:00:00.000Z"),
      fetchPage: async (url) => { seen.push(url); return pages.get(url) ?? { ok: false, status: 404, text: "", blocked: false, truncated: false, attempts: 1 }; },
    });
    expect(seen).toEqual(["https://example.com/", "https://example.com/pricing", "https://example.com/about"]);
    expect(result.combinedText).toContain("A$50 per clinic per month");
    expect(result.combinedText).toContain("Founded by two clinicians");
    expect(result.pages.map((page) => page.finalUrl)).not.toContain("https://example.com/blog");
  });

  it("keeps partial statuses distinct and never turns failures into empty successful pages", async () => {
    const result = await acquireWebsiteCorpus("https://example.com", { maxPages: 3 }, {
      fetchPage: async (url) => url.endsWith("/")
        ? ok('<a href="/pricing">Pricing</a><a href="/customers">Customers</a><p>Home</p>')
        : url.endsWith("pricing")
          ? { ok: false, status: 403, text: "", blocked: true, truncated: false, attempts: 1 }
          : { ok: false, status: 0, text: "", blocked: false, truncated: false, attempts: 1, error: "timeout after 7000ms" },
    });
    expect(result.complete).toBe(false);
    expect(result.pages.map((page) => [page.finalUrl, page.status])).toEqual([
      ["https://example.com/", "available"],
      ["https://example.com/pricing", "blocked"],
      ["https://example.com/customers", "timeout"],
    ]);
    expect(result.combinedText).not.toContain("undefined");
  });

  it("does not follow cross-host links and rejects unsupported media", async () => {
    const result = await acquireWebsiteCorpus("https://example.com", { maxPages: 3 }, {
      fetchPage: async (url) => url.endsWith("/")
        ? ok('<a href="https://evil.example/internal">Other</a><a href="/deck.pdf">Deck</a><p>Home</p>')
        : { ...ok("binary"), contentType: "application/pdf" },
    });
    expect(result.pages).toHaveLength(2);
    expect(result.pages[1]).toMatchObject({ finalUrl: "https://example.com/deck.pdf", status: "unsupported", text: "" });
  });

  it("emits the same page records returned to the caller", async () => {
    const events: unknown[] = [];
    const result = await acquireWebsiteCorpus("https://example.com", { maxPages: 1, onEvent: (event) => events.push(event) }, {
      fetchPage: async () => ok("<title>One</title><p>Only page</p>"),
    });
    expect(events).toEqual([{ type: "page", page: result.pages[0] }]);
  });
});
