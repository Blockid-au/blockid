// The 3-minute cut (G14 deck v3.1) — same md/yaml contract as the master deck,
// eight slides, 180 seconds, own pptx/html outputs
// (`npm run pitch:3min`, `npm run pitch:3min:html`). Pins the same wording,
// speakability, provenance and guardrail rules as pitch-deck-v3.test.ts so the
// short deck can never drift from the master's truth rules.
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { countWords, speakabilityCheck, splitSentences, FORBIDDEN_TOKENS } from "./hero-variants";
import { collectScalars, parseDeck, HERO_TYPES } from "../../../scripts/generate-pitch-deck-v3";

const MD_PATH = path.resolve(__dirname, "../../../content/pitch/pitch-deck-3min.md");
const md = fs.readFileSync(MD_PATH, "utf8");
const deck = parseDeck(md);

const NUMBER_RE = /\d+(?:[.,]\d+)*/g;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const provenanceHas = (token: string) =>
  new RegExp(`(?<![\\d.,])${escapeRe(token)}(?![\\d.,])`).test(deck.provenance);

describe("pitch-deck-3min.md — shape", () => {
  it("front-matter: version 3.1, Auschain entity, ACN, A$500K ask, parent = master deck", () => {
    expect(deck.front.version).toBe("3.1");
    expect(deck.front.entity).toBe("Auschain PTY LTD");
    expect(deck.front.acn).toBe("659 615 111");
    expect(String(deck.front.ask)).toMatch(/A\$500K/);
    expect(String(deck.front.parent)).toMatch(/pitch-deck-v3\.md/);
  });

  it("has exactly 8 slides numbered 1..8", () => {
    expect(deck.slides.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("every slide: ≤ 8-word title, one known hero, ≤ 3 bullets, ≤ 40 words of body, ≥ 1 source", () => {
    for (const s of deck.slides) {
      expect(countWords(s.title), `slide ${s.n} title`).toBeLessThanOrEqual(8);
      expect(HERO_TYPES).toContain(s.hero.type);
      expect(String(s.hero.description).length).toBeGreaterThan(10);
      expect(s.bullets.length).toBeLessThanOrEqual(3);
      expect(countWords(s.bullets.join(" ")), `slide ${s.n} body`).toBeLessThanOrEqual(40);
      expect(s.sources.length).toBeGreaterThan(0);
    }
  });

  it("uses the visual heroes the founder asked for: a flow (loop), a real screenshot, a chart and the messages close", () => {
    const types = deck.slides.map((s) => s.hero.type);
    expect(types).toContain("loop");
    expect(types).toContain("screenshot");
    expect(types).toContain("ladder");
    expect(types[types.length - 1]).toBe("messages");
    const shot = deck.slides.find((s) => s.hero.type === "screenshot")!;
    const png = path.resolve(__dirname, "../../../..", String((shot.hero.data as { path: string }).path));
    expect(fs.existsSync(png), `screenshot ${png} must exist (real dossier capture)`).toBe(true);
  });

  it("slide 8 carries the three key messages", () => {
    const msgs = collectScalars(deck.slides[7].hero.data).join(" | ");
    expect(msgs).toMatch(/One rubric, every deal/);
    expect(msgs).toMatch(/Evaluators pay\. Founders get the feedback/);
    expect(msgs).toMatch(/A live index, not a static report/);
  });
});

describe("pitch-deck-3min.md — speakability and timing", () => {
  it("every speaker line passes speakabilityCheck()", () => {
    for (const s of deck.slides) {
      const r = speakabilityCheck(s.speaker);
      expect(r.ok, `slide ${s.n} speaker "${s.speaker}": ${r.problems.join("; ")}`).toBe(true);
    }
  });

  it("the cut table lists all 8 slides and sums to exactly 180 seconds", () => {
    expect(deck.threeMinute.table).toHaveLength(8);
    expect(deck.threeMinute.table.reduce((a, r) => a + r.seconds, 0)).toBe(180);
  });

  it("every sentence of the script passes speakabilityCheck() and the script is ≤ 440 words", () => {
    const script = deck.threeMinute.script;
    const sentences = splitSentences(script);
    expect(sentences.length).toBeGreaterThan(20);
    for (const sentence of sentences) {
      const r = speakabilityCheck(sentence);
      expect(r.ok, `script sentence "${sentence}": ${r.problems.join("; ")}`).toBe(true);
    }
    // ~145 wpm × 3 min; the master deck allows 420, this cut carries the calibration numbers.
    expect(countWords(script)).toBeLessThanOrEqual(440);
  });
});

describe("pitch-deck-3min.md — provenance and guardrails", () => {
  it("every numeric token on a slide appears in ## Provenance", () => {
    const missing: string[] = [];
    for (const s of deck.slides) {
      for (const t of [s.title, s.sub, ...s.bullets, ...collectScalars(s.hero.data)]) {
        for (const tok of t.match(NUMBER_RE) ?? []) {
          if (!provenanceHas(tok)) missing.push(`slide ${s.n}: ${tok} (in "${t}")`);
        }
      }
    }
    expect(missing, missing.join("\n")).toEqual([]);
  });

  it("guardrail grep — no PhD / SOC 2 / 500+ comparables / sign-up pause / trusted by / PPL Food", () => {
    const hits = md.match(/PhD|SOC ?2|500\+ comparables|paused|pause sign-?up|trusted by|PPL Food/gi) ?? [];
    expect(hits, hits.join(", ")).toEqual([]);
  });

  it("no user count on any slide; speaker lines carry no forbidden tokens", () => {
    for (const s of deck.slides) {
      const texts = [s.title, s.sub, ...s.bullets, ...collectScalars(s.hero.data)].join(" ");
      expect(texts).not.toMatch(/\b116\b/);
      expect(texts).not.toMatch(/\busers?\b/i);
      for (const re of FORBIDDEN_TOKENS) expect(s.speaker, `slide ${s.n}`).not.toMatch(re);
    }
  });
});
