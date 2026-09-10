/**
 * /vi/solutions/accelerator — Vietnamese mirror of the accelerator, incubator and programme persona page (Program
 * A$349 recommended; Contact Sales for multi-cohort programs)
 *
 * Every visible string resolves through `t()` against the shared catalogue
 * and the props come from `buildAcceleratorProps()` in `evaluator-page-props.ts`, so
 * this page and its English twin render the same page by construction.
 * Amounts are never strings: the copy carries `{reportPrice}`-style tokens
 * and `SolutionsPageShell` substitutes them from the pricing catalogue.
 *
 * Server component. No client state, no data fetch.
 */

import type { Metadata } from "next";
import { getMessages, t } from "@/lib/i18n/t";
import { SolutionsPageShell } from "../../../(marketing)/solutions/solutions-shared";
import { buildAcceleratorProps } from "../../../(marketing)/solutions/evaluator-page-props";

const SITE_URL = "https://blockid.au";
const CANONICAL_EN = `${SITE_URL}/solutions/accelerator`;
const CANONICAL_VI = `${SITE_URL}/vi/solutions/accelerator`;

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("vi");
  const title = t(m, "meta.solutions.accelerator.title");
  const description = t(m, "meta.solutions.accelerator.description");
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

export default async function ViSolutionsAcceleratorPage() {
  const m = await getMessages("vi");
  return <SolutionsPageShell {...buildAcceleratorProps(m, "vi")} />;
}
