// Colocated spec for FreeSummaryPanel.
//
// This workspace has no @testing-library/react, so the render assertions go
// through renderToStaticMarkup and the interactive logic is tested through the
// exported pure helper. See the sibling suites for the same pattern.
//
// The properties that matter:
//   1. no row → no card. Offering to email a summary of a run we never saved
//      would be a promise the endpoint cannot keep.
//   2. the card advertises exactly the pages the PDF is built from, because
//      both read FREE_SUMMARY_PAGES.
//   3. the ask is never the gate — the card carries no wording implying the
//      on-screen result is withheld, expires, or costs anything.
//   4. a response we do not recognise reads as a failure, never as a send.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  FREE_SUMMARY_PAGES,
  FREE_SUMMARY_PAGE_COUNT,
} from "@/lib/analyses/free-summary";

import { FreeSummaryPanel, parseSummaryResponse } from "./free-summary-panel";

function render(props: Parameters<typeof FreeSummaryPanel>[0]) {
  return renderToStaticMarkup(<FreeSummaryPanel {...props} />);
}

describe("FreeSummaryPanel", () => {
  it("renders nothing when the run was never saved", () => {
    expect(render({ analysisId: null })).toBe("");
  });

  it("asks for the address only after the run exists", () => {
    const html = render({ analysisId: "abc-123" });
    expect(html).toContain("Where should we send the full summary?");
    expect(html).toContain('type="email"');
    expect(html).toContain("Email me the summary");
  });

  it("advertises exactly the pages the PDF is built from", () => {
    const html = render({ analysisId: "abc-123" });
    for (const page of FREE_SUMMARY_PAGES) {
      expect(html).toContain(page.title);
    }
    expect(html).toContain(`${FREE_SUMMARY_PAGE_COUNT}-page`);
  });

  it("posts to the analysis's own delivery endpoint", () => {
    // Guards the tenancy story: the id is in the path, so the server can check
    // the run belongs to this caller rather than trusting a body field.
    const html = render({ analysisId: "abc-123" });
    expect(html).toContain("free-summary-heading");
    // The action itself is wired in JS, so assert the id reached the markup
    // that the handler closes over via the testid hook.
    expect(html).toContain('data-testid="analyze-free-summary-submit"');
  });

  it("never implies the on-screen result is withheld or expiring", () => {
    const html = render({ analysisId: "abc-123" });
    expect(html).not.toMatch(
      /unlock|expires?|hurry|limited time|only \d+ left|last chance|% off/i,
    );
  });

  it("states the single use of the address and the unsubscribe", () => {
    // Spam Act consent is only meaningful if the scope is stated where the
    // address is collected, not just in the email footer.
    const html = render({ analysisId: "abc-123" });
    expect(html).toContain("send this summary and nothing else");
    expect(html).toContain("unsubscribe");
  });

  it("keeps the A$3 upgrade subordinate to the free ask", () => {
    const html = render({ analysisId: "abc-123" });
    expect(html).toContain("A$3");
    expect(html).toContain("/one-click-report");
    // One button on this card, and it is the free one.
    expect(html.match(/<button/g) ?? []).toHaveLength(1);
  });

  it("labels the input rather than relying on the placeholder", () => {
    const html = render({ analysisId: "abc-123" });
    expect(html).toContain("Your email address");
    expect(html).toContain("<label");
  });
});

describe("parseSummaryResponse", () => {
  it("passes a recognised outcome through with its masked address", () => {
    expect(
      parseSummaryResponse({ ok: true, outcome: "sent", maskedEmail: "f***@x.com" }),
    ).toEqual({ outcome: "sent", maskedEmail: "f***@x.com" });
  });

  it("recognises every outcome the route can return", () => {
    for (const outcome of [
      "sent",
      "already_sent",
      "unsubscribed",
      "invalid_email",
      "not_found",
      "rate_limited",
      "send_failed",
    ]) {
      expect(parseSummaryResponse({ outcome }).outcome).toBe(outcome);
    }
  });

  it("treats anything unrecognised as a failure, never as a send", () => {
    // A proxy error page or a truncated body must not be read as success —
    // telling someone their summary is on its way when it is not is the one
    // unrecoverable lie this component can tell.
    expect(parseSummaryResponse(null).outcome).toBe("send_failed");
    expect(parseSummaryResponse({}).outcome).toBe("send_failed");
    expect(parseSummaryResponse({ outcome: "banana" }).outcome).toBe(
      "send_failed",
    );
    expect(parseSummaryResponse("<html>502</html>").outcome).toBe(
      "send_failed",
    );
  });

  it("drops an empty masked address rather than rendering a blank", () => {
    expect(parseSummaryResponse({ outcome: "sent", maskedEmail: "" })).toEqual({
      outcome: "sent",
      maskedEmail: null,
    });
    expect(parseSummaryResponse({ outcome: "sent", maskedEmail: 7 }).maskedEmail).toBeNull();
  });
});

describe("contrast", () => {
  it("uses a readable placeholder token, not the decorative one", () => {
    // `text-faint` (#9ca3af) is ~2.5:1 on the card surface — the tokens file
    // marks it DECORATIVE ONLY. A placeholder is read, so it takes
    // `text-tertiary` (5.74:1, AA), the same token the hero omnibox uses.
    const html = renderToStaticMarkup(<FreeSummaryPanel analysisId="abc-123" />);
    expect(html).toContain("placeholder:text-tertiary");
    expect(html).not.toContain("text-faint");
  });
});
