import Link from "next/link";
import { PieChart, Users } from "lucide-react";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// CapTableWidget — server component that shows a compact cap table summary
// on the dashboard. Queries the shareholders table for the logged-in user.
// Renders a setup CTA when no cap table data exists (graceful degradation).
// ---------------------------------------------------------------------------

interface ShareholderRow {
  id: string;
  name: string;
  shares_held: number;
  share_class_id: string | null;
}

interface ShareClassRow {
  id: string;
  name: string;
  class_type: string;
}

export async function CapTableWidget({ email }: { email: string }) {
  if (!isSupabaseConfigured()) return null;

  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  // Resolve email → user id (account_id in shareholders table)
  const { data: appUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("email", email.toLowerCase().trim())
    .maybeSingle();

  if (!appUser) return null;

  // Fetch shareholders and share classes in parallel
  let shareholders: ShareholderRow[] = [];
  let shareClasses: ShareClassRow[] = [];

  try {
    const [holdersRes, classesRes] = await Promise.all([
      supabase
        .from("shareholders")
        .select("id, name, shares_held, share_class_id")
        .eq("account_id", appUser.id)
        .order("shares_held", { ascending: false }),
      supabase
        .from("share_classes")
        .select("id, name, class_type")
        .eq("account_id", appUser.id),
    ]);

    shareholders = (holdersRes.data as ShareholderRow[] | null) ?? [];
    shareClasses = (classesRes.data as ShareClassRow[] | null) ?? [];
  } catch {
    // Tables may not exist — graceful fallback
    return null;
  }

  // No cap table data — show setup CTA
  if (shareholders.length === 0) {
    return (
      <section className="mt-8 bg-white border border-surface-200 shadow-sm rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <PieChart className="h-5 w-5 text-brand-600" />
          <h2 className="text-lg font-semibold text-ink-800">Cap Table</h2>
        </div>
        <div className="rounded-xl border border-dashed border-surface-200 px-6 py-8 text-center">
          <PieChart className="mx-auto h-8 w-8 text-ink-300 mb-3" />
          <p className="text-sm font-semibold text-ink-800">
            No cap table configured yet
          </p>
          <p className="mt-1 text-xs text-ink-500 max-w-sm mx-auto">
            Track shareholders, share classes, and ownership percentages to
            strengthen your investor readiness.
          </p>
          <Link
            href="/workspace/cap-table"
            className="mt-4 inline-flex items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
          >
            Set up your cap table &rarr;
          </Link>
        </div>
      </section>
    );
  }

  // Compute summary
  const totalShares = shareholders.reduce(
    (sum, s) => sum + Number(s.shares_held),
    0,
  );

  // Build share class breakdown
  const classMap = new Map(shareClasses.map((c) => [c.id, c]));
  const classCounts = new Map<string, { name: string; shares: number; holders: number }>();

  for (const s of shareholders) {
    const classId = s.share_class_id ?? "__unclassified";
    const cls = s.share_class_id ? classMap.get(s.share_class_id) : null;
    const existing = classCounts.get(classId);
    if (existing) {
      existing.shares += Number(s.shares_held);
      existing.holders += 1;
    } else {
      classCounts.set(classId, {
        name: cls?.name ?? "Unclassified",
        shares: Number(s.shares_held),
        holders: 1,
      });
    }
  }

  const classBreakdown = Array.from(classCounts.values());

  // Find user's own ownership (match by email)
  const { data: userHolder } = await supabase
    .from("shareholders")
    .select("shares_held")
    .eq("account_id", appUser.id)
    .eq("email", email.toLowerCase().trim())
    .maybeSingle();

  const userShares = userHolder ? Number(userHolder.shares_held) : 0;
  const userPct = totalShares > 0 ? (userShares / totalShares) * 100 : 0;

  return (
    <section className="mt-8 bg-white border border-surface-200 shadow-sm rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <PieChart className="h-5 w-5 text-brand-600" />
          <h2 className="text-lg font-semibold text-ink-800">Cap Table</h2>
        </div>
        <Link
          href="/workspace/cap-table"
          className="text-[10px] font-medium text-brand-600 hover:text-brand-700"
        >
          Manage &rarr;
        </Link>
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Users className="h-3.5 w-3.5 text-ink-500" />
          </div>
          <p className="text-2xl font-semibold text-ink-800">
            {shareholders.length}
          </p>
          <p className="text-[10px] uppercase tracking-[0.15em] text-ink-500">
            Shareholders
          </p>
        </div>

        {userShares > 0 && (
          <div className="rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 text-center">
            <p className="text-2xl font-semibold text-brand-600">
              {userPct.toFixed(1)}%
            </p>
            <p className="text-[10px] uppercase tracking-[0.15em] text-ink-500">
              Your Ownership
            </p>
          </div>
        )}

        <div className="rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 text-center">
          <p className="text-2xl font-semibold text-ink-800">
            {totalShares.toLocaleString()}
          </p>
          <p className="text-[10px] uppercase tracking-[0.15em] text-ink-500">
            Total Shares
          </p>
        </div>
      </div>

      {/* Share class breakdown (only when multiple classes exist) */}
      {classBreakdown.length > 1 && (
        <div className="mt-4 rounded-xl border border-surface-200 bg-surface-50 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.15em] text-ink-500 mb-2">
            Share Classes
          </p>
          <ul className="space-y-1.5">
            {classBreakdown.map((cls) => {
              const pct =
                totalShares > 0 ? (cls.shares / totalShares) * 100 : 0;
              return (
                <li
                  key={cls.name}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-ink-700">{cls.name}</span>
                  <span className="font-mono text-ink-800">
                    {pct.toFixed(1)}%{" "}
                    <span className="text-[10px] text-ink-400">
                      ({cls.holders}{" "}
                      {cls.holders === 1 ? "holder" : "holders"})
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
