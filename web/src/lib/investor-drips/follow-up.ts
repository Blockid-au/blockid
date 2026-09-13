// Data-room investor follow-up — the pure half (S26-A).
//
// DocSend-style: an investor opens the room, does not come back, and two
// business days later a short note goes out in the founder's name — once
// per link, ever, and only when the founder switched auto follow-up on for
// that link. These rules are dependency-free so the colocated suite can pin
// them; `follow-up-server.ts` does the reads, the ledger claim and the send.
//
// Business days are Mon–Fri in UTC (the cron runs at 21:00 UTC = 07:00
// AEST next morning, so "two business days after a Thursday view" lands
// in the founder's Monday-morning outbox, not on the weekend).

export const FOLLOW_UP_BUSINESS_DAYS = 2;
/** Calendar-day lower bound for the candidate query: 2 business days is never less than 2 days. */
export const FOLLOW_UP_MIN_CALENDAR_DAYS = 2;

export interface FollowUpLinkRow {
  id: string;
  token: string;
  data_room_id: string | null;
  account_id: string;
  investor_name: string | null;
  investor_email: string | null;
  investor_firm: string | null;
  auto_follow_up: boolean | null;
  is_active: boolean | null;
  revoked_at: string | null;
  expires_at: string | null;
  first_accessed: string | null;
  last_accessed: string | null;
  nda_required: boolean | null;
  nda_signed_at: string | null;
  nda_signed_version: number | null;
}

export interface FollowUpRoomRow {
  id: string;
  user_id: string | null;
  project_id: string | null;
  name: string | null;
  startup_name: string | null;
  nda_required: boolean | null;
  nda_version: number | null;
}

export type FollowUpSkipReason =
  | "opt_out"
  | "link_inactive"
  | "no_email"
  | "never_viewed"
  | "too_soon"
  | "nda_unmet"
  | "already_sent"
  | "unsubscribed"
  | "no_room"
  | "no_owner";

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

/** `from` + `n` business days (Mon–Fri, UTC), preserving the time of day. */
export function addBusinessDays(from: Date, n: number): Date {
  const d = new Date(from.getTime());
  let left = Math.max(0, Math.floor(n));
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (!isWeekend(d)) left--;
  }
  return d;
}

/** When the follow-up for a view at `viewedAt` becomes due. */
export function followUpDueAt(viewedAt: Date): Date {
  return addBusinessDays(viewedAt, FOLLOW_UP_BUSINESS_DAYS);
}

/**
 * Is the NDA requirement on this link unmet? The room's flag or the link's
 * flag asks; an acceptance counts only for the room's CURRENT version
 * (same rule as lib/dataroom/nda `ndaGate`, inlined so this file stays
 * dependency-free).
 */
export function ndaUnmet(link: Pick<FollowUpLinkRow, "nda_required" | "nda_signed_at" | "nda_signed_version">, room: Pick<FollowUpRoomRow, "nda_required" | "nda_version"> | null): boolean {
  const required = Boolean(room?.nda_required) || Boolean(link.nda_required);
  if (!required) return false;
  const version = typeof room?.nda_version === "number" && room.nda_version >= 1 ? Math.floor(room.nda_version) : 1;
  const signed = typeof link.nda_signed_version === "number" ? link.nda_signed_version : null;
  return !(link.nda_signed_at && signed !== null && signed >= version);
}

/**
 * Why this link must NOT get a follow-up right now, or `null` when it is
 * due. Order matters only for the reason reported; every rule is a veto.
 */
export function followUpSkipReason(args: {
  link: FollowUpLinkRow;
  room: FollowUpRoomRow | null;
  alreadySent: boolean;
  unsubscribed: boolean;
  now: Date;
}): FollowUpSkipReason | null {
  const { link, room, now } = args;
  if (!link.auto_follow_up) return "opt_out";
  if (args.alreadySent) return "already_sent";
  if (!link.is_active || link.revoked_at) return "link_inactive";
  if (link.expires_at && Date.parse(link.expires_at) < now.getTime()) return "link_inactive";
  if (!link.investor_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(link.investor_email)) return "no_email";
  if (!link.last_accessed) return "never_viewed";
  const viewed = Date.parse(link.last_accessed);
  if (!Number.isFinite(viewed)) return "never_viewed";
  if (followUpDueAt(new Date(viewed)).getTime() > now.getTime()) return "too_soon";
  if (!room) return "no_room";
  if (!room.user_id) return "no_owner";
  if (ndaUnmet(link, room)) return "nda_unmet";
  if (args.unsubscribed) return "unsubscribed";
  return null;
}

/** The investor's first name for the greeting, or null. */
export function investorFirstName(name: string | null | undefined): string | null {
  const s = (name ?? "").trim();
  if (!s) return null;
  return s.split(/\s+/)[0] ?? null;
}
