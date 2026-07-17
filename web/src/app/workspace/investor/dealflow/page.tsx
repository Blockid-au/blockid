// /workspace/investor/dealflow — full deal-flow inbox.
//
// Server component. Reads the caller's investor preferences plus the URL
// filter chips (stage, cheque_band, sector) and renders a table of the
// verified startups that match. Row click deep-links to the anonymised
// listing at /listings/[ticker]. Founder-track users hit the FeatureGate
// upgrade CTA instead of the table.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { FeatureGate } from "@/components/access/FeatureGate";
import { NotFinancialAdvice } from "@/components/legal/not-financial-advice";
import {
  getDealFlow,
  getInvestorPreferences,
  type DealFlowFilters,
  type StageBand,
  type ChequeBand,
} from "@/lib/investor-portal";

export const metadata: Metadata = {
  title: "Deal Flow | Investor Workspace | BlockID",
  description:
    "Verified startups matched against your investor preferences.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Filter validators — searchParams arrive as string|string[]|undefined so we
// funnel them through narrow checks before passing to getDealFlow.
// ---------------------------------------------------------------------------

const STAGE_BANDS: readonly StageBand[] = [
  "pre_seed",
  "seed",
  "series_a",
  "series_b",
  "growth",
  "any",
] as const;

const CHEQUE_BANDS: readonly ChequeBand[] = [
  "under_25k",
  "25k_100k",
  "100k_500k",
  "500k_2m",
  "2m_plus",
  "any",
] as const;

const CHEQUE_LABEL: Record<ChequeBand, string> = {
  under_25k: "< A$25k",
  "25k_100k": "A$25k–100k",
  "100k_500k": "A$100k–500k",
  "500k_2m": "A$500k–2M",
  "2m_plus": "A$2M+",
  any: "Any",
};

const STAGE_LABEL: Record<StageBand, string> = {
  pre_seed: "Pre-seed",
  seed: "Seed",
  series_a: "Series A",
  series_b: "Series B",
  growth: "Growth",
  any: "Any stage",
};

function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

function coerceStage(v: string | undefined): StageBand | null {
  if (!v) return null;
  return (STAGE_BANDS as readonly string[]).includes(v)
    ? (v as StageBand)
    : null;
}

function coerceCheque(v: string | undefined): ChequeBand | null {
  if (!v) return null;
  return (CHEQUE_BANDS as readonly string[]).includes(v)
    ? (v as ChequeBand)
    : null;
}

interface DealFlowPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function InvestorDealFlowPage({
  searchParams,
}: DealFlowPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/investor/dealflow");

  const sp = await searchParams;
  const stage = coerceStage(firstParam(sp.stage));
  const sector = firstParam(sp.sector)?.trim() || null;
  const chequeBand = coerceCheque(firstParam(sp.cheque_band));

  const filters: DealFlowFilters = {
    stage: stage ?? undefined,
    sector: sector ?? undefined,
    limit: 100,
  };

  const [rows, prefs] = await Promise.all([
    getDealFlow(user.id, filters),
    getInvestorPreferences(user.id),
  ]);

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <nav
              aria-label="Breadcrumb"
              className="mb-1 text-xs text-slate-500 dark:text-slate-400"
            >
              <Link
                href="/workspace/investor"
                className="hover:text-slate-700 dark:hover:text-slate-300"
              >
                Investor Workspace
              </Link>
              <span aria-hidden="true"> / </span>
              <span className="text-slate-700 dark:text-slate-300">
                Deal Flow
              </span>
            </nav>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Deal Flow Inbox
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Verified startups scored against your stated sector, stage and
              cheque preferences.
            </p>
          </div>
          <Link
            href="/workspace/investor/preferences"
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            Refine preferences
          </Link>
        </header>

        <FeatureGate feature="investor.dealflow" label="Deal Flow Inbox">
          <FilterBar
            stage={stage}
            sector={sector}
            chequeBand={chequeBand ?? prefs.cheque_band}
          />

          {rows.length === 0 ? (
            <EmptyState />
          ) : (
            <DealFlowTable
              rows={rows}
              chequeBand={chequeBand ?? prefs.cheque_band}
              prefSectors={prefs.sectors}
              prefStages={prefs.stages}
            />
          )}

          <NotFinancialAdvice kind="not_financial_advice" compact />
        </FeatureGate>
      </div>
    </WorkspaceLayout>
  );
}

// ---------------------------------------------------------------------------
// FilterBar — chip strip. Each chip mutates ?stage=&sector=&cheque_band=
// via a plain <a>; server component re-renders. No client JS needed.
// ---------------------------------------------------------------------------

function FilterBar({
  stage,
  sector,
  chequeBand,
}: {
  stage: StageBand | null;
  sector: string | null;
  chequeBand: ChequeBand;
}) {
  const activeChip =
    "inline-flex items-center rounded-full bg-brand-600 text-white px-3 py-1 text-xs font-semibold";
  const idleChip =
    "inline-flex items-center rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-3 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800";

  return (
    <section
      aria-label="Deal flow filters"
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
    >
      <div className="space-y-3">
        <FilterRow label="Stage">
          {STAGE_BANDS.map((s) => {
            const href = qs({
              stage: s === "any" ? null : s,
              sector,
              cheque_band: chequeBand === "any" ? null : chequeBand,
            });
            const active =
              (s === "any" && !stage) || stage === s;
            return (
              <Link
                key={s}
                href={href}
                className={active ? activeChip : idleChip}
              >
                {STAGE_LABEL[s]}
              </Link>
            );
          })}
        </FilterRow>

        <FilterRow label="Cheque band">
          {CHEQUE_BANDS.map((c) => {
            const href = qs({
              stage,
              sector,
              cheque_band: c === "any" ? null : c,
            });
            const active =
              (c === "any" && chequeBand === "any") || chequeBand === c;
            return (
              <Link
                key={c}
                href={href}
                className={active ? activeChip : idleChip}
              >
                {CHEQUE_LABEL[c]}
              </Link>
            );
          })}
        </FilterRow>

        <FilterRow label="Sector">
          <form
            action="/workspace/investor/dealflow"
            method="get"
            className="flex flex-wrap items-center gap-2"
          >
            {stage && <input type="hidden" name="stage" value={stage} />}
            {chequeBand !== "any" && (
              <input type="hidden" name="cheque_band" value={chequeBand} />
            )}
            <input
              type="text"
              name="sector"
              defaultValue={sector ?? ""}
              placeholder="e.g. fintech, healthtech"
              className="min-w-[220px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-800 hover:bg-slate-900 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 px-3 py-1.5 text-xs font-semibold"
            >
              Apply
            </button>
            {sector && (
              <Link
                href={qs({ stage, sector: null, cheque_band: chequeBand === "any" ? null : chequeBand })}
                className="text-xs text-slate-500 dark:text-slate-400 underline"
              >
                Clear
              </Link>
            )}
          </form>
        </FilterRow>
      </div>
    </section>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-24 shrink-0 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function qs(input: {
  stage: StageBand | null;
  sector: string | null;
  cheque_band: ChequeBand | null;
}): string {
  const p = new URLSearchParams();
  if (input.stage) p.set("stage", input.stage);
  if (input.sector) p.set("sector", input.sector);
  if (input.cheque_band) p.set("cheque_band", input.cheque_band);
  const s = p.toString();
  return s ? `/workspace/investor/dealflow?${s}` : "/workspace/investor/dealflow";
}

// ---------------------------------------------------------------------------
// DealFlowTable — Ticker | Stage | Sector | Score | Ask | Cheque | Match | Updated.
// The score row already ships anonymised — company_name is only shown when
// the founder opted-in. Ticker is derived from the score id as a stable
// prefix so we can deep-link even when the tickers table is empty.
// ---------------------------------------------------------------------------

function DealFlowTable({
  rows,
  chequeBand,
  prefSectors,
  prefStages,
}: {
  rows: Awaited<ReturnType<typeof getDealFlow>>;
  chequeBand: ChequeBand;
  prefSectors: string[];
  prefStages: StageBand[];
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-900/60 text-left">
          <tr>
            <Th>Ticker</Th>
            <Th>Stage</Th>
            <Th>Sector</Th>
            <Th className="text-right">Score</Th>
            <Th>Ask</Th>
            <Th>Cheque band</Th>
            <Th className="text-right">Match</Th>
            <Th>Updated</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((r) => {
            const ticker = tickerFromScoreId(r.score_id, r.company_name);
            const match = matchPct(r, prefSectors, prefStages);
            return (
              <tr
                key={r.score_id}
                className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
              >
                <Td>
                  <Link
                    href={`/listings/${encodeURIComponent(ticker)}`}
                    className="font-semibold text-brand-700 dark:text-brand-300 hover:underline"
                  >
                    {ticker}
                  </Link>
                </Td>
                <Td className="text-slate-700 dark:text-slate-300">
                  {r.stage ?? "—"}
                </Td>
                <Td className="text-slate-700 dark:text-slate-300">
                  {r.sector ?? "—"}
                </Td>
                <Td className="text-right">
                  <SviBadge score={r.total_score} />
                </Td>
                <Td className="text-slate-500 dark:text-slate-400">—</Td>
                <Td className="text-slate-700 dark:text-slate-300">
                  {CHEQUE_LABEL[chequeBand]}
                </Td>
                <Td className="text-right font-medium text-slate-800 dark:text-slate-200">
                  {match}%
                </Td>
                <Td className="text-slate-500 dark:text-slate-400">
                  {formatRelative(r.updated_at)}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 p-8 text-center">
      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
        No deals match your filters — broaden your preferences.
      </p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Try loosening the stage or sector chips above, or update the sectors
        and cheque band on your preferences page.
      </p>
      <div className="mt-4">
        <Link
          href="/workspace/investor/preferences"
          className="inline-flex items-center rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-3 py-2 text-xs font-semibold"
        >
          Refine preferences
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small primitives
// ---------------------------------------------------------------------------

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>;
}

function SviBadge({ score }: { score: number }) {
  const tone =
    score >= 80
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
      : score >= 60
      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}
    >
      SVI {score}
    </span>
  );
}

// tickerFromScoreId — deterministic 3-letter prefix + 4 hex chars of the
// score id. Provides a stable deep-link even before the tickers table is
// wired to the score row.
function tickerFromScoreId(scoreId: string, companyName: string | null): string {
  const seedName = (companyName ?? "").replace(/[^a-z]/gi, "").toUpperCase();
  const prefix = (seedName || "SVI").slice(0, 3).padEnd(3, "X");
  const hex = scoreId.replace(/-/g, "").slice(0, 4).toUpperCase();
  return `${prefix}-${hex}`;
}

// matchPct — weighted heuristic: sector 40 + stage 30 + score gap 30.
function matchPct(
  row: { total_score: number; sector: string | null; stage: string | null },
  prefSectors: string[],
  prefStages: StageBand[],
): number {
  let m = 0;
  if (prefSectors.length === 0 || (row.sector && prefSectors.includes(row.sector))) {
    m += 40;
  }
  const stagesActive = prefStages.filter((s) => s !== "any");
  if (
    stagesActive.length === 0 ||
    (row.stage &&
      stagesActive.some((s) => row.stage!.toLowerCase().includes(s.replace("_", ""))))
  ) {
    m += 30;
  }
  m += Math.round((Math.max(0, Math.min(100, row.total_score)) / 100) * 30);
  return Math.min(100, m);
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const days = Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1mo ago" : `${months}mo ago`;
}
