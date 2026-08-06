/**
 * Colocated tests for the landing "See How It Works" copy registry
 * (src/content/how-it-works-copy.ts).
 *
 * Pins the editorial rules the module's own header contract asserts
 * (docs/plans/how-it-works-2026-07-25/03-copy-cta.md):
 *   1. Bilingual completeness — every LocalisedText carries non-empty
 *      { en, vi } on every field the section renders.
 *   2. Five ordered steps with the exact id sequence
 *      search → onboard → score → build → raise (canonical narrative
 *      order used by the landing hero + Remotion composition).
 *   3. Each step's English body ≤ 18 words (readability rule).
 *   4. Each step title opens with a concrete verb (no noun-phrase
 *      titles, which flattened the copy in the pre-upgradeV2 branch).
 *   5. Jargon-explained-inline: if the copy references SVI, MRR, or
 *      "cap table", the expansion sits next to it (protects the
 *      onboarding funnel from unexplained acronym drop-off).
 *   6. No marketing hyperbole — a small banned-word list guards
 *      against phrases like "revolutionary" / "world-class" creeping
 *      back in during copy tweaks.
 *   7. Icon keys land in the whitelisted lucide-react enum and
 *      appear at most once so the section never renders duplicates.
 *   8. CTA href is an in-app route ("/…") — the video-tagline field
 *      stays present so Remotion has a caption to render.
 *
 * These are structural regressions the loop can catch pre-deploy;
 * they do not attempt to validate copy quality itself.
 */

import { describe, expect, it } from "vitest";

import HOW_IT_WORKS_COPY, {
  type HowItWorksIcon,
  type HowItWorksStep,
  type LocalisedText,
} from "./how-it-works-copy";

const ALLOWED_ICONS: readonly HowItWorksIcon[] = [
  "Search",
  "ClipboardList",
  "Gauge",
  "FolderOpen",
  "Rocket",
];

const EXPECTED_STEP_ID_ORDER = [
  "search",
  "onboard",
  "score",
  "build",
  "raise",
] as const;

const HYPERBOLE_TERMS = [
  "revolutionary",
  "world-class",
  "world class",
  "cutting-edge",
  "cutting edge",
  "game-changing",
  "game changing",
  "best-in-class",
  "best in class",
  "next-generation",
  "next generation",
  "unparalleled",
];

function wordsOf(text: string): string[] {
  return text.trim().split(/\s+/).filter((t) => t.length > 0);
}

function assertLocalised(
  field: LocalisedText,
  label: string,
): void {
  expect(field.en, `${label}.en must be non-empty`).toMatch(/\S/);
  expect(field.vi, `${label}.vi must be non-empty`).toMatch(/\S/);
}

describe("HOW_IT_WORKS_COPY — top-level bilingual surface", () => {
  it("carries a non-empty { en, vi } for every localised section field", () => {
    assertLocalised(HOW_IT_WORKS_COPY.eyebrow, "eyebrow");
    assertLocalised(HOW_IT_WORKS_COPY.headline, "headline");
    assertLocalised(HOW_IT_WORKS_COPY.subhead, "subhead");
    assertLocalised(HOW_IT_WORKS_COPY.videoTagline, "videoTagline");
    assertLocalised(HOW_IT_WORKS_COPY.cta.label, "cta.label");
  });

  it("keeps videoTagline present so Remotion has a caption to render", () => {
    expect(HOW_IT_WORKS_COPY.videoTagline).toBeDefined();
    expect(HOW_IT_WORKS_COPY.videoTagline.en.length).toBeGreaterThan(0);
    expect(HOW_IT_WORKS_COPY.videoTagline.vi.length).toBeGreaterThan(0);
  });
});

describe("HOW_IT_WORKS_COPY — steps taxonomy", () => {
  it("exposes exactly five steps (landing hero relies on the fixed count)", () => {
    expect(HOW_IT_WORKS_COPY.steps).toHaveLength(5);
  });

  it("emits the canonical id order search → onboard → score → build → raise", () => {
    expect(HOW_IT_WORKS_COPY.steps.map((s) => s.id)).toEqual(
      EXPECTED_STEP_ID_ORDER,
    );
  });

  it("step ids are unique (guards against copy-paste dupes in the array)", () => {
    const ids = HOW_IT_WORKS_COPY.steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every step carries bilingual { en, vi } for both title and body", () => {
    for (const step of HOW_IT_WORKS_COPY.steps) {
      assertLocalised(step.title, `steps[${step.id}].title`);
      assertLocalised(step.body, `steps[${step.id}].body`);
    }
  });
});

describe("HOW_IT_WORKS_COPY — editorial rules", () => {
  it("every step body in English is at most 18 words", () => {
    for (const step of HOW_IT_WORKS_COPY.steps) {
      const wordCount = wordsOf(step.body.en).length;
      expect(
        wordCount,
        `steps[${step.id}].body.en has ${wordCount} words (limit 18): "${step.body.en}"`,
      ).toBeLessThanOrEqual(18);
    }
  });

  it("every step title opens with a concrete verb (first word is not an article)", () => {
    const articles = new Set(["a", "an", "the", "your"]);
    for (const step of HOW_IT_WORKS_COPY.steps) {
      const firstWord = wordsOf(step.title.en)[0]?.toLowerCase() ?? "";
      expect(
        articles.has(firstWord),
        `steps[${step.id}].title.en starts with "${firstWord}" — must open with a verb`,
      ).toBe(false);
      // Verb-form heuristic: first word should NOT end in "-tion", "-ness",
      // or "-ment" (common noun suffixes) — cheap, but catches the class
      // of regression this rule targets ("Introduction to…" / "Onboarding").
      expect(
        /(tion|ness|ment)$/i.test(firstWord),
        `steps[${step.id}].title.en opens with a noun-shaped word "${firstWord}"`,
      ).toBe(false);
    }
  });

  it("SVI acronym never appears bare — expansion 'Startup Value Index' must accompany it", () => {
    for (const step of HOW_IT_WORKS_COPY.steps) {
      const body = step.body.en;
      const hasBareAcronym = /\bSVI\b/.test(body);
      if (hasBareAcronym) {
        expect(
          body,
          `steps[${step.id}].body.en uses bare "SVI" without expansion`,
        ).toMatch(/Startup Value Index/i);
      }
    }
  });

  it("MRR acronym never appears bare — expansion 'Monthly Recurring Revenue' must accompany it", () => {
    for (const step of HOW_IT_WORKS_COPY.steps) {
      const body = step.body.en;
      if (/\bMRR\b/.test(body)) {
        expect(
          body,
          `steps[${step.id}].body.en uses bare "MRR" without expansion`,
        ).toMatch(/Monthly Recurring Revenue/i);
      }
    }
  });

  it("'cap table' jargon must sit next to a plain-English gloss when used", () => {
    for (const step of HOW_IT_WORKS_COPY.steps) {
      const body = step.body.en;
      if (/cap table/i.test(body)) {
        // Expansion pattern seen in the shipped copy: "cap table (who owns what)".
        // Accept any parenthetical within 40 chars of the phrase.
        const glossPattern = /cap table[^.]{0,40}\(/i;
        expect(
          glossPattern.test(body),
          `steps[${step.id}].body.en references "cap table" without an inline gloss`,
        ).toBe(true);
      }
    }
  });

  it("banned marketing hyperbole terms do not appear anywhere in the copy", () => {
    const surfaces: string[] = [
      HOW_IT_WORKS_COPY.eyebrow.en,
      HOW_IT_WORKS_COPY.headline.en,
      HOW_IT_WORKS_COPY.subhead.en,
      HOW_IT_WORKS_COPY.videoTagline.en,
      HOW_IT_WORKS_COPY.cta.label.en,
      ...HOW_IT_WORKS_COPY.steps.flatMap((s: HowItWorksStep) => [
        s.title.en,
        s.body.en,
      ]),
    ];
    const joined = surfaces.join("  ").toLowerCase();
    for (const term of HYPERBOLE_TERMS) {
      expect(
        joined.includes(term),
        `hyperbole term "${term}" leaked into landing copy`,
      ).toBe(false);
    }
  });
});

describe("HOW_IT_WORKS_COPY — icons", () => {
  it("every step icon is drawn from the whitelisted lucide-react enum", () => {
    for (const step of HOW_IT_WORKS_COPY.steps) {
      expect(
        ALLOWED_ICONS.includes(step.icon),
        `steps[${step.id}].icon "${step.icon}" is not in the icon whitelist`,
      ).toBe(true);
    }
  });

  it("icons are unique across steps (no duplicate glyph in the section)", () => {
    const icons = HOW_IT_WORKS_COPY.steps.map((s) => s.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });
});

describe("HOW_IT_WORKS_COPY — CTA contract", () => {
  it("cta.href points at an in-app route (starts with '/')", () => {
    expect(HOW_IT_WORKS_COPY.cta.href.startsWith("/")).toBe(true);
  });

  it("cta.label carries a non-empty { en, vi }", () => {
    assertLocalised(HOW_IT_WORKS_COPY.cta.label, "cta.label");
  });
});
