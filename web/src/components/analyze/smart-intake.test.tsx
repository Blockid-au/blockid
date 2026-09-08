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

  it("short text (<40 tokens) is empty with helper reason", () => {
    const r = classifyInput({ text: "we build a fintech app", file: null });
    expect(r.variant).toBe("empty");
    expect(r.chipLabel).toMatch(/\d+\/40/);
  });

  it("long text (≥40 tokens) is idea variant", () => {
    const long = Array.from({ length: 55 }, (_, i) => `word${i}`).join(" ");
    const r = classifyInput({ text: long, file: null });
    expect(r.variant).toBe("idea");
    expect(r.ctaLabel).toMatch(/classify/i);
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
