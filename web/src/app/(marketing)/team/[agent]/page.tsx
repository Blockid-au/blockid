/**
 * /team/[agent] — Per-agent profile page.
 *
 * Server component. Reads the pre-generated detail JSON from
 * web/content/team/${agent}.json produced by
 * scripts/docs/regenerate-team-page.mjs. generateStaticParams
 * returns all 11 slugs so this page prerenders.
 */

import type { Metadata } from "next";
import { brandedOrAbsolute, fitDescription, pageMetadata } from "@/lib/seo/page-meta";
import Link from "next/link";
import fs from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, PageHero, Section } from "@/components/marketing/template";

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
  return pageMetadata({
    title: brandedOrAbsolute(`${role} — BlockID team`),
    description: fitDescription([detail?.tagline, `Meet the ${role} agent on the BlockID.au multi-agent platform.`], { min: 70, max: 160 }),
    path: `/team/${agent}`,
  });
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
      {/* G17 P2-A: template hero + one Section for the profile grid + CtaBand. */}
      <PageHero
        eyebrow={detail.slug === "customer-success" ? "CS" : detail.slug.toUpperCase()}
        title={detail.role}
        sub={shortTag}
        ctas={[
          { href: "/team", label: "All agents", variant: "secondary" },
        ]}
        align="start"
      />

      <Section id="profile" ariaLabel={`${detail.role} profile`} tone="sunken">
        <div className="grid gap-8 lg:grid-cols-[1fr_260px]">
          {/* Main column */}
          <article className="min-w-0 space-y-8">
            <div className="rounded-xl border border-line-subtle bg-surface p-6 shadow-1 sm:p-8">
              <h2 className="font-display text-lg font-semibold text-primary">
                Mandate
              </h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-secondary">
                {detail.description}
              </p>
            </div>

            <div className="rounded-xl border border-line-subtle bg-surface p-6 shadow-1 sm:p-8">
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="font-display text-lg font-semibold text-primary">
                  Published activity snapshot
                </h2>
                <span className="font-mono text-xs tabular-nums text-secondary">
                  {detail.last30d_count} records in the stored collection window
                </span>
              </div>
              <p className="mb-4 text-sm text-secondary">Counts describe the stored snapshot’s original 30-day window. Refresh time is unavailable; activity records are not verified deployments.</p>
              {detail.activity.length === 0 ? (
                <p className="text-sm text-secondary">
                  No activity recorded in this snapshot.
                </p>
              ) : (
                <ul className="divide-y divide-line-subtle">
                  {detail.activity.map((row, i) => (
                    <li
                      key={`${row.date}-${i}`}
                      className="flex flex-wrap items-baseline gap-3 py-3 text-sm"
                    >
                      <span className="font-mono text-xs tabular-nums text-secondary">
                        {row.date}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-primary">
                        {row.title}
                      </span>
                      <span className="font-mono text-[10px] text-secondary">
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
            <div className="rounded-xl border border-line-subtle bg-surface p-5 shadow-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                KPIs owned
              </p>
              <ul className="mt-3 space-y-2">
                {detail.kpis.length === 0 ? (
                  <li className="text-xs text-secondary">
                    None declared.
                  </li>
                ) : (
                  detail.kpis.map((k) => (
                    <li key={k} className="text-sm text-primary">
                      {k}
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="rounded-xl border border-line-subtle bg-surface p-5 shadow-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                Related
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <Link
                    href="/team"
                    className="text-action hover:underline"
                  >
                    All agents
                  </Link>
                </li>
                <li>
                  <Link
                    href="/changelog"
                    className="text-action hover:underline"
                  >
                    Recent releases
                  </Link>
                </li>
                <li>
                  <Link
                    href="/roadmap"
                    className="text-action hover:underline"
                  >
                    Roadmap
                  </Link>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </Section>

      <CtaBand
        title="Explore the published advisor roster."
        primary={{ href: "/changelog", label: "Changelog", ctaId: "agent_final_changelog" }}
        secondary={{ href: "/roadmap", label: "Roadmap" }}
      />
    </MarketingShell>
  );
}
