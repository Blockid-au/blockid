// Colocated vitest for the feedback-letter email renderer (G14-S34): plain
// text + HTML from the letter markdown, the three next actions, the
// dashboard deep link, HTML escaping, and no leak of anything the letter
// must not carry.

import { describe, expect, it } from "vitest";
import type { FeedbackAggregate } from "./feedback-letter";
import { FEEDBACK_LETTER_DASHBOARD_PATH, letterMarkdownToHtml, letterMarkdownToText, renderFounderFeedbackLetterEmail } from "./feedback-letter-email";

const AGG: FeedbackAggregate = {
  k: 3,
  orgCount: 2,
  evaluationIds: ["e-1"],
  dimensions: [{ key: "TRE", mean: 2, n: 3, agreePct: 25, disagreePct: 50 }],
  weakestDim: "TRE",
  strongestDim: "FTV",
  risks: [],
  questions: [],
  generatedAt: "2026-09-20T22:00:00.000Z",
};

const MD = "## What investors said\n\n3 evaluators from 2 organisations recorded a verdict on Acme <b>.\n\n### Start here\nEvaluators rated **Traction** lowest.\n\n### Risks\n- No recurring revenue\n- Key-person risk\n\n_Individual evaluators are never identified._";

describe("letterMarkdownToHtml / letterMarkdownToText", () => {
  it("renders headings, paragraphs, bullets, bold and em with every text node escaped", () => {
    const html = letterMarkdownToHtml(MD);
    expect(html).toContain("<h2");
    expect(html).toContain(">What investors said</h2>");
    expect(html).toContain("<h3");
    expect(html).toContain("<strong>Traction</strong>");
    expect(html).toContain("<em>Individual evaluators are never identified.</em>");
    expect(html).toContain("<li style=\"margin:0 0 6px 0;\">No recurring revenue</li>");
    expect(html).toContain("Acme &lt;b&gt;.");
    expect(html).not.toContain("<b>");
    const text = letterMarkdownToText(MD);
    expect(text).toContain("What investors said\n");
    expect(text).toContain("Evaluators rated Traction lowest.");
    expect(text).toContain("- No recurring revenue");
    expect(text).not.toContain("**");
  });
});

describe("renderFounderFeedbackLetterEmail", () => {
  const rendered = renderFounderFeedbackLetterEmail({
    aggregate: AGG,
    letterMd: MD,
    nextActions: [
      { id: "tre-01", title: "Log 3 months of revenue", rationale: "Revenue proof lifts TRE fastest.", dimension: "TRE", sviBenefit: 12, effort: "low", timeToComplete: "1 week", href: "/workspace/finance/revenue" },
      { id: "tre-02", title: "Connect Stripe <now>", rationale: "r2", dimension: "TRE", sviBenefit: 8, effort: "medium", timeToComplete: "2 days", href: "/workspace/finance/revenue" },
    ],
    startupName: "Acme",
    displayName: "Jo",
    siteUrl: "https://blockid.au/",
    footerHtml: "<p>FOOTER-HTML</p>",
    footerText: "\nFOOTER-TEXT",
  });

  it("subject + preheader from the catalogue; HTML and text both carry the letter, the actions and the dashboard link", () => {
    expect(rendered.subject).toBe("What 3 investors said about Acme");
    expect(rendered.preheader).toContain("3 evaluators from 2 organisations");
    expect(rendered.html).toContain("Hi Jo,");
    expect(rendered.html).toContain(`href="https://blockid.au${FEEDBACK_LETTER_DASHBOARD_PATH}"`);
    expect(rendered.html).toContain("Log 3 months of revenue");
    expect(rendered.html).toContain("+12 SVI pts");
    expect(rendered.html).toContain("Connect Stripe &lt;now&gt;");
    expect(rendered.html).toContain("Traction &amp; Revenue Evidence");
    expect(rendered.html).toContain("FOOTER-HTML");
    expect(rendered.html).toContain("Based on 3 evaluators from 2 organisations");
    expect(rendered.text).toContain("Hi Jo,");
    expect(rendered.text).toContain(`https://blockid.au${FEEDBACK_LETTER_DASHBOARD_PATH}`);
    expect(rendered.text).toContain("1. Log 3 months of revenue (+12 SVI pts · low effort · 1 week)");
    expect(rendered.text.trim().endsWith("FOOTER-TEXT")).toBe(true);
  });

  it("falls back to 'your startup' / 'Hi,' and skips the actions block when there are none", () => {
    const r = renderFounderFeedbackLetterEmail({ aggregate: AGG, letterMd: "## x", nextActions: [], startupName: null, displayName: null, siteUrl: "https://blockid.au" });
    expect(r.subject).toBe("What 3 investors said about your startup");
    expect(r.html).toContain("Hi,");
    expect(r.html).not.toContain("Your next 3 actions");
    expect(r.text).not.toContain("Your next 3 actions");
  });

  it("never carries a decision, conviction, evaluator id or note key", () => {
    expect(rendered.html + rendered.text).not.toMatch(/decision|conviction|assessorUserId|private_notes|shared_notes/i);
  });
});
