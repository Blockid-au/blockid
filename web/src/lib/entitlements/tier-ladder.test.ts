// Ladder invariants — see tier-ladder.ts header for the rule list.
//
// This suite is the safety net for the pricing page, /pricing?tier=… deep
// links, the upgrade-nudge tile, and the 402 payload's headline copy. Any
// intentional ladder change requires re-reading the design doc at
// docs/plans/tier-menu-2026-07-24/03-cfo-tier-boundaries.md first.

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../supabase", () => ({ getSupabaseAdmin: () => null }));
vi.mock("../plans-db", () => ({ getPlanCached: async () => null }));

import type { Feature } from "@/lib/entitlements";
import { LEGACY_FEATURE_FALLBACK } from "@/lib/entitlements";
import { FEATURE_GATES } from "@/lib/feature-gates.manifest";
import { PLANS_V2 } from "@/lib/plans-v2";
import { PLAN_ID_TO_TIER } from "@/lib/segments";

import {
  ACCELERATOR_LADDER,
  ADVISOR_LADDER,
  ALL_LADDER_ENTRIES,
  FOUNDER_LADDER,
  INVESTOR_LADDER,
  TIER_LADDER_BY_ID,
  type PlanId,
} from "./tier-ladder";

const PUBLIC_LADDERS = {
  founder: FOUNDER_LADDER,
  investor: INVESTOR_LADDER,
  accelerator: ACCELERATOR_LADDER,
} as const;

describe("tier-ladder — invariant (a) rank strictly increasing within segment", () => {
  for (const [segment, ladder] of Object.entries(PUBLIC_LADDERS)) {
    it(`${segment} ranks strictly increase and are unique`, () => {
      for (let i = 1; i < ladder.length; i++) {
        expect(ladder[i]!.rank).toBeGreaterThan(ladder[i - 1]!.rank);
      }
      const ranks = ladder.map((e) => e.rank);
      expect(new Set(ranks).size).toBe(ranks.length);
    });
  }
});

describe("tier-ladder — invariant (b) supportingUnlocks monotonic superset", () => {
  for (const [segment, ladder] of Object.entries(PUBLIC_LADDERS)) {
    it(`${segment} rank N supportingUnlocks ⊇ rank N-1`, () => {
      for (let i = 1; i < ladder.length; i++) {
        const prev = new Set<Feature>(ladder[i - 1]!.supportingUnlocks);
        const curr = new Set<Feature>(ladder[i]!.supportingUnlocks);
        for (const f of prev) expect(curr.has(f)).toBe(true);
      }
    });
  }
});

describe("tier-ladder — invariant (c) every plans-v2 SKU + reseller_admin mapped exactly once", () => {
  it("TIER_LADDER_BY_ID has an entry for every plans-v2 SKU", () => {
    for (const p of PLANS_V2) {
      expect(TIER_LADDER_BY_ID[p.id as PlanId]).toBeDefined();
    }
  });

  it("TIER_LADDER_BY_ID includes reseller_admin flagged hiddenFromPublic:true", () => {
    expect(TIER_LADDER_BY_ID.reseller_admin).toBeDefined();
    expect(TIER_LADDER_BY_ID.reseller_admin.hiddenFromPublic).toBe(true);
  });

  it("no *_LADDER array contains reseller_admin (public ladders are marketing-only)", () => {
    for (const ladder of [FOUNDER_LADDER, INVESTOR_LADDER, ACCELERATOR_LADDER, ADVISOR_LADDER]) {
      expect(ladder.find((e) => e.id === "reseller_admin")).toBeUndefined();
    }
  });

  it("ids are unique across the ladder (no accidental duplicates)", () => {
    const ids = ALL_LADDER_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("tier-ladder — invariant (d) no-orphan-features", () => {
  it("union of supportingUnlocks ⊇ every required_feature in FEATURE_GATES", () => {
    const covered = new Set<string>();
    for (const e of ALL_LADDER_ENTRIES) for (const f of e.supportingUnlocks) covered.add(f);

    for (const g of FEATURE_GATES) {
      expect(covered.has(g.required_feature)).toBe(true);
    }
  });

  it("union of supportingUnlocks ⊇ every feature key in LEGACY_FEATURE_FALLBACK (incl. dual-spelling)", () => {
    const covered = new Set<string>();
    for (const e of ALL_LADDER_ENTRIES) for (const f of e.supportingUnlocks) covered.add(f);

    for (const bundle of Object.values(LEGACY_FEATURE_FALLBACK)) {
      for (const feature of bundle) expect(covered.has(feature)).toBe(true);
    }
  });

  it("dual-spelling pairs are BOTH present at the tier that gates them", () => {
    const growth = TIER_LADDER_BY_ID.founder_growth.supportingUnlocks;
    expect(growth).toContain("term_sheet.ai");
    expect(growth).toContain("term_sheet_ai");

    const ent = TIER_LADDER_BY_ID.founder_enterprise.supportingUnlocks;
    expect(ent).toContain("api");
    expect(ent).toContain("api.access");
  });
});

describe("tier-ladder — invariant (e) headlineUnlock strings unique across the whole ladder", () => {
  it("no two entries share a headlineUnlock string", () => {
    const headlines = ALL_LADDER_ENTRIES.map((e) => e.headlineUnlock);
    expect(new Set(headlines).size).toBe(headlines.length);
  });
});

describe("tier-ladder — invariant (f) legacy plan IDs still resolve", () => {
  const LEGACY_IDS = ["free", "founding50", "growth", "growth_annual"] as const;

  it.each(LEGACY_IDS)("%s resolves via PLAN_ID_TO_TIER to a founder-ladder entry", (id) => {
    const tier = PLAN_ID_TO_TIER[id];
    expect(tier).toBeDefined();
    const entry = FOUNDER_LADDER.find((e) => PLAN_ID_TO_TIER[e.id] === tier);
    expect(entry).toBeDefined();
    expect(entry!.headlineUnlock.length).toBeGreaterThan(0);
  });
});
