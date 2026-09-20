// Colocated vitest for lib/evaluations/cohort-import.ts (G21 P2-A). Pins:
//   * the RFC 4180 parser (quotes, doubled quotes, CRLF, BOM, trailing line);
//   * header required + case-insensitive + aliases, extra columns ignored;
//   * per-row validation with 1-based line numbers (header = line 1);
//   * dedupe inside the file (domain → abn → e-mail) and against the cohort;
//   * stage parsing by number, name and alias; the sample file is valid.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  IMPORT_MAX_BYTES,
  SAMPLE_CSV,
  capState,
  keysForExisting,
  normaliseAbn,
  normaliseDomain,
  parseCohortImport,
  parseCsv,
  parseStage,
} from "./cohort-import";

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, CRLF, a BOM and a trailing newline", () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\n1,2\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["1", "2"],
    ]);
  });
  it("keeps a last line without a newline", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("cell normalisers", () => {
  it("normaliseDomain strips scheme + www and lower-cases", () => {
    expect(normaliseDomain("HTTPS://WWW.Acme.com.au/about")).toBe("acme.com.au");
    expect(normaliseDomain("acme.com.au")).toBe("acme.com.au");
    expect(normaliseDomain("not a url")).toBeNull();
    expect(normaliseDomain("")).toBeNull();
  });
  it("normaliseAbn accepts 11 digits with spaces and rejects the rest", () => {
    expect(normaliseAbn("79 659 615 111")).toEqual({ ok: true, abn: "79659615111" });
    expect(normaliseAbn("")).toEqual({ ok: true, abn: null });
    expect(normaliseAbn("12345")).toEqual({ ok: false });
  });
  it("parseStage: number, STAGE_NAMES label, alias, unknown", () => {
    expect(parseStage("3")).toBe(3);
    expect(parseStage("MVP")).toBe(3);
    expect(parseStage("early traction")).toBe(4);
    expect(parseStage("Seed")).toBe(4);
    expect(parseStage("stage 5")).toBe(5);
    expect(parseStage("")).toBeNull();
    expect(parseStage("9")).toBeUndefined();
    expect(parseStage("unicorn")).toBeUndefined();
  });
});

describe("parseCohortImport", () => {
  it("requires a header carrying `company` (case-insensitive, aliases allowed)", () => {
    expect(parseCohortImport("")).toMatchObject({ ok: false, error: "empty" });
    expect(parseCohortImport("foo,bar\n1,2")).toMatchObject({ ok: false, error: "missing_header" });
    const r = parseCohortImport("Name,Website,Email\nAcme,acme.com,f@acme.com");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rows[0]).toMatchObject({ company: "Acme", domain: "acme.com", contactEmail: "f@acme.com", line: 2 });
  });

  it("refuses a file over the byte cap", () => {
    const big = "company\n" + "x".repeat(IMPORT_MAX_BYTES);
    expect(parseCohortImport(big)).toMatchObject({ ok: false, error: "too_large" });
  });

  it("validates every row with its line number and keeps going", () => {
    const csv = [
      "company,url,contact_email,stage,sector,deck_url,abn",
      "Good Co,https://good.co,f@good.co,MVP,Fintech,https://good.co/deck.pdf,79659615111",
      ",https://nocompany.co,,,,,",
      "Bad Url,http://,,,,,",
      "Bad Email,,not-an-email,,,,",
      "Bad Stage,,,unicorn,,,",
      "Bad Deck,,,,,ftp://x,",
      "Bad Abn,,,,,,123",
      "   ,,,,,,",
      "Long Name " + "x".repeat(100) + ",,,,,,",
    ].join("\n");
    const r = parseCohortImport(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows.map((x) => x.company)).toEqual(["Good Co"]);
    expect(r.rows[0]).toMatchObject({ stage: 3, sector: "Fintech", abn: "79659615111", url: "https://good.co", deckUrl: "https://good.co/deck.pdf" });
    expect(r.rows[0]!.keys).toEqual(["domain:good.co", "abn:79659615111", "email:f@good.co"]);
    expect(r.skipped.map((s) => [s.line, s.reason])).toEqual([
      [3, "missing_company"],
      [4, "invalid_url"],
      [5, "invalid_email"],
      [6, "invalid_stage"],
      [7, "invalid_deck_url"],
      [8, "invalid_abn"],
      [9, "empty_row"],
      [10, "company_too_long"],
    ]);
  });

  it("dedupes inside the file by domain, ABN or e-mail (first row wins)", () => {
    const csv = [
      "company,url,contact_email,abn",
      "A,https://www.acme.com,a@acme.com,",
      "A again,acme.com,,",
      "B,,b@b.com,11111111111",
      "B again,https://other.com,,11111111111",
      "C,,a@acme.com,",
      "D,https://d.com,,",
    ].join("\n");
    const r = parseCohortImport(csv);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows.map((x) => x.company)).toEqual(["A", "B", "D"]);
    expect(r.skipped).toEqual([
      { line: 3, reason: "duplicate_in_file", message: "Duplicate of an earlier row (domain acme.com)" },
      { line: 5, reason: "duplicate_in_file", message: "Duplicate of an earlier row (abn 11111111111)" },
      { line: 6, reason: "duplicate_in_file", message: "Duplicate of an earlier row (email a@acme.com)" },
    ]);
  });

  it("dedupes against the cohort's existing evaluations (keysForExisting)", () => {
    const existing = keysForExisting([
      { website: "https://www.held.com", founderEmail: "F@Held.com", abn: "79 659 615 111" },
      { website: null, founderEmail: null, abn: null },
    ]);
    expect([...existing].sort()).toEqual(["abn:79659615111", "domain:held.com", "email:f@held.com"]);
    const r = parseCohortImport("company,url,contact_email\nHeld,held.com,\nNew,new.com,n@new.com\nHeld2,,f@held.com", { existingKeys: existing });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows.map((x) => x.company)).toEqual(["New"]);
    expect(r.skipped.map((s) => s.reason)).toEqual(["duplicate_in_cohort", "duplicate_in_cohort"]);
  });

  it("caps the number of rows (too_many_rows carries the line)", () => {
    const csv = ["company", "a", "b", "c"].join("\n");
    const r = parseCohortImport(csv, { maxRows: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(2);
    expect(r.skipped).toEqual([{ line: 4, reason: "too_many_rows", message: "A cohort import holds up to 2 startups" }]);
  });

  it("the shipped sample (public/samples/cohort-import.csv) equals SAMPLE_CSV and imports 3 rows", () => {
    const file = readFileSync(path.resolve(__dirname, "..", "..", "..", "public", "samples", "cohort-import.csv"), "utf8");
    expect(file).toBe(SAMPLE_CSV);
    const r = parseCohortImport(file);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows.map((x) => [x.company, x.stage, x.domain])).toEqual([
      ["Acme Robotics", 3, "acmerobotics.com.au"],
      ["Brightleaf Health", 4, "brightleaf.health"],
      ["Cobalt Fintech", 2, "cobalt.finance"],
    ]);
    expect(r.skipped).toEqual([]);
  });
});

describe("capState", () => {
  it("reports remaining for a capped cohort and null when uncapped", () => {
    expect(capState(3, 25)).toEqual({ used: 3, max: 25, remaining: 22 });
    expect(capState(30, 25)).toEqual({ used: 30, max: 25, remaining: 0 });
    expect(capState(3, null)).toEqual({ used: 3, max: null, remaining: null });
  });
});
