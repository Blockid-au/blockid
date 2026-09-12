// Renderer for the public-record showcases (Airwallex, Culture Amp — G2 #6).
// Server component: pure props in, markup out, no I/O.
//
// Framing rules, enforced by the colocated page test:
//   * <IllustrativeSviNotice /> renders above the company name on every page.
//   * Every monetary figure sits inside an element carrying `data-source`
//     with the URL it was read from, next to a visible "source" link that
//     names the publisher and the date.
//   * Prose (summary, lessons) carries no figures at all.
//
// Data: web/src/lib/showcase/public-record/cases.ts

import Link from "next/link";

import { CanonicalStageBadge } from "@/components/showcase/canonical-stage-badge";
import { CANONICAL_STAGE_LABELS } from "@/lib/journey-vocabulary";
import {
  ILLUSTRATIVE_SVI_DISCLAIMER,
  caseSources,
  type PublicMilestone,
  type PublicRecordCase,
  type PublicSource,
} from "@/lib/showcase/public-record/cases";

const PHASE_NAMES: Record<number, string> = {
  1: "Vision / Day-0 Idea",
  2: "Idea Validation",
  3: "Market Research",
  4: "MVP / Product Discovery",
  5: "PMF / Early Traction",
  6: "Revenue / Business Model",
  7: "Growth / Analytics",
  8: "Team & Culture",
  9: "Funding-Ready",
  10: "Fundraise / Term Sheet",
  11: "Post-Funding / Growth Scale",
  12: "Exit / Beyond",
};

/** The framing. Required above the fold on every public-record showcase. */
export function IllustrativeSviNotice() {
  return (
    <aside
      data-testid="illustrative-svi-notice"
      className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <p className="font-semibold">Illustrative SVI — not an assessment of the company</p>
      <p className="mt-1">{ILLUSTRATIVE_SVI_DISCLAIMER}</p>
    </aside>
  );
}

function SourceLink({ source, className }: { source: PublicSource; className?: string }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      data-source-link
      className={className ?? "text-[11px] text-brand-700 hover:underline"}
    >
      source: {source.publisher}, {source.date} →
    </a>
  );
}

function Stat({ label, value, hint, source }: { label: string; value: string; hint?: string; source: PublicSource }) {
  return (
    <div data-source={source.url} className="rounded-lg border border-surface-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-ink-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
      <SourceLink source={source} />
    </div>
  );
}

function MilestoneItem({ m }: { m: PublicMilestone }) {
  return (
    <li data-source={m.source.url} className="border-l-2 border-brand-300 pl-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-xs text-ink-500">{m.date}</span>
        <span className="font-semibold text-ink-900">{m.headline}</span>
        {m.figure ? (
          <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] text-brand-800">{m.figure}</span>
        ) : null}
        {m.valuation ? (
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-800">
            {m.valuation} valuation
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-ink-700">{m.detail}</p>
      <SourceLink source={m.source} className="mt-1 inline-block text-[11px] text-brand-700 hover:underline" />
    </li>
  );
}

export function PublicRecordShowcase({ c }: { c: PublicRecordCase }) {
  const byPhase = new Map<number, PublicMilestone[]>();
  for (const m of c.milestones) {
    if (!byPhase.has(m.phase)) byPhase.set(m.phase, []);
    byPhase.get(m.phase)!.push(m);
  }
  const phaseOrder = Array.from(byPhase.keys()).sort((a, b) => a - b);
  const stageLabel = CANONICAL_STAGE_LABELS[c.illustrativeSvi.canonicalStage];
  const sources = caseSources(c);

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="mx-auto max-w-5xl p-6">
        <nav className="mb-4 text-sm">
          <Link href="/showcase" className="text-brand-700 hover:underline">
            ← Showcase library
          </Link>
        </nav>

        <IllustrativeSviNotice />

        <header className="mb-6">
          <h1 className="text-3xl font-semibold text-ink-900">{c.name}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {c.flag} <span data-source={c.founded.source.url}>Founded {c.founded.year}, {c.founded.city}</span> ·{" "}
            <span data-source={c.hq.source.url}>{c.hq.value}</span> · {c.sector} · Private
          </p>
          {c.founded.note ? <p className="mt-1 text-xs text-ink-500">{c.founded.note}</p> : null}
          <p className="mt-1 text-xs text-ink-500" data-source={c.founders.source.url}>
            Founders: {c.founders.names.join(", ")} · <SourceLink source={c.founders.source} />
          </p>
          <p className="mt-3 max-w-3xl text-base text-ink-700">{c.summary}</p>
        </header>

        <section className="mb-8 grid gap-4 sm:grid-cols-4">
          {c.stats.map((s) => (
            <Stat key={s.label} {...s} />
          ))}
        </section>

        <section
          data-testid="illustrative-svi-band"
          data-canonical-stage={c.illustrativeSvi.canonicalStage}
          className="mb-8 rounded-lg border border-surface-200 bg-white p-4"
        >
          <h2 className="text-lg font-semibold text-ink-900">Illustrative SVI band</h2>
          <p className="mt-1 text-sm text-ink-700">
            Where the public record places {c.name} on the canonical journey today:{" "}
            <strong>{stageLabel.label_en}</strong> <span className="italic text-ink-500">({stageLabel.label_vi})</span>{" "}
            <CanonicalStageBadge phase={c.illustrativeSvi.phase} className="ml-1" />
          </p>
          <p className="mt-2 text-sm text-ink-600">{c.illustrativeSvi.rationale}</p>
          <p className="mt-2 text-xs text-ink-500">
            This is a reading of public milestones, not a Startup Value Index score — {c.name} has not been assessed by BlockID.
          </p>
        </section>

        <section className="mb-8 rounded-lg border border-brand-200 bg-brand-50 p-4">
          <h2 className="text-lg font-semibold text-brand-900">Lessons for a BlockID.au founder</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-brand-900">
            {c.lessons.map((l) => (
              <li key={l.title}>
                <strong>{l.title}</strong> {l.body}
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold text-ink-900">Milestones by BlockID.au journey phase</h2>
          <div className="space-y-6">
            {phaseOrder.map((p) => (
              <div key={p} className="rounded-lg border border-surface-200 bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-ink-900">
                    Phase {p} · {PHASE_NAMES[p]}
                  </h3>
                  <CanonicalStageBadge phase={p} />
                </div>
                <ul className="space-y-3">
                  {byPhase.get(p)!.map((m) => (
                    <MilestoneItem key={`${m.date}-${m.headline}`} m={m} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-8 text-xs text-ink-500">
          <h2 className="mb-2 text-sm font-semibold text-ink-700">Sources ({sources.length})</h2>
          <ol className="list-decimal space-y-1 pl-5">
            {sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">
                  {s.publisher} ({s.date})
                </a>{" "}
                <span className="break-all text-ink-400">{new URL(s.url).hostname}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3">
            Figures are quoted as printed by the source on the date shown; where a figure is not publicly reported it is omitted rather than estimated.
          </p>
        </footer>
      </div>
    </div>
  );
}
