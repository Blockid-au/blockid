// revision-position — G34 BT3 (spec §3 "Old revision"). Where a public
// /tbr/[token] revision sits in its project's immutable history
// (`report_revisions`, pending-authority 0461): "Viewing rev 2 (12/08).
// Latest rev 3 (25/09) ›".
//
// Numbering counts EVERY row of the project in creation order (a later
// revoke never renumbers what readers were sent); "latest" is the newest
// row that is not revoked. Legacy `svi_snapshots.report_share_token` links
// have no revision row → null (no banner): the mutable snapshot projection
// is not a revision.
//
// The latest row's share token is returned for the caller to decide who may
// receive it — the share page hands it only to the project owner, never to
// an anonymous reader of an older link (a revision token is minted per
// finalised document, not by a founder's share action).

import type { SupabaseClient } from "@supabase/supabase-js";

export interface RevisionRowLike {
  id: string;
  share_token: string;
  created_at: string;
  revoked_at: string | null;
}

export interface RevisionPosition {
  projectId: string;
  current: { n: number; createdAt: string };
  latest: { n: number; createdAt: string; shareToken: string };
}

/** Pure: position of `currentId` among a project's revision rows (any order). Null when absent. */
export function revisionPositionFrom(rows: readonly RevisionRowLike[], currentId: string, projectId: string): RevisionPosition | null {
  const ordered = [...rows].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id));
  const idx = ordered.findIndex((r) => r.id === currentId);
  if (idx < 0) return null;
  let latestIdx = -1;
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    if (!ordered[i].revoked_at) {
      latestIdx = i;
      break;
    }
  }
  if (latestIdx < 0) return null;
  const latest = ordered[latestIdx];
  return {
    projectId,
    current: { n: idx + 1, createdAt: ordered[idx].created_at },
    latest: { n: latestIdx + 1, createdAt: latest.created_at, shareToken: latest.share_token },
  };
}

/** The page-1 banner props (`TbrRevisionInfo`): null when this revision is the latest. */
export interface RevisionBannerInfo {
  current: { n: number; createdAt: string };
  latest: { n: number; createdAt: string };
  latestHref: string | null;
}

/**
 * Banner data for a viewer. The latest revision's link is handed only to the
 * project owner (`projects.user_id`); everyone else reads "ask the founder".
 */
export async function revisionBannerFor(position: RevisionPosition | null, viewerUserId: string | null, db: SupabaseClient | null, basePath = "/tbr"): Promise<RevisionBannerInfo | null> {
  if (!position || position.current.n >= position.latest.n) return null;
  let owner = false;
  if (viewerUserId && db) {
    try {
      const { data } = await db.from("projects").select("user_id").eq("id", position.projectId).maybeSingle();
      owner = (data as { user_id?: unknown } | null)?.user_id === viewerUserId;
    } catch {
      owner = false;
    }
  }
  return {
    current: position.current,
    latest: { n: position.latest.n, createdAt: position.latest.createdAt },
    latestHref: owner ? `${basePath}/${encodeURIComponent(position.latest.shareToken)}` : null,
  };
}

/**
 * The snapshot behind an immutable revision token (null = not a revision
 * token / revoked / no table). Lets the web share page resolve the same
 * tokens the PDF / DOCX readers (`loadReportV2ByShareToken`) already serve.
 */
export async function snapshotIdForRevisionToken(token: string, db: SupabaseClient | null): Promise<string | null> {
  if (!db || !token) return null;
  try {
    const { data, error } = await db.from("report_revisions").select("snapshot_id").eq("share_token", token).is("revoked_at", null).maybeSingle();
    const id = (data as { snapshot_id?: unknown } | null)?.snapshot_id;
    return !error && typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}

/** The revision position behind a share token (null = legacy snapshot token, no table, no DB, or any read error). */
export async function loadRevisionPosition(token: string, db: SupabaseClient | null): Promise<RevisionPosition | null> {
  if (!db || !token) return null;
  try {
    const { data: row, error } = await db.from("report_revisions").select("id, project_id").eq("share_token", token).is("revoked_at", null).maybeSingle();
    const current = row as { id?: unknown; project_id?: unknown } | null;
    if (error || !current || typeof current.id !== "string" || typeof current.project_id !== "string") return null;
    const { data: list, error: listError } = await db
      .from("report_revisions")
      .select("id, share_token, created_at, revoked_at")
      .eq("project_id", current.project_id)
      .order("created_at", { ascending: true })
      .limit(500);
    if (listError || !Array.isArray(list)) return null;
    return revisionPositionFrom(list as RevisionRowLike[], current.id, current.project_id);
  } catch {
    return null;
  }
}
