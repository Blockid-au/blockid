/**
 * POST /api/term-sheet/compare — side-by-side of 2–4 analysed term sheets (S26-B).
 *
 * Body: { ids: string[] (2–4 `term_sheet_analyses` ids), confirm?: boolean }
 *
 * The rows are the CALLER's own analyses (`term_sheet_analyses.user_id =
 * user.id` — each was their upload, charged to their credits, exactly as
 * api/term-sheet reads and deletes them), so an id that belongs to someone
 * else simply is not found (404 `sheet_not_found`, never an oracle). The
 * active project is resolved (viewer+) only for the credit-spend metadata
 * (reseller sandbox routing) — no project data is read.
 *
 * Gate / cost (show-cost-first):
 *   • Growth+ / an active Startup Package (`hasGrowthExtras`) → included, 0;
 *   • otherwise `FEATURE_COSTS.term_sheet_compare` (2 credits). `confirm !==
 *     true` returns 200 `{ preview: true, cost, balance, included, sheets }`
 *     and spends nothing. The comparison is pure (`compareTermSheets`) and
 *     nothing is persisted — re-running is a new charge, so the client
 *     keeps the result on the page (and prints it) rather than re-posting.
 *
 *   200 { ok, preview: true, cost, listedCost, included, balance, creditNote, sheets: [{ id, label }] }
 *   200 { ok, comparison, cost, creditsCharged, balance, creditNote }
 *   400 bad ids  401  402 insufficient_credits | credit_spend_failed
 *   403/404 scope  404 sheet_not_found  429  503
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { readJsonBody } from "@/lib/security/request-guards";
import { canAfford, spendCredits, FEATURE_COSTS } from "@/lib/credits";
import { getSupabaseAdmin } from "@/lib/supabase";
import { creditChargeNote } from "@/lib/projects";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { hasGrowthExtras } from "@/lib/funding/growth-extras";
import { compareTermSheets, MAX_SHEETS, MIN_SHEETS, sheetLabel, type CompareSheetInput } from "@/lib/term-sheet/compare";
import type { TermSheetAnalysis } from "@/lib/term-sheet/schema";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";

export const FEATURE_KEY = "term_sheet_compare";
const RATE_LIMIT_PER_HOUR = 30;
const BODY_MAX_BYTES = 8 * 1024;

const BodySchema = z.object({
  ids: z.array(z.string().uuid()).min(MIN_SHEETS).max(MAX_SHEETS),
  confirm: z.boolean().optional(),
});

interface SheetRow {
  id: string;
  user_id: string;
  created_at: string | null;
  company_name: string | null;
  raw_text: string | null;
  analysis_json: TermSheetAnalysis | null;
  result_json: TermSheetAnalysis | null;
}

async function POST_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const limited = enforceRateLimit("term-sheet-compare", user.id, request, RATE_LIMIT_PER_HOUR, 60 * 60 * 1000);
  if (limited) return limited;

  const read = await readJsonBody<unknown>(request, BODY_MAX_BYTES);
  if (!read.ok) {
    if (read.status === 413) return read.response;
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(read.body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: `ids: ${MIN_SHEETS}–${MAX_SHEETS} analysis ids required` }, { status: 400 });
  }
  const ids = Array.from(new Set(parsed.data.ids));
  if (ids.length < MIN_SHEETS) return NextResponse.json({ ok: false, error: `ids: ${MIN_SHEETS}–${MAX_SHEETS} distinct analysis ids required` }, { status: 400 });
  const confirmed = parsed.data.confirm === true;

  const { scope, denied } = await projectScopeOrDeny("viewer");
  if (denied) return denied;
  const creditNote = creditChargeNote(scope);

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const { data } = await supabase
    .from("term_sheet_analyses")
    .select("id, user_id, created_at, company_name, raw_text, analysis_json, result_json")
    .eq("user_id", user.id)
    .in("id", ids);
  const rows = ((data as SheetRow[] | null) ?? []).filter((r) => r && r.user_id === user.id && ids.includes(r.id));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) return NextResponse.json({ ok: false, error: "sheet_not_found", missing }, { status: 404 });

  const inputs: CompareSheetInput[] = ids.map((id, i) => {
    const r = byId.get(id)!;
    const analysis = (r.analysis_json ?? r.result_json) as TermSheetAnalysis;
    return { id: r.id, label: sheetLabel({ company_name: r.company_name, created_at: r.created_at, analysis }, `Sheet ${i + 1}`), analysis, rawText: r.raw_text, createdAt: r.created_at };
  });
  if (inputs.some((s) => !s.analysis || typeof s.analysis !== "object")) {
    return NextResponse.json({ ok: false, error: "sheet_not_found", missing: inputs.filter((s) => !s.analysis).map((s) => s.id) }, { status: 404 });
  }

  const included = await hasGrowthExtras({ id: user.id, plan: user.plan });
  const listedCost = FEATURE_COSTS[FEATURE_KEY] ?? 2;
  let cost = 0;
  let balance: number | null = null;
  if (!included) {
    const afford = await canAfford(user.id, FEATURE_KEY);
    cost = listedCost;
    balance = afford.balance;
    if (!afford.allowed) {
      return NextResponse.json({ ok: false, error: "insufficient_credits", creditsRequired: cost, balance: afford.balance, reason: afford.reason ?? "insufficient_credits", creditNote }, { status: 402 });
    }
  }

  if (!confirmed) {
    return NextResponse.json({ ok: true, preview: true, cost, listedCost, included, balance, creditNote, sheets: inputs.map((s) => ({ id: s.id, label: s.label })) });
  }

  // Pure and unpersisted, so it runs BEFORE the spend: a stored analysis
  // the comparator cannot read must never cost credits (S26 review P2).
  let comparison;
  try {
    comparison = compareTermSheets(inputs);
  } catch (err) {
    console.error("[term-sheet/compare] comparison failed before any charge", { ids, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ ok: false, error: "comparison_failed", creditsCharged: 0 }, { status: 422 });
  }

  let creditsCharged = 0;
  if (cost > 0) {
    const spent = await spendCredits(user.id, FEATURE_KEY, { project_id: scope?.projectId ?? null, sheet_ids: ids });
    if (!spent.ok) return NextResponse.json({ ok: false, error: "credit_spend_failed", creditsRequired: cost, balance: spent.balance, creditNote }, { status: 402 });
    creditsCharged = cost;
    balance = spent.balance;
  }

  return NextResponse.json({ ok: true, comparison, cost, included, creditsCharged, balance, creditNote }, { headers: { "Cache-Control": "private, no-store" } });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/term-sheet/compare/route.ts", method: "POST" }, POST_handler);
