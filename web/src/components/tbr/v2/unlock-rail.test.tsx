// G19-S45 (D4) — the unlock rail's `purchased` mode: a ready order opens the
// ReportV2 page (never the markdown wall), a pending order says so without a
// link, a pre-v2 order links to the legacy text version. Labels come from
// tbr-strings (VI with diacritics).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { legacyReportOrderPath, reportOrderPath } from "@/lib/paywall/report-delivery";
import { getTbrStrings } from "@/lib/i18n/tbr-strings";
import { TBR_UNLOCK_RAIL_TESTID, TbrUnlockRail, tbrUnlockHeadline, tbrUnlockOrderHref } from "./unlock-rail";

const ORDER = "11111111-2222-4333-8444-555555555555";

describe("<TbrUnlockRail> purchased (G19-S45)", () => {
  it("ready → 'Open your full report' links to the ReportV2 page, not /workspace/reports/order", () => {
    const html = renderToStaticMarkup(<TbrUnlockRail mode="purchased" chapterCount={8} orderId={ORDER} />);
    expect(html).toContain(`data-testid="${TBR_UNLOCK_RAIL_TESTID}"`);
    expect(html).toContain('data-tbr-order-status="ready"');
    expect(html).toContain(`href="${reportOrderPath(ORDER)}"`);
    expect(html).toContain("/workspace/reports/business?order=");
    expect(html).not.toContain("/workspace/reports/order?order=");
    expect(html).toContain(tbrUnlockHeadline("purchased"));
    expect(tbrUnlockOrderHref(ORDER)).toBe(reportOrderPath(ORDER));
  });

  it("pending → 'being written' headline, a live status note and NO link (the page polls)", () => {
    const html = renderToStaticMarkup(<TbrUnlockRail mode="purchased" chapterCount={8} orderId={ORDER} orderStatus="pending" />);
    expect(html).toContain('data-tbr-order-status="pending"');
    expect(html).toContain('data-testid="tbr-unlock-pending"');
    expect(html).toContain(tbrUnlockHeadline("purchased", "en", "pending"));
    expect(html).toContain("is being written");
    expect(html).not.toContain('data-testid="tbr-unlock-cta"');
    expect(html).not.toContain("/workspace/reports/order");
  });

  it("legacy (pre-v2 order) → 'Open the text version' links to the thin markdown wrapper with view=legacy", () => {
    const html = renderToStaticMarkup(<TbrUnlockRail mode="purchased" chapterCount={8} orderId={ORDER} orderStatus="legacy" />);
    expect(html).toContain('data-tbr-order-status="legacy"');
    expect(html).toContain(`href="${legacyReportOrderPath(ORDER).replace(/&/g, "&amp;")}"`);
    expect(html).toContain("Open the text version");
    expect(tbrUnlockOrderHref(ORDER, "legacy")).toContain("view=legacy");
  });

  it("no order id → the generic order landing", () => {
    expect(tbrUnlockOrderHref(null)).toBe("/workspace/reports/order");
  });

  it("VI: every rail label comes from tbr-strings with diacritics, no English chrome", () => {
    const vi = getTbrStrings("vi").v2.rail;
    const html = renderToStaticMarkup(<TbrUnlockRail mode="buy" chapterCount={8} locale="vi" />);
    expect(html).toContain(vi.headlineBuy("A$3").split("A$3")[0]!.trim());
    expect(html).toContain(vi.confirmNote);
    expect(html).toContain("Mở khoá");
    for (const en of ["Unlock the full Trusted Business Report", "before anything is charged", "PDF export + a live share link"]) expect(html).not.toContain(en);
    expect(renderToStaticMarkup(<TbrUnlockRail mode="purchased" chapterCount={8} orderId={ORDER} orderStatus="pending" locale="vi" />)).toContain(vi.headlinePending);
  });
});
