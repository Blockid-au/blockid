// Colocated tests for the external-signals ingest (G14-S40): the three
// adapter parsers on the fixtures (incl. stream chunk boundaries for the ABR
// XML), content-hash dedupe, the licence gate (unknown / cite_only / disabled
// / mismatch refused), the ABN allow-set filter, and the CLI's dry-run
// summary with an injected fake DB. No network, no Supabase.

import { createReadStream, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import * as abr from "./adapters/abr-bulk.mjs";
import * as grants from "./adapters/business-gov-grants.mjs";
import * as funding from "./adapters/funding-announcements.mjs";
import * as rdti from "./adapters/rdti-transparency.mjs";
import { ADAPTERS, SEED_SOURCES, buildAllowSet, main, runSource } from "./ingest.mjs";
import { EXIT_ERROR, EXIT_OK, EXIT_REFUSED, EXIT_USAGE, canonicalJson, contentHash, dedupeRows, filterByAllowSet, finaliseRow, incomeYearEnd, licenceGate, parseAbnFile, parseArgs, parseCsv, pickValue, toIsoDate, toNumber, validateAbnChecksum } from "./lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = (f) => join(HERE, "fixtures", f);
const ALLOW = new Set(["95608464535", "53666147271", "87644546770", "42656444674"]);

const seedRows = () => new Map(SEED_SOURCES.map((s) => [s.id, { ...s }]));

describe("lib — ABN / dates / csv", () => {
  it("validates ABN checksums and rejects the 12345678901 placeholder", () => {
    expect(validateAbnChecksum("95 608 464 535")).toBe(true);
    expect(validateAbnChecksum("12345678901")).toBe(false);
    expect(validateAbnChecksum("123")).toBe(false);
  });
  it("parses the register date formats to YYYY-MM-DD", () => {
    expect(toIsoDate("20240131")).toBe("2024-01-31");
    expect(toIsoDate("31-Jan-2024")).toBe("2024-01-31");
    expect(toIsoDate("31/01/2024")).toBe("2024-01-31");
    expect(toIsoDate("2024-1-5")).toBe("2024-01-05");
    expect(toIsoDate("Jan 31, 2024")).toBe("2024-01-31");
    expect(toIsoDate("not a date")).toBeNull();
    expect(incomeYearEnd("2022-23")).toBe("2023-06-30");
    expect(incomeYearEnd("2022–23")).toBe("2023-06-30");
    expect(toNumber("$486,500.00")).toBe(486500);
  });
  it("parses RFC 4180 CSV with quoted commas, doubled quotes and CRLF, and resolves columns by alias", () => {
    const DQ = String.fromCharCode(34);
    const rows = parseCsv(`Recipient ABN,Value (AUD)\r\n${DQ}95 608 464 535${DQ},${DQ}1,000${DQ}\r\n11,${DQ}say ${DQ}${DQ}hi${DQ}${DQ}${DQ}\r\n`);
    expect(rows).toHaveLength(2);
    expect(pickValue(rows[0], ["ABN", "Recipient ABN"])).toBe("95 608 464 535");
    expect(pickValue(rows[0], ["Amount", "Value (AUD)"])).toBe("1,000");
    expect(rows[1]["Value (AUD)"]).toBe(`say ${DQ}hi${DQ}`);
    expect(pickValue(rows[0], ["Nope"])).toBeNull();
  });
  it("parseArgs: sources, limit, dry, file needs one source, unknown flag throws", () => {
    const a = parseArgs(["--source", "abr-bulk", "--source=rdti-transparency", "--limit", "5", "--dry", "--json"]);
    expect(a.sources).toEqual(["abr-bulk", "rdti-transparency"]);
    expect(a.limit).toBe(5);
    expect(a.dry).toBe(true);
    expect(() => parseArgs(["--source", "cut-through-venture"])).toThrow(/--source must be one of/);
    expect(() => parseArgs(["--file", "x.csv"])).toThrow(/exactly one --source/);
    expect(() => parseArgs(["--limit", "0"])).toThrow(/positive integer/);
    expect(() => parseArgs(["--bogus"])).toThrow(/unknown flag/);
  });
});

describe("licence gate", () => {
  it("accepts the four active sources and refuses unknown / cite_only / disabled / blank licence", () => {
    const rows = seedRows();
    for (const id of ["abr-bulk", "business-gov-grants", "rdti-transparency", "funding-announcements"]) expect(licenceGate(rows.get(id))).toEqual({ ok: true });
    for (const id of ["cut-through-venture", "startup-muster", "acs-digital-pulse"]) {
      const g = licenceGate(rows.get(id));
      expect(g.ok).toBe(false);
      expect(g.reason).toMatch(/cite_only/);
    }
    expect(licenceGate(undefined).reason).toMatch(/unknown source/);
    expect(licenceGate({ id: "x", licence: "CC BY 4.0", status: "disabled" }).reason).toMatch(/disabled/);
    expect(licenceGate({ id: "x", licence: "  ", status: "active" }).reason).toMatch(/no licence/);
    // A "cite only" marker in the licence text refuses even when status says active.
    expect(licenceGate({ id: "x", licence: "All rights reserved (cite only)", status: "active" }).ok).toBe(false);
  });
  it("seed catalogue: exactly 4 ingestable + 3 cite_only, every adapter's licence matches its seed row", () => {
    expect(SEED_SOURCES.filter((s) => s.status === "active").map((s) => s.id).sort()).toEqual(["abr-bulk", "business-gov-grants", "funding-announcements", "rdti-transparency"]);
    expect(SEED_SOURCES.filter((s) => s.status === "cite_only")).toHaveLength(3);
    for (const [id, adapter] of Object.entries(ADAPTERS)) expect(adapter.licence, id).toBe(SEED_SOURCES.find((s) => s.id === id).licence);
  });
});

describe("content hash + dedupe", () => {
  it("canonical JSON is key-order independent; the hash changes with any of source/abn/type/as_of/value", () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: null }], u: undefined })).toBe(canonicalJson({ a: [{ c: null, d: 2 }], b: 1 }));
    const base = { source_id: "rdti-transparency", entity_abn: "95608464535", signal_type: "rdti_registration", as_of: "2023-06-30", value: { rd_expenditure_aud: 1 } };
    const h = contentHash(base);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(contentHash({ ...base, value: { rd_expenditure_aud: 1 } })).toBe(h);
    expect(contentHash({ ...base, as_of: "2024-06-30" })).not.toBe(h);
    expect(contentHash({ ...base, entity_abn: "53666147271" })).not.toBe(h);
    expect(contentHash({ ...base, source_id: "abr-bulk" })).not.toBe(h);
    expect(contentHash({ ...base, value: { rd_expenditure_aud: 2 } })).not.toBe(h);
  });
  it("finaliseRow attaches the hash and rejects malformed rows; dedupeRows drops repeats and known hashes", () => {
    const row = finaliseRow({ source_id: "abr-bulk", entity_abn: "95608464535", signal_type: "abr_entity", as_of: "2025-06-14", value: { abn_status: "ACT" } });
    expect(row.content_hash).toHaveLength(64);
    expect(row.match_confidence).toBe("high");
    expect(() => finaliseRow({ source_id: "abr-bulk", signal_type: "abr_entity", as_of: "14/06/2025", value: {} })).toThrow(/YYYY-MM-DD/);
    expect(() => finaliseRow({ source_id: "abr-bulk", signal_type: "made_up", as_of: "2025-06-14", value: {} })).toThrow(/unknown signal_type/);
    const { fresh, duplicates } = dedupeRows([row, { ...row }, { ...row, content_hash: "other" }], new Set(["other"]));
    expect(fresh).toHaveLength(1);
    expect(duplicates).toBe(2);
  });
});

describe("adapters on the fixtures", () => {
  it("abr-bulk: streams records across 64-byte chunk boundaries, keeps only allow-set ABNs, maps the register fields", async () => {
    const res = await abr.parse(createReadStream(FIX("abr-sample.xml"), { highWaterMark: 64 }), { keep: ALLOW });
    expect(res.parsed).toBe(5);
    expect(res.rows.map((r) => r.entity_abn)).toEqual(["95608464535", "53666147271", "87644546770", "42656444674"]);
    const [harbour, reef, outback, sole] = res.rows;
    expect(harbour).toMatchObject({ source_id: "abr-bulk", signal_type: "abr_entity", as_of: "2025-06-14", entity_acn: "608464535", entity_name: "HARBOUR ANALYTICS PTY LTD", match_confidence: "high", source_url: "https://abr.business.gov.au/ABN/View?abn=95608464535" });
    expect(harbour.value).toMatchObject({ abn_status: "ACT", abn_status_from: "2019-03-01", entity_type_code: "PRV", state: "NSW", postcode: "2000", gst_status: "ACT", gst_from: "2019-03-01", individual: false, replaced: false });
    expect(reef.value.gst_status).toBe("NON");
    expect(outback.value).toMatchObject({ abn_status: "CAN", gst_status: "CAN" });
    // Sole trader: individual name reduced to initial + family name; no ACN.
    expect(sole).toMatchObject({ entity_name: "J. CITIZEN", entity_acn: null });
    expect(sole.value).toMatchObject({ individual: true, entity_type_code: "IND", state: "WA" });
    for (const r of res.rows) expect(r.content_hash).toHaveLength(64);
  });
  it("abr-bulk: empty allow-set keeps nothing, --limit stops parsing, string input works", async () => {
    const xml = readFileSync(FIX("abr-sample.xml"), "utf8");
    expect((await abr.parse(xml, { keep: new Set() })).rows).toHaveLength(0);
    const limited = await abr.parse(xml, { keep: ALLOW, limit: 2 });
    expect(limited.parsed).toBe(2);
    expect(limited.rows).toHaveLength(2);
    await expect(abr.parse(xml, {})).rejects.toThrow(/allow-set/);
  });
  it("business-gov-grants: GrantConnect export columns, ABN normalised, no-ABN and bad-checksum rows skipped, exact duplicate hashes equal", async () => {
    const res = await grants.parse(readFileSync(FIX("grants-sample.csv")));
    expect(res.parsed).toBe(5);
    expect(res.skipped).toEqual({ no_abn: 2 });
    expect(res.rows).toHaveLength(3);
    const [a, b, dup] = res.rows;
    expect(a).toMatchObject({ source_id: "business-gov-grants", signal_type: "grant_award", entity_abn: "95608464535", as_of: "2025-03-15", entity_name: "HARBOUR ANALYTICS PTY LTD" });
    expect(a.value).toMatchObject({ ga_id: "GA100001", agency: "Department of Industry Science and Resources", program: "Accelerating Commercialisation", amount_aud: 486500, approval_date: "2025-03-15", publish_date: "2025-03-20", state: "NSW", postcode: "2000" });
    expect(b.value).toMatchObject({ program: "Industry Growth Program", amount_aud: 2000000, approval_date: "2024-09-02" });
    expect(dup.content_hash).toBe(a.content_hash);
    expect(dedupeRows(res.rows).fresh).toHaveLength(2);
    expect((await grants.parse(readFileSync(FIX("grants-sample.csv")), { limit: 2 })).parsed).toBe(2);
  });
  it("funding-announcements (G24-B): curated columns by alias, ABN checksum required, no amount / no https link / non-AUD / no ABN skipped, funding_round rows with the sheet's own fields, duplicate hashes equal", async () => {
    const res = await funding.parse(readFileSync(FIX("funding-sample.csv")));
    expect(res.parsed).toBe(7);
    expect(res.skipped).toEqual({ no_abn: 1, no_amount: 1, no_source: 1, not_aud: 1 });
    expect(res.rows).toHaveLength(3);
    const [a, b, dup] = res.rows;
    expect(a).toMatchObject({ source_id: "funding-announcements", signal_type: "funding_round", entity_abn: "95608464535", entity_name: "HARBOUR ANALYTICS PTY LTD", as_of: "2025-06-12", match_confidence: "high", source_url: "https://example.com/press/harbour-analytics-seed" });
    expect(a.value).toMatchObject({ round: "Seed", amount_aud: 1500000, currency: "AUD", announced_at: "2025-06-12", investors: "Blackbird Ventures, Aussie Angels", announced_by: "Company press release", state: "NSW", sector: "Maritime software", source_url: "https://example.com/press/harbour-analytics-seed" });
    expect(b).toMatchObject({ entity_abn: "53666147271", as_of: "2026-02-04" });
    expect(b.value).toMatchObject({ round: "Series A", amount_aud: 8000000, investors: "Main Sequence, CSIRO Innovation Fund" });
    expect(dup.content_hash).toBe(a.content_hash);
    expect(dedupeRows(res.rows).fresh).toHaveLength(2);
    expect((await funding.parse(readFileSync(FIX("funding-sample.csv")), { limit: 2 })).parsed).toBe(2);
    expect(funding.parseRow({ ABN: "95 608 464 535", Announced: "2025-01-01", Amount: "100000", "Source URL": "http://insecure.example" })).toEqual({ skip: "no_source" });
    expect(funding.parseRow({ ABN: "12345678901", Announced: "2025-01-01", Amount: "100000", "Source URL": "https://x.example" })).toEqual({ skip: "no_abn" });
    expect(funding.parseRow({ ABN: "95 608 464 535", Amount: "100000", "Source URL": "https://x.example" })).toEqual({ skip: "no_date" });
  });

  it("rdti-transparency: ATO columns, income year → 30 June, ACN-only rows kept as low confidence, no-id rows skipped, register figures verbatim", async () => {
    const res = await rdti.parse(readFileSync(FIX("rdti-sample.csv")));
    expect(res.parsed).toBe(5);
    expect(res.skipped).toEqual({ no_id: 1 });
    expect(res.rows).toHaveLength(4);
    expect(res.rows[0]).toMatchObject({ source_id: "rdti-transparency", signal_type: "rdti_registration", entity_abn: "95608464535", as_of: "2023-06-30", match_confidence: "high" });
    expect(res.rows[0].value).toEqual({ company_name: "HARBOUR ANALYTICS PTY LTD", abn_or_acn: "95608464535", rd_expenditure_aud: 449266, amended_rd_expenditure_aud: null, income_year: "2022-23" });
    expect(res.rows[2].value).toMatchObject({ rd_expenditure_aud: 1074917, amended_rd_expenditure_aud: 1100000 });
    expect(res.rows[3]).toMatchObject({ entity_abn: null, entity_acn: "123456789", match_confidence: "low" });
  });
});

describe("allow-set", () => {
  it("filterByAllowSet keeps only allow-listed ABNs; parseAbnFile ignores comments and reports invalid checksums", () => {
    const rows = [{ entity_abn: "95608464535" }, { entity_abn: "51824753556" }, { entity_abn: null }];
    const { kept, dropped } = filterByAllowSet(rows, new Set(["95608464535"]));
    expect(kept).toHaveLength(1);
    expect(dropped).toBe(2);
    const parsed = parseAbnFile("# header\n95 608 464 535\n\n12345678901\n53666147271 # trailing\n");
    expect([...parsed.abns]).toEqual(["95608464535", "53666147271"]);
    expect(parsed.invalid).toEqual(["12345678901"]);
  });
  it("buildAllowSet unions projects.abn, grant profiles, register ABNs and the file; a missing table is tolerated", async () => {
    const tables = {
      projects: [{ abn: "95608464535" }, { abn: "12345678901" }],
      project_grant_profiles: null, // 42P01
      external_signals: [{ entity_abn: "53666147271" }, { entity_abn: "95608464535" }],
    };
    const db = fakeDb(tables);
    const logs = [];
    const { allow, provenance } = await buildAllowSet(db, { abnFileText: "87644546770\n", log: (s) => logs.push(s) });
    expect([...allow].sort()).toEqual(["53666147271", "87644546770", "95608464535"]);
    expect(provenance).toEqual({ projects: 1, grant_profiles: 0, register: 1, abn_file: 1, invalid_in_file: 0 });
    expect(logs.join("\n")).toMatch(/grant_profiles unavailable/);
  });
});

/** Minimal PostgREST-ish fake: from(table).select().eq().not().range() → rows; null table → 42P01. */
function fakeDb(tables, writes = []) {
  return {
    from(table) {
      const rows = tables[table];
      const chain = {
        select() { return chain; },
        eq(col, v) { chain._eq = [col, v]; return chain; },
        not() { return chain; },
        range(from, to) {
          if (rows === null || rows === undefined) return Promise.resolve({ data: null, error: { code: "42P01", message: `relation "${table}" does not exist` } });
          const filtered = chain._eq ? rows.filter((r) => r[chain._eq[0]] === chain._eq[1]) : rows;
          return Promise.resolve({ data: filtered.slice(from, to + 1), error: null });
        },
        upsert(batch) { writes.push(...batch); return { select: () => Promise.resolve({ data: batch.map((b) => ({ id: b.content_hash })), error: null }) }; },
        update(payload) { writes.push({ table, update: payload }); return { eq: () => Promise.resolve({ error: null }) }; },
        then(res) { return chain.range(0, 999).then(res); },
      };
      return chain;
    },
  };
}

describe("CLI main()", () => {
  const quiet = () => {
    const out = [];
    const err = [];
    return { out, err, stdout: (s) => out.push(s), stderr: (s) => err.push(s) };
  };

  it("--dry on the grants fixture (no db): licence gate from the seed catalogue, 2 would-insert, 1 duplicate, exit 0, nothing written", async () => {
    const io = quiet();
    const code = await main(["--dry", "--source", "business-gov-grants", "--file", FIX("grants-sample.csv"), "--limit", "5", "--json"], { db: null, env: {}, ...io });
    expect(code).toBe(EXIT_OK);
    const summary = JSON.parse(io.out.join("\n"));
    expect(summary).toMatchObject({ ok: true, dry: true, db: false, allow_set_size: 0, limit: 5 });
    expect(summary.sources).toHaveLength(1);
    expect(summary.sources[0]).toMatchObject({ id: "business-gov-grants", status: "ok", licence: "CC BY 3.0 AU", parsed: 5, kept: 3, filtered_out: 2, duplicates: 1, inserted: 2 });
    expect(summary.sources[0].sample[0]).toMatchObject({ entity_abn: "95608464535", signal_type: "grant_award" });
  });

  it("--dry on the funding fixture (no db, G24-B): licence gate from the seed catalogue, 2 would-insert, 1 duplicate, funding_round sample, exit 0", async () => {
    const io = quiet();
    const code = await main(["--dry", "--source", "funding-announcements", "--file", FIX("funding-sample.csv"), "--json"], { db: null, env: {}, ...io });
    expect(code).toBe(EXIT_OK);
    const summary = JSON.parse(io.out.join("\n"));
    expect(summary.sources).toHaveLength(1);
    expect(summary.sources[0]).toMatchObject({ id: "funding-announcements", status: "ok", licence: "CC BY 4.0", parsed: 7, kept: 3, duplicates: 1, inserted: 2 });
    expect(summary.sources[0].sample[0]).toMatchObject({ entity_abn: "95608464535", signal_type: "funding_round" });
  });

  it("refuses a cite_only / unknown / disabled source before parsing (exit 3 when every requested source is refused)", async () => {
    const rows = seedRows();
    rows.get("rdti-transparency").status = "disabled";
    rows.delete("business-gov-grants");
    rows.set("abr-bulk", { ...rows.get("abr-bulk"), licence: "All rights reserved (cite only)", status: "cite_only" });
    rows.get("funding-announcements").licence = "   ";
    const io = quiet();
    const code = await main(["--dry", "--json", "--abn-file", FIX("../fixtures/abr-sample.xml")], { db: null, env: {}, loadSourceRows: async () => ({ rows, fromDb: false }), ...io });
    expect(code).toBe(EXIT_REFUSED);
    const summary = JSON.parse(io.out.join("\n"));
    expect(summary.totals.refused).toBe(4);
    expect(summary.sources.map((s) => [s.id, s.status])).toEqual([["abr-bulk", "refused"], ["business-gov-grants", "refused"], ["rdti-transparency", "refused"], ["funding-announcements", "refused"]]);
    expect(summary.sources[0].error).toMatch(/cite_only/);
    expect(summary.sources[1].error).toMatch(/unknown source/);
    expect(summary.sources[2].error).toMatch(/disabled/);
    expect(summary.sources[3].error).toMatch(/no licence/);
    for (const s of summary.sources) expect(s.parsed).toBe(0);
  });

  it("runSource refuses a licence mismatch between the adapter and the external_sources row, and abr-bulk without an allow-set", async () => {
    const rows = seedRows();
    rows.get("rdti-transparency").licence = "CC BY 4.0";
    const ctx = { db: null, dry: true, limit: null, allow: new Set(), sourceRows: rows, dataDir: "/nonexistent", explicitFile: FIX("rdti-sample.csv"), fetch: false, log: () => {}, now: () => "2026-09-17T00:00:00Z" };
    const r = await runSource("rdti-transparency", ctx);
    expect(r.status).toBe("refused");
    expect(r.error).toMatch(/licence mismatch/);
    const a = await runSource("abr-bulk", { ...ctx, explicitFile: FIX("abr-sample.xml") });
    expect(a.status).toBe("refused");
    expect(a.error).toMatch(/allow-set/);
  });

  it("abr-bulk --dry with --abn-file keeps only allow-listed ABNs; a missing input file is a skip, not an error", async () => {
    const io = quiet();
    const abnFile = join(HERE, "fixtures", "..", "..", "..", "..", "..", "tmp-abns.txt");
    const code = await main(["--dry", "--json", "--source", "abr-bulk", "--file", FIX("abr-sample.xml"), "--abn-file", FIX("abn-allow-sample.txt")], { db: null, env: {}, ...io });
    expect(code).toBe(EXIT_OK);
    const summary = JSON.parse(io.out.join("\n"));
    expect(summary.allow_set).toMatchObject({ abn_file: 2, invalid_in_file: 1 });
    expect(summary.sources[0]).toMatchObject({ status: "ok", parsed: 5, kept: 2, filtered_out: 3, inserted: 2 });
    void abnFile;
    const io2 = quiet();
    const code2 = await main(["--dry", "--json", "--source", "rdti-transparency", "--data-dir", "/nonexistent"], { db: null, env: {}, ...io2 });
    expect(code2).toBe(EXIT_OK);
    expect(JSON.parse(io2.out.join("\n")).sources[0]).toMatchObject({ status: "skipped" });
  });

  it("write run with a fake db: inserts fresh rows only, touches external_sources, writes the summary + history into the given root", async () => {
    const { mkdtempSync, existsSync, readFileSync: rf } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const root = mkdtempSync(join(tmpdir(), "ext-signals-"));
    const known = await rdti.parse(readFileSync(FIX("rdti-sample.csv")));
    const writes = [];
    const db = fakeDb({
      external_sources: SEED_SOURCES.map((s) => ({ ...s, name: s.id, url: "" })),
      external_signals: [{ content_hash: known.rows[0].content_hash, entity_abn: "95608464535", source_id: "rdti-transparency" }],
      projects: [],
      project_grant_profiles: [],
    }, writes);
    const io = quiet();
    const code = await main(["--source", "rdti-transparency", "--file", FIX("rdti-sample.csv"), "--json"], { db, env: {}, root, now: () => "2026-09-17T03:00:00.000Z", ...io });
    expect(code).toBe(EXIT_OK);
    const summary = JSON.parse(io.out.join("\n"));
    expect(summary).toMatchObject({ dry: false, db: true, ran_at: "2026-09-17T03:00:00.000Z" });
    expect(summary.sources[0]).toMatchObject({ status: "ok", parsed: 5, kept: 4, duplicates: 1, inserted: 3 });
    const inserted = writes.filter((w) => w.signal_type);
    expect(inserted).toHaveLength(3);
    expect(inserted.every((w) => w.content_hash !== known.rows[0].content_hash)).toBe(true);
    expect(writes.find((w) => w.table === "external_sources").update).toMatchObject({ last_fetched_at: "2026-09-17T03:00:00.000Z" });
    expect(existsSync(join(root, "content/reports/external-signals-latest.json"))).toBe(true);
    expect(JSON.parse(rf(join(root, "content/reports/external-signals-latest.json"), "utf8")).totals.inserted).toBe(3);
    expect(rf(join(root, "content/reports/external-signals-history.jsonl"), "utf8").trim().split("\n")).toHaveLength(1);
  });

  it("usage errors exit 2; a missing external_sources table exits 1 with the apply hint", async () => {
    const io = quiet();
    expect(await main(["--limit", "x"], { db: null, env: {}, ...io })).toBe(EXIT_USAGE);
    const io2 = quiet();
    const db = fakeDb({ external_sources: null });
    expect(await main(["--dry"], { db, env: {}, ...io2 })).toBe(EXIT_ERROR);
    expect(io2.err.join("\n")).toMatch(/0410_external_signals/);
  });
});
