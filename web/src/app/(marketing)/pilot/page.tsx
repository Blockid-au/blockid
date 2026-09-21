/**
 * /pilot — the paid BlockID Cohort Validation Pilot landing (G21 P0-C,
 * F-3: public + indexable). The commercial wedge: one real intake or an
 * existing cohort, assessed end to end, priced before you pay.
 *
 * Same offer block as /solutions/accelerator#pilot (<PilotOffer />: two
 * cards from PILOT_SKUS, the inclusions, the success metrics measured
 * together, Cohort 25 / 100 after), plus "what happens next" and the data
 * sentence verbatim. No price literal — every amount is `formatPilotPrice()`
 * or a `fillPrices()` token. The comped evaluator pilot (G16-C) lives at
 * /pilot/investor (noindex, invitation-only).
 *
 * G22-C: the body and every string live in `pilot-page-body.tsx`
 * (`buildPilotPageCopy(m, "en")` over the `pilot.page.*` catalogue keys);
 * /vi/pilot renders the same body from the VI catalogue. Metadata carries
 * the hreflang pair.
 *
 * Test contract: one H1, `pilot-offer` + two `pilot-offer-card`,
 * `pilot-next-steps` (4 rows), `pilot-data-principle`, the buy buttons
 * `pilot-buy-<sku>` (contact links until the founder mints the prices).
 */

import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/page-meta";
import { getMessages } from "@/lib/i18n/t";
import { pilotSkusConfigured } from "../solutions/pilot-configured";
import { PILOT_PATH, PILOT_VI_PATH, PilotPageBody, buildPilotPageCopy } from "./pilot-page-body";

export async function generateMetadata(): Promise<Metadata> {
  const copy = buildPilotPageCopy(await getMessages("en"), "en");
  return pageMetadata({
    title: copy.metaTitle,
    description: copy.metaDescription,
    path: PILOT_PATH,
    viPath: PILOT_VI_PATH,
  });
}

// Re-rendered every 5 min so minting the pilot prices flips the buy buttons
// without a rebuild (review P1).
export const revalidate = 300;

export default async function PilotPage() {
  const m = await getMessages("en");
  return <PilotPageBody copy={buildPilotPageCopy(m, "en")} configured={pilotSkusConfigured()} />;
}
