import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import {
  estimateValuation,
  formatAUD,
} from "@/lib/valuation";
import { SVI_STAGE_LABELS } from "@/lib/svi-analysis";

// ---------------------------------------------------------------------------
// DashboardValuationCard — server component that fetches the user's latest
// SVI score + stage, runs the quick estimate, and displays the valuation range.
// Renders nothing when no SVI data exists yet (graceful degradation).
// ---------------------------------------------------------------------------

export async function DashboardValuationCard({ email }: { email: string }) {
  if (!isSupabaseConfigured()) return null;

  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  // Fetch latest SVI account data
  const { data: account } = await supabase
    .from("svi_accounts")
    .select("current_svi, current_stage")
    .eq("email", email.toLowerCase().trim())
    .maybeSingle();

  if (!account || account.current_svi == null) return null;

  const svi = account.current_svi as number;
  const stage = (account.current_stage as number) ?? 0;
  const stageLabel = SVI_STAGE_LABELS[stage] ?? "Concept";
  const est = estimateValuation(svi, stage);

  return (
    <section className="mt-8 bg-white border border-surface-200 shadow-sm rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-brand-600" />
          <h2 className="text-lg font-semibold text-ink-800">
            Estimated Valuation
          </h2>
        </div>
        <span className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.15em] text-brand-600">
          {stageLabel}
        </span>
      </div>

      <div className="flex items-baseline gap-4 justify-center py-4">
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-[0.15em] text-ink-500 mb-1">Low</p>
          <p className="text-sm font-mono text-ink-400">{formatAUD(est.low)}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-[0.15em] text-ink-500 mb-1">Mid</p>
          <p className="text-3xl font-bold font-mono text-brand-600">{formatAUD(est.mid)}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-[0.15em] text-ink-500 mb-1">High</p>
          <p className="text-sm font-mono text-ink-400">{formatAUD(est.high)}</p>
        </div>
      </div>

      {/* Visual range bar */}
      <div className="flex gap-1 mx-auto max-w-xs">
        <div className="h-1.5 flex-1 rounded-full bg-surface-200" />
        <div className="h-1.5 flex-[2] rounded-full bg-brand-500" />
        <div className="h-1.5 flex-1 rounded-full bg-surface-200" />
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-ink-500">
        <span>
          SVI {svi} &middot; Confidence {est.confidence}%
        </span>
        <Link
          href="/score"
          className="font-medium text-brand-600 hover:text-brand-700"
        >
          Improve your score &rarr;
        </Link>
      </div>

      <p className="mt-3 text-[10px] text-ink-400 text-center">
        Based on SVI score, stage, and available metrics. Not financial advice.
      </p>
    </section>
  );
}
