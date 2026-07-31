// Renderers for the Atlassian public-record benchmark (S0–S5 × 12-phase ×
// 13-area). Server components only — pure props in, markup out, no I/O.
//
// Framing rule, enforced by the colocated test: every surface that renders any
// of this data renders <BenchmarkNotice /> with it. Atlassian is a market
// reference compiled from public filings, not a BlockID customer and not
// something BlockID has assessed.
//
// Data source: web/src/lib/showcase/atlassian/stage-benchmark.ts

import {
  ANALYSIS_AREAS,
  ATLASSIAN_FOLKLORE_CHECKS,
  ATLASSIAN_HUMAN_REVIEW_FLAGS,
  ATLASSIAN_STAGE_BENCHMARKS,
  BENCHMARK_DISCLAIMER,
  STAGE_CALIBRATION_NOTE,
  getAnalysisArea,
  getPhaseBenchmark,
  milestonesForStage,
  type AnalysisAreaId,
  type AreaSignal,
  type EvidenceGrade,
  type PublicSource,
  type StageBenchmark,
} from "@/lib/showcase/atlassian/stage-benchmark";
import type { PhaseKey } from "@/lib/journey-map";

// ── Primitives ──────────────────────────────────────────────────────────────

/** The case-study framing. Required on every surface that shows this data. */
export function BenchmarkNotice({ compact = false }: { compact?: boolean }) {
  return (
    <aside
      data-testid="benchmark-notice"
      className={
        "rounded-lg border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100 " +
        (compact ? "px-3 py-2 text-[11px]" : "p-4 text-sm")
      }
    >
      <p className="font-semibold">Market reference — case study, not an assessment</p>
      <p className="mt-1">{BENCHMARK_DISCLAIMER}</p>
    </aside>
  );
}

export function EvidenceTag({ grade }: { grade: EvidenceGrade }) {
  const documented = grade === "documented";
  return (
    <span
      data-evidence={grade}
      title={
        documented
          ? "On the face of a cited public source."
          : "BlockID's reading of the public record — a view, not a fact."
      }
      className={
        "inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide " +
        (documented
          ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100"
          : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200")
      }
    >
      {documented ? "documented" : "interpretation"}
    </span>
  );
}

const SIGNAL_STYLE: Record<AreaSignal, { label: string; cls: string }> = {
  strong: { label: "Strong", cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100" },
  mixed: { label: "Mixed", cls: "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100" },
  weak: { label: "Thin", cls: "bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-100" },
  not_public: { label: "Not public", cls: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300" },
};

export function SignalPill({ signal }: { signal: AreaSignal }) {
  const s = SIGNAL_STYLE[signal];
  return (
    <span
      data-signal={signal}
      className={"inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold " + s.cls}
    >
      {s.label}
    </span>
  );
}

export function SourceList({ sources }: { sources: readonly PublicSource[] }) {
  return (
    <ul className="mt-2 space-y-0.5">
      {sources.map((s) => (
        <li key={s.url} className="text-[10px] leading-snug">
          <a
            href={s.url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-brand-700 hover:underline dark:text-emerald-400"
          >
            {s.label}
          </a>{" "}
          <span
            data-tier={s.tier}
            className="text-ink-500 dark:text-slate-500"
            title={s.tier === "primary" ? "Company filing or company newsroom" : "Reported coverage"}
          >
            ({s.tier})
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── Per-phase panel (used inside the 12-phase strip) ────────────────────────

export function PhaseBenchmarkPanel({ ordinal }: { ordinal: PhaseKey }) {
  const p = getPhaseBenchmark(ordinal);
  const name = (id: AnalysisAreaId) => getAnalysisArea(id).label;
  return (
    <div
      data-testid="phase-benchmark-panel"
      data-phase={p.phase}
      data-stage={p.stage}
      className="mt-3 border-t border-surface-100 pt-2 dark:border-slate-800"
    >
      <div className="flex items-center gap-1">
        <span className="rounded bg-ink-900 px-1.5 py-0.5 text-[9px] font-mono text-white dark:bg-slate-700">
          {p.stage}
        </span>
        <EvidenceTag grade={p.evidence} />
      </div>
      <p className="mt-2 text-[11px] leading-snug text-ink-700 dark:text-slate-300">
        {p.atlassianAtThisPhase}
      </p>
      {p.strongAreas.length > 0 ? (
        <p className="mt-2 text-[10px] text-emerald-800 dark:text-emerald-300">
          <span className="font-semibold">Evidenced strength:</span>{" "}
          {p.strongAreas.map(name).join(", ")}
        </p>
      ) : null}
      {p.weakOrUnevidencedAreas.length > 0 ? (
        <p className="mt-1 text-[10px] text-ink-600 dark:text-slate-400">
          <span className="font-semibold">Thin or unevidenced:</span>{" "}
          {p.weakOrUnevidencedAreas.map(name).join(", ")}
        </p>
      ) : null}
      <p className="mt-1 text-[10px] text-ink-600 dark:text-slate-400">
        <span className="font-semibold">Artefacts expected here:</span>{" "}
        {p.expectedArtefacts.join(" · ")}
      </p>
      <SourceList sources={p.sources} />
    </div>
  );
}

// ── S0–S5 stage cards ───────────────────────────────────────────────────────

function StageCard({ b }: { b: StageBenchmark }) {
  const milestones = milestonesForStage(b.stage);
  return (
    <article
      data-testid="stage-benchmark-card"
      data-stage={b.stage}
      className="rounded-lg border border-surface-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      <header className="flex flex-wrap items-baseline gap-2">
        <span className="rounded bg-brand-700 px-2 py-0.5 text-xs font-mono font-semibold text-white dark:bg-emerald-600">
          {b.stage}
        </span>
        <h3 className="text-base font-semibold text-ink-900 dark:text-slate-100">{b.label}</h3>
        <span className="text-xs text-ink-500 dark:text-slate-400">{b.period}</span>
        <EvidenceTag grade={b.stagePlacementEvidence} />
      </header>

      <p className="mt-2 text-sm leading-snug text-ink-700 dark:text-slate-300">
        {b.whatItLookedLike}
      </p>

      <p className="mt-3 text-xs text-ink-700 dark:text-slate-300">
        <span className="font-semibold">Verification-ladder analogue: L{b.verificationAnalogue.level}</span>{" "}
        <EvidenceTag grade={b.verificationAnalogue.evidence} /> — {b.verificationAnalogue.why}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500 dark:text-slate-400">
            Artefacts a company here would hold
          </p>
          <ul className="mt-1 list-disc pl-4 text-[11px] text-ink-700 dark:text-slate-300">
            {b.expectedArtefacts.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500 dark:text-slate-400">
            Of those, visible in the public record
          </p>
          {b.publiclyVisibleArtefacts.length > 0 ? (
            <ul className="mt-1 list-disc pl-4 text-[11px] text-ink-700 dark:text-slate-300">
              {b.publiclyVisibleArtefacts.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[11px] italic text-ink-500 dark:text-slate-400">
              None. A private company at this stage publishes nothing.
            </p>
          )}
        </div>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-[11px] font-semibold text-brand-700 dark:text-emerald-400">
          13 analysis areas at this stage
        </summary>
        <table className="mt-2 w-full text-left text-[10px]">
          <thead>
            <tr className="text-ink-500 dark:text-slate-400">
              <th scope="col" className="py-1 pr-2 font-semibold">Area</th>
              <th scope="col" className="py-1 pr-2 font-semibold">Pillar</th>
              <th scope="col" className="py-1 pr-2 font-semibold">Signal</th>
              <th scope="col" className="py-1 font-semibold">What the record shows</th>
            </tr>
          </thead>
          <tbody>
            {ANALYSIS_AREAS.map((area) => {
              const r = b.areaReadings[area.id];
              return (
                <tr key={area.id} className="border-t border-surface-100 align-top dark:border-slate-800">
                  <td className="py-1 pr-2 text-ink-800 dark:text-slate-200">{area.label}</td>
                  <td className="py-1 pr-2 text-ink-500 dark:text-slate-400">{area.pillar.replace(/_/g, " ")}</td>
                  <td className="py-1 pr-2">
                    <SignalPill signal={r.signal} />
                  </td>
                  <td className="py-1 text-ink-700 dark:text-slate-300">
                    {r.note} <EvidenceTag grade={r.evidence} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>

      {milestones.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] font-semibold text-brand-700 dark:text-emerald-400">
            {milestones.length} sourced milestone{milestones.length === 1 ? "" : "s"} in this stage
          </summary>
          <ul className="mt-2 space-y-2">
            {milestones.map((m) => (
              <li key={m.id} className="border-l-2 border-surface-200 pl-2 dark:border-slate-700">
                <p className="text-[11px] font-semibold text-ink-900 dark:text-slate-100">
                  <span className="font-mono text-ink-500 dark:text-slate-500">{m.date}</span> {m.headline}{" "}
                  <EvidenceTag grade={m.evidence} />
                </p>
                <p className="mt-0.5 text-[10px] leading-snug text-ink-700 dark:text-slate-300">{m.detail}</p>
                {m.figures.length > 0 ? (
                  <ul className="mt-1 space-y-0.5">
                    {m.figures.map((f) => (
                      <li key={f.label} className="text-[10px] text-ink-600 dark:text-slate-400">
                        <span className="font-medium">{f.label}:</span> {f.value}{" "}
                        <a
                          href={f.source.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-brand-700 hover:underline dark:text-emerald-400"
                        >
                          [{f.source.label}]
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <SourceList sources={m.sources} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <SourceList sources={b.sources} />
    </article>
  );
}

export function StageBenchmarkSection() {
  return (
    <section aria-labelledby="stage-benchmark-heading" data-testid="stage-benchmark-section">
      <h2 id="stage-benchmark-heading" className="text-xl font-semibold text-ink-900 dark:text-slate-100">
        S0–S5: what a documented company looked like at each stage
      </h2>
      <p className="mt-2 max-w-3xl text-sm text-ink-700 dark:text-slate-300">
        {STAGE_CALIBRATION_NOTE}
      </p>
      <div className="mt-4 grid gap-4">
        {ATLASSIAN_STAGE_BENCHMARKS.map((b) => (
          <StageCard key={b.stage} b={b} />
        ))}
      </div>
    </section>
  );
}

// ── Folklore + review flags ─────────────────────────────────────────────────

const VERDICT_STYLE: Record<string, string> = {
  accurate: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100",
  needs_nuance: "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100",
  unsupported: "bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-100",
};

export function FolkloreChecksSection() {
  return (
    <section aria-labelledby="folklore-heading" data-testid="folklore-section">
      <h2 id="folklore-heading" className="text-xl font-semibold text-ink-900 dark:text-slate-100">
        Six things everyone repeats about Atlassian — checked against the filings
      </h2>
      <p className="mt-2 max-w-3xl text-sm text-ink-700 dark:text-slate-300">
        Startup folklore travels faster than primary sources. Each claim below is
        the version you will hear at a meetup, followed by what the public record
        actually supports.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {ATLASSIAN_FOLKLORE_CHECKS.map((f) => (
          <article
            key={f.id}
            data-testid="folklore-check"
            data-verdict={f.verdict}
            className="rounded-lg border border-surface-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-ink-900 dark:text-slate-100">
                &ldquo;{f.popularClaim}&rdquo;
              </p>
              <span
                className={
                  "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide " +
                  (VERDICT_STYLE[f.verdict] ?? "")
                }
              >
                {f.verdict.replace(/_/g, " ")}
              </span>
            </div>
            <p className="mt-2 text-xs leading-snug text-ink-700 dark:text-slate-300">
              {f.whatTheRecordShows}
            </p>
            <SourceList sources={f.sources} />
          </article>
        ))}
      </div>
    </section>
  );
}

export function HumanReviewFlagsSection() {
  return (
    <section
      aria-labelledby="review-flags-heading"
      data-testid="human-review-flags"
      className="rounded-lg border border-slate-300 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900"
    >
      <h2 id="review-flags-heading" className="text-sm font-semibold text-ink-900 dark:text-slate-100">
        Flagged for human review — not self-certified
      </h2>
      <p className="mt-1 text-xs text-ink-700 dark:text-slate-300">
        Mapping a real company onto a framework involves judgement calls. These
        are the ones we are not willing to present as settled.
      </p>
      <ul className="mt-3 space-y-2">
        {ATLASSIAN_HUMAN_REVIEW_FLAGS.map((f) => (
          <li key={f.id} data-flag={f.id} className="text-xs text-ink-700 dark:text-slate-300">
            <span className="font-semibold text-ink-900 dark:text-slate-100">{f.what}</span> — {f.why}{" "}
            <code className="rounded bg-surface-100 px-1 text-[10px] dark:bg-slate-800">{f.surface}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}
