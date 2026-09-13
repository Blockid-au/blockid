// Investor engagement — the pure half (S21-A).
//
// `api/data-room/engage` POST validates events with `parseEngageEvent` and
// drops repeats with `isDuplicateEvent`; GET builds the founder heatmap with
// `buildEngagementHeatmap`. All three are dependency-free so the colocated
// suite can pin the maths without a database, and the founder UI's table
// twin renders the same `HeatmapModel` the grid does.
//
// What an event carries: the share token (resolved server-side to a link id),
// an event type, a section name, a dwell in ms. Nothing about the viewer
// beyond the salted ip-hash prefix and a truncated UA that the route already
// stored before S21-A — no email, no name, no cookie.

export const ENGAGE_EVENT_TYPES = [
  "open",
  "section_view",
  "document_open",
  "document_download",
  "nda_sign",
] as const;
export type EngageEventType = (typeof ENGAGE_EVENT_TYPES)[number];

/** The client may not report the same (section, type) more than once per window. */
export const ENGAGE_DEDUPE_WINDOW_MS = 30_000;
/** A single dwell report is capped at an hour — a tab left open is not an hour of reading. */
export const ENGAGE_MAX_DURATION_MS = 60 * 60 * 1000;
export const ENGAGE_SECTION_MAX_CHARS = 120;
export const ENGAGE_DOCUMENT_MAX_CHARS = 160;

/**
 * The two sections the investor page renders that are not folders (the
 * `data-engage-section` values in s/dr/[token]/page.tsx). Everything else a
 * client may name must be a real `data_room_documents.folder` of the room —
 * S21-A review P2-1: a token holder could otherwise inject arbitrary column
 * headers into the founder's heatmap.
 */
export const ENGAGE_PAGE_SECTIONS = ["Headline figures", "Outstanding items"] as const;

/** Re-exported for the client tracker so it does not import the NDA module. */
export type { NdaGateStatus } from "./nda";

/** Same whitespace normalisation `parseEngageEvent` applies to `section`. */
export function normaliseSection(v: unknown): string | null {
  return cleanString(v, ENGAGE_SECTION_MAX_CHARS);
}

/**
 * The set of section names a room accepts: the fixed page sections plus its
 * real folders, all normalised the way the POST body is.
 */
export function allowedSections(folders: Iterable<unknown>): Set<string> {
  const out = new Set<string>(ENGAGE_PAGE_SECTIONS);
  for (const f of folders) {
    const n = normaliseSection(f);
    if (n) out.add(n);
  }
  return out;
}

export interface EngageEvent {
  token: string;
  eventType: EngageEventType;
  section: string | null;
  documentName: string | null;
  durationMs: number | null;
  scrollPct: number | null;
}

function cleanString(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}

function cleanInt(v: unknown, min: number, max: number): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/**
 * Validate a POST body. Every rejection is a 400 in the route; a value out of
 * range is clamped rather than rejected so an over-eager client cannot
 * bloat a row but also does not lose the event.
 */
export function parseEngageEvent(body: unknown):
  | { ok: true; event: EngageEvent }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Missing token or eventType" };
  const b = body as Record<string, unknown>;
  const token = typeof b.token === "string" ? b.token : "";
  const eventType = typeof b.eventType === "string" ? b.eventType : "";
  if (!token || !eventType) return { ok: false, error: "Missing token or eventType" };
  if (token.length < 16 || token.length > 128) return { ok: false, error: "Invalid token" };
  if (!(ENGAGE_EVENT_TYPES as readonly string[]).includes(eventType)) {
    return { ok: false, error: `Unknown eventType: ${eventType.slice(0, 40)}` };
  }
  const section = cleanString(b.section, ENGAGE_SECTION_MAX_CHARS);
  const documentName = cleanString(b.documentName, ENGAGE_DOCUMENT_MAX_CHARS);
  if (eventType === "section_view" && !section) {
    return { ok: false, error: "section_view requires a section" };
  }
  return {
    ok: true,
    event: {
      token,
      eventType: eventType as EngageEventType,
      section,
      documentName,
      durationMs: cleanInt(b.durationMs, 0, ENGAGE_MAX_DURATION_MS),
      scrollPct: cleanInt(b.scrollPct, 0, 100),
    },
  };
}

/**
 * Server-side dedupe: is there already a row for the same (link, type,
 * section, document) inside the window? `open` and `nda_sign` are never
 * section-scoped, so for them "same section" means both null.
 */
export function isDuplicateEvent(
  incoming: Pick<EngageEvent, "eventType" | "section" | "documentName">,
  last: { occurred_at: string | null } | null | undefined,
  now: number = Date.now(),
  windowMs: number = ENGAGE_DEDUPE_WINDOW_MS,
): boolean {
  if (!last?.occurred_at) return false;
  const t = Date.parse(last.occurred_at);
  if (!Number.isFinite(t)) return false;
  // Downloads are events a founder wants counted every time.
  if (incoming.eventType === "document_download") return false;
  return now - t < windowMs;
}

// ── Heatmap ───────────────────────────────────────────────────────────────

export interface HeatmapLinkInput {
  id: string;
  label: string;
}

export interface HeatmapEventInput {
  access_token_id: string | null;
  event_type: string;
  section: string | null;
  duration_ms: number | null;
  occurred_at?: string | null;
}

export interface HeatmapCell {
  linkId: string;
  section: string;
  views: number;
  dwellMs: number;
}

export interface HeatmapRow {
  linkId: string;
  label: string;
  opens: number;
  downloads: number;
  totalDwellMs: number;
  lastSeen: string | null;
  cells: HeatmapCell[];
}

export interface HeatmapModel {
  sections: string[];
  rows: HeatmapRow[];
  maxDwellMs: number;
  maxViews: number;
  totalEvents: number;
}

/**
 * Build the per-link × per-section matrix the founder page renders.
 *
 * - `links` fixes the row order (newest link first, as the founder's list
 *   shows them); events for a link not in the list (a deleted link whose
 *   events were SET NULL) are dropped rather than invented as a row.
 * - `sections` are ordered by first appearance in the room's folder order
 *   when `sectionOrder` is given, and a section NOT in that order is dropped
 *   (P2-1: the allow-list is authoritative — a stored event with a name the
 *   room does not have never becomes a column); without `sectionOrder`,
 *   ordered by total dwell desc.
 * - a `section_view` counts one view and adds its dwell; `document_open`
 *   counts a view on its section with no dwell; `open` / `download` roll up
 *   to the row totals only.
 */
export function buildEngagementHeatmap(
  events: HeatmapEventInput[],
  links: HeatmapLinkInput[],
  sectionOrder?: string[],
): HeatmapModel {
  const rowById = new Map<string, HeatmapRow>();
  for (const l of links) {
    rowById.set(l.id, {
      linkId: l.id,
      label: l.label,
      opens: 0,
      downloads: 0,
      totalDwellMs: 0,
      lastSeen: null,
      cells: [],
    });
  }
  const cellKey = (linkId: string, section: string) => `${linkId}|::|${section}`;
  const cells = new Map<string, HeatmapCell>();
  const sectionDwell = new Map<string, number>();
  let totalEvents = 0;

  for (const e of events) {
    if (!e.access_token_id) continue;
    const row = rowById.get(e.access_token_id);
    if (!row) continue;
    totalEvents++;
    if (e.occurred_at && (!row.lastSeen || e.occurred_at > row.lastSeen)) row.lastSeen = e.occurred_at;
    if (e.event_type === "open") {
      row.opens++;
      continue;
    }
    if (e.event_type === "document_download") {
      row.downloads++;
    }
    if (!e.section) continue;
    if (e.event_type !== "section_view" && e.event_type !== "document_open" && e.event_type !== "document_download") continue;
    const key = cellKey(row.linkId, e.section);
    let cell = cells.get(key);
    if (!cell) {
      cell = { linkId: row.linkId, section: e.section, views: 0, dwellMs: 0 };
      cells.set(key, cell);
    }
    cell.views++;
    const dwell = e.event_type === "section_view" && typeof e.duration_ms === "number" && e.duration_ms > 0 ? e.duration_ms : 0;
    cell.dwellMs += dwell;
    row.totalDwellMs += dwell;
    sectionDwell.set(e.section, (sectionDwell.get(e.section) ?? 0) + dwell);
  }

  let sections: string[];
  if (sectionOrder) {
    const seen = new Set(sectionDwell.keys());
    sections = [...new Set(sectionOrder)].filter((s) => seen.has(s));
  } else {
    sections = [...sectionDwell.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([s]) => s);
  }

  let maxDwellMs = 0;
  let maxViews = 0;
  const rows: HeatmapRow[] = [];
  for (const l of links) {
    const row = rowById.get(l.id)!;
    row.cells = sections.map((section) => {
      const c = cells.get(cellKey(l.id, section)) ?? { linkId: l.id, section, views: 0, dwellMs: 0 };
      if (c.dwellMs > maxDwellMs) maxDwellMs = c.dwellMs;
      if (c.views > maxViews) maxViews = c.views;
      return c;
    });
    rows.push(row);
  }

  return { sections, rows, maxDwellMs, maxViews, totalEvents };
}

/**
 * Sequential bucket 0..4 for a cell — 0 is "no data" (surface), 1..4 the
 * one-hue ramp. Dwell drives it; a cell with views but no dwell (a document
 * opened, never read) sits in bucket 1 so it is visibly not-empty.
 */
export function heatBucket(cell: Pick<HeatmapCell, "views" | "dwellMs">, maxDwellMs: number): 0 | 1 | 2 | 3 | 4 {
  if (cell.views <= 0) return 0;
  if (maxDwellMs <= 0 || cell.dwellMs <= 0) return 1;
  const r = cell.dwellMs / maxDwellMs;
  if (r >= 0.75) return 4;
  if (r >= 0.4) return 3;
  if (r >= 0.15) return 2;
  return 1;
}

/** "2m 05s" / "45s" / "—" for the table twin and the cell title. */
export function formatDwell(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}m ${String(rest).padStart(2, "0")}s`;
}

// ── Founder alerts (S26-A) ────────────────────────────────────────────────
//
// Two moments are worth a notification: the FIRST open of a link, and the
// point where a viewer has clearly read rather than skimmed — three or
// more distinct sections, or five minutes of dwell. Both collapse into one
// `investor_viewed` notification per link per 24 h (the throttle is the
// notification writer's dedupe key; see lib/dataroom/investor-viewed.ts).

export const INVESTOR_VIEWED_THROTTLE_MS = 24 * 60 * 60 * 1000;
export const INVESTOR_VIEWED_SECTION_THRESHOLD = 3;
export const INVESTOR_VIEWED_DWELL_THRESHOLD_MS = 5 * 60 * 1000;

export type InvestorViewedTrigger = "first_view" | "deep_read";

export interface ReadDepth {
  sections: number;
  dwellMs: number;
}

/**
 * Distinct sections opened and total reading time across a link's events
 * (`section_view` counts a section and its dwell; `document_open` counts
 * the section only). Pass the incoming event as the last row.
 */
export function readDepth(events: ReadonlyArray<Pick<HeatmapEventInput, "event_type" | "section" | "duration_ms">>): ReadDepth {
  const sections = new Set<string>();
  let dwellMs = 0;
  for (const e of events) {
    if (e.event_type === "section_view" || e.event_type === "document_open") {
      if (e.section) sections.add(e.section);
    }
    if (e.event_type === "section_view" && typeof e.duration_ms === "number" && e.duration_ms > 0) dwellMs += e.duration_ms;
  }
  return { sections: sections.size, dwellMs };
}

/**
 * Which alert (if any) this event earns.
 *   - an `open` on a link that had never been opened → `first_view`
 *   - otherwise, once the link's cumulative depth crosses either threshold
 *     → `deep_read` (the writer's 24 h throttle stops every later event
 *     re-firing it)
 */
export function detectInvestorViewedTrigger(args: {
  eventType: EngageEventType;
  /** `data_room_access_tokens.first_accessed` BEFORE this event was recorded. */
  firstAccessedBefore: string | null;
  depth: ReadDepth;
}): InvestorViewedTrigger | null {
  if (args.eventType === "open" && !args.firstAccessedBefore) return "first_view";
  if (args.depth.sections >= INVESTOR_VIEWED_SECTION_THRESHOLD || args.depth.dwellMs >= INVESTOR_VIEWED_DWELL_THRESHOLD_MS) {
    return "deep_read";
  }
  return null;
}
