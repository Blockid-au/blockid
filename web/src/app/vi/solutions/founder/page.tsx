/**
 * /vi/solutions/founder — Vietnamese mirror of the founder persona page.
 *
 * G21 P0-C: props come from `buildFounderProps()` in `evaluator-page-props.ts`
 * (nine-step workflow, three cards, Free / Starter / Growth rungs), so this
 * page and its English twin render the same page by construction. Amounts are never strings: the copy carries `{growthPrice}`-style
 * tokens and `SolutionsPageShell` substitutes them from the pricing catalogue,
 * which is why a price change in plans.csv reaches both languages at once.
 *
 * Server component. No client state, no data fetch.
 */


import type { Metadata } from "next";
import { getMessages, t } from "@/lib/i18n/t";
import { SolutionsPageShell } from "../../../(marketing)/solutions/solutions-shared";
import { buildFounderProps } from "../../../(marketing)/solutions/evaluator-page-props";

const SITE_URL = "https://blockid.au";
const CANONICAL_EN = `${SITE_URL}/solutions/founder`;
const CANONICAL_VI = `${SITE_URL}/vi/solutions/founder`;

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("vi");
  const title = t(m, "meta.solutions.founder.title");
  const description = t(m, "meta.solutions.founder.description");
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

export default async function ViSolutionsFounderPage() {
  const m = await getMessages("vi");
  return <SolutionsPageShell {...buildFounderProps(m, "vi")} />;
}
