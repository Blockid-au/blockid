// /workspace/evidence/corrections — founder correction workflow (G21 P1-C;
// score-governance § 10; FI data-ethics § 47).
//
// Three things on one page, available on Free, h1 outside any gate:
//   1. "What BlockID holds about this startup" — evidence status counts,
//      the score-logic link, WHO has access (active investor links, mentor /
//      advisor grants, team members), WHAT was shared (link opens), LAST
//      refreshed (connector freshness + last analysis) and links to the
//      existing revoke UI (/workspace/investors/access). Nothing is rebuilt.
//   2. the correction form (kind · target picker · message · proposal for a
//      sector / stage correction) → POST /api/corrections (owner only).
//   3. the founder's corrections with status + resolution — logged, never
//      overwritten: an accepted correction shows what was (not) changed.
//
// Member-aware like the sibling tabs: members see the record + the list,
// only the owner files (the record is the founder's).

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectScope, getCurrentProjectIsSandbox } from "@/lib/projects";
import { pageScopeKeys } from "@/lib/project-members/page-scope";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { PageTracker } from "@/components/analytics/page-tracker";
import { ViewOnlyNote } from "@/components/workspace/view-only-note";
import { listProjectCorrections } from "@/lib/corrections/service";
import { buildDataEthicsPanel, type DataEthicsPanel } from "@/lib/corrections/data-ethics";
import type { CorrectionRow } from "@/lib/corrections/model";
import { CorrectionsClient } from "./corrections-client";
import { DataEthicsPanelView } from "./data-ethics-panel";

export const metadata: Metadata = {
  title: "Corrections & your data",
  description: "Flag incorrect or stale data, a misunderstood piece of evidence, a duplicate company, a wrong sector or stage, or an unsupported report statement — and see exactly what BlockID holds about your startup, who can see it and when it was last refreshed.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function loadPanel(userId: string, email: string, projectId: string): Promise<DataEthicsPanel> {
  const sb = getSupabaseAdmin();
  const empty = { now: new Date(), evidenceRows: [], investorLinks: [], mentorGrants: [], members: [], dataRoomViews: null, connections: [], snapshots: [], lastAnalysisAt: null };
  if (!sb) return buildDataEthicsPanel(empty);

  const safe = async <T,>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      console.warn(`[corrections] ${label}`, err instanceof Error ? err.message : String(err));
      return fallback;
    }
  };

  const [evidenceRows, investorLinks, mentorGrants, members, connections, snapshots, lastAnalysis, dataRoom] = await Promise.all([
    safe("evidence", async () => {
      const { data } = await sb.from("svi_dimension_evidence").select("confidence_level, is_verified, review_status").eq("project_id", projectId);
      return (data ?? []) as Array<{ confidence_level: string | null; is_verified: boolean | null; review_status: string | null }>;
    }, []),
    safe("investor links", async () => (await import("@/lib/investor-links")).listInvestorLinksForFounder(userId, email), []),
    safe("mentor grants", async () => (await import("@/lib/mentor/access-tiers-server")).loadAllGrantsForFounder(userId), []),
    safe("members", async () => {
      const rows = await (await import("@/lib/project-members/scope")).listMembers(projectId);
      return rows.filter((m) => m.status === "accepted").map((m) => ({ email: m.userEmail, role: m.role }));
    }, []),
    safe("connections", async () => (await import("@/lib/oauth-connectors")).listConnections(userId), []),
    safe("snapshots", async () => {
      const h = await (await import("@/lib/connectors/snapshots")).loadSnapshotHistory(sb, { userId, projectId });
      return Object.values(h).map((x) => ({ provider: x.latest.provider, taken_at: x.latest.taken_at }));
    }, []),
    safe("last analysis", async () => {
      const { data } = await sb.from("svi_analyses").select("created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return ((data as { created_at?: string } | null)?.created_at as string | undefined) ?? null;
    }, null),
    safe("data room", async () => {
      const { data: analyses } = await sb.from("svi_analyses").select("id").eq("project_id", projectId).order("created_at", { ascending: false }).limit(20);
      const ids = ((analyses ?? []) as Array<{ id: string }>).map((a) => a.id);
      if (ids.length === 0) return null;
      const { data: logs } = await sb.from("investor_access_log").select("accessed_at").in("score_id", ids).order("accessed_at", { ascending: false }).limit(500);
      const rows = (logs ?? []) as Array<{ accessed_at: string }>;
      return { views: rows.length, lastViewedAt: rows[0]?.accessed_at ?? null };
    }, null),
  ]);

  return buildDataEthicsPanel({
    now: new Date(),
    evidenceRows,
    investorLinks: investorLinks.map((l) => ({ investorName: l.investorName, investorEmail: l.investorEmail, fundName: l.fundName, revokedAt: l.revokedAt, expiresAt: l.expiresAt, viewCount: l.viewCount, lastViewedAt: l.lastViewedAt })),
    mentorGrants: mentorGrants.map((g) => ({ tier: String(g.tier), mentor_user_id: g.mentor_user_id ?? null, reseller_id: g.reseller_id ?? null, granted_at: g.granted_at, expires_at: g.expires_at ?? null, revoked_at: g.revoked_at ?? null })),
    members,
    dataRoomViews: dataRoom,
    connections: connections.map((c) => ({ provider: c.provider, status: c.status, lastSyncAt: c.lastSyncAt, lastSyncError: c.lastSyncError, tokenUnreadable: c.tokenUnreadable })),
    snapshots,
    lastAnalysisAt: lastAnalysis,
  });
}

export default async function CorrectionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/evidence/corrections");

  const isSandbox = await getCurrentProjectIsSandbox();
  const scope = await getProjectScope("viewer");
  const { projectId, role, canEdit, isMember } = pageScopeKeys(scope, user);
  const isOwner = Boolean(projectId) && !isMember;

  let corrections: CorrectionRow[] = [];
  let panel: DataEthicsPanel | null = null;
  const sb = getSupabaseAdmin();
  if (sb && projectId) {
    try {
      corrections = await listProjectCorrections(sb, projectId);
    } catch {
      corrections = [];
    }
    const ownerId = scope?.ownerUserId ?? user.id;
    const ownerEmail = scope?.dataEmail ?? user.email;
    panel = await loadPanel(ownerId, ownerEmail, projectId);
  }

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <PageTracker page="evidence-corrections" />
      <div className="p-6 max-w-4xl mx-auto space-y-10" data-workspace-corrections>
        <header>
          <h1 className="text-xl font-bold text-ink-800">Corrections &amp; your data</h1>
          <p className="text-sm text-ink-700 mt-1 max-w-2xl">
            Flag anything BlockID holds or says about your startup that is wrong, stale, misread, duplicated or unsupported. A correction is logged and reviewed by a person; nothing is overwritten
            silently — the resolution records exactly what changed. Score logic:{" "}
            <Link href="/methodology/governance" className="text-brand-700 underline decoration-dotted underline-offset-4">
              how the score is governed
            </Link>
            .
          </p>
        </header>

        {isMember && !canEdit && <ViewOnlyNote role={role} action="file a correction" />}

        {!projectId ? (
          <p className="text-sm text-ink-600" data-testid="corrections-no-project">
            Create or select a project first.
          </p>
        ) : (
          <>
            {panel ? <DataEthicsPanelView panel={panel} /> : null}
            <CorrectionsClient projectId={projectId} initial={corrections} canFile={isOwner} />
          </>
        )}
      </div>
    </WorkspaceLayout>
  );
}
