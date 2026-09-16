/**
 * Deck v3 acceptance tests (G14 plan §8.1). The deck source of truth is
 * `content/pitch/pitch-deck-v3.md`; the parser lives in
 * `scripts/generate-pitch-deck-v3.ts` (vitest's include pattern does not cover
 * `scripts/*.test.ts`, so the test sits here and imports the script's exports).
 *
 * What is pinned:
 *   - exactly 12 slides, ≤ 8-word titles, exactly one hero, ≤ 3 bullets,
 *     ≤ 40 words of body per slide;
 *   - every speaker line and every sentence of the 3-minute script passes the
 *     hero-variants speakability check (≤ 2 sentences, ≤ 20 words per breath,
 *     no SVI / SCN / tokenisation / PhD);
 *   - the 3-minute script is ≤ 420 words;
 *   - every numeric token on a slide (title, sub, bullets, hero.data) appears
 *     in the `## Provenance` table;
 *   - guardrail grep on the whole md (no PhD, SOC 2, "500+ comparables",
 *     sign-up pauses, "trusted by", PPL Food) and Auschain in the front-matter.
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { countWords, speakabilityCheck, splitSentences } from "./hero-variants";
import {
  collectScalars,
  parseDeck,
  parseYamlSubset,
  HERO_TYPES,
  FOOTER_TEXT,
} from "../../../scripts/generate-pitch-deck-v3";

const MD_PATH = path.resolve(__dirname, "../../../content/pitch/pitch-deck-v3.md");
const md = fs.readFileSync(MD_PATH, "utf8");
const deck = parseDeck(md);

/** Digits with optional inner `,`/`.` groups: 3,302 · 2.1.0 · 0.35 · 500. */
const NUMBER_RE = /\d+(?:[.,]\d+)*/g;

function numericTokens(text: string): string[] {
  return text.match(NUMBER_RE) ?? [];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Token must appear in the provenance text as a whole number, not inside a longer one. */
function provenanceHas(token: string): boolean {
  const re = new RegExp(`(?<![\\d.,])${escapeRe(token)}(?![\\d.,])`);
  return re.test(deck.provenance);
}

describe("yaml subset parser", () => {
  it("parses maps, block lists, list-of-maps, flow lists and scalars", () => {
    const y = parseYamlSubset(
      [
        'title: "Quoted: with colon"',
        "n: 42",
        "f: 2.1.0",
        "flag: true",
        "list:",
        "  - one",
        '  - "two: quoted"',
        "objs:",
        "  - key: a",
        "    weight: 1",
        "  - key: b",
        "    weight: 2",
        "flow: [C1, C2]",
        "nested:",
        "  type: ring",
        "  data:",
        "    score: 115",
      ].join("\n"),
    );
    expect(y.title).toBe("Quoted: with colon");
    expect(y.n).toBe(42);
    expect(y.f).toBe("2.1.0");
    expect(y.flag).toBe(true);
    expect(y.list).toEqual(["one", "two: quoted"]);
    expect(y.objs).toEqual([
      { key: "a", weight: 1 },
      { key: "b", weight: 2 },
    ]);
    expect(y.flow).toEqual(["C1", "C2"]);
    expect(y.nested).toEqual({ type: "ring", data: { score: 115 } });
  });

  it("throws on a line it cannot place", () => {
    expect(() => parseYamlSubset("a: 1\n  b: 2\n    c")).toThrow();
  });
});

describe("pitch-deck-v3.md — structure (plan §8.1)", () => {
  it("front-matter carries version 3.0, the Auschain entity, ACN and the ask", () => {
    expect(String(deck.front.version)).toBe("3.0");
    expect(deck.front.date).toBe("2026-09-16");
    expect(deck.front.entity).toBe("Auschain PTY LTD");
    expect(deck.front.acn).toBe("659 615 111");
    expect(deck.front.brand).toBe("Startup Value Index");
    expect(deck.front.byline).toBe("by BlockID");
    expect(deck.front.ask).toBe("A$500K pre-seed");
    expect(FOOTER_TEXT).toContain("Auschain PTY LTD");
    expect(FOOTER_TEXT).toContain("ACN 659 615 111");
  });

  it("has exactly 12 slides numbered 1..12 in order", () => {
    expect(deck.slides).toHaveLength(12);
    expect(deck.slides.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("every slide has a ≤ 8-word title matching its heading", () => {
    for (const s of deck.slides) {
      expect(countWords(s.title), `slide ${s.n} title "${s.title}"`).toBeLessThanOrEqual(8);
      expect(s.heading, `slide ${s.n} heading`).toBe(s.title);
    }
  });

  it("every slide has exactly one hero of a known type with a description", () => {
    for (const s of deck.slides) {
      expect(HERO_TYPES, `slide ${s.n} hero type`).toContain(s.hero.type);
      expect(s.hero.description.length, `slide ${s.n} hero description`).toBeGreaterThan(10);
    }
    // "exactly one" — the parser rejects a slide with two yaml blocks; pin that too
    const doubled = md.replace(
      /(## Slide 2 — [^\n]+\n\n```yaml\n[\s\S]*?```)/,
      "$1\n\n```yaml\ntitle: x\nhero:\n  type: number\n  description: dup\nspeaker: y\n```",
    );
    expect(() => parseDeck(doubled)).toThrow(/exactly one yaml block/);
  });

  it("every slide has ≤ 3 bullets and ≤ 40 words of body", () => {
    for (const s of deck.slides) {
      expect(s.bullets.length, `slide ${s.n} bullets`).toBeLessThanOrEqual(3);
      const body = countWords(s.bullets.join(" "));
      expect(body, `slide ${s.n} body words: ${s.bullets.join(" | ")}`).toBeLessThanOrEqual(40);
    }
  });

  it("every slide names the judge clusters it answers and at least one source", () => {
    for (const s of deck.slides) {
      expect(s.clusters.length, `slide ${s.n} clusters`).toBeGreaterThan(0);
      for (const c of s.clusters) expect(c).toMatch(/^C(10|[1-9])$/);
      expect(s.sources.length, `slide ${s.n} sources`).toBeGreaterThan(0);
    }
  });

  it("slide 12 carries the three key messages", () => {
    const last = deck.slides[11];
    expect(last.hero.type).toBe("messages");
    const heads = collectScalars(last.hero.data).join(" ");
    expect(heads).toContain("One rubric, every deal.");
    expect(heads).toContain("Evaluators pay. Founders get the feedback.");
    expect(heads).toContain("A live index, not a static report.");
  });
});

describe("pitch-deck-v3.md — speakability (hero-variants D-5 rules)", () => {
  it("every speaker line passes speakabilityCheck()", () => {
    for (const s of deck.slides) {
      const r = speakabilityCheck(s.speaker);
      expect(r.ok, `slide ${s.n} speaker "${s.speaker}": ${r.problems.join("; ")}`).toBe(true);
    }
  });

  it("the 3-minute cut lists 6 slides summing to 180 seconds", () => {
    expect(deck.threeMinute.table).toHaveLength(6);
    const total = deck.threeMinute.table.reduce((a, r) => a + r.seconds, 0);
    expect(total).toBe(180);
  });

  it("every sentence of the 3-minute script passes speakabilityCheck()", () => {
    const script = deck.threeMinute.script;
    expect(script.length).toBeGreaterThan(100);
    const sentences = splitSentences(script);
    expect(sentences.length).toBeGreaterThan(10);
    for (const sentence of sentences) {
      const r = speakabilityCheck(sentence);
      expect(r.ok, `script sentence "${sentence}": ${r.problems.join("; ")}`).toBe(true);
    }
  });

  it("the 3-minute script is ≤ 420 words", () => {
    expect(countWords(deck.threeMinute.script)).toBeLessThanOrEqual(420);
  });
});

describe("pitch-deck-v3.md — provenance and guardrails", () => {
  it("every numeric token on a slide (title / sub / bullets / hero.data) appears in ## Provenance", () => {
    expect(deck.provenance).toMatch(/^\n## Provenance/);
    const missing: string[] = [];
    for (const s of deck.slides) {
      const texts = [s.title, s.sub, ...s.bullets, ...collectScalars(s.hero.data)];
      for (const t of texts) {
        for (const tok of numericTokens(t)) {
          if (!provenanceHas(tok)) missing.push(`slide ${s.n}: ${tok} (in "${t}")`);
        }
      }
    }
    expect(missing, missing.join("\n")).toEqual([]);
  });

  it("guardrail grep — no PhD / SOC 2 / 500+ comparables / sign-up pause / trusted by / PPL Food anywhere in the md", () => {
    const hits = md.match(/PhD|SOC ?2|500\+ comparables|paused|pause sign-?up|trusted by|PPL Food/gi) ?? [];
    expect(hits, hits.join(", ")).toEqual([]);
  });

  it("never puts a user count or the seeded app_users figure on a slide", () => {
    for (const s of deck.slides) {
      const texts = [s.title, s.sub, ...s.bullets, ...collectScalars(s.hero.data)].join(" ");
      expect(texts).not.toMatch(/\b116\b/);
      expect(texts).not.toMatch(/\busers?\b/i);
    }
  });

  it("speaker lines never say SVI, SCN, tokenisation or PhD (spelled-out brand is fine)", () => {
    for (const s of deck.slides) {
      expect(s.speaker).not.toMatch(/\bSVI\b|\bSCN\b|tokeni[sz]ation|\bPhD\b/i);
    }
    expect(deck.threeMinute.script).not.toMatch(/\bSVI\b|\bSCN\b|tokeni[sz]ation|\bPhD\b/i);
  });
});
