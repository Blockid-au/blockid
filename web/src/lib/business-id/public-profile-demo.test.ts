import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Guard test for the PUBLIC DEMO PROFILE at /id/blockid-demo.
 *
 * Why this file exists
 * --------------------
 * `blockid-demo` is not just another row. The /business-id marketing page
 * (src/app/(marketing)/business-id/business-id-shared.tsx) prints
 * `blockid.au/id/blockid-demo` as the canonical sample Business ID, and
 * Master Upgrade Plan §7.2 block 4 specs the Trust-Score preview against
 * the same URL. If a future migration unpublishes the demo — flips
 * `public_index` to false, or drops `verification_level` below the L2 bar
 * the sitemap enforces (src/app/sitemap.ts) — those marketing surfaces go
 * back to 404ing silently. This test pins the contract.
 *
 * The fixture below MIRRORS migration
 * `supabase/migrations/0297_seed_demo_business_profile.sql` byte-for-byte
 * in the fields that matter, INCLUDING the way PostgREST serialises
 * `timestamptz` (numeric `+00:00` offset, not `Z`). That serialisation is
 * exactly what broke the page in production: Zod's `.datetime()` rejects
 * offsets, the whole profile failed validation, and `/id/blockid-demo`
 * 404'd. `toIsoZ()` normalises it — the regression is pinned here too.
 *
 * Supabase is MOCKED. This test never touches the live database.
 *
 * Note on `publicIndex`: it is deliberately NOT a field on
 * `PublicBusinessProfile` — the §11.1 whitelist exposes only the ten
 * public fields, and adding an eleventh to satisfy a test would weaken
 * it. `public_index = true` is instead asserted structurally: the reader
 * issues `.eq("public_index", true)`, so a non-null return IS proof the
 * row is published. Both halves are checked below.
 */

interface FakeState {
  rows: Record<string, unknown>[];
  lastQuery: {
    from: string | null;
    columns: string | null;
    filters: Array<{ col: string; val: unknown }>;
  };
}

const state: FakeState = {
  rows: [],
  lastQuery: { from: null, columns: null, filters: [] },
};

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from(table: string) {
      state.lastQuery.from = table;
      state.lastQuery.columns = null;
      state.lastQuery.filters = [];
      return {
        select(cols: string) {
          state.lastQuery.columns = cols;
          const chain = {
            eq(col: string, val: unknown) {
              state.lastQuery.filters.push({ col, val });
              return chain;
            },
            maybeSingle() {
              const match = state.rows.find((row) =>
                state.lastQuery.filters.every((f) => row[f.col] === f.val),
              );
              return Promise.resolve({ data: match ?? null, error: null });
            },
          };
          return chain;
        },
      };
    },
  }),
}));

import { readPublicProfile, toIsoZ } from "./public-profile";

/**
 * Snapshot of the row seeded by migration 0297, shaped the way PostgREST
 * hands it back (timestamptz → `+00:00`, jsonb → plain objects).
 */
const DEMO_ROW: Record<string, unknown> = {
  public_slug: "blockid-demo",
  public_index: true,
  name: "BlockID Demo Co (Sample Profile)",
  verification_level: 3,
  capability_scores: {
    leadership: 82,
    people: 74,
    culture: 79,
    strategy: 85,
    commercial: 71,
    brand: 68,
    ops: 77,
    performance: 73,
    risk: 81,
    tech: 88,
    digital: 76,
    data: 70,
  },
  last_verified_at: "2026-07-15T00:00:00+00:00",
  attestations: [
    {
      attester: "Demo Assurance Partners (sample)",
      type: "auditor",
      issuedAt: "2026-06-02T00:00:00Z",
    },
    {
      attester: "Sample Customer Pty Ltd (sample)",
      type: "customer",
      issuedAt: "2026-05-14T00:00:00Z",
    },
    {
      attester: "Demo Seed Fund (sample)",
      type: "investor",
      issuedAt: "2026-04-08T00:00:00Z",
    },
  ],
  industry: "Software & SaaS",
};

/** The 12 analysis areas the radar in public-profile-shared.tsx plots. */
const RADAR_AREAS = [
  "leadership",
  "people",
  "culture",
  "strategy",
  "commercial",
  "brand",
  "ops",
  "performance",
  "risk",
  "tech",
  "digital",
  "data",
] as const;

beforeEach(() => {
  state.rows = [structuredClone(DEMO_ROW)];
  state.lastQuery = { from: null, columns: null, filters: [] };
});

describe("/id/blockid-demo — marketing demo profile guard", () => {
  it("resolves to a live profile", async () => {
    const profile = await readPublicProfile("blockid-demo");
    expect(profile).not.toBeNull();
    expect(profile?.slug).toBe("blockid-demo");
    expect(profile?.legalName).toBe("BlockID Demo Co (Sample Profile)");
    expect(profile?.publicUrl).toBe("https://blockid.au/id/blockid-demo");
  });

  it("is published: the reader gates on public_index === true", async () => {
    await readPublicProfile("blockid-demo");
    // Structural proof of publicIndex === true without widening the
    // §11.1 whitelist with an eleventh field.
    expect(state.lastQuery.filters).toEqual(
      expect.arrayContaining([{ col: "public_index", val: true }]),
    );
  });

  it("returns null the moment the demo is unpublished", async () => {
    state.rows = [{ ...structuredClone(DEMO_ROW), public_index: false }];
    expect(await readPublicProfile("blockid-demo")).toBeNull();
  });

  it("sits at verificationLevel >= 2 so it clears the sitemap bar", async () => {
    const profile = await readPublicProfile("blockid-demo");
    expect(profile?.verificationLevel).toBeGreaterThanOrEqual(2);
    // Migration 0297 pins L3 specifically ("trust tier").
    expect(profile?.verificationLevel).toBe(3);
  });

  it("carries a plausible trust score derived from the 12 areas", async () => {
    const profile = await readPublicProfile("blockid-demo");
    expect(profile?.trustScore).toBe(77);
  });

  it("populates all 12 radar areas", async () => {
    const profile = await readPublicProfile("blockid-demo");
    for (const area of RADAR_AREAS) {
      expect(profile?.capabilityScores[area]).toBeTypeOf("number");
    }
    expect(Object.keys(profile?.capabilityScores ?? {})).toHaveLength(12);
  });

  it("exposes 3 attestation summaries, all sample-labelled", async () => {
    const profile = await readPublicProfile("blockid-demo");
    expect(profile?.attestations).toHaveLength(3);
    for (const a of profile?.attestations ?? []) {
      expect(a.attester).toContain("(sample)");
    }
  });

  it("earns the L3 badge ladder", async () => {
    const profile = await readPublicProfile("blockid-demo");
    expect(profile?.badges).toEqual(
      expect.arrayContaining([
        "identity-verified",
        "evidence-checked",
        "trust-tier",
      ]),
    );
  });
});

describe("toIsoZ — PostgREST timestamptz normalisation", () => {
  it("regression: a +00:00 offset must not 404 the profile", async () => {
    // The exact production failure. Before toIsoZ() the raw PostgREST
    // string failed z.string().datetime() and nulled the whole profile.
    expect(state.rows[0]?.last_verified_at).toBe("2026-07-15T00:00:00+00:00");
    const profile = await readPublicProfile("blockid-demo");
    expect(profile).not.toBeNull();
    expect(profile?.lastVerifiedAt).toBe("2026-07-15T00:00:00.000Z");
  });

  it("normalises non-UTC offsets", () => {
    expect(toIsoZ("2026-07-15T10:00:00+10:00")).toBe("2026-07-15T00:00:00.000Z");
  });

  it("passes through already-Z timestamps", () => {
    expect(toIsoZ("2026-07-15T00:00:00.000Z")).toBe("2026-07-15T00:00:00.000Z");
  });

  it("accepts Date instances", () => {
    expect(toIsoZ(new Date("2026-07-15T00:00:00Z"))).toBe(
      "2026-07-15T00:00:00.000Z",
    );
  });

  it("returns null for junk, empty, null and invalid Dates", () => {
    expect(toIsoZ("not-a-date")).toBeNull();
    expect(toIsoZ("")).toBeNull();
    expect(toIsoZ("   ")).toBeNull();
    expect(toIsoZ(null)).toBeNull();
    expect(toIsoZ(undefined)).toBeNull();
    expect(toIsoZ(12345)).toBeNull();
    expect(toIsoZ(new Date("nope"))).toBeNull();
  });
});
