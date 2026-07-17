// T-1007: real MRR calculation, sourced from v_mrr_active / v_mrr_by_segment.
//
// See web/supabase/migrations/0083_mrr_view.sql and
// web/content/reports/cfo-review-v2.0.0-beta.6.md Section 3 for the rationale.
// This lib is server-only — it uses the SERVICE_ROLE client, and callers must
// be Route Handlers or Server Components.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";

export interface SegmentMrr {
  segment: string;
  mrrAud: number;
  subs: number;
}

export interface RealMrr {
  mrrAud: number;
  arrAud: number;
  activeSubs: number;
  bySegment: SegmentMrr[];
}

const ZERO: RealMrr = { mrrAud: 0, arrAud: 0, activeSubs: 0, bySegment: [] };

function centsToAud(cents: number | null | undefined): number {
  const n = Number(cents ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n) / 100;
}

/**
 * Read the real MRR snapshot from `v_mrr_active` + `v_mrr_by_segment`.
 *
 * MRR is (active subs) x (monthly-normalised plan price). This is NOT the
 * trailing-30-day cash inflow — the two can diverge sharply when annual
 * up-fronts land. Both are surfaced on the admin tile so the CFO can
 * reconcile them.
 *
 * Null-guards: when Supabase isn't configured (dev without secrets), we
 * return a zeroed result rather than throwing so the admin page still
 * renders.
 */
export async function getRealMrrAud(): Promise<RealMrr> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return ZERO;

  const [activeRes, segmentRes] = await Promise.all([
    supabase.from("v_mrr_active").select("plan_id, active_subs, mrr_cents"),
    supabase.from("v_mrr_by_segment").select("segment, active_subs, mrr_cents"),
  ]);

  const activeRows =
    (activeRes.data as Array<{ plan_id: string; active_subs: number | null; mrr_cents: number | null }> | null) ?? [];
  const segmentRows =
    (segmentRes.data as Array<{ segment: string; active_subs: number | null; mrr_cents: number | null }> | null) ?? [];

  const mrrCents = activeRows.reduce((sum, r) => sum + Number(r.mrr_cents ?? 0), 0);
  const activeSubs = activeRows.reduce((sum, r) => sum + Number(r.active_subs ?? 0), 0);

  const bySegment: SegmentMrr[] = segmentRows.map((r) => ({
    segment: r.segment,
    mrrAud: centsToAud(r.mrr_cents),
    subs: Number(r.active_subs ?? 0),
  }));

  const mrrAud = centsToAud(mrrCents);
  return {
    mrrAud,
    arrAud: Math.round(mrrAud * 12 * 100) / 100,
    activeSubs,
    bySegment,
  };
}
