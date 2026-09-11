// Colocated vitest for the evaluator messaging pack (S13-A): the 4 step
// titles verbatim (they are the checklist contract), the speakability rule
// (≤ 2 sentences), the number guard (no "PhD"; only public-ladder prices),
// flat keys, and `fill()` / `trialDaysLeftLine()` behaviour.

import { describe, expect, it } from "vitest";
import { EVALUATIONS_COPY, evaluationsCopy, fill, trialDaysLeftLine } from "./copy";

/** Sentence count: terminal punctuation followed by whitespace; "A$3." and "8-dimension" do not split. */
function sentences(s: string): number {
  const parts = s
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z{0-9"'])/)
    .filter((p) => p.trim().length > 0);
  return Math.max(1, parts.length);
}

describe("step titles (verbatim — the checklist contract)", () => {
  it("names the 4 activation steps", () => {
    expect(EVALUATIONS_COPY["checklist.step1.title"]).toBe("Add the first startup you're evaluating");
    expect(EVALUATIONS_COPY["checklist.step2.title"]).toBe("Run your included Trust BizReport");
    expect(EVALUATIONS_COPY["checklist.step3.title"]).toBe("Set your thesis so matching founders can find you");
    expect(EVALUATIONS_COPY["checklist.step4.title"]).toBe("Add a startup to your watchlist / cohort");
  });

  it("reminder line names the trial end and carries the deep-link CTA", () => {
    expect(evaluationsCopy("reminder.reportWaiting", { trial_end: "Friday 18 Sep" })).toBe(
      "Your included Trust BizReport is still waiting — run it before Friday 18 Sep.",
    );
    expect(EVALUATIONS_COPY["reminder.reportWaitingCta"]).toBe("Run it now");
  });
});

describe("speakability + number guards", () => {
  const entries = Object.entries(EVALUATIONS_COPY) as [string, string][];

  it("every string is ≤ 2 sentences and non-empty", () => {
    for (const [key, value] of entries) {
      expect(value.trim().length, key).toBeGreaterThan(0);
      expect(sentences(value), `${key}: "${value}"`).toBeLessThanOrEqual(2);
    }
  });

  it("never says PhD, A$5.50 or A$99; any price is a public-ladder one", () => {
    const text = entries.map(([, v]) => v).join("\n");
    expect(text).not.toMatch(/PhD/);
    expect(text).not.toMatch(/5\.50|A\$99\b/);
    const allowed = new Set(["A$79", "A$149", "A$349", "A$3"]);
    for (const m of text.matchAll(/A\$\d+(?:\.\d+)?/g)) expect(allowed.has(m[0]), m[0]).toBe(true);
  });

  it("keys are flat dot-paths (i18n-ready)", () => {
    for (const [key] of entries) expect(key).toMatch(/^(checklist|reminder)\.[a-zA-Z0-9.]+$/);
  });
});

describe("helpers", () => {
  it("fill() replaces known tokens, prints numbers, leaves unknown tokens visible", () => {
    expect(fill("{done} of {total} done", { done: 2, total: 4 })).toBe("2 of 4 done");
    expect(fill("run it before {trial_end}", {})).toBe("run it before {trial_end}");
    expect(evaluationsCopy("checklist.progress", { done: 0, total: 4 })).toBe("0 of 4 done");
  });

  it("trialDaysLeftLine pluralises", () => {
    expect(trialDaysLeftLine(1)).toBe("1 day left in your trial");
    expect(trialDaysLeftLine(5)).toBe("5 days left in your trial");
  });
});
