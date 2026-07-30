import { describe, it, expect } from "vitest";
import {
  DISCLAIMER_VERSIONS,
  getCurrentVersion,
  isKnownDisclaimerKind,
  type DisclaimerKind,
} from "./versions";

// Canonical list mirrors the DisclaimerKind union in versions.ts. If a new
// kind is added or an existing one is renamed this list is the single point
// of drift — CI catches a stale registry before a consent-flow ships that
// stores rows against an unknown kind.
const CANONICAL_KINDS: readonly DisclaimerKind[] = [
  "tos",
  "privacy",
  "general_advice_warning",
  "wholesale_certification",
  "equity_offer_disclaimer",
  "not_financial_advice",
  "marketing",
] as const;

const VERSION_FORMAT = /^v\d+\.\d+-\d{4}-\d{2}-\d{2}$/;

describe("DISCLAIMER_VERSIONS registry integrity", () => {
  it("ships every canonical kind and no orphans", () => {
    const keys = Object.keys(DISCLAIMER_VERSIONS).sort();
    const expected = [...CANONICAL_KINDS].sort();
    expect(keys).toEqual(expected);
  });

  it("ships exactly 7 disclaimer kinds", () => {
    expect(Object.keys(DISCLAIMER_VERSIONS)).toHaveLength(7);
  });

  it("every version string matches v<major>.<minor>-<YYYY-MM-DD>", () => {
    for (const [kind, version] of Object.entries(DISCLAIMER_VERSIONS)) {
      expect(version, `${kind} version format`).toMatch(VERSION_FORMAT);
    }
  });

  it("every version's ISO date suffix parses as a real UTC calendar date", () => {
    for (const [kind, version] of Object.entries(DISCLAIMER_VERSIONS)) {
      const iso = version.slice(-10); // YYYY-MM-DD
      const parsed = Date.parse(`${iso}T00:00:00Z`);
      expect(Number.isFinite(parsed), `${kind} iso=${iso}`).toBe(true);
      // Guard against JS accepting "2026-02-30" via silent day roll-over.
      const round = new Date(parsed).toISOString().slice(0, 10);
      expect(round, `${kind} calendar round-trip`).toBe(iso);
    }
  });

  it("no version string is blank or whitespace", () => {
    for (const [kind, version] of Object.entries(DISCLAIMER_VERSIONS)) {
      expect(version.length, `${kind}`).toBeGreaterThan(0);
      expect(version.trim(), `${kind} trimmed`).toBe(version);
    }
  });

  it("every version's date is not in the future (would imply a typo)", () => {
    // Freeze against 2027-01-01 so this stays green as time progresses; the
    // intent is to catch obvious 2999-xx-xx typos, not to gate on real time.
    const upperBound = Date.parse("2027-01-01T00:00:00Z");
    for (const [kind, version] of Object.entries(DISCLAIMER_VERSIONS)) {
      const iso = version.slice(-10);
      const ts = Date.parse(`${iso}T00:00:00Z`);
      expect(ts, `${kind} iso=${iso}`).toBeLessThan(upperBound);
    }
  });

  it("tos and privacy share a version string (both bumped on 2026-07-16)", () => {
    // Not a hard rule forever, but pins the current release train — if legal
    // splits them, this assertion is the reminder to update downstream
    // consent-collection surfaces that assume one bump = one re-consent.
    expect(DISCLAIMER_VERSIONS.tos).toBe(DISCLAIMER_VERSIONS.privacy);
  });
});

describe("getCurrentVersion", () => {
  it.each(CANONICAL_KINDS)("returns the pinned version for '%s'", (kind) => {
    expect(getCurrentVersion(kind)).toBe(DISCLAIMER_VERSIONS[kind]);
  });

  it("returned value round-trips through the registry", () => {
    for (const kind of CANONICAL_KINDS) {
      const v = getCurrentVersion(kind);
      expect(v).toMatch(VERSION_FORMAT);
      expect(DISCLAIMER_VERSIONS[kind]).toBe(v);
    }
  });

  it("throws on unknown kind with a helpful message", () => {
    expect(() => getCurrentVersion("unknown_kind")).toThrow(
      /getCurrentVersion: unknown disclaimer kind 'unknown_kind'/,
    );
  });

  it("throws on empty string (never silently returns a fallback)", () => {
    expect(() => getCurrentVersion("")).toThrow(/unknown disclaimer kind/);
  });

  it("is case-sensitive: 'TOS' is not the same as 'tos'", () => {
    // Registry keys are lower_snake_case; upper-case must not resolve. This
    // pins the contract for callers that build the kind from user or DB text
    // — they must lower-case at the boundary.
    expect(() => getCurrentVersion("TOS")).toThrow(/unknown disclaimer kind/);
  });

});

describe("isKnownDisclaimerKind", () => {
  it.each(CANONICAL_KINDS)("returns true for canonical kind '%s'", (kind) => {
    expect(isKnownDisclaimerKind(kind)).toBe(true);
  });

  it("returns false for an obvious typo", () => {
    expect(isKnownDisclaimerKind("terms_of_service")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isKnownDisclaimerKind("")).toBe(false);
  });

  it("returns false for upper-case variant of a canonical kind", () => {
    expect(isKnownDisclaimerKind("TOS")).toBe(false);
    expect(isKnownDisclaimerKind("Privacy")).toBe(false);
  });

  it("returns false for kind with leading/trailing whitespace", () => {
    expect(isKnownDisclaimerKind(" tos")).toBe(false);
    expect(isKnownDisclaimerKind("tos ")).toBe(false);
  });

  it("narrows the type so callers can index DISCLAIMER_VERSIONS safely", () => {
    // Compile-time sanity via runtime shape check: after the guard, the
    // registry lookup is guaranteed to return a defined version string.
    const input: string = "not_financial_advice";
    if (isKnownDisclaimerKind(input)) {
      const v: string = DISCLAIMER_VERSIONS[input];
      expect(v).toMatch(VERSION_FORMAT);
    } else {
      throw new Error("guard should have returned true for a canonical kind");
    }
  });
});

describe("registry / guard cross-invariants", () => {
  it("every isKnownDisclaimerKind(k)=true kind resolves in getCurrentVersion", () => {
    for (const kind of CANONICAL_KINDS) {
      expect(isKnownDisclaimerKind(kind)).toBe(true);
      expect(() => getCurrentVersion(kind)).not.toThrow();
    }
  });

  it("no kind resolves to the string 'undefined' (would mask a real bug downstream)", () => {
    for (const kind of CANONICAL_KINDS) {
      expect(getCurrentVersion(kind)).not.toBe("undefined");
      expect(getCurrentVersion(kind)).not.toBe("");
    }
  });

  it("all version strings are unique-per-kind (a shared string is legal but any duplicate must be intentional)", () => {
    // Currently tos + privacy share a version. Assert the multiset only
    // contains that one intentional pair so an accidental copy-paste on a
    // new kind fires here instead of silently reusing an existing hash.
    const versions = Object.values(DISCLAIMER_VERSIONS);
    const counts = new Map<string, number>();
    for (const v of versions) counts.set(v, (counts.get(v) ?? 0) + 1);
    const duplicates = [...counts.entries()].filter(([, n]) => n > 1);
    // Only the tos/privacy shared version is expected; everything else must
    // be unique so a body_md edit forces a bumped version + re-consent.
    expect(duplicates).toHaveLength(1);
    const [sharedVersion, count] = duplicates[0]!;
    expect(count).toBe(2);
    expect(sharedVersion).toBe(DISCLAIMER_VERSIONS.tos);
    expect(sharedVersion).toBe(DISCLAIMER_VERSIONS.privacy);
  });
});
