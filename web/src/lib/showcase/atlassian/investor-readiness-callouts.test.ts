import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  INVESTOR_READINESS_CALLOUTS,
  getInvestorReadinessCallout,
  listInvestorReadinessCallouts,
} from "./investor-readiness-callouts";
import { PHASE_COUNT, PHASE_LABELS } from "../gallery";

// Resolves the /web app root from this test file's location. The lib
// module sits two levels under web/src/lib/showcase/atlassian, so climb
// four levels to reach web/ and then descend into src/app.
const APP_ROOT = path.resolve(__dirname, "../../..", "app");

/**
 * A route resolves if either:
 *   - the exact segment folder exists (e.g. `/dashboard/cfo` → `app/dashboard/cfo`), or
 *   - a dynamic-segment sibling exists (e.g. `/guide/01-vision` matches
 *     `app/guide/[chapter]`), or
 *   - the segment can be reached by descending through one or more
 *     App Router route groups — parens folders like `(marketing)` /
 *     `(app)` / `(founder)` that group routes without adding URL
 *     segments (Master Upgrade Plan §16.5).
 * The Next.js App Router accepts all three forms; we only care that a
 * live founder clicking the route lands somewhere real.
 */
function routeResolvesToAppFolder(route: string): boolean {
  if (!route.startsWith("/")) return false;
  const segments = route.split("/").filter(Boolean);

  // DFS: at each dir, try (a) exact-name match, (b) dynamic-segment
  // sibling, or (c) descend into any route-group `(name)` sibling and
  // retry the same segment. Route groups are transparent to URLs, so
  // consuming zero URL segments per group hop is correct.
  const resolveFrom = (dir: string, index: number): boolean => {
    if (index === segments.length) return true;
    if (!fs.existsSync(dir)) return false;
    const segment = segments[index];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    // (a) exact folder name
    const direct = entries.find(
      (e) => e.isDirectory() && e.name === segment,
    );
    if (direct && resolveFrom(path.join(dir, direct.name), index + 1)) {
      return true;
    }

    // (b) dynamic segment sibling
    const dynamic = entries.find(
      (e) => e.isDirectory() && e.name.startsWith("[") && e.name.endsWith("]"),
    );
    if (dynamic && resolveFrom(path.join(dir, dynamic.name), index + 1)) {
      return true;
    }

    // (c) route groups — parens folders don't consume a URL segment
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!entry.name.startsWith("(") || !entry.name.endsWith(")")) continue;
      if (resolveFrom(path.join(dir, entry.name), index)) return true;
    }

    return false;
  };

  return resolveFrom(APP_ROOT, 0);
}

describe("INVESTOR_READINESS_CALLOUTS", () => {
  it("covers all 12 phases with populated fields", () => {
    for (let phase = 1; phase <= PHASE_COUNT; phase += 1) {
      const entry = INVESTOR_READINESS_CALLOUTS[phase];
      expect(entry, `phase ${phase} missing`).toBeDefined();
      expect(entry.phase).toBe(phase);
      expect(entry.phase_label_en).toBe(PHASE_LABELS[phase].en);
      expect(entry.phase_label_vi).toBe(PHASE_LABELS[phase].vi);
      expect(entry.atlassian_moment.length).toBeGreaterThan(20);
      expect(entry.blockid_route.startsWith("/")).toBe(true);
      expect(entry.callout_copy_en.length).toBeGreaterThan(40);
      expect(entry.callout_copy_vi.length).toBeGreaterThan(40);
    }
  });

  it("only exports the 12 canonical phase keys", () => {
    const keys = Object.keys(INVESTOR_READINESS_CALLOUTS)
      .map(Number)
      .sort((a, b) => a - b);
    expect(keys).toEqual(Array.from({ length: PHASE_COUNT }, (_, index) => index + 1));
  });

  it("every blockid_route resolves to an app/ folder (direct or dynamic segment)", () => {
    for (let phase = 1; phase <= PHASE_COUNT; phase += 1) {
      const entry = INVESTOR_READINESS_CALLOUTS[phase];
      const ok = routeResolvesToAppFolder(entry.blockid_route);
      expect(ok, `phase ${phase} route ${entry.blockid_route} does not resolve`).toBe(true);
    }
  });

  it("keeps callout copy defensive of the AFSL boundary", () => {
    // No callout may contain absolute-price promises or personal-advice
    // trigger phrases. This is a coarse smoke check; the real guard is
    // the AFSL disclaimer surfaced by the nudge engine + valuation UIs.
    const trigger = /(guaranteed return|you should invest|we recommend investing|risk-free)/i;
    for (const entry of listInvestorReadinessCallouts()) {
      expect(trigger.test(entry.callout_copy_en), `phase ${entry.phase} EN copy trips AFSL guard`).toBe(false);
      expect(trigger.test(entry.callout_copy_vi), `phase ${entry.phase} VI copy trips AFSL guard`).toBe(false);
    }
  });
});

describe("callout accessors", () => {
  it("getInvestorReadinessCallout returns the right entry", () => {
    expect(getInvestorReadinessCallout(1)?.phase).toBe(1);
    expect(getInvestorReadinessCallout(12)?.phase).toBe(12);
    expect(getInvestorReadinessCallout(0)).toBeUndefined();
    expect(getInvestorReadinessCallout(13)).toBeUndefined();
  });

  it("listInvestorReadinessCallouts is stable and ordered", () => {
    const list = listInvestorReadinessCallouts();
    expect(list).toHaveLength(PHASE_COUNT);
    expect(list.map((entry) => entry.phase)).toEqual(Array.from({ length: PHASE_COUNT }, (_, index) => index + 1));
  });
});
