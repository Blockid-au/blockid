// /workspace/accelerator/cohort — cohort management grid.
//
// Server component. Queries cohort_members filtered by the cohort owner =
// user.id. If the table is missing, degrades to an "add your first founder"
// empty state. Grid of founder cards with filter chips per batch.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Feature } from "@/lib/entitlements";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { FeatureGate } from "@/components/access/FeatureGate";
import { getSupabaseAdmin } from "@/lib/supabase";
import { NotFinancialAdvice } from "@/components/legal/not-financial-advice";

export const metadata: Metadata = {
  title: "Cohort — Accelerator Workspace",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const COHORT_FEATURE = "accelerator.cohort" as Feature;

interface CohortMember {
  id: string;
  startupName: string;
  ticker: string | null;
  stage: string | null;
  latestSvi: number | null;
  batch: string | null;
  joinedAt: string | null;
}

async function loadCohort(ownerId: string): Promise<CohortMember[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("cohort_members")
      .select("id,startup_name,ticker,stage,latest_svi,batch,joined_at")
      .eq("owner_id", ownerId)
      .order("joined_at", { ascending: false, nullsFirst: false });
    if (error) return [];
    return (data ?? []).map((row) => ({
      id: String(row.id),
      startupName: String(row.startup_name ?? "Untitled"),
      ticker: row.ticker == null ? null : String(row.ticker),
      stage: row.stage == null ? null : String(row.stage),
      latestSvi: row.latest_svi == null ? null : Number(row.latest_svi),
      batch: row.batch == null ? null : String(row.batch),
      joinedAt: row.joined_at == null ? null : String(row.joined_at),
    }));
  } catch {
    return [];
  }
}

function weeksSince(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const ms = Date.now() - d.getTime();
  const weeks = Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24 * 7)));
  return weeks;
}

interface PageProps {
  searchParams: Promise<{ batch?: string | string[] }>;
}

export default async function AcceleratorCohortPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/accelerator/cohort");

  const params = await searchParams;
  const rawBatch = params.batch;
  const selectedBatch = Array.isArray(rawBatch) ? rawBatch[0] : rawBatch;

  const members = await loadCohort(user.id);
  const batches = Array.from(
    new Set(members.map((m) => m.batch).filter((b): b is string => !!b)),
  ).sort();

  const filtered =
    selectedBatch && selectedBatch !== "all"
      ? members.filter((m) => m.batch === selectedBatch)
      : members;

  return (
    <WorkspaceLayout user={user}>
      <FeatureGate feature={COHORT_FEATURE} label="Cohort management">
        <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-ink-900">Cohort</h1>
              <p className="text-sm text-ink-500 mt-1">
                Every founder in your accelerator program at a glance — SVI,
                stage and weeks in.
              </p>
            </div>
            <Link
              href="/workspace/accelerator/cohort/add"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              Add founder
            </Link>
          </header>

          {batches.length > 0 ? (
            <nav
              aria-label="Filter by batch"
              className="flex flex-wrap gap-2"
            >
              <FilterChip
                href="/workspace/accelerator/cohort"
                label="All"
                active={!selectedBatch || selectedBatch === "all"}
              />
              {batches.map((b) => (
                <FilterChip
                  key={b}
                  href={`/workspace/accelerator/cohort?batch=${encodeURIComponent(b)}`}
                  label={b}
                  active={selectedBatch === b}
                />
              ))}
            </nav>
          ) : null}

          {filtered.length === 0 ? (
            <section className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-900/40 p-10 text-center">
              <p className="text-ink-700 font-semibold">
                Add your first founder
              </p>
              <p className="mt-2 text-sm text-ink-500">
                {members.length === 0
                  ? "Your cohort is empty. Add a founder to start tracking their SVI progression."
                  : "No founders in this batch yet."}
              </p>
              <div className="mt-4 flex justify-center gap-3">
                <Link
                  href="/workspace/accelerator/cohort/add"
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-semibold transition-colors"
                >
                  Add founder
                </Link>
                <Link
                  href="/settings"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 text-ink-700 px-4 py-2 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Settings
                </Link>
              </div>
            </section>
          ) : (
            <section
              aria-label="Cohort founders"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {filtered.map((m) => {
                const weeks = weeksSince(m.joinedAt);
                return (
                  <article
                    key={m.id}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-ink-900 truncate">
                          {m.startupName}
                        </h3>
                        {m.ticker ? (
                          <p className="text-xs text-slate-500 mt-0.5">
                            {m.ticker}
                          </p>
                        ) : null}
                      </div>
                      {m.latestSvi != null ? (
                        <span className="shrink-0 inline-flex items-center rounded-full bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:text-brand-300">
                          SVI {m.latestSvi.toFixed(0)}
                        </span>
                      ) : null}
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-slate-500">
                          Stage
                        </dt>
                        <dd className="mt-1 text-ink-900">{m.stage ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-slate-500">
                          Weeks in
                        </dt>
                        <dd className="mt-1 text-ink-900">
                          {weeks == null ? "—" : `${weeks}w`}
                        </dd>
                      </div>
                      {m.batch ? (
                        <div className="col-span-2">
                          <dt className="text-xs uppercase tracking-wide text-slate-500">
                            Batch
                          </dt>
                          <dd className="mt-1 text-ink-700">{m.batch}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </article>
                );
              })}
            </section>
          )}

          <NotFinancialAdvice kind="not_financial_advice" compact />
        </div>
      </FeatureGate>
    </WorkspaceLayout>
  );
}

function FilterChip({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  const base =
    "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors";
  const styles = active
    ? "border-brand-500 bg-brand-600 text-white"
    : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-ink-700 hover:bg-slate-50 dark:hover:bg-slate-800";
  return (
    <Link href={href} className={`${base} ${styles}`}>
      {label}
    </Link>
  );
}
