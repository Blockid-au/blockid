// /showcase/atlassian/agents/[slug] — Step 5 (detail) of the Atlassian
// walkthrough. One page per C-Level agent (CEO, CFO, CTO, CMO, COO, CHRO, CLO).
//
// - Statically prerendered via generateStaticParams.
// - notFound() when the slug does not match any agent report.
// - Renders the Markdown body inline via a small server-side renderer so we
//   don't need to pull react-markdown into a Server Component (the fixture
//   markdown is a fixed dialect we control end-to-end).

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AtlassianWalkthroughProvider } from "@/components/showcase/atlassian-walkthrough-provider";
import {
  ATLASSIAN_DEMO,
  PHASE_DISPLAY_NAMES,
  type AgentReport,
} from "@/lib/showcase/atlassian/fixture";

// Order matches the index page cards + the prev/next cycle at the bottom.
const AGENT_ORDER = ["CEO", "CFO", "CTO", "CMO", "COO", "CHRO", "CLO"] as const;

type AgentName = (typeof AGENT_ORDER)[number];

const AGENT_ICON: Record<AgentName, string> = {
  CEO: "👑",
  CFO: "💰",
  CTO: "⚙️",
  CMO: "📢",
  COO: "🎯",
  CHRO: "🧑‍🤝‍🧑",
  CLO: "⚖️",
};

// Year to reference in the H1 for each agent — derived from the milestone
// buckets the agent report is targeting. Kept as a constant so H1 copy is
// deterministic and readable at a glance.
const AGENT_YEAR_CONTEXT: Record<AgentName, string> = {
  CEO: "2002",
  CFO: "2010",
  CTO: "2004",
  CMO: "2003",
  COO: "2017",
  CHRO: "2007",
  CLO: "2014",
};

function slugToAgent(slug: string): AgentName | null {
  const upper = slug.toUpperCase();
  return (AGENT_ORDER as readonly string[]).includes(upper)
    ? (upper as AgentName)
    : null;
}

function findReport(agent: AgentName): AgentReport | null {
  return ATLASSIAN_DEMO.agentReports.find((r) => r.agent === agent) ?? null;
}

export function generateStaticParams(): { slug: string }[] {
  return AGENT_ORDER.map((a) => ({ slug: a.toLowerCase() }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const agent = slugToAgent(slug);
  if (!agent) {
    return { title: "Agent not found — Atlassian demo — BlockID" };
  }
  return {
    title: `${agent} report — Atlassian demo — Step 5 — BlockID`,
    description: `Phase-appropriate briefing from the BlockID ${agent} AI agent, written for a real Atlassian inflection point.`,
  };
}

// ── Minimal server-side markdown renderer ──────────────────────────────────
// Deliberately small — the fixture markdown is a fixed dialect (# / ## / ###
// headings, paragraphs, - bullets, 1. numbered lists, > blockquote lines,
// and one GFM pipe table). We do NOT support arbitrary CommonMark; we do
// support exactly what the fixture uses. Keeping it inline avoids paying
// react-markdown's bundle cost on a static server page.

type InlineRun = { type: "text" | "bold" | "code" | "link"; text: string; href?: string };

function parseInline(source: string): InlineRun[] {
  const runs: InlineRun[] = [];
  let rest = source;
  const pattern =
    /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/;
  while (rest.length > 0) {
    const match = pattern.exec(rest);
    if (!match) {
      runs.push({ type: "text", text: rest });
      break;
    }
    const idx = match.index;
    if (idx > 0) {
      runs.push({ type: "text", text: rest.slice(0, idx) });
    }
    if (match[1]) {
      runs.push({ type: "bold", text: match[2] ?? "" });
    } else if (match[3]) {
      runs.push({ type: "code", text: match[4] ?? "" });
    } else if (match[5]) {
      runs.push({ type: "link", text: match[6] ?? "", href: match[7] ?? "#" });
    }
    rest = rest.slice(idx + match[0].length);
  }
  return runs;
}

function renderInline(source: string, keyPrefix: string): React.ReactNode[] {
  return parseInline(source).map((run, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (run.type) {
      case "bold":
        return (
          <strong key={key} className="font-semibold text-ink-50">
            {run.text}
          </strong>
        );
      case "code":
        return (
          <code
            key={key}
            className="rounded bg-white/10 px-1 py-0.5 text-[0.85em] text-ink-100"
          >
            {run.text}
          </code>
        );
      case "link":
        return (
          <a
            key={key}
            href={run.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-300 underline hover:text-brand-200"
          >
            {run.text}
          </a>
        );
      default:
        return <span key={key}>{run.text}</span>;
    }
  });
}

function renderMarkdown(md: string): React.ReactNode {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];

  let i = 0;
  let blockKey = 0;
  const nextKey = (): string => `md-${blockKey++}`;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    // Blank line — separator only.
    if (!line.trim()) {
      i++;
      continue;
    }

    // Headings
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      const text = heading[2] ?? "";
      const cls =
        level === 1
          ? "mt-6 text-2xl font-semibold text-ink-50"
          : level === 2
            ? "mt-6 text-xl font-semibold text-ink-50"
            : "mt-5 text-lg font-semibold text-ink-100";
      const inline = renderInline(text, `h-${blockKey}`);
      const key = nextKey();
      blocks.push(
        level === 1 ? (
          <h1 key={key} className={cls}>
            {inline}
          </h1>
        ) : level === 2 ? (
          <h2 key={key} className={cls}>
            {inline}
          </h2>
        ) : (
          <h3 key={key} className={cls}>
            {inline}
          </h3>
        ),
      );
      i++;
      continue;
    }

    // Blockquote (single- or multi-line consecutive > prefix)
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i]!.startsWith("> ")) {
        quoteLines.push(lines[i]!.slice(2));
        i++;
      }
      const key = nextKey();
      blocks.push(
        <blockquote
          key={key}
          className="my-4 border-l-4 border-brand-400 bg-white/5 px-4 py-2 text-ink-200 italic"
        >
          {quoteLines.map((q, qi) => (
            <p key={`${key}-l-${qi}`}>{renderInline(q, `${key}-i-${qi}`)}</p>
          ))}
        </blockquote>,
      );
      continue;
    }

    // Unordered list
    if (/^-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^-\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^-\s+/, ""));
        i++;
      }
      const key = nextKey();
      blocks.push(
        <ul key={key} className="my-3 list-disc space-y-1 pl-6 text-ink-200">
          {items.map((it, li) => (
            <li key={`${key}-l-${li}`}>{renderInline(it, `${key}-i-${li}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\d+\.\s+/, ""));
        i++;
      }
      const key = nextKey();
      blocks.push(
        <ol key={key} className="my-3 list-decimal space-y-1 pl-6 text-ink-200">
          {items.map((it, li) => (
            <li key={`${key}-l-${li}`}>{renderInline(it, `${key}-i-${li}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // GFM pipe table (header row + separator + body rows).
    if (line.trim().startsWith("|") && (lines[i + 1] ?? "").trim().startsWith("|")) {
      const sep = lines[i + 1] ?? "";
      if (/^\s*\|[\s\-|:]+\|\s*$/.test(sep)) {
        const headerCells = line
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim());
        i += 2;
        const rows: string[][] = [];
        while (i < lines.length && (lines[i] ?? "").trim().startsWith("|")) {
          rows.push(
            (lines[i] ?? "")
              .trim()
              .replace(/^\||\|$/g, "")
              .split("|")
              .map((c) => c.trim()),
          );
          i++;
        }
        const key = nextKey();
        blocks.push(
          <div key={key} className="my-4 overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/20">
                  {headerCells.map((h, hi) => (
                    <th
                      key={`${key}-h-${hi}`}
                      className="px-3 py-2 font-semibold text-ink-100"
                    >
                      {renderInline(h, `${key}-hc-${hi}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr
                    key={`${key}-r-${ri}`}
                    className="border-b border-white/10"
                  >
                    {row.map((cell, ci) => (
                      <td
                        key={`${key}-c-${ri}-${ci}`}
                        className="px-3 py-2 text-ink-200"
                      >
                        {renderInline(cell, `${key}-cc-${ri}-${ci}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
        continue;
      }
    }

    // Paragraph — accumulate until blank line or block boundary.
    const paraLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i]!.trim() !== "" &&
      !/^#{1,3}\s+/.test(lines[i] ?? "") &&
      !/^-\s+/.test(lines[i] ?? "") &&
      !/^\d+\.\s+/.test(lines[i] ?? "") &&
      !(lines[i] ?? "").startsWith("> ") &&
      !(lines[i] ?? "").trim().startsWith("|")
    ) {
      paraLines.push(lines[i]!);
      i++;
    }
    const key = nextKey();
    blocks.push(
      <p key={key} className="my-3 text-ink-200 leading-relaxed">
        {renderInline(paraLines.join(" "), `${key}-i`)}
      </p>,
    );
  }

  return blocks;
}

export default async function AtlassianAgentDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const agent = slugToAgent(slug);
  if (!agent) {
    notFound();
  }
  const report = findReport(agent);
  if (!report) {
    notFound();
  }

  const orderIdx = AGENT_ORDER.indexOf(agent);
  const prevAgent = AGENT_ORDER[(orderIdx - 1 + AGENT_ORDER.length) % AGENT_ORDER.length]!;
  const nextAgent = AGENT_ORDER[(orderIdx + 1) % AGENT_ORDER.length]!;

  const phaseNum = Number(report.phaseSlug);
  const phaseName =
    Number.isFinite(phaseNum) && PHASE_DISPLAY_NAMES[phaseNum]
      ? PHASE_DISPLAY_NAMES[phaseNum]
      : `Phase ${report.phaseSlug}`;
  const year = AGENT_YEAR_CONTEXT[agent];

  return (
    <AtlassianWalkthroughProvider stepNumber={5}>
      <div className="min-h-screen bg-surface-50">
        <div className="container mx-auto max-w-6xl p-6">
          <nav className="mb-4 text-sm">
            <Link
              href="/showcase/atlassian/agents"
              className="text-brand-700 hover:underline"
            >
              ← All C-Level agents
            </Link>
          </nav>

          <header className="mb-6 flex items-start gap-4">
            <span
              aria-hidden
              className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand-100 text-2xl text-brand-900"
            >
              {AGENT_ICON[agent]}
            </span>
            <div>
              <h1 className="text-3xl font-semibold text-ink-900">
                {agent} — for {year} Atlassian
              </h1>
              <p className="mt-1 text-sm text-ink-500">
                Phase {report.phaseSlug} · {phaseName}
              </p>
            </div>
          </header>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <article className="rounded-lg border border-white/10 bg-black/40 p-6">
              {renderMarkdown(report.bodyMarkdown)}

              <section className="mt-8 border-t border-white/10 pt-4">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-ink-100">
                  Sources
                </h4>
                <ul className="mt-2 space-y-1 text-xs">
                  {report.sources.map((s, si) => (
                    <li key={si}>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-300 underline hover:text-brand-200"
                      >
                        {s.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            </article>

            <aside className="rounded-lg border border-white/10 bg-black/40 p-5 text-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-100">
                Agent metadata
              </h2>
              <dl className="mt-3 space-y-3 text-ink-200">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink-400">Agent</dt>
                  <dd className="mt-0.5 text-ink-50">{agent}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink-400">Phase focus</dt>
                  <dd className="mt-0.5 text-ink-50">
                    Phase {report.phaseSlug} · {phaseName}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink-400">
                    Sources cited
                  </dt>
                  <dd className="mt-0.5 text-ink-50">{report.sources.length}</dd>
                </div>
              </dl>

              <div className="mt-5 border-t border-white/10 pt-4">
                <Link
                  href={`/showcase/atlassian/growth-phases#${report.phaseSlug}`}
                  className="text-sm font-medium text-brand-300 hover:text-brand-200 hover:underline"
                >
                  See the phase in context →
                </Link>
              </div>
            </aside>
          </div>

          <nav
            aria-label="Previous / next agent"
            className="mt-10 flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-5 py-4 text-sm"
          >
            <Link
              href={`/showcase/atlassian/agents/${prevAgent.toLowerCase()}`}
              className="text-brand-300 hover:text-brand-200 hover:underline"
            >
              ← {prevAgent}
            </Link>
            <Link
              href="/showcase/atlassian/agents"
              className="text-ink-300 hover:text-ink-100 hover:underline"
            >
              All agents
            </Link>
            <Link
              href={`/showcase/atlassian/agents/${nextAgent.toLowerCase()}`}
              className="text-brand-300 hover:text-brand-200 hover:underline"
            >
              {nextAgent} →
            </Link>
          </nav>
        </div>
      </div>
    </AtlassianWalkthroughProvider>
  );
}
