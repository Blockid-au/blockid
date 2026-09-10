/**
 * /solutions/advisor — the advisor / consulting-firm persona page (Firm A$149 recommended).
 * New on 2026-09-10 (T0274): before this, `/solutions/advisor` 301'd to
 * `/for/advisor`, which sold advisory firms the founder Growth plan
 *
 * Every visible string resolves through `t()` against the shared catalogue
 * and the props come from `buildAdvisorProps()` in `evaluator-page-props.ts`, so
 * this page and its Vietnamese twin render the same page by construction.
 * Amounts are never strings: the copy carries `{reportPrice}`-style tokens
 * and `SolutionsPageShell` substitutes them from the pricing catalogue.
 *
 * Server component. No client state, no data fetch.
 */

import type { Metadata } from "next";
import { getMessages, t } from "@/lib/i18n/t";
import { SolutionsPageShell } from "../solutions-shared";
import { buildAdvisorProps } from "../evaluator-page-props";

const SITE_URL = "https://blockid.au";
const CANONICAL_EN = `${SITE_URL}/solutions/advisor`;
const CANONICAL_VI = `${SITE_URL}/vi/solutions/advisor`;

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("en");
  const title = t(m, "meta.solutions.advisor.title");
  const description = t(m, "meta.solutions.advisor.description");
  return {
    title,
    description,
    alternates: {
      canonical: CANONICAL_EN,
      languages: {
        en: CANONICAL_EN,
        vi: CANONICAL_VI,
        "x-default": CANONICAL_EN,
      },
    },
    openGraph: {
      title,
      description,
      url: CANONICAL_EN,
      siteName: "BlockID.au",
      type: "website",
      locale: "en_AU",
    },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: true, follow: true },
  };
}

export default async function SolutionsAdvisorPage() {
  const m = await getMessages("en");
  return <SolutionsPageShell {...buildAdvisorProps(m, "en")} />;
}
