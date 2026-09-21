// Investor Dossier — HEADER (BA spec §A.3 "Header"). Server component.
//
// Name · website · state · taxonomy badges (honest "Unclassified") · SVI +
// Δ30d + stage-cohort percentile · consent tier chip · last snapshot date ·
// evidence count (n items · m connected) · decision chip (assessor only —
// the founder preview shows "Private to the evaluator" instead, §C.1) ·
// S-R4: mandate fit (assessor only, primary mandate × this startup) and
// "Δ since last view" (this viewer's previous dossier.viewed row) ·
// S-D3: "Firm consensus (n/m)" next to the decision chip, the "opened as
// a seat" note and the "Export IC" header action (client button).

import Link from "next/link";
import { tierLabel } from "@/lib/mentor/access-tiers";
import type { DossierHeader as HeaderModel, DossierViewerRole } from "@/lib/evaluations/dossier";
import { AbnBadge } from "@/components/verification/abn-badge";
import { ExportIcButton } from "./export-ic-button";
import { noBenchmarkYetLine } from "@/lib/benchmarks/publication-rules";

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

const TIER_CHIP: Record<string, string> = {
  attributed_only: "bg-surface-100 text-ink-600 border-surface-300",
  reports_shared: "bg-blue-50 text-blue-800 border-blue-200",
  full_mentor: "bg-emerald-50 text-emerald-800 border-emerald-200",
};

const DECISION_CHIP: Record<string, string> = {
  pass: "bg-red-50 text-red-800 border-red-200",
  track: "bg-amber-50 text-amber-800 border-amber-200",
  proceed: "bg-emerald-50 text-emerald-800 border-emerald-200",
};

function Delta({ value }: { value: number | null }) {
  if (value == null) return <span className="text-ink-400">no 30-day baseline</span>;
  const tone = value > 0 ? "text-emerald-700" : value < 0 ? "text-red-700" : "text-ink-500";
  const arrow = value > 0 ? "▲" : value < 0 ? "▼" : "•";
  return (
    <span className={tone} data-testid="dossier-delta">
      {arrow} {value > 0 ? "+" : ""}
      {value} / 30 d
    </span>
  );
}

export function DossierHeader({ header, role, icKind }: { header: HeaderModel; role: DossierViewerRole; icKind?: "memo" | "one_page" }) {
  const site = header.website?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? null;
  return (
    <header className="rounded-2xl border border-surface-200 bg-surface p-5 sm:p-6" data-testid="dossier-header">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-ink-900">{header.name}</h1>
            {/* S36: business verification (projects.verification_level, L2+ = ABR Active). */}
            {header.verification ? <AbnBadge level={header.verification.level} /> : null}
            {header.label ? <span className="rounded bg-surface-100 px-1.5 py-0.5 text-xs text-ink-700">{header.label}</span> : null}
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {header.website ? (
              <a href={header.website} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {site}
              </a>
            ) : (
              <span>No website on file</span>
            )}
            {header.state ? <span className="ml-2 uppercase">{header.state}</span> : null}
          </p>
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Classification">
            {header.badges.map((b) => (
              <li
                key={b.axis}
                data-testid={`badge-${b.axis}`}
                className={
                  b.unclassified
                    ? "rounded-full border border-dashed border-surface-300 px-2.5 py-0.5 text-xs text-ink-500"
                    : "rounded-full border border-surface-200 bg-surface-50 px-2.5 py-0.5 text-xs font-medium text-ink-700"
                }
                title={b.unclassified ? "Not classified yet — never guessed" : `Source: ${b.source}`}
              >
                {b.label}
              </li>
            ))}
          </ul>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3 lg:min-w-[28rem]">
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-500">SVI</dt>
            <dd className="mt-0.5">
              {header.svi != null ? (
                <>
                  <strong className="text-2xl font-semibold text-ink-900" data-testid="dossier-svi">
                    {Math.round(header.svi)}
                  </strong>
                  <span className="ml-2 text-xs text-ink-500">{header.sviBand}</span>
                  <div className="text-xs">
                    <Delta value={header.delta30d} />
                  </div>
                </>
              ) : (
                <span className="text-ink-500">Not scored yet</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-500">Percentile</dt>
            <dd className="mt-0.5 text-ink-800">
              {/* G21 P1 review: the published rank with its n, or the reason there is none (score-governance § 7). */}
              {header.percentile && header.percentile.value !== null ? (
                <>
                  <strong data-testid="dossier-percentile">p{header.percentile.value}</strong>
                  <span className="ml-1 text-xs text-ink-500">
                    {header.percentile.source === "register_cohort" ? "register cohort" : "stage cohort"} · {header.percentile.label}
                  </span>
                </>
              ) : header.percentile ? (
                <span className="text-xs text-ink-500" data-testid="dossier-percentile-none">
                  {noBenchmarkYetLine(header.percentile.cohortSize)}
                </span>
              ) : (
                <span className="text-ink-500">—</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-500">Consent tier</dt>
            <dd className="mt-0.5">
              <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${TIER_CHIP[header.consentTier] ?? TIER_CHIP.attributed_only}`} data-testid="consent-chip">
                {tierLabel(header.consentTier)}
              </span>
              {header.founderClaimed ? <span className="ml-2 text-xs text-ink-500">Founder claimed</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-500">Last snapshot</dt>
            <dd className="mt-0.5 text-ink-800">{fmtDate(header.lastSnapshotAt)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-500">Evidence</dt>
            <dd className="mt-0.5 text-ink-800" data-testid="evidence-count">
              {header.evidence.items} items · {header.evidence.connected} connected
              {header.evidence.providers.length ? <span className="text-xs text-ink-500"> ({header.evidence.providers.join(", ")})</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-500">Since last view</dt>
            <dd className="mt-0.5 text-ink-800" data-testid="since-last-view">
              {header.sinceLastView ? (
                <>
                  <span className="text-xs text-ink-500">{fmtDate(header.sinceLastView.viewedAt)}</span>
                  {header.sinceLastView.delta != null ? (
                    <span className={`ml-2 text-xs font-semibold ${header.sinceLastView.delta > 0 ? "text-emerald-700" : header.sinceLastView.delta < 0 ? "text-red-700" : "text-ink-500"}`}>
                      {header.sinceLastView.delta > 0 ? "▲ +" : header.sinceLastView.delta < 0 ? "▼ " : "• "}
                      {header.sinceLastView.delta} SVI
                    </span>
                  ) : (
                    <span className="ml-2 text-xs text-ink-400">no score then</span>
                  )}
                </>
              ) : (
                <span className="text-xs text-ink-500">First view</span>
              )}
            </dd>
          </div>
          {role === "assessor" ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-500">Mandate fit</dt>
              <dd className="mt-0.5" data-testid="mandate-fit">
                {header.mandateFit ? (
                  <>
                    <strong className={header.mandateFit.passesFloor ? "text-ink-900" : "text-ink-500"}>{header.mandateFit.score}%</strong>
                    <span className="ml-1 text-xs text-ink-500" title={[...header.mandateFit.reasons, ...header.mandateFit.gaps].join(" · ")}>
                      {header.mandateFit.mandateLabel}
                      {header.mandateFit.blockers.length ? ` · ${header.mandateFit.blockers[0]}` : ""}
                      {header.mandateFit.source === "computed" ? " · live" : ""}
                    </span>
                  </>
                ) : (
                  <Link href="/workspace/investor/mandate" className="text-xs text-action hover:underline">
                    Set your mandate
                  </Link>
                )}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-500">Decision</dt>
            <dd className="mt-0.5">
              {role === "founder" ? (
                <span className="text-xs text-ink-500" data-testid="decision-private">
                  Private to the evaluator
                </span>
              ) : header.decision?.value ? (
                <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase ${DECISION_CHIP[header.decision.value]}`} data-testid="decision-chip">
                  {header.decision.value}
                  <span className="ml-1 font-normal normal-case text-ink-500">v{header.decision.version}</span>
                </span>
              ) : (
                <span className="rounded-full border border-dashed border-surface-300 px-2.5 py-0.5 text-xs text-ink-500" data-testid="decision-chip">
                  No decision yet
                </span>
              )}
              {role === "assessor" && header.consensus ? (
                <span className="ml-2 text-xs text-ink-600" data-testid="consensus-chip" title={header.consensus.aggregate ? `Aggregate: ${header.consensus.aggregate}` : "No submitted seat view yet"}>
                  {header.consensus.label}
                  {header.consensus.aggregate ? <span className="ml-1 font-semibold uppercase">{header.consensus.aggregate}</span> : null}
                </span>
              ) : null}
            </dd>
          </div>
        </dl>
      </div>
      {role === "assessor" ? (
        <div className="mt-4 flex flex-wrap items-center gap-2" data-testid="header-actions">
          {header.viaOrgSeat ? <span className="rounded-full border border-surface-200 bg-surface-50 px-2.5 py-0.5 text-xs text-ink-600">Opened as a seat of your organisation</span> : null}
          {header.viaBatchSeat ? (
            <span className="rounded-full border border-surface-200 bg-surface-50 px-2.5 py-0.5 text-xs text-ink-600" data-testid="dossier-via-batch">
              Opened as a cohort reviewer — read only
            </span>
          ) : null}
          <ExportIcButton evaluationId={header.evaluationId} kind={icKind ?? "one_page"} />
          <a href="#dossier-block-6" className="text-xs text-action hover:underline">
            More actions ↓
          </a>
        </div>
      ) : null}

      {role === "founder" ? (
        <p className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-900" data-testid="founder-preview-note">
          Read-only preview of what your evaluator sees at the <strong>{tierLabel(header.consentTier)}</strong> tier. Their assessment stays private unless they share it with you.
        </p>
      ) : (
        <p className="mt-4 text-xs text-ink-500">
          <Link href="/workspace/evaluations" className="text-action hover:underline">
            ← Startups I&apos;m evaluating
          </Link>
        </p>
      )}
    </header>
  );
}
