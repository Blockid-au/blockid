// linkedin-upload (S-R5) — parser over the three synthetic "Save to PDF"
// fixtures (test-fixtures/linkedin/*.txt + their .pdf twins, rendered by
// scripts/fixtures/make-linkedin-pdfs.tsx), URL validation, and the
// founder_signals row mapping. The PDF cases go through the real pdf-parse
// v2 extractor — no network, no LLM.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  fromFounderSignalsRow,
  loadLatestFounderSignals,
  mergedYears,
  normaliseLinkedInUrl,
  parseDateRange,
  parseLinkedInPdf,
  parseLinkedInText,
  parseLinkedInUrl,
  saveFounderSignals,
  teamSizeFromText,
  toFounderSignalsRow,
  type FounderSignalsDb,
} from "./linkedin-upload";

const FIX = path.join(process.cwd(), "test-fixtures", "linkedin");
const txt = (n: string) => readFileSync(path.join(FIX, `${n}.txt`), "utf8");
const pdf = (n: string) => readFileSync(path.join(FIX, `${n}.pdf`));
const NOW = new Date("2026-09-16T00:00:00Z");

describe("helpers", () => {
  it("parseDateRange handles month-year, year-only and Present", () => {
    expect(parseDateRange("Jan 2021 - Present (5 years 9 months)", NOW)).toEqual({ start: "2021-01", end: "2026-09", current: true, months: 68 });
    expect(parseDateRange("2013 - 2016 (3 years)", NOW)).toEqual({ start: "2013-01", end: "2016-01", current: false, months: 36 });
    expect(parseDateRange("Sep 2019 – May 2024", NOW)).toMatchObject({ start: "2019-09", end: "2024-05", months: 56 });
    expect(parseDateRange("Sydney, Australia", NOW)).toBeNull();
  });

  it("mergedYears merges overlapping roles instead of double counting", () => {
    expect(mergedYears([{ start: "2016-01", end: "2020-12" }, { start: "2019-01", end: "2022-01" }])).toBe(6);
    expect(mergedYears([{ start: "2013-02", end: "2016-02" }, { start: "2021-01", end: "2026-09" }])).toBe(8.7);
  });

  it("teamSizeFromText picks the largest mention", () => {
    expect(teamSizeFromText("Leading a team of 14 across product. Earlier a 6-person team.")).toBe(14);
    expect(teamSizeFromText("40 staff across AU")).toBe(40);
    expect(teamSizeFromText("no numbers")).toBeNull();
  });

  it("normaliseLinkedInUrl accepts /in/<slug> only", () => {
    expect(normaliseLinkedInUrl("linkedin.com/in/jane-doe-au/")).toBe("https://www.linkedin.com/in/jane-doe-au");
    expect(normaliseLinkedInUrl("https://au.linkedin.com/in/minh-tran-vn?trk=x")).toBe("https://www.linkedin.com/in/minh-tran-vn");
    expect(normaliseLinkedInUrl("https://www.linkedin.com/company/acme")).toBeNull();
    expect(normaliseLinkedInUrl("https://evil.example/in/jane")).toBeNull();
  });
});

describe("parseLinkedInText — fixtures", () => {
  it("jane-doe: experienced operator with one exit, 14-person team, healthtech domain years", () => {
    const s = parseLinkedInText(txt("jane-doe"), { now: NOW, domainKeywords: ["health", "clinic"] });
    expect(s.founderName).toBe("Jane Doe");
    expect(s.headline).toMatch(/Co-founder & CEO at Acme Health/);
    expect(s.currentRole).toBe("Co-founder & CEO at Acme Health");
    expect(s.roles.map((r) => r.company)).toEqual(["Acme Health", "Atlassian", "ClinicFlow"]);
    expect(s.roles[0]).toMatchObject({ title: "Co-founder & CEO", start: "2021-01", current: true });
    expect(s.roles[2]).toMatchObject({ title: "Head of Product", start: "2013-02", end: "2016-02", exit: true });
    expect(s.yearsExperience).toBe(13.6); // 2013-02 → 2026-09 contiguous (163 months)
    expect(s.yearsInDomain).toBe(8.7); // Acme Health + ClinicFlow
    expect(s.priorCompanies).toEqual(["Atlassian", "ClinicFlow"]);
    expect(s.exits).toBe(1);
    expect(s.teamSizeOnPage).toBe(14);
    expect(s.education).toEqual(["University of Sydney — Bachelor of Commerce, Finance"]);
    expect(s.confidence).toBe(1);
    expect(s.source).toBe("linkedin_text");
  });

  it("minh-tran: first-time founder, no exits, 6-person team, Vietnamese location survives", () => {
    const s = parseLinkedInText(txt("minh-tran"), { now: NOW, domainKeywords: ["payments", "fintech"] });
    expect(s.founderName).toBe("Minh Tran");
    expect(s.roles.map((r) => r.company)).toEqual(["PayLoop", "Techcombank", "FPT Software"]);
    expect(s.yearsExperience).toBe(10); // 2016-01→2019-01 + 2019-09→2026-09 (May→Jun 2024 adjacent) = 120 months
    expect(s.yearsInDomain).toBe(7); // current venture always counts + Techcombank "Payments" title, merged (May→Jun 2024 adjacent) = 84 mo; FPT excluded
    expect(s.exits).toBe(0);
    expect(s.teamSizeOnPage).toBe(6);
    expect(s.priorCompanies).toEqual(["Techcombank", "FPT Software"]);
  });

  it("sam-lee: serial founder — two exits (trade sale + IPO), 40 staff, no contact block", () => {
    const s = parseLinkedInText(txt("sam-lee"), { now: NOW });
    expect(s.founderName).toBe("Sam Lee");
    expect(s.headline).toBe("Serial founder · 2 exits · angel investor");
    expect(s.roles.map((r) => [r.company, r.exit])).toEqual([["GridEdge Energy", false], ["Voltify", true], ["Spark Analytics", true]]);
    expect(s.exits).toBe(2);
    expect(s.teamSizeOnPage).toBe(40);
    expect(s.yearsExperience).toBe(16.7); // 2009-01 → 2014-01, 2015-01 → 2026-09
    expect(s.yearsInDomain).toBe(16.7); // no domain keywords → total
    expect(s.education).toHaveLength(2);
  });

  it("empty / junk text degrades to nulls with low confidence", () => {
    const s = parseLinkedInText("hello world", { now: NOW });
    expect(s).toMatchObject({ founderName: null, headline: null, yearsExperience: null, roles: [], exits: 0, confidence: 0.2 });
  });
});

describe("parseLinkedInPdf — the three PDF fixtures through pdf-parse v2", () => {
  it("jane-doe.pdf", async () => {
    const s = await parseLinkedInPdf(pdf("jane-doe"), { now: NOW, domainKeywords: ["health", "clinic"] });
    expect(s.engine).toBe("pdf-parse-v2");
    expect(s.extractedChars).toBeGreaterThan(400);
    expect(s.source).toBe("linkedin_pdf");
    expect(s.founderName).toBe("Jane Doe");
    expect(s.roles.map((r) => r.company)).toEqual(["Acme Health", "Atlassian", "ClinicFlow"]);
    expect(s.exits).toBe(1);
    expect(s.teamSizeOnPage).toBe(14);
    expect(s.yearsInDomain).toBe(8.7);
  }, 30_000);

  it("minh-tran.pdf + sam-lee.pdf", async () => {
    const m = await parseLinkedInPdf(pdf("minh-tran"), { now: NOW });
    expect(m.founderName).toBe("Minh Tran");
    expect(m.roles).toHaveLength(3);
    expect(m.teamSizeOnPage).toBe(6);
    const s = await parseLinkedInPdf(pdf("sam-lee"), { now: NOW });
    expect(s.founderName).toBe("Sam Lee");
    expect(s.exits).toBe(2);
    expect(s.teamSizeOnPage).toBe(40);
  }, 30_000);

  it("a non-PDF buffer yields an empty, low-confidence result (no byte-scan garbage)", async () => {
    const s = await parseLinkedInPdf(Buffer.from("not a pdf at all"), { now: NOW });
    expect(s.engine).toBe("none");
    expect(s.roles).toEqual([]);
    expect(s.confidence).toBe(0.2);
  });
});

describe("URL mode + persistence mapping", () => {
  it("parseLinkedInUrl stores the pointer only", () => {
    const s = parseLinkedInUrl("linkedin.com/in/jane-doe-au", { now: NOW });
    expect(s).toMatchObject({ source: "linkedin_url", profileUrl: "https://www.linkedin.com/in/jane-doe-au", roles: [], confidence: 0.2, yearsExperience: null });
    expect(parseLinkedInUrl("https://twitter.com/jane")).toBeNull();
  });

  it("row mapping round-trips and never carries raw text", () => {
    const s = parseLinkedInText(txt("jane-doe"), { now: NOW, profileUrl: "https://www.linkedin.com/in/jane-doe-au" });
    const row = toFounderSignalsRow("11111111-2222-4333-8444-555555555555", s);
    expect(row).toMatchObject({ project_id: "11111111-2222-4333-8444-555555555555", source: "linkedin_text", profile_url: "https://www.linkedin.com/in/jane-doe-au", founder_name: "Jane Doe", exits: 1, team_size_on_page: 14 });
    expect(Object.keys(row)).not.toContain("raw_text");
    expect(fromFounderSignalsRow({ ...row, years_experience: "13.5" as unknown as number })).toMatchObject({ yearsExperience: 13.5, founderName: "Jane Doe", roles: s.roles });
  });

  it("saveFounderSignals inserts, loadLatestFounderSignals reads newest-first and swallows a missing table", async () => {
    const inserted: Record<string, unknown>[] = [];
    const db: FounderSignalsDb = {
      from: () => ({
        insert: (row) => ({ select: () => ({ maybeSingle: async () => ((inserted.push(row), { data: { id: "fs-1" }, error: null })) }) }),
        select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: inserted[0] ?? null, error: null }) }) }) }) }),
      }),
    };
    const s = parseLinkedInText(txt("sam-lee"), { now: NOW });
    expect(await saveFounderSignals(db, "p1", s)).toEqual({ ok: true, id: "fs-1" });
    expect(inserted[0]).toMatchObject({ project_id: "p1", exits: 2 });
    expect((await loadLatestFounderSignals(db, "p1"))?.founderName).toBe("Sam Lee");
    const broken: FounderSignalsDb = { from: () => ({ insert: db.from("x").insert, select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'relation "founder_signals" does not exist' } }) }) }) }) }) }) };
    expect(await loadLatestFounderSignals(broken, "p1")).toBeNull();
  });
});
