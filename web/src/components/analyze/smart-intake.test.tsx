// Colocated tests for SmartIntake.
//
// The public surface is the pure `classifyInput` truth table — it drives
// the CTA label, the chip, and which downstream endpoint the parent
// fires. Interactive behaviour (drag/drop, debounced fetch) is exercised
// via Playwright E2E in web/tests/e2e/analyze/ per the plan.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { classifyInput, SmartIntake } from "./smart-intake";

describe("classifyInput — truth table", () => {
  it("empty input is empty variant", () => {
    const r = classifyInput({ text: "", file: null });
    expect(r.variant).toBe("empty");
  });

  it("URL string is url variant", () => {
    const r = classifyInput({ text: "https://stripe.com/atlas", file: null });
    expect(r.variant).toBe("url");
    expect(r.ctaLabel).toMatch(/visit/i);
  });

  it("bare domain with no scheme still classifies as url", () => {
    const r = classifyInput({ text: "stripe.com", file: null });
    expect(r.variant).toBe("url");
  });

  // The floor is 8 tokens, not 40. A founder describing their business in one
  // sentence should be able to run it; the old 40-word bar left the CTA stuck
  // on "Keep typing…" for most genuine attempts.
  it("a bare fragment is still too thin to classify", () => {
    const r = classifyInput({ text: "fintech app", file: null });
    expect(r.variant).toBe("empty");
    expect(r.chipLabel).toMatch(/\d+ words/);
    expect(r.reason).toMatch(/tell us a little more/i);
  });

  it("shows no chip and an inviting CTA when the box is empty", () => {
    const r = classifyInput({ text: "", file: null });
    expect(r.variant).toBe("empty");
    expect(r.chipLabel).toBe("");
    expect(r.ctaLabel).toMatch(/paste a link, drop a deck, or type an idea/i);
  });

  it("one descriptive sentence is enough to classify as an idea", () => {
    const r = classifyInput({
      text: "We build an AI copilot that drafts letters of advice for Australian solicitors.",
      file: null,
    });
    expect(r.variant).toBe("idea");
    expect(r.ctaLabel).toMatch(/classify/i);
  });

  it("nudges for more detail on a short idea, but still lets it run", () => {
    const r = classifyInput({
      text: "An AI copilot for Australian solicitors that drafts advice letters.",
      file: null,
    });
    expect(r.variant).toBe("idea");
    expect(r.chipLabel).toMatch(/more detail sharpens it/i);
  });

  it("long text is idea variant without the nudge", () => {
    const long = Array.from({ length: 55 }, (_, i) => `word${i}`).join(" ");
    const r = classifyInput({ text: long, file: null });
    expect(r.variant).toBe("idea");
    expect(r.ctaLabel).toMatch(/classify/i);
    expect(r.chipLabel).not.toMatch(/more detail/i);
  });

  it("PDF file (mime) is deck variant regardless of text", () => {
    const r = classifyInput({
      text: "",
      file: { name: "deck.pdf", size: 1024 * 1024, type: "application/pdf" },
    });
    expect(r.variant).toBe("deck");
    expect(r.chipLabel).toMatch(/MB/);
    expect(r.ctaLabel).toMatch(/read my deck/i);
  });

  it("PDF file recognised by extension when mime is missing", () => {
    const r = classifyInput({
      text: "",
      file: { name: "deck.pdf", size: 2 * 1024 * 1024, type: "" },
    });
    expect(r.variant).toBe("deck");
  });

  it("PPTX file classifies as deck", () => {
    const r = classifyInput({
      text: "",
      file: {
        name: "pitch.pptx",
        size: 3 * 1024 * 1024,
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      },
    });
    expect(r.variant).toBe("deck");
  });

  it("DOCX file classifies as deck", () => {
    const r = classifyInput({
      text: "",
      file: {
        name: "one-pager.docx",
        size: 500_000,
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    });
    expect(r.variant).toBe("deck");
  });

  it("file wins over text when both present", () => {
    const long = Array.from({ length: 60 }, (_, i) => `w${i}`).join(" ");
    const r = classifyInput({
      text: long,
      file: { name: "deck.pdf", size: 1024, type: "application/pdf" },
    });
    expect(r.variant).toBe("deck");
  });
});

describe("SmartIntake static render", () => {
  it("mounts with the label + upload affordance", () => {
    const out = renderToStaticMarkup(<SmartIntake />);
    expect(out).toContain("smart-intake");
    expect(out).toMatch(/upload/i);
  });
});

describe("SmartIntake pill shell", () => {
  const out = renderToStaticMarkup(<SmartIntake />);

  // The ring is AnimatedSearchFrame's padding band. If the child does not
  // carry the same radius the band shows a square shoulder outside a
  // rounded child — the exact defect the pill redesign fixed.
  it("frame and field agree on the corner radius", () => {
    expect(out).toContain("rounded-[1.75rem] sm:rounded-full");
    expect(out).toContain("rounded-[inherit]");
  });

  it("keeps the rotating ring wrapper", () => {
    expect(out).toContain("asf-wrap");
  });

  it("still exposes the file input and a labelled text input", () => {
    expect(out).toContain('id="smart-intake-file"');
    expect(out).toContain('for="smart-intake-input"');
  });
});

describe("empty-state CTA copy", () => {
  // The classifier still reports the long invitation — analyze-root and any
  // telemetry consumer depend on it. The *button* must not render it: inside
  // a pill it squeezed the input to a third of the bar at 1440.
  it("classifyInput keeps the long invitation", () => {
    expect(classifyInput({ text: "", file: null }).ctaLabel).toMatch(
      /paste a link, drop a deck, or type an idea/i,
    );
  });

  it("the rendered button says Analyse and the invitation moves below", () => {
    const out = renderToStaticMarkup(<SmartIntake />);
    expect(out).toContain(">Analyse<");
    expect(out).toContain("Drop a PDF, DOCX or PPTX here");
    expect(out).not.toMatch(/>Paste a link, drop a deck, or type an idea</);
  });
});
