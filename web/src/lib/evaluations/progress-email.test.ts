import { describe, expect, it } from "vitest";

// Colocated vitest for lib/evaluations/progress-email.ts (T0273). Pins the
// two subject variants, the Movers table (name · SVI now · Δ · stage), the
// deadlines list (next 5, official link), the new-matches line, the two CTAs
// to /workspace/evaluations, the EvaluatorReportDisclaimer text, the
// money_radar unsubscribe link, escaping, and the forbidden words ("PhD",
// the retired A$5.50).

import { renderEvaluatorProgressEmail } from "./progress-email";
import { DISCLAIMER_SURFACES } from "@/lib/legal/surfaces";
import type { EvaluatorProgress, EvaluatorProgressItem, ProgressDeadline } from "./progress-shared";

function item(over: Partial<EvaluatorProgressItem> & { name: string; evaluationId: string }): EvaluatorProgressItem {
  return {
    projectId: over.evaluationId,
    projectSlug: over.name.toLowerCase(),
    label: null,
    sviNow: 60,
    sviPrev: 60,
    delta: 0,
    stageNow: 3,
    stagePrev: 3,
    stageChanged: false,
    newEvidence: 0,
    lastReport: null,
    money: { nextDeadline: null, deadlinesAhead: 0, newMatches: 0 },
    scoreHistory: [60, 60],
    ...over,
  };
}

const DEADLINE: ProgressDeadline = {
  evaluationId: "e-1",
  projectId: "p-1",
  startup: "Acme <Robotics>",
  refKind: "grant",
  refId: "g-mvp",
  name: "MVP Ventures",
  closesAt: "2026-09-27",
  daysLeft: 14,
  url: "https://www.nsw.gov.au/mvp",
};

function progress(over: Partial<EvaluatorProgress> = {}): EvaluatorProgress {
  const acme = item({ evaluationId: "e-1", name: "Acme <Robotics>", sviNow: 71.5, sviPrev: 62, delta: 9.5, stageNow: 4, stagePrev: 3, stageChanged: true, newEvidence: 2, money: { nextDeadline: DEADLINE, deadlinesAhead: 1, newMatches: 1 } });
  const beta = item({ evaluationId: "e-2", name: "Beta Health", sviNow: 50, sviPrev: 55, delta: -5, stageNow: 2, stagePrev: 2 });
  const gamma = item({ evaluationId: "e-3", name: "Gamma", sviNow: null, sviPrev: null, delta: null });
  return {
    userId: "u-1",
    periodStart: "2026-09-07T00:00:00.000Z",
    periodEnd: "2026-09-13T23:30:00.000Z",
    items: [acme, beta, gamma],
    movers: [acme, beta],
    deadlines: [DEADLINE, { ...DEADLINE, evaluationId: "e-2", startup: "Beta Health", refKind: "program", refId: "pr-1", name: "Cicada Innovations", closesAt: "2026-10-30", daysLeft: 47, url: null }],
    newMatches: 1,
    newEvidence: 2,
    digest_ready: true,
    ...over,
  };
}

describe("renderEvaluatorProgressEmail", () => {
  it("subject: '{n} of {m} startups moved' when there are movers", () => {
    const out = renderEvaluatorProgressEmail({ progress: progress(), displayName: "Sam" });
    expect(out.subject).toBe("Your weekly progress radar — 2 of 3 startups moved");
    expect(out.html).toContain("Hi Sam");
  });

  it("subject: 'no movement this week, {k} deadlines ahead' when nothing moved", () => {
    const p = progress({ movers: [], deadlines: [DEADLINE] });
    const out = renderEvaluatorProgressEmail({ progress: p });
    expect(out.subject).toBe("Your weekly progress radar — no movement this week, 1 deadline ahead");
    expect(out.html).toContain("No SVI movement across your 3 tracked startups this week.");
    expect(out.html).toContain("2 new evidence items landed");
    expect(out.html).toContain("Hi there");
  });

  it("Movers table has name · SVI now · Δ · stage (with the stage transition) and escapes names", () => {
    const { html, text } = renderEvaluatorProgressEmail({ progress: progress() });
    expect(html).toContain("Acme &lt;Robotics&gt;");
    expect(html).not.toContain("Acme <Robotics>");
    expect(html).toMatch(/72<\/td>/); // SVI now rounded
    expect(html).toContain("▲ +9.5");
    expect(html).toContain("MVP → Early traction");
    expect(html).toContain("▼ −5");
    expect(html).toContain("2 new evidence items");
    expect(text).toContain("- Acme <Robotics> · SVI 72 · ▲ +9.5 · MVP → Early traction");
    expect(text).toContain("- Beta Health · SVI 50 · ▼ −5 · Validation");
  });

  it("Deadlines & intakes list the next deadlines with the official link, and the new-matches line", () => {
    const { html, text } = renderEvaluatorProgressEmail({ progress: progress() });
    expect(html).toContain("Deadlines &amp; intakes across your startups");
    expect(html).toContain("<strong>MVP Ventures</strong> — Acme &lt;Robotics&gt; · closes in 14 days (27 Sept 2026)");
    expect(html).toContain('href="https://www.nsw.gov.au/mvp"');
    expect(html).toContain("<strong>Cicada Innovations</strong> — Beta Health · applications close in 47 days");
    expect(html).toContain("<strong>1</strong> new grant / program match this week across Acme &lt;Robotics&gt; (1).");
    expect(text).toContain("- MVP Ventures — Acme <Robotics> · in 14 days (2026-09-27) · https://www.nsw.gov.au/mvp");
  });

  it("empty deadlines / matches render the quiet copy", () => {
    const { html } = renderEvaluatorProgressEmail({ progress: progress({ deadlines: [], newMatches: 0 }) });
    expect(html).toContain("No dated grant or program deadlines ahead for the startups you track.");
    expect(html).toContain("No new grant or program matches this week.");
  });

  it("CTAs go to /workspace/evaluations with the G12 prices; disclaimer + unsubscribe present; no PhD / A$5.50", () => {
    const { html, text } = renderEvaluatorProgressEmail({
      progress: progress(),
      siteUrl: "https://blockid.au/",
      unsubscribeUrl: "https://blockid.au/unsubscribe?token=abc&category=money_radar",
    });
    expect(html).toContain('href="https://blockid.au/workspace/evaluations"');
    expect(html).toContain("Run a re-score (A$1)");
    expect(html).toContain("Run Trust BizReport");
    expect(html).toContain("A full Trust BizReport is A$3");
    const disclaimer = DISCLAIMER_SURFACES.evaluator_report.body_md.replace(/\*\*/g, "");
    expect(html).toContain("General information only — not financial, investment, or legal advice.");
    expect(html).toContain("does not hold an Australian Financial Services Licence (AFSL)");
    expect(text).toContain(disclaimer);
    expect(html).toContain('href="https://blockid.au/unsubscribe?token=abc&amp;category=money_radar"');
    expect(html).toContain("Unsubscribe from Progress Radar emails");
    expect(text).toContain("Unsubscribe from Progress Radar emails: https://blockid.au/unsubscribe?token=abc&category=money_radar");
    for (const s of [html, text, renderEvaluatorProgressEmail({ progress: progress() }).subject]) {
      expect(s).not.toMatch(/PhD/);
      expect(s).not.toContain("A$5.50");
      expect(s).not.toContain("5.50");
    }
  });

  it("omits the unsubscribe line when no URL is supplied", () => {
    const { html, text } = renderEvaluatorProgressEmail({ progress: progress() });
    expect(html).not.toContain("Unsubscribe");
    expect(text).not.toContain("Unsubscribe");
  });
});
