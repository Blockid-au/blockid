/**
 * /methodology — public scoring & verification methodology (G14-S36).
 *
 * The 8 dimensions (from DIMENSION_OWNERS — same names as the engine), the
 * evidence ladder and who may set which level (D4), business verification
 * L0–L5 with the F-6 multiplier, the hash-chained audit trail, model
 * provenance, versioning and the data-ownership sentence. No weights (F-3).
 * `/vi/methodology` is the Vietnamese mirror; the calibration page is filled
 * by S39.
 */

import type { Metadata } from "next";
import { getMessages, t } from "@/lib/i18n/t";
import { pageMetadata } from "@/lib/seo/page-meta";
import { loadExternalSources } from "@/lib/signals/external-sources";
import { getSupabaseAdmin } from "@/lib/supabase";
import { buildMethodologyProps, METHODOLOGY_PATH } from "./methodology-content";
import { MethodologyPage } from "./methodology-page";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("en");
  return pageMetadata({
    title: t(m, "meta.methodology.title"),
    description: t(m, "meta.methodology.description"),
    path: METHODOLOGY_PATH,
    viPath: `/vi${METHODOLOGY_PATH}`,
  });
}

export default async function MethodologyRoute() {
  const m = await getMessages("en");
  // S40: the "Data sources" table reads external_sources (0410); before the
  // migration — or with no service client — the code catalogue renders.
  const sources = await loadExternalSources(getSupabaseAdmin());
  return <MethodologyPage {...buildMethodologyProps(m, "en", { sources })} />;
}
