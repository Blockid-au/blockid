import Link from "next/link";
import { Clock, TrendingUp, Users } from "lucide-react";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import {
  estimateValuation,
  formatAUD,
} from "@/lib/valuation";
import { SVI_STAGE_LABELS } from "@/lib/svi-analysis";

// ---------------------------------------------------------------------------
// DashboardValuationCard — server component that fetches the user's latest
// SVI score + stage, runs the quick estimate, and displays the valuation range.
// Enhanced with SVI-to-AUD rough mapping and shareholder ownership estimate.
// Renders nothing when no SVI data exists yet (graceful degradation).
// ---------------------------------------------------------------------------

/** Rough SVI-to-AUD valuation band (indicative only). */
function sviToAudBand(svi: number): { low: string; high: string; label: string } {
  if (svi >= 200) return { low: "A$25M", high: "A$25M+", label: "Scale" };
  if (svi >= 170) return { low: "A$8M", high: "A$25M", label: "Growth" };
  if (svi >= 140) return { low: "A$2M", high: "A$8M", label: "Revenue" };
  if (svi >= 110) return { low: "A$500K", high: "A$2M", label: "Early Traction" };
  if (svi >= 80) return { low: "A$150K", high: "A$500K", label: "MVP" };
  if (svi >= 50) return { low: "A$50K", high: "A$150K", label: "Validated Idea" };
  return { low: "A$0", high: "A$50K", label: "Pre-revenue Concept" };
}

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
  const band = sviToAudBand(svi);

  // Assume 100% founder ownership for indicative display.
  // In a real scenario this would come from a cap table.
  const founderPct = 100;

  // ── Vesting progress (graceful — shows nothing if no data) ───────────
  let vestingSection: {
    grantCount: number;
    totalShares: number;
    vestedPct: number;
    vestedValue: number;
  } | null = null;

  try {
    // Resolve email → user id for vesting lookup
    const { data: appUser } = await supabase
      .from("app_users")
      .select("id")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();

    if (appUser) {
      const { data: schedules } = await supabase
        .from("vesting_schedules")
        .select("grant_date, total_months, total_shares, status")
        .eq("cap_table_id", appUser.id)
        .eq("status", "active");

      if (schedules && schedules.length > 0) {
        const now = Date.now();
        let totalShares = 0;
        let weightedVestedShares = 0;

        for (const s of schedules) {
          const shares = Number(s.total_shares) || 0;
          const months = Number(s.total_months) || 48;
          const grantMs = new Date(s.grant_date as string).getTime();
          const elapsedMs = Math.max(0, now - grantMs);
          const elapsedMonths = elapsedMs / (1000 * 60 * 60 * 24 * 30.44);
          const pct = Math.min(1.0, elapsedMonths / months);
          totalShares += shares;
          weightedVestedShares += pct * shares;
        }

        const vestedPct = totalShares > 0 ? weightedVestedShares / totalShares : 0;
        const vestedValue = vestedPct * est.mid;

        vestingSection = {
          grantCount: schedules.length,
          totalShares,
          vestedPct,
          vestedValue,
        };
      }
    }
  } catch {
    // Vesting table may not exist — graceful fallback
  }

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

      {/* SVI-to-AUD rough band */}
      <div className="mt-5 rounded-xl border border-surface-200 bg-surface-50 px-4 py-3">
        <p className="text-[10px] uppercase tracking-[0.15em] text-ink-500 mb-2">
          SVI Valuation Band
        </p>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-ink-800">
            {band.low} &ndash; {band.high}
          </span>
          <span className="rounded-full border border-surface-200 bg-white px-2.5 py-0.5 text-[10px] font-medium text-ink-600">
            {band.label}
          </span>
        </div>
      </div>

      {/* Shareholder ownership estimate */}
      <div className="mt-3 rounded-xl border border-surface-200 bg-surface-50 px-4 py-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Users className="h-3.5 w-3.5 text-ink-500" />
          <p className="text-[10px] uppercase tracking-[0.15em] text-ink-500">
            Your Ownership ({founderPct}%)
          </p>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-ink-800">
            {formatAUD(Math.round(est.low * (founderPct / 100)))} &ndash;{" "}
            {formatAUD(Math.round(est.high * (founderPct / 100)))}
          </span>
          <Link
            href="/workspace/cap-table"
            className="text-[10px] font-medium text-brand-600 hover:text-brand-700"
          >
            Edit cap table &rarr;
          </Link>
        </div>
      </div>

      {/* Vesting progress (only when schedules exist) */}
      {vestingSection && (
        <div className="mt-3 rounded-xl border border-surface-200 bg-surface-50 px-4 py-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Clock className="h-3.5 w-3.5 text-ink-500" />
            <p className="text-[10px] uppercase tracking-[0.15em] text-ink-500">
              Vesting Progress ({vestingSection.grantCount}{" "}
              {vestingSection.grantCount === 1 ? "grant" : "grants"})
            </p>
          </div>
          {/* Progress bar */}
          <div className="mb-2 h-2 w-full rounded-full bg-surface-200">
            <div
              className="h-2 rounded-full bg-brand-500 transition-all"
              style={{ width: `${Math.round(vestingSection.vestedPct * 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-ink-800">
              {Math.round(vestingSection.vestedPct * 100)}% vested
            </span>
            <span className="text-sm font-mono text-brand-600">
              {formatAUD(Math.round(vestingSection.vestedValue))}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-ink-400">
            {vestingSection.totalShares.toLocaleString()} total shares across{" "}
            {vestingSection.grantCount}{" "}
            {vestingSection.grantCount === 1 ? "schedule" : "schedules"}
          </p>
        </div>
      )}

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

      <p className="mt-3 text-[10px] text-ink-400 text-center leading-relaxed">
        Indicative estimate only — not a financial valuation. Seek professional
        advice. Based on SVI score, stage, and available metrics.
      </p>
    </section>
  );
}
