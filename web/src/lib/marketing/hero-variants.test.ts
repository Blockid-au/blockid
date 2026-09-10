// Colocated tests for the hero one-liner catalogue (G11 §4i D-5, T0250).
// Every approved line must pass the speakability test, the i18n catalogue
// must carry the same strings, and arm selection must be deterministic.

import { describe, expect, it } from "vitest";

import en from "@/lib/i18n/messages/en.json";
import vi from "@/lib/i18n/messages/vi.json";
import {
  ALL_HERO_LINES,
  FOUNDER_LINES,
  GENERAL_LINES,
  HERO_ARMS,
  HERO_DEFAULT_ARM,
  INVESTOR_LINES,
  MAX_SENTENCES,
  MAX_VI_SYLLABLES_PER_UNIT,
  MAX_WORDS_PER_UNIT,
  countWords,
  fnv1a32,
  heroLine,
  parseHeroArm,
  pickHeroVariant,
  speakabilityCheck,
  splitBreathUnits,
  splitSentences,
} from "./hero-variants";

const EN = en as Record<string, string>;
const VI = vi as Record<string, string>;

describe("catalogue shape", () => {
  it("has the approved ids in the approved order", () => {
    expect(FOUNDER_LINES.map((l) => l.id)).toEqual(["F1", "F2", "F3", "F4"]);
    expect(INVESTOR_LINES.map((l) => l.id)).toEqual(["I1", "I2", "I3"]);
    expect(GENERAL_LINES.map((l) => l.id)).toEqual(["G1", "G2", "G3"]);
    expect(ALL_HERO_LINES).toHaveLength(10);
  });

  it("every entry carries en, vi, words, maxWords 20 and ≤ 2 sentences", () => {
    for (const l of ALL_HERO_LINES) {
      expect(l.en.trim().length, l.id).toBeGreaterThan(0);
      expect(l.vi.trim().length, l.id).toBeGreaterThan(0);
      expect(l.words, l.id).toBe(countWords(l.en));
      expect(l.maxWords, l.id).toBe(20);
      expect(l.sentences, l.id).toBeLessThanOrEqual(MAX_SENTENCES);
    }
  });

  it("pins the shipped defaults verbatim (F1 H1, F3 sub-line, G1 og, G2 tagline)", () => {
    expect(heroLine("F1").en).toBe(
      "See your startup the way an investor will — your score, what it's worth, and where the money is, in 60 seconds.",
    );
    expect(heroLine("G1").en).toBe(
      "BlockID is Australia's startup readiness score — it tells founders what they're worth and where to get money, and tells investors who's ready.",
    );
    expect(heroLine("G2").en).toBe("A credit score for startups.");
    expect(heroLine("I1").en).toBe(
      "One score across 8 investor dimensions, backed by evidence — screen an Australian startup in minutes, not weeks.",
    );
    // F3 was softened against the plan text: the eligibility match is the
    // A$3 Money Finder, the free thing is the grant directory.
    expect(heroLine("F3").en).toMatch(/^Paste your idea\./);
    expect(heroLine("F3").en).not.toMatch(/qualify for/);
    expect(heroLine("F3").en).toMatch(/free\.$/);
  });

  it("throws on an id that is not in the catalogue", () => {
    expect(() => heroLine("F9" as never)).toThrow(/not in the catalogue/);
  });
});

describe("speakabilityCheck()", () => {
  it("every EN line passes (≤ 20 words per breath, ≤ 2 sentences, no jargon)", () => {
    for (const l of ALL_HERO_LINES) {
      const r = speakabilityCheck(l.en, { locale: "en" });
      expect(r.problems, `${l.id} en`).toEqual([]);
      expect(r.ok).toBe(true);
      expect(r.longestUnit).toBeLessThanOrEqual(MAX_WORDS_PER_UNIT);
    }
  });

  it("every VI line passes on counts (≤ 28 syllables per breath, ≤ 2 sentences)", () => {
    for (const l of ALL_HERO_LINES) {
      const r = speakabilityCheck(l.vi, { locale: "vi" });
      expect(r.problems, `${l.id} vi`).toEqual([]);
      expect(r.longestUnit).toBeLessThanOrEqual(MAX_VI_SYLLABLES_PER_UNIT);
    }
  });

  it("rejects the internal jargon the plan forbids", () => {
    expect(speakabilityCheck("Your SVI score in seconds.").problems).toContainEqual(
      expect.stringMatching(/SVI/),
    );
    expect(speakabilityCheck("Our SCN journey.").ok).toBe(false);
    expect(speakabilityCheck("Equity tokenisation for all.").ok).toBe(false);
    expect(speakabilityCheck("Equity tokenization for all.").ok).toBe(false);
    expect(speakabilityCheck("PhD-level analysis.").ok).toBe(false);
    // Spelled-out brand is allowed — I3 is brand-forward on purpose.
    expect(speakabilityCheck("The Startup Value Index, live.").ok).toBe(true);
  });

  it("rejects three sentences and a 21-word breath", () => {
    expect(speakabilityCheck("One. Two. Three.").problems).toContainEqual(
      expect.stringMatching(/3 sentences/),
    );
    const long = Array.from({ length: 21 }, (_, i) => `w${i}`).join(" ") + ".";
    expect(speakabilityCheck(long).problems).toContainEqual(
      expect.stringMatching(/21 words/),
    );
    expect(speakabilityCheck("").ok).toBe(false);
  });

  it("counts words without standalone punctuation and splits breaths on — : ;", () => {
    expect(countWords("a — b · c")).toBe(3);
    expect(splitSentences("Paste it. Get it — free.")).toEqual(["Paste it", "Get it — free"]);
    expect(splitBreathUnits("Paste it. Get it — free: now; go")).toEqual([
      "Paste it",
      "Get it",
      "free",
      "now",
      "go",
    ]);
    // F1 is one sentence of 21 words but two breaths of 8 + 13.
    expect(heroLine("F1").sentences).toBe(1);
    expect(heroLine("F1").words).toBe(21);
    expect(splitBreathUnits(heroLine("F1").en).map(countWords)).toEqual([8, 13]);
  });
});

describe("i18n parity (hero.line.* ⇄ catalogue)", () => {
  it("en.json and vi.json carry every line verbatim", () => {
    for (const l of ALL_HERO_LINES) {
      const key = `hero.line.${l.id.toLowerCase()}`;
      expect(EN[key], `en ${key}`).toBe(l.en);
      expect(VI[key], `vi ${key}`).toBe(l.vi);
    }
  });

  it("marks the stale hero.v3.* keys as deprecated in both catalogues", () => {
    expect(EN["_comment.hero.v3"]).toMatch(/deprecated/i);
    expect(VI["_comment.hero.v3"]).toMatch(/deprecated/i);
  });
});

describe("arm selection", () => {
  it("parseHeroArm accepts the three arms case-insensitively and nothing else", () => {
    expect(parseHeroArm("F2")).toBe("F2");
    expect(parseHeroArm("f3")).toBe("F3");
    expect(parseHeroArm(" f1 ")).toBe("F1");
    expect(parseHeroArm("F4")).toBeNull();
    expect(parseHeroArm("I1")).toBeNull();
    expect(parseHeroArm("")).toBeNull();
    expect(parseHeroArm(null)).toBeNull();
    expect(parseHeroArm(undefined)).toBeNull();
  });

  it("defaults to F1 with no arm and no seed", () => {
    expect(HERO_DEFAULT_ARM).toBe("F1");
    expect(pickHeroVariant()).toBe("F1");
    expect(pickHeroVariant({ seed: "" })).toBe("F1");
    expect(pickHeroVariant({ seed: "   " })).toBe("F1");
  });

  it("an explicit arm overrides the seed", () => {
    expect(pickHeroVariant({ arm: "F3", seed: "anything" })).toBe("F3");
    expect(pickHeroVariant({ arm: "f2", seed: "anything" })).toBe("F2");
    // An invalid override falls through to the seed.
    const seeded = pickHeroVariant({ seed: "GA1.1.123.456" });
    expect(pickHeroVariant({ arm: "nope", seed: "GA1.1.123.456" })).toBe(seeded);
  });

  it("is deterministic per seed and uses all three buckets", () => {
    const seeds = Array.from({ length: 300 }, (_, i) => `client-${i}`);
    const first = seeds.map((s) => pickHeroVariant({ seed: s }));
    const second = seeds.map((s) => pickHeroVariant({ seed: s }));
    expect(second).toEqual(first);
    const counts = new Map<string, number>();
    for (const a of first) counts.set(a, (counts.get(a) ?? 0) + 1);
    for (const arm of HERO_ARMS) {
      // Roughly a third each; 300 seeds gives plenty of margin.
      expect(counts.get(arm) ?? 0, arm).toBeGreaterThan(60);
    }
  });

  it("fnv1a32 is stable", () => {
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("a")).toBe(0xe40c292c);
    expect(fnv1a32("hello")).toBe(fnv1a32("hello"));
  });
});
