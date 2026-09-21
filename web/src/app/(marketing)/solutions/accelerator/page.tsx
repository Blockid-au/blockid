/**
 * /solutions/accelerator — the BlockID Cohort page (G21 P0-C; G25 removed
 * the paid pilot): the six-stage workflow, the Cohort offer at `#cohort`,
 * the Cohort 25 / Cohort 100 rungs at `#plans` (card-required trial).
 *
 * Every visible string resolves through `t()` against the shared catalogue
 * and the props come from `buildAcceleratorProps()` in `evaluator-page-props.ts`, so
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
import { buildAcceleratorProps } from "../evaluator-page-props";

const PATH = "/solutions/accelerator";
const VI_PATH = "/vi/solutions/accelerator";

// S8-A: catalogue title carries no brand suffix (the root template appends
// it); hreflang pair + OG image via `pageMetadata`.
export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("en");
  return pageMetadata({
    title: t(m, "meta.solutions.accelerator.title"),
    description: t(m, "meta.solutions.accelerator.description"),
    path: PATH,
    viPath: VI_PATH,
  });
}

// Static copy from the catalogue — nothing on the page reads an env var.
export const revalidate = 3600;

export default async function SolutionsAcceleratorPage() {
  const m = await getMessages("en");
  return <SolutionsPageShell {...buildAcceleratorProps(m, "en")} />;
}
