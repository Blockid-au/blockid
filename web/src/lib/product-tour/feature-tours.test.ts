// Unit tests for the feature-tour registry — pure module, no DOM.

import { describe, expect, it } from "vitest";
import {
  dismissKeyFor,
  featureTourSlugs,
  getFeatureTour,
  listFeatureTours,
  pickLocale,
  shouldShowFeatureTour,
  tourForRoute,
} from "./feature-tours";

const REQUIRED = [
  "onboarding",
  "svi",
  "dataroom",
  "reseller",
  "dashboard-nav",
  "exit-readiness",
] as const;

describe("feature-tours registry", () => {
  it("registers the six spec-required tours", () => {
    const slugs = featureTourSlugs();
    for (const slug of REQUIRED) {
      expect(slugs).toContain(slug);
    }
  });

  it("every tour has at least one step, each step has bilingual copy", () => {
    for (const t of listFeatureTours()) {
      expect(t.steps.length).toBeGreaterThan(0);
      expect(t.name.en.length).toBeGreaterThan(0);
      expect(t.name.vi.length).toBeGreaterThan(0);
      for (const s of t.steps) {
        expect(s.title.en.length).toBeGreaterThan(0);
        expect(s.title.vi.length).toBeGreaterThan(0);
        expect(s.body.en.length).toBeGreaterThan(0);
        expect(s.body.vi.length).toBeGreaterThan(0);
      }
    }
  });

  it("getFeatureTour resolves by slug and returns undefined for unknown", () => {
    expect(getFeatureTour("svi")?.slug).toBe("svi");
    expect(getFeatureTour("nope")).toBeUndefined();
  });

  it("tourForRoute prefers the longest matching route", () => {
    // /dashboard is a registered route for dashboard-nav; /dashboard/svi
    // is registered for svi — the deeper one must win.
    expect(tourForRoute("/dashboard/svi")?.slug).toBe("svi");
    expect(tourForRoute("/dashboard")?.slug).toBe("dashboard-nav");
    expect(tourForRoute("/dashboard/svi/subpath")?.slug).toBe("svi");
    expect(tourForRoute("/somewhere-else")).toBeUndefined();
    expect(tourForRoute("")).toBeUndefined();
  });

  it("pickLocale falls back to EN when the locale key is missing", () => {
    expect(pickLocale({ en: "hello", vi: "xin chao" }, "en")).toBe("hello");
    expect(pickLocale({ en: "hello", vi: "xin chao" }, "vi")).toBe("xin chao");
  });

  it("dismissKeyFor is stable and namespaced", () => {
    expect(dismissKeyFor("svi")).toBe("blockid_feature_tour_dismissed_svi");
    expect(dismissKeyFor("onboarding")).toBe(
      "blockid_feature_tour_dismissed_onboarding",
    );
  });

  it("shouldShowFeatureTour shows when never-dismissed and hides at same version", () => {
    const tour = getFeatureTour("svi")!;
    expect(shouldShowFeatureTour({ tour, dismissedVersion: null })).toBe(true);
    expect(shouldShowFeatureTour({ tour, dismissedVersion: tour.version })).toBe(
      false,
    );
    expect(
      shouldShowFeatureTour({ tour, dismissedVersion: tour.version - 1 }),
    ).toBe(true);
  });

  it("route paths are unique per tour", () => {
    const routes = listFeatureTours().map((t) => t.route);
    expect(new Set(routes).size).toBe(routes.length);
  });
});
