/**
 * POST /api/expenses/import — bank CSV → bank_transactions (S28-C).
 *
 * multipart/form-data `file` (.csv ≤ 5 MB; ANZ / CBA / NAB / Westpac /
 * generic, same parser as /api/evidence/bank-statement). Editor+ on the
 * active project; rows land on the PROJECT (never the caller's own key).
 *
 *   1. parse + normalise (AU day-first dates, signed cents, sha256 hash);
 *   2. upsert with (project_id, hash) dedupe — re-uploading a statement or
 *      an overlapping export stores each line once;
 *   3. rules layer (learned expense_rules → keyword table → recurring) —
 *      free; whatever no rule placed stays in the AI queue.
 *
 * 200 { ok, bankName, statementRef, parsed, skipped, inserted, duplicates,
 *       ruleCategorised, needsAi, queue, cost, listedCost, included, creditNote }
 *   `queue` = the WHOLE project queue (older imports included); `cost` is
 *   what "Categorise with AI" would charge for it — shown before any run.
 * 400 no/invalid file  401  403/404 scope  422 unparseable  429  503
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { creditChargeNote } from "@/lib/projects";
import { creditNoteFor } from "@/lib/credits-preview";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { FEATURE_COSTS } from "@/lib/credits";
import { apiRoute } from "@/lib/audit/api-route";
import { detectAndParse, normaliseTransactions, parseCSV, statementRef } from "@/lib/expenses/bank-csv";
import { categoriseIncluded } from "@/lib/expenses/gate";
import { EXPENSE_CATEGORISE_FEATURE, categoriseCost } from "@/lib/expenses/cost";
import { countAiQueue, importTransactions, loadLearnedRules } from "@/lib/expenses/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_LINES = 5000;

async function POST_handler(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const limited = enforceRateLimit("expenses-import", user.id, req, 20, 3_600_000);
  if (limited) return limited;

  const { scope, denied } = await projectScopeOrDeny("editor");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "project_required", message: "Select a startup first — bank lines are stored per project." }, { status: 404 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  let file: File | null;
  try {
    const formData = await req.formData();
    file = formData.get("file") as File | null;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid form data" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".csv")) return NextResponse.json({ ok: false, error: "CSV file required" }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ ok: false, error: "File too large (max 5MB)" }, { status: 400 });

  const text = await file.text();
  const parsed = detectAndParse(parseCSV(text));
  if (!parsed || parsed.txs.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Could not parse CSV. Supported formats: ANZ, CBA, NAB, Westpac, or any CSV with Date and Amount columns." },
      { status: 422 },
    );
  }
  if (parsed.txs.length > MAX_LINES) {
    return NextResponse.json({ ok: false, error: `Too many lines (max ${MAX_LINES} per upload) — split the export by quarter.` }, { status: 422 });
  }
  const { rows, skipped } = normaliseTransactions(parsed.txs);
  if (rows.length === 0) {
    return NextResponse.json({ ok: false, error: "No usable lines — every row was missing a date, an amount or a description." }, { status: 422 });
  }

  const ref = statementRef(parsed.bankName, file.name, text);
  try {
    const learned = await loadLearnedRules(supabase, scope.projectId);
    const result = await importTransactions(supabase, scope.projectId, ref, rows, learned);
    const [queue, gate] = await Promise.all([countAiQueue(supabase, scope.projectId), categoriseIncluded({ id: user.id, plan: user.plan })]);
    const listedCost = FEATURE_COSTS[EXPENSE_CATEGORISE_FEATURE] ?? 1;
    const cost = categoriseCost(queue, listedCost, gate.included);
    return NextResponse.json({
      ok: true,
      bankName: parsed.bankName,
      statementRef: ref,
      parsed: parsed.txs.length,
      skipped,
      inserted: result.inserted,
      duplicates: result.duplicates,
      ruleCategorised: result.ruleCategorised,
      needsAi: result.needsAi,
      queue,
      cost,
      listedCost,
      included: gate.included,
      // live-qa run 1 (2026-09-13): same note rule as every other preview.
      creditNote: creditNoteFor({ cost, included: gate.included, chargeNote: creditChargeNote(scope) }),
    });
  } catch (err) {
    console.error("[expenses:import]", err);
    return NextResponse.json({ ok: false, error: "Import failed" }, { status: 500 });
  }
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/expenses/import/route.ts", method: "POST" }, POST_handler);
