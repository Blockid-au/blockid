// G35 Pricing v5 P3 — review-before-pay UI (tier picker, gate, unlock rail).
//
// Pins: every tier shows name, included bullets, price, "One-off, GST incl."
// and delivery (Verified "within 2 business days"); the Pay button names the
// price; an owner of a lower tier sees the upgrade first; flag off → the A$3
// gate / rail render exactly as before.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildPaygOffer, type PaygOfferEnabled } from "@/lib/pricing/payg-offer";
import { PAYG_CONFIG_DEFAULTS } from "@/lib/pricing/v5-payg";
import { PaygTierPicker, checkoutBodyFor, defaultChoiceIndex, paygChoices } from "./payg-tier-picker";
import { ReportPaywallGate } from "./ReportPaywallGate";
import { TbrUnlockRail, tbrUnlockHeadline, tbrUnlockPaygFromOffer } from "@/components/tbr/v2/unlock-rail";
import { reportOrderPath } from "@/lib/paywall/report-delivery";

const ON = { ...PAYG_CONFIG_DEFAULTS, payg_enabled: true };
const BIZ = "11111111-2222-4333-8444-555555555555";

function offer(orders: Array<Record<string, unknown>> = [], openVerified = 0): PaygOfferEnabled {
  const o = buildPaygOffer({ config: ON, orders, openVerifiedCount: openVerified });
  if (!o.enabled) throw new Error("expected enabled");
  return o;
}

const QUOTE = { credits: 200, estimatedWords: 6000, model: "sonnet" as const, depth: "standard" as const, sections: 10 };

describe("paygChoices / defaultChoiceIndex / checkoutBodyFor", () => {
  it("no ownership → the three tiers, Full pre-selected", () => {
    const choices = paygChoices(offer());
    expect(choices.map((c) => c.offer.sku)).toEqual(["report_snapshot", "report_full", "report_verified"]);
    expect(choices[defaultChoiceIndex(choices)].offer.sku).toBe("report_full");
  });

  it("a Snapshot owner sees the upgrade first and it is pre-selected", () => {
    const choices = paygChoices(offer([{ id: "s1", status: "READY", product_sku: "report_snapshot" }]));
    expect(choices[0]).toMatchObject({ kind: "upgrade", offer: { sku: "upgrade_snapshot_full", priceLabel: "A$30" } });
    expect(defaultChoiceIndex(choices)).toBe(0);
  });

  it("onlyTiers narrows the list (evaluator offers Full only)", () => {
    expect(paygChoices(offer(), ["full"]).map((c) => c.offer.sku)).toEqual(["report_full"]);
  });

  it("the request body names the tier or the upgrade source — never a price", () => {
    const [up] = paygChoices(offer([{ id: "s1", status: "READY", product_sku: "report_snapshot" }]));
    expect(checkoutBodyFor(up, BIZ)).toEqual({ businessId: BIZ, upgradeFrom: "snapshot" });
    const full = paygChoices(offer())[1];
    expect(checkoutBodyFor(full, BIZ, "g4")).toEqual({ businessId: BIZ, firstTouch: "g4", tier: "full" });
  });
});

describe("<PaygTierPicker>", () => {
  it("renders name, price, one-off GST note, delivery and included bullets for each tier, and an explicit Pay button", () => {
    const html = renderToStaticMarkup(<PaygTierPicker offer={offer()} businessId={BIZ} surface="test" creditBalance={0} />);
    for (const s of ["Snapshot report", "Full report", "Verified report", "A$19", "A$49", "A$149", "One-off, GST incl.", "Within 2 business days (team review)", "Evidence-confidence %", "Investor Pack PDF"]) {
      expect(html).toContain(s);
    }
    expect(html).toContain('data-testid="payg-pay"');
    expect(html).toContain("Confirm &amp; Pay A$49");
    // Full has a credits price; the balance is too low → the credits button is disabled.
    expect(html).toContain("Use 49 credits");
    expect(html).toMatch(/data-testid="payg-redeem"[^>]*disabled|disabled=""[^>]*data-testid="payg-redeem"/);
  });

  it("shows Verified as unavailable with the reason when the review queue is full", () => {
    const html = renderToStaticMarkup(<PaygTierPicker offer={offer([], 5)} businessId={BIZ} surface="test" />);
    expect(html).toContain("fully booked");
  });
});

describe("<ReportPaywallGate> — flag on vs off", () => {
  it("flag off (payg absent / disabled) → the A$3 confirm dialog, unchanged", () => {
    const html = renderToStaticMarkup(
      <ReportPaywallGate businessId={BIZ} quote={QUOTE} creditBalance={0} hasSubscription={false} open onClose={() => {}} payg={{ enabled: false }} />,
    );
    expect(html).toContain("Generate this Trusted Business Report");
    expect(html).toContain("Confirm &amp; Pay A$3");
    expect(html).not.toContain("payg-tier-picker");
  });

  it("flag on → 'Choose your report' with the tier picker", () => {
    const html = renderToStaticMarkup(
      <ReportPaywallGate businessId={BIZ} quote={QUOTE} creditBalance={0} hasSubscription={false} open onClose={() => {}} payg={offer()} />,
    );
    expect(html).toContain('data-payg="on"');
    expect(html).toContain("Choose your report");
    expect(html).toContain('data-testid="payg-tier-picker"');
    expect(html).not.toContain("Confirm &amp; Pay A$3");
  });
});

describe("<TbrUnlockRail> — Pricing v5", () => {
  it("tbrUnlockPaygFromOffer: null when off; from-price + Snapshot upgrade + owned Snapshot link when on", () => {
    expect(tbrUnlockPaygFromOffer({ enabled: false })).toBeNull();
    expect(tbrUnlockPaygFromOffer(offer())).toEqual({ fromPriceLabel: "A$19", upgrade: null, snapshotOrderId: null });
    expect(tbrUnlockPaygFromOffer(offer([{ id: "s1", status: "READY", product_sku: "report_snapshot" }]), "s1")).toEqual({
      fromPriceLabel: "A$19",
      upgrade: { fromName: "Snapshot", toName: "Full", priceLabel: "A$30" },
      snapshotOrderId: "s1",
    });
  });

  it("buy mode with payg → three-tier headline and 'Choose a report'", () => {
    const payg = tbrUnlockPaygFromOffer(offer());
    const html = renderToStaticMarkup(<TbrUnlockRail mode="buy" chapterCount={8} payg={payg} />);
    expect(html).toContain('data-tbr-payg="on"');
    expect(html).toContain(tbrUnlockHeadline("buy", "en", "ready", payg));
    expect(html).toContain("Snapshot, Full or Verified, from A$19");
    expect(html).toContain("Choose a report");
    expect(html).not.toContain("A$3");
  });

  it("a Snapshot owner → 'Move up to Full — A$30' and a link to the Snapshot", () => {
    const payg = tbrUnlockPaygFromOffer(offer([{ id: "s1", status: "READY", product_sku: "report_snapshot" }]), "s1");
    const html = renderToStaticMarkup(<TbrUnlockRail mode="buy" chapterCount={8} payg={payg} />);
    expect(html).toContain("Move up to Full — A$30");
    expect(html).toContain(`href="${reportOrderPath("s1")}"`);
  });

  it("no payg → today's A$3 rail", () => {
    const html = renderToStaticMarkup(<TbrUnlockRail mode="buy" chapterCount={8} />);
    expect(html).toContain(tbrUnlockHeadline("buy"));
    expect(html).toContain("A$3");
    expect(html).not.toContain("data-tbr-payg");
  });
});
