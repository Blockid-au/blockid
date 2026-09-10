/**
 * `generateMetadata` payload for the compare routes (T0274 part 2).
 *
 * `/compare` has a Vietnamese mirror at `/vi/compare`; the two alias routes
 * (`/compare/chatgpt`, `/compare/valuers`) are English-only, so their
 * hreflang set is just `en` + `x-default`.
 */

import type { Metadata } from "next";
import { getMessages } from "@/lib/i18n/t";
import { compareMeta, comparePath, type CompareVariant } from "./compare-content";

const SITE_URL = "https://blockid.au";

export async function buildCompareMetadata(
  variant: CompareVariant,
  lang: "en" | "vi" = "en",
): Promise<Metadata> {
  const m = await getMessages(lang);
  const { title, description } = compareMeta(m, variant);
  const en = `${SITE_URL}${comparePath(variant, "en")}`;
  const canonical = `${SITE_URL}${comparePath(variant, lang)}`;
  const languages: Record<string, string> =
    variant === "all"
      ? { en, vi: `${SITE_URL}${comparePath("all", "vi")}`, "x-default": en }
      : { en, "x-default": en };
  return {
    title,
    description,
    alternates: { canonical, languages },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "BlockID.au",
      type: "website",
      locale: lang === "vi" ? "vi_VN" : "en_AU",
    },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: true, follow: true },
  };
}
