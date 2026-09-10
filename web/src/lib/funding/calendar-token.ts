// Server side of the Money Radar ICS feed (T0245).
//
//   getOrMintCalendarToken(userId)   lazily mints `app_users.calendar_token`
//   userForCalendarToken(token)      token → { id, email, plan } or null
//   loadFundingCalendarRows(userId)  funding_matches ⨝ au_grants/au_programs
//                                    → FundingCalendarRow[] for buildFundingCalendar()
//   fundingCalendarUrl(token, base)  the webcal-able URL for the tile / prefs
//
// The token is a 24-byte base64url secret (same shape as
// funding_reports.access_token). Feature access is still checked by the
// route on every fetch (`money_radar` via getEntitlements) — a cancelled
// subscriber's calendar app gets 403 and an empty feed, never stale data.
// Colocated tests: calendar-token.test.ts.

import "server-only";
import { randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { FundingCalendarRow } from "./calendar";

export const CALENDAR_TOKEN_BYTES = 24;

export function newCalendarToken(): string {
  return randomBytes(CALENDAR_TOKEN_BYTES).toString("base64url");
}

/** Looks like one of ours (base64url, 24 bytes → 32 chars). Cheap pre-filter before the DB hits. */
export function isCalendarTokenShape(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{32}$/.test(v);
}

export function fundingCalendarUrl(token: string, base?: string | null): string {
  const site = (base ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au").replace(/\/$/, "");
  return `${site}/api/funding/calendar.ics?token=${encodeURIComponent(token)}`;
}

export interface CalendarTokenUser {
  id: string;
  email: string | null;
  plan: string | null;
}

export async function getOrMintCalendarToken(userId: string): Promise<string | null> {
  const sb = getSupabaseAdmin();
  if (!sb || !userId) return null;
  const { data, error } = await sb.from("app_users").select("calendar_token").eq("id", userId).maybeSingle();
  if (error) {
    console.warn("[funding/calendar-token] read failed", error.message);
    return null;
  }
  const existing = (data as { calendar_token?: string | null } | null)?.calendar_token ?? null;
  if (existing) return existing;

  // Only fill when still NULL so two concurrent mints cannot clobber each other.
  const token = newCalendarToken();
  const { data: updated, error: updErr } = await sb
    .from("app_users")
    .update({ calendar_token: token })
    .eq("id", userId)
    .is("calendar_token", null)
    .select("calendar_token")
    .maybeSingle();
  if (updErr) {
    console.warn("[funding/calendar-token] mint failed", updErr.message);
    return null;
  }
  const minted = (updated as { calendar_token?: string | null } | null)?.calendar_token ?? null;
  if (minted) return minted;
  // Lost the race — read back the winner.
  const { data: again } = await sb.from("app_users").select("calendar_token").eq("id", userId).maybeSingle();
  return (again as { calendar_token?: string | null } | null)?.calendar_token ?? null;
}

export async function userForCalendarToken(token: string): Promise<CalendarTokenUser | null> {
  if (!isCalendarTokenShape(token)) return null;
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb.from("app_users").select("id, email, plan").eq("calendar_token", token).maybeSingle();
  if (error || !data) return null;
  const row = data as { id: string; email: string | null; plan: string | null };
  return { id: row.id, email: row.email ?? null, plan: row.plan ?? null };
}

interface MatchRow {
  ref_kind: "grant" | "program";
  ref_id: string;
  project_id: string | null;
  closes_at: string | null;
  score: number;
  status_at_match: string;
}

/** funding_matches for the user joined (in memory) to the catalogue names / URLs. */
export async function loadFundingCalendarRows(userId: string): Promise<FundingCalendarRow[]> {
  const sb = getSupabaseAdmin();
  if (!sb || !userId) return [];
  const { data, error } = await sb
    .from("funding_matches")
    .select("ref_kind, ref_id, project_id, closes_at, score, status_at_match")
    .eq("user_id", userId)
    .not("closes_at", "is", null)
    .in("status_at_match", ["open", "upcoming"]);
  if (error) {
    if (error.code !== "42P01") console.warn("[funding/calendar-token] matches read failed", error.message);
    return [];
  }
  const matches = ((data ?? []) as MatchRow[]).filter((m) => m.ref_id && (m.ref_kind === "grant" || m.ref_kind === "program"));
  if (matches.length === 0) return [];

  const grantIds = Array.from(new Set(matches.filter((m) => m.ref_kind === "grant").map((m) => m.ref_id)));
  const programIds = Array.from(new Set(matches.filter((m) => m.ref_kind === "program").map((m) => m.ref_id)));
  const projectIds = Array.from(new Set(matches.map((m) => m.project_id).filter((p): p is string => Boolean(p))));

  const [grantsRes, programsRes, projectsRes] = await Promise.all([
    grantIds.length ? sb.from("au_grants").select("id, name, official_url, summary, amount_max_aud").in("id", grantIds) : Promise.resolve({ data: [] }),
    programIds.length
      ? sb.from("au_programs").select("id, name, official_url, summary, program_type, next_cohort_start").in("id", programIds)
      : Promise.resolve({ data: [] }),
    projectIds.length ? sb.from("projects").select("id, name").in("id", projectIds) : Promise.resolve({ data: [] }),
  ]);

  const grants = new Map(
    ((grantsRes.data ?? []) as Array<{ id: string; name: string; official_url: string | null; summary: string | null; amount_max_aud: number | null }>).map((g) => [g.id, g]),
  );
  const programs = new Map(
    (
      (programsRes.data ?? []) as Array<{
        id: string;
        name: string;
        official_url: string | null;
        summary: string | null;
        program_type: string | null;
        next_cohort_start: string | null;
      }>
    ).map((p) => [p.id, p]),
  );
  const projects = new Map(((projectsRes.data ?? []) as Array<{ id: string; name: string | null }>).map((p) => [p.id, p.name]));

  const rows: FundingCalendarRow[] = [];
  for (const m of matches) {
    const startup = m.project_id ? (projects.get(m.project_id) ?? null) : null;
    if (m.ref_kind === "grant") {
      const g = grants.get(m.ref_id);
      if (!g) continue;
      rows.push({
        ref_kind: "grant",
        ref_id: m.ref_id,
        closes_at: m.closes_at,
        score: m.score,
        status_at_match: m.status_at_match,
        name: g.name,
        official_url: g.official_url,
        summary: g.summary,
        amount_max_aud: g.amount_max_aud,
        startup,
      });
    } else {
      const p = programs.get(m.ref_id);
      if (!p) continue;
      rows.push({
        ref_kind: "program",
        ref_id: m.ref_id,
        closes_at: m.closes_at,
        score: m.score,
        status_at_match: m.status_at_match,
        name: p.name,
        official_url: p.official_url,
        summary: p.summary,
        program_type: p.program_type,
        next_cohort_start: p.next_cohort_start,
        startup,
      });
    }
  }
  return rows;
}
