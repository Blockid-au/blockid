// /showcase/sprocketbay — the BlockID process, walked end to end.
//
// `/showcase/atlassian/*` benchmarks a real listed company against public
// filings. This page does the opposite: it takes the fictional demo
// company published at `/id/sprocketbay-demo` and walks it through
// BlockID's own process, stage by stage, showing at each step what the
// founder did, what evidence they uploaded, what the engines scored, what
// artefact came out, and what that unlocked.
//
// Every number rendered here is computed at request time from the fixture
// in `@/lib/showcase/sprocketbay/journey` by the real engines
// (computeQuality → CRITERIA weights → composite, computeVerificationLevel,
// computeStageProgress, nextEvidenceState). Nothing is typed into the JSX.
//
// The sample-data disclosure comes from
// `@/lib/business-id/profile-disclosure` via
// `@/lib/showcase/sprocketbay/disclosure`, so this page and
// `/id/sprocketbay-demo` cannot disclose differently. It renders above the
// fold, before the company name and before any score.

import type { Metadata } from "next";
import Link from "next/link";

import { getMessages } from "@/lib/i18n/t";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import {
  walkthroughDisclosure,
  walkthroughLevelChrome,
} from "@/lib/showcase/sprocketbay/disclosure";
import {
  allArtefacts,
  analysisAreaLabel,
  computeWalkthrough,
  criterionTitle,
  liveArtefacts,
  phaseLabel,
  SPROCKETBAY_AS_AT,
  SPROCKETBAY_FOUNDED_ON,
  SPROCKETBAY_LEGAL_NAME,
  SPROCKETBAY_PROFILE_SLUG,
  SPROCKETBAY_RECONCILIATION,
  SPROCKETBAY_SAMPLE_NOTICE,
  type SprocketbayArtefact,
} from "@/lib/showcase/sprocketbay/journey";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title:
    "Sprocketbay Demo Co (sample data) — the BlockID process, walked end to end",
  description:
    "SAMPLE DATA. A fictional company walked through all six BlockID stages: the evidence uploaded, the scores the engines returned, the artefacts produced and what each one unlocked.",
  robots: { index: false, follow: true },
};

const STATE_STYLES: Record<string, string> = {
  verified: "border-emerald-300 bg-emerald-50 text-emerald-900",
  validation_required: "border-amber-300 bg-amber-50 text-amber-900",
  archived: "border-surface-300 bg-surface-100 text-ink-500",
  expired: "border-surface-300 bg-surface-100 text-ink-500",
  rejected: "border-rose-300 bg-rose-50 text-rose-900",
};

function stateLabel(state: string): string {
  return state.replace(/_/g, " ");
}

function ArtefactRow({ artefact }: { artefact: SprocketbayArtefact }) {
  return (
    <li className="border-l-2 border-brand-300 pl-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-xs text-ink-500">
          {artefact.issuedAt}
        </span>
        <span className="text-sm font-semibold text-ink-900">
          {artefact.title}
        </span>
        <span
          className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            STATE_STYLES[artefact.state] ?? STATE_STYLES.archived
          }`}
        >
          {stateLabel(artefact.state)}
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-700">{artefact.producedBy}</p>
      <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
        <div>
          <dt className="inline font-semibold">Analysis area: </dt>
          <dd className="inline">{analysisAreaLabel(artefact.analysisArea)}</dd>
        </div>
        <div>
          <dt className="inline font-semibold">Evidence category: </dt>
          <dd className="inline font-mono">{artefact.evidenceCategory}</dd>
        </div>
        <div>
          <dt className="inline font-semibold">SVI criterion: </dt>
          <dd className="inline">
            {artefact.criterion
              ? criterionTitle(artefact.criterion)
              : "none — no criterion covers this area"}
          </dd>
        </div>
        <div>
          <dt className="inline font-semibold">Data room: </dt>
          <dd className="inline">
            {artefact.dataRoomFolder} › {artefact.dataRoomDocument}
          </dd>
        </div>
        <div>
          <dt className="inline font-semibold">Expires: </dt>
          <dd className="inline">{artefact.expiresAt ?? "does not lapse"}</dd>
        </div>
        {artefact.stageCoverage.length > 0 && (
          <div>
            <dt className="inline font-semibold">Covers: </dt>
            <dd className="inline font-mono">
              {artefact.stageCoverage.join(", ")}
            </dd>
          </div>
        )}
      </dl>
    </li>
  );
}

export default async function SprocketbayWalkthroughPage() {
  const messages = await getMessages(DEFAULT_LOCALE);
  const disclosure = walkthroughDisclosure(messages);
  const stages = computeWalkthrough();
  const current = stages[stages.length - 1];
  const level = walkthroughLevelChrome(current.verificationLevel);
  const artefactTotal = allArtefacts().length;
  const liveTotal = liveArtefacts().length;

  const ldJson = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${SPROCKETBAY_LEGAL_NAME} — BlockID process walkthrough`,
    disambiguatingDescription: disclosure?.jsonLdNotice ?? "",
    isAccessibleForFree: true,
  };

  return (
    <div className="min-h-screen bg-surface-50">
      <script
        type="application/ld+json"
        // The banner below is for humans; crawlers and AI agents read the
        // structured data. Both have to carry the disclosure.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ldJson) }}
      />

      <div className="mx-auto max-w-5xl p-6">
        {/* ── Sample-data disclosure, above the fold ────────────────── */}
        {disclosure && (
          <section
            role="note"
            aria-labelledby="sprocketbay-sample-heading"
            data-testid="sample-data-disclosure"
            data-profile-kind="demo"
            className="mb-6 rounded-2xl border-2 border-amber-500/70 bg-amber-500/10 px-5 py-4"
          >
            <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
              {disclosure.chip}
            </p>
            <h2
              id="sprocketbay-sample-heading"
              className="mt-1 text-lg font-semibold text-ink-900"
            >
              {disclosure.title}
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-ink-700">
              {disclosure.body}
            </p>
            <p className="mt-2 max-w-3xl text-xs text-ink-600">
              {SPROCKETBAY_SAMPLE_NOTICE}
            </p>
          </section>
        )}

        <nav className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <Link href="/showcase" className="text-brand-700 hover:underline">
            ← Showcase library
          </Link>
          <Link
            href={`/id/${SPROCKETBAY_PROFILE_SLUG}`}
            className="text-brand-700 hover:underline"
          >
            See the public profile this produced →
          </Link>
        </nav>

        <header className="mb-6">
          <p className="text-xs uppercase tracking-widest text-ink-500">
            The BlockID process, walked end to end
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-ink-900">
            {SPROCKETBAY_LEGAL_NAME}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Day zero {SPROCKETBAY_FOUNDED_ON} · read as at {SPROCKETBAY_AS_AT} ·
            six stages · twelve growth phases · {artefactTotal} artefacts (
            {liveTotal} still live)
          </p>
          <p className="mt-3 max-w-3xl text-base text-ink-700">
            Every panel below is one stage of the same company. It shows what
            the founder actually did, the evidence they uploaded, the score the
            engine returned for that evidence, the artefact that came out, and
            what it unlocked. The numbers are not written into this page — they
            are recomputed from the stage inputs on every request by the same
            engines that score a real customer.
          </p>
        </header>

        {/* ── Where it ended up ─────────────────────────────────────── */}
        <section className="mb-8 grid gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-surface-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-ink-500">
              Verification ladder
            </p>
            <p className="mt-1 text-2xl font-semibold text-ink-900">
              Level {current.verificationLevel}
            </p>
            <p className="mt-0.5 text-xs text-ink-500">
              {level.levelLabel} · {level.headline}
            </p>
          </div>
          <div className="rounded-lg border border-surface-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-ink-500">
              Composite (13 criteria × weights)
            </p>
            <p className="mt-1 text-2xl font-semibold text-ink-900">
              {current.trustScore.toFixed(1)}
            </p>
            <p className="mt-0.5 text-xs text-ink-500">
              matches the score on /id/{SPROCKETBAY_PROFILE_SLUG}
            </p>
          </div>
          <div className="rounded-lg border border-surface-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-ink-500">
              Evidence coverage
            </p>
            <p className="mt-1 text-2xl font-semibold text-ink-900">
              {current.coveredAreas.length}
            </p>
            <p className="mt-0.5 text-xs text-ink-500">
              of {current.catalogue.mandatoryAreas.length} areas S5 requires
            </p>
          </div>
          <div className="rounded-lg border border-surface-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-ink-500">
              Still open
            </p>
            <p className="mt-1 text-2xl font-semibold text-ink-900">
              {current.progress.blockers.length}
            </p>
            <p className="mt-0.5 text-xs text-ink-500">
              blockers between here and {current.catalogue.exitOutput}
            </p>
          </div>
        </section>

        {/* ── Stage-by-stage ────────────────────────────────────────── */}
        <section>
          <h2 className="mb-4 text-xl font-semibold text-ink-900">
            Stage by stage
          </h2>
          <div className="space-y-6">
            {stages.map((s) => (
              <article
                key={s.stage.stage}
                data-testid={`stage-${s.stage.stage}`}
                className="rounded-lg border border-surface-200 bg-white p-5"
              >
                <div className="mb-2 flex flex-wrap items-baseline gap-2">
                  <h3 className="text-lg font-semibold text-ink-900">
                    {s.stage.stage} · {s.catalogue.label}
                  </h3>
                  <span className="font-mono text-xs text-ink-500">
                    {s.stage.enteredOn} → {s.stage.exitedOn ?? "in progress"} (
                    {s.stage.daysInStage}d, target ≤
                    {s.catalogue.windowDaysMax}d)
                  </span>
                </div>

                <p className="mb-3 flex flex-wrap gap-2 text-xs text-ink-500">
                  {s.stage.phases.map((p, i) => (
                    <span
                      key={p}
                      className="rounded border border-surface-200 bg-surface-50 px-1.5 py-0.5"
                    >
                      {phaseLabel(p)} · {s.canonicalStageLabels[i]}
                    </span>
                  ))}
                </p>

                <p className="mb-4 text-sm text-ink-700">{s.stage.narrative}</p>

                {/* What the engines returned */}
                <div className="mb-4 grid gap-3 rounded-md border border-surface-200 bg-surface-50 p-3 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-ink-500">
                      Composite
                    </p>
                    <p className="font-semibold text-ink-900">
                      {s.trustScore.toFixed(2)}{" "}
                      <span className="font-normal text-ink-500">
                        / bar {s.catalogue.exitTrustScore}
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-ink-500">
                      Ladder
                    </p>
                    <p className="font-semibold text-ink-900">
                      L{s.verificationLevel}{" "}
                      <span className="font-normal text-ink-500">
                        / bar L{s.catalogue.exitVerificationLevel}
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-ink-500">
                      Mandatory coverage
                    </p>
                    <p className="font-semibold text-ink-900">
                      {s.catalogue.mandatoryAreas.length -
                        s.missingAreas.length}{" "}
                      / {s.catalogue.mandatoryAreas.length}
                    </p>
                  </div>
                </div>

                {/* Artefacts */}
                <h4 className="mb-2 text-sm font-semibold text-ink-900">
                  What they produced ({s.stage.artefacts.length})
                </h4>
                <ul className="mb-4 space-y-3">
                  {s.stage.artefacts.map((a) => (
                    <ArtefactRow key={a.id} artefact={a} />
                  ))}
                </ul>

                {/* Assessment answers */}
                <h4 className="mb-2 text-sm font-semibold text-ink-900">
                  What the assessment scored ({s.stage.answers.length} of 13
                  criteria answered)
                </h4>
                <div className="mb-4 overflow-x-auto">
                  <table className="w-full min-w-[34rem] text-left text-xs">
                    <thead className="text-ink-500">
                      <tr>
                        <th className="py-1 pr-3 font-semibold">Criterion</th>
                        <th className="py-1 pr-3 font-semibold">Evidence</th>
                        <th className="py-1 pr-3 font-semibold">Score</th>
                        <th className="py-1 font-semibold">Quality</th>
                      </tr>
                    </thead>
                    <tbody className="text-ink-700">
                      {s.stage.answers.map((a, i) => (
                        <tr
                          key={a.criterion}
                          className="border-t border-surface-200"
                        >
                          <td className="py-1 pr-3">
                            {criterionTitle(a.criterion)}
                          </td>
                          <td className="py-1 pr-3 text-ink-500">
                            {a.fileCount} file{a.fileCount === 1 ? "" : "s"} ·{" "}
                            {a.linkCount} link{a.linkCount === 1 ? "" : "s"}
                          </td>
                          <td className="py-1 pr-3 font-mono">{a.score}</td>
                          <td className="py-1 font-semibold">
                            {s.qualities[i]?.quality}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {s.unansweredCriteria.length > 0 && (
                  <p className="mb-4 text-xs text-ink-500">
                    Not yet answered, and counted as zero in the composite:{" "}
                    {s.unansweredCriteria.map(criterionTitle).join(", ")}.
                  </p>
                )}

                {/* Outcome */}
                <div
                  className={`rounded-md border p-3 text-sm ${
                    s.progress.canAdvance
                      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                      : "border-amber-300 bg-amber-50 text-amber-900"
                  }`}
                >
                  {s.progress.canAdvance ? (
                    <p>
                      <strong>Unlocked:</strong> {s.unlocks}. Every exit
                      predicate for {s.stage.stage} passed, so the next stage
                      opened.
                    </p>
                  ) : (
                    <>
                      <p>
                        <strong>Not yet unlocked:</strong> {s.unlocks}.
                      </p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-5">
                        {s.progress.blockers.map((b) => (
                          <li key={b.code}>{b.message}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ── Reconciliation ────────────────────────────────────────── */}
        <section className="mt-8">
          <h2 className="mb-2 text-xl font-semibold text-ink-900">
            Where these numbers came from
          </h2>
          <p className="mb-4 max-w-3xl text-sm text-ink-700">
            The walkthrough and the public profile are two independent routes
            to the same figures. These are the points where they had to be
            reconciled — including the one place a fictional company cannot be
            fully honest in both directions at once.
          </p>
          <div className="space-y-3">
            {SPROCKETBAY_RECONCILIATION.map((n) => (
              <div
                key={n.id}
                className={`rounded-lg border p-4 ${
                  n.reconciled
                    ? "border-surface-200 bg-white"
                    : "border-amber-300 bg-amber-50"
                }`}
              >
                <h3 className="text-sm font-semibold text-ink-900">
                  {n.heading}
                  {!n.reconciled && (
                    <span className="ml-2 rounded border border-amber-400 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                      caveat
                    </span>
                  )}
                </h3>
                <p className="mt-1 text-sm text-ink-700">{n.body}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
