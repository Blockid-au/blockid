// /es/tbr/[token] — HIDDEN (G20-F1, 2026-09-20; founder decision F-3: only
// /vi is a maintained mirror). Key: locale_es.
//
// Was an unmaintained fork of /tbr/[token] (missing the score total, the
// view beacon and the lead modal, bare-number dimension scores rendered as
// "idle"). Nothing linked here. The route stays so an old share link lands
// on a clear card that points at the English report for the same token.

import type { Metadata } from "next";
import { Languages } from "lucide-react";
import { NotOfferedCard } from "@/components/workspace/not-offered-card";
import { assertHidden, hiddenPageMetadata } from "@/components/workspace/hidden-feature-page";

export const metadata: Metadata = hiddenPageMetadata("Informe en español");
export const dynamic = "force-dynamic";

export default async function EsTbrPage({ params }: { params: Promise<{ token: string }> }) {
  assertHidden("locale_es", "/es/tbr/x");
  const { token } = await params;
  const safe = encodeURIComponent(token);
  return (
    <main className="min-h-screen bg-surface px-4 py-16">
      <NotOfferedCard
        feature="locale_es"
        title="Informe en español"
        icon={Languages}
        reason="The Spanish edition of the Trusted Business Report is not offered. The same report is available in English and Vietnamese."
        alternatives={[
          { href: `/tbr/${safe}`, label: "Open this report in English" },
          { href: `/vi/tbr/${safe}`, label: "Mở báo cáo này bằng tiếng Việt" },
        ]}
        backHref={`/tbr/${safe}`}
        backLabel="English report"
      />
    </main>
  );
}
