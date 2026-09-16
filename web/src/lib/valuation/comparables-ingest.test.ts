// comparables-ingest (S-R5) — allow-listed sources, regex extraction,
// (name_key, round_date) dedupe, pending-only writes. Fixtures under
// web/test-fixtures/comparables/ are synthetic pages in the shape of the
// three sources; no network is ever touched (fetch is injected).

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { FetchTextResult } from "@/lib/funding/fetch-source";
import {
  ALLOWED_HOSTS,
  INGEST_SOURCES,
  candidateToRow,
  dedupeCandidates,
  dedupeKey,
  extractCandidate,
  guessSector,
  hostAllowed,
  nameKey,
  parseAmount,
  parseName,
  parseStage,
  roundupDate,
  roundupLinks,
  runComparablesIngest,
  type ComparableCandidate,
  type IngestDb,
} from "./comparables-ingest";

const FIX = path.join(process.cwd(), "test-fixtures", "comparables");
const fx = (name: string) => readFileSync(path.join(FIX, name), "utf8");
const SD = INGEST_SOURCES.find((s) => s.id === "startup-daily")!;

function ok(text: string, finalUrl?: string): FetchTextResult {
  return { ok: true, status: 200, text, blocked: false, truncated: false, attempts: 1, finalUrl };
}
function fail(status = 503): FetchTextResult {
  return { ok: false, status, text: "", blocked: false, truncated: false, attempts: 1, error: `http ${status}` };
}

/** fetch stub keyed by URL; records every URL asked for. */
function fetchStub(pages: Record<string, FetchTextResult>, asked: string[] = []) {
  return async (url: string) => {
    asked.push(url);
    return pages[url] ?? fail(404);
  };
}

const PAGES: Record<string, FetchTextResult> = {
  "https://www.startupdaily.net/topic/funding/feed/": ok(fx("startup-daily-funding.rss.xml")),
  "https://www.cutthrough.com/insights": ok(fx("ctv-insights-index.html"), "https://www.cutthrough.com/insights"),
  "https://www.cutthrough.com/insights/ctv-sep-26": ok(fx("ctv-sep-26.html")),
  "https://www.cutthrough.com/insights/ctv-aug-26": ok("<html><body><p>Quiet month.</p></body></html>"),
  "https://www.asx.com.au/asx/v2/statistics/todayAnns.do": ok(fx("asx-today.html")),
};

/** In-memory table with the two query shapes the runner uses. */
function makeDb(existing: Array<{ name_key: string; round_date: string }> = [], opts: { selectError?: string; upsertError?: string } = {}) {
  const inserted: Record<string, unknown>[] = [];
  const db: IngestDb = {
    from: () => ({
      select: () => ({ gte: () => ({ limit: async () => (opts.selectError ? { data: null, error: { message: opts.selectError } } : { data: existing, error: null }) }) }),
      upsert: async (rows) => {
        if (opts.upsertError) return { error: { message: opts.upsertError } };
        inserted.push(...rows);
        return { error: null };
      },
    }),
  };
  return { db, inserted };
}

describe("allow-list", () => {
  it("every configured source is on an allow-listed https host; anything else is refused", () => {
    for (const s of INGEST_SOURCES) expect(hostAllowed(s.url)).toBe(true);
    expect(hostAllowed("https://evil.example.com/insights/ctv-sep-26")).toBe(false);
    expect(hostAllowed("http://www.startupdaily.net/topic/funding/feed/")).toBe(false);
    expect(hostAllowed("not a url")).toBe(false);
    expect(ALLOWED_HOSTS).toContain("www.asx.com.au");
  });
});

describe("regex extraction", () => {
  it("parseAmount: A$/US$/NZ$/$ with m / million / k / bn; USD + NZD converted", () => {
    expect(parseAmount("bags $1.02m to")).toEqual({ amountAud: 1_020_000, currency: "AUD", raw: "$1.02m" });
    expect(parseAmount("raised A$45 million in")).toMatchObject({ amountAud: 45_000_000, currency: "AUD" });
    expect(parseAmount("secured US$50 million")).toMatchObject({ amountAud: 75_000_000, currency: "USD" });
    expect(parseAmount("raised NZ$10 million")).toMatchObject({ amountAud: 9_200_000, currency: "NZD" });
    expect(parseAmount("a $1.2bn fund")).toMatchObject({ amountAud: 1_200_000_000 });
    expect(parseAmount("$750k pre-seed")).toMatchObject({ amountAud: 750_000 });
    expect(parseAmount("no money here")).toBeNull();
  });

  it("parseStage maps stage words onto AUStage; listed placements are growth", () => {
    expect(parseStage("$1.02 million pre-Seed")).toEqual({ stage: "pre-seed", label: "Pre-seed" });
    expect(parseStage("in Seed funding")).toEqual({ stage: "seed", label: "Seed" });
    expect(parseStage("Series B led by")).toEqual({ stage: "series-b", label: "Series B" });
    expect(parseStage("a Series A extension")).toEqual({ stage: "series-a", label: "Series A" });
    expect(parseStage("$40 million placement")).toMatchObject({ stage: "growth" });
    expect(parseStage("no stage word")).toBeNull();
  });

  it("parseName takes the words before the raise verb and drops descriptions", () => {
    expect(parseName("Evatto bags $1.02m to drag enterprise events")).toBe("Evatto");
    expect(parseName("Medow Health AI bags $3.5m for an AI front desk")).toBe("Medow Health AI");
    expect(parseName("Startmate alumni Evatto raises $1.02 million pre-Seed")).toBe("Evatto");
    expect(parseName("Sydney robotics startup Andromeda Robotics has raised US$10 million")).toBe("Andromeda Robotics");
    expect(parseName("Bookings marketplace First Table has raised NZ$10 million")).toBe("First Table");
    expect(parseName("Fintech Constantinople secured US$50 million")).toBe("Constantinople");
    expect(parseName("Blackbird-backed Acme raises $2m")).toBe("Acme");
    expect(parseName("Kiwi discount restaurant bookings platform chows down on $10 million")).toBeNull();
    expect(parseName("Doctors microdose AI receptionist with another $3.5 million")).toBeNull();
    expect(parseName("NSW government proposes a $150 million fund")).toBeNull();
    expect(parseName("CAPITAL raised $1.7bn across the month")).toBeNull();
    expect(parseName("ULUU raised $8m Series A")).toBe("ULUU");
  });

  it("guessSector keyword map, Unclassified when nothing matches", () => {
    expect(guessSector("AI front desk for specialist clinics")).toBe("HealthTech");
    expect(guessSector("climate software")).toBe("CleanTech");
    expect(guessSector("Fintech Constantinople secured")).toBe("FinTech");
    expect(guessSector("Weebit Nano completes placement")).toBe("Unclassified");
  });

  it("extractCandidate needs a name + an amount; stage / sector raise confidence; foreign currency is noted", () => {
    const c = extractCandidate({ headline: "AI startup raises $10 million", lede: "Andromeda has raised US$10 million in a Series A led by Blackbird.", url: "https://www.startupdaily.net/x", date: "Wed, 9 Sep 2026 01:00:00 +0000", source: SD })!;
    expect(c).toMatchObject({ name: "Andromeda", stage: "series-a", round_label: "Series A", amount_aud: 15_000_000, currency: "USD", round_date: "2026-09-09", source_name: "startup-daily", sector: "SaaS" });
    expect(c.confidence).toBe(0.9);
    expect(c.note).toMatch(/stated in USD/);
    expect(extractCandidate({ headline: "The state proposes a $150 million fund", url: "u", date: "", source: SD })).toBeNull();
    expect(extractCandidate({ headline: "Acme raises a round", url: "u", date: "", source: SD })).toBeNull();
  });
});

describe("roundup links", () => {
  it("newest ctv-<mon>-<yy> pages first, off-host links dropped, dated from the slug", () => {
    const links = roundupLinks(fx("ctv-insights-index.html"), "https://www.cutthrough.com/insights", 2);
    expect(links).toEqual(["https://www.cutthrough.com/insights/ctv-sep-26", "https://www.cutthrough.com/insights/ctv-aug-26"]);
    expect(roundupDate(links[0])).toBe("2026-09-01");
    expect(roundupDate("https://www.cutthrough.com/insights/other")).toBeNull();
  });
});

describe("dedupe", () => {
  const cand = (name: string, round_date: string): ComparableCandidate => ({
    name, sector: "SaaS", stage: "seed", round_date, round_label: "Seed", amount_aud: 1, currency: "AUD", source_name: "startup-daily", source_url: "u", source_date: round_date, source_excerpt: "", confidence: 0.8, note: null,
  });

  it("nameKey / dedupeKey match the table's generated column (lower, trim, collapse whitespace)", () => {
    expect(nameKey("  Canva  Pty ")).toBe("canva pty");
    expect(dedupeKey("Canva", "2026-01-01")).toBe("canva|2026-01-01");
  });

  it("drops batch duplicates and rows already stored (any status); a different date is a new row", () => {
    const { fresh, duplicates } = dedupeCandidates([cand("Evatto", "2026-09-16"), cand("evatto ", "2026-09-16"), cand("Evatto", "2026-03-01"), cand("Greener", "2026-09-01")], ["greener|2026-09-01"]);
    expect(fresh.map((c) => `${c.name}|${c.round_date}`)).toEqual(["Evatto|2026-09-16", "Evatto|2026-03-01"]);
    expect(duplicates).toBe(2);
  });

  it("candidateToRow writes status=pending and keeps the confidence in the note", () => {
    const row = candidateToRow({ ...cand("Acme", "2026-09-01"), note: "stage not stated" });
    expect(row).toMatchObject({ status: "pending", name: "Acme", round_date: "2026-09-01", note: "stage not stated; confidence 0.8" });
    expect(row).not.toHaveProperty("verified_by");
  });
});

describe("runComparablesIngest", () => {
  it("dry run (default) fetches all three sources, extracts, dedupes and inserts nothing", async () => {
    const asked: string[] = [];
    const { db, inserted } = makeDb([{ name_key: "elita", round_date: "2026-09-14" }]);
    const s = await runComparablesIngest({ write: false }, { fetch: fetchStub(PAGES, asked), db, roundupPages: 2, now: () => new Date("2026-09-16T10:00:00Z") });
    expect(s.ok).toBe(true);
    expect(s.dryRun).toBe(true);
    expect(s.sources.map((x) => [x.id, x.status, x.pages])).toEqual([["startup-daily", "ok", 1], ["cut-through-venture", "ok", 3], ["asx", "ok", 1]]);
    // RSS: Evatto, Medow Health AI, Elita, First Table (lede), Andromeda Robotics (lede), Evatto dupe → 6; NSW (no raise verb) skipped.
    // CTV Sep: Vow Foods, Greener, Constantinople, Vow Foods dupe (in-page dedupe) → 3. ASX: Weebit Nano, Nuix Limited → 2.
    expect(s.candidates).toBe(6 + 3 + 2);
    expect(s.duplicates).toBe(2); // Evatto batch dupe + Elita already stored
    expect(s.rows.map((r) => r.name)).toEqual(["Evatto", "Medow Health AI", "First Table", "Andromeda Robotics", "Vow Foods", "Greener", "Constantinople", "Weebit Nano", "Nuix Limited"]);
    expect(s.rows.find((r) => r.name === "Weebit Nano")).toMatchObject({ stage: "growth", source_name: "asx" });
    expect(s.rows.find((r) => r.name === "Vow Foods")).toMatchObject({ stage: "series-b", round_date: "2026-09-01", amount_aud: 45_000_000 });
    expect(inserted).toHaveLength(0);
    expect(asked).not.toContain("https://evil.example.com/insights/ctv-sep-26");
    expect(asked.every(hostAllowed)).toBe(true);
  });

  it("--write upserts pending rows with the (name_key, round_date) conflict target, capped by maxInsert", async () => {
    const { db, inserted } = makeDb();
    const s = await runComparablesIngest({ write: true }, { fetch: fetchStub(PAGES), db, only: ["startup-daily"], maxInsert: 3 });
    expect(s.ok).toBe(true);
    expect(s.inserted).toBe(3);
    expect(inserted).toHaveLength(3);
    expect(inserted.every((r) => r.status === "pending")).toBe(true);
    expect(s.sources.find((x) => x.id === "asx")?.status).toBe("skipped");
  });

  it("a failing source is reported, not thrown; db errors flip ok=false", async () => {
    const pages = { ...PAGES, "https://www.asx.com.au/asx/v2/statistics/todayAnns.do": fail(503) };
    const s = await runComparablesIngest({ write: false }, { fetch: fetchStub(pages), db: makeDb().db });
    expect(s.ok).toBe(true);
    expect(s.sources.find((x) => x.id === "asx")).toMatchObject({ status: "fetch_failed", error: "http 503" });

    const bad = await runComparablesIngest({ write: true }, { fetch: fetchStub(PAGES), db: makeDb([], { upsertError: "permission denied" }).db, only: ["asx"] });
    expect(bad).toMatchObject({ ok: false, error: "permission denied", inserted: 0 });

    const noDb = await runComparablesIngest({ write: true }, { fetch: fetchStub(PAGES), db: null, only: ["asx"] });
    expect(noDb).toMatchObject({ ok: false, error: "db_unavailable" });
  });
});
