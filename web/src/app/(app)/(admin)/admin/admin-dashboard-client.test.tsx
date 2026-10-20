// G35 P5 §6.8 — the PAYG KPI tile on /admin.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/components/admin/admin-layout", () => ({ AdminLayout: ({ children }: { children: unknown }) => children }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: unknown; href: string }) => <a href={href}>{children as never}</a> }));

import { PaygKpiTile } from "./admin-dashboard-client";
import { computePaygKpis } from "@/lib/admin/payg-kpis";

const NOW = new Date("2026-10-20T00:00:00Z");

describe("PaygKpiTile", () => {
  it("renders orders by tier, revenue, Snapshot→Full, Verified SLA and PAYG→subscription", () => {
    const k = computePaygKpis({
      orders: [
        { id: "s1", user_id: "u1", business_id: "b1", product_sku: "report_snapshot", status: "READY", amount_aud: 1900, paid_at: "2026-10-18T00:00:00Z", created_at: "2026-10-18T00:00:00Z" },
        { id: "f1", user_id: "u1", business_id: "b1", product_sku: "upgrade_snapshot_full", status: "READY", amount_aud: 3000, paid_at: "2026-10-19T00:00:00Z", created_at: "2026-10-19T00:00:00Z", upgrade_of_order_id: "s1" },
      ],
      now: NOW,
    });
    const html = renderToStaticMarkup(<PaygKpiTile k={k} enabled />);
    expect(html).toContain('data-testid="payg-kpis"');
    expect(html).toContain("PAYG orders (7 d)");
    expect(html).toContain("Snapshot 1 · Full 0 · Verified 0 · upgrades 1");
    expect(html).toContain("A$49");
    expect(html).toContain("Snapshot → Full");
    expect(html).toContain("100 %");
    expect(html).toContain("Verified SLA hit rate");
    expect(html).toContain("PAYG → subscription");
    expect(html).toContain("payg_enabled: on");
    // D27: no A$-per-credit conversion and no legacy one-off price on the tile.
    expect(html).not.toMatch(/A\$3(?![\d,.])/);
  });
});
