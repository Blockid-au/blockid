// Founder alert on investor data-room activity — the server half (S26-A).
//
// Called by `api/data-room/engage` POST after an event row lands. Decides
// (lib/dataroom/engagement `detectInvestorViewedTrigger`) whether the event
// is the link's first open or crosses the deep-read threshold, writes ONE
// `investor_viewed` founder notification per link per 24 h (dedupe key
// `investor_viewed:<link id>`), and — only when that row was written —
// emails the room owner through lib/email (their `svi_alerts` preference
// gates it, `unsubFooter()` is on it). Never throws; the investor-facing
// beacon must never fail on a founder-side nicety.
//
// Nothing about the viewer beyond what the link already carries (the name
// / firm / email the FOUNDER typed when minting it) reaches the founder.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { insertNotification } from "@/lib/notifications";
import { sendInvestorViewedEmail } from "@/lib/email";
import {
  INVESTOR_VIEWED_THROTTLE_MS,
  detectInvestorViewedTrigger,
  readDepth,
  type EngageEvent,
  type HeatmapEventInput,
  type InvestorViewedTrigger,
} from "./engagement";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export interface InvestorViewedLink {
  id: string;
  data_room_id: string;
  /** Value BEFORE the current event stamped it. */
  first_accessed: string | null;
  investor_name?: string | null;
  investor_firm?: string | null;
  investor_email?: string | null;
}

export interface InvestorViewedOutcome {
  trigger: InvestorViewedTrigger | null;
  notified: boolean;
  emailed: boolean;
}

/** "Jane Chen · Blackbird" / "Blackbird" / email / "An investor" — never the token. */
export function investorLabel(link: Pick<InvestorViewedLink, "investor_name" | "investor_firm" | "investor_email">): string {
  const name = link.investor_name?.trim();
  const firm = link.investor_firm?.trim();
  if (name && firm) return `${name} · ${firm}`;
  if (name) return name;
  if (firm) return firm;
  const email = link.investor_email?.trim();
  if (email) return email;
  return "An investor";
}

const MAX_EVENTS = 500;

export async function maybeNotifyInvestorViewed(
  supabase: Db,
  args: { link: InvestorViewedLink; event: Pick<EngageEvent, "eventType" | "section" | "durationMs"> },
): Promise<InvestorViewedOutcome> {
  const none: InvestorViewedOutcome = { trigger: null, notified: false, emailed: false };
  try {
    const { link, event } = args;

    // Cumulative depth: everything stored for the link (the current event
    // has already been inserted by the route) — plus the incoming event in
    // case the insert is still in flight.
    const { data: rows } = await supabase
      .from("data_room_engagement")
      .select("event_type, section, duration_ms")
      .eq("access_token_id", link.id)
      .order("occurred_at", { ascending: false })
      .limit(MAX_EVENTS);
    const stored = ((rows ?? []) as HeatmapEventInput[]).map((r) => ({
      event_type: r.event_type,
      section: r.section,
      duration_ms: r.duration_ms,
    }));
    const incoming = { event_type: event.eventType, section: event.section, duration_ms: event.durationMs };
    // De-duplicate the incoming event against the row the route just wrote:
    // the same (type, section, dwell) tuple at the head of the list is it.
    const head = stored[0];
    const alreadyStored =
      head && head.event_type === incoming.event_type && (head.section ?? null) === (incoming.section ?? null) && (head.duration_ms ?? null) === (incoming.duration_ms ?? null);
    const depth = readDepth(alreadyStored ? stored : [...stored, incoming]);

    const trigger = detectInvestorViewedTrigger({ eventType: event.eventType, firstAccessedBefore: link.first_accessed, depth });
    if (!trigger) return none;

    const { data: roomRow } = await supabase
      .from("data_rooms")
      .select("id, user_id, project_id, name")
      .eq("id", link.data_room_id)
      .maybeSingle();
    const room = roomRow as { id: string; user_id: string | null; project_id: string | null; name: string | null } | null;
    if (!room?.user_id) return { trigger, notified: false, emailed: false };

    const label = investorLabel(link);
    const notified = await insertNotification({
      userId: room.user_id,
      projectId: room.project_id ?? null,
      kind: "investor_viewed",
      dedupeKey: `investor_viewed:${link.id}`,
      throttleMs: INVESTOR_VIEWED_THROTTLE_MS,
      payload: {
        investor: label,
        trigger,
        sections: depth.sections,
        dwell_ms: depth.dwellMs,
        link_id: link.id,
        room: room.name ?? null,
      },
    });
    if (!notified) return { trigger, notified: false, emailed: false };

    // Email twin, on the same throttle (only when the row was written).
    let emailed = false;
    const { data: ownerRow } = await supabase.from("app_users").select("email").eq("id", room.user_id).maybeSingle();
    const ownerEmail = (ownerRow as { email: string | null } | null)?.email;
    if (ownerEmail) {
      const sent = await sendInvestorViewedEmail({
        to: ownerEmail,
        investorLabel: label,
        roomName: room.name ?? null,
        trigger,
        sections: depth.sections,
        dwellMs: depth.dwellMs,
      });
      emailed = sent.ok;
    }
    return { trigger, notified: true, emailed };
  } catch (err) {
    console.warn("[dataroom:investor-viewed] failed", err instanceof Error ? err.message : err);
    return none;
  }
}
