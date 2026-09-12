// Colocated vitest for lib/digest/email-template.ts.
//
// T0246 pins the "Money this week" block: it sits right after the action
// block, renders the D-3 header + deadline + step + "Open Money Radar" CTA
// for radar holders, the one-line "Founder Radar — see your grant deadlines"
// teaser with the upgrade link otherwise, and nothing at all for payloads
// stored before the block existed. Names are escaped.

import { describe, expect, it } from "vitest";
import { renderFounderDigestEmail } from "./email-template";
import type { DigestPayload } from "./weekly";

function payload(over: Partial<DigestPayload> = {}): DigestPayload {
  return {
    userId: "u1",
    projectId: "p1",
    periodStart: "2026-09-07T00:00:00.000Z",
    periodEnd: "2026-09-14T00:00:00.000Z",
    founderName: "Sam",
    views: { count: 2, uniqueCountries: 1, topCountry: "AU" },
    leads: { count: 0, items: [] },
    svi: { current: 61, previous: 58, delta: 3, newSnapshot: true },
    topAction: {
      dimension: "tre",
      label: "Traction & Revenue",
      score: 40,
      headline: "Publish your traction numbers",
      reason: "MRR helps.",
      ctaUrl: "https://blockid.au/workspace/business-report#tre",
    },
    aiSummary: null,
    shareUrl: null,
    notificationsUrl: "https://blockid.au/workspace/notifications",
    ...over,
  };
}

describe("renderFounderDigestEmail — money block", () => {
  it("radar holder: header, deadline, step and CTA, placed after the action block", () => {
    const out = renderFounderDigestEmail(
      payload({
        money: {
          radar: true,
          new_matches: 3,
          next_deadline: { name: "MVP <Ventures>", closes_at: "2026-09-26", days: 12, ref_kind: "grant", ref_id: "x", official_url: "https://mvp.example" },
          suggested_action: "Finish your MVP <Ventures> draft",
          href: "https://blockid.au/workspace/funding",
        },
      }),
    );
    expect(out.html).toContain("Money this week: 3 new matches · next deadline MVP &lt;Ventures&gt; in 12 days · this week&#39;s step: Finish your MVP &lt;Ventures&gt; draft");
    expect(out.html).toContain("closes 2026-09-26 (12 days)");
    expect(out.html).toContain('href="https://mvp.example"');
    expect(out.html).toContain("Open Money Radar");
    expect(out.html).toContain('href="https://blockid.au/workspace/funding"');
    expect(out.html).not.toContain("MVP <Ventures>");
    expect(out.html.indexOf("How to improve your SVI")).toBeLessThan(out.html.indexOf("Money this week"));
    expect(out.html.indexOf("Money this week")).toBeLessThan(out.html.indexOf("Open your notifications inbox"));

    expect(out.text).toContain("MONEY THIS WEEK");
    expect(out.text).toContain("Money this week: 3 new matches · next deadline MVP <Ventures> in 12 days");
    expect(out.text).toContain("→ Finish your MVP <Ventures> draft");
    expect(out.text).toContain("https://blockid.au/workspace/funding");
  });

  it("radar holder with nothing due says so", () => {
    const out = renderFounderDigestEmail(
      payload({ money: { radar: true, new_matches: 0, suggested_action: "Update your profile", href: "https://blockid.au/workspace/funding" } }),
    );
    expect(out.html).toContain("No deadline in the next 30 days.");
    expect(out.text).toContain("No deadline in the next 30 days.");
  });

  it("non-radar founder: one-line teaser with the upgrade link, no deadline copy", () => {
    const out = renderFounderDigestEmail(payload({ money: { radar: false, new_matches: 0, href: "https://blockid.au/pricing?from=digest_money" } }));
    expect(out.html).toContain("Founder Radar — see your grant deadlines");
    expect(out.html).toContain('href="https://blockid.au/pricing?from=digest_money"');
    expect(out.html).not.toContain("Money this week:");
    expect(out.html).not.toContain("Open Money Radar");
    expect(out.text).toContain("MONEY\n  Founder Radar — see your grant deadlines: https://blockid.au/pricing?from=digest_money");
  });

  it("payload without `money` (pre-T0246) renders neither block nor teaser", () => {
    const out = renderFounderDigestEmail(payload());
    expect(out.html).not.toContain("Money this week");
    expect(out.html).not.toContain("Founder Radar");
    expect(out.text).not.toContain("MONEY");
  });
});

// QA-3 P1-6 (2026-09-12): Spam Act s17/s18 — identity line always, and the
// unsubscribe / preferences links whenever the cron passes them.
describe("renderFounderDigestEmail — Spam Act footer", () => {
  it("renders the Auschain identity line and reason even without links", () => {
    const { html, text } = renderFounderDigestEmail(payload());
    expect(html).toContain("Auschain PTY LTD · ABN 79 659 615 111 · Sydney NSW");
    expect(html).toContain("weekly digests are on");
    expect(text).toContain("Auschain PTY LTD · ABN 79 659 615 111 · Sydney NSW");
    expect(html).not.toContain("Unsubscribe</a>");
  });

  it("links unsubscribe + preferences in HTML and text when the cron passes them", () => {
    const { html, text } = renderFounderDigestEmail(payload(), {
      unsubscribeUrl: "https://blockid.au/unsubscribe?token=t1",
      preferencesUrl: "https://blockid.au/unsubscribe?token=t1&manage=1",
    });
    expect(html).toContain('<a href="https://blockid.au/unsubscribe?token=t1" style="color:#64748b;text-decoration:underline">Unsubscribe</a>');
    expect(html).toContain("Manage email preferences</a>");
    expect(text).toContain("Unsubscribe: https://blockid.au/unsubscribe?token=t1");
    expect(text).toContain("Manage email preferences: https://blockid.au/unsubscribe?token=t1&manage=1");
  });
});
