import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// translations — colocated tests for the previously-untested pure
// `src/lib/translations.ts` — the EN/VI i18n dictionary + `tx(key, locale)`
// lookup used by workspace shell components, email templates and PDF/report
// section headings. A silent drift in a translation key (removed, renamed,
// or missing a Vietnamese counterpart) would leak straight into the founder
// UI + weekly-digest email surfaces, so this suite pins:
//   1. Locale-key structural parity (every EN key resolves in VI and back).
//   2. Individual copy anchors used by dashboard nav + report shell + emails.
//   3. `tx()` fallback semantics — unknown locale, unknown key, empty inputs.
//   4. Type-shape invariants (readonly const, string-typed values only).
// ---------------------------------------------------------------------------

import { t, tx, type Locale, type TranslationKey } from "./translations";

const ALL_KEYS = Object.keys(t.en) as TranslationKey[];
const EN_KEYS = new Set(Object.keys(t.en));
const VI_KEYS = new Set(Object.keys(t.vi));

describe("translations · dictionary shape", () => {
  it("exposes exactly two locales — en + vi", () => {
    expect(Object.keys(t).sort()).toEqual(["en", "vi"]);
  });

  it("exports a non-empty EN dictionary", () => {
    expect(ALL_KEYS.length).toBeGreaterThanOrEqual(60);
  });

  it("has 1:1 locale parity — every EN key exists in VI", () => {
    const missingInVi = ALL_KEYS.filter((k) => !VI_KEYS.has(k));
    expect(missingInVi).toEqual([]);
  });

  it("has 1:1 locale parity — every VI key exists in EN (no orphan VI copy)", () => {
    const orphanVi = [...VI_KEYS].filter((k) => !EN_KEYS.has(k));
    expect(orphanVi).toEqual([]);
  });

  it("all EN values are non-empty strings", () => {
    for (const k of ALL_KEYS) {
      expect(typeof t.en[k]).toBe("string");
      expect(t.en[k].length).toBeGreaterThan(0);
    }
  });

  it("all VI values are non-empty strings", () => {
    for (const k of ALL_KEYS) {
      expect(typeof t.vi[k]).toBe("string");
      expect(t.vi[k].length).toBeGreaterThan(0);
    }
  });

  it("no accidental duplicate EN values across unrelated keys of different meaning", () => {
    // Some duplicates are legitimate (e.g. same word both nav + verb).
    // This test just protects against gross accidents like every value = "Save".
    const counts: Record<string, number> = {};
    for (const k of ALL_KEYS) counts[t.en[k]] = (counts[t.en[k]] ?? 0) + 1;
    const maxDup = Math.max(...Object.values(counts));
    expect(maxDup).toBeLessThanOrEqual(3);
  });
});

describe("translations · dashboard + workspace nav (EN)", () => {
  it("dashboard → 'Dashboard'", () => {
    expect(t.en.dashboard).toBe("Dashboard");
  });
  it("evidenceVault → 'Evidence Vault'", () => {
    expect(t.en.evidenceVault).toBe("Evidence Vault");
  });
  it("dataRoom → 'Data Room'", () => {
    expect(t.en.dataRoom).toBe("Data Room");
  });
  it("capTable → 'Cap Table'", () => {
    expect(t.en.capTable).toBe("Cap Table");
  });
  it("weeklyReports → 'Weekly Reports'", () => {
    expect(t.en.weeklyReports).toBe("Weekly Reports");
  });
  it("roadmap → 'Growth Roadmap'", () => {
    expect(t.en.roadmap).toBe("Growth Roadmap");
  });
  it("billing → 'Billing'", () => {
    expect(t.en.billing).toBe("Billing");
  });
  it("profile → 'My Profile'", () => {
    expect(t.en.profile).toBe("My Profile");
  });
  it("signIn / signOut anchor the auth CTA copy", () => {
    expect(t.en.signIn).toBe("Sign in");
    expect(t.en.signOut).toBe("Sign out");
  });
});

describe("translations · SVI dimensions (EN + VI)", () => {
  const svi: TranslationKey[] = [
    "founderTeam",
    "marketProblem",
    "productTech",
    "tractionRevenue",
    "capTableGov",
    "investorReady",
    "legalCompliance",
    "visionMoat",
  ];

  it("all 8 SVI dimension keys are present", () => {
    for (const k of svi) {
      expect(t.en[k]).toBeTruthy();
      expect(t.vi[k]).toBeTruthy();
    }
  });

  it("founderTeam mirrors the SVI report column heading", () => {
    expect(t.en.founderTeam).toBe("Founder & Team");
  });

  it("VI SVI copy carries diacritics (proper Vietnamese, not ASCII stub)", () => {
    // At least one of the 8 dimensions must contain a diacritic character.
    const anyDiacritic = svi.some((k) => /[àáâãèéêìíòóôõùúýăâđêôơư]/i.test(t.vi[k]));
    expect(anyDiacritic).toBe(true);
  });
});

describe("translations · report section headings", () => {
  it("executiveSummary EN + VI pin the report cover section", () => {
    expect(t.en.executiveSummary).toBe("Executive Summary");
    expect(t.vi.executiveSummary).toContain("Tóm");
  });
  it("actionPlan / nextSteps / riskAssessment anchor the coaching sections", () => {
    expect(t.en.actionPlan).toBe("Action Plan");
    expect(t.en.nextSteps).toBe("Next Steps");
    expect(t.en.riskAssessment).toBe("Risk Assessment");
  });
  it("biggestOpportunity + growthPlan mirror the 30-day plan copy", () => {
    expect(t.en.biggestOpportunity).toContain("Biggest Opportunity");
    expect(t.en.growthPlan).toContain("30-Day");
  });
  it("investorReadinessCheck / yourNextStep pin the founder-facing tiles", () => {
    expect(t.en.investorReadinessCheck).toBe("Investor Readiness Check");
    expect(t.en.yourNextStep).toBe("Your Next Step");
  });
});

describe("translations · R&D report page titles", () => {
  const rnd: TranslationKey[] = [
    "reportMarketProblem",
    "reportProductTech",
    "reportBusinessModel",
    "reportCompetitionMoat",
    "reportTractionGrowth",
    "reportTeamExecution",
    "reportFinancialProjections",
    "reportRecommendations",
  ];
  it("all 8 R&D report page-title keys are present in both locales", () => {
    for (const k of rnd) {
      expect(t.en[k]).toBeTruthy();
      expect(t.vi[k]).toBeTruthy();
    }
  });
  it("reportFinancialProjections EN pins CFO PDF export", () => {
    expect(t.en.reportFinancialProjections).toBe("Financial Projections");
  });
});

describe("translations · SVI stages (Concept → Corporation)", () => {
  const stages: TranslationKey[] = [
    "concept",
    "validatedIdea",
    "mvp",
    "earlyTraction",
    "revenue",
    "growth",
    "scale",
    "corporation",
  ];

  it("all 8 stage labels exist in both locales", () => {
    for (const k of stages) {
      expect(t.en[k]).toBeTruthy();
      expect(t.vi[k]).toBeTruthy();
    }
  });

  it("stages progress from Concept → Corporation in EN", () => {
    expect(t.en.concept).toBe("Concept");
    expect(t.en.corporation).toBe("Corporation");
  });
});

describe("translations · common action verbs", () => {
  const actions: Array<[TranslationKey, string]> = [
    ["save", "Save"],
    ["cancel", "Cancel"],
    ["delete", "Delete"],
    ["edit", "Edit"],
    ["share", "Share"],
    ["copy", "Copy"],
    ["search", "Search"],
    ["filter", "Filter"],
    ["sortBy", "Sort by"],
    ["loading", "Loading..."],
    ["noData", "No data available"],
  ];
  for (const [key, en] of actions) {
    it(`${key} → '${en}' in EN, non-empty in VI`, () => {
      expect(t.en[key]).toBe(en);
      expect(t.vi[key].length).toBeGreaterThan(0);
    });
  }
});

describe("translations · email + weekly-digest copy", () => {
  it("viewFullReport, signInDashboard, viewDashboard exist in both locales", () => {
    expect(t.en.viewFullReport).toBe("View Full Report");
    expect(t.en.signInDashboard).toBe("Sign in to Dashboard");
    expect(t.en.viewDashboard).toBe("View your dashboard");
    expect(t.vi.viewFullReport.length).toBeGreaterThan(0);
    expect(t.vi.signInDashboard.length).toBeGreaterThan(0);
    expect(t.vi.viewDashboard.length).toBeGreaterThan(0);
  });
  it("unsubscribe + manageEmailPrefs anchor the footer opt-out", () => {
    expect(t.en.unsubscribe).toBe("Unsubscribe");
    expect(t.en.manageEmailPrefs).toBe("Manage email preferences");
  });
  it("weeklyInsight + topActionsNextWeek + thisWeek + noChange pin the weekly digest", () => {
    expect(t.en.weeklyInsight).toBe("Weekly Insight");
    expect(t.en.topActionsNextWeek).toBe("Top Actions for Next Week");
    expect(t.en.thisWeek).toBe("this week");
    expect(t.en.noChange).toBe("No change");
  });
});

describe("translations · tx() lookup helper", () => {
  it("resolves an EN key in the en locale verbatim", () => {
    expect(tx("dashboard", "en")).toBe("Dashboard");
  });

  it("resolves a VI key in the vi locale verbatim", () => {
    expect(tx("dashboard", "vi")).toBe(t.vi.dashboard);
  });

  it("returns the same value as direct dictionary lookup for every EN key", () => {
    for (const k of ALL_KEYS) {
      expect(tx(k, "en")).toBe(t.en[k]);
    }
  });

  it("returns the same value as direct dictionary lookup for every VI key", () => {
    for (const k of ALL_KEYS) {
      expect(tx(k, "vi")).toBe(t.vi[k]);
    }
  });

  it("falls back to the EN string when the locale table is missing entirely", () => {
    // Cast through unknown so we can hand tx() a locale that TS does not know about.
    const bogusLocale = "de" as unknown as Locale;
    expect(tx("dashboard", bogusLocale)).toBe(t.en.dashboard);
  });

  it("falls back to the raw key when neither locale nor EN has it", () => {
    const missingKey = "totallyMissingKey123" as unknown as TranslationKey;
    expect(tx(missingKey, "en")).toBe("totallyMissingKey123");
    expect(tx(missingKey, "vi")).toBe("totallyMissingKey123");
  });

  it("falls back cleanly to the key even with a bogus locale + missing key combo", () => {
    const missingKey = "nope" as unknown as TranslationKey;
    const bogusLocale = "ja" as unknown as Locale;
    expect(tx(missingKey, bogusLocale)).toBe("nope");
  });

  it("returns a string type for every valid (key, locale) pair", () => {
    for (const k of ALL_KEYS) {
      expect(typeof tx(k, "en")).toBe("string");
      expect(typeof tx(k, "vi")).toBe("string");
    }
  });

  it("never throws on any key × locale combo", () => {
    expect(() => {
      for (const k of ALL_KEYS) {
        tx(k, "en");
        tx(k, "vi");
      }
    }).not.toThrow();
  });
});

describe("translations · const-ness + type invariants", () => {
  it("`t` is a plain object literal (not an array or function)", () => {
    expect(typeof t).toBe("object");
    expect(Array.isArray(t)).toBe(false);
  });

  it("every EN key maps to the same shape as its VI counterpart (both are strings)", () => {
    for (const k of ALL_KEYS) {
      expect(typeof t.en[k]).toBe(typeof t.vi[k]);
    }
  });

  it("EN + VI have identical key sets (verified via symmetric-diff)", () => {
    const en = [...EN_KEYS].sort();
    const vi = [...VI_KEYS].sort();
    expect(en).toEqual(vi);
  });
});
