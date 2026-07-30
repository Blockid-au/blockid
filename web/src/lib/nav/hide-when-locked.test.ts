/**
 * Colocated tests for hide-when-locked helper.
 *
 * Pins the four v3 §16.4 invariants:
 *   1. All three gates pass ⇒ "show".
 *   2. Scope or flag fails ⇒ always "hide" regardless of hideWhenLocked.
 *   3. Tier fails + hideWhenLocked undefined ⇒ "hide" (v3 default).
 *   4. Tier fails + hideWhenLocked === false ⇒ "show_dimmed" (add-on).
 *   5. Tier fails + hideWhenLocked === true ⇒ "hide" (explicit).
 */

import { describe, expect, it } from "vitest";
import {
  decideVisibility,
  filterHideWhenLocked,
  type LockedDecision,
} from "./hide-when-locked";

const allPass = { scopeOk: true, tierOk: true, flagOk: true };

describe("decideVisibility", () => {
  it("returns 'show' when every gate passes", () => {
    expect(decideVisibility(allPass)).toBe<LockedDecision>("show");
  });

  it("hides when scope fails regardless of hideWhenLocked", () => {
    expect(
      decideVisibility({ ...allPass, scopeOk: false, hideWhenLocked: false }),
    ).toBe<LockedDecision>("hide");
    expect(
      decideVisibility({ ...allPass, scopeOk: false, hideWhenLocked: true }),
    ).toBe<LockedDecision>("hide");
  });

  it("hides when flag fails regardless of hideWhenLocked", () => {
    expect(
      decideVisibility({ ...allPass, flagOk: false, hideWhenLocked: false }),
    ).toBe<LockedDecision>("hide");
    expect(
      decideVisibility({ ...allPass, flagOk: false, hideWhenLocked: true }),
    ).toBe<LockedDecision>("hide");
  });

  it("hides when tier fails and hideWhenLocked defaults (v3 default)", () => {
    expect(
      decideVisibility({ ...allPass, tierOk: false }),
    ).toBe<LockedDecision>("hide");
  });

  it("hides when tier fails and hideWhenLocked === true", () => {
    expect(
      decideVisibility({ ...allPass, tierOk: false, hideWhenLocked: true }),
    ).toBe<LockedDecision>("hide");
  });

  it("shows dimmed when tier fails and hideWhenLocked === false (add-on)", () => {
    expect(
      decideVisibility({ ...allPass, tierOk: false, hideWhenLocked: false }),
    ).toBe<LockedDecision>("show_dimmed");
  });
});

describe("filterHideWhenLocked", () => {
  interface Item {
    href: string;
    minTier?: string;
    hideWhenLocked?: boolean;
  }

  const items: Item[] = [
    { href: "/home" }, // no tier ⇒ tierOk = true
    { href: "/growth", minTier: "growth" }, // tierOk = false, default hide
    { href: "/pro", minTier: "professional" }, // tierOk = false, default hide
    { href: "/share-mgmt", minTier: "growth", hideWhenLocked: false }, // add-on, dim
    { href: "/paid", minTier: "growth", hideWhenLocked: true }, // explicit hide
  ];

  const gate = (item: Item) => ({
    scopeOk: true,
    flagOk: true,
    tierOk: !item.minTier, // treat "no tier" as ok, any tier as locked
  });

  it("drops v3-default locked rows and dims add-on rows", () => {
    const out = filterHideWhenLocked(items, gate);
    expect(out.map((i) => i.href)).toEqual(["/home", "/share-mgmt"]);
    const shareMgmt = out.find((i) => i.href === "/share-mgmt");
    expect(shareMgmt?._lockedDim).toBe(true);
    const home = out.find((i) => i.href === "/home");
    expect(home?._lockedDim).toBeUndefined();
  });

  it("hides everything when scope fails", () => {
    const out = filterHideWhenLocked(items, () => ({
      scopeOk: false,
      flagOk: true,
      tierOk: true,
    }));
    expect(out).toEqual([]);
  });

  it("hides everything when flag fails", () => {
    const out = filterHideWhenLocked(items, () => ({
      scopeOk: true,
      flagOk: false,
      tierOk: true,
    }));
    expect(out).toEqual([]);
  });

  it("shows all rows when every gate passes", () => {
    const out = filterHideWhenLocked(items, () => ({
      scopeOk: true,
      flagOk: true,
      tierOk: true,
    }));
    expect(out.map((i) => i.href)).toEqual([
      "/home",
      "/growth",
      "/pro",
      "/share-mgmt",
      "/paid",
    ]);
    // None should be marked dimmed when unlocked.
    expect(out.every((i) => i._lockedDim === undefined)).toBe(true);
  });
});
