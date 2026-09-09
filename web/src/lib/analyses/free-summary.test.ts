import { describe, expect, it } from "vitest";

import {
  FREE_SUMMARY_PAGE_COUNT,
  FREE_SUMMARY_PAGES,
  PAID_REPORT_ADDITIONS,
  freeSummaryCopy,
  maskSummaryEmail,
  normaliseSummaryEmail,
  type FreeSummaryOutcome,
} from "./free-summary";

describe("FREE_SUMMARY_PAGES", () => {
  it("has exactly as many pages as the promise", () => {
    // The homepage, the offer card, the email and the PDF all read this.
    // If the list and the count ever disagree, the site is lying about a
    // number a reader can check by opening the attachment.
    expect(FREE_SUMMARY_PAGES).toHaveLength(FREE_SUMMARY_PAGE_COUNT);
    expect(FREE_SUMMARY_PAGE_COUNT).toBe(5);
  });

  it("uses unique ids", () => {
    const ids = FREE_SUMMARY_PAGES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every page a title and a blurb", () => {
    for (const page of FREE_SUMMARY_PAGES) {
      expect(page.title.trim().length).toBeGreaterThan(0);
      expect(page.blurb.trim().length).toBeGreaterThan(0);
    }
  });

  it("keeps the order a founder asks the questions in", () => {
    expect(FREE_SUMMARY_PAGES.map((p) => p.id)).toEqual([
      "number",
      "shape",
      "standing",
      "gaps",
      "next",
    ]);
  });
});

describe("PAID_REPORT_ADDITIONS", () => {
  it("describes the upgrade rather than teasing it", () => {
    expect(PAID_REPORT_ADDITIONS.length).toBeGreaterThanOrEqual(4);
    for (const line of PAID_REPORT_ADDITIONS) {
      expect(line.trim().length).toBeGreaterThan(10);
    }
  });

  // The A$3 renderer builds section pages from `analysis.subs.slice(0, 6)`
  // and the guest pipeline never populates `acceleratorReadiness`. Neither
  // promise may come back without the renderer changing first.
  it("does not promise a page for all eight dimensions", () => {
    const joined = PAID_REPORT_ADDITIONS.join(" ").toLowerCase();
    expect(joined).not.toContain("a page per dimension");
    expect(joined).not.toContain("eight dimensions");
  });

  it("does not promise the accelerator-readiness checklist", () => {
    const joined = PAID_REPORT_ADDITIONS.join(" ").toLowerCase();
    expect(joined).not.toContain("accelerator");
  });
});

describe("normaliseSummaryEmail", () => {
  it("accepts and lowercases a real address", () => {
    expect(normaliseSummaryEmail("  Founder@Example.COM ")).toBe(
      "founder@example.com",
    );
  });

  it("accepts a plus-addressed mailbox", () => {
    expect(normaliseSummaryEmail("a+b@example.com.au")).toBe(
      "a+b@example.com.au",
    );
  });

  it.each([
    ["", "empty"],
    ["   ", "blank"],
    ["nope", "no at sign"],
    ["a@b", "no dot in the domain"],
    ["a@@b.com", "two at signs"],
    ["a b@example.com", "whitespace"],
    ["@example.com", "no mailbox"],
  ])("rejects %j (%s)", (input) => {
    expect(normaliseSummaryEmail(input)).toBeNull();
  });

  it("rejects a non-string", () => {
    expect(normaliseSummaryEmail(undefined)).toBeNull();
    expect(normaliseSummaryEmail(42)).toBeNull();
    expect(normaliseSummaryEmail(null)).toBeNull();
  });

  it("rejects an address past the RFC length ceiling", () => {
    expect(normaliseSummaryEmail(`${"a".repeat(250)}@example.com`)).toBeNull();
  });
});

describe("maskSummaryEmail", () => {
  it("keeps the first character and the whole domain", () => {
    const masked = maskSummaryEmail("founder@example.com");
    expect(masked.startsWith("f")).toBe(true);
    expect(masked.endsWith("@example.com")).toBe(true);
  });

  it("never echoes the full mailbox back to the page", () => {
    expect(maskSummaryEmail("founder@example.com")).not.toContain("founder");
  });

  it("degrades safely on a malformed value", () => {
    expect(maskSummaryEmail("not-an-email")).toBe("your inbox");
  });
});

describe("freeSummaryCopy", () => {
  const outcomes: FreeSummaryOutcome[] = [
    "sent",
    "already_sent",
    "unsubscribed",
    "invalid_email",
    "not_found",
    "rate_limited",
    "send_failed",
  ];

  it("has words for every outcome", () => {
    for (const outcome of outcomes) {
      const copy = freeSummaryCopy(outcome);
      expect(copy.heading.trim().length).toBeGreaterThan(0);
      expect(copy.body.trim().length).toBeGreaterThan(0);
    }
  });

  it("names where it went on a successful send", () => {
    const copy = freeSummaryCopy("sent", "f***@example.com");
    expect(copy.heading).toContain("f***@example.com");
    expect(copy.body).toContain("5-page");
    expect(copy.retryable).toBe(false);
  });

  it("does not invite a retry on a send that already happened", () => {
    expect(freeSummaryCopy("already_sent").retryable).toBe(false);
    expect(freeSummaryCopy("not_found").retryable).toBe(false);
  });

  it("invites a retry only where retrying can help", () => {
    expect(freeSummaryCopy("send_failed").retryable).toBe(true);
    expect(freeSummaryCopy("invalid_email").retryable).toBe(true);
    expect(freeSummaryCopy("rate_limited").retryable).toBe(true);
    expect(freeSummaryCopy("unsubscribed").retryable).toBe(true);
  });

  it("says nothing was consumed when a send fails", () => {
    expect(freeSummaryCopy("send_failed").body).toMatch(/nothing was sent/i);
  });
});
