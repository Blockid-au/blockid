/**
 * /vi/compare — Vietnamese mirror of `/compare` (T0274 part 2). Same
 * builder, same body, `getMessages("vi")`; the alias routes are English-only.
 */

import type { Metadata } from "next";
import { getMessages } from "@/lib/i18n/t";
import { buildCompareProps } from "../../(marketing)/compare/compare-content";
import { buildCompareMetadata } from "../../(marketing)/compare/compare-metadata";
import { ComparePage } from "../../(marketing)/compare/compare-page";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  return buildCompareMetadata("all", "vi");
}

export default async function ViComparePage() {
  const m = await getMessages("vi");
  return <ComparePage {...buildCompareProps(m, "all", "vi")} />;
}
