// /analyze/[id] — one saved run.
//
// Route choice: `/analyze/[id]`, not a new `/a/[id]` namespace. The id is a
// child of the tool that produced it, so the URL explains itself when a
// founder pastes it into a chat with a co-founder or an investor, it keeps
// every analysis surface under one segment, and it does not burn a two-letter
// top-level route that would then have to be defended forever.
//
// A saved analysis is private (migration 0124) and the API answers 404 to
// anyone not entitled, so the page is noindex and the shell carries no hint
// about whether the id exists.

import type { Metadata } from "next";

import { SavedAnalysisView } from "./saved-analysis-view";
import { parseClaimedParam } from "@/lib/analyses/summary";

export const metadata: Metadata = {
  title: "Your saved analysis · BlockID",
  description: "A Startup Value Index analysis you have already run.",
  robots: { index: false, follow: false },
};

export default async function SavedAnalysisPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ claimed?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const claimed = parseClaimedParam(sp.claimed);

  return (
    <main className="min-h-screen bg-surface pb-16">
      <SavedAnalysisView id={id} claimed={claimed} />
    </main>
  );
}
