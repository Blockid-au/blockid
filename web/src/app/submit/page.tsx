// /submit — HIDDEN (G20-F1, 2026-09-20). Key: public_listing_submission.
//
// Was the public "Submit your startup to the AU Startup Public Index" form
// (T-1301). It wrote to `public_index_submissions`, which nothing reads —
// no ticker was ever reserved and the promised "live within 24 hours" never
// happened. Index rows are computed from graded reports
// (lib/startup-index-listings.ts), so the honest door is the free score.
// The route stays (external links, `/apply/<slug>` copy) and answers the
// shared card, noindex; the sitemap never listed it.
//
// Un-hiding: remove the HIDDEN_FEATURES row and restore submit-form.tsx +
// the previous page from history once a reader for the submissions exists.

import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { NotOfferedCard } from "@/components/workspace/not-offered-card";
import { assertHidden, hiddenPageMetadata } from "@/components/workspace/hidden-feature-page";

export const metadata: Metadata = hiddenPageMetadata("Submit your startup");

const FEATURE = "public_listing_submission";
const PATH = "/submit";

export default function SubmitPage() {
  assertHidden(FEATURE, PATH);
  return (
    <MarketingShell>
      <section className="mx-auto max-w-2xl px-4 py-16 sm:py-24">
        <NotOfferedCard
          feature={FEATURE}
          title="Submit your startup"
          icon={BarChart3}
          reason="A self-serve listing form is not offered yet. Every startup that runs the free score is already ranked on the Startup Value Index from its graded report — nothing to submit."
          alternatives={[
            { href: "/analyze", label: "Score your startup — free, 60 seconds" },
            { href: "/startup-index", label: "Browse the Startup Value Index" },
          ]}
          backHref="/startup-index"
          backLabel="Back to the index"
        />
      </section>
    </MarketingShell>
  );
}
