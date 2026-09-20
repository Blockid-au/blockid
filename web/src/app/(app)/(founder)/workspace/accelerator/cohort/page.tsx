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
import { getCurrentProjectIsSandbox } from "@/lib/projects";

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

// G20 review P1-1: the previous query selected columns `cohort_members`
// never had (owner_id / ticker / stage / latest_svi / batch → PostgREST 400
// → []), so every Program / Fund / Cohort subscriber saw an empty cohort.
// Same loader shape as the quarterly report: the manager's newest
// `accelerator_cohorts` row → its `cohort_members` → `svi_accounts`.
async function loadCohort(managerEmail: string | null | undefined): Promise<CohortMember[]> {
  const supabase = getSupabaseAdmin();
  const email = (managerEmail ?? "").trim().toLowerCase();
  if (!supabase || !email) return [];
  try {
    const { data: cohorts } = await supabase
      .from("accelerator_cohorts")
      .select("id, manager_email, created_at, name")
      .eq("manager_email", email)
      .order("created_at", { ascending: false })
      .limit(1);
    const cohort = (cohorts ?? [])[0] as Record<string, unknown> | undefined;
    if (!cohort?.id) return [];
    const { data, error } = await supabase
      .from("cohort_members")
      .select("id, startup_name, email, svi_account_id, joined_at")
      .eq("cohort_id", String(cohort.id))
      .order("joined_at", { ascending: false, nullsFirst: false });
    if (error) return [];
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const accountIds = rows.map((r) => r.svi_account_id).filter((v): v is string => typeof v === "string" && v.length > 0);
    const accounts = new Map<string, Record<string, unknown>>();
    if (accountIds.length > 0) {
      const { data: accRows } = await supabase.from("svi_accounts").select("id, current_svi, current_stage").in("id", accountIds);
      for (const a of (accRows ?? []) as Array<Record<string, unknown>>) accounts.set(String(a.id), a);
    }
    const batch = typeof cohort.name === "string" && cohort.name ? String(cohort.name) : null;
    return rows.map((row) => {
      const acc = typeof row.svi_account_id === "string" ? accounts.get(row.svi_account_id) : undefined;
      const svi = acc?.current_svi == null ? null : Number(acc.current_svi);
      return {
        id: String(row.id),
        startupName: String(row.startup_name ?? row.email ?? "Untitled"),
        ticker: null, // svi_accounts carries no ticker; listings are a separate object
        stage: acc?.current_stage == null ? null : String(acc.current_stage),
        latestSvi: svi != null && Number.isFinite(svi) ? svi : null,
        batch,
        joinedAt: row.joined_at == null ? null : String(row.joined_at),
      };
    });
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

  const isSandbox = await getCurrentProjectIsSandbox();

  const params = await searchParams;
  const rawBatch = params.batch;
  const selectedBatch = Array.isArray(rawBatch) ? rawBatch[0] : rawBatch;

  const members = await loadCohort(user.email);
  const batches = Array.from(
    new Set(members.map((m) => m.batch).filter((b): b is string => !!b)),
  ).sort();

  const filtered =
    selectedBatch && selectedBatch !== "all"
      ? members.filter((m) => m.batch === selectedBatch)
      : members;

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      {/* The heading stays outside the client gate: the page keeps its h1 while
          /api/entitlement/me resolves and when the gate card renders (G20-F2). */}
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
              href="/workspace/accelerator/applications"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              Intake link &amp; applications
            </Link>
          </header>

          <FeatureGate feature={COHORT_FEATURE} label="Cohort management">
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
                Your cohort fills from your intake link
              </p>
              <p className="mt-2 text-sm text-ink-500">
                {members.length === 0
                  ? "Share /apply/<your-slug> with applicants — every scored submission lands in your applications inbox, and accepted founders appear here with their SVI and stage."
                  : "No founders in this batch yet."}
              </p>
              <div className="mt-4 flex justify-center gap-3">
                <Link
                  href="/workspace/accelerator/applications"
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-semibold transition-colors"
                >
                  Open applications
                </Link>
                <Link
                  href="/workspace/settings/notifications"
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
          </FeatureGate>
      </div>
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
