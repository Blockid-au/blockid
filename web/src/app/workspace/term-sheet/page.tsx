import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { formatAud } from "@/lib/utils";
import { TermSheetHistoryClient } from "./term-sheet-history-client";

export const metadata: Metadata = {
  title: "My Term Sheets",
  description: "Every term sheet you have analysed with BlockID.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface HistoryRow {
  id: string;
  created_at: string;
  company_name: string | null;
  valuation_aud: number | null;
  risk_level_summary: string | null;
}

export default async function TermSheetHistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/term-sheet");

  const supabase = getSupabaseAdmin();
  let rows: HistoryRow[] = [];
  if (supabase) {
    const { data } = await supabase
      .from("term_sheet_analyses")
      .select("id, created_at, company_name, valuation_aud, risk_level_summary")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (Array.isArray(data)) rows = data as HistoryRow[];
  }

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-ink-800">My Term Sheets</h1>
            <p className="text-sm text-ink-700 mt-1">
              Every term sheet you have analysed. Click through to re-open the
              redline or delete rows you no longer need.
            </p>
          </div>
          <Link
            href="/tools/term-sheet"
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
          >
            Analyse another term sheet
          </Link>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-surface-200 bg-white p-10 text-center">
            <p className="text-sm text-ink-500">
              You haven&apos;t analysed a term sheet yet.
            </p>
            <Link
              href="/tools/term-sheet"
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
            >
              Try the Term Sheet AI
            </Link>
          </div>
        ) : (
          <TermSheetHistoryClient
            initialRows={rows.map((r) => ({
              id: r.id,
              createdAt: r.created_at,
              companyName: r.company_name,
              valuationAud: r.valuation_aud,
              risk: r.risk_level_summary,
              valuationDisplay:
                typeof r.valuation_aud === "number" && r.valuation_aud > 0
                  ? formatAud(r.valuation_aud)
                  : "—",
            }))}
          />
        )}

        <p className="mt-8 text-xs leading-relaxed text-ink-8000">
          General information only. Not legal or financial advice. Consult a
          lawyer or licensed adviser before signing any binding document.
        </p>
      </div>
    </WorkspaceLayout>
  );
}
