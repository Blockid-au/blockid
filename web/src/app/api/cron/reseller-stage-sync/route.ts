// GET|POST /api/cron/reseller-stage-sync
//
// G2 #7 (real-world workflow parity audit gap #7, S19-B). Nightly
// auto-updater for the channel-partner pipeline stage persisted in
// `reseller_customers` (migration 0333). For every active reseller and every
// active, non-opted-out attribution it resolves the customer user id, reads
// the FIRST occurrence of each real product signal and applies the pure
// transition rules from customer-stage.ts:
//
//   projects.created_at (min)                       → onboarded
//   svi_analyses.created_at (min)                   → scored
//   data_rooms.created_at / last_generated_at (min) → data_room
//   funding_reports / fundraise_rounds (min)        → fundraising
//
// Auto never moves a customer backwards, never leaves invested / churned,
// and only overrides a manual stage on evidence dated after the override.
// Customers with no row yet are seeded (at whatever the signals support, or
// `lead`) so the Customers table and the weekly digest have a row to read.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}` (constant-time, S8-C).
// `?dry=1` computes every transition and writes nothing. cron-runner.sh
// POSTs; GET is kept for manual checks. crontab.production runs it nightly
// at 03:50 UTC, before the Monday weekly digest reads stage_updated_at.

import { NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  EMPTY_SIGNALS,
  earliestIso,
  isCustomerStage,
  isCustomerStageSource,
  resolveAutoTransition,
  type CurrentStage,
  type CustomerStage,
  type CustomerStageSignals,
} from "@/lib/reseller/customer-stage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const ROUTE_TAG = "[reseller-stage-sync]";

function isDry(request: Request): boolean {
  try {
    const v = new URL(request.url).searchParams.get("dry");
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

interface AttributionRow {
  reseller_id: string;
  subject_type: "user" | "project";
  subject_user_id: string | null;
  subject_project_id: string | null;
}

interface StageRow {
  reseller_id: string;
  customer_user_id: string;
  stage: string;
  stage_source: string;
  stage_updated_at: string | null;
}

export interface StageSyncMove {
  reseller_id: string;
  customer_user_id: string;
  from: CustomerStage;
  to: CustomerStage;
  seeded: boolean;
}

export interface StageSyncSummary {
  ok: true;
  dry: boolean;
  resellers: number;
  customers: number;
  seeded: number;
  moved: number;
  unchanged: number;
  held: { terminal: number; manual: number; backwards: number };
  moves: StageSyncMove[];
  errors: string[];
}

type MinMap = Map<string, string>;

function keepMin(map: MinMap, key: string, iso: string | null | undefined) {
  if (!key || !iso) return;
  map.set(key, earliestIso(map.get(key) ?? null, iso) ?? iso);
}

async function handle(request: Request) {
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }
  const dry = isDry(request);
  const errors: string[] = [];

  // 1. Active resellers.
  const { data: resellerRows, error: resellerErr } = await supabase
    .from("resellers")
    .select("id")
    .eq("status", "active");
  if (resellerErr) {
    return NextResponse.json(
      { ok: false, reason: "resellers_query_failed", error: resellerErr.message },
      { status: 500 },
    );
  }
  const resellerIds = ((resellerRows ?? []) as Array<{ id: string }>).map((r) => r.id);
  const empty: StageSyncSummary = {
    ok: true,
    dry,
    resellers: resellerIds.length,
    customers: 0,
    seeded: 0,
    moved: 0,
    unchanged: 0,
    held: { terminal: 0, manual: 0, backwards: 0 },
    moves: [],
    errors,
  };
  if (resellerIds.length === 0) return NextResponse.json(empty);

  // 2. Active attributions → (reseller_id, customer_user_id) pairs.
  const { data: attribRows, error: attribErr } = await supabase
    .from("reseller_attributions")
    .select("reseller_id, subject_type, subject_user_id, subject_project_id")
    .in("reseller_id", resellerIds)
    .eq("status", "active")
    .eq("opted_out", false);
  if (attribErr) {
    return NextResponse.json(
      { ok: false, reason: "attributions_query_failed", error: attribErr.message },
      { status: 500 },
    );
  }
  const attributions = (attribRows ?? []) as AttributionRow[];
  const projectIds = attributions
    .filter((a) => a.subject_type === "project" && a.subject_project_id)
    .map((a) => a.subject_project_id as string);
  const projectOwner = new Map<string, string>();
  if (projectIds.length > 0) {
    const { data: projRows, error: projErr } = await supabase
      .from("projects")
      .select("id, user_id")
      .in("id", projectIds);
    if (projErr) errors.push(`projects_owner_lookup: ${projErr.message}`);
    for (const p of (projRows ?? []) as Array<{ id: string; user_id: string }>) {
      projectOwner.set(p.id, p.user_id);
    }
  }
  const pairs = new Map<string, { reseller_id: string; customer_user_id: string }>();
  for (const a of attributions) {
    const uid =
      a.subject_type === "user"
        ? a.subject_user_id
        : a.subject_project_id
          ? projectOwner.get(a.subject_project_id) ?? null
          : null;
    if (!uid) continue;
    pairs.set(`${a.reseller_id}:${uid}`, { reseller_id: a.reseller_id, customer_user_id: uid });
  }
  const customerIds = Array.from(new Set(Array.from(pairs.values()).map((p) => p.customer_user_id)));
  if (customerIds.length === 0) return NextResponse.json(empty);

  // 3. Real product signals — first occurrence per customer.
  const firstProject: MinMap = new Map();
  const firstSvi: MinMap = new Map();
  const firstDataRoom: MinMap = new Map();
  const firstFundraising: MinMap = new Map();

  {
    const { data, error } = await supabase
      .from("projects")
      .select("user_id, created_at")
      .in("user_id", customerIds);
    if (error) errors.push(`projects: ${error.message}`);
    for (const r of (data ?? []) as Array<{ user_id: string; created_at: string | null }>) {
      keepMin(firstProject, r.user_id, r.created_at);
    }
  }
  {
    const { data, error } = await supabase
      .from("svi_analyses")
      .select("user_id, created_at")
      .in("user_id", customerIds);
    if (error) errors.push(`svi_analyses: ${error.message}`);
    for (const r of (data ?? []) as Array<{ user_id: string; created_at: string | null }>) {
      keepMin(firstSvi, r.user_id, r.created_at);
    }
  }
  {
    const { data, error } = await supabase
      .from("data_rooms")
      .select("user_id, created_at, last_generated_at")
      .in("user_id", customerIds);
    if (error) errors.push(`data_rooms: ${error.message}`);
    for (const r of (data ?? []) as Array<{ user_id: string; created_at: string | null; last_generated_at: string | null }>) {
      keepMin(firstDataRoom, r.user_id, earliestIso(r.created_at, r.last_generated_at));
    }
  }
  {
    const { data, error } = await supabase
      .from("funding_reports")
      .select("user_id, created_at")
      .in("user_id", customerIds);
    if (error) errors.push(`funding_reports: ${error.message}`);
    for (const r of (data ?? []) as Array<{ user_id: string | null; created_at: string | null }>) {
      if (r.user_id) keepMin(firstFundraising, r.user_id, r.created_at);
    }
  }
  {
    // fundraise_rounds.account_id is the app user id (api/fundraise/route.ts).
    const { data, error } = await supabase
      .from("fundraise_rounds")
      .select("account_id, created_at")
      .in("account_id", customerIds);
    if (error) errors.push(`fundraise_rounds: ${error.message}`);
    for (const r of (data ?? []) as Array<{ account_id: string; created_at: string | null }>) {
      keepMin(firstFundraising, r.account_id, r.created_at);
    }
  }

  // 4. Current persisted rows.
  const current = new Map<string, CurrentStage>();
  {
    const { data, error } = await supabase
      .from("reseller_customers")
      .select("reseller_id, customer_user_id, stage, stage_source, stage_updated_at")
      .in("reseller_id", resellerIds);
    if (error) {
      // Table missing (0333 not applied) — nothing to update and nothing
      // safe to seed. Report loudly rather than pretend.
      return NextResponse.json(
        { ok: false, reason: "reseller_customers_query_failed", error: error.message },
        { status: 500 },
      );
    }
    for (const r of (data ?? []) as StageRow[]) {
      if (!isCustomerStage(r.stage) || !isCustomerStageSource(r.stage_source)) continue;
      current.set(`${r.reseller_id}:${r.customer_user_id}`, {
        stage: r.stage,
        stage_source: r.stage_source,
        stage_updated_at: r.stage_updated_at,
      });
    }
  }

  // 5. Resolve transitions.
  const summary: StageSyncSummary = { ...empty, customers: pairs.size };
  const now = new Date().toISOString();
  const upserts: Array<Record<string, unknown>> = [];
  for (const [key, pair] of pairs) {
    const signals: CustomerStageSignals = {
      ...EMPTY_SIGNALS,
      first_project_at: firstProject.get(pair.customer_user_id) ?? null,
      first_svi_at: firstSvi.get(pair.customer_user_id) ?? null,
      first_data_room_at: firstDataRoom.get(pair.customer_user_id) ?? null,
      first_fundraising_at: firstFundraising.get(pair.customer_user_id) ?? null,
    };
    const cur = current.get(key) ?? null;
    const t = resolveAutoTransition(cur, signals);
    const seeded = cur === null;
    if (!t.changed && !seeded) {
      summary.unchanged += 1;
      if (t.reason === "terminal_stage") summary.held.terminal += 1;
      else if (t.reason === "manual_override_holds") summary.held.manual += 1;
      else if (t.reason === "would_move_backwards") summary.held.backwards += 1;
      continue;
    }
    if (seeded) summary.seeded += 1;
    if (t.changed) {
      summary.moved += 1;
      summary.moves.push({
        reseller_id: pair.reseller_id,
        customer_user_id: pair.customer_user_id,
        from: t.from,
        to: t.to,
        seeded,
      });
    }
    upserts.push({
      reseller_id: pair.reseller_id,
      customer_user_id: pair.customer_user_id,
      stage: t.to,
      stage_source: "auto",
      // A seeded `lead` row keeps stage_updated_at = now but the digest
      // ignores auto-lead rows, so seeding never reads as a "move".
      stage_updated_at: now,
      stage_set_by: null,
      stage_note: null,
      updated_at: now,
    });
  }

  // 6. Write (unless dry).
  if (!dry && upserts.length > 0) {
    const { error } = await supabase
      .from("reseller_customers")
      .upsert(upserts, { onConflict: "reseller_id,customer_user_id" });
    if (error) {
      console.error(ROUTE_TAG, "upsert failed", error.message);
      return NextResponse.json(
        { ok: false, reason: "upsert_failed", error: error.message, summary },
        { status: 500 },
      );
    }
  }
  return NextResponse.json(summary);
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
