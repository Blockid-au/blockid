// Colocated vitest for the /funding paywall card (T0242; G35 P5, D25).
// The three rails render the Money Finder price from the payg_enabled view:
// flag OFF = today's card (legacy price / credits, "≈ A$" hint), flag ON =
// the v5 `report_funding` SKU with credits never converted to A$ (D27).

import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));
vi.mock("@/hooks/useEntitlement", () => ({
  useEntitlement: () => ({ user: null, entitlements: [], trial: null, isLoading: true, can: () => false, refresh: async () => undefined }),
}));

import { FUNDING_REPORT_PRICE_LABEL, FundingPaywall, GRANT_MATCH_CREDITS, type PaywallRail } from "./funding-paywall";
import { PAYG_OFF_VIEW, PAYG_ON_VIEW, type PaygView } from "@/lib/pricing/payg-copy";
import { PAYG_SKUS } from "@/lib/pricing/v5-payg";
import type { FundingPreviewPayload } from "@/lib/funding/preview";

const preview = {
  grant_count: 4,
  program_count: 2,
  top_grants: [],
  top_programs: [],
  top_grants_amount_max_aud: 120000,
  total_amount_max_aud: 150000,
  timeline_count: 7,
  locked: { checklist_items: 19, timeline_items: 7, estimates: 1 },
  location_unknown: false,
} as unknown as FundingPreviewPayload;

async function html(rail: PaywallRail, view?: PaygView): Promise<string> {
  const stream = await renderToReadableStream(<FundingPaywall intake={{ state: "NSW" }} preview={preview} rail={rail} view={view} />);
  await stream.allReady;
  return (await new Response(stream).text()).replace(/<!-- -->/g, "");
}

describe("FundingPaywall — flag OFF (today's card)", () => {
  it("legacy exports stay derived and unchanged", () => {
    expect(FUNDING_REPORT_PRICE_LABEL).toBe("A$3");
    expect(GRANT_MATCH_CREDITS).toBe(3);
  });

  it("guest rail: A$3.00 inc. GST, Pay A$3 & unlock, 3 credits sign-in hint", async () => {
    const out = await html("guest");
    expect(out).toContain("A$3<span");
    expect(out).toContain(".00 inc. GST · one-off");
    expect(out).toContain("Pay A$3 &amp; unlock");
    expect(out).toContain("to pay with 3 credits or use your plan.");
    expect(out).toContain("— A$3, or free with Founder Radar (7-day trial).");
  });

  it("credits rail: 3 credits ≈ A$3, Generate for 3 credits", async () => {
    const out = await html("credits", PAYG_OFF_VIEW);
    expect(out).toContain("3 credits<span");
    expect(out).toContain("≈ A$3");
    expect(out).toContain("Generate for 3 credits");
  });
});

describe("FundingPaywall — flag ON (D25)", () => {
  it("guest rail: the report_funding price inc. GST, no legacy amount", async () => {
    expect(PAYG_ON_VIEW.funding).toBe(`A$${PAYG_SKUS.report_funding.amountCents / 100}`);
    const out = await html("guest", PAYG_ON_VIEW);
    expect(out).toContain("A$19<span");
    expect(out).toContain("inc. GST · one-off");
    expect(out).not.toContain(".00 inc. GST");
    expect(out).toContain("Pay A$19 &amp; unlock");
    expect(out).toContain("to pay with 19 credits or use your plan.");
    expect(out).toContain("— A$19, or free with Founder Radar (7-day trial).");
    expect(out).not.toMatch(/A\$3\b|3 credits/);
  });

  it("credits rail: 19 credits with no A$ conversion (D27)", async () => {
    const out = await html("credits", PAYG_ON_VIEW);
    expect(out).toContain("19 credits");
    expect(out).toContain("Generate for 19 credits");
    expect(out).not.toContain("≈ A$");
  });
});
