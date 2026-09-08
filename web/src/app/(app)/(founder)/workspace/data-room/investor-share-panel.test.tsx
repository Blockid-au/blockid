// Colocated spec for the investor share panel.
//
// The behaviour worth protecting is honesty about the access log: a link that
// nobody has opened must say so, a link minted before the "who is this for?"
// form existed must admit it is anonymous rather than borrowing a name, and
// the revoke call must be able to recover its token from the share URL.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  InvestorSharePanel,
  STATE_LABEL,
  accessSummary,
  shareRecipient,
  tokenFromUrl,
} from "./investor-share-panel";

describe("shareRecipient", () => {
  it("combines a name and a firm", () => {
    expect(
      shareRecipient({ investorName: "Jane Chen", investorFirm: "Blackbird" }),
    ).toBe("Jane Chen · Blackbird");
  });

  it("falls back through firm then email", () => {
    expect(shareRecipient({ investorFirm: "Blackbird" })).toBe("Blackbird");
    expect(shareRecipient({ investorEmail: "j@bb.vc" })).toBe("j@bb.vc");
  });

  it("admits an anonymous link instead of inventing a recipient", () => {
    expect(shareRecipient({})).toBe("Anonymous link");
    expect(
      shareRecipient({ investorName: "  ", investorFirm: "", investorEmail: null }),
    ).toBe("Anonymous link");
  });
});

describe("accessSummary", () => {
  it("says nothing happened when nothing happened", () => {
    expect(accessSummary({ views: 0 })).toBe("Not opened yet");
  });

  it("uses the singular for one view", () => {
    expect(
      accessSummary({ views: 1, lastAccessed: "2026-09-08T04:00:00.000Z" }),
    ).toContain("1 view ·");
  });

  it("reports the count even when the timestamps are missing", () => {
    expect(accessSummary({ views: 4 })).toBe("4 views");
  });

  it("prefers the last-opened time", () => {
    const s = accessSummary({
      views: 2,
      firstAccessed: "2026-09-01T04:00:00.000Z",
      lastAccessed: "2026-09-08T04:00:00.000Z",
    });
    expect(s).toContain("last opened");
    expect(s).toContain("2026");
  });
});

describe("tokenFromUrl", () => {
  it("recovers the token a revoke needs", () => {
    expect(tokenFromUrl("https://blockid.au/s/dr/abc123")).toBe("abc123");
    expect(tokenFromUrl("https://blockid.au/s/dr/abc123?x=1")).toBe("abc123");
  });

  it("returns empty for anything else, so revoke is a no-op", () => {
    expect(tokenFromUrl("https://blockid.au/dashboard")).toBe("");
    expect(tokenFromUrl("")).toBe("");
  });
});

describe("STATE_LABEL", () => {
  it("covers every state the API can return", () => {
    expect(Object.keys(STATE_LABEL).sort()).toEqual([
      "active",
      "expired",
      "revoked",
    ]);
  });
});

describe("InvestorSharePanel", () => {
  it("renders the mint form immediately, before the list has loaded", () => {
    const html = renderToStaticMarkup(<InvestorSharePanel />);
    expect(html).toContain("Investor name");
    expect(html).toContain("Firm");
    expect(html).toContain("Create investor link");
    expect(html).toContain("Loading your investor links");
  });

  it("shows the outstanding-document gaps when a generate has run", () => {
    const html = renderToStaticMarkup(
      <InvestorSharePanel
        documents={{
          total: 10,
          complete: 6,
          pending: 2,
          missing: 2,
          completeness: 60,
        }}
        outstanding={[
          { section: "Financials", label: "Cap table", status: "missing" },
        ]}
      />,
    );
    expect(html).toContain("6 of 10 documents are written");
    expect(html).toContain("Cap table");
    expect(html).toContain("Missing");
  });

  it("omits the gaps block entirely when nothing has been generated", () => {
    const html = renderToStaticMarkup(<InvestorSharePanel />);
    expect(html).not.toContain("What an investor sees as missing");
  });
});
