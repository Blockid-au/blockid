/**
 * /vi/funding — Vietnamese mirror of `/funding` (T0248). Same body
 * (`FundingLanding`), `getMessages("vi")` for the `funding.copy.*` strings;
 * the client intake is swapped by the runtime translator, seeded from the
 * same catalogue keys by `buildSeedCatalog("vi")` in the root layout.
 */

import type { Metadata } from "next";
import { fill, fundingPriceTokens } from "@/lib/funding/copy";
import { getMessages, t } from "@/lib/i18n/t";
import { getPaygView } from "@/lib/pricing/payg-view.server";
import { pageMetadata } from "@/lib/seo/page-meta";
import { FundingLanding } from "../../(marketing)/funding/funding-landing";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const [m, view] = await Promise.all([getMessages("vi"), getPaygView()]);
  return pageMetadata({
    title: t(m, "meta.funding.title"),
    // G35 P5 (D25): the Money Finder price token, filled for the payg_enabled view.
    description: fill(t(m, "meta.funding.description"), fundingPriceTokens(view)),
    path: "/vi/funding",
    viPath: "/vi/funding",
    lang: "vi",
  });
}

export default async function ViFundingPage() {
  const [m, view] = await Promise.all([getMessages("vi"), getPaygView()]);
  return <FundingLanding messages={m} view={view} />;
}
