// "What BlockID holds about this startup" — the data-ethics panel on
// /workspace/evidence/corrections (G21 P1-C; FI data-ethics § 47).
//
// Pure builder (`buildDataEthicsPanel`) over five reads the server page
// performs, each degrading to empty on failure:
//   evidence     svi_dimension_evidence rows for the project → status counts
//   access       who can see the startup: active investor links, mentor /
//                advisor grants, accepted project members
//   shared       what was shared: investor-link opens + data-room opens
//   refreshed    connector freshness (oauth_connections_v2.last_sync_at,
//                connector_snapshots.taken_at) + last analysis time
//   revoke       links to the EXISTING revoke UI (/workspace/investors/access)

export interface EvidenceCounts {
  total: number;
  verified: number;
  pendingReview: number;
  byLevel: Record<string, number>;
}

export interface AccessEntry {
  kind: "investor_link" | "mentor_grant" | "member";
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
  links: { scoreLogic: string; revokeAccess: string; revokeMentors: string; connectors: string };
}

/** A connector refresh older than this is "stale" (trust metric, P3-C aligns). */
export const CONNECTOR_STALE_DAYS = 35;

export interface DataEthicsInput {
  now?: Date;
  evidenceRows: Array<{ confidence_level: string | null; is_verified: boolean | null; review_status: string | null }>;
  investorLinks: Array<{ investorName: string | null; investorEmail: string | null; fundName: string | null; revokedAt: string | null; expiresAt: string | null; viewCount: number; lastViewedAt: string | null }>;
  mentorGrants: Array<{ tier: string; mentor_user_id: string | null; reseller_id: string | null; granted_at: string; expires_at: string | null; revoked_at: string | null }>;
  members: Array<{ email: string | null; role: string | null }>;
  dataRoomViews: { views: number; lastViewedAt: string | null } | null;
  connections: Array<{ provider: string; status: string; lastSyncAt: string | null; lastSyncError: string | null; tokenUnreadable?: boolean }>;
  snapshots: Array<{ provider: string; taken_at: string }>;
  lastAnalysisAt: string | null;
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

  const access: AccessEntry[] = [];
  for (const l of input.investorLinks) {
    if (!isActive(l.revokedAt, l.expiresAt, now)) continue;
    access.push({ kind: "investor_link", label: l.investorName || l.fundName || mask(l.investorEmail) || "Unnamed investor link", detail: l.fundName && l.investorName ? l.fundName : null, until: l.expiresAt });
  }
  for (const g of input.mentorGrants) {
    if (!isActive(g.revoked_at, g.expires_at, now)) continue;
    access.push({ kind: "mentor_grant", label: g.reseller_id ? "Advisor / program (reseller grant)" : "Mentor", detail: `${g.tier.replace(/_/g, " ")} access`, until: g.expires_at });
  }
  for (const m of input.members) {
    access.push({ kind: "member", label: mask(m.email) ?? "Team member", detail: m.role ? `${m.role} on this startup` : null, until: null });
  }

  const shared: SharedEntry[] = [];
  for (const l of input.investorLinks) {
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
  for (const c of input.connections) {
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
    links: {
      scoreLogic: "/methodology/governance",
      revokeAccess: "/workspace/investors/access#investor-links",
      revokeMentors: "/workspace/investors/access#mentor-access",
      connectors: "/workspace/evidence/connectors",
    },
  };
}
