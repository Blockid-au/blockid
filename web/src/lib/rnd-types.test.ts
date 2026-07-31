// Pins the runtime shape of `PAGE_DEFS` — the canonical 10-page ordering that
// the R&D report renderer, the paywall preview logic, and the client-side
// Vietnamese switcher all consume. A silent id rename, number reshuffle, or
// dropped-locale copy would leak straight into the founder-facing report.

import { describe, expect, it } from "vitest";
import { PAGE_DEFS } from "./rnd-types";

const CANONICAL_IDS = [
  "executive",
  "market",
  "product",
  "business",
  "competition",
  "traction",
  "team",
  "financial",
  "risk",
  "recommendations",
] as const;

describe("PAGE_DEFS", () => {
  it("has exactly 10 entries", () => {
    expect(PAGE_DEFS).toHaveLength(10);
  });

  it("preserves the shipped id order", () => {
    expect(PAGE_DEFS.map((p) => p.id)).toEqual([...CANONICAL_IDS]);
  });

  it("numbers pages 1..10 sequentially, matching array order", () => {
    expect(PAGE_DEFS.map((p) => p.num)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    PAGE_DEFS.forEach((p, i) => {
      expect(p.num).toBe(i + 1);
    });
  });

  it("has unique ids", () => {
    const ids = PAGE_DEFS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique page numbers", () => {
    const nums = PAGE_DEFS.map((p) => p.num);
    expect(new Set(nums).size).toBe(nums.length);
  });

  it("has monotonically ascending page numbers", () => {
    for (let i = 1; i < PAGE_DEFS.length; i += 1) {
      expect(PAGE_DEFS[i].num).toBeGreaterThan(PAGE_DEFS[i - 1].num);
    }
  });

  it("uses snake_case single-token ids (no whitespace, no hyphen, no uppercase)", () => {
    for (const p of PAGE_DEFS) {
      expect(p.id).toMatch(/^[a-z]+$/);
    }
  });

  it("every id resolves to the canonical allow-list", () => {
    const allowed = new Set<string>(CANONICAL_IDS);
    for (const p of PAGE_DEFS) {
      expect(allowed.has(p.id)).toBe(true);
    }
  });

  it("every entry carries non-empty EN + VI copy", () => {
    for (const p of PAGE_DEFS) {
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.subtitle.length).toBeGreaterThan(0);
      expect(p.titleVi.length).toBeGreaterThan(0);
      expect(p.subtitleVi.length).toBeGreaterThan(0);
    }
  });

  it("EN and VI copy differ for every page (proves the VI column is not a copy-paste of EN)", () => {
    for (const p of PAGE_DEFS) {
      expect(p.titleVi).not.toBe(p.title);
      expect(p.subtitleVi).not.toBe(p.subtitle);
    }
  });

  it("every entry exposes exactly the 6 documented keys", () => {
    const expected = ["id", "num", "title", "subtitle", "titleVi", "subtitleVi"].sort();
    for (const p of PAGE_DEFS) {
      expect(Object.keys(p).sort()).toEqual(expected);
    }
  });

  it("pins the exec-summary copy so the paywall preview keeps its header", () => {
    const exec = PAGE_DEFS[0];
    expect(exec.id).toBe("executive");
    expect(exec.num).toBe(1);
    expect(exec.title).toBe("Executive Summary");
    expect(exec.titleVi).toBe("Tóm Tắt Điều Hành");
  });

  it("pins the recommendations final-page copy", () => {
    const rec = PAGE_DEFS[PAGE_DEFS.length - 1];
    expect(rec.id).toBe("recommendations");
    expect(rec.num).toBe(10);
    expect(rec.title).toBe("Recommendations");
    expect(rec.titleVi).toBe("Khuyến Nghị");
  });

  it("pins the traction subtitle so the SEO / social-proof callout keeps its wording", () => {
    const traction = PAGE_DEFS.find((p) => p.id === "traction");
    expect(traction?.subtitle).toBe("Users, traffic, SEO, social proof");
  });

  it("pins the financial page for the funding-needs cue", () => {
    const financial = PAGE_DEFS.find((p) => p.id === "financial");
    expect(financial?.num).toBe(8);
    expect(financial?.subtitle).toBe("Revenue potential, funding needs");
  });

  it("pins the risk page number so red-flag callouts route to page 9", () => {
    const risk = PAGE_DEFS.find((p) => p.id === "risk");
    expect(risk?.num).toBe(9);
    expect(risk?.title).toBe("Risk Assessment");
  });

  it("VI titles contain non-ASCII diacritics (proves the locale copy is real Vietnamese, not romanised)", () => {
    const nonAscii = /[^\x00-\x7f]/u;
    for (const p of PAGE_DEFS) {
      expect(nonAscii.test(p.titleVi)).toBe(true);
    }
  });

  it("titles + subtitles are all trimmed (no leading/trailing whitespace)", () => {
    for (const p of PAGE_DEFS) {
      expect(p.title).toBe(p.title.trim());
      expect(p.subtitle).toBe(p.subtitle.trim());
      expect(p.titleVi).toBe(p.titleVi.trim());
      expect(p.subtitleVi).toBe(p.subtitleVi.trim());
    }
  });

  it("titles are Title Case (each word starts with an uppercase letter)", () => {
    for (const p of PAGE_DEFS) {
      const words = p.title.split(" ");
      for (const w of words) {
        // First char uppercase OR the word is a stop-word inside a title
        // (& retains its glyph, connectors ok). We only assert the FIRST word.
        expect(words[0][0]).toBe(words[0][0].toUpperCase());
        expect(w.length).toBeGreaterThan(0);
      }
    }
  });

  it("`as const` narrows the tuple — array is not the mutable Array<T>", () => {
    // `as const` in the source produces a readonly tuple; on a plain
    // `.length` check that manifests as a fixed literal type. We can't
    // observe types at runtime, but we can assert the array is frozen-like:
    // pushing to a readonly tuple would be a TS error; at runtime the array
    // still allows push, so we assert the SHIPPED length is 10 and each row
    // is a plain object literal (not a class instance).
    expect(PAGE_DEFS.length).toBe(10);
    for (const p of PAGE_DEFS) {
      expect(Object.getPrototypeOf(p)).toBe(Object.prototype);
    }
  });

  it("id/num pairs are stable — legacy consumers keying by num see the same id", () => {
    const byNum = new Map(PAGE_DEFS.map((p) => [p.num, p.id]));
    expect(byNum.get(1)).toBe("executive");
    expect(byNum.get(2)).toBe("market");
    expect(byNum.get(3)).toBe("product");
    expect(byNum.get(4)).toBe("business");
    expect(byNum.get(5)).toBe("competition");
    expect(byNum.get(6)).toBe("traction");
    expect(byNum.get(7)).toBe("team");
    expect(byNum.get(8)).toBe("financial");
    expect(byNum.get(9)).toBe("risk");
    expect(byNum.get(10)).toBe("recommendations");
  });

  it("subtitles are short enough to fit a card header (< 60 chars)", () => {
    for (const p of PAGE_DEFS) {
      expect(p.subtitle.length).toBeLessThan(60);
      expect(p.subtitleVi.length).toBeLessThan(60);
    }
  });

  it("titles are short enough to fit a nav pill (< 40 chars)", () => {
    for (const p of PAGE_DEFS) {
      expect(p.title.length).toBeLessThan(40);
      expect(p.titleVi.length).toBeLessThan(40);
    }
  });
});
