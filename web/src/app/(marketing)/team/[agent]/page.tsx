/**
 * /team/[agent] — Per-agent profile page.
 *
 * Server component. Reads the pre-generated detail JSON from
 * web/content/team/${agent}.json produced by
 * scripts/docs/regenerate-team-page.mjs. generateStaticParams
 * returns all 11 slugs so this page prerenders.
 */

import type { Metadata } from "next";
import Link from "next/link";
import fs from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";

const SLUGS = [
  "cdo",
  "cfo",
  "chro",
  "ciso",
  "clo",
  "cmo",
  "coo",
  "cpo",
  "cro",
  "cto",
  "customer-success",
] as const;

type AgentSlug = (typeof SLUGS)[number];

interface RouteParams {
  agent: string;
}

type AgentDetail = {
  slug: string;
  role: string;
  title: string;
  tagline: string;
  description: string;
  kpis: string[];
  last30d_count: number;
  activity: { date: string; title: string; file: string }[];
};

function readAgent(slug: AgentSlug): AgentDetail | null {
  const candidates = [
    path.join(process.cwd(), "web", "content", "team", `${slug}.json`),
    path.join(process.cwd(), "content", "team", `${slug}.json`),
    path.join(process.cwd(), "..", "web", "content", "team", `${slug}.json`),
  ];
  for (const p of candidates) {
    try {
      return JSON.parse(fs.readFileSync(p, "utf-8")) as AgentDetail;
    } catch {
      // try next
    }
  }
  return null;
}

export function generateStaticParams(): RouteParams[] {
  return SLUGS.map((agent) => ({ agent }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { agent } = await params;
  if (!SLUGS.includes(agent as AgentSlug)) return {};
  const detail = readAgent(agent as AgentSlug);
  const role = detail?.role ?? agent;
  return {
    title: `${role} — BlockID Team`,
    description:
      detail?.tagline ??
      `Meet the ${role} agent on the BlockID.au multi-agent platform.`,
    alternates: { canonical: `https://blockid.au/team/${agent}` },
  };
}

export default async function AgentProfilePage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { agent } = await params;
  if (!SLUGS.includes(agent as AgentSlug)) notFound();
  const detail = readAgent(agent as AgentSlug);
  if (!detail) notFound();

  const shortTag = (detail.tagline.split(". Use when")[0] ?? detail.tagline)
    .replace(/^[^—]+—\s*/, "")
    .trim();

  return (
    <MarketingShell>
      <MarketingHero
        eyebrow={detail.slug === "customer-success" ? "CS" : detail.slug.toUpperCase()}
        title={detail.role}
        subtitle={shortTag}
      />

      <section className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
        <div className="grid gap-8 lg:grid-cols-[1fr_260px]">
          {/* Main column */}
          <article className="min-w-0 space-y-8">
            <div className="rounded-2xl border border-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)] p-6 sm:p-8">
              <h2 className="text-lg font-semibold text-[var(--fintech-ink)]">
                Mandate
              </h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[var(--fintech-ink-muted)]">
                {detail.description}
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)] p-6 sm:p-8">
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="text-lg font-semibold text-[var(--fintech-ink)]">
                  Recent activity
                </h2>
                <span className="font-mono text-xs tabular-nums text-[var(--fintech-ink-muted)]">
                  {detail.last30d_count} last 30d
                </span>
              </div>
              {detail.activity.length === 0 ? (
                <p className="text-sm text-[var(--fintech-ink-muted)]">
                  No activity in the last 30 days.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--fintech-border)]">
                  {detail.activity.map((row, i) => (
                    <li
                      key={`${row.date}-${i}`}
                      className="flex flex-wrap items-baseline gap-3 py-3 text-sm"
                    >
                      <span className="font-mono text-xs tabular-nums text-[var(--fintech-ink-muted)]">
                        {row.date}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[var(--fintech-ink)]">
                        {row.title}
                      </span>
                      <span className="font-mono text-[10px] text-[var(--fintech-ink-muted)]">
                        {row.file}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>

          {/* Sidebar */}
          <aside className="space-y-6">
            <div className="rounded-2xl border border-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--fintech-accent)]">
                KPIs owned
              </p>
              <ul className="mt-3 space-y-2">
                {detail.kpis.length === 0 ? (
                  <li className="text-xs text-[var(--fintech-ink-muted)]">
                    None declared.
                  </li>
                ) : (
                  detail.kpis.map((k) => (
                    <li key={k} className="text-sm text-[var(--fintech-ink)]">
                      {k}
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="rounded-2xl border border-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--fintech-accent)]">
                Related
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <Link
                    href="/team"
                    className="text-[var(--fintech-accent)] hover:underline"
                  >
                    All 11 agents
                  </Link>
                </li>
                <li>
                  <Link
                    href="/changelog"
                    className="text-[var(--fintech-accent)] hover:underline"
                  >
                    Recent releases
                  </Link>
                </li>
                <li>
                  <Link
                    href="/roadmap"
                    className="text-[var(--fintech-accent)] hover:underline"
                  >
                    Roadmap
                  </Link>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </section>
    </MarketingShell>
  );
}
