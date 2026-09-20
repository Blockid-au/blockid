/**
 * /solutions/founder — the founder persona page (G21 P0-C: "See what an
 * evaluator can verify — not only what your pitch says.", nine-step
 * workflow, Free / Starter / Growth rungs).
 *
 * Props come from `buildFounderProps()` in `evaluator-page-props.ts`, so the
 * Vietnamese mirror at /vi/solutions/founder renders the same page from the
 * same shell. Amounts are never strings: the copy carries `{growthPrice}`-style
 * tokens and `SolutionsPageShell` substitutes them from the pricing catalogue,
 * which is why a price change in plans.csv reaches both languages at once.
 *
 * Server component. No client state, no data fetch.
 */


import type { Metadata } from "next";
import { getMessages, t } from "@/lib/i18n/t";
import { pageMetadata } from "@/lib/seo/page-meta";
import { SolutionsPageShell } from "../solutions-shared";
import { buildFounderProps } from "../evaluator-page-props";

const PATH = "/solutions/founder";
const VI_PATH = "/vi/solutions/founder";

// G17 P2-A: canonical + hreflang pair + OG image via `pageMetadata` (the root
// template appends the brand suffix).
export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("en");
  return pageMetadata({
    title: t(m, "meta.solutions.founder.title"),
    description: t(m, "meta.solutions.founder.description"),
    path: PATH,
    viPath: VI_PATH,
  });
}

export default async function SolutionsFounderPage() {
  const m = await getMessages("en");
  return <SolutionsPageShell {...buildFounderProps(m, "en")} />;
}
