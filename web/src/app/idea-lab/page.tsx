// /idea-lab — short-URL alias for the canonical tool at /tools/idea-lab.
//
// The canonical page lives at /tools/idea-lab (see src/app/tools/idea-lab/
// page.tsx). Founders sometimes type the shorter URL, and some external
// marketing links dropped the /tools/ prefix; those requests would 404
// without this alias. Server-side redirect keeps the canonical URL in
// sitemap.ts and preserves the tool's SEO metadata.

import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "AI Idea Lab — Sector-Aware Startup Angles for AU Founders",
  description:
    "Pick a sector, describe a broad problem area, and generate 10 concrete startup angles, 5 non-obvious opportunities and 3 real Australian competitors. Free to try.",
  alternates: {
    canonical: "https://blockid.au/tools/idea-lab",
  },
  robots: { index: false, follow: true },
};

export default function IdeaLabAliasPage(): never {
  redirect("/tools/idea-lab");
}
