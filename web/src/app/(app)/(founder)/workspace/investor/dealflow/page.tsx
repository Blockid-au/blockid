// /workspace/investor/dealflow — deal-flow inbox v2 (G13-W3-T2, BA spec
// §B.8, §B.10 T4/T6).
//
// Server component. Rows come from `mandate_fit_scores` ⋈ `startup_taxonomy`
// ⋈ latest snapshot keyed on project_id for the caller's mandate (the
// nightly mandate-fit-refresh writes them) — this replaces the old
// scores.email → svi_index_snapshots.account_id guess. The filter bar
// (industry · business model · stage · state · tags · fit ≥ · SVI ≥ ·
// moved ≥ 5 pts / 30 d · sort) is URL-serialised (`?industry=fintech,ai_ml&
// stage=seed&fit=60`), so a view is a link; saved views live on
// investor_prefs.saved_views. Each row deep-links to the Investor Dossier
// via the project alias and carries the fit reasons / gaps as chips; a
// startup whose industry is unclassified is badged "Unclassified" (DQ-1).
// Founder-track users hit the FeatureGate upgrade CTA instead of the table.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { FeatureGate } from "@/components/access/FeatureGate";
import { NotFinancialAdvice } from "@/components/legal/not-financial-advice";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { DOSSIER_ALIAS_PATH } from "@/lib/evaluations/dossier";
import { getDealFlowV2, type DealFlowRowV2 } from "@/lib/investors/dealflow";
import { FIT_FLOOR_V2 } from "@/lib/investors/fit-v2";
import { DEALFLOW_SORTS, filtersFromSearchParams, filtersToQuery, mandateAsFilters, toggleFilterHref, type DealFlowFiltersV2 } from "@/lib/investors/saved-views";
import { CANONICAL_STAGES, CANONICAL_STAGE_LABELS } from "@/lib/journey-vocabulary";
import { BUSINESS_MODEL_LABELS, HQ_STATES, INDUSTRY_LABELS, TAG_LABELS, type BusinessModel, type Tag } from "@/lib/taxonomy/startup-taxonomy";
import { MANDATE_INDUSTRIES } from "@/lib/investors/mandates-shared";
import { SavedViewsBar } from "./saved-views-bar";

export const metadata: Metadata = {
  title: "Deal Flow | Investor Workspace | BlockID",
  description: "Consented startups ranked against your mandate.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const BASE = "/workspace/investor/dealflow";
const FIT_STEPS = [0, 40, 60, 80] as const;
const SVI_STEPS = [0, 40, 60, 80] as const;
const BUSINESS_MODELS_FOR_FILTER = Object.keys(BUSINESS_MODEL_LABELS).filter((m) => m !== "unclassified") as BusinessModel[];

interface DealFlowPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function InvestorDealFlowPage({ searchParams }: DealFlowPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/investor/dealflow");

  const sp = await searchParams;
  const filters = filtersFromSearchParams(sp);
  const [isSandbox, df] = await Promise.all([getCurrentProjectIsSandbox(), getDealFlowV2(user.id, filters)]);
  const mandateView = df.mandate ? mandateAsFilters(df.mandate) : null;

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-7xl mx-auto space-y-6" data-dealflow data-migrated={df.migrated ? "1" : "0"} data-rows={df.rows.length}>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <nav aria-label="Breadcrumb" className="mb-1 text-xs text-ink-500">
              <Link href="/workspace/investor" className="hover:text-ink-700">
                Investor Workspace
              </Link>
              <span aria-hidden="true"> / </span>
              <span className="text-ink-700">Deal Flow</span>
            </nav>
            <h1 className="text-2xl font-semibold text-ink-900">Deal Flow Inbox</h1>
            <p className="mt-1 text-sm text-ink-600">
              {df.mandate ? (
                <>
                  Consented startups ranked against <strong>{df.mandate.label}</strong>
                  {df.mandates.length > 1 ? ` (${df.mandates.length} mandates — pick one below)` : ""}. Fit ≥ {filters.min_fit ?? FIT_FLOOR_V2} · {df.rows.length}
                  {df.total_above_floor !== df.rows.length ? ` of ${df.total_above_floor}` : ""} shown.
                </>
              ) : (
                "Consented startups ranked against your mandate."
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* G14 S35 — the scored intake inbox (program intake links) lives
                on the historic applications URL; no tab system here, so a
                sibling link. */}
            <Link
              href="/workspace/accelerator/applications"
              data-testid="dealflow-intake-link"
              className="rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm font-medium text-ink-700 hover:bg-surface-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2"
            >
              Intake inbox
            </Link>
            <Link
              href="/workspace/investor/mandate"
              className="rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm font-medium text-ink-700 hover:bg-surface-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2"
            >
              {df.mandate ? "Edit mandate" : "Write your mandate"}
            </Link>
          </div>
        </header>

        <FeatureGate feature="investor.dealflow" label="Deal Flow Inbox">
          {!df.migrated ? (
            <Notice kind="warn" data="not-migrated">
              Deal-flow v2 is not live on this install yet (migration 0393 pending). Nothing is ranked until it is applied and the nightly refresh has run.
            </Notice>
          ) : !df.mandate ? (
            <EmptyState kind="no_mandate" />
          ) : (
            <>
              <SavedViewsBar views={df.views} filters={filters} mandateView={mandateView} mandateLabel={df.mandate.label} />
              {df.mandates.length > 1 ? <MandatePicker mandates={df.mandates} current={df.mandate.id} filters={filters} /> : null}
              <FilterBar filters={filters} />
              {df.never_computed ? (
                <Notice kind="info" data="never-computed">
                  Your mandate is saved — the nightly refresh (02:35 AEST) ranks startups against it. Check back tomorrow, or widen the filters if the run has already happened.
                </Notice>
              ) : df.rows.length === 0 ? (
                <EmptyState kind="no_rows" filters={filters} />
              ) : (
                <DealFlowTable rows={df.rows} />
              )}
            </>
          )}
          <NotFinancialAdvice kind="not_financial_advice" compact />
        </FeatureGate>
      </div>
    </WorkspaceLayout>
  );
}

// ---------------------------------------------------------------------------
// FilterBar — every chip is a link that toggles one value on one axis
// (`toggleFilterHref`); the server re-renders. Fit / SVI floors and the
// sort are single-value links. No client JS.
// ---------------------------------------------------------------------------

const activeChip = "inline-flex min-h-11 items-center rounded-full bg-brand-navy text-white px-3 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2";
const idleChip =
  "inline-flex min-h-11 items-center rounded-full border border-surface-300 bg-white text-ink-700 px-3 text-xs font-medium hover:bg-surface-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2";

function hrefWith(f: DealFlowFiltersV2, patch: Partial<DealFlowFiltersV2>): string {
  const next = { ...f, ...patch };
  const q = filtersToQuery(next);
  return q ? `${BASE}?${q}` : BASE;
}

function FilterBar({ filters: f }: { filters: DealFlowFiltersV2 }) {
  const industries = MANDATE_INDUSTRIES;
  return (
    <section aria-label="Deal flow filters" className="rounded-2xl border border-surface-200 bg-white p-4" data-filter-bar>
      <div className="space-y-3">
        <FilterRow label="Industry">
          {industries.map((i) => (
            <Link key={i} href={toggleFilterHref(BASE, f, "industry", i)} className={f.industry.includes(i) ? activeChip : idleChip} data-filter="industry" data-value={i} aria-pressed={f.industry.includes(i)}>
              {INDUSTRY_LABELS[i].en}
            </Link>
          ))}
        </FilterRow>
        <FilterRow label="Model">
          {BUSINESS_MODELS_FOR_FILTER.map((m) => (
            <Link key={m} href={toggleFilterHref(BASE, f, "business_model", m)} className={f.business_model.includes(m) ? activeChip : idleChip} data-filter="business_model" data-value={m} aria-pressed={f.business_model.includes(m)}>
              {BUSINESS_MODEL_LABELS[m].en}
            </Link>
          ))}
        </FilterRow>
        <FilterRow label="Stage">
          {CANONICAL_STAGES.map((s) => (
            <Link key={s} href={toggleFilterHref(BASE, f, "stage", s)} className={f.stage.includes(s) ? activeChip : idleChip} data-filter="stage" data-value={s} aria-pressed={f.stage.includes(s)}>
              {CANONICAL_STAGE_LABELS[s].label_en}
            </Link>
          ))}
        </FilterRow>
        <FilterRow label="State">
          {HQ_STATES.map((s) => (
            <Link key={s} href={toggleFilterHref(BASE, f, "state", s)} className={f.state.includes(s) ? activeChip : idleChip} data-filter="state" data-value={s} aria-pressed={f.state.includes(s)}>
              {s === "national" ? "National" : s}
            </Link>
          ))}
        </FilterRow>
        <FilterRow label="Tags">
          {(Object.keys(TAG_LABELS) as Tag[]).map((t) => (
            <Link key={t} href={toggleFilterHref(BASE, f, "tags", t)} className={f.tags.includes(t) ? activeChip : idleChip} data-filter="tags" data-value={t} aria-pressed={f.tags.includes(t)}>
              {TAG_LABELS[t].en}
            </Link>
          ))}
        </FilterRow>
        <FilterRow label="Fit ≥">
          {FIT_STEPS.map((n) => {
            const active = (f.min_fit ?? FIT_FLOOR_V2) === n;
            return (
              <Link key={n} href={hrefWith(f, { min_fit: n === FIT_FLOOR_V2 ? undefined : n })} className={active ? activeChip : idleChip} data-filter="min_fit" data-value={n} aria-pressed={active}>
                {n === 0 ? "Any (incl. gated)" : `${n}`}
              </Link>
            );
          })}
        </FilterRow>
        <FilterRow label="SVI ≥">
          {SVI_STEPS.map((n) => {
            const active = (f.min_svi ?? 0) === n;
            return (
              <Link key={n} href={hrefWith(f, { min_svi: n === 0 ? undefined : n })} className={active ? activeChip : idleChip} data-filter="min_svi" data-value={n} aria-pressed={active}>
                {n === 0 ? "Any" : `${n}`}
              </Link>
            );
          })}
          <Link href={hrefWith(f, { moved: f.moved ? undefined : true })} className={f.moved ? activeChip : idleChip} data-filter="moved" aria-pressed={!!f.moved}>
            Moved ≥ 5 pts / 30 d
          </Link>
        </FilterRow>
        <FilterRow label="Sort">
          {DEALFLOW_SORTS.map((s) => (
            <Link key={s} href={hrefWith(f, { sort: s })} className={f.sort === s ? activeChip : idleChip} data-filter="sort" data-value={s} aria-pressed={f.sort === s}>
              {s === "fit" ? "Fit" : s === "svi" ? "SVI" : "Recently scored"}
            </Link>
          ))}
          {filtersToQuery(f) ? (
            <Link href={BASE} className="text-xs text-ink-500 underline" data-filter="clear">
              Clear all
            </Link>
          ) : null}
        </FilterRow>
      </div>
    </section>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-24 shrink-0 text-[11px] uppercase tracking-wide text-ink-500">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function MandatePicker({ mandates, current, filters }: { mandates: { id: string; label: string }[]; current: string; filters: DealFlowFiltersV2 }) {
  return (
    <nav aria-label="Mandate" className="flex flex-wrap items-center gap-2" data-mandate-picker>
      <span className="text-[11px] uppercase tracking-wide text-ink-500">Mandate</span>
      {mandates.map((m) => (
        <Link key={m.id} href={hrefWith(filters, { mandate_id: m.id })} className={m.id === current ? activeChip : idleChip} aria-current={m.id === current ? "true" : undefined}>
          {m.label}
        </Link>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// DealFlowTable — Startup | Industry | Stage | State | SVI (Δ30d) | Fit |
// Why | Dossier. Reasons / gaps as chips; blockers in red.
// ---------------------------------------------------------------------------

function DealFlowTable({ rows }: { rows: DealFlowRowV2[] }) {
  return (
    <div className="overflow-auto max-h-[75vh] rounded-2xl border border-surface-200 bg-white">
      <table className="min-w-full text-sm" data-dealflow-table>
        <thead className="text-left text-[11px] font-semibold uppercase tracking-wider text-secondary [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:border-b [&_th]:border-line-subtle [&_th]:bg-surface-sunken">
          <tr>
            <Th>Startup</Th>
            <Th>Industry</Th>
            <Th>Stage</Th>
            <Th>State</Th>
            <Th className="text-right">SVI</Th>
            <Th className="text-right">Fit</Th>
            <Th>Why</Th>
            <Th className="text-right">Dossier</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-100 [&>tr:nth-child(even)]:bg-surface-sunken">
          {rows.map((r) => (
            <tr key={r.project_id} className="hover:bg-surface-100" data-row={r.project_id} data-fit={r.fit} data-unclassified={r.unclassified ? "1" : "0"}>
              <Td className="font-medium text-ink-900">{r.company_name ?? "Startup"}</Td>
              <Td>
                {r.unclassified ? (
                  <span className="inline-flex items-center rounded-full border border-dashed border-line-strong px-2 py-0.5 text-[11px] text-ink-600" title="Founder confirmation pending" data-badge="unclassified">
                    Unclassified
                  </span>
                ) : (
                  INDUSTRY_LABELS[r.industry].en
                )}
              </Td>
              <Td className="text-ink-700">{CANONICAL_STAGE_LABELS[r.stage_key as keyof typeof CANONICAL_STAGE_LABELS]?.label_en ?? r.stage_key}</Td>
              <Td className="text-ink-700">{r.hq_state ?? "—"}</Td>
              <Td className="text-right">
                {r.svi === null ? <span className="text-ink-400">—</span> : <SviBadge score={r.svi} delta={r.svi_delta_30d} />}
              </Td>
              <Td className="text-right font-semibold text-ink-800">
                <span className={r.blockers.length ? "text-rose-600" : ""}>{r.fit}</span>
              </Td>
              <Td>
                <ul className="flex flex-wrap gap-1" aria-label="Fit reasons and gaps">
                  {r.blockers.map((b) => (
                    <li key={`b-${b}`} className="rounded-full bg-rose-100 text-rose-800 px-2 py-0.5 text-[11px]" data-chip="blocker">
                      {b.replace(/_/g, " ")}
                    </li>
                  ))}
                  {r.reasons.slice(0, 3).map((x) => (
                    <li key={`r-${x}`} className="rounded-full bg-emerald-50 text-emerald-800 px-2 py-0.5 text-[11px]" data-chip="reason">
                      {x}
                    </li>
                  ))}
                  {r.gaps.slice(0, 2).map((x) => (
                    <li key={`g-${x}`} className="rounded-full bg-surface-200 text-ink-600 px-2 py-0.5 text-[11px]" data-chip="gap">
                      {x}
                    </li>
                  ))}
                </ul>
              </Td>
              <Td className="text-right">
                <Link href={DOSSIER_ALIAS_PATH(r.project_id)} className="text-xs font-medium text-brand-700 hover:underline" aria-label={`Open the Investor Dossier for ${r.company_name ?? "this startup"}`}>
                  Dossier
                </Link>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ kind, filters }: { kind: "no_mandate" | "no_rows"; filters?: DealFlowFiltersV2 }) {
  return (
    <div className="rounded-2xl border border-dashed border-surface-300 bg-surface-100 p-8 text-center" data-empty={kind}>
      {kind === "no_mandate" ? (
        <>
          <p className="text-sm font-medium text-ink-800">Write your mandate to see deal-flow.</p>
          <p className="mt-1 text-xs text-ink-500">Sectors, stage, cheque, geography and floors — every consented startup is ranked against it nightly.</p>
          <div className="mt-4">
            <Link href="/workspace/investor/mandate" className="inline-flex items-center rounded-lg bg-brand-navy hover:bg-brand-navy-elev-1 text-white px-3 py-2 text-xs font-semibold">
              Write your mandate
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-ink-800">No deals match these filters — broaden them.</p>
          <p className="mt-1 text-xs text-ink-500">Try clearing a chip, lowering the fit floor, or widening the sectors on your mandate.</p>
          <div className="mt-4 flex justify-center gap-3">
            {filters && filtersToQuery(filters) ? (
              <Link href={BASE} className="inline-flex items-center rounded-lg border border-surface-300 px-3 py-2 text-xs font-semibold text-ink-700">
                Clear filters
              </Link>
            ) : null}
            <Link href="/workspace/investor/mandate" className="inline-flex items-center rounded-lg bg-brand-navy hover:bg-brand-navy-elev-1 text-white px-3 py-2 text-xs font-semibold">
              Edit mandate
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function Notice({ kind, data, children }: { kind: "info" | "warn"; data: string; children: React.ReactNode }) {
  const tone = kind === "warn" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-sky-200 bg-sky-50 text-sky-900";
  return (
    <p role="status" className={`rounded-xl border px-4 py-3 text-sm ${tone}`} data-notice={data}>
      {children}
    </p>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th scope="col" className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-ink-500 ${className}`}>
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>;
}

function SviBadge({ score, delta }: { score: number; delta: number | null }) {
  const tone =
    score >= 80
      ? "bg-emerald-100 text-emerald-800"
      : score >= 60
        ? "bg-amber-100 text-amber-800"
        : "bg-surface-200 text-ink-700";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      SVI {Math.round(score)}
      {delta !== null && delta !== 0 ? (
        <span className={delta > 0 ? "text-emerald-700" : "text-rose-700"} data-delta={delta}>
          {delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`}
        </span>
      ) : null}
    </span>
  );
}
