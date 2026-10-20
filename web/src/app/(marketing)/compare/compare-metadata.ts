/**
 * `generateMetadata` payload for the compare routes (T0274 part 2).
 *
 * `/compare` has a Vietnamese mirror at `/vi/compare`; the two alias routes
 * (`/compare/chatgpt`, `/compare/valuers`) are English-only, so their
 * hreflang set is just `en` + `x-default`.
 */

import type { Metadata } from "next";
import { getMessages } from "@/lib/i18n/t";
import { pageMetadata } from "@/lib/seo/page-meta";
import { getPaygView } from "@/lib/pricing/payg-view.server";
import { compareMeta, comparePath, type CompareVariant } from "./compare-content";

export async function buildCompareMetadata(
  variant: CompareVariant,
  lang: "en" | "vi" = "en",
): Promise<Metadata> {
  const [m, payg] = await Promise.all([getMessages(lang), getPaygView()]);
  // Pricing v5 P5: `{reportPrice}` in the description follows payg_enabled.
  const { title, description } = compareMeta(m, variant, payg, lang);
  // S8-A: catalogue titles no longer carry "| BlockID.au" (the root template
  // appends it); OG image + hreflang via `pageMetadata`.
  return pageMetadata({
    title,
    description,
    path: comparePath(variant, lang),
    viPath: variant === "all" ? comparePath("all", "vi") : undefined,
    lang,
  });
}
