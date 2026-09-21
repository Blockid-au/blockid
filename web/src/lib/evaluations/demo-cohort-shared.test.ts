// demo-cohort-shared (G24-C) — the fixture is fictional and ABN-free, the
// scorer is pure + deterministic over the demo register, the L1–L5 spread
// holds, exactly one conflicting claim and one stale connector exist, and
// the labels resolve from both catalogues.

import { describe, expect, it } from "vitest";
import en from "@/lib/i18n/messages/en.json";
import vi from "@/lib/i18n/messages/vi.json";
import { DIMENSION_KEYS } from "./batch-shared";
import {
  DEMO_COHORT_LABELS_EN,
  DEMO_COHORT_LABEL_KEYS,
  DEMO_COHORT_SIZE,
  DEMO_PROJECT_SLUG_PREFIX,
  DEMO_STARTUPS,
  buildDemoCohortItems,
  demoCohortLabels,
  demoProjectSlug,
  demoStartupForSlug,
  exportCohortName,
  type DemoRegisterInput,
} from "./demo-cohort-shared";

const REGISTER: DemoRegisterInput = {
  dims: { ftv: 83, mpc: 75, ptd: 78, tre: 78, cgh: 75, iri: 75, lco: 81, svm: 65 },
  evidenceRows: [
    { evidence_id: "ev-connected-revenue-stripe", dims: ["tre", "iri", "cgh"], status: "evidenced", confidence: "transaction_data" },
    { evidence_id: "ev-connected-xero-pnl", dims: ["tre", "cgh", "iri"], status: "evidenced", confidence: "transaction_data" },
    { evidence_id: "ev-connected-ga4-acquisition", dims: ["mpc", "tre"], status: "evidenced", confidence: "connected_source" },
    { evidence_id: "ev-market-anchor-abs", dims: ["mpc", "svm", "tre"], status: "evidenced", confidence: "public_url" },
    { evidence_id: "ev-hub-data-room", dims: ["iri", "cgh", "lco"], status: "evidenced", confidence: "connected_source" },
    { evidence_id: "ev-cap-table-demo", dims: ["cgh", "iri", "lco"], status: "evidenced", confidence: "connected_source" },
    { evidence_id: "ev-tech-audit-demo", dims: ["ptd", "svm", "lco"], status: "evidenced", confidence: "public_url" },
    { evidence_id: "ev-hub-lco-ip-assignment", dims: ["lco"], status: "evidenced", confidence: "third_party_verified" },
    { evidence_id: "ev-missing-repo-audit", dims: ["ptd", "ftv"], status: "missing" },
    { evidence_id: "ev-missing-founder-signals", dims: ["ftv"], status: "missing" },
  ],
};

describe("DEMO_STARTUPS — fictional, labelled, spread", () => {
  it("five startups, every name ends in (demo), no ABN field anywhere, unique keys", () => {
    expect(DEMO_COHORT_SIZE).toBe(5);
    expect(new Set(DEMO_STARTUPS.map((s) => s.key)).size).toBe(5);
    for (const s of DEMO_STARTUPS) {
      expect(s.name.endsWith("(demo)"), s.name).toBe(true);
      expect(JSON.stringify(s)).not.toMatch(/abn/i);
      expect(s.evidenceIds.every((id) => REGISTER.evidenceRows.some((r) => r.evidence_id === id && r.status === "evidenced"))).toBe(true);
    }
  });

  it("verification levels cover L1–L5 exactly once; exactly one conflicting claim and one stale connector", () => {
    expect([...DEMO_STARTUPS.map((s) => s.verificationLevel)].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(DEMO_STARTUPS.filter((s) => s.conflictingClaims > 0)).toHaveLength(1);
    expect(DEMO_STARTUPS.filter((s) => s.staleConnector != null)).toHaveLength(1);
    // Not the same startup — two distinct risk stories for the compare drawer.
    const conflict = DEMO_STARTUPS.find((s) => s.conflictingClaims > 0)!;
    const stale = DEMO_STARTUPS.find((s) => s.staleConnector)!;
    expect(conflict.key).not.toBe(stale.key);
  });

  it("slug round-trip: demoProjectSlug ↔ demoStartupForSlug, with and without a collision suffix; foreign slugs → null", () => {
    for (const s of DEMO_STARTUPS) {
      expect(demoProjectSlug(s.key)).toBe(`${DEMO_PROJECT_SLUG_PREFIX}${s.key}`);
      expect(demoStartupForSlug(demoProjectSlug(s.key))?.key).toBe(s.key);
      expect(demoStartupForSlug(`${demoProjectSlug(s.key)}-2`)?.key).toBe(s.key);
    }
    expect(demoStartupForSlug("acme-robotics")).toBeNull();
    expect(demoStartupForSlug("demo-cohort-unknown")).toBeNull();
    expect(demoStartupForSlug(null)).toBeNull();
  });

  it("G25-B name check: no coinage collides with a real AU business (Wattlebyte / Pelicanpay replaced); legacy slugs still resolve", () => {
    const names = DEMO_STARTUPS.map((s) => s.name.toLowerCase());
    for (const banned of ["wattlebyte", "wattle byte", "pelicanpay", "pelican pay"]) {
      expect(names.some((n) => n.includes(banned))).toBe(false);
    }
    expect(DEMO_STARTUPS.map((s) => s.key)).toEqual(["banksiabyte", "coralwind", "numbatpay", "brolgafield", "emberquay"]);
    // Demo projects created before the rename keep their old slug — the fixture still resolves.
    expect(demoStartupForSlug("demo-cohort-wattlebyte")?.key).toBe("banksiabyte");
    expect(demoStartupForSlug("demo-cohort-pelicanpay-2")?.key).toBe("numbatpay");
    for (const s of DEMO_STARTUPS) expect(s.name.endsWith("(demo)")).toBe(true);
  });
});

describe("exportCohortName", () => {
  it("labels a demo cohort's exports and leaves a real cohort's name alone", () => {
    expect(exportCohortName({ name: "Demo cohort", isDemo: true })).toBe("Demo cohort — Demo data (fictional)");
    expect(exportCohortName({ name: "Spring 2026" })).toBe("Spring 2026");
    expect(exportCohortName({ name: "Spring 2026", isDemo: false })).toBe("Spring 2026");
  });
});

describe("buildDemoCohortItems — pure + deterministic from the register", () => {
  it("returns the pinned scores (same register → same cohort, every dimension 5..98, SVI = mean of the 8)", () => {
    const items = buildDemoCohortItems(REGISTER);
    const again = buildDemoCohortItems(REGISTER);
    expect(items).toEqual(again);
    expect(items.map((i) => [i.fixture.key, i.sviTotal, i.evidenceConfidence])).toEqual([
      ["banksiabyte", 76, 95],
      ["coralwind", 59, 55],
      ["numbatpay", 59, 50],
      ["brolgafield", 66, 73],
      ["emberquay", 47, 30],
    ]);
    for (const it of items) {
      for (const k of DIMENSION_KEYS) {
        expect(it.dimensionScores[k]).toBeGreaterThanOrEqual(5);
        expect(it.dimensionScores[k]).toBeLessThanOrEqual(98);
      }
      const mean = Math.round(DIMENSION_KEYS.reduce((a, k) => a + it.dimensionScores[k], 0) / 8);
      expect(it.sviTotal).toBe(mean);
    }
  });

  it("more register rows held → more evidence rows and a higher confidence; the reference profile holds every evidenced row", () => {
    const items = buildDemoCohortItems(REGISTER);
    const byKey = Object.fromEntries(items.map((i) => [i.fixture.key, i]));
    expect(byKey.banksiabyte.evidence.length).toBeGreaterThan(byKey.coralwind.evidence.length);
    expect(byKey.coralwind.evidence.length).toBeGreaterThan(byKey.emberquay.evidence.length);
    expect(byKey.banksiabyte.evidenceConfidence).toBeGreaterThan(byKey.emberquay.evidenceConfidence);
    expect(byKey.emberquay.evidence.length).toBeGreaterThan(0);
    // Evidence rows carry the register's confidence rung and a real catalogue code.
    for (const e of byKey.banksiabyte.evidence) {
      expect(DIMENSION_KEYS).toContain(e.dimension);
      expect(e.evidence_type).toMatch(/^[a-z_0-9]+$/);
      expect(["public_url", "connected_source", "transaction_data", "third_party_verified", null]).toContain(e.confidence_level);
    }
  });

  it("the conflicting claim and the stale connector reach the item and its note; every note says the data is fictional", () => {
    const items = buildDemoCohortItems(REGISTER);
    const conflict = items.find((i) => i.conflictingClaims > 0)!;
    const stale = items.find((i) => i.staleConnector)!;
    expect(conflict.fixture.key).toBe("numbatpay");
    expect(conflict.notes).toMatch(/Conflicting claim/);
    expect(stale.fixture.key).toBe("coralwind");
    expect(stale.notes).toMatch(/Stale connector: xero/);
    for (const it of items) expect(it.notes).toMatch(/^Demo data — fictional/);
  });

  it("an empty register still yields five items (base 50 × coverage floor) — never throws", () => {
    const items = buildDemoCohortItems({ dims: {}, evidenceRows: [] });
    expect(items).toHaveLength(5);
    for (const it of items) expect(it.sviTotal).toBeGreaterThan(0);
  });
});

describe("demoCohortLabels — EN + VI through the catalogue", () => {
  const EN = en as Record<string, string>;
  const VI = vi as Record<string, string>;

  it("every demoCohort.* key exists in both catalogues and equals the EN fallback object", () => {
    for (const [field, key] of Object.entries(DEMO_COHORT_LABEL_KEYS)) {
      expect(EN[key], `en ${key}`).toBeTruthy();
      expect(VI[key], `vi ${key}`).toBeTruthy();
      expect(EN[key]).toBe(DEMO_COHORT_LABELS_EN[field as keyof typeof DEMO_COHORT_LABELS_EN]);
    }
    expect(demoCohortLabels(EN)).toEqual(DEMO_COHORT_LABELS_EN);
  });

  it("the VI catalogue renders Vietnamese copy for the chip and the CTA; a missing key falls back to EN", () => {
    const labels = demoCohortLabels(VI, EN);
    expect(labels.chip).not.toBe(DEMO_COHORT_LABELS_EN.chip);
    expect(labels.load).not.toBe(DEMO_COHORT_LABELS_EN.load);
    const partial = demoCohortLabels({ "demoCohort.chip": "Dữ liệu demo — hư cấu" }, EN);
    expect(partial.chip).toBe("Dữ liệu demo — hư cấu");
    expect(partial.load).toBe(DEMO_COHORT_LABELS_EN.load);
  });
});
