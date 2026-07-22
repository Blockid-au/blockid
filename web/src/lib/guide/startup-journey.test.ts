import { describe, expect, it } from "vitest";
import {
  allChapterSlugs,
  getAdjacentChapters,
  getChapter,
  isChapterSlug,
  listChapters,
  type ChapterSlug,
} from "./startup-journey";
import { PHASE_LABELS } from "@/lib/showcase/gallery";

const EXPECTED_SLUGS: ChapterSlug[] = [
  "01-vision",
  "02-idea-validation",
  "03-market-research",
  "04-mvp",
  "05-pmf",
  "06-revenue",
  "07-growth",
  "08-team",
  "09-funding",
  "10-fundraise",
  "11-scale",
  "12-exit",
];

describe("startup-journey chapter registry", () => {
  it("publishes chapters 1–12 (B2 + B3 + B4) in order", () => {
    const chapters = listChapters();
    expect(chapters.map((c) => c.slug)).toEqual(EXPECTED_SLUGS);
    expect(chapters.map((c) => c.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(chapters.map((c) => c.phase)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("exposes the same slug set through allChapterSlugs()", () => {
    expect(allChapterSlugs()).toEqual(EXPECTED_SLUGS);
  });

  it("returns null for unknown slugs and never throws", () => {
    expect(getChapter("bogus")).toBeNull();
    expect(getChapter("13-post-exit")).toBeNull();
    expect(isChapterSlug("13-post-exit")).toBe(false);
  });

  it("resolves known slugs and confirms isChapterSlug()", () => {
    for (const slug of EXPECTED_SLUGS) {
      expect(isChapterSlug(slug)).toBe(true);
      const chapter = getChapter(slug);
      expect(chapter).not.toBeNull();
      expect(chapter?.slug).toBe(slug);
    }
  });
});

describe("chapter content coverage", () => {
  it("every chapter has non-empty EN + VI copy across all six required sections", () => {
    for (const chapter of listChapters()) {
      // (a) founder action
      expect(chapter.founderAction.en.length).toBeGreaterThan(0);
      expect(chapter.founderAction.vi.length).toBeGreaterThan(0);
      // (b) agents invoked — at least three bullets each
      expect(chapter.agentsInvoked.en.length).toBeGreaterThanOrEqual(3);
      expect(chapter.agentsInvoked.vi.length).toBe(chapter.agentsInvoked.en.length);
      // (c) expected outputs — at least three bullets each
      expect(chapter.expectedOutputs.en.length).toBeGreaterThanOrEqual(3);
      expect(chapter.expectedOutputs.vi.length).toBe(chapter.expectedOutputs.en.length);
      // (d) common pitfalls — at least three each
      expect(chapter.commonPitfalls.en.length).toBeGreaterThanOrEqual(3);
      expect(chapter.commonPitfalls.vi.length).toBe(chapter.commonPitfalls.en.length);
      // (e) showcase example + cta
      expect(chapter.showcaseExample.en.length).toBeGreaterThan(0);
      expect(chapter.showcaseExample.vi.length).toBeGreaterThan(0);
      expect(chapter.cta.en.length).toBeGreaterThan(0);
      expect(chapter.cta.vi.length).toBeGreaterThan(0);
      // title + summary
      expect(chapter.title.en.length).toBeGreaterThan(0);
      expect(chapter.title.vi.length).toBeGreaterThan(0);
      expect(chapter.summary.en.length).toBeGreaterThan(0);
      expect(chapter.summary.vi.length).toBeGreaterThan(0);
    }
  });

  it("phaseLabel is sourced from PHASE_LABELS so slug labels stay canonical", () => {
    for (const chapter of listChapters()) {
      expect(chapter.phaseLabel).toBe(PHASE_LABELS[chapter.phase]);
    }
  });
});

describe("qualifyingTests (Div 83A checklist on chapter 08)", () => {
  it("chapter 08-team publishes the eight Div 83A tests EN + VI", () => {
    const c = getChapter("08-team");
    expect(c).not.toBeNull();
    expect(c?.qualifyingTests).toBeDefined();
    expect(c?.qualifyingTests?.en.length).toBe(8);
    expect(c?.qualifyingTests?.vi.length).toBe(8);
    // Every test cites at least one statutory reference so the checklist stays
    // auditable against the div83a-checker.ts pure evaluator.
    for (const line of c?.qualifyingTests?.en ?? []) {
      expect(line.length).toBeGreaterThan(20);
    }
  });

  it("no other chapter carries qualifyingTests (single-chapter feature)", () => {
    for (const chapter of listChapters()) {
      if (chapter.slug === "08-team") continue;
      expect(chapter.qualifyingTests).toBeUndefined();
    }
  });
});

describe("getAdjacentChapters()", () => {
  it("returns null previous for the first chapter and null next for the last", () => {
    expect(getAdjacentChapters("01-vision").previous).toBeNull();
    expect(getAdjacentChapters("01-vision").next?.slug).toBe("02-idea-validation");

    expect(getAdjacentChapters("12-exit").next).toBeNull();
    expect(getAdjacentChapters("12-exit").previous?.slug).toBe("11-scale");
  });

  it("returns both neighbours for a middle chapter", () => {
    const { previous, next } = getAdjacentChapters("02-idea-validation");
    expect(previous?.slug).toBe("01-vision");
    expect(next?.slug).toBe("03-market-research");
  });

  it("stitches the B2/B3 boundary at 04-mvp ↔ 05-pmf", () => {
    expect(getAdjacentChapters("04-mvp").next?.slug).toBe("05-pmf");
    expect(getAdjacentChapters("05-pmf").previous?.slug).toBe("04-mvp");
  });

  it("stitches the B3/B4 boundary at 08-team ↔ 09-funding", () => {
    expect(getAdjacentChapters("08-team").next?.slug).toBe("09-funding");
    expect(getAdjacentChapters("09-funding").previous?.slug).toBe("08-team");
  });
});
