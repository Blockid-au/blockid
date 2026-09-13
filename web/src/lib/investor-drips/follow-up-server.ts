// Data-room investor follow-up — the server half (S26-A).
//
// `api/cron/investor-followups` (daily 21:00 UTC) calls:
//   1. listFollowUpCandidates() — links with auto_follow_up = true, an
//      investor email and a view at least 2 calendar days old (the
//      business-day rule is applied in code), joined to their room and to
//      the send ledger (`data_room_follow_ups`, UNIQUE per link);
//   2. followUpSkipReason() (pure) per candidate — opt-out, inactive,
//      too soon, NDA unmet, already sent, unsubscribed;
//   3. sendFollowUp() — claim the ledger row FIRST (a UNIQUE violation means
//      another tick won), render lib/investor-drips/templates
//      `renderDataRoomFollowUp` in the founder's name via the platform
//      sender (`fromName`), footer = `unsubFooter()`, and roll the claim
//      back if the send fails so the next tick retries.
//
// Nothing here logs a share token or an email body; summaries carry link
// ids and outcomes only.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail, unsubFooter } from "@/lib/email";
import { renderDataRoomFollowUp } from "./templates";
import { isUnsubscribed, unsubscribeUrl } from "./send";
import {
  FOLLOW_UP_MIN_CALENDAR_DAYS,
  followUpSkipReason,
  investorFirstName,
  type FollowUpLinkRow,
  type FollowUpRoomRow,
  type FollowUpSkipReason,
} from "./follow-up";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export const MAX_FOLLOW_UPS_PER_TICK = 50;

export const LINK_COLUMNS =
  "id, token, data_room_id, account_id, investor_name, investor_email, investor_firm, auto_follow_up, is_active, revoked_at, expires_at, first_accessed, last_accessed, nda_required, nda_signed_at, nda_signed_version";

export interface FollowUpCandidate {
  link: FollowUpLinkRow;
  room: FollowUpRoomRow | null;
  alreadySent: boolean;
}

export interface FollowUpSummary {
  link_id: string;
  data_room_id: string | null;
  outcome: "sent" | "would_send" | "skipped" | "claimed_elsewhere" | "failed";
  reason?: FollowUpSkipReason | string;
}

/** Links that MAY be due — the pure rule decides; this only narrows the read. */
export async function listFollowUpCandidates(supabase: Db, now: Date, limit: number = MAX_FOLLOW_UPS_PER_TICK): Promise<FollowUpCandidate[]> {
  const cutoff = new Date(now.getTime() - FOLLOW_UP_MIN_CALENDAR_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: linkRows, error } = await supabase
    .from("data_room_access_tokens")
    .select(LINK_COLUMNS)
    .eq("auto_follow_up", true)
    .eq("is_active", true)
    .not("investor_email", "is", null)
    .not("last_accessed", "is", null)
    .lte("last_accessed", cutoff)
    .order("last_accessed", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`follow-up candidates: ${error.message}`);
  const links = (linkRows ?? []) as FollowUpLinkRow[];
  if (links.length === 0) return [];

  const roomIds = [...new Set(links.map((l) => l.data_room_id).filter((id): id is string => Boolean(id)))];
  const { data: roomRows } = roomIds.length
    ? await supabase.from("data_rooms").select("id, user_id, project_id, name, startup_name, nda_required, nda_version").in("id", roomIds)
    : { data: [] as FollowUpRoomRow[] };
  const rooms = new Map(((roomRows ?? []) as FollowUpRoomRow[]).map((r) => [r.id, r]));

  const { data: sentRows } = await supabase
    .from("data_room_follow_ups")
    .select("access_token_id")
    .in(
      "access_token_id",
      links.map((l) => l.id),
    );
  const sent = new Set(((sentRows ?? []) as Array<{ access_token_id: string }>).map((r) => r.access_token_id));

  return links.map((link) => ({
    link,
    room: link.data_room_id ? (rooms.get(link.data_room_id) ?? null) : null,
    alreadySent: sent.has(link.id),
  }));
}

/** The pure veto plus the unsubscribe-list read (a network call, so it lives here). */
export async function followUpDecision(c: FollowUpCandidate, now: Date): Promise<FollowUpSkipReason | null> {
  const preliminary = followUpSkipReason({ link: c.link, room: c.room, alreadySent: c.alreadySent, unsubscribed: false, now });
  if (preliminary) return preliminary;
  const unsubscribed = await isUnsubscribed(c.link.investor_email as string);
  return followUpSkipReason({ link: c.link, room: c.room, alreadySent: c.alreadySent, unsubscribed, now });
}

async function founderName(supabase: Db, userId: string): Promise<string> {
  const { data } = await supabase.from("app_users").select("display_name, email").eq("id", userId).maybeSingle();
  const row = data as { display_name: string | null; email: string | null } | null;
  const name = row?.display_name?.trim();
  if (name) return name;
  const local = row?.email?.split("@")[0]?.trim();
  return local || "The founder";
}

async function sectionsViewed(supabase: Db, linkId: string): Promise<number> {
  const { data } = await supabase
    .from("data_room_engagement")
    .select("section, event_type")
    .eq("access_token_id", linkId)
    .in("event_type", ["section_view", "document_open"])
    .limit(200);
  const s = new Set<string>();
  for (const r of (data ?? []) as Array<{ section: string | null }>) if (r.section) s.add(r.section);
  return s.size;
}

/**
 * Send one follow-up. Claims the ledger row first so an overlapping tick
 * cannot send twice; a failed send deletes the claim. `dry` renders
 * nothing and writes nothing.
 */
export async function sendFollowUp(
  supabase: Db,
  c: FollowUpCandidate,
  opts: { baseUrl: string; now: Date; dry?: boolean },
): Promise<FollowUpSummary> {
  const link = c.link;
  const base: FollowUpSummary = { link_id: link.id, data_room_id: link.data_room_id, outcome: "skipped" };
  const room = c.room as FollowUpRoomRow;
  const ownerId = room.user_id as string;
  const investorEmail = link.investor_email as string;
  const viewedAt = link.last_accessed as string;

  if (opts.dry) return { ...base, outcome: "would_send" };

  const { error: claimErr } = await supabase.from("data_room_follow_ups").insert({
    access_token_id: link.id,
    data_room_id: room.id,
    account_id: link.account_id,
    investor_email: investorEmail,
    viewed_at: viewedAt,
    sent_at: opts.now.toISOString(),
  });
  if (claimErr) return { ...base, outcome: "claimed_elsewhere", reason: claimErr.code ?? "claim_failed" };

  try {
    const [founder, sections] = await Promise.all([founderName(supabase, ownerId), sectionsViewed(supabase, link.id)]);
    const startupName = room.startup_name?.trim() || room.name?.trim() || "our startup";
    const unsub = unsubscribeUrl(investorEmail, opts.baseUrl);
    const rendered = renderDataRoomFollowUp({
      founderName: founder,
      startupName,
      investorName: investorFirstName(link.investor_name),
      roomUrl: `${opts.baseUrl.replace(/\/+$/, "")}/s/dr/${encodeURIComponent(link.token)}`,
      sectionsViewed: sections,
      footerHtml: unsubFooter(unsub, unsub, "en", "light"),
    });
    const result = await sendEmail({
      to: investorEmail,
      subject: rendered.subject,
      html: rendered.html,
      unsubscribeUrl: unsub,
      fromName: founder,
    });
    if (!result.ok) {
      await supabase.from("data_room_follow_ups").delete().eq("access_token_id", link.id);
      return { ...base, outcome: "failed", reason: result.reason ?? "send_failed" };
    }
    return { ...base, outcome: "sent" };
  } catch (err) {
    await supabase.from("data_room_follow_ups").delete().eq("access_token_id", link.id);
    return { ...base, outcome: "failed", reason: err instanceof Error ? err.message.slice(0, 120) : "error" };
  }
}
