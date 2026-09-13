import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { currentMultiplesTable } from "@/lib/valuation/multiples-admin";
import { MULTIPLES_SOURCES } from "@/lib/valuation/multiples-sources";
import { isoDate, OVERRIDES_TABLE, type SectorMultipleOverride } from "@/lib/valuation/sector-multiples";
import { SectorMultiplesClient } from "./sector-multiples-client";

export const metadata: Metadata = {
  title: "Sector Multiples — Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// /dashboard/admin/sector-multiples — review queue for the cited sector
// revenue-multiple overrides (S27-C). The quarterly cron proposes rows; an
// admin approves / rejects here (POST /api/admin/sector-multiples/[id]/…)
// or types a manual proposal (POST /api/admin/sector-multiples). Only an
// approved row ever reaches a valuation — see docs/ops/sector-multiples.md.
export default async function SectorMultiplesAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/admin/sector-multiples");
  if (!isAdmin(user)) redirect("/dashboard");

  const supabase = getSupabaseAdmin();
  let proposed: SectorMultipleOverride[] = [];
  let approved: SectorMultipleOverride[] = [];
  let rejected: SectorMultipleOverride[] = [];
  let loadError: string | null = null;
  if (!supabase) {
    loadError = "Supabase is not configured — the review queue cannot be loaded.";
  } else {
    const [p, a, r] = await Promise.all([
      supabase.from(OVERRIDES_TABLE).select("*").eq("status", "proposed").order("created_at", { ascending: true }).limit(500),
      supabase.from(OVERRIDES_TABLE).select("*").eq("status", "approved").order("effective_from", { ascending: false }).order("approved_at", { ascending: false }).limit(500),
      supabase.from(OVERRIDES_TABLE).select("*").eq("status", "rejected").order("rejected_at", { ascending: false }).limit(50),
    ]);
    const err = p.error ?? a.error ?? r.error;
    if (err) loadError = `Could not load the queue: ${err.message} (has migration 0369 been applied?)`;
    proposed = (p.data ?? []) as SectorMultipleOverride[];
    approved = (a.data ?? []) as SectorMultipleOverride[];
    rejected = (r.data ?? []) as SectorMultipleOverride[];
  }
  const today = isoDate(new Date());

  return (
    <WorkspaceLayout user={user}>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div>
          <Link href="/dashboard/admin/30day" className="text-xs text-blue-600 hover:underline">
            ← Back to 30-Day Scoreboard
          </Link>
          <h1 className="text-2xl font-bold mt-1">Sector Multiples</h1>
          <p className="text-sm text-muted-foreground max-w-3xl mt-1 leading-relaxed">
            Every valuation multiplies ARR by a sector band. The band comes from the static table dated 2026-06 unless an
            override below is <strong>approved</strong> and effective today. The quarterly cron only <em>proposes</em> rows,
            each with a verbatim excerpt from a public source; nothing changes a live multiple until an admin approves it here.
            Rejecting an approved row rolls it back.
          </p>
        </div>

        <SectorMultiplesClient
          initial={{
            today,
            proposed,
            approved,
            rejected,
            current: currentMultiplesTable(approved, today),
            sources: MULTIPLES_SOURCES.map((s) => ({ id: s.id, url: s.url, title: s.title, publisher: s.publisher, cadence: s.cadence, expects: s.expects, sectors: [...s.sectors] })),
          }}
          viewer={{ id: user.id, email: user.email }}
          loadError={loadError}
        />
      </div>
    </WorkspaceLayout>
  );
}
