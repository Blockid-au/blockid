/**
 * /business-id — the EN explainer page for the Business ID concept.
 *
 * Master Upgrade Plan §7.1 sitemap + user-locked decision D3:
 * `/business-id` explains WHAT a Business ID is (as distinct from
 * `/id/[slug]` which is a public verified profile). This page is a
 * server-rendered evergreen article — no live data, no client state.
 *
 * VI mirror lives at /vi/business-id and re-uses the shared body.
 *
 * Server component. Nothing on this page is legal or financial advice.
 */

import type { Metadata } from "next";
import { getMessages, t } from "@/lib/i18n/t";
import { pageMetadata } from "@/lib/seo/page-meta";
import { BusinessIdBody } from "./business-id-shared";

const PATH = "/business-id";
const VI_PATH = "/vi/business-id";

// G17 P2-A: canonical + hreflang pair + OG image via `pageMetadata`.
export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("en");
  return pageMetadata({
    title: t(m, "businessId.meta.title"),
    description: t(m, "businessId.meta.description"),
    path: PATH,
    viPath: VI_PATH,
  });
}

export default async function BusinessIdPage() {
  const m = await getMessages("en");
  return <BusinessIdBody m={m} lang="en" />;
}
