/**
 * /vi/methodology — Vietnamese mirror of `/methodology` (G14-S36). Same
 * builder, same body, `getMessages("vi")`.
 */

import type { Metadata } from "next";
import { getMessages, t } from "@/lib/i18n/t";
import { pageMetadata } from "@/lib/seo/page-meta";
import { loadExternalSources } from "@/lib/signals/external-sources";
import { getSupabaseAdmin } from "@/lib/supabase";
import { buildMethodologyProps, METHODOLOGY_PATH } from "../../(marketing)/methodology/methodology-content";
import { MethodologyPage } from "../../(marketing)/methodology/methodology-page";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("vi");
  return pageMetadata({
    title: t(m, "meta.methodology.title"),
    description: t(m, "meta.methodology.description"),
    path: `/vi${METHODOLOGY_PATH}`,
    viPath: `/vi${METHODOLOGY_PATH}`,
    lang: "vi",
  });
}

export default async function ViMethodologyRoute() {
  const m = await getMessages("vi");
  // S40: the "Data sources" table reads external_sources (0410); before the
  // migration — or with no service client — the code catalogue renders.
  const sources = await loadExternalSources(getSupabaseAdmin());
  return <MethodologyPage {...buildMethodologyProps(m, "vi", { sources })} />;
}
