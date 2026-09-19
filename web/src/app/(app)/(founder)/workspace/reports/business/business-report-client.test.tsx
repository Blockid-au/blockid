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
    expect(resolveTbrAccess(null, base)).toEqual({ liftTier: "free", unlockMode: "buy" });
  });

  it("access lookup failed (null) → still the free cut, buy mode (the rail explains if no project)", () => {
    expect(resolveTbrAccess(null, null)).toEqual({ liftTier: "free", unlockMode: "buy" });
  });

  it("plan includes the report → standard lift, no rail on a lifted snapshot; 'included' rail on a stored free document", () => {
    expect(resolveTbrAccess(null, { ...base, included: true })).toEqual({ liftTier: "standard", unlockMode: null });
    expect(resolveTbrAccess(freeFixtureReportV2(), { ...base, included: true })).toEqual({ liftTier: "standard", unlockMode: "included" });
  });

  it("paid order → standard lift; 'purchased' rail on a stored free document (paid wins over included)", () => {
    expect(resolveTbrAccess(null, { ...base, paidOrderId: "o-1" })).toEqual({ liftTier: "standard", unlockMode: null });
    expect(resolveTbrAccess(freeFixtureReportV2(), { ...base, paidOrderId: "o-1", included: true })).toEqual({ liftTier: "standard", unlockMode: "purchased" });
  });

  it("a stored paid document never shows a rail, whatever the access", () => {
    expect(resolveTbrAccess(demoReportV2(), base).unlockMode).toBeNull();
    expect(resolveTbrAccess(demoReportV2(), null).unlockMode).toBeNull();
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
