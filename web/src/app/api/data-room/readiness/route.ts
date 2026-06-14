import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectIdFromRequest } from "@/lib/projects";

export const dynamic = "force-dynamic";

// ── Scoring weights (must sum to 100) ────────────────────────────────────────
const CATEGORIES = [
  { key: "business_plan",   label: "Business Plan",    weight: 20 },
  { key: "financials",      label: "Financials",       weight: 20 },
  { key: "team_info",       label: "Team Info",        weight: 15 },
  { key: "cap_table",       label: "Cap Table",        weight: 15 },
  { key: "product_demo",    label: "Product Demo",     weight: 15 },
  { key: "legal_docs",      label: "Legal Docs",       weight: 15 },
] as const;

type CategoryKey = (typeof CATEGORIES)[number]["key"];

type Badge = "none" | "bronze" | "silver" | "gold";

function scoreToBadge(score: number): Badge {
  if (score >= 80) return "gold";
  if (score >= 50) return "silver";
  if (score >= 25) return "bronze";
  return "none";
}

// ── Map document folder/section names → category keys ────────────────────────
// These keywords are matched case-insensitively against data_room_documents
// folder/document_name/section values.

const CATEGORY_KEYWORDS: Record<CategoryKey, string[]> = {
  business_plan: ["business plan", "executive summary", "pitch deck", "overview", "strategy"],
  financials:    ["financial", "p&l", "profit", "forecast", "revenue", "model", "cash flow", "balance"],
  team_info:     ["team", "founder", "co-founder", "advisor", "bio", "linkedin"],
  cap_table:     ["cap table", "equity", "shareholder", "shares", "esop", "vesting", "convertible"],
  product_demo:  ["product", "demo", "prototype", "mvp", "screenshot", "video", "deck"],
  legal_docs:    ["legal", "contract", "asic", "abn", "ip", "patent", "trademark", "agreement", "nda", "term"],
};

function classifyDocument(doc: {
  folder: string | null;
  document_name: string | null;
  section: string | null;
}): CategoryKey | null {
  const text = [doc.folder, doc.document_name, doc.section]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const [key, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) {
      return key as CategoryKey;
    }
  }
  return null;
}

// ── GET /api/data-room/readiness ──────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  // Allow explicit project_id from query param, fall back to cookie-scoped project
  const qProjectId = req.nextUrl.searchParams.get("project_id");
  const projectId = qProjectId ?? (await getProjectIdFromRequest());

  // ── Fetch the user's data room ────────────────────────────────────────────
  const roomQuery = supabase
    .from("data_rooms")
    .select("id, completeness_score")
    .eq("account_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const { data: room } = await roomQuery;

  // If no data room exists, return a zero score with empty breakdown
  if (!room) {
    const breakdown = Object.fromEntries(
      CATEGORIES.map((c) => [
        c.key,
        { label: c.label, weight: c.weight, score: 0, complete: 0, total: 0, missing: [] as string[] },
      ])
    ) as Record<string, { label: string; weight: number; score: number; complete: number; total: number; missing: string[] }>;

    return NextResponse.json({
      ok: true,
      score: 0,
      breakdown,
      badge: "none" as Badge,
      missingCategories: CATEGORIES.map((c) => c.label),
      dataRoomExists: false,
      projectId,
    });
  }

  // ── Fetch all documents for that room ────────────────────────────────────
  const { data: docs } = await supabase
    .from("data_room_documents")
    .select("folder, document_name, section, status, priority")
    .eq("data_room_id", room.id);

  // ── Tally by category ─────────────────────────────────────────────────────
  const tally: Record<CategoryKey, { complete: number; total: number; missing: string[] }> = {
    business_plan: { complete: 0, total: 0, missing: [] },
    financials:    { complete: 0, total: 0, missing: [] },
    team_info:     { complete: 0, total: 0, missing: [] },
    cap_table:     { complete: 0, total: 0, missing: [] },
    product_demo:  { complete: 0, total: 0, missing: [] },
    legal_docs:    { complete: 0, total: 0, missing: [] },
  };

  // Also check svi_evidence and shareholders tables for additional signals
  // (non-data-room evidence that counts toward team_info and cap_table)
  const { count: evidenceCount } = await supabase
    .from("svi_evidence")
    .select("id", { count: "exact", head: true })
    .eq("account_id", user.id);

  const { count: shareholderCount } = await supabase
    .from("shareholders")
    .select("id", { count: "exact", head: true })
    .eq("account_id", user.id);

  for (const doc of docs ?? []) {
    const cat = classifyDocument(doc);
    if (!cat) continue;
    tally[cat].total++;
    if ((doc.status as string) === "complete" || (doc.status as string) === "uploaded") {
      tally[cat].complete++;
    } else if ((doc.priority as string) === "P0") {
      tally[cat].missing.push((doc.document_name as string | null) ?? "Unnamed document");
    }
  }

  // Supplement with external evidence
  if ((evidenceCount ?? 0) > 0) {
    // Count evidence items as boosting team_info
    tally.team_info.total = Math.max(tally.team_info.total, 1);
    tally.team_info.complete = Math.max(tally.team_info.complete, Math.min(evidenceCount ?? 0, 3));
  }
  if ((shareholderCount ?? 0) > 0) {
    // Shareholders count as cap_table evidence
    tally.cap_table.total = Math.max(tally.cap_table.total, 1);
    tally.cap_table.complete = Math.max(tally.cap_table.complete, 1);
  }

  // ── Build breakdown + weighted score ─────────────────────────────────────
  let totalScore = 0;
  const breakdown: Record<string, {
    label: string;
    weight: number;
    score: number;
    complete: number;
    total: number;
    missing: string[];
  }> = {};

  const missingCategories: string[] = [];

  for (const cat of CATEGORIES) {
    const t = tally[cat.key];
    const categoryScore = t.total > 0 ? Math.round((t.complete / t.total) * 100) : 0;
    const weightedContribution = (categoryScore / 100) * cat.weight;
    totalScore += weightedContribution;
    breakdown[cat.key] = {
      label: cat.label,
      weight: cat.weight,
      score: categoryScore,
      complete: t.complete,
      total: t.total,
      missing: t.missing.slice(0, 3), // top 3 missing P0 items
    };
    if (categoryScore < 50) {
      missingCategories.push(cat.label);
    }
  }

  const finalScore = Math.round(totalScore);
  const badge = scoreToBadge(finalScore);

  return NextResponse.json({
    ok: true,
    score: finalScore,
    breakdown,
    badge,
    missingCategories,
    dataRoomExists: true,
    projectId,
  });
}
