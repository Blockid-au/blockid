// G16-B — the founder TBR page's access resolution (pure) and the paywall
// modal's price copy. The interactive page itself is covered by the live-qa
// lane (tests/live-qa/21-reports.spec.ts) because this workspace has no
// @testing-library/react and React dev mode never hydrates under the CSP.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

import { demoReportV2, freeFixtureReportV2 } from "@/lib/report-v2/fixtures";
import { quoteTrustReport } from "@/lib/pricing/report-credit-cost";
import { trustReportPriceLabel } from "@/lib/pricing/trust-report-price";
import { ReportPaywallGate } from "@/components/paywall/ReportPaywallGate";
import { resolveTbrAccess, type ReportAccessInfo } from "./business-report-client";

const base: ReportAccessInfo = {
  projectId: "11111111-1111-4111-8111-111111111111",
  included: false,
  paidOrderId: null,
  quote: quoteTrustReport(),
  creditBalance: 0,
  hasSubscription: false,
  price: { sku: "sku_trust_report_5aud", amount_cents: 300, label: trustReportPriceLabel() },
};

describe("resolveTbrAccess (G16-B)", () => {
  it("free founder, lifted snapshot → free lift + buy rail", () => {
    expect(resolveTbrAccess(null, base)).toEqual({ liftTier: "free", unlockMode: "buy", orderStatus: null, useOrderReport: false });
  });

  it("access lookup failed (null) → still the free cut, buy mode (the rail explains if no project)", () => {
    expect(resolveTbrAccess(null, null)).toEqual({ liftTier: "free", unlockMode: "buy", orderStatus: null, useOrderReport: false });
  });

  it("plan includes the report → standard lift, no rail on a lifted snapshot; 'included' rail on a stored free document", () => {
    expect(resolveTbrAccess(null, { ...base, included: true })).toMatchObject({ liftTier: "standard", unlockMode: null });
    expect(resolveTbrAccess(freeFixtureReportV2(), { ...base, included: true })).toMatchObject({ liftTier: "standard", unlockMode: "included" });
  });

  it("paid order → standard lift; 'purchased' rail on a stored free document (paid wins over included)", () => {
    expect(resolveTbrAccess(null, { ...base, paidOrderId: "o-1" })).toMatchObject({ liftTier: "standard", unlockMode: null, orderStatus: "ready" });
    expect(resolveTbrAccess(freeFixtureReportV2(), { ...base, paidOrderId: "o-1", included: true })).toMatchObject({ liftTier: "standard", unlockMode: "purchased", orderStatus: "ready" });
  });

  // G19-S45 (D4): the paid order's own ReportV2 wins; a pending / legacy order keeps the snapshot unlocked.
  describe("paid order (G19-S45 D4)", () => {
    it("a READY order carrying report_json → that document, every chapter unlocked, no rail — even over a stored free snapshot", () => {
      const r = resolveTbrAccess(freeFixtureReportV2(), { ...base, paidOrderId: "o-1" }, { report: demoReportV2(), status: "ready" });
      expect(r).toEqual({ liftTier: "standard", unlockMode: null, orderStatus: "ready", useOrderReport: true });
    });

    it("an order still being written → snapshot lifted at standard (no lock), 'purchased' rail in pending state on a stored free document", () => {
      expect(resolveTbrAccess(null, { ...base, paidOrderId: "o-1" }, { report: null, status: "pending" })).toEqual({ liftTier: "standard", unlockMode: null, orderStatus: "pending", useOrderReport: false });
      expect(resolveTbrAccess(freeFixtureReportV2(), { ...base, paidOrderId: "o-1" }, { report: null, status: "pending" })).toEqual({ liftTier: "standard", unlockMode: "purchased", orderStatus: "pending", useOrderReport: false });
    });

    it("a pre-v2 order (READY, no report_json) → snapshot unlocked, 'purchased' rail pointing at the legacy text version", () => {
      expect(resolveTbrAccess(freeFixtureReportV2(), { ...base, paidOrderId: "o-1" }, { report: null, status: "legacy" })).toEqual({ liftTier: "standard", unlockMode: "purchased", orderStatus: "legacy", useOrderReport: false });
    });

    it("an explicit ?order= counts as ownership even when the access lookup failed", () => {
      expect(resolveTbrAccess(null, null, { report: null, status: "pending" })).toMatchObject({ liftTier: "standard", unlockMode: null, orderStatus: "pending" });
      expect(resolveTbrAccess(null, null, { report: demoReportV2(), status: "ready" })).toMatchObject({ useOrderReport: true, unlockMode: null });
    });
  });

  it("a stored 'standard' document is trusted only with a paid order or an included plan (G16 review P1-2: the deck analyser stores every snapshot as standard)", () => {
    expect(resolveTbrAccess(demoReportV2(), { ...base, paidOrderId: "o-1" }).unlockMode).toBeNull();
    expect(resolveTbrAccess(demoReportV2(), { ...base, included: true }).unlockMode).toBeNull();
    expect(resolveTbrAccess(demoReportV2(), base).unlockMode).toBe("buy");
    expect(resolveTbrAccess(demoReportV2(), null).unlockMode).toBe("buy");
  });
});

describe("<ReportPaywallGate> price copy", () => {
  it("quotes credits AND the source-of-truth A$ figure before any charge, with an explicit confirm button", () => {
    const html = renderToStaticMarkup(
      <ReportPaywallGate businessId={base.projectId!} quote={base.quote} creditBalance={0} hasSubscription={false} open={false} onClose={() => {}} />,
    );
    expect(html).toContain('data-testid="report-paywall-gate"');
    expect(html).toContain(`Confirm &amp; Pay ${trustReportPriceLabel()}`);
    expect(html).toContain(`${base.quote.credits} credits`);
    expect(html).toContain(base.quote.estimatedWords.toLocaleString("en-AU"));
  });
});

// G20-sweep (2026-09-20): the founder sweep found /workspace/reports/business
// with NO h1 — a fresh founder lands on the "no analysis" empty state, which
// carried only a <p>. The empty state's title is now the page's h1 (a static
// render, effects never run, so this is exactly the first paint).
describe("<BusinessReportClient> first paint (no analysis)", () => {
  it("renders one h1 on the empty state", async () => {
    const { BusinessReportClient } = await import("./business-report-client");
    const html = renderToStaticMarkup(<BusinessReportClient projectId="default" />);
    expect((html.match(/<h1[\s>]/g) ?? []).length).toBe(1);
    expect(html).toContain("No recent analysis found</h1>");
  });
});
