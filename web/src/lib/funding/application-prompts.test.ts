// Colocated tests for lib/funding/application-prompts (T0251):
//   • the generic fallback exists (4 questions, every one marked "generic");
//   • every grant in grants-au.seed.json that carries application_prompts has
//     ≥ 3 well-formed questions with unique ids, and at least the 10 highest
//     amount_max_aud OPEN grants are seeded;
//   • migration 0323's UPDATE block is byte-for-byte the seed (parity);
//   • parseApplicationPrompts drops junk, promptsForGrant falls back,
//     renderAnswersText never blanks an unanswered prompt.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GENERIC_APPLICATION_PROMPTS,
  GENERIC_GUIDANCE,
  emptyAnswers,
  isGenericPromptSet,
  parseApplicationPrompts,
  promptsForGrant,
  renderAnswersText,
} from "./application-prompts";
import { mapGrantSeeds } from "./seed-map";

const WEB = resolve(__dirname, "../../..");
const seed = JSON.parse(readFileSync(resolve(WEB, "content/data/grants-au.seed.json"), "utf8")) as {
  grants: Array<Record<string, unknown>>;
};
const migration = readFileSync(resolve(WEB, "supabase/migrations/0323_grant_application_prompts.sql"), "utf8");

describe("generic fallback", () => {
  it("has four questions, all marked generic, with unique ids", () => {
    expect(GENERIC_APPLICATION_PROMPTS.length).toBe(4);
    expect(isGenericPromptSet(GENERIC_APPLICATION_PROMPTS)).toBe(true);
    expect(new Set(GENERIC_APPLICATION_PROMPTS.map((p) => p.id)).size).toBe(4);
    for (const p of GENERIC_APPLICATION_PROMPTS) {
      expect(p.question.length).toBeGreaterThan(20);
      expect(p.guidance).toBe(GENERIC_GUIDANCE);
      expect(p.max_words).toBeGreaterThan(0);
    }
  });

  it("promptsForGrant falls back when the grant has none, and uses its own otherwise", () => {
    expect(promptsForGrant(null)).toEqual(GENERIC_APPLICATION_PROMPTS);
    expect(promptsForGrant({ application_prompts: [] })).toEqual(GENERIC_APPLICATION_PROMPTS);
    const own = promptsForGrant({ application_prompts: [{ id: "a", question: "Why you?" }] });
    expect(own).toEqual([{ id: "a", question: "Why you?" }]);
    expect(isGenericPromptSet(own)).toBe(false);
  });
});

describe("seed shape (grants-au.seed.json)", () => {
  const rows = mapGrantSeeds(seed.grants);
  const seeded = rows.filter((g) => (g.application_prompts ?? []).length > 0);

  it("every seeded prompt set has ≥ 3 well-formed questions with unique ids", () => {
    expect(seeded.length).toBeGreaterThanOrEqual(10);
    for (const g of seeded) {
      const ps = g.application_prompts!;
      expect(ps.length, g.id).toBeGreaterThanOrEqual(3);
      expect(new Set(ps.map((p) => p.id)).size, g.id).toBe(ps.length);
      for (const p of ps) {
        expect(p.question.trim().length, `${g.id}/${p.id}`).toBeGreaterThan(15);
        expect(/[?.]$/.test(p.question.trim()), `${g.id}/${p.id} ends with ? or .`).toBe(true);
        if (p.max_words !== undefined) expect(p.max_words).toBeGreaterThan(0);
      }
    }
  });

  it("covers the 10 highest amount_max_aud OPEN grants plus the headline programs", () => {
    const top10 = rows
      .filter((g) => g.status === "open" && !g.exclude_from_matching && typeof g.amount_max_aud === "number")
      .sort((a, b) => (b.amount_max_aud ?? 0) - (a.amount_max_aud ?? 0))
      .slice(0, 10)
      .map((g) => g.id);
    const seededIds = new Set(seeded.map((g) => g.id));
    for (const id of top10) expect(seededIds.has(id), id).toBe(true);
    for (const id of ["rdti", "emdg", "csiro-kick-start", "nsw-mvp-ventures", "qld-ignite-ideas", "accelerating-commercialisation", "boosting-female-founders"]) {
      expect(seededIds.has(id), id).toBe(true);
    }
  });

  it("the big programs carry official-guideline prompts, not the generic marker", () => {
    for (const id of ["rdti", "emdg", "nsw-mvp-ventures", "csiro-kick-start"]) {
      const g = seeded.find((x) => x.id === id)!;
      expect(isGenericPromptSet(g.application_prompts!)).toBe(false);
    }
    const rdti = seeded.find((x) => x.id === "rdti")!.application_prompts!;
    expect(rdti.map((p) => p.id)).toContain("core_activity");
  });

  it("migration 0323 seeds exactly the same prompts as the seed file (parity)", () => {
    const block = migration.split("-- BEGIN application_prompts seed")[1]?.split("-- END application_prompts seed")[0] ?? "";
    const updates = [...block.matchAll(/update public\.au_grants set application_prompts = '((?:[^']|'')*)'::jsonb where id = '([^']+)';/g)];
    expect(updates.length).toBe(seeded.length);
    const inMigration = new Map(updates.map((m) => [m[2], JSON.parse(m[1].replace(/''/g, "'"))]));
    for (const g of seeded) {
      expect(inMigration.has(g.id), g.id).toBe(true);
      expect(inMigration.get(g.id), g.id).toEqual(g.application_prompts);
    }
  });
});

describe("parse / render helpers", () => {
  it("parseApplicationPrompts drops junk, trims, de-dupes ids and keeps only positive integer max_words", () => {
    expect(parseApplicationPrompts(null)).toEqual([]);
    expect(parseApplicationPrompts("x")).toEqual([]);
    expect(
      parseApplicationPrompts([
        { id: " a ", question: " Q1 ", guidance: "", max_words: 100 },
        { id: "a", question: "dupe" },
        { id: "b", question: "Q2", max_words: 0 },
        { id: "c", question: "Q3", max_words: 12.5 },
        { id: "", question: "no id" },
        { id: "d" },
        null,
        [],
      ]),
    ).toEqual([
      { id: "a", question: "Q1", max_words: 100 },
      { id: "b", question: "Q2" },
      { id: "c", question: "Q3" },
    ]);
  });

  it("emptyAnswers + renderAnswersText never blank", () => {
    const ps = [{ id: "a", question: "Why?" }, { id: "b", question: "How?" }];
    expect(emptyAnswers(ps)).toEqual({ a: "", b: "" });
    const text = renderAnswersText(ps, { a: "Because." }, "Grant X");
    expect(text).toContain("# Grant X");
    expect(text).toContain("## Why?\n\nBecause.");
    expect(text).toContain("## How?\n\n(no answer yet)");
  });
});
