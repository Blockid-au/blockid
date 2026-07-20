/**
 * /svi — public SVI analyzer.
 *
 * Landing target from the homepage HeroSearch. Renders the full SVIEntrance
 * analyzer so a founder can (a) paste an idea / URL / pitch, (b) get a live
 * SVI score across 13 criteria, and (c) receive the report by email. The
 * hero form passes ?query=<text> which SVIEntrance prefills into the
 * textarea via its own useSearchParams effect (see svi-entrance.tsx).
 *
 * Unauthenticated visitors get one free analysis (credit gate handles the
 * rest). Logged-in users can also run per-project analyses at
 * /workspace/projects/[id]/analyze, which persists results into that
 * project and emails the report from the project context.
 *
 * `robots: noindex, nofollow` — this is a stateful tool surface, not
 * ranking content.
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import { SVIEntrance } from "@/components/svi/svi-entrance";

const SITE_URL = "https://blockid.au";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Startup Value Index — analyse any idea, URL or pitch",
  description:
    "Paste an idea, website, or pitch — get an investor-ready SVI score across 13 criteria in ~30 seconds. Report emailed automatically.",
  alternates: { canonical: `${SITE_URL}/svi` },
  robots: { index: false, follow: false },
};

export default function SVIAnalyzerPage() {
  return (
    <Suspense>
      <SVIEntrance />
    </Suspense>
  );
}
