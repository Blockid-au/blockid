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
import { pageMetadata } from "@/lib/seo/page-meta";
import { SolutionsPageShell } from "../solutions-shared";
import { buildAdvisorProps } from "../evaluator-page-props";

const PATH = "/solutions/advisor";
const VI_PATH = "/vi/solutions/advisor";

// S8-A: catalogue title carries no brand suffix (the root template appends
// it); hreflang pair + OG image via `pageMetadata`.
export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("en");
  return pageMetadata({
    title: t(m, "meta.solutions.advisor.title"),
    description: t(m, "meta.solutions.advisor.description"),
    path: PATH,
    viPath: VI_PATH,
  });
}

export default async function SolutionsAdvisorPage() {
  const m = await getMessages("en");
  return <SolutionsPageShell {...buildAdvisorProps(m, "en")} />;
}
