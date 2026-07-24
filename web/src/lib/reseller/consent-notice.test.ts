// P10 au-compliance gate — E.1 collection notice review + APP 5.2 (a)–(j)
// coverage check.
//
// Locks in the P10_hardening exit criterion "au-compliance: E.1 EN + VI
// notice reviewed, APP 5.2 coverage confirmed" so a future edit that drops
// any of the ten APP 5.2 clauses trips CI at the same time as R-01..R-09.

import { describe, it, expect } from "vitest";

import {
  APP_5_2_CLAUSES,
  CONSENT_NOTICE_STRINGS,
  auditApp52Coverage,
} from "./consent-notice";

const RESELLER = "InfoVision";

describe("consent-notice — EN + VI shape parity", () => {
  it("EN and VI expose the same key set", () => {
    const enKeys = Object.keys(CONSENT_NOTICE_STRINGS.en).sort();
    const viKeys = Object.keys(CONSENT_NOTICE_STRINGS.vi).sort();
    expect(viKeys).toEqual(enKeys);
  });

  it("every locale value is defined (no undefined fall-through in the modal)", () => {
    for (const locale of ["en", "vi"] as const) {
      for (const [key, val] of Object.entries(CONSENT_NOTICE_STRINGS[locale])) {
        expect(val, `${locale}.${key} defined`).toBeDefined();
        const t = typeof val;
        expect(t === "string" || t === "function", `${locale}.${key} is string|function`).toBe(true);
      }
    }
  });

  it("body renders successfully with the reseller name substituted", () => {
    for (const locale of ["en", "vi"] as const) {
      const body = CONSENT_NOTICE_STRINGS[locale].body(RESELLER);
      expect(body).toContain(RESELLER);
      // U.15.7 says ~220 words. Rough length guard: 800 chars < body < 3000.
      expect(body.length).toBeGreaterThan(800);
      expect(body.length).toBeLessThan(3000);
    }
  });

  it("does not accidentally hard-code a specific reseller into the body", () => {
    // Body must be parametrised (multi-reseller readiness). Rendering with a
    // clearly-distinct name should reflect that name — no literal "InfoVision"
    // leaking through when the caller passed something else.
    const body = CONSENT_NOTICE_STRINGS.en.body("Acme Partners");
    expect(body).toContain("Acme Partners");
    expect(body).not.toContain("InfoVision");
  });
});

describe("consent-notice — APP 5.2 (a)–(j) coverage", () => {
  it("APP_5_2_CLAUSES has exactly the ten clauses (a)–(j)", () => {
    expect(APP_5_2_CLAUSES).toEqual(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]);
  });

  it("EN body covers every APP 5.2 clause", () => {
    const body = CONSENT_NOTICE_STRINGS.en.body(RESELLER);
    const coverage = auditApp52Coverage(body);
    for (const clause of APP_5_2_CLAUSES) {
      expect(coverage[clause], `EN clause (${clause}) covered`).toBe(true);
    }
  });

  it("VI body covers every APP 5.2 clause", () => {
    const body = CONSENT_NOTICE_STRINGS.vi.body(RESELLER);
    const coverage = auditApp52Coverage(body);
    for (const clause of APP_5_2_CLAUSES) {
      expect(coverage[clause], `VI clause (${clause}) covered`).toBe(true);
    }
  });

  it("auditApp52Coverage returns false for a stripped notice", () => {
    // Sanity check: the audit is not a rubber-stamp — dropping clause markers
    // must actually flip results to false.
    const stripped = "This is not a compliant notice.";
    const coverage = auditApp52Coverage(stripped);
    expect(coverage.a).toBe(false);
    expect(coverage.b).toBe(false);
    expect(coverage.d).toBe(false);
    expect(coverage.g).toBe(false);
    expect(coverage.h).toBe(false);
    expect(coverage.i).toBe(false);
  });

  it("Auschain identity + ACN present in both locales (APP 5.2 (a))", () => {
    for (const locale of ["en", "vi"] as const) {
      const body = CONSENT_NOTICE_STRINGS[locale].body(RESELLER);
      expect(body).toContain("Auschain PTY LTD");
      expect(body).toContain("ACN 659 615 111");
    }
  });

  it("OAIC complaint path present in both locales (APP 5.2 (g)/(h))", () => {
    for (const locale of ["en", "vi"] as const) {
      const body = CONSENT_NOTICE_STRINGS[locale].body(RESELLER);
      expect(body.toLowerCase()).toContain("oaic");
      expect(body).toContain("privacy@blockid.au");
    }
  });

  it("overseas-processing disclosure present in both locales (APP 5.2 (i)/(j))", () => {
    const en = CONSENT_NOTICE_STRINGS.en.body(RESELLER);
    const vi = CONSENT_NOTICE_STRINGS.vi.body(RESELLER);
    expect(en).toContain("Stripe (US)");
    expect(vi).toContain("Stripe (Mỹ)");
  });
});
