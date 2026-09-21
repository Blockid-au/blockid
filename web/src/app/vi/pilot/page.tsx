/**
 * /vi/pilot — Vietnamese mirror of /pilot, the paid BlockID Cohort
 * Validation Pilot landing (G22-C). Same body (`PilotPageBody`), same
 * <PilotOffer /> block, same SKUs; every string comes from the VI catalogue
 * through `buildPilotPageCopy(m, "vi")`, the TrustBand renders its VI copy
 * table and the buy buttons carry the VI control strings. Metadata carries
 * the hreflang pair (en → /pilot, x-default → /pilot).
 *
 * Server component. No client state, no data fetch.
 */

import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/page-meta";
import { getMessages } from "@/lib/i18n/t";
import { pilotSkusConfigured } from "../../(marketing)/solutions/pilot-configured";
import { PILOT_VI_PATH, PilotPageBody, buildPilotPageCopy } from "../../(marketing)/pilot/pilot-page-body";

export async function generateMetadata(): Promise<Metadata> {
  const copy = buildPilotPageCopy(await getMessages("vi"), "vi");
  return pageMetadata({
    title: copy.metaTitle,
    description: copy.metaDescription,
    path: PILOT_VI_PATH,
    viPath: PILOT_VI_PATH,
    lang: "vi",
  });
}

// Same cadence as /pilot: minting the pilot prices flips the buy buttons
// within five minutes, no rebuild.
export const revalidate = 300;

export default async function ViPilotPage() {
  const m = await getMessages("vi");
  return <PilotPageBody copy={buildPilotPageCopy(m, "vi")} configured={pilotSkusConfigured()} />;
}
