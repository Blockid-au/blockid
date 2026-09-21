/**
 * /vi/methodology/versions — Vietnamese mirror of the SVI version history
 * page (G21 P3-C). Translated chrome; the table rows are English (the
 * governance document is English).
 */

import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/page-meta";
import { SVI_VERSION } from "@/lib/svi-analysis";
import { VERSIONS_VI_PATH } from "@/lib/svi/version-history";
import { VersionsBody } from "../../../(marketing)/methodology/versions/versions-body";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "Lịch sử phiên bản phương pháp",
    description: `Mọi phiên bản Startup Value Index (hiện tại v${SVI_VERSION}): ngày phát hành, thay đổi, loại thay đổi và ảnh hưởng đến khả năng so sánh với các snapshot trước.`,
    path: VERSIONS_VI_PATH,
    viPath: VERSIONS_VI_PATH,
    lang: "vi",
  });
}

export default function ViVersionsRoute() {
  return <VersionsBody locale="vi" />;
}
