// "What BlockID holds about this startup" — the data-ethics panel on
// /workspace/evidence/corrections (G21 P1-C; FI data-ethics § 47).
//
// Pure builder (`buildDataEthicsPanel`) over five reads the server page
// performs, each degrading to empty on failure:
//   evidence     svi_dimension_evidence rows for the project → status counts
//   access       who can see THIS startup: active investor links attributed
//                to the project (see below), mentor / advisor grants scoped
//                to the project (or to all the founder's projects), accepted
//                project members, evaluators holding an `evaluations` row
//                for the project (they read claims via GET
//                /api/projects/[id]/claims — lib/evidence/claims-access.ts)
//   shared       what was shared: investor-link opens + data-room opens
//   refreshed    connector freshness (oauth_connections_v2.last_sync_at,
//                connector_snapshots.taken_at) + last analysis time
//   revoke       links to the EXISTING revoke UI (/workspace/investors/access)
//
// Project scoping (G21 P1 post-ship review, P1): the founder-wide readers
// (`listInvestorLinksForFounder`, `loadAllGrantsForFounder`,
// `listConnections`) return rows for EVERY project the founder owns, so the
// builder filters them to the current project. Investor links hang off the
// legacy `scores` row (no project key), so a link is attributed to the
// project when its score's `company_name` matches the project name
// (`matchesProjectName`); links that cannot be attributed are counted in
// `unattributedInvestorLinks` and pointed at the full list on
// /workspace/investors/access rather than shown as access to THIS startup.
// Grants / connections with a NULL project_id apply to all the founder's
// projects and are kept. The page shows the panel to owner / admin only.

export interface EvidenceCounts {
  total: number;
  verified: number;
  pendingReview: number;
  byLevel: Record<string, number>;
}

export interface AccessEntry {
  kind: "investor_link" | "mentor_grant" | "member" | "evaluator";
  label: string;
  detail: string | null;
  /** ISO — when the access ends, if it does. */
  until: string | null;
}

export interface SharedEntry {
  label: string;
  views: number;
  lastViewedAt: string | null;
}

export interface FreshnessEntry {
  label: string;
  /** ISO of the last successful refresh, or null when never. */
  at: string | null;
  status: "fresh" | "stale" | "never" | "error";
  note: string | null;
}

export interface DataEthicsPanel {
  evidence: EvidenceCounts;
  access: AccessEntry[];
  shared: SharedEntry[];
  refreshed: FreshnessEntry[];
  lastAnalysisAt: string | null;
  /** Investor links on the founder's account that could not be attributed to this project (not shown as access). */
  unattributedInvestorLinks: number;
  links: { scoreLogic: string; revokeAccess: string; revokeMentors: string; connectors: string };
}

/** A connector refresh older than this is "stale" (trust metric, P3-C aligns). */
export const CONNECTOR_STALE_DAYS = 35;

export interface DataEthicsInput {
  now?: Date;
  /**
   * The project the panel is scoped to. When set, founder-wide rows are
   * filtered: investor links by `companyName` ↔ `projectName`, grants and
   * connections by `project_id` (NULL = all projects → kept). Omit both to
   * skip scoping (legacy single-project callers / tests).
   */
  projectId?: string | null;
  projectName?: string | null;
  evidenceRows: Array<{ confidence_level: string | null; is_verified: boolean | null; review_status: string | null }>;
  investorLinks: Array<{
    investorName: string | null;
    investorEmail: string | null;
    fundName: string | null;
    revokedAt: string | null;
    expiresAt: string | null;
    viewCount: number;
    lastViewedAt: string | null;
    /** `scores.company_name` of the shared score — the only project attribution a legacy investor link carries. */
    companyName?: string | null;
  }>;
  mentorGrants: Array<{ tier: string; mentor_user_id: string | null; reseller_id: string | null; project_id?: string | null; granted_at: string; expires_at: string | null; revoked_at: string | null }>;
  members: Array<{ email: string | null; role: string | null }>;
  /** `evaluations` rows for THIS project — every one lets that evaluator read the project's claims at its consent tier. */
  evaluators?: Array<{ evaluatorEmail: string | null; consentTier: string | null; claimedAt: string | null }>;
  dataRoomViews: { views: number; lastViewedAt: string | null } | null;
  connections: Array<{ provider: string; status: string; lastSyncAt: string | null; lastSyncError: string | null; tokenUnreadable?: boolean; projectId?: string | null }>;
  snapshots: Array<{ provider: string; taken_at: string }>;
  lastAnalysisAt: string | null;
}

const TIER_LABEL: Record<string, string> = {
  attributed_only: "attributed only — statuses and counts, no records",
  reports_shared: "reports shared — claim records without source links",
  full_mentor: "full mentor — claim records with source links",
};

function normaliseName(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/\b(pty|ltd|limited|inc|llc|co)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Whether a legacy investor link (keyed on a `scores` row that has no
 * project id) belongs to the project: the score's company name and the
 * project name agree once case, punctuation and entity suffixes are
 * stripped. Unknown company name → not attributable.
 */
export function matchesProjectName(companyName: string | null | undefined, projectName: string | null | undefined): boolean {
  const a = normaliseName(companyName);
  const b = normaliseName(projectName);
  return a.length > 0 && b.length > 0 && a === b;
}

/** Grants / connections carry an optional project_id: NULL = every project of the founder. */
function inProject(rowProjectId: string | null | undefined, projectId: string | null | undefined): boolean {
  if (!projectId) return true;
  return rowProjectId == null || rowProjectId === projectId;
}

const PROVIDER_LABEL: Record<string, string> = { github: "GitHub", stripe: "Stripe", ga4: "Google Analytics", xero: "Xero" };

function isActive(revokedAt: string | null, expiresAt: string | null, now: Date): boolean {
  if (revokedAt) return false;
  if (expiresAt && new Date(expiresAt).getTime() < now.getTime()) return false;
  return true;
}

function mask(email: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return `${local.slice(0, 1)}***@${domain}`;
}

export function buildDataEthicsPanel(input: DataEthicsInput): DataEthicsPanel {
  const now = input.now ?? new Date();

  const byLevel: Record<string, number> = {};
  let verified = 0;
  let pendingReview = 0;
  for (const r of input.evidenceRows) {
    const lvl = r.confidence_level ?? "unknown";
    byLevel[lvl] = (byLevel[lvl] ?? 0) + 1;
    if (r.is_verified) verified++;
    if (r.review_status === "pending") pendingReview++;
  }

  // ── project scoping of the founder-wide reads ──
  const scoped = Boolean(input.projectId || input.projectName);
  const investorLinks = scoped ? input.investorLinks.filter((l) => matchesProjectName(l.companyName, input.projectName)) : input.investorLinks;
  const unattributedInvestorLinks = input.investorLinks.length - investorLinks.length;
  const mentorGrants = input.mentorGrants.filter((g) => inProject(g.project_id, input.projectId));
  const connections = input.connections.filter((c) => inProject(c.projectId, input.projectId));

  const access: AccessEntry[] = [];
  for (const l of investorLinks) {
    if (!isActive(l.revokedAt, l.expiresAt, now)) continue;
    access.push({ kind: "investor_link", label: l.investorName || l.fundName || mask(l.investorEmail) || "Unnamed investor link", detail: l.fundName && l.investorName ? l.fundName : null, until: l.expiresAt });
  }
  for (const g of mentorGrants) {
    if (!isActive(g.revoked_at, g.expires_at, now)) continue;
    access.push({ kind: "mentor_grant", label: g.reseller_id ? "Advisor / program (reseller grant)" : "Mentor", detail: `${g.tier.replace(/_/g, " ")} access`, until: g.expires_at });
  }
  for (const m of input.members) {
    access.push({ kind: "member", label: mask(m.email) ?? "Team member", detail: m.role ? `${m.role} on this startup` : null, until: null });
  }
  for (const e of input.evaluators ?? []) {
    const tier = e.consentTier ?? "attributed_only";
    access.push({
      kind: "evaluator",
      label: mask(e.evaluatorEmail) ?? "Evaluator",
      detail: `evaluator · ${TIER_LABEL[tier] ?? tier.replace(/_/g, " ")}${e.claimedAt ? "" : " · not yet claimed by you"}`,
      until: null,
    });
  }

  const shared: SharedEntry[] = [];
  for (const l of investorLinks) {
    if (l.viewCount <= 0) continue;
    shared.push({ label: `Investor link — ${l.investorName || l.fundName || mask(l.investorEmail) || "unnamed"}${l.revokedAt ? " (revoked)" : ""}`, views: l.viewCount, lastViewedAt: l.lastViewedAt });
  }
  if (input.dataRoomViews && input.dataRoomViews.views > 0) {
    shared.push({ label: "Public score page / data room", views: input.dataRoomViews.views, lastViewedAt: input.dataRoomViews.lastViewedAt });
  }
  shared.sort((a, b) => (b.lastViewedAt ?? "").localeCompare(a.lastViewedAt ?? ""));

  const refreshed: FreshnessEntry[] = [];
  const staleMs = CONNECTOR_STALE_DAYS * 24 * 60 * 60 * 1000;
  const seen = new Set<string>();
  for (const c of connections) {
    if (c.status !== "active" || seen.has(c.provider)) continue;
    seen.add(c.provider);
    const snap = input.snapshots.filter((s) => s.provider === c.provider).sort((a, b) => b.taken_at.localeCompare(a.taken_at))[0];
    const at = [c.lastSyncAt, snap?.taken_at ?? null].filter((v): v is string => Boolean(v)).sort().pop() ?? null;
    const label = PROVIDER_LABEL[c.provider] ?? c.provider;
    if (c.tokenUnreadable || c.lastSyncError) refreshed.push({ label, at, status: "error", note: c.tokenUnreadable ? "reconnect needed" : c.lastSyncError });
    else if (!at) refreshed.push({ label, at: null, status: "never", note: "connected, not yet synced" });
    else refreshed.push({ label, at, status: now.getTime() - new Date(at).getTime() > staleMs ? "stale" : "fresh", note: null });
  }
  for (const s of input.snapshots) {
    if (seen.has(s.provider)) continue;
    seen.add(s.provider);
    refreshed.push({ label: PROVIDER_LABEL[s.provider] ?? s.provider, at: s.taken_at, status: now.getTime() - new Date(s.taken_at).getTime() > staleMs ? "stale" : "fresh", note: null });
  }

  return {
    evidence: { total: input.evidenceRows.length, verified, pendingReview, byLevel },
    access,
    shared,
    refreshed,
    lastAnalysisAt: input.lastAnalysisAt,
    unattributedInvestorLinks,
    links: {
      scoreLogic: "/methodology/governance",
      revokeAccess: "/workspace/investors/access#investor-links",
      revokeMentors: "/workspace/investors/access#mentor-access",
      connectors: "/workspace/evidence/connectors",
    },
  };
}
