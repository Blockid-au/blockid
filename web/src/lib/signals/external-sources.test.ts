// Colocated tests for lib/signals/external-sources.ts (G14-S40): the code
// catalogue is the single source for the 0410 seed (parsed from the SQL),
// the ingest CLI's SEED_SOURCES (scripts/external-signals/ingest.mjs) and
// the licence gate; loadExternalSources falls back to the catalogue when
// the table is missing.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { SEED_SOURCES } from "../../../scripts/external-signals/ingest.mjs";
import { CITE_ONLY_SOURCE_IDS, EXTERNAL_SOURCE_CATALOG, INGESTABLE_SOURCE_IDS, catalogSource, licenceGate, loadExternalSources } from "./external-sources";

const MIGRATION = resolve(__dirname, "../../../supabase/migrations/0410_external_signals.sql");
/** G24-B: the funding-announcements row is seeded by 0435 (same block shape). */
const MIGRATION_0435 = resolve(__dirname, "../../../supabase/migrations/0435_ai_runs_prompt_version_nullable.sql");

/** Pull the (id, name, url, licence, attribution_text, cadence, status) tuples out of the seed INSERT. */
function seededRows(sql: string) {
  const block = sql.slice(sql.indexOf("insert into public.external_sources"), sql.indexOf("on conflict (id) do "));
  const tuples = [...block.matchAll(/\(\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)'\s*\)/g)];
  const un = (s: string) => s.replace(/''/g, "'");
  return tuples.map((m) => ({ id: un(m[1]), name: un(m[2]), url: un(m[3]), licence: un(m[4]), attribution_text: un(m[5]), cadence: un(m[6]), status: un(m[7]) }));
}

describe("EXTERNAL_SOURCE_CATALOG", () => {
  it("has exactly the 4 allow-listed sources (active: 3 registers + the G24-B funding feed) and the 3 cite-only reports, with real licences, URLs and attribution text", () => {
    expect(INGESTABLE_SOURCE_IDS).toEqual(["abr-bulk", "business-gov-grants", "rdti-transparency", "funding-announcements"]);
    expect(CITE_ONLY_SOURCE_IDS).toHaveLength(3);
    expect(EXTERNAL_SOURCE_CATALOG.map((s) => s.id)).toEqual([...INGESTABLE_SOURCE_IDS, ...CITE_ONLY_SOURCE_IDS]);
    for (const s of EXTERNAL_SOURCE_CATALOG) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.licence.length).toBeGreaterThan(5);
      expect(s.attribution_text.length).toBeGreaterThan(40);
      expect(s.attribution_text).toContain("©");
    }
    for (const id of INGESTABLE_SOURCE_IDS) expect(catalogSource(id)?.status).toBe("active");
    for (const id of INGESTABLE_SOURCE_IDS) expect(catalogSource(id)?.licence).toMatch(/^CC BY/);
    for (const id of CITE_ONLY_SOURCE_IDS) expect(catalogSource(id)?.status).toBe("cite_only");
    for (const id of CITE_ONLY_SOURCE_IDS) expect(catalogSource(id)?.attribution_text).toMatch(/Not redistributed/);
    expect(catalogSource("nope")).toBeNull();
  });

  it("migrations 0410 + 0435 seed exactly the catalogue rows (id / name / url / licence / attribution / cadence / status)", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const rows = [...seededRows(sql), ...seededRows(readFileSync(MIGRATION_0435, "utf8"))];
    expect(rows).toHaveLength(EXTERNAL_SOURCE_CATALOG.length);
    expect(rows.filter((r) => r.id === "funding-announcements")).toHaveLength(1);
    // Later migrations may re-point a citation URL (0412: ACS Digital Pulse
    // moved, link-check 2026-09-19) — apply those `update … set url` rows on
    // top of the 0410 seed before comparing.
    const overrides = new Map<string, string>();
    for (const file of ["0412_external_sources_acs_url.sql"]) {
      const m = readFileSync(resolve(__dirname, "../../../supabase/migrations", file), "utf8").match(/set url = '([^']+)'[\s\S]*?where id = '([^']+)'/);
      if (m) overrides.set(m[2], m[1]);
    }
    for (const c of EXTERNAL_SOURCE_CATALOG) {
      const r = rows.find((x) => x.id === c.id);
      expect(r, c.id).toBeDefined();
      const url = overrides.get(c.id) ?? r!.url;
      expect({ ...r, url }).toEqual({ id: c.id, name: c.name, url: c.url, licence: c.licence, attribution_text: c.attribution_text, cadence: c.cadence, status: c.status });
    }
    // The status CHECK and the cite_only marker live in the SQL too.
    expect(sql).toContain("check (status in ('active', 'cite_only', 'disabled'))");
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });

  it("the ingest CLI's SEED_SOURCES (no-db fallback) mirrors the catalogue ids, licences and statuses", () => {
    expect(SEED_SOURCES.map((s: { id: string }) => s.id)).toEqual(EXTERNAL_SOURCE_CATALOG.map((s) => s.id));
    for (const s of SEED_SOURCES as Array<{ id: string; licence: string; status: string }>) {
      const c = catalogSource(s.id)!;
      expect(s.licence, s.id).toBe(c.licence);
      expect(s.status, s.id).toBe(c.status);
    }
  });
});

describe("licenceGate", () => {
  it("active + licence → ok; cite_only / disabled / unknown / blank → refused with a reason", () => {
    expect(licenceGate(catalogSource("abr-bulk"))).toEqual({ ok: true });
    expect(licenceGate(catalogSource("cut-through-venture"))).toMatchObject({ ok: false, reason: expect.stringMatching(/cite_only/) });
    expect(licenceGate(null)).toMatchObject({ ok: false, reason: expect.stringMatching(/unknown source/) });
    expect(licenceGate({ ...catalogSource("abr-bulk")!, status: "disabled" })).toMatchObject({ ok: false, reason: expect.stringMatching(/disabled/) });
    expect(licenceGate({ ...catalogSource("abr-bulk")!, licence: "" })).toMatchObject({ ok: false, reason: expect.stringMatching(/no licence/) });
  });
});

describe("loadExternalSources", () => {
  const db = (result: { data?: unknown; error?: { code: string; message: string } }) => ({
    from: () => {
      const chain = { select: () => chain, order: () => chain, then: (res: (v: unknown) => unknown) => Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(res) };
      return chain;
    },
  });

  it("no db / missing table / empty table → the catalogue with fromDb=false and a reason; rows → fromDb=true in catalogue order", async () => {
    expect(await loadExternalSources(null)).toMatchObject({ fromDb: false, error: "no db" });
    const missing = await loadExternalSources(db({ error: { code: "42P01", message: "x" } }));
    expect(missing).toMatchObject({ fromDb: false, error: "table missing (apply 0410)" });
    expect(missing.rows).toHaveLength(7);
    expect(await loadExternalSources(db({ data: [] }))).toMatchObject({ fromDb: false, error: "table empty" });
    const live = await loadExternalSources(db({ data: [{ ...catalogSource("startup-muster"), row_count: 0 }, { ...catalogSource("abr-bulk"), row_count: 1200, last_fetched_at: "2026-09-13T03:00:00Z" }] }));
    expect(live.fromDb).toBe(true);
    expect(live.rows.map((r) => r.id)).toEqual(["abr-bulk", "startup-muster"]);
    expect(live.rows[0].row_count).toBe(1200);
  });
});
