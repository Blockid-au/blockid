/**
 * Deck v4 guard (G21 P0-D). Source of truth `content/pitch/pitch-deck-v4.md`
 * (+ the appendix); parser + renderer are the v3 ones, re-exported through
 * `scripts/generate-pitch-deck-v4.ts`.
 *
 * Pinned:
 *   - exactly 10 numbered slides (1..10) + a 5-slide appendix, ≤ 12-word
 *     titles, one hero of a known type, ≤ 3 bullets, ≤ 45 words of body;
 *   - the three messages, the one-liner and the institutional line present;
 *   - every speaker line + every sentence of the 3-minute script passes the
 *     speakability check (≤ 2 sentences, ≤ 20 words per breath, no SVI /
 *     SCN / tokenisation / PhD), script ≤ 420 words, cut sums to 180 s;
 *   - every numeric token on a slide appears in `## Provenance`;
 *   - slide 8 (validation) carries only numbers that the claims register
 *     classifies proven or observed;
 *   - guardrail grep: no agent counts, no "A$3", no "PPL Food", no "beta",
 *     no "PhD", no "predict", no "better AI", no sign-up pause, no "trusted
 *     by", no funding ask / valuation;
 *   - entity + ACN via lib/site/legal-entity.ts (front-matter parity, footer
 *     from the config, no stray entity literal outside the front-matter);
 *   - the slide-6 prices match plans.csv (Cohort 25 / 100, Starter / Growth)
 *     and the pilot SKUs match lib/pricing/pilot-skus.ts when it exists.
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { LEGAL_ENTITY, legalLine } from "@/lib/site/legal-entity";
import { countWords, speakabilityCheck, splitSentences } from "./hero-variants";
import { claimsRegisterSchema, normaliseClaim, type ClaimRow } from "./claims";
import {
  APPENDIX_MD_V4,
  DECK_MD_V4,
  FOOTER_TEXT_V4,
  INSTITUTIONAL_LINE,
  ONE_LINER,
  THREE_MESSAGES,
  assertEntityFromConfig,
  collectScalars,
  parseDeck,
  HERO_TYPES,
} from "../../../scripts/generate-pitch-deck-v4";

const WEB_ROOT = path.resolve(__dirname, "../../..");
const md = fs.readFileSync(path.join(WEB_ROOT, DECK_MD_V4), "utf8");
const appendixMd = fs.readFileSync(path.join(WEB_ROOT, APPENDIX_MD_V4), "utf8");
const deck = parseDeck(md);
const appendix = parseDeck(appendixMd);
const register = claimsRegisterSchema.parse(JSON.parse(fs.readFileSync(path.join(WEB_ROOT, "content/claims-register.json"), "utf8"))) as ClaimRow[];

const NUMBER_RE = /\d+(?:[.,]\d+)*/g;
const numericTokens = (text: string): string[] => text.match(NUMBER_RE) ?? [];
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const provenanceHas = (prov: string, token: string) => new RegExp(`(?<![\\d.,])${escapeRe(token)}(?![\\d.,])`).test(prov);
const slideTexts = (s: (typeof deck.slides)[number]) => [s.title, s.sub, ...s.bullets, ...collectScalars(s.hero.data)];

describe("pitch-deck-v4.md — structure", () => {
  it("front-matter: version 4.0, entity + ACN from LEGAL_ENTITY, brand BlockID, the next-milestone ask", () => {
    expect(String(deck.front.version)).toBe("4.0");
    expect(deck.front.date).toBe("2026-09-20");
    expect(deck.front.entity).toBe(LEGAL_ENTITY.operator);
    expect(deck.front.acn).toBe(LEGAL_ENTITY.acn);
    expect(deck.front.brand).toBe("BlockID");
    expect(String(deck.front.ask)).toMatch(/one organisation paying to assess a live cohort/i);
    expect(() => assertEntityFromConfig(deck)).not.toThrow();
    expect(() => assertEntityFromConfig(appendix)).not.toThrow();
  });

  it("footer is built from the config (operator + ACN + ABN), never a literal", () => {
    expect(FOOTER_TEXT_V4).toContain(legalLine());
    expect(FOOTER_TEXT_V4).toContain(LEGAL_ENTITY.operator);
    expect(FOOTER_TEXT_V4).toContain(`ACN ${LEGAL_ENTITY.acn}`);
    const v4 = fs.readFileSync(path.join(WEB_ROOT, "scripts/generate-pitch-deck-v4.ts"), "utf8");
    expect(v4).not.toMatch(/Auschain|659 615 111|PPL Food/);
  });

  it("has exactly 10 numbered slides 1..10 and a 5-slide appendix", () => {
    expect(deck.slides.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(appendix.slides.map((s) => s.n)).toEqual([1, 2, 3, 4, 5]);
    expect(appendix.front.kind).toBe("appendix");
  });

  it("slide order follows the P0-D brief: hero, problem, product, demo, customer, model, why, validation, founder, ask", () => {
    const t = deck.slides.map((s) => s.title.toLowerCase());
    expect(t[0]).toContain("startup screening is inconsistent");
    expect(t[0]).toContain("blockid makes every company comparable");
    expect(t[1]).toMatch(/scale/);
    expect(t[2]).toMatch(/application.*evidence.*dossier.*cohort/);
    expect(t[3]).toMatch(/one real company/);
    expect(t[4]).toMatch(/programs first/);
    expect(t[5]).toMatch(/paid pilot.*annual program.*institutional/);
    expect(t[6]).toMatch(/why blockid/);
    expect(t[7]).toMatch(/proven.*observed.*measure/);
    expect(t[8]).toMatch(/researcher who ships/);
    expect(t[9]).toMatch(/next milestone.*one paying cohort/);
  });

  it("every slide: ≤ 12-word title matching its heading, one known hero with a description, ≤ 3 bullets, ≤ 45 body words, clusters + sources", () => {
    for (const s of deck.slides) {
      expect(countWords(s.title), `slide ${s.n} title`).toBeLessThanOrEqual(12);
      expect(s.heading, `slide ${s.n} heading`).toBe(s.title);
      expect(HERO_TYPES).toContain(s.hero.type);
      expect(s.hero.description.length).toBeGreaterThan(10);
      expect(s.bullets.length, `slide ${s.n} bullets`).toBeLessThanOrEqual(3);
      expect(countWords(s.bullets.join(" ")), `slide ${s.n} body words`).toBeLessThanOrEqual(45);
      expect(s.clusters.length).toBeGreaterThan(0);
      expect(s.sources.length).toBeGreaterThan(0);
    }
  });

  it("the appendix covers features, methodology, valuation, legal and architecture as tables", () => {
    const titles = appendix.slides.map((s) => s.title.toLowerCase());
    for (const want of ["feature", "methodology", "valuation", "legal", "architecture"]) {
      expect(titles.some((t) => t.includes(want)), want).toBe(true);
    }
    for (const s of appendix.slides) expect(s.hero.type).toBe("table");
  });
});

describe("pitch-deck-v4.md — positioning lines", () => {
  it("slide 1 carries the three messages and the one-liner; the md carries the institutional line", () => {
    const heads = collectScalars(deck.slides[0].hero.data).join(" ");
    for (const m of THREE_MESSAGES) expect(heads).toContain(m);
    expect(heads).toContain(ONE_LINER);
    expect(md).toContain(ONE_LINER);
    expect(md).toContain(INSTITUTIONAL_LINE);
    // the closing slide repeats the three messages
    const last = collectScalars(deck.slides[9].hero.data).join(" ");
    for (const m of THREE_MESSAGES) expect(last).toContain(m);
  });

  it("slide 4 uses the public BlockID showcase report as the one real company", () => {
    expect(deck.slides[3].sub).toContain("blockid.au/showcase/blockid/report");
    expect(deck.slides[3].sources.join(" ")).toContain("src/app/showcase/blockid/report");
  });

  it("slide 7 carries the moat flywheel in order and never claims better AI", () => {
    const steps = collectScalars(deck.slides[6].hero.data);
    expect(steps).toEqual([
      "More programs",
      "More startups assessed",
      "More structured evidence",
      "More longitudinal outcomes",
      "Better benchmarks and calibration",
      "More useful assessments",
      "Higher evaluator trust",
    ]);
  });

  it("slide 9 says doctoral research and names the confirmed credentials + the commercial co-founder search", () => {
    const text = slideTexts(deck.slides[8]).join(" ");
    expect(text).toMatch(/doctoral research/);
    for (const c of ["Founder Institute", "Spacecubed AI Fellowship", "NVIDIA Inception"]) expect(text).toContain(c);
    expect(text).toMatch(/commercial co-founder/i);
  });

  it("slide 10 asks for the next milestone only — no round size, no valuation", () => {
    const text = slideTexts(deck.slides[9]).join(" ");
    expect(text).toMatch(/one program|organisation paying/i);
    expect(text).not.toMatch(/pre-seed|pre-money|SAFE|A\$\d{3},?\d{3}|raise|runway/i);
  });
});

describe("pitch-deck-v4.md — speakability", () => {
  it("every speaker line passes speakabilityCheck()", () => {
    for (const s of deck.slides) {
      const r = speakabilityCheck(s.speaker);
      expect(r.ok, `slide ${s.n} speaker "${s.speaker}": ${r.problems.join("; ")}`).toBe(true);
    }
  });

  it("the 3-minute cut lists 6 slides summing to 180 seconds and the script is ≤ 420 speakable words", () => {
    expect(deck.threeMinute.table).toHaveLength(6);
    expect(deck.threeMinute.table.reduce((a, r) => a + r.seconds, 0)).toBe(180);
    const script = deck.threeMinute.script;
    expect(countWords(script)).toBeLessThanOrEqual(420);
    const sentences = splitSentences(script);
    expect(sentences.length).toBeGreaterThan(10);
    for (const sentence of sentences) {
      const r = speakabilityCheck(sentence);
      expect(r.ok, `script sentence "${sentence}": ${r.problems.join("; ")}`).toBe(true);
    }
  });
});

describe("pitch-deck-v4.md — provenance, claims register and guardrails", () => {
  it("every numeric token on a slide (title / sub / bullets / hero.data) appears in ## Provenance (deck + appendix)", () => {
    const missing: string[] = [];
    for (const [label, d] of [["deck", deck], ["appendix", appendix]] as const) {
      for (const s of d.slides) {
        for (const t of slideTexts(s)) {
          for (const tok of numericTokens(t)) if (!provenanceHas(d.provenance, tok)) missing.push(`${label} slide ${s.n}: ${tok} (in "${t}")`);
        }
      }
    }
    expect(missing, missing.join("\n")).toEqual([]);
  });

  it("slide 8 (validation) contains no number that is not a proven / observed claims-register row", () => {
    const allowed = new Set<string>();
    for (const row of register) {
      if (row.class === "hypothesis") continue;
      for (const p of row.patterns) for (const tok of numericTokens(normaliseClaim(p))) allowed.add(tok);
      for (const tok of numericTokens(row.value)) allowed.add(tok);
    }
    const offenders: string[] = [];
    for (const t of slideTexts(deck.slides[7])) for (const tok of numericTokens(t)) if (!allowed.has(tok)) offenders.push(`${tok} (in "${t}")`);
    expect(offenders, "slide 8 may only carry proven / observed numbers — see docs/design/public-claims-policy.md § 3 rule 8").toEqual([]);
    expect(slideTexts(deck.slides[7]).join(" ")).toMatch(/paid pilots will measure/i);
  });

  it("guardrail grep over both md files", () => {
    const banned: Array<[RegExp, string]> = [
      [/\b\d+\s*(AI[- ])?(C-Level )?(specialist )?(AI )?agents?\b/i, "agent count"],
      [/C-Level agents/i, "C-Level agents"],
      [/A\$3\b(?![,\d])/, "A$3 anchor"],
      [/PPL Food/i, "marketing-only entity"],
      [/\bbeta\b/i, "beta"],
      [/\bPhD\b/i, "PhD"],
      [/\bpredict/i, "predict"],
      [/better AI|our AI is better|superior AI/i, "AI-superiority claim"],
      [/paused|pause sign-?up|sign-?ups? (are )?paused/i, "sign-up pause"],
      [/trusted by/i, "unverified trust claim"],
      [/SOC ?2/i, "SOC 2"],
      [/two-sided marketplace/i, "marketplace positioning"],
      [/Australian average/i, "benchmark without n"],
      [/\bAI decides\b/i, "AI decides"],
    ];
    for (const [file, text] of [["deck", md], ["appendix", appendixMd]] as const) {
      // the intro paragraph legitimately lists the banned words as rules — strip the prose above slide 1
      const body = text.slice(text.indexOf("## Slide 1"));
      for (const [re, why] of banned) {
        const hit = body.match(re);
        expect(hit, `${file}: ${why} — "${hit?.[0]}"`).toBeNull();
      }
    }
  });

  it("the entity literal appears only in the front-matter and the sourced legal table, never as ad-hoc copy", () => {
    const outsideFront = md.slice(md.indexOf("\n---\n", 4) + 5);
    expect(outsideFront.match(new RegExp(escapeRe(LEGAL_ENTITY.operator), "g")) ?? []).toHaveLength(0);
    expect(md).not.toMatch(/\bmarketingOperator\b/);
  });

  it("slide-6 prices agree with plans.csv (Cohort 25 / Cohort 100 annual; Starter / Growth monthly) and the pilot SKUs", async () => {
    const csv = fs.readFileSync(path.join(WEB_ROOT, "src/config/pricing/plans.csv"), "utf8").split("\n");
    const row = (id: string) => csv.find((l) => l.startsWith(`${id},`))!.split(",");
    const annualK = (id: string) => `${Number(row(id)[4]) / 100 / 1000}K`;
    const monthly = (id: string) => `A$${Number(row(id)[3]) / 100}`;
    const six = slideTexts(deck.slides[5]).join(" ");
    expect(six).toContain(`A$${annualK("accelerator_starter")}`);
    expect(six).toContain(`A$${annualK("accelerator_growth")}`);
    expect(six).toContain(`${monthly("founder_starter")} a month`);
    expect(six).toContain(`${monthly("founder_growth")} a month`);
    // Pilot SKUs: lib/pricing/pilot-skus.ts is lane P0-C's; when it exists the cents must match the deck.
    const skuPath = path.join(WEB_ROOT, "src/lib/pricing/pilot-skus.ts");
    const pilot25 = 1500;
    const pilot50 = 2500;
    expect(six).toContain(`A$${pilot25.toLocaleString("en-AU")}`);
    expect(six).toContain(`A$${pilot50.toLocaleString("en-AU")}`);
    if (fs.existsSync(skuPath)) {
      const src = fs.readFileSync(skuPath, "utf8");
      expect(src, "pilot-skus.ts must price cohort_pilot_25 at 150000 cents").toMatch(/150000/);
      expect(src, "pilot-skus.ts must price cohort_pilot_50 at 250000 cents").toMatch(/250000/);
    }
  });
});
