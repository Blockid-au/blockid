// Money Radar → email drips (T0246, plan docs/plans/money-finder-2026-09-10.md
// §4h "Deadline scheduling via the drip worker").
//
// The weekly sweep (radar-sweep.ts) never emails. For every deadline tier it
// raises for an email-channel subscriber it appends
// `{ event: "deadline_t14", at: "2026-09-10" }` to
// `funding_matches.last_notified.pending_email`. This module is the other
// half of that contract:
//
//   rows with pending_email  →  for each entry:
//                                 canSendEmail(email, "money_radar")?
//                                   yes → enqueueRadarDrip(radar_t14, payload)
//                                   no  → drop (opt-out is honoured here AND
//                                          again by the worker before send)
//                              →  clear `pending_email` on the row
//
// Idempotent on every axis: the key is removed once claimed, so a second run
// finds nothing; `enqueueRadarDrip` dedupes on (email, campaign, ref_id)
// for 45 days, so even a crash between insert and clear cannot double-queue.
// `dryRun` reads everything and writes nothing.
//
// Called at the end of /api/cron/money-radar-sweep (one guarded call) so
// the hourly /api/cron/email-drip worker sends the rows.
// Colocated tests: radar-drips.test.ts.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { canSendEmail, getEmailPreferences } from "@/lib/email-preferences";
import { enqueueRadarDrip, type DripPayload, type RadarAlternative, type RadarDripCampaign } from "@/lib/email-drip";
import type { SupabaseLike } from "./radar-sweep";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PendingEmailEntry {
  event: string;
  at: string;
}

export interface PendingMatchRow {
  id: string;
  user_id: string;
  project_id: string | null;
  ref_kind: "grant" | "program";
  ref_id: string;
  score: number;
  status_at_match: string;
  closes_at: string | null;
  last_notified: Record<string, unknown>;
}

export interface RadarDripsOptions {
  now?: Date;
  dryRun?: boolean;
  /** Raw Supabase-like client. Defaults to getSupabaseAdmin(). */
  db?: SupabaseLike | null;
  /** Cap rows per run (the sweep cron has a 300 s budget). Default 500. */
  limit?: number;
}

export interface RadarDripsSummary {
  ok: boolean;
  dryRun: boolean;
  /** funding_matches rows that carried pending_email. */
  rows: number;
  /** pending_email entries examined. */
  pending: number;
  queued: number;
  duplicate: number;
  /** Entries dropped because the address opted out of money_radar (or has no email). */
  unsubscribed: number;
  /** Entries whose event has no campaign (unknown / non-deadline) — dropped. */
  ignored: number;
  /** Rows whose pending_email key was cleared ("would clear" on dryRun). */
  cleared: number;
  errors: number;
  error?: string;
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

/** deadline_t30 → radar_t30 … ; status_changed → radar_status_changed; else null. */
export function campaignForEvent(event: string): RadarDripCampaign | null {
  switch (event) {
    case "deadline_t30":
      return "radar_t30";
    case "deadline_t14":
      return "radar_t14";
    case "deadline_t3":
      return "radar_t3";
    case "status_changed":
      return "radar_status_changed";
    default:
      return null;
  }
}

export function readPendingEmail(ln: Record<string, unknown> | null | undefined): PendingEmailEntry[] {
  const raw = ln?.pending_email;
  if (!Array.isArray(raw)) return [];
  const out: PendingEmailEntry[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const event = (e as { event?: unknown }).event;
    const at = (e as { at?: unknown }).at;
    if (typeof event !== "string" || !event) continue;
    out.push({ event, at: typeof at === "string" ? at : "" });
  }
  return out;
}

/** `last_notified` with the pending_email key removed (other keys untouched). */
export function withoutPendingEmail(ln: Record<string, unknown>): Record<string, unknown> {
  const { pending_email: _pending, ...rest } = ln;
  void _pending;
  return rest;
}

export interface CatalogueRef {
  ref_kind: "grant" | "program";
  ref_id: string;
  name: string;
  official_url: string | null;
  amount_max_aud: number | null;
  closes_at: string | null;
  status: string | null;
}

/**
 * The "2 alternatives" for a status_changed touch: the user's other open
 * matches, best score first, excluding the row that flipped.
 */
export function pickAlternatives(
  row: Pick<PendingMatchRow, "ref_kind" | "ref_id">,
  siblings: readonly Pick<PendingMatchRow, "ref_kind" | "ref_id" | "score" | "status_at_match">[],
  refs: ReadonlyMap<string, CatalogueRef>,
  count = 2,
): RadarAlternative[] {
  return siblings
    .filter((s) => !(s.ref_kind === row.ref_kind && s.ref_id === row.ref_id))
    .filter((s) => s.status_at_match === "open" || s.status_at_match === "upcoming")
    .sort((a, b) => b.score - a.score)
    .map((s) => refs.get(refKey(s.ref_kind, s.ref_id)))
    .filter((r): r is CatalogueRef => Boolean(r))
    .slice(0, count)
    .map((r) => ({
      ref_kind: r.ref_kind,
      ref_id: r.ref_id,
      name: r.name,
      amount_max_aud: r.amount_max_aud,
      official_url: r.official_url,
      closes_at: r.closes_at,
    }));
}

export function refKey(kind: string, id: string): string {
  return `${kind}:${id}`;
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au").replace(/\/$/, "");
}

export function buildRadarDripPayload(
  row: PendingMatchRow,
  ref: CatalogueRef | undefined,
  extra: { report_url?: string | null; unsubscribe_token?: string | null; alternatives?: RadarAlternative[] } = {},
): DripPayload {
  return {
    ref_kind: row.ref_kind,
    ref_id: row.ref_id,
    ref_name: ref?.name ?? row.ref_id,
    closes_at: row.closes_at ?? ref?.closes_at ?? null,
    amount_max_aud: ref?.amount_max_aud ?? null,
    official_url: ref?.official_url ?? null,
    report_url: extra.report_url ?? null,
    status: row.status_at_match,
    ...(extra.alternatives ? { alternatives: extra.alternatives } : {}),
    unsubscribe_token: extra.unsubscribe_token ?? null,
  };
}

// ─── Store reads ─────────────────────────────────────────────────────────────

function asMatchRow(r: Record<string, unknown>): PendingMatchRow | null {
  const kind = r.ref_kind;
  if (kind !== "grant" && kind !== "program") return null;
  if (!r.id || !r.user_id || !r.ref_id) return null;
  return {
    id: String(r.id),
    user_id: String(r.user_id),
    project_id: (r.project_id as string | null) ?? null,
    ref_kind: kind,
    ref_id: String(r.ref_id),
    score: Number(r.score ?? 0),
    status_at_match: String(r.status_at_match ?? "open"),
    closes_at: (r.closes_at as string | null) ?? null,
    last_notified: (r.last_notified && typeof r.last_notified === "object" ? r.last_notified : {}) as Record<string, unknown>,
  };
}

async function loadPendingRows(db: SupabaseLike, limit: number): Promise<PendingMatchRow[]> {
  const { data, error } = await db
    .from("funding_matches")
    .select("id, user_id, project_id, ref_kind, ref_id, score, status_at_match, closes_at, last_notified")
    .not("last_notified->pending_email", "is", null)
    .order("closes_at", { ascending: true })
    .limit(limit);
  if (error) {
    if (error.code === "42P01") return [];
    throw new Error(error.message ?? "funding_matches read failed");
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map(asMatchRow).filter((r): r is PendingMatchRow => Boolean(r));
}

async function loadSiblings(db: SupabaseLike, userIds: string[]): Promise<Map<string, PendingMatchRow[]>> {
  const out = new Map<string, PendingMatchRow[]>();
  if (userIds.length === 0) return out;
  const { data } = await db
    .from("funding_matches")
    .select("id, user_id, project_id, ref_kind, ref_id, score, status_at_match, closes_at, last_notified")
    .in("user_id", userIds)
    .in("status_at_match", ["open", "upcoming"])
    .limit(5_000);
  for (const raw of (data ?? []) as Array<Record<string, unknown>>) {
    const r = asMatchRow(raw);
    if (!r) continue;
    const list = out.get(r.user_id) ?? [];
    list.push(r);
    out.set(r.user_id, list);
  }
  return out;
}

async function loadRefs(db: SupabaseLike, grantIds: string[], programIds: string[]): Promise<Map<string, CatalogueRef>> {
  const out = new Map<string, CatalogueRef>();
  const [g, p] = await Promise.all([
    grantIds.length
      ? db.from("au_grants").select("id, name, official_url, amount_max_aud, closes_at, status").in("id", grantIds)
      : Promise.resolve({ data: [] }),
    programIds.length
      ? db.from("au_programs").select("id, name, official_url, funding_aud, applications_close, next_cohort_start, program_type, status").in("id", programIds)
      : Promise.resolve({ data: [] }),
  ]);
  for (const r of (g.data ?? []) as Array<Record<string, unknown>>) {
    out.set(refKey("grant", String(r.id)), {
      ref_kind: "grant",
      ref_id: String(r.id),
      name: String(r.name ?? r.id),
      official_url: (r.official_url as string | null) ?? null,
      amount_max_aud: typeof r.amount_max_aud === "number" ? r.amount_max_aud : null,
      closes_at: (r.closes_at as string | null) ?? null,
      status: (r.status as string | null) ?? null,
    });
  }
  for (const r of (p.data ?? []) as Array<Record<string, unknown>>) {
    const isEvent = r.program_type === "event";
    out.set(refKey("program", String(r.id)), {
      ref_kind: "program",
      ref_id: String(r.id),
      name: String(r.name ?? r.id),
      official_url: (r.official_url as string | null) ?? null,
      amount_max_aud: typeof r.funding_aud === "number" && r.funding_aud > 0 ? r.funding_aud : null,
      closes_at: ((isEvent ? r.next_cohort_start : r.applications_close) as string | null) ?? null,
      status: (r.status as string | null) ?? null,
    });
  }
  return out;
}

async function loadEmails(db: SupabaseLike, userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (userIds.length === 0) return out;
  const { data } = await db.from("app_users").select("id, email").in("id", userIds);
  for (const u of (data ?? []) as Array<{ id: string; email: string | null }>) {
    const e = (u.email ?? "").toLowerCase().trim();
    if (e.includes("@")) out.set(u.id, e);
  }
  return out;
}

async function loadLatestReportUrls(db: SupabaseLike, userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (userIds.length === 0) return out;
  const { data } = await db
    .from("funding_reports")
    .select("id, user_id, created_at")
    .in("user_id", userIds)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(2_000);
  for (const r of (data ?? []) as Array<{ id: string; user_id: string | null }>) {
    if (!r.user_id || out.has(r.user_id)) continue;
    out.set(r.user_id, `${siteUrl()}/funding/report/${encodeURIComponent(r.id)}`);
  }
  return out;
}

// ─── Entry ───────────────────────────────────────────────────────────────────

export async function enqueueRadarDripsFromMatches(opts: RadarDripsOptions = {}): Promise<RadarDripsSummary> {
  const now = opts.now ?? new Date();
  const dryRun = opts.dryRun ?? false;
  const summary: RadarDripsSummary = {
    ok: true,
    dryRun,
    rows: 0,
    pending: 0,
    queued: 0,
    duplicate: 0,
    unsubscribed: 0,
    ignored: 0,
    cleared: 0,
    errors: 0,
  };
  const db = opts.db === undefined ? getSupabaseAdmin() : opts.db;
  if (!db) return { ...summary, ok: false, error: "supabase_unavailable" };

  let rows: PendingMatchRow[];
  try {
    rows = await loadPendingRows(db, opts.limit ?? 500);
  } catch (err) {
    return { ...summary, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  summary.rows = rows.length;
  if (rows.length === 0) return summary;

  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const needsAlternatives = rows.some((r) => readPendingEmail(r.last_notified).some((e) => e.event === "status_changed"));
  const [emails, reportUrls, siblings] = await Promise.all([
    loadEmails(db, userIds),
    loadLatestReportUrls(db, userIds),
    needsAlternatives ? loadSiblings(db, userIds) : Promise.resolve(new Map<string, PendingMatchRow[]>()),
  ]);

  const grantIds = new Set<string>();
  const programIds = new Set<string>();
  const collect = (r: Pick<PendingMatchRow, "ref_kind" | "ref_id">) => (r.ref_kind === "grant" ? grantIds : programIds).add(r.ref_id);
  rows.forEach(collect);
  for (const list of siblings.values()) list.forEach(collect);
  const refs = await loadRefs(db, Array.from(grantIds), Array.from(programIds));

  // One suppression + token lookup per address, not per row.
  const allowedCache = new Map<string, { allowed: boolean; token: string | null }>();
  async function gate(email: string): Promise<{ allowed: boolean; token: string | null }> {
    const hit = allowedCache.get(email);
    if (hit) return hit;
    const [allowed, prefs] = await Promise.all([canSendEmail(email, "money_radar"), getEmailPreferences(email)]);
    const v = { allowed, token: prefs?.unsubscribe_token ?? null };
    allowedCache.set(email, v);
    return v;
  }

  for (const row of rows) {
    const pending = readPendingEmail(row.last_notified);
    summary.pending += pending.length;
    const email = emails.get(row.user_id) ?? null;
    const ref = refs.get(refKey(row.ref_kind, row.ref_id));
    let rowFailed = false;

    for (const entry of pending) {
      const campaign = campaignForEvent(entry.event);
      if (!campaign) {
        summary.ignored++;
        continue;
      }
      if (!email) {
        summary.unsubscribed++;
        continue;
      }
      let g: { allowed: boolean; token: string | null };
      try {
        g = await gate(email);
      } catch (err) {
        summary.errors++;
        rowFailed = true;
        // S8-C: log the user id, never the address (PII in cron output).
        console.warn("[radar-drips] preference lookup failed", { user_id: row.user_id }, err instanceof Error ? err.message : String(err));
        continue;
      }
      if (!g.allowed) {
        summary.unsubscribed++;
        continue;
      }
      const alternatives =
        campaign === "radar_status_changed" ? pickAlternatives(row, siblings.get(row.user_id) ?? [], refs) : undefined;
      const payload = buildRadarDripPayload(row, ref, {
        report_url: reportUrls.get(row.user_id) ?? null,
        unsubscribe_token: g.token,
        alternatives,
      });
      if (dryRun) {
        summary.queued++;
        continue;
      }
      try {
        const result = await enqueueRadarDrip(email, row.user_id, campaign, payload, { now, db });
        if (result === "queued") summary.queued++;
        else if (result === "duplicate") summary.duplicate++;
        else {
          summary.errors++;
          rowFailed = true;
        }
      } catch (err) {
        summary.errors++;
        rowFailed = true;
        console.warn("[radar-drips] enqueue failed", row.id, err instanceof Error ? err.message : String(err));
      }
    }

    // Clear the key only when every entry was handled — a failed insert
    // leaves the row for the next run (dedupe makes the retry safe).
    if (rowFailed) continue;
    if (dryRun) {
      summary.cleared++;
      continue;
    }
    try {
      const { error } = await db
        .from("funding_matches")
        .update({ last_notified: withoutPendingEmail(row.last_notified) })
        .eq("id", row.id);
      if (error) {
        summary.errors++;
        console.warn("[radar-drips] clear pending_email failed", row.id, error.message);
      } else {
        summary.cleared++;
      }
    } catch (err) {
      summary.errors++;
      console.warn("[radar-drips] clear pending_email failed", row.id, err instanceof Error ? err.message : String(err));
    }
  }

  return summary;
}
