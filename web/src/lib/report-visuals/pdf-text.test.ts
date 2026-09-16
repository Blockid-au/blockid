// pdf-text — WinAnsi shim for the react-pdf twins (G13-W4). The W4 review
// found a literal NUL byte inside the two character classes (git treated the
// file as binary); S-R5 replaced it with unicode escapes. This test pins
// both the behaviour and the "no control bytes in source" invariant.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pdfSafeText } from "./pdf-text";

describe("pdfSafeText", () => {
  it("keeps Latin-1 text and WinAnsi punctuation untouched", () => {
    expect(pdfSafeText("Café — “quoted” • 12 × 3 ©")).toBe("Café — “quoted” • 12 × 3 ©");
  });

  it("strips Vietnamese tone marks to the base letter (Helvetica has no glyph)", () => {
    expect(pdfSafeText("Định giá khởi nghiệp")).toBe("Dinh giá khoi nghiêp");
  });

  it("drops emoji / CJK instead of printing boxes", () => {
    expect(pdfSafeText("Score 72 🚀 漢字")).toBe("Score 72  ");
  });

  it("unicode mode (S-R5 Noto Sans): keeps Vietnamese diacritics, maps the arrow glyphs, still drops emoji / CJK", () => {
    expect(pdfSafeText("Định giá khởi nghiệp → 72", { unicode: true })).toBe("Định giá khởi nghiệp -> 72");
    expect(pdfSafeText("Score 🚀 漢字 ệ", { unicode: true })).toBe("Score   ệ");
  });

  it("coerces null / numbers", () => {
    expect(pdfSafeText(null)).toBe("");
    expect(pdfSafeText(42)).toBe("42");
  });

  it("source file carries no raw control bytes (git must see it as text)", () => {
    const src = readFileSync(new URL("./pdf-text.ts", import.meta.url), "utf8");
    const controlBytes = new RegExp("[" + String.fromCharCode(0) + "-" + String.fromCharCode(8) + String.fromCharCode(11, 12) + String.fromCharCode(14) + "-" + String.fromCharCode(31) + "]");
    expect(controlBytes.test(src)).toBe(false);
    expect(src).toContain("\\u0000-\\u00ff");
  });
});
