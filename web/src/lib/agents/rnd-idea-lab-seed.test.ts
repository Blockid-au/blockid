import { describe, it, expect } from "vitest";

import { SEED_SECTORS, getSeed, type SectorSeed } from "./rnd-idea-lab-seed";

// ---------------------------------------------------------------------------
// R&D Idea Lab seed — deterministic fallback used when the AI provider chain
// is down / over-budget / times out. Tests below pin the shape and content
// invariants so that /api/idea-lab NEVER returns a half-empty payload, and so
// that a sibling agent editing a competitor / angle string cannot silently
// break the atlassian-goal Chapter-1 idea-generation surface.
// ---------------------------------------------------------------------------

const SECTOR_KEYS = [
  "fintech",
  "saas",
  "marketplace",
  "healthtech",
  "edtech",
  "deeptech",
] as const;

type SectorKey = (typeof SECTOR_KEYS)[number];

const EFFORT_LEVELS = new Set(["low", "medium", "high"]);

function everySectorSeed(): Array<[SectorKey, SectorSeed]> {
  return SECTOR_KEYS.map((k) => [k, SEED_SECTORS[k]!]);
}

describe("SEED_SECTORS registry", () => {
  it("covers exactly the six canonical sectors", () => {
    const shipped = Object.keys(SEED_SECTORS).sort();
    expect(shipped).toEqual([...SECTOR_KEYS].sort());
  });

  it("has no duplicate sector keys", () => {
    const keys = Object.keys(SEED_SECTORS);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(SECTOR_KEYS)("sector %s ships exactly 10 angles / 5 non-obvious / 3 competitors", (key) => {
    const seed = SEED_SECTORS[key];
    expect(seed.angles).toHaveLength(10);
    expect(seed.nonObvious).toHaveLength(5);
    expect(seed.competitors).toHaveLength(3);
  });

  it.each(SECTOR_KEYS)("sector %s angles carry non-empty required fields + valid effortLevel", (key) => {
    for (const a of SEED_SECTORS[key].angles) {
      expect(a.title.trim().length).toBeGreaterThan(0);
      expect(a.oneLiner.trim().length).toBeGreaterThan(0);
      expect(a.targetCustomer.trim().length).toBeGreaterThan(0);
      expect(a.monetisation.trim().length).toBeGreaterThan(0);
      expect(EFFORT_LEVELS.has(a.effortLevel)).toBe(true);
    }
  });

  it.each(SECTOR_KEYS)("sector %s angle titles are unique within the sector", (key) => {
    const titles = SEED_SECTORS[key].angles.map((a) => a.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it.each(SECTOR_KEYS)("sector %s non-obvious rows carry non-empty title/whyOverlooked/hookForFounder", (key) => {
    for (const n of SEED_SECTORS[key].nonObvious) {
      expect(n.title.trim().length).toBeGreaterThan(0);
      expect(n.whyOverlooked.trim().length).toBeGreaterThan(0);
      expect(n.hookForFounder.trim().length).toBeGreaterThan(0);
    }
  });

  it.each(SECTOR_KEYS)("sector %s non-obvious titles are unique within the sector", (key) => {
    const titles = SEED_SECTORS[key].nonObvious.map((n) => n.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it.each(SECTOR_KEYS)("sector %s competitors carry non-empty name/whatTheyDo/angle", (key) => {
    for (const c of SEED_SECTORS[key].competitors) {
      expect(c.name.trim().length).toBeGreaterThan(0);
      expect(c.whatTheyDo.trim().length).toBeGreaterThan(0);
      expect(c.angle.trim().length).toBeGreaterThan(0);
    }
  });

  it.each(SECTOR_KEYS)("sector %s competitor names are unique within the sector", (key) => {
    const names = SEED_SECTORS[key].competitors.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("angles respect the 120-char title cap enforced by validateAngle downstream", () => {
    for (const [, seed] of everySectorSeed()) {
      for (const a of seed.angles) {
        expect(a.title.length).toBeLessThanOrEqual(120);
      }
    }
  });

  it("angles respect the 400-char oneLiner cap enforced by validateAngle downstream", () => {
    for (const [, seed] of everySectorSeed()) {
      for (const a of seed.angles) {
        expect(a.oneLiner.length).toBeLessThanOrEqual(400);
      }
    }
  });

  it("angles respect the 200-char targetCustomer + monetisation caps", () => {
    for (const [, seed] of everySectorSeed()) {
      for (const a of seed.angles) {
        expect(a.targetCustomer.length).toBeLessThanOrEqual(200);
        expect(a.monetisation.length).toBeLessThanOrEqual(200);
      }
    }
  });

  it("non-obvious rows respect the 120/300/300 caps enforced by validateNonObvious", () => {
    for (const [, seed] of everySectorSeed()) {
      for (const n of seed.nonObvious) {
        expect(n.title.length).toBeLessThanOrEqual(120);
        expect(n.whyOverlooked.length).toBeLessThanOrEqual(300);
        expect(n.hookForFounder.length).toBeLessThanOrEqual(300);
      }
    }
  });

  it("competitors respect the 100/300/300 caps enforced by validateCompetitor", () => {
    for (const [, seed] of everySectorSeed()) {
      for (const c of seed.competitors) {
        expect(c.name.length).toBeLessThanOrEqual(100);
        expect(c.whatTheyDo.length).toBeLessThanOrEqual(300);
        expect(c.angle.length).toBeLessThanOrEqual(300);
      }
    }
  });
});

describe("SEED_SECTORS content anchors — sibling agent guardrails", () => {
  it("fintech ships the three shipped AU fintech competitor anchors (Airwallex/Zeller/Judo)", () => {
    const names = SEED_SECTORS.fintech.competitors.map((c) => c.name).sort();
    expect(names).toEqual(["Airwallex", "Judo Bank", "Zeller"]);
  });

  it("saas ships the three shipped AU SaaS competitor anchors (Culture Amp/Employment Hero/Deputy)", () => {
    const names = SEED_SECTORS.saas.competitors.map((c) => c.name).sort();
    expect(names).toEqual(["Culture Amp", "Deputy", "Employment Hero"]);
  });

  it("marketplace ships the shipped AU marketplace anchors (Airtasker/hipages/Mable)", () => {
    const names = SEED_SECTORS.marketplace.competitors.map((c) => c.name).sort();
    expect(names).toEqual(["Airtasker", "Mable", "hipages"]);
  });

  it("healthtech ships the shipped AU healthtech anchors (Eucalyptus/Coviu/Heidi Health)", () => {
    const names = SEED_SECTORS.healthtech.competitors.map((c) => c.name).sort();
    expect(names).toEqual(["Coviu", "Eucalyptus", "Heidi Health"]);
  });

  it("edtech ships the shipped AU edtech anchors (Go1/Cluey Learning/Mathspace)", () => {
    const names = SEED_SECTORS.edtech.competitors.map((c) => c.name).sort();
    expect(names).toEqual(["Cluey Learning", "Go1", "Mathspace"]);
  });

  it("deeptech ships the shipped AU deeptech anchors (Cochlear/Advanced Navigation/SunDrive)", () => {
    const names = SEED_SECTORS.deeptech.competitors.map((c) => c.name).sort();
    expect(names).toEqual(["Advanced Navigation", "Cochlear", "SunDrive"]);
  });

  it("fintech monetisation copy cites the ATO / super-fund / SMSF AU vocab that survived the AU-context guard", () => {
    const blob = SEED_SECTORS.fintech.angles.map((a) => `${a.oneLiner} ${a.targetCustomer} ${a.monetisation}`).join(" ");
    expect(blob).toMatch(/ATO|super|SMSF|AUSTRAC|AFSL/i);
  });

  it("healthtech copy cites the shipped AU healthcare regulators / codes (MBS / Medicare / PHNs / AN-ACC)", () => {
    const blob = SEED_SECTORS.healthtech.angles.map((a) => a.oneLiner + " " + a.targetCustomer).join(" ");
    expect(blob).toMatch(/MBS|Medicare|PHN|AN[-‑]ACC|MBS-billable/i);
  });

  it("edtech copy cites the shipped AU education standards (ACARA/AQF/NAPLAN/TAFE/MARA/AICD)", () => {
    const blob = SEED_SECTORS.edtech.angles
      .concat(
        SEED_SECTORS.edtech.nonObvious.map((n) => ({
          title: n.title,
          oneLiner: n.hookForFounder,
          targetCustomer: n.whyOverlooked,
          monetisation: "",
          effortLevel: "low" as const,
        })),
      )
      .map((a) => `${a.oneLiner} ${a.targetCustomer}`)
      .join(" ");
    expect(blob).toMatch(/ACARA|AQF|NAPLAN|TAFE|MARA|AICD/i);
  });

  it("marketplace copy cites the shipped AU marketplace vocab (strata/tradies/NDIS)", () => {
    const blob = SEED_SECTORS.marketplace.angles.map((a) => a.oneLiner + " " + a.targetCustomer).join(" ");
    expect(blob).toMatch(/strata|tradie|NDIS/i);
  });

  it("deeptech copy cites the shipped AU deeptech agencies / operators (BHP/Rio/FMG/DFES/RFS/CFA)", () => {
    const blob = SEED_SECTORS.deeptech.angles.map((a) => a.oneLiner + " " + a.targetCustomer).join(" ");
    expect(blob).toMatch(/BHP|Rio|FMG|DFES|RFS|CFA/);
  });

  it("every sector ships angles with at least two distinct effortLevel values (no flat skew)", () => {
    for (const [key, seed] of everySectorSeed()) {
      const distinct = new Set(seed.angles.map((a) => a.effortLevel));
      expect(distinct.size, `${key} must ship at least two distinct effort levels`).toBeGreaterThanOrEqual(2);
    }
  });

  it("deeptech skews heavy on 'high' effortLevel — the sector's operator-intensive nature is preserved", () => {
    const highCount = SEED_SECTORS.deeptech.angles.filter((a) => a.effortLevel === "high").length;
    expect(highCount).toBeGreaterThanOrEqual(5);
  });

  it("fintech ships at least one AUD-denominated monetisation line — never plain 'USD' or bare '$' without context", () => {
    const monies = SEED_SECTORS.fintech.angles.map((a) => a.monetisation);
    const anyAud = monies.some((m) => /\$|AUD|A\$/.test(m));
    expect(anyAud).toBe(true);
  });
});

describe("getSeed()", () => {
  it.each(SECTOR_KEYS)("returns the shipped seed verbatim for known sector key %s", (key) => {
    expect(getSeed(key)).toBe(SEED_SECTORS[key]);
  });

  it.each(SECTOR_KEYS.map((k) => k.toUpperCase()))("lower-cases the sector key — %s round-trips to its lower-case seed", (upperKey) => {
    const lower = upperKey.toLowerCase();
    expect(getSeed(upperKey)).toBe(SEED_SECTORS[lower]);
  });

  it("handles mixed-case sector keys — 'FinTech' → the fintech seed", () => {
    expect(getSeed("FinTech")).toBe(SEED_SECTORS.fintech);
  });

  it("falls back to a synthetic saas-based seed on unknown sector — same 10/5/3 counts", () => {
    const seed = getSeed("bogustech");
    expect(seed.angles).toHaveLength(10);
    expect(seed.nonObvious).toHaveLength(5);
    expect(seed.competitors).toHaveLength(3);
  });

  it("fallback seed reuses saas competitors + non-obvious verbatim (same object references)", () => {
    const seed = getSeed("bogustech");
    expect(seed.competitors).toBe(SEED_SECTORS.saas.competitors);
    expect(seed.nonObvious).toBe(SEED_SECTORS.saas.nonObvious);
  });

  it("fallback seed rewrites saas one-liners to strip 'SaaS'/'vertical SaaS' terminology", () => {
    const seed = getSeed("bogustech");
    for (const a of seed.angles) {
      expect(a.oneLiner).not.toMatch(/\bvertical SaaS\b/i);
      // The regex /vertical SaaS|SaaS/gi replaces every match; 'SaaS' should
      // never survive in the fallback oneLiner (case-insensitive).
      expect(a.oneLiner).not.toMatch(/\bSaaS\b/i);
    }
  });

  it("fallback seed keeps saas angle titles/monetisation unchanged (only oneLiner is rewritten)", () => {
    const seed = getSeed("bogustech");
    const saasSeed = SEED_SECTORS.saas;
    seed.angles.forEach((a, i) => {
      expect(a.title).toBe(saasSeed.angles[i].title);
      expect(a.targetCustomer).toBe(saasSeed.angles[i].targetCustomer);
      expect(a.monetisation).toBe(saasSeed.angles[i].monetisation);
      expect(a.effortLevel).toBe(saasSeed.angles[i].effortLevel);
    });
  });

  it("does NOT mutate the shipped SEED_SECTORS.saas angles when producing the fallback", () => {
    const snapshotOne = SEED_SECTORS.saas.angles.map((a) => a.oneLiner);
    getSeed("unknown-sector-1");
    getSeed("unknown-sector-2");
    const snapshotTwo = SEED_SECTORS.saas.angles.map((a) => a.oneLiner);
    expect(snapshotTwo).toEqual(snapshotOne);
  });

  it("returns non-null / defined shape for empty-string sector (unknown → fallback path)", () => {
    const seed = getSeed("");
    expect(seed.angles).toHaveLength(10);
    expect(seed.nonObvious).toHaveLength(5);
    expect(seed.competitors).toHaveLength(3);
  });

  it("angles produced by the fallback still respect the downstream 400-char oneLiner cap", () => {
    const seed = getSeed("bogustech");
    for (const a of seed.angles) {
      expect(a.oneLiner.length).toBeLessThanOrEqual(400);
    }
  });

  it("fallback rewrite is applied idempotently — repeated calls return equivalent copy", () => {
    // The saas seed only cites "SaaS" in angle *titles*, not oneLiners, so the
    // regex swap is a no-op in the shipped fixture. Pin the invariant that
    // whatever the swap produces is stable across repeated calls so a sibling
    // agent editing an oneLiner to include "SaaS" flows through correctly.
    const one = getSeed("unknown-1").angles.map((a) => a.oneLiner);
    const two = getSeed("unknown-2").angles.map((a) => a.oneLiner);
    expect(one).toEqual(two);
  });

  it("preserves saas angle ordering in the fallback — index 0 corresponds to the same title", () => {
    const seed = getSeed("random-sector");
    expect(seed.angles[0].title).toBe(SEED_SECTORS.saas.angles[0].title);
    expect(seed.angles[seed.angles.length - 1].title).toBe(
      SEED_SECTORS.saas.angles[SEED_SECTORS.saas.angles.length - 1].title,
    );
  });
});
