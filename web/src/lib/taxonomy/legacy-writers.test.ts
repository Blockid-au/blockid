// G13-W4-D2 E1.5 — legacy writers through the crosswalk. Pins the pure
// helpers the rerouted writers use and the writers' observable behaviour:
//   * canonicalSectorSlug: canonical slugs byte-identical, free text →
//     canonical slug, unknown → null (never a guess);
//   * legacySectorSlugFor / isTaxonomyHumanOwned (T7 override rule);
//   * legacySectorLabel: SECTOR_LABEL keys keep their label, other slugs get
//     the canonical industry label, unknown / default → "Unclassified";
//   * sector-map: industryToSector now derives from the taxonomy (every
//     canonical industry lands in the §B.2 bucket) and taxonomyToBenchmarkSector;
//   * svi-index-populator: extractSnapshotFromAnalysis canonicalises
//     analysis.sector; readHumanOwnedSectorOverrides only returns human-
//     owned rows; populateBatch writes the override for a confirmed project.

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const state = { taxonomy: [] as Row[], analyses: [] as Row[], inserted: [] as Row[], accounts: new Map<string, string>() };

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      let inFilter: string[] | null = null;
      let insertPayload: Row | null = null;
      const q: Record<string, unknown> = {
        select: () => q,
        eq: () => q,
        in: (_k: string, v: string[]) => { inFilter = v; return q; },
        or: () => q,
        order: () => q,
        limit: () => q,
        insert: (p: Row) => { insertPayload = p; return q; },
        maybeSingle: async () => ({ data: null, error: null }),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
          let out: { data: unknown; error: unknown } = { data: [], error: null };
          if (table === "startup_taxonomy") out = { data: state.taxonomy.filter((r) => !inFilter || inFilter.includes(String(r.project_id))), error: null };
          else if (table === "svi_analyses") out = { data: state.analyses, error: null };
          else if (table === "svi_index_snapshots" && insertPayload) { state.inserted.push(insertPayload); out = { data: null, error: null }; }
          return Promise.resolve(out).then(res, rej);
        },
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/projects", () => ({ findOrCreateSVIAccount: async (email: string) => state.accounts.get(email) ?? `acct-${email}` }));

import { INDUSTRIES, INDUSTRY_TO_BENCHMARK_SECTOR, canonicalSectorSlug, isTaxonomyHumanOwned, legacySectorLabel, legacySectorSlugFor } from "./startup-taxonomy";
import { industryToSector, taxonomyToBenchmarkSector } from "@/lib/svi/sector-map";
import { extractSnapshotFromAnalysis, populateBatch, readHumanOwnedSectorOverrides } from "@/lib/svi-index-populator";

beforeEach(() => {
  state.taxonomy = [];
  state.analyses = [];
  state.inserted = [];
  state.accounts = new Map();
});

describe("canonicalSectorSlug", () => {
  it("keeps canonical slugs byte-identical (detectSector vocabulary + listing keys)", () => {
    for (const s of ["saas", "fintech", "ai", "healthtech", "marketplace", "deeptech", "ecommerce", "edtech", "cleantech", "spacetech", "default"]) expect(canonicalSectorSlug(s)).toBe(s);
    expect(canonicalSectorSlug("  Fintech ")).toBe("fintech");
  });
  it("free text lands as the canonical slug; unknown text → null (never a guess)", () => {
    expect(canonicalSectorSlug("B2B SaaS platform")).toBe("saas");
    expect(canonicalSectorSlug("Climate tech / hardware")).toBe("cleantech");
    expect(canonicalSectorSlug("healthtech_medtech")).toBe("healthtech");
    expect(canonicalSectorSlug("purely generic descriptive words")).toBeNull();
    expect(canonicalSectorSlug("")).toBeNull();
    expect(canonicalSectorSlug(null)).toBeNull();
  });
});

describe("legacySectorSlugFor / isTaxonomyHumanOwned", () => {
  it("marketplace model wins, unclassified → null, sub_industry preferred", () => {
    expect(legacySectorSlugFor({ industry: "fintech", business_model: "marketplace_platform" })).toBe("marketplace");
    expect(legacySectorSlugFor({ industry: "unclassified", business_model: "saas_subscription" })).toBeNull();
    expect(legacySectorSlugFor({ industry: "fintech", business_model: "transactional_fintech", sub_industry: "insurtech" })).toBe("insurtech");
    expect(legacySectorSlugFor({ industry: "healthtech_medtech", business_model: "unclassified" })).toBe("healthtech");
    expect(legacySectorSlugFor({ industry: "professional_services", business_model: "unclassified" })).toBeNull();
  });
  it("human-owned = confirmed or founder/evaluator industry source", () => {
    expect(isTaxonomyHumanOwned({ sources: {}, confirmed_at: null })).toBe(false);
    expect(isTaxonomyHumanOwned({ sources: { industry: "auto" }, confirmed_at: null })).toBe(false);
    expect(isTaxonomyHumanOwned({ sources: { industry: "founder" }, confirmed_at: null })).toBe(true);
    expect(isTaxonomyHumanOwned({ sources: { industry: "evaluator" }, confirmed_at: null })).toBe(true);
    expect(isTaxonomyHumanOwned({ sources: {}, confirmed_at: "2026-09-16T00:00:00Z" })).toBe(true);
    expect(isTaxonomyHumanOwned(null)).toBe(false);
  });
});

describe("legacySectorLabel", () => {
  const LEGACY = { saas: "SaaS", ai: "AI / ML", default: "Unclassified" };
  it("legacy keys keep their label; other slugs get the canonical label; unknown / default → Unclassified", () => {
    expect(legacySectorLabel("saas", LEGACY)).toBe("SaaS");
    expect(legacySectorLabel("quantum", LEGACY)).toBe("Deeptech / quantum");
    expect(legacySectorLabel("edtech", LEGACY)).toBe("Edtech");
    expect(legacySectorLabel("default", LEGACY)).toBe("Unclassified");
    expect(legacySectorLabel("zzz", LEGACY)).toBe("Unclassified");
    expect(legacySectorLabel(null, LEGACY)).toBe("Unclassified");
    expect(legacySectorLabel("edtech", LEGACY, "vi")).toBe("Công nghệ giáo dục");
  });
});

describe("sector-map derives from the taxonomy", () => {
  it("every canonical industry lands in its §B.2 benchmark bucket", () => {
    for (const i of INDUSTRIES) {
      if (i === "unclassified") continue;
      const expected = INDUSTRY_TO_BENCHMARK_SECTOR[i];
      if (expected === "default") continue; // no industry signal → legacy regexes decide
      expect(industryToSector(i), i).toBe(expected);
    }
  });
  it("free text: marketplace (business model) first, then the crosswalk, then the legacy regexes for hardware / consumer", () => {
    expect(industryToSector("two-sided marketplace for tradies")).toBe("marketplace");
    expect(industryToSector("B2B SaaS platform")).toBe("saas");
    expect(industryToSector("Fintech — lending")).toBe("fintech");
    expect(industryToSector("Climate tech / hardware")).toBe("climatetech");
    expect(industryToSector("IoT sensors and robotics")).toBe("hardware");
    expect(industryToSector("D2C consumer social app")).toBe("consumer");
    expect(industryToSector("")).toBe("default");
    expect(industryToSector("underwater basket weaving")).toBe("default");
  });
  it("taxonomyToBenchmarkSector", () => {
    expect(taxonomyToBenchmarkSector({ industry: "fintech", business_model: "marketplace_platform" })).toBe("marketplace");
    expect(taxonomyToBenchmarkSector({ industry: "climate_cleantech", business_model: "hardware_devices" })).toBe("climatetech");
    expect(taxonomyToBenchmarkSector({ industry: "unclassified", business_model: "unclassified" })).toBe("default");
    expect(taxonomyToBenchmarkSector(null)).toBe("default");
  });
});

describe("svi-index-populator through the crosswalk", () => {
  it("extractSnapshotFromAnalysis canonicalises analysis.sector and keeps canonical slugs byte-identical", () => {
    expect(extractSnapshotFromAnalysis({ sector: "saas" }, null).sector).toBe("saas");
    expect(extractSnapshotFromAnalysis({ sector: "B2B SaaS platform" }, null).sector).toBe("saas");
    expect(extractSnapshotFromAnalysis({ sector: "purely generic words", inputSummary: { snippet: "fintech neobank" } }, null).sector).toBe("fintech");
  });

  it("readHumanOwnedSectorOverrides returns only human-owned rows, crosswalked", async () => {
    state.taxonomy = [
      { project_id: "p-auto", industry: "fintech", business_model: "unclassified", sub_industry: null, sources: { industry: "auto" }, confirmed_at: null },
      { project_id: "p-founder", industry: "healthtech_medtech", business_model: "unclassified", sub_industry: null, sources: { industry: "founder" }, confirmed_at: "2026-09-16T00:00:00Z" },
      { project_id: "p-market", industry: "unclassified", business_model: "marketplace_platform", sub_industry: null, sources: {}, confirmed_at: "2026-09-16T00:00:00Z" },
      { project_id: "p-none", industry: "unclassified", business_model: "unclassified", sub_industry: null, sources: {}, confirmed_at: "2026-09-16T00:00:00Z" },
    ];
    const m = await readHumanOwnedSectorOverrides(["p-auto", "p-founder", "p-market", "p-none", ""]);
    expect([...m.entries()]).toEqual([
      ["p-founder", "healthtech"],
      ["p-market", "marketplace"],
      ["p-none", null],
    ]);
    expect(await readHumanOwnedSectorOverrides([])).toEqual(new Map());
  });

  it("populateBatch (T7): a confirmed taxonomy's crosswalk value wins over the detected sector; auto rows keep the detected one", async () => {
    state.taxonomy = [{ project_id: "p-1", industry: "healthtech_medtech", business_model: "unclassified", sub_industry: null, sources: { industry: "founder" }, confirmed_at: "2026-09-16T00:00:00Z" }];
    state.analyses = [
      { id: "an_1", email: "a@x", project_id: "p-1", created_at: "2026-09-10T00:00:00Z", analysis_json: { totalSVI: 60, sector: "saas" }, total_svi: 60 },
      { id: "an_2", email: "b@x", project_id: "p-2", created_at: "2026-09-11T00:00:00Z", analysis_json: { totalSVI: 50, sector: "B2B SaaS platform" }, total_svi: 50 },
      { id: "an_3", email: "c@x", project_id: null, created_at: "2026-09-12T00:00:00Z", analysis_json: { totalSVI: 40 }, total_svi: 40 },
    ];
    const res = await populateBatch(null, 10);
    expect(res).toEqual({ scanned: 3, inserted: 3, lastId: "an_3" });
    expect(state.inserted.map((r) => r.sector)).toEqual(["healthtech", "saas", null]);
  });
});
