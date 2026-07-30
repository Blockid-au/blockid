import { describe, it, expect } from "vitest";
import {
  EMPTY_PROFILE,
  profileCompletionPct,
  profileToSviInputText,
  type FounderProfile,
} from "./founder-profile-types";

// Colocated vitest for the client-safe founder-profile helpers
// (docs/plans/atlassian-standard-mapping-goal.md §P0 gap matrix phase 2 —
// "Team & founder profile" — this file backs the SVI Team-signal boost and
// the dashboard completion nag, so a silent widening of the completion
// thresholds or a new required field would surface here first).
//
// Pure module — no fakes needed; every assertion is deterministic.

function seed(overrides: Partial<FounderProfile> = {}): FounderProfile {
  return { ...EMPTY_PROFILE("acct-1", "founder@example.com"), ...overrides };
}

describe("EMPTY_PROFILE", () => {
  it("stamps account_id + email verbatim", () => {
    const p = EMPTY_PROFILE("acct-42", "Founder@Example.com");
    expect(p.account_id).toBe("acct-42");
    // No normalisation at construct time — the DB-write path handles casing.
    expect(p.email).toBe("Founder@Example.com");
  });

  it("nulls every optional scalar and empties every array", () => {
    const p = EMPTY_PROFILE("a", "b");
    expect(p.full_name).toBeNull();
    expect(p.role).toBeNull();
    expect(p.linkedin_url).toBeNull();
    expect(p.bio).toBeNull();
    expect(p.years_in_domain).toBeNull();
    expect(p.domain_insight).toBeNull();
    expect(p.ambition).toBeNull();
    expect(p.prev_employers).toEqual([]);
    expect(p.ship_history).toEqual([]);
    expect(p.co_founders).toEqual([]);
    expect(p.advisors).toEqual([]);
    expect(p.notable_hires).toEqual([]);
  });

  it("visibility defaults: public_visible=true, contactable_by_investors=false", () => {
    const p = EMPTY_PROFILE("a", "b");
    expect(p.public_visible).toBe(true);
    expect(p.contactable_by_investors).toBe(false);
  });
});

describe("profileCompletionPct", () => {
  it("null → 0", () => {
    expect(profileCompletionPct(null)).toBe(0);
  });

  it("blank empty profile → 0", () => {
    expect(profileCompletionPct(seed())).toBe(0);
  });

  it("one satisfied check → 10 (rounded from 10.0)", () => {
    expect(profileCompletionPct(seed({ full_name: "Ada Lovelace" }))).toBe(10);
  });

  it("all 10 checks satisfied → 100", () => {
    const p = seed({
      full_name: "Ada Lovelace",
      role: "CEO",
      linkedin_url: "https://linkedin.com/in/ada",
      bio: "x".repeat(81),
      prev_employers: ["Analytical Engines Ltd"],
      ship_history: ["Loom v1"],
      years_in_domain: 5,
      domain_insight: "x".repeat(41),
      ambition: "x".repeat(41),
      co_founders: [{ name: "Charles", role: "CTO" }],
    });
    expect(profileCompletionPct(p)).toBe(100);
  });

  it("bio at 80 chars is NOT counted; 81 crosses the length > 80 gate", () => {
    expect(profileCompletionPct(seed({ bio: "x".repeat(80) }))).toBe(0);
    expect(profileCompletionPct(seed({ bio: "x".repeat(81) }))).toBe(10);
  });

  it("full_name of a single visible char fails the trim().length > 1 gate", () => {
    expect(profileCompletionPct(seed({ full_name: "A" }))).toBe(0);
    expect(profileCompletionPct(seed({ full_name: "  A  " }))).toBe(0);
    expect(profileCompletionPct(seed({ full_name: "Ab" }))).toBe(10);
  });

  it("role of a single visible char fails the trim().length > 1 gate", () => {
    expect(profileCompletionPct(seed({ role: "X" }))).toBe(0);
    expect(profileCompletionPct(seed({ role: "CE" }))).toBe(10);
  });

  it("years_in_domain=0 fails the >0 gate; 1 satisfies it", () => {
    expect(profileCompletionPct(seed({ years_in_domain: 0 }))).toBe(0);
    expect(profileCompletionPct(seed({ years_in_domain: 1 }))).toBe(10);
  });

  it("domain_insight length boundary at 40 → uncounted; 41 → counted", () => {
    expect(profileCompletionPct(seed({ domain_insight: "x".repeat(40) }))).toBe(0);
    expect(profileCompletionPct(seed({ domain_insight: "x".repeat(41) }))).toBe(10);
  });

  it("ambition length boundary at 40 → uncounted; 41 → counted", () => {
    expect(profileCompletionPct(seed({ ambition: "x".repeat(40) }))).toBe(0);
    expect(profileCompletionPct(seed({ ambition: "x".repeat(41) }))).toBe(10);
  });

  it("team check is an OR — either co_founders OR advisors present counts", () => {
    expect(
      profileCompletionPct(seed({ co_founders: [{ name: "C", role: "CTO" }] })),
    ).toBe(10);
    expect(
      profileCompletionPct(seed({ advisors: [{ name: "A", role: "Advisor" }] })),
    ).toBe(10);
  });

  it("linkedin_url presence is truthy-based (empty string does NOT count)", () => {
    expect(profileCompletionPct(seed({ linkedin_url: "" }))).toBe(0);
    expect(
      profileCompletionPct(seed({ linkedin_url: "https://linkedin.com/in/x" })),
    ).toBe(10);
  });

  it("mid-range fractional score rounds to nearest whole percent", () => {
    // 3 of 10 checks → 30
    expect(
      profileCompletionPct(
        seed({
          full_name: "Ada Lovelace",
          role: "CEO",
          linkedin_url: "https://linkedin.com/in/ada",
        }),
      ),
    ).toBe(30);
    // 7 of 10 checks → 70
    expect(
      profileCompletionPct(
        seed({
          full_name: "Ada",
          role: "CEO",
          linkedin_url: "https://linkedin.com/in/ada",
          bio: "x".repeat(81),
          prev_employers: ["A"],
          ship_history: ["S"],
          years_in_domain: 5,
        }),
      ),
    ).toBe(70);
  });
});

describe("profileToSviInputText", () => {
  it("null → empty string", () => {
    expect(profileToSviInputText(null)).toBe("");
  });

  it("blank empty profile → empty string", () => {
    expect(profileToSviInputText(seed())).toBe("");
  });

  it("full_name alone renders without a role suffix", () => {
    expect(profileToSviInputText(seed({ full_name: "Ada Lovelace" }))).toBe(
      "Founder: Ada Lovelace.",
    );
  });

  it("full_name + role renders with the ', role' suffix", () => {
    expect(
      profileToSviInputText(seed({ full_name: "Ada Lovelace", role: "CEO" })),
    ).toBe("Founder: Ada Lovelace, CEO.");
  });

  it("years_in_domain=null is skipped; positive integer renders inline", () => {
    expect(profileToSviInputText(seed({ years_in_domain: null }))).toBe("");
    expect(profileToSviInputText(seed({ years_in_domain: 7 }))).toBe(
      "7 years in domain.",
    );
  });

  it("prev_employers rendered as comma-space-joined list", () => {
    expect(
      profileToSviInputText(
        seed({ prev_employers: ["Atlassian", "Canva", "Airtree"] }),
      ),
    ).toBe("Previously at Atlassian, Canva, Airtree.");
  });

  it("ship_history rendered as middle-dot-joined list", () => {
    expect(
      profileToSviInputText(seed({ ship_history: ["Jira 1.0", "Confluence 1.0"] })),
    ).toBe("Ship history: Jira 1.0 · Confluence 1.0.");
  });

  it("co_founders rendered as 'Name (Role), Name (Role)'", () => {
    expect(
      profileToSviInputText(
        seed({
          co_founders: [
            { name: "Mike", role: "Co-CEO" },
            { name: "Scott", role: "Co-CEO" },
          ],
        }),
      ),
    ).toBe("Co-founders: Mike (Co-CEO), Scott (Co-CEO).");
  });

  it("advisors rendered as 'Name (Role), Name (Role)'", () => {
    expect(
      profileToSviInputText(
        seed({ advisors: [{ name: "Bill", role: "Chair" }] }),
      ),
    ).toBe("Advisors: Bill (Chair).");
  });

  it("notable_hires with 'from' render 'Name (Role ex-From)', without 'from' skip the ex-", () => {
    expect(
      profileToSviInputText(
        seed({
          notable_hires: [
            { name: "Sri", role: "VP Eng", from: "Google" },
            { name: "Jay", role: "VP Sales" },
          ],
        }),
      ),
    ).toBe("Notable hires: Sri (VP Eng ex-Google), Jay (VP Sales).");
  });

  it("multiple sections join with single spaces preserving section order", () => {
    const text = profileToSviInputText(
      seed({
        full_name: "Ada Lovelace",
        role: "CEO",
        years_in_domain: 5,
        domain_insight: "Founders ship on Fridays.",
        ambition: "Ship weekly for 20 years.",
      }),
    );
    expect(text).toBe(
      "Founder: Ada Lovelace, CEO. 5 years in domain. Founders ship on Fridays. Ship weekly for 20 years.",
    );
  });

  it("years_in_domain=0 is falsy and therefore skipped (documented quirk of the >0 gate)", () => {
    expect(profileToSviInputText(seed({ years_in_domain: 0 }))).toBe("");
  });
});
