/**
 * /compare — BlockID vs ChatGPT vs an independent valuer (T0274 part 2,
 * G12 sprint S4). The two alias routes live in `./[slug]/page.tsx`, the
 * Vietnamese mirror in `app/vi/compare/page.tsx`; all four render
 * `ComparePage` from `buildCompareProps()` so they cannot drift.
 *
 * Static at build, revalidated hourly (ISR) — the page reads only the
 * catalogue and plans.csv, both bundled.
 */

import type { Metadata } from "next";
import { getMessages } from "@/lib/i18n/t";
import { buildCompareProps } from "./compare-content";
import { buildCompareMetadata } from "./compare-metadata";
import { ComparePage } from "./compare-page";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  return buildCompareMetadata("all", "en");
}

export default async function CompareAllPage() {
  const m = await getMessages("en");
  return <ComparePage {...buildCompareProps(m, "all", "en")} />;
}
