/**
 * /methodology/versions — Startup Value Index version history (G21 P3-C).
 *
 * The `SVI_VERSION` history table (lib/svi/version-history.ts) as a page:
 * version, date, what changed, change type, and each version's effect on
 * comparability with earlier snapshots. Linked from /methodology and from
 * § 5 of /methodology/governance; `/vi/methodology/versions` is the mirror.
 */

import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/page-meta";
import { SVI_VERSION } from "@/lib/svi-analysis";
import { VERSIONS_PATH, VERSIONS_VI_PATH } from "@/lib/svi/version-history";
import { VersionsBody } from "./versions-body";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "Methodology version history",
    description: `Every Startup Value Index version (current v${SVI_VERSION}): the date it went live, what changed, the change type, and its effect on comparability with earlier snapshots.`,
    path: VERSIONS_PATH,
    viPath: VERSIONS_VI_PATH,
  });
}

export default function VersionsRoute() {
  return <VersionsBody locale="en" />;
}
