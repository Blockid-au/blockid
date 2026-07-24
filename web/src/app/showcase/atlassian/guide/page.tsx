// /showcase/atlassian/guide — Step 8 of the Atlassian walkthrough.
//
// The 12-chapter mentor guide, populated with Atlassian's real journey. Each
// chapter card shows:
//   - Chapter number + title (from web/src/lib/guide/startup-journey.ts)
//   - The chapter summary (English)
//   - A "What Atlassian actually did at this chapter" callout drawn from
//     ATLASSIAN_DEMO.phaseSnapshots[phase]
//   - Milestone dots for every ATLASSIAN_DEMO.milestones[] entry whose
//     phaseSlug matches this chapter (year + title, click through to the
//     phase in the /showcase/atlassian/growth-phases mirror)
//   - "See the phase in action" link → /showcase/atlassian/growth-phases#{slug}
//
// Server component only. No Supabase, no cookies, no I/O. Anonymous 200.

import type { Metadata } from "next";
import Link from "next/link";

import { AtlassianWalkthroughProvider } from "@/components/showcase/atlassian-walkthrough-provider";
import {
  ATLASSIAN_DEMO,
  PHASE_DISPLAY_NAMES,
  type AtlassianMilestone,
  type PhaseSnapshot,
} from "@/lib/showcase/atlassian/fixture";
import { listChapters } from "@/lib/guide/startup-journey";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "12-chapter mentor guide — Atlassian demo — Step 8 — BlockID",
  description:
    "Every founder walks 12 chapters from Vision → Exit. Here's Atlassian's real path at each one, so you can copy what worked and skip what didn't.",
};

function findSnapshot(phase: number): PhaseSnapshot | undefined {
  return ATLASSIAN_DEMO.phaseSnapshots.find(
    (s) => Number(s.phaseSlug) === phase,
  );
}

function findMilestones(phase: number): AtlassianMilestone[] {
  return ATLASSIAN_DEMO.milestones.filter(
    (m) => Number(m.phaseSlug) === phase,
  );
}

export default function AtlassianGuideMirrorPage() {
  const chapters = listChapters();

  return (
    <AtlassianWalkthroughProvider stepNumber={8}>
      <div className="min-h-screen bg-surface-50">
        <div className="container mx-auto max-w-6xl px-4 py-8">
          <nav className="mb-4 text-sm">
            <Link
              href="/showcase/atlassian"
              className="text-brand-700 hover:underline"
            >
              ← Atlassian landing
            </Link>
          </nav>

          <header className="mb-8">
            <h1 className="text-3xl font-semibold text-ink-900">
              The 12-chapter mentor guide — every founder walks this path
            </h1>
            <p className="mt-2 max-w-3xl text-base text-ink-700">
              BlockID's <code className="rounded bg-surface-100 px-1">/guide</code>{" "}
              turns the 12 phases into a chapter-by-chapter mentor script. Here
              each chapter is overlaid with what Atlassian actually did, so you
              can see the abstract phase advice sitting on top of a real
              journey — bootstrap to NASDAQ, Sydney to Delaware, zero founder
              dilution across 24 years.
            </p>
          </header>

          <section className="space-y-4">
            {chapters.map((chapter) => {
              const snapshot = findSnapshot(chapter.phase);
              const milestones = findMilestones(chapter.phase);
              const phaseAnchor = `phase-${chapter.phase}`;
              return (
                <article
                  key={chapter.slug}
                  className="rounded-lg border border-surface-200 bg-white p-5 shadow-sm"
                >
                  <header className="mb-3 flex flex-wrap items-baseline gap-3">
                    <span className="rounded bg-brand-100 px-2 py-0.5 text-xs font-mono text-brand-800">
                      Chapter {chapter.order}
                    </span>
                    <h2 className="text-xl font-semibold text-ink-900">
                      {chapter.title.en}
                    </h2>
                    <span className="text-xs text-ink-500">
                      Phase {chapter.phase} · {PHASE_DISPLAY_NAMES[chapter.phase]}
                    </span>
                  </header>

                  <p className="text-sm text-ink-700">{chapter.summary.en}</p>

                  {snapshot && (
                    <aside className="mt-3 rounded-md border border-brand-200 bg-brand-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-brand-800">
                        What Atlassian actually did at this chapter
                      </p>
                      <p className="mt-1 text-sm text-ink-800">
                        {snapshot.atlassianMoment}
                      </p>
                      {snapshot.sviAtThisPoint !== undefined && (
                        <p className="mt-1 text-xs text-brand-700">
                          Estimated SVI at this point:{" "}
                          <strong>{snapshot.sviAtThisPoint}/100</strong>
                        </p>
                      )}
                      <a
                        href={snapshot.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-[11px] text-brand-700 hover:underline"
                      >
                        source →
                      </a>
                    </aside>
                  )}

                  {milestones.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">
                        Milestones ({milestones.length})
                      </p>
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {milestones.map((m, i) => (
                          <li
                            key={`${chapter.phase}-${i}`}
                            className="flex items-center gap-1 rounded-full border border-brand-200 bg-white px-2 py-1 text-xs text-ink-800"
                          >
                            <span
                              aria-hidden="true"
                              className="inline-block h-1.5 w-1.5 rounded-full bg-brand-500"
                            />
                            <span className="font-mono text-[10px] text-ink-500">
                              {m.year}
                            </span>
                            <span>{m.title}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <footer className="mt-4 flex flex-wrap gap-3 text-xs">
                    <Link
                      href={`/showcase/atlassian/growth-phases#${phaseAnchor}`}
                      className="text-brand-700 hover:underline"
                    >
                      See the phase in action →
                    </Link>
                    <span className="text-ink-500">
                      Founder action: {chapter.founderAction.en.slice(0, 120)}
                      {chapter.founderAction.en.length > 120 ? "…" : ""}
                    </span>
                  </footer>
                </article>
              );
            })}
          </section>

          <footer className="mt-10 rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900">
            <p className="font-semibold">
              In BlockID <code className="rounded bg-white px-1">/guide</code>{" "}
              shows the version tailored to your startup.
            </p>
            <p className="mt-1 text-brand-800">
              You log in, answer the 13-criterion SVI, and the same 12 chapters
              are re-rendered against your phase, your agents, your evidence
              gaps — not Atlassian's. The overlay here is a preview; the real
              guide meets you where your own startup sits today.
            </p>
          </footer>
        </div>
      </div>
    </AtlassianWalkthroughProvider>
  );
}
