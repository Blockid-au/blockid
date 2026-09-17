/**
 * Appendix deck acceptance tests (G14 leftover #2, 2026-09-17). The appendix
 * source of truth is `content/pitch/pitch-deck-v3-appendix.md`, parsed by the
 * same `parseDeck` used for the main deck (`scripts/generate-pitch-deck-v3.ts`).
 *
 * What is pinned, mirroring `pitch-deck-v3.test.ts`:
 *   - exactly 6 slides;
 *   - every numeric token on a slide (title, sub, bullets, hero.data) appears
 *     in the `## Provenance` section;
 *   - the same guardrail grep (no PhD / SOC 2 / "500+ comparables" / sign-up
 *     pause language / "trusted by" / PPL Food) and Auschain in front-matter.
 *
 * Unlike the main deck, the appendix carries no 3-minute-cut allocation and no
 * per-slide word ceiling — it is a leave-behind, not a spoken script.
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  collectScalars,
  parseDeck,
  HERO_TYPES,
} from "../../../scripts/generate-pitch-deck-v3";

const MD_PATH = path.resolve(__dirname, "../../../content/pitch/pitch-deck-v3-appendix.md");
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

describe("pitch-deck-v3-appendix.md — structure", () => {
  it("front-matter carries the Auschain entity and ACN", () => {
    expect(deck.front.entity).toBe("Auschain PTY LTD");
    expect(deck.front.acn).toBe("659 615 111");
  });

  it("has exactly 6 slides numbered 1..6 in order", () => {
    expect(deck.slides).toHaveLength(6);
    expect(deck.slides.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("every slide has exactly one hero of a known type (table) with a description", () => {
    for (const s of deck.slides) {
      expect(HERO_TYPES, `slide ${s.n} hero type`).toContain(s.hero.type);
      expect(s.hero.type, `slide ${s.n}`).toBe("table");
      expect(s.hero.description.length, `slide ${s.n} hero description`).toBeGreaterThan(10);
    }
  });

  it("every table hero declares at least one named table with columns and rows", () => {
    for (const s of deck.slides) {
      const tables = s.hero.data.tables;
      expect(Array.isArray(tables), `slide ${s.n} tables`).toBe(true);
      const arr = tables as unknown[];
      expect(arr.length, `slide ${s.n} table count`).toBeGreaterThan(0);
      for (const t of arr) {
        const tm = t as Record<string, unknown>;
        expect(Array.isArray(tm.columns), `slide ${s.n} table columns`).toBe(true);
        expect(Array.isArray(tm.rows), `slide ${s.n} table rows`).toBe(true);
        // Rows must be maps (object), never flow-list arrays — the yaml subset's flow-list
        // parser splits on every raw comma, which corrupts thousands separators.
        for (const row of tm.rows as unknown[]) {
          expect(Array.isArray(row), `slide ${s.n} row must not be a flow-list array`).toBe(false);
          expect(typeof row, `slide ${s.n} row must be a map`).toBe("object");
        }
      }
    }
  });
});

describe("pitch-deck-v3-appendix.md — provenance and guardrails", () => {
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

  it("never puts a BlockID user count (the seeded app_users figure) on a slide", () => {
    // Slide 2's competitor price anchors legitimately say "US$2,000/user/yr" (a third-party
    // per-seat pricing model) and Slide 5's SVI quartile range legitimately ends at "116" (a
    // score, not a user count) — so this checks for an actual NUMBER-of-users claim, not any
    // appearance of the digits or the bare word "user".
    for (const s of deck.slides) {
      const texts = [s.title, s.sub, ...s.bullets, ...collectScalars(s.hero.data)].join(" ");
      expect(texts).not.toMatch(/\b116\s*(app_users|users?)\b/i);
      expect(texts).not.toMatch(/\b\d[\d,]*\s+users?\b/i);
    }
  });

  it("the 5 backtest caveats are quoted verbatim from svi-backtest-latest.json", () => {
    const backtestPath = path.resolve(__dirname, "../../../content/reports/svi-backtest-latest.json");
    const backtest = JSON.parse(fs.readFileSync(backtestPath, "utf8")) as { caveats: string[] };
    for (const caveat of backtest.caveats) {
      expect(deck.provenance, `caveat missing verbatim: ${caveat.slice(0, 40)}...`).toContain(caveat);
    }
  });
});
