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
];

describe("startup-journey chapter registry", () => {
  it("publishes chapters 1–8 (B2 + B3) in order", () => {
    const chapters = listChapters();
    expect(chapters.map((c) => c.slug)).toEqual(EXPECTED_SLUGS);
    expect(chapters.map((c) => c.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(chapters.map((c) => c.phase)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("exposes the same slug set through allChapterSlugs()", () => {
    expect(allChapterSlugs()).toEqual(EXPECTED_SLUGS);
  });

  it("returns null for unknown slugs and never throws", () => {
    expect(getChapter("bogus")).toBeNull();
    expect(getChapter("09-funding")).toBeNull();
    expect(isChapterSlug("09-funding")).toBe(false);
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

describe("getAdjacentChapters()", () => {
  it("returns null previous for the first chapter and null next for the last", () => {
    expect(getAdjacentChapters("01-vision").previous).toBeNull();
    expect(getAdjacentChapters("01-vision").next?.slug).toBe("02-idea-validation");

    expect(getAdjacentChapters("08-team").next).toBeNull();
    expect(getAdjacentChapters("08-team").previous?.slug).toBe("07-growth");
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
});
