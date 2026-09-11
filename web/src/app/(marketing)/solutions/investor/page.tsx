/**
 * /solutions/investor — the investor and analyst persona page (Scout A$79 recommended)
 *
 * Every visible string resolves through `t()` against the shared catalogue
 * and the props come from `buildInvestorProps()` in `evaluator-page-props.ts`, so
 * this page and its Vietnamese twin render the same page by construction.
 * Amounts are never strings: the copy carries `{reportPrice}`-style tokens
 * and `SolutionsPageShell` substitutes them from the pricing catalogue.
 *
 * Server component. No client state, no data fetch.
 */

import type { Metadata } from "next";
import { getMessages, t } from "@/lib/i18n/t";
import { pageMetadata } from "@/lib/seo/page-meta";
import { SolutionsPageShell } from "../solutions-shared";
import { buildInvestorProps } from "../evaluator-page-props";

const PATH = "/solutions/investor";
const VI_PATH = "/vi/solutions/investor";

// S8-A: catalogue title carries no brand suffix (the root template appends
// it); hreflang pair + OG image via `pageMetadata`.
export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("en");
  return pageMetadata({
    title: t(m, "meta.solutions.investor.title"),
    description: t(m, "meta.solutions.investor.description"),
    path: PATH,
    viPath: VI_PATH,
  });
}

export default async function SolutionsInvestorPage() {
  const m = await getMessages("en");
  return <SolutionsPageShell {...buildInvestorProps(m, "en")} />;
}
