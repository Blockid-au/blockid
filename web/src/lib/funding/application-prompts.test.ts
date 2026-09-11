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
  GENERIC_PROGRAM_APPLICATION_PROMPTS,
  emptyAnswers,
  isGenericPromptSet,
  parseApplicationPrompts,
  programFundingLabel,
  programIntakeLabel,
  promptsForGrant,
  promptsForProgram,
  renderAnswersText,
} from "./application-prompts";
import { mapGrantSeeds, mapProgramSeeds } from "./seed-map";

const WEB = resolve(__dirname, "../../..");
const seed = JSON.parse(readFileSync(resolve(WEB, "content/data/grants-au.seed.json"), "utf8")) as {
  grants: Array<Record<string, unknown>>;
};
const migration = readFileSync(resolve(WEB, "supabase/migrations/0323_grant_application_prompts.sql"), "utf8");
const programSeed = JSON.parse(readFileSync(resolve(WEB, "content/data/programs-au.seed.json"), "utf8")) as {
  programs: Array<Record<string, unknown>>;
};
const programMigration = readFileSync(resolve(WEB, "supabase/migrations/0329_program_application_prompts.sql"), "utf8");

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

// ─── S16-A: program prompts (au_programs.application_prompts, migration 0329) ─

/** The 15 programs the task seeds — nearest intakes / highest profile; absent names replaced by open/upcoming intakes. */
const SEEDED_PROGRAM_IDS = [
  "syd-startmate-accelerator",
  "syd-cicada-elevate",
  "syd-energylab-accelerator",
  "per-plus-eight-accelerator",
  "per-curtin-accelerate",
  "bne-uq-ilab",
  "syd-catalysr-fellowship",
  "mel-kinesis-colabs",
  "adl-flinders-venture-dorm",
  "syd-antler-residency",
  "nat-y-combinator",
  "cbr-griffin-accelerator",
  "syd-remarkable-australia-plus",
  "nat-founder-institute-anz",
  "bne-luminax",
];

describe("generic program fallback", () => {
  it("has six accelerator questions (problem, solution, traction, team, why program, milestones), all generic, unique ids", () => {
    expect(GENERIC_PROGRAM_APPLICATION_PROMPTS.map((p) => p.id)).toEqual(["problem", "solution", "traction", "team", "why_program", "milestones"]);
    expect(isGenericPromptSet(GENERIC_PROGRAM_APPLICATION_PROMPTS)).toBe(true);
    for (const p of GENERIC_PROGRAM_APPLICATION_PROMPTS) {
      expect(p.question.length).toBeGreaterThan(20);
      expect(p.guidance).toBe(GENERIC_GUIDANCE);
      expect(p.max_words).toBeGreaterThan(0);
    }
  });

  it("promptsForProgram falls back when the program has none, and uses its own otherwise", () => {
    expect(promptsForProgram(null)).toEqual(GENERIC_PROGRAM_APPLICATION_PROMPTS);
    expect(promptsForProgram({ application_prompts: [] })).toEqual(GENERIC_PROGRAM_APPLICATION_PROMPTS);
    const own = promptsForProgram({ application_prompts: [{ id: "a", question: "Why you?" }] });
    expect(own).toEqual([{ id: "a", question: "Why you?" }]);
    expect(isGenericPromptSet(own)).toBe(false);
  });
});

describe("program seed shape (programs-au.seed.json)", () => {
  const rows = mapProgramSeeds(programSeed.programs);
  const seeded = rows.filter((p) => (p.application_prompts ?? []).length > 0);

  it("the 15 named programs are seeded, each with ≥ 5 well-formed questions with unique ids and word caps", () => {
    expect(seeded.map((p) => p.id).sort()).toEqual([...SEEDED_PROGRAM_IDS].sort());
    for (const p of seeded) {
      const ps = p.application_prompts!;
      expect(ps.length, p.id).toBeGreaterThanOrEqual(5);
      expect(new Set(ps.map((q) => q.id)).size, p.id).toBe(ps.length);
      expect(isGenericPromptSet(ps), p.id).toBe(false);
      for (const q of ps) {
        expect(q.question.trim().length, `${p.id}/${q.id}`).toBeGreaterThan(15);
        expect(/[?.]$/.test(q.question.trim()), `${p.id}/${q.id} ends with ? or .`).toBe(true);
        expect(q.max_words, `${p.id}/${q.id} has a word cap`).toBeGreaterThan(0);
      }
    }
  });

  it("every seeded program covers the accelerator basics: problem, team, and a why-this-program / milestones question", () => {
    for (const p of seeded) {
      const ids = p.application_prompts!.map((q) => q.id).join(" ");
      const text = p.application_prompts!.map((q) => q.question.toLowerCase()).join(" ");
      expect(/problem|idea|technology|science|background|company|business/.test(ids), `${p.id} problem/idea`).toBe(true);
      expect(/team|founder|cofounder|background|applicant/.test(ids), `${p.id} team`).toBe(true);
      expect(/why_|goals|milestones|twelve_months|program_use|investment_use|after_|next_steps|ambition|commitment/.test(ids), `${p.id} why/milestones`).toBe(true);
      expect(text.length).toBeGreaterThan(200);
    }
  });

  it("every seeded program has an open, upcoming or dated intake (nearest-intake rule)", () => {
    for (const p of seeded) {
      const hasWindow = Boolean(p.applications_open || p.applications_close || p.next_cohort_start);
      expect(hasWindow, `${p.id} has an intake`).toBe(true);
      expect(p.status !== "paused", `${p.id} is not paused`).toBe(true);
    }
  });

  it("migration 0329 seeds exactly the same prompts as the seed file (parity)", () => {
    const block = programMigration.split("-- BEGIN program application_prompts seed")[1]?.split("-- END program application_prompts seed")[0] ?? "";
    const updates = [...block.matchAll(/update public\.au_programs set application_prompts = '((?:[^']|'')*)'::jsonb where id = '([^']+)';/g)];
    expect(updates.length).toBe(seeded.length);
    const inMigration = new Map(updates.map((m) => [m[2], JSON.parse(m[1].replace(/''/g, "'"))]));
    for (const p of seeded) {
      expect(inMigration.has(p.id), p.id).toBe(true);
      expect(inMigration.get(p.id), p.id).toEqual(p.application_prompts);
    }
  });

  it("migration 0329 adds the nullable program_id + the exactly-one CHECK on grant_application_drafts", () => {
    expect(programMigration).toMatch(/alter table public\.au_programs\s+add column if not exists application_prompts jsonb not null default '\[\]'::jsonb/);
    expect(programMigration).toMatch(/add column if not exists program_id text references public\.au_programs\(id\) on delete cascade/);
    expect(programMigration).toMatch(/alter column grant_id drop not null/);
    expect(programMigration).toMatch(/check \(\(grant_id is not null\)::int \+ \(program_id is not null\)::int = 1\)/);
  });

  it("the seed mapper carries application_prompts for programs, so scripts/seed-au-funding.mjs re-applies them instead of wiping them", () => {
    const startmate = rows.find((p) => p.id === "syd-startmate-accelerator")!;
    expect(startmate.application_prompts!.map((q) => q.id)).toContain("why_startmate");
    const other = rows.find((p) => p.id === "syd-uts-startups")!;
    expect(other.application_prompts).toEqual([]);
  });
});

describe("program labels", () => {
  it("programIntakeLabel renders dated, month-only, rolling and free-text windows plus the next cohort", () => {
    expect(programIntakeLabel({ applications_open: "2026-09", applications_close: "2026-11-08", next_cohort_start: "2027-01-25" })).toBe(
      "Applications open Sep 2026, close 8 Nov 2026; next cohort 25 Jan 2027",
    );
    expect(programIntakeLabel({ applications_open: "rolling", applications_close: null, next_cohort_start: "2027-02-08" })).toBe("Applications are rolling; next cohort 8 Feb 2027");
    expect(programIntakeLabel({ applications_open: "rolling", applications_close: "2026-11-02", next_cohort_start: "2027-01" })).toBe("Applications close 2 Nov 2026; next cohort Jan 2027");
    expect(programIntakeLabel({ applications_open: "2027-07", applications_close: null, next_cohort_start: null })).toBe("Applications open Jul 2027");
    expect(programIntakeLabel({ applications_open: "by invitation", applications_close: null, next_cohort_start: null })).toBe("Applications: by invitation");
    expect(programIntakeLabel({ applications_open: null, applications_close: null, next_cohort_start: null })).toBeNull();
  });

  it("programFundingLabel combines amount + equity", () => {
    expect(programFundingLabel({ funding_aud: 120000, equity_pct: "≤8% (A$1.5M post-money cap if unraised)" })).toBe("A$120,000 for ≤8% (A$1.5M post-money cap if unraised)");
    expect(programFundingLabel({ funding_aud: 5000, equity_pct: "none" })).toBe("A$5,000, no equity");
    expect(programFundingLabel({ funding_aud: 0, equity_pct: "none" })).toBeNull();
    expect(programFundingLabel({ funding_aud: null, equity_pct: "12% (incl. A$75k program fee)" })).toBe("12% (incl. A$75k program fee)");
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
