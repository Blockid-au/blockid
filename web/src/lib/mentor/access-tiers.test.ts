import { describe, it, expect } from "vitest";
import {
  MENTOR_ACCESS_TIERS,
  TIER_RANK,
  CONSENT_LIFETIME_DAYS,
  EXPIRY_WARN_DAYS,
  tierAtLeast,
  requireTier,
  tierLabel,
  tierBadgeColor,
  tierDisclosure,
  canViewReport,
  canViewSviEvidence,
  canLeaveNote,
  isExpiringSoon,
  isExpired,
  isEffective,
  type MentorAccessGrant,
  type MentorAccessTier,
} from "./access-tiers";

const NOW = new Date("2026-07-31T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (msFromNow: number) => new Date(NOW.getTime() + msFromNow).toISOString();

function makeGrant(overrides: Partial<MentorAccessGrant> = {}): MentorAccessGrant {
  return {
    id: "g1",
    reseller_id: "r1",
    mentor_user_id: "m1",
    founder_user_id: "f1",
    project_id: null,
    tier: "reports_shared",
    granted_at: NOW.toISOString(),
    expires_at: iso(30 * DAY_MS),
    revoked_at: null,
    report_toggles: null,
    reminder_30d_sent_at: null,
    reminder_7d_sent_at: null,
    ...overrides,
  };
}

describe("MENTOR_ACCESS_TIERS constants", () => {
  it("exposes the three canonical tiers in ascending order", () => {
    expect([...MENTOR_ACCESS_TIERS]).toEqual([
      "attributed_only",
      "reports_shared",
      "full_mentor",
    ]);
  });

  it("TIER_RANK covers every tier with strictly increasing ranks", () => {
    expect(TIER_RANK.attributed_only).toBe(0);
    expect(TIER_RANK.reports_shared).toBe(1);
    expect(TIER_RANK.full_mentor).toBe(2);
    const ranks = MENTOR_ACCESS_TIERS.map((t) => TIER_RANK[t]);
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeGreaterThan(ranks[i - 1]);
    }
  });

  it("CONSENT_LIFETIME_DAYS is 365 (12-month grant)", () => {
    expect(CONSENT_LIFETIME_DAYS).toBe(365);
  });

  it("EXPIRY_WARN_DAYS is [30, 7] in descending order", () => {
    expect([...EXPIRY_WARN_DAYS]).toEqual([30, 7]);
  });
});

describe("tierAtLeast", () => {
  it("returns false when the caller has no tier", () => {
    expect(tierAtLeast(null, "attributed_only")).toBe(false);
    expect(tierAtLeast(undefined, "attributed_only")).toBe(false);
  });

  it("returns true when the caller's tier equals the requirement", () => {
    expect(tierAtLeast("reports_shared", "reports_shared")).toBe(true);
  });

  it("returns true when the caller's tier is above the requirement", () => {
    expect(tierAtLeast("full_mentor", "reports_shared")).toBe(true);
    expect(tierAtLeast("full_mentor", "attributed_only")).toBe(true);
  });

  it("returns false when the caller's tier is below the requirement", () => {
    expect(tierAtLeast("attributed_only", "reports_shared")).toBe(false);
    expect(tierAtLeast("reports_shared", "full_mentor")).toBe(false);
  });
});

describe("requireTier", () => {
  it("delegates to tierAtLeast (same boolean contract)", () => {
    expect(requireTier(null, "attributed_only")).toBe(false);
    expect(requireTier("full_mentor", "reports_shared")).toBe(true);
    expect(requireTier("attributed_only", "full_mentor")).toBe(false);
    expect(requireTier("reports_shared", "reports_shared")).toBe(true);
  });
});

describe("tierLabel", () => {
  it("returns human-readable labels for every tier", () => {
    expect(tierLabel("attributed_only")).toBe("Attributed only");
    expect(tierLabel("reports_shared")).toBe("Reports shared");
    expect(tierLabel("full_mentor")).toBe("Full mentor");
  });

  it("covers every tier in MENTOR_ACCESS_TIERS with a non-empty label", () => {
    for (const t of MENTOR_ACCESS_TIERS) {
      expect(tierLabel(t)).toMatch(/\S/);
    }
  });
});

describe("tierBadgeColor", () => {
  it("maps each tier to its badge variant", () => {
    expect(tierBadgeColor("attributed_only")).toBe("default");
    expect(tierBadgeColor("reports_shared")).toBe("brand");
    expect(tierBadgeColor("full_mentor")).toBe("success");
  });

  it("only returns one of the allowed shadcn variants", () => {
    const allowed = new Set(["default", "brand", "success"]);
    for (const t of MENTOR_ACCESS_TIERS) {
      expect(allowed.has(tierBadgeColor(t))).toBe(true);
    }
  });
});

describe("tierDisclosure", () => {
  it("returns non-empty disclosure copy for every tier", () => {
    for (const t of MENTOR_ACCESS_TIERS) {
      expect(tierDisclosure(t).length).toBeGreaterThan(20);
    }
  });

  it("attributed_only copy mentions masked KPIs (no SVI / reports / cap-table)", () => {
    const copy = tierDisclosure("attributed_only");
    expect(copy).toMatch(/masked/i);
    expect(copy).toMatch(/No SVI/i);
    expect(copy).toMatch(/cap-table/i);
  });

  it("full_mentor copy is a strict superset — mentions SVI evidence + cap-table + notes", () => {
    const copy = tierDisclosure("full_mentor");
    expect(copy).toMatch(/SVI evidence/i);
    expect(copy).toMatch(/cap-table/i);
    expect(copy).toMatch(/mentor notes/i);
  });
});

describe("canViewReport", () => {
  const report = { id: "rep-1", shared_with_mentor: true };

  it("returns false when there is no grant", () => {
    expect(canViewReport(null, report)).toBe(false);
  });

  it("returns false at attributed_only even when the founder toggled sharing", () => {
    const grant = makeGrant({ tier: "attributed_only", expires_at: null });
    expect(canViewReport(grant, report)).toBe(false);
  });

  it("returns true at reports_shared when the founder toggled sharing", () => {
    const grant = makeGrant({ tier: "reports_shared" });
    expect(canViewReport(grant, report)).toBe(true);
  });

  it("returns false at full_mentor when the founder has NOT toggled sharing (toggle wins over tier)", () => {
    const grant = makeGrant({ tier: "full_mentor" });
    expect(canViewReport(grant, { id: "rep-2", shared_with_mentor: false })).toBe(false);
  });

  it("returns false when the grant is expired even at full_mentor with sharing on", () => {
    const grant = makeGrant({
      tier: "full_mentor",
      expires_at: iso(-1 * DAY_MS),
    });
    expect(canViewReport(grant, report)).toBe(false);
  });

  it("returns false when the grant is revoked", () => {
    const grant = makeGrant({ tier: "reports_shared", revoked_at: NOW.toISOString() });
    expect(canViewReport(grant, report)).toBe(false);
  });
});

describe("canViewSviEvidence", () => {
  it("returns false when there is no grant", () => {
    expect(canViewSviEvidence(null)).toBe(false);
  });

  it("returns false at attributed_only + reports_shared", () => {
    expect(
      canViewSviEvidence(makeGrant({ tier: "attributed_only", expires_at: null })),
    ).toBe(false);
    expect(canViewSviEvidence(makeGrant({ tier: "reports_shared" }))).toBe(false);
  });

  it("returns true at full_mentor when active", () => {
    expect(canViewSviEvidence(makeGrant({ tier: "full_mentor" }))).toBe(true);
  });

  it("returns false at full_mentor when expired", () => {
    const grant = makeGrant({ tier: "full_mentor", expires_at: iso(-DAY_MS) });
    expect(canViewSviEvidence(grant)).toBe(false);
  });

  it("returns false at full_mentor when revoked", () => {
    const grant = makeGrant({ tier: "full_mentor", revoked_at: NOW.toISOString() });
    expect(canViewSviEvidence(grant)).toBe(false);
  });
});

describe("canLeaveNote", () => {
  it("returns true only at full_mentor when the grant is active", () => {
    expect(canLeaveNote(null)).toBe(false);
    expect(canLeaveNote(makeGrant({ tier: "attributed_only", expires_at: null }))).toBe(false);
    expect(canLeaveNote(makeGrant({ tier: "reports_shared" }))).toBe(false);
    expect(canLeaveNote(makeGrant({ tier: "full_mentor" }))).toBe(true);
  });

  it("returns false at full_mentor when expired or revoked", () => {
    expect(
      canLeaveNote(makeGrant({ tier: "full_mentor", expires_at: iso(-DAY_MS) })),
    ).toBe(false);
    expect(
      canLeaveNote(makeGrant({ tier: "full_mentor", revoked_at: NOW.toISOString() })),
    ).toBe(false);
  });
});

describe("isExpiringSoon", () => {
  it("returns false when there is no grant or no expiry (attributed_only never expires)", () => {
    expect(isExpiringSoon(null, 30, NOW)).toBe(false);
    expect(isExpiringSoon(makeGrant({ expires_at: null }), 30, NOW)).toBe(false);
  });

  it("returns true when expiry is within the window (inclusive of the boundary)", () => {
    // Exactly `days` remaining → true per the doc contract.
    const grant = makeGrant({ expires_at: iso(30 * DAY_MS) });
    expect(isExpiringSoon(grant, 30, NOW)).toBe(true);
  });

  it("returns false when expiry is beyond the window", () => {
    const grant = makeGrant({ expires_at: iso(31 * DAY_MS) });
    expect(isExpiringSoon(grant, 30, NOW)).toBe(false);
  });

  it("returns false when the grant has already expired (separate signal)", () => {
    const grant = makeGrant({ expires_at: iso(-1 * DAY_MS) });
    expect(isExpiringSoon(grant, 30, NOW)).toBe(false);
  });

  it("returns false when the grant is revoked even if within the window", () => {
    const grant = makeGrant({
      expires_at: iso(5 * DAY_MS),
      revoked_at: NOW.toISOString(),
    });
    expect(isExpiringSoon(grant, 30, NOW)).toBe(false);
  });

  it("defaults the window to 30 days", () => {
    const grant = makeGrant({ expires_at: iso(29 * DAY_MS) });
    expect(isExpiringSoon(grant, undefined, NOW)).toBe(true);
    const outside = makeGrant({ expires_at: iso(45 * DAY_MS) });
    expect(isExpiringSoon(outside, undefined, NOW)).toBe(false);
  });
});

describe("isExpired", () => {
  it("returns false when there is no grant or no expiry", () => {
    expect(isExpired(null, NOW)).toBe(false);
    expect(isExpired(makeGrant({ expires_at: null }), NOW)).toBe(false);
  });

  it("returns true at the exact expiry boundary (<=)", () => {
    const grant = makeGrant({ expires_at: NOW.toISOString() });
    expect(isExpired(grant, NOW)).toBe(true);
  });

  it("returns true when expires_at is in the past", () => {
    expect(isExpired(makeGrant({ expires_at: iso(-1) }), NOW)).toBe(true);
  });

  it("returns false when expires_at is in the future", () => {
    expect(isExpired(makeGrant({ expires_at: iso(1) }), NOW)).toBe(false);
  });
});

describe("isEffective", () => {
  it("returns false when the grant is missing", () => {
    expect(isEffective(null, NOW)).toBe(false);
  });

  it("returns false when revoked (even before expiry)", () => {
    const grant = makeGrant({
      expires_at: iso(30 * DAY_MS),
      revoked_at: NOW.toISOString(),
    });
    expect(isEffective(grant, NOW)).toBe(false);
  });

  it("returns false when expired", () => {
    expect(isEffective(makeGrant({ expires_at: iso(-1) }), NOW)).toBe(false);
  });

  it("returns true for an active grant within its window", () => {
    expect(isEffective(makeGrant({ expires_at: iso(DAY_MS) }), NOW)).toBe(true);
  });

  it("returns true for a grant without expiry (attributed_only)", () => {
    expect(
      isEffective(makeGrant({ tier: "attributed_only", expires_at: null }), NOW),
    ).toBe(true);
  });
});

describe("tier ladder invariants across helpers", () => {
  it("canLeaveNote implies canViewSviEvidence for active grants", () => {
    for (const tier of MENTOR_ACCESS_TIERS) {
      const grant = makeGrant({ tier, expires_at: iso(DAY_MS) });
      if (canLeaveNote(grant)) {
        expect(canViewSviEvidence(grant)).toBe(true);
      }
    }
  });

  it("canViewSviEvidence implies the tier is full_mentor", () => {
    for (const tier of MENTOR_ACCESS_TIERS) {
      const grant = makeGrant({ tier, expires_at: iso(DAY_MS) });
      if (canViewSviEvidence(grant)) {
        expect(grant.tier).toBe<MentorAccessTier>("full_mentor");
      }
    }
  });
});
