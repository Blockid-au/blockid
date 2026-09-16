// CLI wrapper test for scripts/comparables/ingest-public-roundups.mjs
// (S-R5). The runner is injected — tsx is never loaded here and no network
// is touched; the extraction itself is covered by
// web/src/lib/valuation/comparables-ingest.test.ts.

import { describe, expect, it, vi } from "vitest";
import { EXIT_ERROR, EXIT_OK, EXIT_USAGE, SOURCE_IDS, USAGE, formatSummary, loadEnv, main, parseArgs } from "./ingest-public-roundups.mjs";

const SUMMARY = {
  ok: true,
  dryRun: true,
  ranAt: "2026-09-16T10:00:00.000Z",
  sources: [
    { id: "startup-daily", status: "ok", pages: 1, candidates: 2 },
    { id: "cut-through-venture", status: "fetch_failed", pages: 0, candidates: 0, error: "http 503" },
    { id: "asx", status: "skipped", pages: 0, candidates: 0 },
  ],
  candidates: 2,
  duplicates: 1,
  inserted: 0,
  rows: [{ round_date: "2026-09-16", name: "Evatto", stage: "pre-seed", amount_aud: 1_020_000, sector: "SaaS", source_name: "startup-daily", confidence: 0.9 }],
};

function io() {
  const out = [];
  const err = [];
  return { out, err, stdout: (s) => out.push(s), stderr: (s) => err.push(s) };
}

describe("parseArgs", () => {
  it("dry-run by default; --write, --json, --only, --max, --dotenv parsed", () => {
    expect(parseArgs([])).toMatchObject({ write: false, json: false, help: false, only: null, max: null, envFile: null });
    expect(parseArgs(["--write", "--json", "--only=asx", "--max=20", "--dotenv=/tmp/x.env"])).toMatchObject({ write: true, json: true, only: "asx", max: 20, envFile: "/tmp/x.env" });
  });

  it("rejects --write with --dry-run, unknown sources and a bad --max", () => {
    expect(() => parseArgs(["--write", "--dry-run"])).toThrow(/mutually exclusive/);
    expect(() => parseArgs(["--only=techcrunch"])).toThrow(/--only must be one of/);
    expect(() => parseArgs(["--max=0"])).toThrow(/--max/);
    expect(SOURCE_IDS).toEqual(["startup-daily", "cut-through-venture", "asx"]);
  });
});

describe("main", () => {
  it("--help prints usage and exits 0 without loading the runner", async () => {
    const t = io();
    const run = vi.fn();
    expect(await main(["--help"], { ...t, run, env: {} })).toBe(EXIT_OK);
    expect(t.out.join("\n")).toContain(USAGE);
    expect(run).not.toHaveBeenCalled();
  });

  it("usage errors exit 2 with the message + usage on stderr", async () => {
    const t = io();
    expect(await main(["--only=nope"], { ...t, run: vi.fn(), env: {} })).toBe(EXIT_USAGE);
    expect(t.err[0]).toMatch(/--only must be one of/);
    expect(t.err[0]).toContain("usage:");
  });

  it("dry-run calls the runner with write:false, only/max forwarded, and prints the table", async () => {
    const t = io();
    const run = vi.fn().mockResolvedValue(SUMMARY);
    const db = { from: () => ({}) };
    expect(await main(["--only=startup-daily", "--max=5"], { ...t, run, env: {}, db })).toBe(EXIT_OK);
    expect(run).toHaveBeenCalledWith({ write: false }, expect.objectContaining({ db, only: ["startup-daily"], maxInsert: 5 }));
    const text = t.out.join("\n");
    expect(text).toContain("DRY RUN");
    expect(text).toContain("cut-through-venture  fetch_failed  pages=0 candidates=0 (http 503)");
    expect(text).toContain("would insert=1");
    expect(text).toContain("2026-09-16  Evatto  pre-seed  A$1,020,000  [SaaS]  startup-daily  conf=0.9");
  });

  it("--write without a db is a usage error; with a db the runner gets write:true; --json prints JSON", async () => {
    const t = io();
    expect(await main(["--write"], { ...t, run: vi.fn(), env: {}, db: null })).toBe(EXIT_USAGE);
    expect(t.err[0]).toMatch(/SUPABASE_URL/);

    const t2 = io();
    const run = vi.fn().mockResolvedValue({ ...SUMMARY, dryRun: false, inserted: 1 });
    expect(await main(["--write", "--json"], { ...t2, run, env: {}, db: { from: () => ({}) } })).toBe(EXIT_OK);
    expect(run).toHaveBeenCalledWith({ write: true }, expect.anything());
    expect(JSON.parse(t2.out[0])).toMatchObject({ ok: true, inserted: 1 });
  });

  it("a failed summary exits 1; a loader failure exits 1", async () => {
    const t = io();
    expect(await main([], { ...t, run: vi.fn().mockResolvedValue({ ...SUMMARY, ok: false, error: "permission denied" }), env: {}, db: null })).toBe(EXIT_ERROR);
    expect(t.out.join("\n")).toContain("ERROR permission denied");

    const t2 = io();
    const loadRunner = vi.fn().mockRejectedValue(new Error("no tsx"));
    expect(await main([], { ...t2, loadRunner, env: {}, db: null })).toBe(EXIT_ERROR);
    expect(t2.err[0]).toBe("loader failed: no tsx");
  });
});

describe("helpers", () => {
  it("loadEnv merges a .env file under the process env; missing file → process env only", () => {
    expect(loadEnv("/nonexistent/.env", { A: "1" })).toEqual({ A: "1" });
  });

  it("formatSummary marks WRITE runs and inserted counts", () => {
    const text = formatSummary({ ...SUMMARY, dryRun: false, inserted: 1 });
    expect(text).toContain("WRITE");
    expect(text).toContain("inserted=1");
  });
});
