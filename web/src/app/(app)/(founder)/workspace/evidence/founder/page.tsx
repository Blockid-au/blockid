// /workspace/evidence/founder — the LinkedIn evidence step (G13-W5-R5 /
// S-R5, spec §C.7 row 1). The founder uploads their LinkedIn "Save to PDF"
// export, pastes the profile text, or gives the profile URL; the parser
// (lib/connectors/linkedin-upload.ts) turns it into founder_signals (years
// in domain, prior companies, exits, team size on the page) that the FTV
// chapter cites on the next report. Nothing is scraped — a URL is stored
// and displayed, never fetched. Parsed fields only are kept.
//
// Member-aware like the sibling tabs: editor+ may upload, viewers see the
// current signals read-only.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectScope, getCurrentProjectIsSandbox } from "@/lib/projects";
import { pageScopeKeys } from "@/lib/project-members/page-scope";
import { loadLatestFounderSignals, type FounderSignalsDb } from "@/lib/connectors/linkedin-upload";
import { ViewOnlyNote } from "@/components/workspace/view-only-note";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { PageTracker } from "@/components/analytics/page-tracker";
import { FounderSignalsClient, type FounderSignalsView } from "./founder-client";

export const metadata: Metadata = {
  title: "Founder evidence",
  description: "Upload your LinkedIn export or profile URL so the Founder & Team chapter cites real experience, exits and team size.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function FounderEvidencePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/evidence/founder");

  const isSandbox = await getCurrentProjectIsSandbox();
  const scope = await getProjectScope("viewer");
  const { projectId, role, canEdit, isMember } = pageScopeKeys(scope, user);

  let current: FounderSignalsView | null = null;
  const sb = getSupabaseAdmin();
  if (sb && projectId) {
    const s = await loadLatestFounderSignals(sb as unknown as FounderSignalsDb, projectId);
    if (s) {
      current = {
        source: s.source,
        profileUrl: s.profileUrl,
        founderName: s.founderName,
        headline: s.headline,
        currentRole: s.currentRole,
        yearsExperience: s.yearsExperience,
        yearsInDomain: s.yearsInDomain,
        priorCompanies: s.priorCompanies,
        exits: s.exits,
        teamSizeOnPage: s.teamSizeOnPage,
        roles: s.roles.map((r) => ({ company: r.company, title: r.title, start: r.start, end: r.end, current: r.current, exit: r.exit })),
        education: s.education,
        confidence: s.confidence,
        parsedAt: s.parsedAt,
      };
    }
  }

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <PageTracker page="evidence-founder" />
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink-800">Founder evidence</h1>
          <p className="text-sm text-ink-700 mt-1">
            The Founder &amp; Team chapter (FTV) cites years in your domain, prior companies, exits and team size. Upload your LinkedIn export
            (Profile → More → Save to PDF), paste the profile text, or add the profile URL. We keep the parsed fields only — never the PDF or the raw text.
          </p>
        </div>

        {isMember && !canEdit && <ViewOnlyNote role={role} action="upload founder evidence" className="mb-4" />}
        {!projectId ? <p className="text-sm text-ink-600">Create or select a project first.</p> : <FounderSignalsClient initial={current} readOnly={!canEdit} />}
      </div>
    </WorkspaceLayout>
  );
}
