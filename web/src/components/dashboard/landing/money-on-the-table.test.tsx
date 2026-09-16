// Block 3 · Money on the table — SSR pins (G13-W3-IA3 §B.1 row 3 / §B.4 row 3).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", () => ({ trackEvent: () => undefined }));

import type { MoneyRadarTileData } from "@/lib/funding/tile-data";
import { MoneyOnTheTable, addressableAud, moneyEmptyCopy } from "./money-on-the-table";

const ctx = { phase: "vision", plan: "founder_free", persona: "founder" };

const BASE: MoneyRadarTileData = {
  state: "buyer",
  counts: { grants: 12, programs: 7, capital: 3 },
  top3: [
    { ref_kind: "grant", ref_id: "g1", name: "MVP Ventures", why: "fits", amount_max_aud: 45_000, closes_at: "2026-09-30", deadline: null, url: null },
    { ref_kind: "program", ref_id: "p1", name: "Startmate", why: "fits", amount_max_aud: null, closes_at: null, deadline: null, url: null },
  ],
  next_deadlines: [{ ref_kind: "grant", ref_id: "g1", name: "MVP Ventures", closes_at: "2026-09-30", days_until: 14, status: "closing_soon", date_label: "30 Sep 2026 (AEST)", url: null }],
  new_matches_week: 0,
  next_public_event: null,
  next_step: "Apply to MVP Ventures",
  industry_label: "SaaS",
  state_label: "NSW",
  user_state: "NSW",
  report_id: "r1",
  calendar_href: null,
  today: "2026-09-16",
};

describe("MoneyOnTheTable", () => {
  it("empty state (no_profile / failed read): counts in the copy + Complete profile → /onboarding?step=2", () => {
    const html = renderToStaticMarkup(<MoneyOnTheTable ctx={ctx} data={{ ...BASE, state: "no_profile", counts: { grants: 56, programs: 199, capital: 0 }, top3: [] }} />);
    expect(html).toContain('data-landing-block="money-on-the-table" data-landing-empty="true"');
    expect(html).toContain("Tell us your industry and state to match 56 grants and 199 programs.");
    expect(html).toContain('href="/onboarding?step=2"');
    const failed = renderToStaticMarkup(<MoneyOnTheTable ctx={ctx} data={null} />);
    expect(failed).toContain('data-landing-empty="true"');
    expect(failed).toContain("open Australian grants and programs");
    expect(moneyEmptyCopy(null)).not.toMatch(/\d/);
  });

  it("matched: counts, A$ total, top match, next deadline, See matches → /workspace/funding + investors link", () => {
    const html = renderToStaticMarkup(<MoneyOnTheTable ctx={ctx} data={BASE} creditNote="Charged to your own credits" />);
    expect(html).not.toContain("data-landing-empty");
    expect(html).toMatch(/data-landing-grants="true">12</);
    expect(html).toMatch(/data-landing-programs="true">7</);
    expect(html).toMatch(/data-landing-capital="true">3</);
    expect(html).toContain("A$45k");
    expect(html).toContain("MVP Ventures");
    expect(html).toContain("30 Sep 2026 (AEST)");
    expect(html).toContain('href="/workspace/funding"');
    expect(html).toContain('href="/workspace/investors"');
    expect(html).toContain("Charged to your own credits");
  });

  it("addressableAud sums only known amounts; no deadline falls back to the next step line", () => {
    expect(addressableAud(BASE)).toBe(45_000);
    expect(addressableAud(null)).toBe(0);
    const html = renderToStaticMarkup(<MoneyOnTheTable ctx={ctx} data={{ ...BASE, top3: [BASE.top3[1]], next_deadlines: [] }} />);
    expect(html).not.toContain("data-landing-money-total");
    expect(html).toContain("Apply to MVP Ventures");
  });
});
