/**
 * /compare/chatgpt and /compare/valuers — the two alias routes of `/compare`
 * (T0274 part 2). Same H1 and table; the slug changes the lede, the
 * metadata, the highlighted column and the GA4 `variant`. Only the two
 * slugs in `COMPARE_ALIAS_SLUGS` exist — anything else is a 404, not a
 * fallback render.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMessages } from "@/lib/i18n/t";
import { buildCompareProps, COMPARE_ALIAS_SLUGS, isCompareAlias } from "../compare-content";
import { buildCompareMetadata } from "../compare-metadata";
import { ComparePage } from "../compare-page";

type Params = { slug: string };

export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return COMPARE_ALIAS_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!isCompareAlias(slug)) notFound();
  return buildCompareMetadata(slug, "en");
}

export default async function CompareAliasPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  if (!isCompareAlias(slug)) notFound();
  const m = await getMessages("en");
  return <ComparePage {...buildCompareProps(m, slug, "en")} />;
}
