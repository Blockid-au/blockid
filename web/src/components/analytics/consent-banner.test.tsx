// Design check 2026-09-21: the consent banner is site chrome on every page —
// its buttons must be the template button set (one navy primary, outline
// secondaries), ≥ 44 px targets, and never the legacy sky-blue `brand-gold`.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.join(__dirname, "consent-banner.tsx"), "utf8");

describe("consent banner — template buttons", () => {
  it("Accept is the navy primary (bg-action / text-on-action), never brand-gold", () => {
    expect(src).not.toMatch(/brand-gold/);
    expect(src).toMatch(/bg-action px-4 text-xs font-semibold text-on-action/);
  });
  it("every button and the prefs pill carry a 44 px hit area + a visible focus ring", () => {
    const buttons = src.match(/className="[^"]*(?:rounded-lg|rounded-full)[^"]*"/g) ?? [];
    const controls = buttons.filter((c) => /min-h-11|inline-flex/.test(c));
    expect(controls.length).toBeGreaterThanOrEqual(4);
    for (const c of controls) {
      expect(c, c).toContain("min-h-11");
      expect(c, c).toContain("focus-visible:ring-2");
    }
  });
});
