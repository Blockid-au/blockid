// Colocated tests for lib/funding/investor-match (T0251): the four fit axes
// (sector / stage / geo / min_svi), discoverable-only, top-10 cap + ordering,
// the mailto "Request intro" (support inbox — nothing is sent to investors),
// and the Supabase store shape (column-missing → []).

import { describe, expect, it } from "vitest";
import {
  FIT_FLOOR,
  INVESTOR_MATCH_LIMIT,
  SUPPORT_EMAIL,
  createSupabaseInvestorStore,
  geoFits,
  geoFor,
  introHref,
  matchInvestorsForProject,
  rankInvestors,
  scoreInvestorFit,
  sectorFits,
  sectorTokensFor,
  stageBandFor,
  stageFits,
  type InvestorCandidate,
  type InvestorMatchProject,
  scoreMandateFit,
  rankAll,
  fitStartupForProject,
  FIT_FLOOR_V2,
  type MandateCandidate,
} from "./investor-match";

const PROJECT: InvestorMatchProject = { id: "p1", name: "Acme Agtech", industry: "AgTech / Food", stage: 2, state: "NSW", svi: 62 };

function investor(over: Partial<InvestorCandidate> & { prefs?: InvestorCandidate["prefs"] } = {}): InvestorCandidate {
  return {
    id: over.id ?? "inv-1",
    name: over.name ?? "Sydney Seed Fund",
    plan: over.plan ?? "investor_angel",
    discoverable: over.discoverable ?? true,
    prefs: over.prefs === undefined ? { sectors: ["agtech"], stages: ["seed"], geos: ["AU"], cheque_band: "100k_500k", min_svi: 50 } : over.prefs,
  };
}

describe("normalisers", () => {
  it("sectorTokensFor expands free text into synonyms; sectorFits matches either direction", () => {
    expect(sectorTokensFor("AgTech / Food")).toEqual(expect.arrayContaining(["agtechfood", "agtech", "food", "agrifood"]));
    expect(sectorFits("AgTech", ["agtech"])).toEqual({ fit: true, hit: "agtech" });
    expect(sectorFits("Healthcare SaaS", ["HealthTech"]).fit).toBe(true);
    expect(sectorFits("Fintech", ["climate"]).fit).toBe(false);
    expect(sectorFits("Fintech", [])).toEqual({ fit: true, hit: null }); // sector-agnostic
    expect(sectorFits("Fintech", ["any"]).fit).toBe(true);
    expect(sectorFits(null, ["fintech"]).fit).toBe(false);
  });

  it("stageBandFor maps numeric + intake stages; stageFits honours 'any'", () => {
    expect(stageBandFor(0)).toBe("pre_seed");
    expect(stageBandFor(2)).toBe("seed");
    expect(stageBandFor(4)).toBe("series_a");
    expect(stageBandFor(7)).toBe("series_b");
    expect(stageBandFor("idea")).toBe("pre_seed");
    expect(stageBandFor("early_revenue")).toBe("seed");
    expect(stageBandFor("scaling")).toBe("series_a");
    expect(stageBandFor(null)).toBeNull();
    expect(stageFits("seed", ["any"])).toBe(true);
    expect(stageFits("seed", [])).toBe(true);
    expect(stageFits("seed", ["series_a"])).toBe(false);
    expect(stageFits(null, ["seed"])).toBe(false);
  });

  it("geoFor folds AU states to AU; geoFits honours global", () => {
    expect(geoFor("NSW")).toBe("AU");
    expect(geoFor("national")).toBe("AU");
    expect(geoFor("nz")).toBe("NZ");
    expect(geoFor(null)).toBeNull();
    expect(geoFits("AU", ["AU", "NZ"])).toBe(true);
    expect(geoFits("AU", ["US"])).toBe(false);
    expect(geoFits(null, ["AU"])).toBe(false);
    expect(geoFits(null, ["global"])).toBe(true);
    expect(geoFits("AU", [])).toBe(true);
  });
});

describe("scoreInvestorFit", () => {
  it("full fit = 100 with one reason per axis and no gaps", () => {
    const m = scoreInvestorFit(PROJECT, investor())!;
    expect(m.score).toBe(100);
    expect(m.gaps).toEqual([]);
    expect(m.reasons).toEqual([
      "Your SVI 62 clears their 50 floor",
      "Invests in agtech",
      "Backs seed rounds",
      "Invests in AU",
    ]);
    expect(m.cheque_band).toBe("100k_500k");
    expect(m.min_svi).toBe(50);
  });

  it("min_svi is a hard gate — below the floor or no SVI → null", () => {
    expect(scoreInvestorFit({ ...PROJECT, svi: 40 }, investor())).toBeNull();
    expect(scoreInvestorFit({ ...PROJECT, svi: null }, investor())).toBeNull();
    // No floor set → passes with the "No SVI floor" reason.
    const m = scoreInvestorFit({ ...PROJECT, svi: null }, investor({ prefs: { sectors: [], stages: ["any"], geos: [], min_svi: null } }))!;
    expect(m.score).toBe(100);
    expect(m.reasons).toContain("No SVI floor");
  });

  it("sector / stage / geo misses drop their weight and are listed as gaps; below the floor → null", () => {
    const sector = scoreInvestorFit(PROJECT, investor({ prefs: { sectors: ["fintech"], stages: ["seed"], geos: ["AU"], min_svi: null } }))!;
    expect(sector.score).toBe(60);
    expect(sector.gaps).toEqual(["sector"]);

    const stage = scoreInvestorFit(PROJECT, investor({ prefs: { sectors: ["agtech"], stages: ["series_b"], geos: ["AU"], min_svi: null } }))!;
    expect(stage.score).toBe(70);
    expect(stage.gaps).toEqual(["stage"]);

    const geo = scoreInvestorFit(PROJECT, investor({ prefs: { sectors: ["agtech"], stages: ["seed"], geos: ["US"], min_svi: null } }))!;
    expect(geo.score).toBe(80);
    expect(geo.gaps).toEqual(["geo"]);

    // sector + stage + geo all miss → 10 < FIT_FLOOR
    expect(FIT_FLOOR).toBe(40);
    expect(scoreInvestorFit(PROJECT, investor({ prefs: { sectors: ["fintech"], stages: ["series_b"], geos: ["US"], min_svi: null } }))).toBeNull();
  });

  it("non-discoverable investors are never scored", () => {
    expect(scoreInvestorFit(PROJECT, investor({ discoverable: false }))).toBeNull();
  });

  it("Request intro is a support mailto with the D-3 subject — never the investor's address", () => {
    const m = scoreInvestorFit(PROJECT, investor())!;
    expect(SUPPORT_EMAIL).toBe("support@blockid.au");
    expect(m.intro_href).toBe(introHref("Acme Agtech", "Sydney Seed Fund"));
    expect(m.intro_href.startsWith("mailto:support@blockid.au?subject=")).toBe(true);
    expect(decodeURIComponent(m.intro_href.split("subject=")[1]!)).toBe("Intro request: Acme Agtech → Sydney Seed Fund");
    expect(JSON.stringify(m)).not.toMatch(/@(?!blockid\.au)/);
  });
});

describe("rankInvestors", () => {
  it("orders by score desc then name, drops non-discoverable + below-floor, caps at 10", () => {
    const cands: InvestorCandidate[] = [];
    for (let i = 0; i < 14; i++) {
      cands.push(investor({ id: `i${i}`, name: `Fund ${String(i).padStart(2, "0")}`, prefs: { sectors: [], stages: ["any"], geos: [], min_svi: null } }));
    }
    cands.push(investor({ id: "hidden", name: "Hidden", discoverable: false }));
    cands.push(investor({ id: "miss", name: "Miss", prefs: { sectors: ["fintech"], stages: ["series_b"], geos: ["US"], min_svi: null } }));
    cands.push(investor({ id: "partial", name: "AAA Partial", prefs: { sectors: ["fintech"], stages: ["any"], geos: [], min_svi: null } }));
    const out = rankInvestors(PROJECT, cands);
    expect(out.length).toBe(INVESTOR_MATCH_LIMIT);
    expect(out.map((m) => m.investor_id)).not.toContain("hidden");
    expect(out.map((m) => m.investor_id)).not.toContain("miss");
    // 14 full-fit (100) sorted by name fill the 10 slots; the 60-point partial is cut.
    expect(out.every((m) => m.score === 100)).toBe(true);
    expect(out[0]!.name).toBe("Fund 00");
    expect(rankInvestors(PROJECT, cands, 20).some((m) => m.investor_id === "partial")).toBe(true);
  });
});

describe("store + matchInvestorsForProject", () => {
  function fakeDb(rows: unknown[] | null, error: { message: string } | null = null) {
    const calls: Array<{ op: string; args: unknown[] }> = [];
    const chain: Record<string, unknown> = {};
    for (const op of ["select", "eq", "not", "limit"]) {
      chain[op] = (...args: unknown[]) => {
        calls.push({ op, args });
        return chain;
      };
    }
    chain.then = (r: (v: unknown) => unknown) => r({ data: rows, error });
    return { db: { from: (t: string) => { calls.push({ op: "from", args: [t] }); return chain; } }, calls };
  }

  it("reads only discoverable app_users rows with prefs, masks the name fallback, never selects email", async () => {
    const { db, calls } = fakeDb([
      { id: "a", display_name: "  ", plan: "investor_angel", investor_prefs: { sectors: [], stages: ["any"], geos: [], min_svi: null }, investor_discoverable: true },
    ]);
    const store = createSupabaseInvestorStore(db);
    const rows = await store.listDiscoverableInvestors();
    expect(rows).toEqual([{ id: "a", name: "Investor", plan: "investor_angel", prefs: { sectors: [], stages: ["any"], geos: [], min_svi: null }, discoverable: true }]);
    expect(calls.find((c) => c.op === "from")!.args).toEqual(["app_users"]);
    expect(String(calls.find((c) => c.op === "select")!.args[0])).not.toMatch(/email/);
    expect(calls.find((c) => c.op === "eq")!.args).toEqual(["investor_discoverable", true]);
  });

  it("column missing (pre-0323) → [] and the page shows the no-match copy, not a 500", async () => {
    const { db } = fakeDb(null, { message: "column app_users.investor_discoverable does not exist" });
    const out = await matchInvestorsForProject(PROJECT, { db });
    expect(out).toEqual([]);
  });

  it("matchInvestorsForProject ranks through an injected store", async () => {
    const out = await matchInvestorsForProject(PROJECT, {
      store: { listDiscoverableInvestors: async () => [investor(), investor({ id: "x", name: "Hidden", discoverable: false })] },
    });
    expect(out.map((m) => m.investor_id)).toEqual(["inv-1"]);
  });
});

describe("founder-facing card contract (T0251 follow-up)", () => {
  it("carries firm + thesis from investor_prefs, trimmed; null when absent", () => {
    const withCard = scoreInvestorFit(
      PROJECT,
      investor({ prefs: { sectors: ["agtech"], stages: ["seed"], geos: ["AU"], cheque_band: "100k_500k", min_svi: 50, firm: "  Sydney Angels ", thesis: " Pre-seed agtech in ANZ " } }),
    )!;
    expect(withCard.firm).toBe("Sydney Angels");
    expect(withCard.thesis).toBe("Pre-seed agtech in ANZ");

    const bare = scoreInvestorFit(PROJECT, investor())!;
    expect(bare.firm).toBeNull();
    expect(bare.thesis).toBeNull();

    const blank = scoreInvestorFit(PROJECT, investor({ prefs: { sectors: ["agtech"], firm: "   ", thesis: "" } }))!;
    expect(blank.firm).toBeNull();
    expect(blank.thesis).toBeNull();
  });

  it("an InvestorMatch never carries an email — even when the candidate row leaked one", () => {
    const leaky = { ...investor(), email: "ann@example.com", prefs: { sectors: ["agtech"], email: "ann@example.com" } } as unknown as InvestorCandidate;
    const m = scoreInvestorFit(PROJECT, leaky)!;
    expect(m).not.toHaveProperty("email");
    expect(JSON.stringify(m)).not.toContain("ann@example.com");
    // The intro goes to support, never to the investor.
    expect(m.intro_href.startsWith(`mailto:${SUPPORT_EMAIL}?`)).toBe(true);
    expect(m.intro_href).not.toContain("ann%40example.com");
  });

  it("only these keys are exposed on the founder card", () => {
    const m = scoreInvestorFit(PROJECT, investor())!;
    expect(Object.keys(m).sort()).toEqual(
      ["cheque_band", "firm", "gaps", "geos", "intro_href", "investor_id", "min_svi", "name", "plan", "reasons", "score", "sectors", "stages", "thesis", "source"].sort(),
    );
    expect(m.source).toBe("prefs");
  });
});

// ─── G13 S-T2 — the mandate direction (investor_mandates + FIT_WEIGHTS_V2) ───

describe("mandate direction (G13 S-T2)", () => {
  const MANDATE: MandateCandidate = {
    mandate: {
      id: "m-1", label: "Sydney Angels", thesis: "Pre-seed agtech in ANZ", discoverable: true,
      sectors_include: ["agtech_food"], sectors_exclude: [], business_models: [], customer_types: [], stages: ["seed"],
      cheque_min_aud: 50_000, cheque_max_aud: 250_000, lead_or_follow: "both", geographies: ["NSW"],
      revenue_min_aud: null, growth_min_pct: null, min_svi: 50, tags_include: [], tags_exclude: [], weights: null,
    },
    investor: { id: "inv-m", name: "Mandy Mandate", plan: "investor_angel", discoverable: true },
  };

  it("scores a discoverable mandate with fit-v2 (legacy fields crosswalked), never exposing an email, with source=mandate + mandate_id", () => {
    const m = scoreMandateFit(PROJECT, MANDATE)!;
    expect(m).toMatchObject({ investor_id: "inv-m", name: "Mandy Mandate", firm: "Sydney Angels", thesis: "Pre-seed agtech in ANZ", source: "mandate", mandate_id: "m-1", cheque_band: "100k_500k", min_svi: 50, sectors: ["agtech_food"], stages: ["seed"], geos: ["NSW"] });
    expect(m.score).toBeGreaterThanOrEqual(FIT_FLOOR_V2);
    expect(m.reasons).toContain("Invests in agtech food");
    expect(m.reasons.join(" ")).toContain("clears their 50 floor");
    expect(JSON.stringify(m).replace("support@blockid.au", "")).not.toMatch(/@/); // only the support mailto, never an investor email
    expect(Object.keys(m).sort()).toEqual(
      ["cheque_band", "firm", "gaps", "geos", "intro_href", "investor_id", "min_svi", "name", "plan", "reasons", "score", "sectors", "stages", "thesis", "source", "mandate_id"].sort(),
    );
  });

  it("uses the startup_taxonomy row when the project carries one", () => {
    const taxo = { ...PROJECT, industry: null, taxonomy: { industry: "agtech_food", industry_secondary: null, business_model: "hardware_devices", customer_types: ["b2b"], stage_key: "seed", hq_state: "NSW", hq_country: "AU", geo_scope: "national", tags: [] } };
    expect(fitStartupForProject(taxo).taxonomy?.industry).toBe("agtech_food");
    expect(scoreMandateFit(taxo, MANDATE)!.score).toBe(95); // every axis full except cheque (ask unknown → 5 of 10)
    expect(fitStartupForProject(PROJECT).taxonomy?.industry).toBe("agtech_food"); // crosswalked from "AgTech / Food"
  });

  it("needs BOTH the master flag and the mandate flag; hard gates and the floor drop the mandate", () => {
    expect(scoreMandateFit(PROJECT, { ...MANDATE, investor: { ...MANDATE.investor, discoverable: false } })).toBeNull();
    expect(scoreMandateFit(PROJECT, { ...MANDATE, mandate: { ...MANDATE.mandate, discoverable: false } })).toBeNull();
    expect(scoreMandateFit(PROJECT, { ...MANDATE, mandate: { ...MANDATE.mandate, min_svi: 90 } })).toBeNull();
    expect(scoreMandateFit(PROJECT, { ...MANDATE, mandate: { ...MANDATE.mandate, sectors_exclude: ["agtech_food"] } })).toBeNull();
  });

  it("rankAll lists an investor once (mandate wins over their prefs), keeps prefs-only investors for one release, best first", () => {
    const prefsSame = investor({ id: "inv-m", name: "Mandy Mandate" }); // same person, legacy prefs
    const prefsOnly = investor({ id: "inv-1", name: "Ann Angel" });
    const out = rankAll(PROJECT, [prefsSame, prefsOnly], [MANDATE, { ...MANDATE, mandate: { ...MANDATE.mandate, id: "m-2", stages: ["idea"] } }]);
    expect(out.filter((m) => m.investor_id === "inv-m")).toHaveLength(1);
    expect(out.find((m) => m.investor_id === "inv-m")).toMatchObject({ source: "mandate", mandate_id: "m-1" });
    expect(out.find((m) => m.investor_id === "inv-1")).toMatchObject({ source: "prefs" });
    expect(out.map((m) => m.score)).toEqual([...out.map((m) => m.score)].sort((a, b) => b - a));
  });

  it("matchInvestorsForProject merges the mandate store; a store without listDiscoverableMandates still works", async () => {
    const out = await matchInvestorsForProject(PROJECT, {
      store: { listDiscoverableInvestors: async () => [investor()], listDiscoverableMandates: async () => [MANDATE] },
    });
    expect(out.map((m) => [m.investor_id, m.source])).toEqual(expect.arrayContaining([["inv-m", "mandate"], ["inv-1", "prefs"]]));
    const legacyOnly = await matchInvestorsForProject(PROJECT, { store: { listDiscoverableInvestors: async () => [investor()] } });
    expect(legacyOnly.map((m) => m.investor_id)).toEqual(["inv-1"]);
  });

  it("supabase store: reads active + discoverable mandates, then only owners with the master flag on — never the email; 42P01 → []", async () => {
    const calls: Array<{ op: string; args: unknown[] }> = [];
    const mk = (rows: unknown[]) => {
      const chain: Record<string, unknown> = {};
      for (const op of ["select", "eq", "not", "in", "limit"]) chain[op] = (...args: unknown[]) => { calls.push({ op, args }); return chain; };
      chain.then = (r: (v: unknown) => unknown) => r({ data: rows, error: null });
      return chain;
    };
    const db = {
      from: (t: string) => {
        calls.push({ op: "from", args: [t] });
        if (t === "investor_mandates") return mk([{ id: "m-1", owner_user_id: "inv-m", label: "Sydney Angels", thesis: null, discoverable: true, sectors_include: ["agtech_food"], sectors_exclude: [], business_models: [], customer_types: [], stages: ["seed"], cheque_min_aud: "50000.00", cheque_max_aud: null, lead_or_follow: "lead", geographies: [], revenue_min_aud: null, growth_min_pct: null, min_svi: 50, tags_include: [], tags_exclude: [], weights: {} }, { id: "m-orphan", owner_user_id: "hidden", label: "x", discoverable: true }]);
        return mk([{ id: "inv-m", display_name: "Mandy", plan: "investor_angel", investor_discoverable: true }]);
      },
    };
    const rows = await createSupabaseInvestorStore(db).listDiscoverableMandates!();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ mandate: { id: "m-1", cheque_min_aud: 50_000, cheque_max_aud: null, lead_or_follow: "lead", min_svi: 50 }, investor: { id: "inv-m", name: "Mandy", discoverable: true } });
    expect(calls.filter((c) => c.op === "from").map((c) => c.args[0])).toEqual(["investor_mandates", "app_users"]);
    for (const c of calls.filter((x) => x.op === "select")) expect(String(c.args[0])).not.toMatch(/email/);
    expect(calls.filter((c) => c.op === "eq").map((c) => c.args)).toEqual(expect.arrayContaining([["is_active", true], ["discoverable", true], ["investor_discoverable", true]]));
    const missing = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: null, error: { code: "42P01", message: "relation does not exist" } }) }) }) }) }) };
    expect(await createSupabaseInvestorStore(missing).listDiscoverableMandates!()).toEqual([]);
  });
});
