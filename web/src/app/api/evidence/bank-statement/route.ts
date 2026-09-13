// POST /api/evidence/bank-statement
// Parses an AU bank statement CSV (ANZ/CBA/NAB/Westpac/generic) and creates
// CFO evidence (burn rate, runway signals) in svi_evidence.
//
// Accepted CSV formats (auto-detected by header):
//   ANZ:      Date, Details, Debit, Credit, Balance
//   CBA:      Date, Amount, Description, Balance
//   NAB:      Date, Amount, Account Number, Transaction Type, Description
//   Westpac:  BSB, Account Number, Transaction Date, Narration, Cheque Number,
//             Debit Amount, Credit Amount, Balance
//   Generic:  any CSV with Date + (Amount | Debit/Credit) columns

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { findOrCreateSVIAccount } from "@/lib/projects";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { apiRoute } from "@/lib/audit/api-route";
import { analyzeTransactions, detectAndParse, parseCSV } from "@/lib/expenses/bank-csv";

export const dynamic = "force-dynamic";

// S28-C — the CSV parser + burn analysis live in src/lib/expenses/bank-csv.ts
// (shared with POST /api/expenses/import, which stores every line).

// ── Route handler ────────────────────────────────────────────────────────────

async function POST_handler(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const limited = enforceRateLimit("bank-statement", user.email, req, 10, 3_600_000);
  if (limited) return limited;

  // S18-A — member-aware write (editor+): the evidence row lands on the
  // OWNER's account; a viewer is refused before the upload is parsed.
  const { scope, denied } = await projectScopeOrDeny("editor");
  if (denied) return denied;
  const projectId = scope?.projectId ?? null;
  const dataEmail = scope?.dataEmail ?? user.email;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    if (!file.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json({ ok: false, error: "CSV file required" }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: "File too large (max 5MB)" }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseCSV(text);
    const parsed = detectAndParse(rows);

    if (!parsed || parsed.txs.length === 0) {
      return NextResponse.json({
        ok: false,
        error: "Could not parse CSV. Supported formats: ANZ, CBA, NAB, Westpac, or any CSV with Date and Amount columns.",
      }, { status: 422 });
    }

    const { totalDebits, totalCredits, netCashFlow, avgMonthlyBurn, months, sviImpact } =
      analyzeTransactions(parsed.txs);

    const label = `Bank Statement (${parsed.bankName}) — ${months}mo · avg A$${avgMonthlyBurn.toLocaleString("en-AU")}/mo burn`;
    const valuePayload = JSON.stringify({
      bankName: parsed.bankName,
      totalDebitsAud: Math.round(totalDebits),
      totalCreditsAud: Math.round(totalCredits),
      netCashFlowAud: Math.round(netCashFlow),
      avgMonthlyBurnAud: avgMonthlyBurn,
      monthsCovered: months,
      transactionCount: parsed.txs.length,
    });

    const supabase = getSupabaseAdmin();
    let evidenceId: string | null = null;

    if (supabase) {
      const accountId = await findOrCreateSVIAccount(dataEmail, projectId);
      if (accountId) {
        const { data: ev } = await supabase
          .from("svi_evidence")
          .insert({
            account_id: accountId,
            evidence_type: "bank_statement",
            label,
            value_or_url: valuePayload,
            confidence_level: "connected_source",
            // SVI key (bank P&L evidence sits with investor readiness, like xero_pl —
            // "financial_health" was never one of the 8 dimensions; see 0353/0354)
            dimension: "iri",
            svi_impact: sviImpact,
            source_provider: "bank_csv",
          })
          .select("id")
          .single();
        if (ev) evidenceId = ev.id;
      }
    }

    return NextResponse.json({
      ok: true,
      evidenceId,
      bankName: parsed.bankName,
      summary: {
        transactionCount: parsed.txs.length,
        monthsCovered: months,
        avgMonthlyBurnAud: avgMonthlyBurn,
        netCashFlowAud: Math.round(netCashFlow),
        sviImpact,
      },
    });
  } catch (err) {
    console.error("[bank-statement]", err);
    return NextResponse.json({ ok: false, error: "Parse failed" }, { status: 500 });
  }
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/evidence/bank-statement/route.ts", method: "POST" }, POST_handler);
