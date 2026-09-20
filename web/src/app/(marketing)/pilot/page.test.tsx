// Colocated test for /pilot (G21 P0-C): the paid Cohort Validation Pilot
// landing. Pins: indexable metadata with the canonical and the SKU price in
// the description (no literal), one H1, the offer block with two cards at
// the PILOT_SKUS amounts inc. GST, the contact fallback while the prices
// are unminted, four next steps, the data sentence verbatim, the Cohort 25 /
// 100 rungs with catalogue figures, no unresolved token, no comped / free /
// LOI copy, never "PhD". The marketing shell mounts NavV2 → useRouter(), so
// it is mocked.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { DATA_PRINCIPLE_SENTENCE } from "@/lib/pilots/offer";
import { PILOT_SKUS, formatPilotPrice } from "@/lib/pricing/pilot-skus";
import { GENERATED_PLANS_BY_ID } from "@/config/pricing/plans.generated";
import PilotPage, { generateMetadata } from "./page";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

describe("/pilot metadata (F-3: public + indexable)", () => {
  it("indexable, canonical /pilot, description carries the SKU price", async () => {
    const m = await generateMetadata();
    expect(m.robots).toEqual({ index: true, follow: true });
    expect(m.alternates?.canonical).toBe("https://blockid.au/pilot");
    expect(String(m.title)).toBe("Cohort Validation Pilot for startup programs");
    expect(`${String(m.title)} | BlockID.au`.length).toBeLessThanOrEqual(60);
    expect(String(m.description)).toContain(formatPilotPrice("cohort_pilot_25"));
  });
});

describe("/pilot page", () => {
  it("one H1, the offer block with both SKUs inc. GST, contact fallbacks, next steps, data sentence, Cohort rungs, no token, no comped copy", async () => {
    const out = await html(await PilotPage());
    expect(out.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(out).toContain("Validate BlockID on one real cohort before you commit to a year.");
    expect(out).toMatch(/<section[^>]*id="pilot"/);
    expect(out.match(/data-testid="pilot-offer-card"/g)).toHaveLength(2);
    expect(out).toContain(formatPilotPrice("cohort_pilot_25"));
    expect(out).toContain(formatPilotPrice("cohort_pilot_50"));
    expect(out).toContain("inc. GST");
    expect(out).toContain('data-testid="pilot-buy-cohort_pilot_25"');
    expect(out).toContain('data-testid="pilot-buy-cohort_pilot_50"');
    expect(out.match(/data-pilot-mode="contact"/g)).toHaveLength(2);
    expect(out).toContain('href="/contact?topic=pilot"');
    expect(out).toContain('data-testid="pilot-metrics"');
    expect(out).toContain('data-testid="pilot-next-steps"');
    expect(out.match(/Step <!-- -->\d|Step \d/g)).toHaveLength(4);
    expect(out).toContain("Within two business days");
    expect(out).toContain(esc(DATA_PRINCIPLE_SENTENCE));
    expect(out).toContain("Humans make the decision.");
    expect(out).toContain('data-testid="pilot-after"');
    const cohort25 = GENERATED_PLANS_BY_ID.accelerator_starter!.annual_price_aud_cents / 100;
    expect(out).toContain(`A$${cohort25.toLocaleString("en-AU")} a year`);
    expect(out).not.toMatch(/\{[a-zA-Z0-9]+\}/);
    expect(out).not.toMatch(/Free cohort scoring|comped|letter of intent|admin grant|no card required|5 pilots/i);
    expect(out).not.toMatch(/PhD/);
    expect(out).toContain("support@blockid.au");
    // every A$ on the page is a SKU amount or a Cohort rung figure
    const amounts = new Set([...out.matchAll(/A\$([\d,]+)/g)].map((a) => a[1]));
    const allowed = new Set([
      (PILOT_SKUS.cohort_pilot_25.amountInclGstCents / 100).toLocaleString("en-AU"),
      (PILOT_SKUS.cohort_pilot_50.amountInclGstCents / 100).toLocaleString("en-AU"),
      cohort25.toLocaleString("en-AU"),
      (GENERATED_PLANS_BY_ID.accelerator_growth!.annual_price_aud_cents / 100).toLocaleString("en-AU"),
    ]);
    for (const a of amounts) expect(allowed.has(a), `unexpected amount A$${a}`).toBe(true);
  });
});
