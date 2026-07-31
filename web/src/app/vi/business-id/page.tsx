/**
 * /vi/business-id — Vietnamese mirror of the Business ID explainer page.
 *
 * Master Upgrade Plan §7.7 bilingual rule + D4 pre-empt. Re-uses the
 * shared body from the (marketing) group; only the locale catalog and
 * canonical URL differ.
 *
 * Server component. Nothing on this page is legal or financial advice.
 */

import type { Metadata } from "next";
import { getMessages, t } from "@/lib/i18n/t";
import { BusinessIdBody } from "../../(marketing)/business-id/business-id-shared";

const SITE_URL = "https://blockid.au";
const CANONICAL_EN = `${SITE_URL}/business-id`;
const CANONICAL_VI = `${SITE_URL}/vi/business-id`;

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("vi");
  const title = t(m, "businessId.meta.title");
  const description = t(m, "businessId.meta.description");
  return {
    title,
    description,
    alternates: {
      canonical: CANONICAL_VI,
      languages: {
        en: CANONICAL_EN,
        vi: CANONICAL_VI,
        "x-default": CANONICAL_EN,
      },
    },
    openGraph: {
      title,
      description,
      url: CANONICAL_VI,
      siteName: "BlockID.au",
      type: "website",
      locale: "vi_VN",
    },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: true, follow: true },
  };
}

export default async function ViBusinessIdPage() {
  const m = await getMessages("vi");
  return <BusinessIdBody m={m} lang="vi" />;
}
