// GET /api/cap-table/issues — the share-issue ledger for the active project (S26-B).
//
// `share_transactions` rows with `transaction_type = 'issue'` for the
// project OWNER's cap table (viewer+), joined to the allottee and share
// class names, newest first, plus which of them already carry a generated
// board resolution. Feeds the "Share issues" section of the cap-table page,
// where each row gets a "Board resolution" button.
//
//   200 { ok, role, issues: [{ id, allotteeName, allotteeRole, shareClass, shares, pricePerShareAud, totalValueAud, roundName, effectiveDate, resolutionPdfUrl }] }
//   401 / 403 / 404 scope   503 no db
//
// GET only — nothing mutates.

import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { listResolutionsForProject } from "@/lib/board-resolutions/server";

export const dynamic = "force-dynamic";

interface TxRow {
  id: string;
  account_id: string;
  project_id: string | null;
  transaction_type: string;
  to_shareholder_id: string | null;
  share_class_id: string | null;
  shares: number | string;
  price_per_share: number | string | null;
  total_value: number | string | null;
  round_name: string | null;
  effective_date: string | null;
  created_at: string;
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { scope, denied } = await projectScopeOrDeny("viewer");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "project_required" }, { status: 404 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const ownerId = scope.ownerUserId;
  const projectId = scope.projectId;
  const [{ data: txs }, { data: holders }, { data: classes }, resolutions] = await Promise.all([
    supabase
      .from("share_transactions")
      .select("id, account_id, project_id, transaction_type, to_shareholder_id, share_class_id, shares, price_per_share, total_value, round_name, effective_date, created_at")
      .eq("account_id", ownerId)
      .eq("transaction_type", "issue")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("shareholders").select("id, name, role").eq("account_id", ownerId),
    supabase.from("share_classes").select("id, name").eq("account_id", ownerId),
    listResolutionsForProject(supabase, projectId),
  ]);

  const holderById = new Map<string, { name: string; role: string | null }>();
  for (const h of ((holders as Array<{ id: string; name: string; role: string | null }> | null) ?? [])) if (h?.id) holderById.set(h.id, { name: h.name ?? "", role: h.role ?? null });
  const classById = new Map<string, string>();
  for (const c of ((classes as Array<{ id: string; name: string }> | null) ?? [])) if (c?.id) classById.set(c.id, c.name);
  const resolved = new Map(resolutions.filter((r) => r.kind === "share-issue").map((r) => [r.record_id, `/api/board-resolutions/share-issue/${r.record_id}/pdf`]));

  const issues = ((txs as TxRow[] | null) ?? [])
    .filter((t) => t && t.id && t.account_id === ownerId && t.transaction_type === "issue" && (!t.project_id || t.project_id === projectId))
    .map((t) => {
      const holder = t.to_shareholder_id ? holderById.get(t.to_shareholder_id) : undefined;
      return {
        id: t.id,
        allotteeName: holder?.name || "—",
        allotteeRole: holder?.role ?? null,
        shareClass: (t.share_class_id && classById.get(t.share_class_id)) || "Ordinary",
        shares: num(t.shares) ?? 0,
        pricePerShareAud: num(t.price_per_share),
        totalValueAud: num(t.total_value),
        roundName: t.round_name ?? null,
        effectiveDate: t.effective_date ?? null,
        createdAt: t.created_at,
        resolutionPdfUrl: resolved.get(t.id) ?? null,
      };
    });

  return NextResponse.json({ ok: true, role: scope.role, issues }, { headers: { "Cache-Control": "private, no-store" } });
}
