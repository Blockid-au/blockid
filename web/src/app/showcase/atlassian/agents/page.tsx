// /showcase/atlassian/agents — Step 5 (index) of the Atlassian walkthrough.
//
// Lists the 7 C-Level AI agent briefings written for Atlassian's journey.
// Each card links to the per-agent detail page at
// /showcase/atlassian/agents/{slug} where {slug} is the lower-cased agent
// name from ATLASSIAN_DEMO.agentReports[].agent.
//
// This page is a plain server component — no Supabase, no cookies, no I/O.
// Anonymous visitors get HTTP 200.

import type { Metadata } from "next";
import Link from "next/link";

import { AtlassianWalkthroughProvider } from "@/components/showcase/atlassian-walkthrough-provider";
import { ATLASSIAN_DEMO, PHASE_DISPLAY_NAMES } from "@/lib/showcase/atlassian/fixture";

export const metadata: Metadata = {
  title: "C-Level agent panel — Atlassian demo — Step 5 — BlockID",
  description:
    "Seven C-Level BlockID agents (CEO, CFO, CTO, CMO, COO, CHRO, CLO) each write a phase-appropriate briefing for Atlassian's journey.",
};

// Ordered on-screen sequence for the 7 C-Level agents. Matches the
// prev/next cycle on the detail page.
const AGENT_ORDER = ["CEO", "CFO", "CTO", "CMO", "COO", "CHRO", "CLO"] as const;

const AGENT_ICON: Record<string, string> = {
  CEO: "👑",
  CFO: "💰",
  CTO: "⚙️",
  CMO: "📢",
  COO: "🎯",
  CHRO: "🧑‍🤝‍🧑",
  CLO: "⚖️",
};

function excerpt(md: string, max = 200): string {
  // Strip markdown syntax noise for the card excerpt.
  const cleaned = md
    .replace(/^#+\s+.*$/gm, "") // headings
    .replace(/^>\s+/gm, "") // blockquote markers
    .replace(/[*_`]/g, "") // emphasis / code marks
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links
    .replace(/\r?\n+/g, " ")
    .trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max).trimEnd()}…`;
}

export default function AtlassianAgentsIndexPage() {
  const reportsByAgent = new Map(
    ATLASSIAN_DEMO.agentReports.map((r) => [r.agent, r] as const),
  );
  const orderedReports = AGENT_ORDER.map((a) => reportsByAgent.get(a)).filter(
    (r): r is (typeof ATLASSIAN_DEMO.agentReports)[number] => r !== undefined,
  );

  return (
    <AtlassianWalkthroughProvider stepNumber={5}>
      <div className="min-h-screen bg-surface-50">
        <div className="container mx-auto max-w-6xl p-6">
          <nav className="mb-4 text-sm">
            <Link href="/showcase/atlassian" className="text-brand-700 hover:underline">
              ← Atlassian landing
            </Link>
          </nav>

          <header className="mb-6">
            <h1 className="text-3xl font-semibold text-ink-900">
              C-Level agents on Atlassian
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-ink-700">
              Seven BlockID C-Level AI agents each drafted a phase-appropriate
              briefing for a real moment in Atlassian's journey. Click a card
              for the full report — sources cited inline.
            </p>
          </header>

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {orderedReports.map((report) => {
              const slug = report.agent.toLowerCase();
              const phaseNum = Number(report.phaseSlug);
              const phaseName =
                Number.isFinite(phaseNum) && PHASE_DISPLAY_NAMES[phaseNum]
                  ? `Phase ${phaseNum} · ${PHASE_DISPLAY_NAMES[phaseNum]}`
                  : `Phase ${report.phaseSlug}`;
              return (
                <article
                  key={report.agent}
                  className="flex flex-col rounded-lg border border-white/10 bg-black/40 p-5 shadow-sm"
                  data-agent={report.agent}
                >
                  <div className="mb-3 flex items-center gap-3">
                    <span
                      aria-hidden
                      className="grid h-10 w-10 place-items-center rounded-full bg-brand-100 text-lg text-brand-900"
                    >
                      {AGENT_ICON[report.agent] ?? "•"}
                    </span>
                    <div>
                      <p className="text-lg font-semibold text-ink-50">
                        {report.agent}
                      </p>
                      <p className="text-[11px] uppercase tracking-wide text-ink-300">
                        Chief Officer briefing
                      </p>
                    </div>
                  </div>
                  <span className="mb-3 inline-flex w-fit items-center rounded bg-white/10 px-2 py-0.5 text-[11px] font-medium text-ink-100">
                    {phaseName}
                  </span>
                  <p className="mb-4 flex-1 text-sm leading-relaxed text-ink-200">
                    {excerpt(report.bodyMarkdown)}
                  </p>
                  <Link
                    href={`/showcase/atlassian/agents/${slug}`}
                    className="mt-auto text-sm font-medium text-brand-300 hover:text-brand-200 hover:underline"
                  >
                    Read full report →
                  </Link>
                </article>
              );
            })}
          </section>

          <aside className="mt-10 rounded-lg border border-brand-200 bg-brand-50 p-5 text-sm text-brand-900">
            <p className="font-medium">In BlockID your own C-Level AI agents would draft these live for your startup.</p>
            <p className="mt-1">
              See{" "}
              <Link href="/agents" className="underline">
                /agents
              </Link>{" "}
              to try them on your own company data.
            </p>
          </aside>
        </div>
      </div>
    </AtlassianWalkthroughProvider>
  );
}
