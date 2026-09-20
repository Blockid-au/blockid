// Block 6 · What investors said — SSR pins (G14-S34). The block is optional
// (landingBlocksFor appends it only with a letter); when mounted it shows
// the k / org basis, per-dimension bars with the weakest flagged, risk
// buckets, questions, three next actions with the feedback_action_clicked
// link contract, the full letter behind <details>, the VI body when the
// locale is vi, and never a forbidden field. The member view keeps the
// tracker from marking the owner's letter opened.

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const track = vi.fn();
vi.mock("@/lib/analytics", () => ({ trackEvent: (...a: unknown[]) => track(...a) }));

import type { FeedbackLetterRow } from "@/lib/evaluations/feedback-letter-store";
import { LANDING_BLOCKS, OPTIONAL_LANDING_BLOCKS, landingBlocksFor } from "./landing-blocks";
import { LetterMarkdown, WHAT_INVESTORS_SAID_ID, WhatInvestorsSaid } from "./what-investors-said";
import { FeedbackActionLink } from "./what-investors-said-client";

const ctx = { phase: "customer_dev", plan: "founder_free", persona: "founder" };

const LETTER: FeedbackLetterRow = {
  id: "l-1",
  projectId: "p-1",
  founderUserId: "u-f",
  evaluationIds: ["e-1", "e-2", "e-3"],
  k: 3,
  orgCount: 2,
  windowStart: null,
  windowEnd: "2026-09-20T00:00:00.000Z",
  aggregate: {
    k: 3,
    orgCount: 2,
    evaluationIds: ["e-1", "e-2", "e-3"],
    dimensions: [
      { key: "FTV", mean: 4.3, n: 3, agreePct: 75, disagreePct: 25 },
      { key: "MPC", mean: null, n: 0, agreePct: null, disagreePct: null },
      { key: "TRE", mean: 1.7, n: 3, agreePct: 25, disagreePct: 50 },
    ],
    weakestDim: "TRE",
    strongestDim: "FTV",
    risks: [
      { dimension: "TRE", count: 3, highOrCritical: 2, titles: ["No recurring revenue"] },
      { dimension: "general", count: 1, highOrCritical: 0, titles: ["Key-person risk"] },
    ],
    questions: [
      { text: "What is your churn?", dimension: "TRE", asked: 2 },
      { text: "Who signs the first enterprise contract?", dimension: null, asked: 1 },
    ],
    generatedAt: "2026-09-20T22:00:00.000Z",
  },
  letterMd: "## What investors said\n\n### Start here\nEvaluators rated **Traction & Revenue Evidence** lowest.\n\n- one\n- two\n\n_Individual evaluators are never identified._",
  letterMdVi: "## Nhà đầu tư nói gì\n\n### Bắt đầu từ đây\nNội dung tiếng Việt.",
  nextActions: [
    { id: "tre-01", title: "Connect Stripe or Xero", rationale: "r1", dimension: "TRE", sviBenefit: 15, effort: "low", timeToComplete: "1 day", href: "/workspace/finance/revenue" },
    { id: "tre-02", title: "Log 3 months of revenue", rationale: "r2", dimension: "TRE", sviBenefit: 12, effort: "low", timeToComplete: "1 week", href: "/workspace/finance/revenue" },
    { id: "tre-03", title: "Sign two paid pilots", rationale: "r3", dimension: "TRE", sviBenefit: 10, effort: "high", timeToComplete: "1–3 months", href: "/workspace/finance/revenue" },
    { id: "tre-04", title: "never shown", rationale: "r4", dimension: "TRE", sviBenefit: 1, effort: "low", timeToComplete: "x", href: "/x" },
  ],
  status: "sent",
  sentAt: "2026-09-20T22:01:00.000Z",
  openedAt: null,
  emailMessageId: "<m>",
  createdAt: "c",
};

beforeEach(() => track.mockReset());

describe("landingBlocksFor (optional block registry)", () => {
  it("phase-0 / no letter keeps the five blocks; a letter appends block 6; a member still loses block 3", () => {
    expect(LANDING_BLOCKS.length).toBe(5);
    expect(OPTIONAL_LANDING_BLOCKS).toEqual(["executive-synthesis", "what-investors-said"]);
    expect(landingBlocksFor()).toEqual([...LANDING_BLOCKS]);
    expect(landingBlocksFor({ hasFeedbackLetter: true })).toEqual([...LANDING_BLOCKS, "what-investors-said"]);
    expect(landingBlocksFor({ isMember: true, hasFeedbackLetter: true })).toEqual(["where-you-stand", "next-best-action", "evidence-to-add", "your-reports", "what-investors-said"]);
  });
});

describe("WhatInvestorsSaid", () => {
  it("renders the block with the deep-link id, basis line, weakest pill, dimension bars (rated only), risks, questions, 3 actions and the letter", () => {
    const html = renderToStaticMarkup(<WhatInvestorsSaid ctx={ctx} letter={LETTER} />);
    expect(html).toContain(`id="${WHAT_INVESTORS_SAID_ID}"`);
    expect(html).toContain('data-landing-block="what-investors-said"');
    expect(html).not.toContain("data-landing-empty");
    expect(html).toContain("lg:col-span-6");
    expect(html).toContain("Based on 3 evaluators from 2 organisations");
    expect(html).toContain('data-landing-weakest="TRE"');
    expect(html).toContain("Lowest: Traction &amp; Revenue Evidence");
    // bars: FTV + TRE rated, MPC (n = 0) skipped
    expect(html).toContain('data-feedback-dim="FTV"');
    expect(html).toContain('data-feedback-dim="TRE"');
    expect(html).not.toContain('data-feedback-dim="MPC"');
    expect(html).toContain("4.3/5");
    expect(html).toContain("1.7/5");
    expect(html).toMatch(/data-feedback-dim="TRE"[\s\S]*?bg-bear[\s\S]*?width:34%/);
    expect(html).toContain(">75%<");
    // risks + questions
    expect(html).toContain('data-feedback-risk="TRE"');
    expect(html).toContain("No recurring revenue");
    expect(html).toContain("×3");
    expect(html).toContain('data-feedback-risk="general"');
    expect(html).toContain("What is your churn?");
    // three actions, the fourth never shown; each carries the click contract
    expect((html.match(/data-feedback-action-row="/g) ?? []).length).toBe(3);
    expect(html).toContain('data-feedback-action="tre-01"');
    expect(html).not.toContain("never shown");
    expect(html).toContain("+15 pts");
    expect(html).toContain("low effort · 1 day");
    // primary CTA = the first action, with the block attribute
    expect(html).toMatch(/data-landing-cta="what-investors-said" data-testid="landing-feedback-cta"[^>]*href="\/workspace\/finance\/revenue">Connect Stripe or Xero</);
    // full letter behind <details>
    expect(html).toContain("data-landing-feedback-letter");
    expect(html).toContain("Read the full letter");
    expect(html).toContain("<strong>Traction &amp; Revenue Evidence</strong>");
    expect(html).toContain("<em>Individual evaluators are never identified.</em>");
    expect(html).toContain("<li><span>one</span></li>");
    // never a forbidden field
    expect(html).not.toMatch(/decision|conviction|assessorUserId|private|u-f|<m>/);
  });

  it("locale vi: the VI frame copy + the VI letter body", () => {
    const html = renderToStaticMarkup(<WhatInvestorsSaid ctx={ctx} letter={LETTER} locale="vi" />);
    expect(html).toContain("Nhà đầu tư nói gì");
    expect(html).toContain("Dựa trên 3 người đánh giá từ 2 tổ chức");
    expect(html).toContain("Nội dung tiếng Việt.");
    expect(html).not.toContain("Read the full letter");
    expect(html).toContain("Thấp nhất: Bằng chứng tăng trưởng &amp; doanh thu");
  });

  it("member (read-only): secondary CTA; no actions → a generic evidence CTA", () => {
    const member = renderToStaticMarkup(<WhatInvestorsSaid ctx={ctx} letter={LETTER} canEdit={false} />);
    expect(member).toContain("border-line-subtle bg-surface px-3");
    const none = renderToStaticMarkup(<WhatInvestorsSaid ctx={ctx} letter={{ ...LETTER, nextActions: [], aggregate: { ...LETTER.aggregate, risks: [], questions: [] } }} />);
    expect(none).toMatch(/data-landing-cta="what-investors-said"[^>]*href="\/workspace\/evidence">What to add next</);
    expect(none).not.toContain("data-landing-feedback-actions");
    expect(none).not.toContain("data-landing-feedback-risks");
  });

  it("FeedbackActionLink carries the action id and fires feedback_action_clicked on click", () => {
    const html = renderToStaticMarkup(
      <FeedbackActionLink letterId="l-1" actionId="tre-01" dimension="TRE" href="/workspace/finance/revenue">
        Go
      </FeedbackActionLink>,
    );
    expect(html).toContain('href="/workspace/finance/revenue"');
    expect(html).toContain('data-feedback-action="tre-01"');
  });

  it("LetterMarkdown drops the H2 (the block header owns the title) and keeps H3 / bullets / bold / em", () => {
    const html = renderToStaticMarkup(<LetterMarkdown md={"## Title\n\n### Sub\nBody **bold** and _em_\n\n- a\n- b"} />);
    expect(html).not.toContain("Title");
    expect(html).toContain("<h4");
    expect(html).toContain("<span>Sub</span></h4>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>em</em>");
    expect(html).toContain("<li><span>a</span></li>");
  });
});
