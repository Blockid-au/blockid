// /admin/comparables — AU comparables review queue (G13-W5-R5 / S-R5,
// spec §C.7 "admin review page").
//
// The weekly ingest (/api/cron/comparables-ingest, scripts/comparables/
// ingest-public-roundups.mjs) drops regex-extracted raises from the
// allow-listed public sources into `au_comparable_raises` as `pending`.
// Nothing reaches a report until an admin approves it here — the valuation
// chapter, the ReportV2 adapter and the landing copy count only the
// verified view (static 32-row fallback while it is empty). Approve may
// carry edits (sector / stage / post-money / ARR → the multiple), because
// the extraction never sees a valuation figure.
//
// Guard: admin only (same inline check as /admin/traction). Reads through
// the service-role client; mutations go through /api/admin/comparables/[id]
// (audited).

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ADMIN_EMAIL, getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { loadComparablesQueue, type ComparablesAdminDb, type ComparablesQueue } from "@/lib/valuation/comparables-admin";
import { INGEST_SOURCES } from "@/lib/valuation/comparables-ingest";
import { COMPARABLES_MILESTONE, comparablesCopyLine, primeComparables } from "@/lib/valuation/comparables-repo.server";
import { ComparablesReviewClient } from "./comparables-review-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "AU comparables — BlockID Admin",
  robots: { index: false, follow: false },
};

const EMPTY: ComparablesQueue = { pending: [], verified: [], rejected: [], counts: { pending: 0, verified: 0, rejected: 0, withMultiples: 0 }, error: null };

export default async function ComparablesAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/comparables");
  const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
  if (!isAdmin) redirect("/admin");

  const supabase = getSupabaseAdmin();
  const queue = supabase ? await loadComparablesQueue(supabase as unknown as ComparablesAdminDb) : { ...EMPTY, error: "Supabase not configured" };
  await primeComparables({ force: true }).catch(() => undefined);
  const copyLine = comparablesCopyLine();

  return (
    <div className="min-h-svh bg-neutral-50 px-4 py-8 dark:bg-neutral-950">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">CFO · valuation evidence</p>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">AU comparables review</h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Weekly ingest from {INGEST_SOURCES.map((s) => s.label.split(" — ")[0]).join(", ")} → <code>pending</code>. Approve to make a row count; reports and the
              landing copy read the verified view only. Live copy today: <em>{copyLine}</em>. &ldquo;500+&rdquo; returns at {COMPARABLES_MILESTONE} verified.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/dashboard/admin/sector-multiples" className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800">
              Sector multiples
            </Link>
            <Link href="/admin" className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800">
              Admin home
            </Link>
          </div>
        </header>

        {queue.error ? (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
            <p className="font-medium">Comparables table not readable — {queue.error}</p>
            <p className="mt-1">
              Apply <code>web/supabase/migrations/0402_comparables_connectors.sql</code> (<code>scripts/db/apply-migration.sh</code>). Until then every report cites the static code-table rows.
            </p>
          </div>
        ) : null}

        <ComparablesReviewClient initial={queue} viewer={{ id: user.id, email: user.email }} />
      </div>
    </div>
  );
}
