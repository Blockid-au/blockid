import { describe, it, expect, vi, beforeEach } from "vitest";

// Colocated vitest for the server-only founder-profile I/O helpers.
// Sibling pure module lib/founder-profile-types.ts is already covered by
// founder-profile-types.test.ts (P5-founder-profile-types-lib-test); this
// pins the three DB-fronted helpers (load by account_id, load by email,
// upsert) that back the /founder/profile route + SVI Team-signal boost.

type Row = Record<string, unknown> | null;

interface FakeState {
  adminConfigured: boolean;
  selectRow: Row;
  selectError: { code?: string; message: string } | null;
  upsertError: { code?: string; message: string } | null;
  captured: {
    from: string | null;
    eqCol: string | null;
    eqVal: string | null;
    upsertPayload: Record<string, unknown> | null;
    upsertOpts: { onConflict?: string } | null;
  };
}

const state: FakeState = {
  adminConfigured: true,
  selectRow: null,
  selectError: null,
  upsertError: null,
  captured: {
    from: null,
    eqCol: null,
    eqVal: null,
    upsertPayload: null,
    upsertOpts: null,
  },
};

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (!state.adminConfigured) return null;
    return {
      from(table: string) {
        state.captured.from = table;
        return {
          select(_cols: string) {
            const chain = {
              eq(col: string, val: string) {
                state.captured.eqCol = col;
                state.captured.eqVal = val;
                return chain;
              },
              maybeSingle() {
                return Promise.resolve({
                  data: state.selectError ? null : state.selectRow,
                  error: state.selectError,
                });
              },
            };
            return chain;
          },
          upsert(
            payload: Record<string, unknown>,
            opts?: { onConflict?: string },
          ) {
            state.captured.upsertPayload = payload;
            state.captured.upsertOpts = opts ?? null;
            return Promise.resolve({ error: state.upsertError });
          },
        };
      },
    };
  },
}));

import {
  loadFounderProfile,
  loadFounderProfileByEmail,
  saveFounderProfile,
  type FounderProfile,
} from "./founder-profile";

function seedProfile(overrides: Partial<FounderProfile> = {}): FounderProfile {
  return {
    account_id: "acct-1",
    email: "founder@example.com",
    full_name: "Ada Lovelace",
    role: "CEO",
    linkedin_url: "https://linkedin.com/in/ada",
    bio: null,
    prev_employers: [],
    ship_history: [],
    years_in_domain: null,
    domain_insight: null,
    ambition: null,
    co_founders: [],
    advisors: [],
    notable_hires: [],
    public_visible: true,
    contactable_by_investors: false,
    ...overrides,
  } as FounderProfile;
}

beforeEach(() => {
  state.adminConfigured = true;
  state.selectRow = null;
  state.selectError = null;
  state.upsertError = null;
  state.captured = {
    from: null,
    eqCol: null,
    eqVal: null,
    upsertPayload: null,
    upsertOpts: null,
  };
});

describe("loadFounderProfile", () => {
  it("returns null when the admin client is not configured", async () => {
    state.adminConfigured = false;
    const res = await loadFounderProfile("acct-1");
    expect(res).toBeNull();
    expect(state.captured.from).toBeNull();
  });

  it("queries founder_profiles by account_id and returns the row", async () => {
    state.selectRow = { account_id: "acct-1", email: "founder@example.com", full_name: "Ada" };
    const res = await loadFounderProfile("acct-1");
    expect(state.captured.from).toBe("founder_profiles");
    expect(state.captured.eqCol).toBe("account_id");
    expect(state.captured.eqVal).toBe("acct-1");
    expect(res).toEqual({ account_id: "acct-1", email: "founder@example.com", full_name: "Ada" });
  });

  it("returns null when no row matches (maybeSingle → null)", async () => {
    state.selectRow = null;
    const res = await loadFounderProfile("missing-acct");
    expect(res).toBeNull();
  });

  it("returns null when the SELECT errors — never throws to caller", async () => {
    state.selectError = { code: "PGRST", message: "boom" };
    const res = await loadFounderProfile("acct-1");
    expect(res).toBeNull();
  });
});

describe("loadFounderProfileByEmail", () => {
  it("returns null when the admin client is not configured", async () => {
    state.adminConfigured = false;
    const res = await loadFounderProfileByEmail("Founder@Example.com");
    expect(res).toBeNull();
    expect(state.captured.from).toBeNull();
  });

  it("normalises the email — lowercased + trimmed — before the eq filter", async () => {
    state.selectRow = { account_id: "acct-1", email: "founder@example.com" };
    const res = await loadFounderProfileByEmail("  Founder@Example.COM  ");
    expect(state.captured.from).toBe("founder_profiles");
    expect(state.captured.eqCol).toBe("email");
    expect(state.captured.eqVal).toBe("founder@example.com");
    expect(res).toEqual({ account_id: "acct-1", email: "founder@example.com" });
  });

  it("returns null when no row matches (maybeSingle → null)", async () => {
    state.selectRow = null;
    const res = await loadFounderProfileByEmail("nobody@example.com");
    expect(res).toBeNull();
  });

  it("returns null when the SELECT errors — swallowed by the `if (!data)` guard", async () => {
    // The by-email helper does not read the error; a null data path suffices.
    state.selectError = { message: "network" };
    const res = await loadFounderProfileByEmail("x@example.com");
    expect(res).toBeNull();
  });
});

describe("saveFounderProfile", () => {
  it("returns {ok:false, error:'Database not configured'} when admin is null", async () => {
    state.adminConfigured = false;
    const res = await saveFounderProfile(seedProfile());
    expect(res).toEqual({ ok: false, error: "Database not configured" });
    expect(state.captured.upsertPayload).toBeNull();
  });

  it("upserts to founder_profiles with onConflict:'account_id'", async () => {
    const res = await saveFounderProfile(seedProfile());
    expect(res).toEqual({ ok: true });
    expect(state.captured.from).toBe("founder_profiles");
    expect(state.captured.upsertOpts).toEqual({ onConflict: "account_id" });
  });

  it("lowercases + trims the email in the upsert payload", async () => {
    await saveFounderProfile(
      seedProfile({ email: "  Founder@Example.COM  " }),
    );
    expect(state.captured.upsertPayload?.email).toBe("founder@example.com");
  });

  it("payload pins the exact 16-column shape the DB row expects", async () => {
    const p = seedProfile({
      account_id: "acct-42",
      email: "ada@example.com",
      full_name: "Ada",
      role: "CTO",
      linkedin_url: "https://linkedin.com/in/ada",
      bio: "bio-text",
      prev_employers: ["Analytical Engines Ltd"],
      ship_history: ["Loom v1"],
      years_in_domain: 5,
      domain_insight: "domain",
      ambition: "amb",
      co_founders: [{ name: "Charles", role: "CTO" } as unknown as never],
      advisors: [{ name: "M", role: "advisor" } as unknown as never],
      notable_hires: [{ name: "N", role: "eng" } as unknown as never],
      public_visible: false,
      contactable_by_investors: true,
    });
    await saveFounderProfile(p);
    const payload = state.captured.upsertPayload ?? {};
    expect(Object.keys(payload).sort()).toEqual(
      [
        "account_id",
        "email",
        "full_name",
        "role",
        "linkedin_url",
        "bio",
        "prev_employers",
        "ship_history",
        "years_in_domain",
        "domain_insight",
        "ambition",
        "co_founders",
        "advisors",
        "notable_hires",
        "public_visible",
        "contactable_by_investors",
      ].sort(),
    );
    expect(payload.account_id).toBe("acct-42");
    expect(payload.role).toBe("CTO");
    expect(payload.public_visible).toBe(false);
    expect(payload.contactable_by_investors).toBe(true);
    expect(payload.years_in_domain).toBe(5);
  });

  it("returns {ok:false, error:message} when the upsert errors — surfaces DB error verbatim", async () => {
    state.upsertError = { code: "23505", message: "duplicate key value" };
    const res = await saveFounderProfile(seedProfile());
    expect(res).toEqual({ ok: false, error: "duplicate key value" });
  });

  it("empty-string email still normalises via toLowerCase().trim() (empty stays empty)", async () => {
    await saveFounderProfile(seedProfile({ email: "" }));
    expect(state.captured.upsertPayload?.email).toBe("");
  });

  it("array fields pass through by reference — no cloning, no re-sorting", async () => {
    const employers = ["A", "B", "C"];
    await saveFounderProfile(seedProfile({ prev_employers: employers }));
    expect(state.captured.upsertPayload?.prev_employers).toBe(employers);
  });

  it("nullable scalars propagate as-is (bio=null, ambition=null preserved)", async () => {
    await saveFounderProfile(seedProfile({ bio: null, ambition: null, domain_insight: null }));
    expect(state.captured.upsertPayload?.bio).toBeNull();
    expect(state.captured.upsertPayload?.ambition).toBeNull();
    expect(state.captured.upsertPayload?.domain_insight).toBeNull();
  });

  it("does not pass any onConflict variant other than account_id", async () => {
    await saveFounderProfile(seedProfile());
    // Pinning the exact value; a rename in the DB migration would surface here.
    expect(state.captured.upsertOpts).toEqual({ onConflict: "account_id" });
    expect(state.captured.upsertOpts?.onConflict).not.toBe("email");
  });
});

describe("module re-exports", () => {
  it("re-exports EMPTY_PROFILE + profileCompletionPct + profileToSviInputText from the types module", async () => {
    const mod = await import("./founder-profile");
    expect(typeof mod.EMPTY_PROFILE).toBe("function");
    expect(typeof mod.profileCompletionPct).toBe("function");
    expect(typeof mod.profileToSviInputText).toBe("function");
  });
});
