import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { SVIDashboard } from "@/components/svi/svi-dashboard";
import { Logo } from "@/components/brand/logo";
import type { SVIAnalysis } from "@/lib/svi-analysis";

export const metadata: Metadata = {
  title: "SVI Dashboard | BlockID.au",
  description: "Your Startup Value Index dashboard",
};

export const dynamic = "force-dynamic";

export default async function SVIDashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login?next=/dashboard/svi");
  }

  const supabase = getSupabaseAdmin();
  let analysis: SVIAnalysis | null = null;
  let weeklyDelta: number | undefined;
  let startupName: string | undefined;
  let snapshotHistory: Array<{ date: string; svi: number; delta: number | null }> = [];

  if (supabase) {
    // Load latest SVI analysis for this user
    const { data: latestAnalysis } = await supabase
      .from("svi_analyses")
      .select("analysis_json, total_svi, created_at")
      .eq("email", user.email)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (latestAnalysis?.analysis_json) {
      analysis = latestAnalysis.analysis_json as SVIAnalysis;
    }

    // Load or create SVI account
    const { data: account } = await supabase
      .from("svi_accounts")
      .select("id, startup_name, current_svi, current_stage")
      .eq("email", user.email)
      .single();

    if (!account && analysis) {
      // Auto-create account
      await supabase.from("svi_accounts").insert({
        email: user.email,
        name: user.displayName ?? null,
        current_svi: analysis.totalSVI,
        current_stage: analysis.stage ?? 0,
        plan: user.plan ?? "free",
      });
    }

    if (account) {
      startupName = account.startup_name ?? undefined;

      // Load snapshot history
      const { data: snapshots } = await supabase
        .from("svi_snapshots")
        .select("snapshot_date, svi_total, delta")
        .eq("account_id", account.id)
        .order("snapshot_date", { ascending: false })
        .limit(12);

      if (snapshots && snapshots.length > 0) {
        snapshotHistory = snapshots.map(s => ({
          date: s.snapshot_date as string,
          svi: s.svi_total as number,
          delta: s.delta as number | null,
        }));
        weeklyDelta = snapshots[0].delta ?? undefined;
      }
    }
  }

  // If no analysis yet, show empty state CTA
  if (!analysis) {
    return (
      <div className="min-h-svh bg-ink-950 text-slate-50">
        <header className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <Logo variant="dark" />
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-500">{user.email}</span>
            <a href="/" className="text-xs text-slate-400 hover:text-slate-200 transition-colors">← Home</a>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-6 pb-24 pt-20 text-center">
          <h1 className="text-2xl font-bold text-slate-50 mb-3">No SVI analysis yet</h1>
          <p className="text-slate-400 text-sm mb-6">Go to the home page to analyze your startup idea and get your first SVI score.</p>
          <a href="/" className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors">
            Get My SVI →
          </a>
        </main>
      </div>
    );
  }

  // Inject weeklyDelta into analysis
  const analysisWithDelta: SVIAnalysis = {
    ...analysis,
    weeklyDelta: weeklyDelta ?? analysis.weeklyDelta,
  };

  return (
    <div className="min-h-svh bg-ink-950 text-slate-50">
      <header className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between border-b border-ink-700">
        <Logo variant="dark" />
        <div className="flex items-center gap-4">
          {user.avatarUrl && (
            <img src={user.avatarUrl} alt="" className="h-7 w-7 rounded-full" />
          )}
          <span className="text-xs text-slate-400">{user.displayName ?? user.email}</span>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="text-xs text-slate-500 hover:text-slate-200 transition-colors cursor-pointer">Sign out</button>
          </form>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 pb-24">
        <SVIDashboard
          analysis={analysisWithDelta}
          startupName={startupName}
          snapshotHistory={snapshotHistory}
          userEmail={user.email}
        />
      </main>
    </div>
  );
}
