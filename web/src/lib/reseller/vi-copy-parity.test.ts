// Locale parity guard for reseller-facing surfaces.
//
// Grant-Credits modal (grant-form.tsx) and Customer Drawer
// (customer-drawer.tsx) both ship EN + VI copy tables per Customer-Success
// advisory §24 / §25 (see docs/plans/plan-delta-2026-07-23.md § P0.3 (d)+(e)).
// Pattern mirrors ResellerPill (tick 85): shared useLocale() hook +
// per-locale COPY table keyed on Locale.
//
// If any future edit adds an EN key without a matching VI key (or
// vice-versa) the UI silently falls back to `undefined`, which renders as
// empty text. This test catches that drift at CI time.

import { describe, it, expect } from "vitest";

import { COPY as GRANT_COPY } from "@/app/reseller/credits/grant-form";
import { COPY as DRAWER_COPY } from "@/app/reseller/customers/customer-drawer";

function keysOf(obj: object): string[] {
  return Object.keys(obj).sort();
}

describe("reseller VI copy parity", () => {
  it("grant-form: EN and VI COPY tables share identical shape", () => {
    expect(keysOf(GRANT_COPY.vi)).toEqual(keysOf(GRANT_COPY.en));
  });

  it("grant-form: VI COPY table is non-empty and every value is defined", () => {
    const entries = Object.entries(GRANT_COPY.vi);
    expect(entries.length).toBeGreaterThan(0);
    for (const [k, v] of entries) {
      expect(v, `vi.${k} is defined`).toBeDefined();
      const t = typeof v;
      expect(t === "string" || t === "function", `vi.${k} is string|function`).toBe(true);
      // success_middle intentionally is " " (a joiner) — accept any string,
      // just require the key to be present and defined.
    }
  });

  it("customer-drawer: EN and VI COPY tables share identical shape", () => {
    expect(keysOf(DRAWER_COPY.vi)).toEqual(keysOf(DRAWER_COPY.en));
  });

  it("customer-drawer: VI COPY table is non-empty and every value is a non-empty string", () => {
    const entries = Object.entries(DRAWER_COPY.vi);
    expect(entries.length).toBeGreaterThan(0);
    for (const [k, v] of entries) {
      expect(typeof v, `vi.${k} is string`).toBe("string");
      expect(v.trim().length, `vi.${k} is non-empty`).toBeGreaterThan(0);
    }
  });
});
