// Allow-list drift guard — every data-widget-id rendered on the founder
// dashboard page must be in DASHBOARD_WIDGET_IDS (and vice versa), or the
// layout route silently drops the widget from every saved layout.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DASHBOARD_WIDGET_IDS, isDashboardWidgetId } from "./widget-ids";

const PAGE = resolve(__dirname, "../../app/(app)/(founder)/dashboard/page.tsx");

describe("DASHBOARD_WIDGET_IDS", () => {
  it("matches every data-widget-id declared on dashboard/page.tsx", () => {
    const src = readFileSync(PAGE, "utf8");
    const onPage = new Set<string>();
    for (const m of src.matchAll(/data-widget-id="([^"]+)"/g)) onPage.add(m[1]);
    expect(onPage.size).toBeGreaterThan(0);
    expect([...onPage].sort()).toEqual([...DASHBOARD_WIDGET_IDS].sort());
  });

  it("has no duplicates and only kebab-case ids", () => {
    expect(new Set(DASHBOARD_WIDGET_IDS).size).toBe(DASHBOARD_WIDGET_IDS.length);
    for (const id of DASHBOARD_WIDGET_IDS) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("isDashboardWidgetId narrows strings against the list", () => {
    expect(isDashboardWidgetId("metrics")).toBe(true);
    expect(isDashboardWidgetId("not-a-widget")).toBe(false);
    expect(isDashboardWidgetId(42)).toBe(false);
    expect(isDashboardWidgetId(null)).toBe(false);
  });
});
