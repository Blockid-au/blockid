/**
 * /vi/funding — Vietnamese mirror of `/funding` (T0248). Same body
 * (`FundingLanding`), `getMessages("vi")` for the `funding.copy.*` strings;
 * the client intake is swapped by the runtime translator, seeded from the
 * same catalogue keys by `buildSeedCatalog("vi")` in the root layout.
 */

import type { Metadata } from "next";
import { getMessages, t } from "@/lib/i18n/t";
import { FundingLanding } from "../../(marketing)/funding/funding-landing";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("vi");
  return {
    title: t(m, "meta.funding.title"),
    description: t(m, "meta.funding.description"),
    alternates: {
      canonical: "https://blockid.au/vi/funding",
      languages: {
        en: "https://blockid.au/funding",
        vi: "https://blockid.au/vi/funding",
        "x-default": "https://blockid.au/funding",
      },
    },
    openGraph: {
      title: t(m, "meta.funding.title"),
      description: t(m, "meta.funding.description"),
      url: "https://blockid.au/vi/funding",
      siteName: "BlockID.au",
      type: "website",
      locale: "vi_VN",
    },
    robots: { index: true, follow: true },
  };
}

export default async function ViFundingPage() {
  const m = await getMessages("vi");
  return <FundingLanding messages={m} />;
}
