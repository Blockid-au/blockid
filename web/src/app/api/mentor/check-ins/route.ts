// POST /api/mentor/check-ins
//
// Upsert (per mentor, per subject, per ISO week) a weekly check-in:
// { subject_user_id, wins, blockers, next_focus, mood? }
// The route derives iso_week from the server clock so drift on the client can't
// backdate a submission.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";
import { getSupabaseAdmin } from "@/lib/supabase";
import { decideReveal } from "@/lib/reseller/customer-reveal";
import { completeness, currentIsoWeek, type CheckInMood } from "@/lib/mentor/check-ins";

export const dynamic = "force-dynamic";

const ROUTE = "/api/mentor/check-ins";

function readClientMeta(request: Request): { ip: string; ua: string } {
  const fwd = request.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
  const ua = request.headers.get("user-agent") || "";
  return { ip, ua };
}

function normaliseMood(raw: unknown): CheckInMood {
  return raw === "up" || raw === "flat" || raw === "down" ? raw : null;
}

function normStr(raw: unknown, max = 2000): string {
  if (typeof raw !== "string") return "";
  return raw.slice(0, max);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "unauthorised" }, { status: 401 });
  }

  let scope;
  try {
    scope = await scopedReseller(user);
  } catch (err) {
    if (err instanceof ResellerScopeError) {
      return NextResponse.json({ ok: false, reason: err.code }, { status: 403 });
    }
    throw err;
  }

  const body = (await request.json().catch(() => null)) as
    | { subject_user_id?: unknown; wins?: unknown; blockers?: unknown; next_focus?: unknown; mood?: unknown }
    | null;
  if (!body) return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });

  const allowed = await scope.allowedCustomerIds();
  const target = decideReveal(body.subject_user_id, allowed);
  if (!target.ok) {
    const status = target.reason === "not_in_scope" ? 403 : 400;
    return NextResponse.json({ ok: false, reason: target.reason }, { status });
  }

  const wins = normStr(body.wins);
  const blockers = normStr(body.blockers);
  const nextFocus = normStr(body.next_focus);
  const mood = normaliseMood(body.mood);
  const score = completeness({ wins, blockers, next_focus: nextFocus, mood });
  if (score === 0) {
    return NextResponse.json({ ok: false, reason: "empty_check_in" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });

  const now = new Date();
  const iso = currentIsoWeek(now);
  const nowIso = now.toISOString();

  const { data: upserted, error } = await supabase
    .from("mentor_check_ins")
    .upsert(
      {
        mentor_user_id: user.id,
        subject_user_id: target.customerId,
        iso_week: iso,
        wins,
        blockers,
        next_focus: nextFocus,
        mood,
        created_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "mentor_user_id,subject_user_id,iso_week" },
    )
    .select("id, iso_week, updated_at")
    .single();
  if (error || !upserted) {
    return NextResponse.json(
      { ok: false, reason: "upsert_failed", error: error?.message ?? "no_row" },
      { status: 500 },
    );
  }

  const db = resellerSupabase(scope);
  const { ip, ua } = readClientMeta(request);
  try {
    await db.auditLog({
      actor_user_id: user.id,
      subject_user_id: target.customerId,
      action: "mentor_check_in",
      fields: ["wins", "blockers", "next_focus", "mood"],
      route: ROUTE,
      ip,
      user_agent: ua,
      metadata: { iso_week: iso, completeness: Number(score.toFixed(2)) },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, reason: "audit_failed", error: (err as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, check_in: upserted, completeness: score });
}
