// Structural guard: a page may not put a plan-tier floor in front of a feature
// the Equity add-on grants.
//
// requireTierForPage() checks `minTier` FIRST and redirects to /pricing before
// it ever calls can(). That ordering is deliberate — the tier check is a cheap
// in-memory comparison and short-circuits the plans-db lookup — but it means a
// page that pairs `minTier: "scale"` with `feature: "esop.manage"` is
// unreachable for a Growth subscriber who has bought the A$59 add-on, even
// though the add-on grants exactly that feature and the matching API routes
// (gateRequireFeature, which has no tier notion) let them straight through.
//
// That is not a hypothetical. /workspace/esop shipped with
// `minTier: "scale"` and would have bounced every add-on buyer to the pricing
// page for the thing they had just paid to unlock. This test is here so the
// next person to add a tier floor finds out at test time instead of from a
// refund request.
//
// The rule: if the feature is add-on-grantable, the feature flag is the
// authority and there must be no minTier alongside it.

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { ADDON_FEATURES } from "./user-grants";

const APP_DIR = resolve(__dirname, "../../app");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry === "page.tsx" || entry === "layout.tsx") out.push(full);
  }
  return out;
}

const ADDON_GRANTED = new Set(
  Object.values(ADDON_FEATURES).flatMap((fs) => [...fs] as string[]),
);

interface Call {
  file: string;
  feature: string | null;
  minTier: string | null;
}

function extractCalls(file: string): Call[] {
  const src = readFileSync(file, "utf8");
  const calls: Call[] = [];
  const re = /requireTierForPage\(\{([\s\S]*?)\}\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const body = m[1]!;
    const feature = /feature:\s*"([^"]+)"/.exec(body)?.[1] ?? null;
    const minTier = /minTier:\s*"([^"]+)"/.exec(body)?.[1] ?? null;
    calls.push({ file, feature, minTier });
  }
  return calls;
}

const ALL_CALLS = walk(APP_DIR).flatMap(extractCalls);

describe("add-on features are never hidden behind a plan-tier floor", () => {
  it("finds requireTierForPage call sites to check (the scan is not silently empty)", () => {
    expect(ALL_CALLS.length).toBeGreaterThan(0);
  });

  it("no page pairs an add-on-granted feature with a minTier", () => {
    const offenders = ALL_CALLS.filter(
      (c) => c.feature && ADDON_GRANTED.has(c.feature) && c.minTier,
    ).map((c) => `${c.file.replace(APP_DIR, "src/app")}: ${c.feature} + minTier=${c.minTier}`);

    expect(offenders).toEqual([]);
  });

  it("the two pages the add-on actually unlocks gate on the feature alone", () => {
    const esop = ALL_CALLS.find((c) => c.feature === "esop.manage");
    const vesting = ALL_CALLS.find((c) => c.feature === "vesting.read");
    expect(esop, "/workspace/esop must gate on esop.manage").toBeDefined();
    expect(esop!.minTier).toBeNull();
    expect(vesting, "/workspace/vesting must gate on vesting.read").toBeDefined();
    expect(vesting!.minTier).toBeNull();
  });

  it("leaves plan-only floors alone — this rule is about add-on features, not all gating", () => {
    // e.g. /dashboard/exit-readiness uses minTier with no feature at all.
    const planOnly = ALL_CALLS.filter((c) => !c.feature && c.minTier);
    expect(planOnly.length).toBeGreaterThan(0);
  });
});
