// Colocated test for segment-content.ts — the hard-coded copy powering the
// /for/[segment] marketing landing pages. Pins:
//   1. Slug list shape and order (route-generation contract).
//   2. `isSegmentSlug` guard on positive/negative/edge inputs.
//   3. Every SegmentContent entry is fully populated and internally consistent.
//   4. Editorial conventions from the header comment: "No emoji", "Keep each
//      segment under ~250 words", diligence-memo tone (features have no
//      trailing period, steps end with a period, FAQ questions end with '?',
//      FAQ answers end with '.').
//   5. Per-segment planAnchor identity (id → label → price triple).
//
// Loop tag: P9-segment-content-lib-test

import { describe, expect, it } from "vitest";

import {
  SEGMENT_CONTENT,
  SEGMENT_SLUGS,
  isSegmentSlug,
  type SegmentContent,
  type SegmentSlug,
} from "./segment-content";

// Regex that matches most emoji (BMP + supplementary planes commonly used
// for symbol pictographs). The header comment forbids emoji outright — this
// guard is broad enough to catch the common offenders without being so
// strict it flags currency prefixes like "A$".
const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F1FF}]/u;

function wordCount(entry: SegmentContent): number {
  const parts: string[] = [
    entry.hero.headline,
    entry.hero.subhead,
    ...entry.features,
    ...entry.steps,
    entry.planAnchor.label,
    entry.planAnchor.price,
    ...entry.faq.flatMap((f) => [f.q, f.a]),
  ];
  return parts.join(" ").split(/\s+/).filter(Boolean).length;
}

describe("SEGMENT_SLUGS", () => {
  it("contains exactly the four canonical audience slugs in canonical order", () => {
    expect(SEGMENT_SLUGS).toEqual([
      "founder",
      "investor",
      "advisor",
      "accelerator",
    ]);
  });

  it("has no duplicate entries", () => {
    expect(new Set(SEGMENT_SLUGS).size).toBe(SEGMENT_SLUGS.length);
  });

  it("every slug is a lowercase kebab-safe identifier (letters only)", () => {
    for (const slug of SEGMENT_SLUGS) {
      expect(slug).toMatch(/^[a-z]+$/);
    }
  });
});

describe("isSegmentSlug", () => {
  it("returns true for every canonical slug", () => {
    for (const slug of SEGMENT_SLUGS) {
      expect(isSegmentSlug(slug)).toBe(true);
    }
  });

  it("returns false for the empty string", () => {
    expect(isSegmentSlug("")).toBe(false);
  });

  it("returns false for an arbitrary unknown string", () => {
    expect(isSegmentSlug("mentor")).toBe(false);
  });

  it("is case-sensitive — the capitalised variant is rejected", () => {
    // The route resolves lowercase slugs; letting "Founder" pass would break
    // the SEGMENT_CONTENT lookup that immediately follows the guard.
    expect(isSegmentSlug("Founder")).toBe(false);
  });

  it("rejects a slug with surrounding whitespace", () => {
    expect(isSegmentSlug(" founder")).toBe(false);
    expect(isSegmentSlug("founder ")).toBe(false);
  });

  it("narrows the type — a positive result is usable as a SegmentSlug", () => {
    const raw: string = "advisor";
    if (isSegmentSlug(raw)) {
      // If this type-narrows correctly, `raw` is now a SegmentSlug and
      // the SEGMENT_CONTENT lookup below is well-typed at compile time.
      const entry: SegmentContent = SEGMENT_CONTENT[raw];
      expect(entry.slug).toBe("advisor");
    } else {
      throw new Error("expected 'advisor' to narrow to SegmentSlug");
    }
  });
});

describe("SEGMENT_CONTENT — key coverage", () => {
  it("has exactly one entry per SEGMENT_SLUGS entry (no orphans, no missing)", () => {
    const keys = Object.keys(SEGMENT_CONTENT).sort();
    const expected = [...SEGMENT_SLUGS].sort();
    expect(keys).toEqual(expected);
  });

  it("every entry's own `slug` matches the key it is filed under", () => {
    for (const slug of SEGMENT_SLUGS) {
      expect(SEGMENT_CONTENT[slug].slug).toBe(slug);
    }
  });
});

describe("SEGMENT_CONTENT — required fields populated", () => {
  it.each(SEGMENT_SLUGS as readonly SegmentSlug[])(
    "%s: label is a non-empty string",
    (slug) => {
      expect(typeof SEGMENT_CONTENT[slug].label).toBe("string");
      expect(SEGMENT_CONTENT[slug].label.length).toBeGreaterThan(0);
    },
  );

  it.each(SEGMENT_SLUGS as readonly SegmentSlug[])(
    "%s: hero has non-empty headline and subhead",
    (slug) => {
      const hero = SEGMENT_CONTENT[slug].hero;
      expect(hero.headline.length).toBeGreaterThan(0);
      expect(hero.subhead.length).toBeGreaterThan(0);
    },
  );

  it.each(SEGMENT_SLUGS as readonly SegmentSlug[])(
    "%s: features array is non-empty and every entry is a non-empty string",
    (slug) => {
      const features = SEGMENT_CONTENT[slug].features;
      expect(features.length).toBeGreaterThan(0);
      for (const f of features) {
        expect(typeof f).toBe("string");
        expect(f.trim().length).toBeGreaterThan(0);
      }
    },
  );

  it.each(SEGMENT_SLUGS as readonly SegmentSlug[])(
    "%s: steps array is non-empty and every entry is a non-empty string",
    (slug) => {
      const steps = SEGMENT_CONTENT[slug].steps;
      expect(steps.length).toBeGreaterThan(0);
      for (const s of steps) {
        expect(typeof s).toBe("string");
        expect(s.trim().length).toBeGreaterThan(0);
      }
    },
  );

  it.each(SEGMENT_SLUGS as readonly SegmentSlug[])(
    "%s: planAnchor has non-empty id, label, and price",
    (slug) => {
      const pa = SEGMENT_CONTENT[slug].planAnchor;
      expect(pa.id.length).toBeGreaterThan(0);
      expect(pa.label.length).toBeGreaterThan(0);
      expect(pa.price.length).toBeGreaterThan(0);
    },
  );

  it.each(SEGMENT_SLUGS as readonly SegmentSlug[])(
    "%s: faq array is non-empty and every entry has non-empty q and a",
    (slug) => {
      const faq = SEGMENT_CONTENT[slug].faq;
      expect(faq.length).toBeGreaterThan(0);
      for (const item of faq) {
        expect(item.q.trim().length).toBeGreaterThan(0);
        expect(item.a.trim().length).toBeGreaterThan(0);
      }
    },
  );
});

describe("SEGMENT_CONTENT — planAnchor identity per segment", () => {
  // The (id, label, price) triple is what the pricing anchor scrolls to on
  // the /pricing page. A silent rename or price drift here would break the
  // marketing CTA — pin all three per-segment.
  it("founder → founder_growth / A$79 / month", () => {
    expect(SEGMENT_CONTENT.founder.planAnchor).toEqual({
      id: "founder_growth",
      label: "Founder Growth",
      price: "A$79 / month",
    });
  });

  it("investor → investor_angel / A$99 / month", () => {
    expect(SEGMENT_CONTENT.investor.planAnchor).toEqual({
      id: "investor_angel",
      label: "Investor Angel",
      price: "A$99 / month",
    });
  });

  it("advisor → investor_advisor / A$149 / month", () => {
    // Note: filed under investor_* by product taxonomy despite being an
    // advisor-facing plan. Pinning this catches a rename to "advisor_*".
    expect(SEGMENT_CONTENT.advisor.planAnchor).toEqual({
      id: "investor_advisor",
      label: "Advisor Practice",
      price: "A$149 / month",
    });
  });

  it("accelerator → accelerator_growth / A$499 / month", () => {
    expect(SEGMENT_CONTENT.accelerator.planAnchor).toEqual({
      id: "accelerator_growth",
      label: "Accelerator Growth",
      price: "A$499 / month",
    });
  });

  it("every planAnchor.price uses the 'A$<amount> / month' shape", () => {
    for (const slug of SEGMENT_SLUGS) {
      expect(SEGMENT_CONTENT[slug].planAnchor.price).toMatch(
        /^A\$\d+ \/ month$/,
      );
    }
  });
});

describe("SEGMENT_CONTENT — audience labels", () => {
  it("label pluralises the audience noun for every segment", () => {
    expect(SEGMENT_CONTENT.founder.label).toBe("Founders");
    expect(SEGMENT_CONTENT.investor.label).toBe("Investors");
    expect(SEGMENT_CONTENT.advisor.label).toBe("Advisors");
    expect(SEGMENT_CONTENT.accelerator.label).toBe("Accelerators");
  });

  it("hero.headline starts with 'BlockID for ' for every segment", () => {
    for (const slug of SEGMENT_SLUGS) {
      expect(SEGMENT_CONTENT[slug].hero.headline.startsWith("BlockID for ")).toBe(true);
    }
  });
});

describe("SEGMENT_CONTENT — editorial conventions", () => {
  // The header comment says "No emoji, no marketing fluff — write like a
  // diligence memo." Guard the emoji rule mechanically; the fluff rule is
  // qualitative but the word-count cap keeps it bounded.
  it("no emoji anywhere in hero / features / steps / faq / planAnchor", () => {
    for (const slug of SEGMENT_SLUGS) {
      const entry = SEGMENT_CONTENT[slug];
      const haystack = [
        entry.hero.headline,
        entry.hero.subhead,
        ...entry.features,
        ...entry.steps,
        entry.planAnchor.label,
        entry.planAnchor.price,
        ...entry.faq.flatMap((f) => [f.q, f.a]),
      ].join(" ");
      expect(haystack).not.toMatch(EMOJI_RE);
    }
  });

  it("features do NOT end with a period (bullet-list convention)", () => {
    for (const slug of SEGMENT_SLUGS) {
      for (const f of SEGMENT_CONTENT[slug].features) {
        expect(f.endsWith(".")).toBe(false);
      }
    }
  });

  it("steps DO end with a period (full-sentence instruction convention)", () => {
    for (const slug of SEGMENT_SLUGS) {
      for (const s of SEGMENT_CONTENT[slug].steps) {
        expect(s.endsWith(".")).toBe(true);
      }
    }
  });

  it("faq questions end with '?'", () => {
    for (const slug of SEGMENT_SLUGS) {
      for (const item of SEGMENT_CONTENT[slug].faq) {
        expect(item.q.endsWith("?")).toBe(true);
      }
    }
  });

  it("faq answers end with '.'", () => {
    for (const slug of SEGMENT_SLUGS) {
      for (const item of SEGMENT_CONTENT[slug].faq) {
        expect(item.a.endsWith(".")).toBe(true);
      }
    }
  });

  it("total word count per segment stays under 400 (header target is ~250 with buffer)", () => {
    for (const slug of SEGMENT_SLUGS) {
      const count = wordCount(SEGMENT_CONTENT[slug]);
      expect(count).toBeLessThan(400);
    }
  });
});

describe("SEGMENT_CONTENT — collection cardinality", () => {
  // The four landing pages were shipped with matching cardinality (6 features,
  // 3 steps, 3 faq) so the visual layout stays symmetric across segments.
  // Pin the counts so a well-meaning copy tweak that adds a 7th feature to
  // just one segment gets flagged for a matching update on the other three.
  it("every segment has exactly 6 features", () => {
    for (const slug of SEGMENT_SLUGS) {
      expect(SEGMENT_CONTENT[slug].features.length).toBe(6);
    }
  });

  it("every segment has exactly 3 steps", () => {
    for (const slug of SEGMENT_SLUGS) {
      expect(SEGMENT_CONTENT[slug].steps.length).toBe(3);
    }
  });

  it("every segment has exactly 3 faq entries", () => {
    for (const slug of SEGMENT_SLUGS) {
      expect(SEGMENT_CONTENT[slug].faq.length).toBe(3);
    }
  });
});
