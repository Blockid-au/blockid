import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Colocated vitest for the Business ID public profile reader.
 *
 * Master Upgrade Plan §11.1 + §14bis D3 — pins the PII whitelist:
 *   - not-found → null
 *   - unindexed (public_index=false) → null (filter in the query)
 *   - happy path returns exactly the whitelisted shape
 *   - forbidden fields (user_id/email/evidence/financials) NEVER appear
 *     even when the row contains them
 */

interface FakeState {
  adminConfigured: boolean;
  rows: Record<string, unknown>[];
  lastQuery: {
    from: string | null;
    columns: string | null;
    filters: Array<{ col: string; val: unknown }>;
  };
}

const state: FakeState = {
  adminConfigured: true,
  rows: [],
  lastQuery: { from: null, columns: null, filters: [] },
};

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (!state.adminConfigured) return null;
    return {
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
                  state.lastQuery.filters.every(
                    (f) => row[f.col] === f.val,
                  ),
                );
                return Promise.resolve({ data: match ?? null, error: null });
              },
            };
            return chain;
          },
        };
      },
    };
  },
}));

import {
  readPublicProfile,
  projectRowToPublicProfile,
  deriveTrustScore,
  deriveBadges,
  PublicBusinessProfileSchema,
  PUBLIC_PROFILE_BASE_URL,
} from "./public-profile";

beforeEach(() => {
  state.adminConfigured = true;
  state.rows = [];
  state.lastQuery = { from: null, columns: null, filters: [] };
});

describe("readPublicProfile", () => {
  it("returns null when slug is empty or too long", async () => {
    expect(await readPublicProfile("")).toBeNull();
    expect(await readPublicProfile("   ")).toBeNull();
    expect(await readPublicProfile("x".repeat(200))).toBeNull();
  });

  it("returns null when Supabase is unconfigured (marketing dev mode)", async () => {
    state.adminConfigured = false;
    expect(await readPublicProfile("acme")).toBeNull();
  });

  it("returns null when no row matches the slug", async () => {
    state.rows = []; // empty
    const result = await readPublicProfile("nonexistent");
    expect(result).toBeNull();
    expect(state.lastQuery.from).toBe("projects");
    // must have filtered by both public_slug AND public_index=true
    const cols = state.lastQuery.filters.map((f) => f.col);
    expect(cols).toContain("public_slug");
    expect(cols).toContain("public_index");
  });

  it("returns null when the profile has public_index=false (owner opt-out)", async () => {
    // Row exists but with public_index=false — the .eq('public_index', true)
    // filter drops it. Our fake matches every filter so the row won't hit.
    state.rows = [
      {
        public_slug: "opted-out",
        public_index: false,
        name: "Opted Out Co",
        verification_level: 3,
        capability_scores: { a: 80 },
        last_verified_at: "2026-07-01T00:00:00.000Z",
        attestations: [],
      },
    ];
    const result = await readPublicProfile("opted-out");
    expect(result).toBeNull();
  });

  it("returns the whitelisted shape on happy path", async () => {
    state.rows = [
      {
        public_slug: "acme",
        public_index: true,
        name: "Acme Pty Ltd",
        verification_level: 3,
        capability_scores: {
          leadership: 75,
          strategy: 82,
          ops: 68,
          tech: 90,
        },
        last_verified_at: "2026-07-15T12:00:00.000Z",
        attestations: [
          {
            attester: "PwC Audit",
            type: "auditor",
            issuedAt: "2026-06-01T00:00:00.000Z",
          },
        ],
        industry: "SaaS",
      },
    ];

    const result = await readPublicProfile("acme");
    expect(result).not.toBeNull();
    if (!result) return;

    // schema round-trip
    expect(() => PublicBusinessProfileSchema.parse(result)).not.toThrow();

    expect(result.slug).toBe("acme");
    expect(result.legalName).toBe("Acme Pty Ltd");
    expect(result.verificationLevel).toBe(3);
    expect(result.lastVerifiedAt).toBe("2026-07-15T12:00:00.000Z");
    expect(result.publicUrl).toBe(`${PUBLIC_PROFILE_BASE_URL}/id/acme`);
    expect(result.trustScore).toBeGreaterThan(70);
    expect(result.trustScore).toBeLessThanOrEqual(100);
    expect(result.badges).toEqual(
      expect.arrayContaining([
        "identity-verified",
        "evidence-checked",
        "trust-tier",
      ]),
    );
    expect(result.capabilityScores).toEqual({
      leadership: 75,
      strategy: 82,
      ops: 68,
      tech: 90,
    });
    expect(result.attestations).toHaveLength(1);
    expect(result.attestations[0]).toEqual({
      attester: "PwC Audit",
      type: "auditor",
      issuedAt: "2026-06-01T00:00:00.000Z",
    });
  });
});

describe("projectRowToPublicProfile — PII whitelist", () => {
  it("NEVER leaks user_id, email, evidence, or financial fields", () => {
    const rowWithForbidden = {
      public_slug: "acme",
      name: "Acme Pty Ltd",
      verification_level: 2,
      capability_scores: { leadership: 70 },
      last_verified_at: "2026-07-15T12:00:00.000Z",
      attestations: [],
      // ─── FORBIDDEN — must never appear on public profile ───
      user_id: "550e8400-e29b-41d4-a716-446655440000",
      owner_email: "founder@example.com",
      mrr_aud: 45000,
      arr_aud: 540000,
      valuation_aud: 12000000,
      evidence_refs: ["s3://priv/deck.pdf", "s3://priv/pnl.xlsx"],
      internal_notes: "Founder disputes valuation",
      cap_table: [{ holder: "founder", pct: 60 }],
      stripe_customer_id: "cus_XXX",
    };

    const profile = projectRowToPublicProfile(rowWithForbidden);
    expect(profile).not.toBeNull();
    if (!profile) return;

    const keys = Object.keys(profile);
    // Whitelist is exactly these 11 fields — nothing else.
    //
    // It was 10 until migration 0298 added `profileKind`. That is the
    // ONLY permitted widening: it is a discriminator describing the ROW
    // ('customer' vs seeded sample data), not the business, and every
    // public surface needs it to decide whether an unqualified "BlockID
    // Verified" claim is honest. Adding a 12th field that describes the
    // business itself is a leak — this assertion is what stops it.
    expect(keys.sort()).toEqual(
      [
        "slug",
        "legalName",
        "verificationLevel",
        "trustScore",
        "lastVerifiedAt",
        "badges",
        "capabilityScores",
        "attestations",
        "jurisdiction",
        "publicUrl",
        "profileKind",
      ].sort(),
    );

    // Serialised form must also not contain any forbidden token.
    const json = JSON.stringify(profile);
    for (const forbidden of [
      "user_id",
      "550e8400-e29b-41d4-a716-446655440000",
      "founder@example.com",
      "mrr",
      "arr",
      "valuation",
      "evidence_refs",
      "internal_notes",
      "cap_table",
      "stripe_customer_id",
      "cus_XXX",
      "45000",
      "540000",
      "12000000",
    ]) {
      expect(json.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("drops malformed attestations rather than passing them through", () => {
    const profile = projectRowToPublicProfile({
      public_slug: "acme",
      name: "Acme",
      verification_level: 1,
      capability_scores: {},
      last_verified_at: null,
      attestations: [
        { attester: "Good", type: "auditor", issuedAt: "2026-01-01T00:00:00.000Z" },
        { attester: 42, type: "auditor", issuedAt: "invalid-date" }, // bad
        null,
        "not-an-object",
      ],
    });
    expect(profile?.attestations).toHaveLength(1);
    expect(profile?.attestations[0]?.attester).toBe("Good");
  });

  it("returns null when public_slug is missing", () => {
    expect(
      projectRowToPublicProfile({
        name: "Slugless",
        verification_level: 3,
        capability_scores: {},
      }),
    ).toBeNull();
  });
});

describe("deriveTrustScore", () => {
  it("averages numeric capability scores and clamps to [0, 100]", () => {
    expect(deriveTrustScore({})).toBe(0);
    expect(deriveTrustScore({ a: 50, b: 100 })).toBe(75);
    expect(deriveTrustScore({ a: 200 })).toBeLessThanOrEqual(100);
    expect(deriveTrustScore({ a: -50 })).toBeGreaterThanOrEqual(0);
  });

  it("ignores non-numeric entries", () => {
    expect(deriveTrustScore({ a: 80, b: "high", c: null, d: 60 })).toBe(70);
  });
});

describe("deriveBadges", () => {
  it("stacks ladder badges up to the current level", () => {
    expect(deriveBadges(0, 0)).toEqual([]);
    expect(deriveBadges(2, 40)).toEqual([
      "identity-verified",
      "evidence-checked",
    ]);
    expect(deriveBadges(5, 90)).toEqual([
      "identity-verified",
      "evidence-checked",
      "trust-tier",
      "attested",
      "continuously-monitored",
      "high-performer",
    ]);
  });

  it("adds investor-ready between 60 and 79 trust score", () => {
    expect(deriveBadges(1, 65)).toContain("investor-ready");
    expect(deriveBadges(1, 65)).not.toContain("high-performer");
  });
});
