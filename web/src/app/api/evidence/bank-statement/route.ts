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
import { getProjectIdFromRequest, findOrCreateSVIAccount } from "@/lib/projects";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// ── CSV parser (no external dependency) ─────────────────────────────────────

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cols: string[] = [];
    let inQuote = false;
    let cur = "";
    for (const ch of trimmed) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === "," && !inQuote) { cols.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    cols.push(cur.trim());
    rows.push(cols);
  }
  return rows;
}

interface Tx { date: string; amount: number; description: string }

function detectAndParse(rows: string[][]): { txs: Tx[]; bankName: string } | null {
  if (rows.length < 2) return null;
  const header = rows[0].map((h) => h.toLowerCase().replace(/[^a-z ]/g, "").trim());

  // ANZ: Date, Details, Debit, Credit, Balance
  const anzDebit = header.indexOf("debit");
  const anzCredit = header.indexOf("credit");
  const anzDate = header.indexOf("date");
  if (anzDate >= 0 && anzDebit >= 0 && anzCredit >= 0) {
    const txs: Tx[] = [];
    for (const row of rows.slice(1)) {
      if (row.length < 3) continue;
      const debit = parseFloat(row[anzDebit]?.replace(/[,$\s]/g, "") ?? "") || 0;
      const credit = parseFloat(row[anzCredit]?.replace(/[,$\s]/g, "") ?? "") || 0;
      txs.push({ date: row[anzDate] ?? "", amount: credit - debit, description: row[1] ?? "" });
    }
    return { txs, bankName: "ANZ" };
  }

  // CBA: Date, Amount, Description, Balance
  const cbaAmount = header.indexOf("amount");
  const cbaDate = header.indexOf("date");
  const cbaDesc = header.indexOf("description");
  if (cbaDate >= 0 && cbaAmount >= 0 && cbaDesc >= 0 && anzDebit < 0) {
    const txs: Tx[] = rows.slice(1).map((row) => ({
      date: row[cbaDate] ?? "",
      amount: parseFloat(row[cbaAmount]?.replace(/[,$\s]/g, "") ?? "") || 0,
      description: row[cbaDesc] ?? "",
    }));
    return { txs, bankName: "CBA" };
  }

  // Westpac: Debit Amount / Credit Amount columns
  const wDebit = header.findIndex((h) => h.includes("debit"));
  const wCredit = header.findIndex((h) => h.includes("credit"));
  const wDate = header.findIndex((h) => h.includes("date") || h.includes("transaction date"));
  if (wDate >= 0 && wDebit >= 0 && wCredit >= 0 && wDebit !== anzDebit) {
    const txs: Tx[] = rows.slice(1).map((row) => {
      const debit = parseFloat(row[wDebit]?.replace(/[,$\s]/g, "") ?? "") || 0;
      const credit = parseFloat(row[wCredit]?.replace(/[,$\s]/g, "") ?? "") || 0;
      return { date: row[wDate] ?? "", amount: credit - debit, description: row[3] ?? "" };
    });
    return { txs, bankName: "Westpac" };
  }

  // Generic: first column with "date" + column with "amount"
  const gDate = header.findIndex((h) => h.includes("date"));
  const gAmount = header.findIndex((h) => h.includes("amount") || h.includes("value"));
  if (gDate >= 0 && gAmount >= 0) {
    const txs: Tx[] = rows.slice(1).map((row) => ({
      date: row[gDate] ?? "",
      amount: parseFloat(row[gAmount]?.replace(/[,$\s]/g, "") ?? "") || 0,
      description: row.find((_, i) => i !== gDate && i !== gAmount) ?? "",
    }));
    return { txs, bankName: "Generic" };
  }

  return null;
}

function analyzeTransactions(txs: Tx[]): {
  totalDebits: number;
  totalCredits: number;
  netCashFlow: number;
  avgMonthlyBurn: number;
  months: number;
  sviImpact: number;
} {
  const validTxs = txs.filter((t) => !isNaN(t.amount));
  const totalDebits = validTxs.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalCredits = validTxs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const netCashFlow = totalCredits - totalDebits;

  // Estimate months covered
  const dates = validTxs
    .map((t) => new Date(t.date))
    .filter((d) => !isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  const months = dates.length >= 2
    ? Math.max(1, Math.round((dates[dates.length - 1].getTime() - dates[0].getTime()) / (30 * 86_400_000)))
    : 1;

  const avgMonthlyBurn = Math.round(totalDebits / months);

  // SVI impact: evidence quality based on data richness
  const sviImpact = Math.min(20, Math.max(5, Math.floor(validTxs.length / 10)));

  return { totalDebits, totalCredits, netCashFlow, avgMonthlyBurn, months, sviImpact };
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const limited = enforceRateLimit("bank-statement", user.email, req, 10, 3_600_000);
  if (limited) return limited;

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
      const projectId = await getProjectIdFromRequest();
      const accountId = await findOrCreateSVIAccount(user.email, projectId);
      if (accountId) {
        const { data: ev } = await supabase
          .from("svi_evidence")
          .insert({
            account_id: accountId,
            evidence_type: "bank_statement",
            label,
            value_or_url: valuePayload,
            confidence_level: "connected_source",
            dimension: "financial_health",
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
