// Per-investor View Link helpers (server-only).
//
// One investor_link row = one shareable URL the founder hands to one named
// investor. Opens are recorded against the token so the founder sees per-
// investor attribution instead of a flat anonymous view count.
//
// Notification debounce: when an investor opens a link, we only email the
// founder if we haven't already emailed for the same (link, viewer-day-hash)
// combination in the last NOTIFY_DEBOUNCE_MS window. This stops a refresh or
// PDF download from generating a stream of "your score was viewed" emails.

import "server-only";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { newInvestorToken } from "@/lib/slug";

export interface InvestorLink {
  token: string;
  slug: string | null;
  scoreId: string;
  founderUserId: string | null;
  investorEmail: string | null;
  investorName: string | null;
  fundName: string | null;
  note: string | null;
  createdByEmail: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface InvestorLinkView {
  id: string;
  linkToken: string;
  scoreId: string;
  viewerIpHash: string | null;
  viewerUa: string | null;
  referer: string | null;
  durationMs: number | null;
  viewedAt: string;
}

interface InvestorLinkRow {
  token: string;
  slug: string | null;
  score_id: string;
  founder_user_id: string | null;
  investor_email: string | null;
  investor_name: string | null;
  fund_name: string | null;
  note: string | null;
  created_by_email: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
}

interface InvestorLinkViewRow {
  id: string;
  link_token: string;
  score_id: string;
  viewer_ip_hash: string | null;
  viewer_ua: string | null;
  referer: string | null;
  duration_ms: number | null;
  viewed_at: string;
}

const NOTIFY_DEBOUNCE_MS = 6 * 60 * 60 * 1000; // 6 hours

function rowToLink(row: InvestorLinkRow): InvestorLink {
  return {
    token: row.token,
    slug: row.slug ?? null,
    scoreId: row.score_id,
    founderUserId: row.founder_user_id ?? null,
    investorEmail: row.investor_email,
    investorName: row.investor_name,
    fundName: row.fund_name,
    note: row.note,
    createdByEmail: row.created_by_email,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

function rowToView(row: InvestorLinkViewRow): InvestorLinkView {
  return {
    id: row.id,
    linkToken: row.link_token,
    scoreId: row.score_id,
    viewerIpHash: row.viewer_ip_hash,
    viewerUa: row.viewer_ua,
    referer: row.referer,
    durationMs: row.duration_ms,
    viewedAt: row.viewed_at,
  };
}

export interface CreateInvestorLinkArgs {
  scoreId: string;
  founderUserId?: string | null;
  investorEmail?: string | null;
  investorName?: string | null;
  fundName?: string | null;
  note?: string | null;
  createdByEmail: string;
  expiresAt?: Date | null;
}

export type CreateInvestorLinkResult =
  | { ok: true; link: InvestorLink }
  | { ok: false; reason: "not_configured" | "score_not_found" | "db_error"; error?: unknown };

export async function createInvestorLink(
  args: CreateInvestorLinkArgs,
): Promise<CreateInvestorLinkResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "not_configured" };

  // Sanity-check the score exists and the founder owns it. We compare emails
  // case-insensitively because the founder may type their email in mixed case.
  const { data: scoreRow, error: scoreErr } = await supabase
    .from("scores")
    .select("id, email")
    .eq("id", args.scoreId)
    .maybeSingle();
  if (scoreErr) {
    console.error("[blockid:investor-links] score lookup failed", scoreErr);
    return { ok: false, reason: "db_error", error: scoreErr };
  }
  if (!scoreRow) return { ok: false, reason: "score_not_found" };
  if (
    typeof scoreRow.email === "string" &&
    scoreRow.email.toLowerCase() !== args.createdByEmail.toLowerCase()
  ) {
    return { ok: false, reason: "score_not_found" };
  }

  const token = newInvestorToken();
  const { data, error } = await supabase
    .from("investor_links")
    .insert({
      token,
      score_id: args.scoreId,
      founder_user_id: args.founderUserId ?? null,
      investor_email: args.investorEmail ?? null,
      investor_name: args.investorName ?? null,
      fund_name: args.fundName ?? null,
      note: args.note ?? null,
      created_by_email: args.createdByEmail,
      expires_at: args.expiresAt ? args.expiresAt.toISOString() : null,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[blockid:investor-links] insert failed", error);
    return { ok: false, reason: "db_error", error };
  }

  return { ok: true, link: rowToLink(data as InvestorLinkRow) };
}

export async function getInvestorLink(
  token: string,
): Promise<InvestorLink | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("investor_links")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error) {
    console.error("[blockid:investor-links] fetch failed", error);
    return null;
  }
  return data ? rowToLink(data as InvestorLinkRow) : null;
}

export async function listInvestorLinksForScore(
  scoreId: string,
): Promise<InvestorLink[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("investor_links")
    .select("*")
    .eq("score_id", scoreId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[blockid:investor-links] list failed", error);
    return [];
  }
  return ((data as InvestorLinkRow[]) ?? []).map(rowToLink);
}

export async function listInvestorLinkViews(
  linkToken: string,
  limit = 100,
): Promise<InvestorLinkView[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("investor_link_views")
    .select("*")
    .eq("link_token", linkToken)
    .order("viewed_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[blockid:investor-links] views fetch failed", error);
    return [];
  }
  return ((data as InvestorLinkViewRow[]) ?? []).map(rowToView);
}

export async function listInvestorLinkViewsForScore(
  scoreId: string,
  limit = 200,
): Promise<InvestorLinkView[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("investor_link_views")
    .select("*")
    .eq("score_id", scoreId)
    .order("viewed_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[blockid:investor-links] views-for-score fetch failed", error);
    return [];
  }
  return ((data as InvestorLinkViewRow[]) ?? []).map(rowToView);
}

export interface RecordViewArgs {
  link: InvestorLink;
  viewerIpHash: string | null;
  viewerUa: string | null;
  referer: string | null;
  durationMs?: number | null;
}

export interface RecordViewResult {
  recorded: boolean;
  shouldNotifyFounder: boolean;
}

// recordInvestorLinkView writes the view row and decides whether we should
// email the founder. We skip the email when the same hashed viewer opened
// the same link inside NOTIFY_DEBOUNCE_MS — refresh, PDF re-download, etc.
export async function recordInvestorLinkView(
  args: RecordViewArgs,
): Promise<RecordViewResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { recorded: false, shouldNotifyFounder: false };

  let shouldNotifyFounder = true;
  if (args.viewerIpHash) {
    const cutoff = new Date(Date.now() - NOTIFY_DEBOUNCE_MS).toISOString();
    const { data: prior, error: priorErr } = await supabase
      .from("investor_link_views")
      .select("id")
      .eq("link_token", args.link.token)
      .eq("viewer_ip_hash", args.viewerIpHash)
      .gte("viewed_at", cutoff)
      .limit(1);
    if (priorErr) {
      // Log and proceed — telemetry must never break the page render.
      console.error("[blockid:investor-links] debounce lookup failed", priorErr);
    } else if (prior && prior.length > 0) {
      shouldNotifyFounder = false;
    }
  }

  const { error } = await supabase.from("investor_link_views").insert({
    link_token: args.link.token,
    score_id: args.link.scoreId,
    viewer_ip_hash: args.viewerIpHash,
    viewer_ua: args.viewerUa,
    referer: args.referer,
    duration_ms: args.durationMs ?? null,
  });
  if (error) {
    console.error("[blockid:investor-links] view insert failed", error);
    return { recorded: false, shouldNotifyFounder: false };
  }
  return { recorded: true, shouldNotifyFounder };
}

export function investorLabel(link: InvestorLink): string {
  if (link.investorName && link.fundName)
    return `${link.investorName} (${link.fundName})`;
  if (link.fundName) return link.fundName;
  if (link.investorName) return link.investorName;
  if (link.investorEmail) return link.investorEmail;
  return "an investor";
}

export function isInvestorLinkActive(link: InvestorLink): boolean {
  if (link.revokedAt) return false;
  if (link.expiresAt && new Date(link.expiresAt).getTime() < Date.now())
    return false;
  return true;
}

// ---------------------------------------------------------------------------
// listInvestorLinksForFounder — returns all links the founder has created,
// matched first by founder_user_id (v2), then by created_by_email (legacy).
// ---------------------------------------------------------------------------
export interface InvestorLinkWithViewCount extends InvestorLink {
  viewCount: number;
  lastViewedAt: string | null;
}

export async function listInvestorLinksForFounder(
  founderUserId: string,
  founderEmail: string,
): Promise<InvestorLinkWithViewCount[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  // Fetch links — match by user id OR email to cover legacy rows
  const { data: linkRows, error: linkErr } = await supabase
    .from("investor_links")
    .select("*")
    .or(`founder_user_id.eq.${founderUserId},created_by_email.eq.${founderEmail}`)
    .order("created_at", { ascending: false });

  if (linkErr) {
    console.error("[blockid:investor-links] listForFounder failed", linkErr);
    return [];
  }

  const rows = (linkRows as InvestorLinkRow[]) ?? [];
  if (rows.length === 0) return [];

  // Fetch view counts per link token in one query
  const tokens = rows.map((r) => r.token);
  const { data: viewRows, error: viewErr } = await supabase
    .from("investor_link_views")
    .select("link_token, viewed_at")
    .in("link_token", tokens)
    .order("viewed_at", { ascending: false });

  if (viewErr) {
    console.error("[blockid:investor-links] viewCount fetch failed", viewErr);
  }

  const viewsByToken = new Map<string, { count: number; lastViewedAt: string | null }>();
  for (const v of (viewRows ?? []) as Array<{ link_token: string; viewed_at: string }>) {
    const existing = viewsByToken.get(v.link_token);
    if (!existing) {
      viewsByToken.set(v.link_token, { count: 1, lastViewedAt: v.viewed_at });
    } else {
      existing.count += 1;
      // rows are ordered desc so first occurrence is the latest
    }
  }

  return rows.map((row) => {
    const views = viewsByToken.get(row.token) ?? { count: 0, lastViewedAt: null };
    return {
      ...rowToLink(row),
      viewCount: views.count,
      lastViewedAt: views.lastViewedAt,
    };
  });
}

// ---------------------------------------------------------------------------
// revokeInvestorLink — sets revoked_at on a link. Returns ok:false if the
// link does not exist or is not owned by this founder.
// ---------------------------------------------------------------------------
export type RevokeInvestorLinkResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "not_configured" | "db_error"; error?: unknown };

export async function revokeInvestorLink(
  token: string,
  founderUserId: string,
  founderEmail: string,
): Promise<RevokeInvestorLinkResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "not_configured" };

  // Verify ownership before revoking
  const { data: existing, error: fetchErr } = await supabase
    .from("investor_links")
    .select("token, founder_user_id, created_by_email, revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (fetchErr) {
    console.error("[blockid:investor-links] revoke fetch failed", fetchErr);
    return { ok: false, reason: "db_error", error: fetchErr };
  }

  if (!existing) return { ok: false, reason: "not_found" };

  const row = existing as {
    token: string;
    founder_user_id: string | null;
    created_by_email: string;
    revoked_at: string | null;
  };

  // Ownership: match by user id (v2) or email (legacy)
  const ownsById = row.founder_user_id === founderUserId;
  const ownsByEmail =
    typeof row.created_by_email === "string" &&
    row.created_by_email.toLowerCase() === founderEmail.toLowerCase();

  if (!ownsById && !ownsByEmail) {
    return { ok: false, reason: "not_found" };
  }

  const { error: updateErr } = await supabase
    .from("investor_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token", token);

  if (updateErr) {
    console.error("[blockid:investor-links] revoke update failed", updateErr);
    return { ok: false, reason: "db_error", error: updateErr };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// getInvestorLinkBySlug — looks up a link by its pretty slug column.
// ---------------------------------------------------------------------------
export async function getInvestorLinkBySlug(
  slug: string,
): Promise<InvestorLink | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("investor_links")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    console.error("[blockid:investor-links] fetchBySlug failed", error);
    return null;
  }
  return data ? rowToLink(data as InvestorLinkRow) : null;
}

export function configured(): boolean {
  return isSupabaseConfigured();
}
