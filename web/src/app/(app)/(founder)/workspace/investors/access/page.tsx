/**
 * /workspace/investors/access — Access tab of the Investors hub (S-IA2, spec
 * docs/plans/investor-clarity-2026-09-15/11-pm-ia-post-login.md §A.1): who
 * can see what. Composes five former pages as anchored sections, in order:
 *
 *   1. #investor-links  — ex /dashboard/investor-links (stat cards + table + new link)
 *   2. #data-room       — ex /dashboard/data-room (share-link access log + SBOM tile)
 *   3. #advisor         — ex /dashboard/advisor (advisor portal)
 *   4. #mentor-access   — ex /dashboard/settings/mentor-access (grants + history)
 *   5. #mentor-invite   — ex /dashboard/mentor-invite, ONLY when the query
 *      string carries `grant_request | upgrade | renew | cohort` (the emailed
 *      magic links 308 here with their params intact).
 *
 * Auth happens once here; each section is an async server component in this
 * directory that keeps its own data loader + try/catch degradation.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import {
  listInvestorLinksForFounder,
  type InvestorLinkWithViewCount,
} from "@/lib/investor-links";
import { InvestorLinksClient } from "./investor-links-client";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { DataRoomSection } from "./data-room-section";
import { AdvisorSection } from "./advisor-section";
import { MentorAccessSection } from "./mentor-access-section";
import { MentorInviteSection, hasMentorInviteParams, type MentorInviteParams } from "./mentor-invite-section";

export const metadata: Metadata = {
  title: "Investor access | BlockID",
  description: "Who can see what: investor links, data-room access, the advisor portal and mentor access for your startup.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

function linkStatus(link: InvestorLinkWithViewCount): "active" | "revoked" | "expired" {
  if (link.revokedAt) return "revoked";
  if (link.expiresAt && new Date(link.expiresAt).getTime() < Date.now()) return "expired";
  return "active";
}

export default async function InvestorAccessPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/investors/access");

  const [isSandbox, sp] = await Promise.all([getCurrentProjectIsSandbox(), searchParams]);
  const inviteParams: MentorInviteParams = {
    grant_request: first(sp.grant_request),
    upgrade: first(sp.upgrade),
    renew: first(sp.renew),
    cohort: first(sp.cohort),
  };
  const showInvite = hasMentorInviteParams(inviteParams);

  let links: InvestorLinkWithViewCount[] = [];
  try {
    links = isSupabaseConfigured() ? await listInvestorLinksForFounder(user.id, user.email) : [];
  } catch {
    links = [];
  }

  const base = siteUrl();
  const linksWithMeta = links.map((link) => ({
    ...link,
    status: linkStatus(link),
    url: link.slug ? `${base}/s/${link.slug}` : `${base}/s/i/${link.token}`,
  }));

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-14" data-workspace-investors-access data-mentor-invite={showInvite ? "1" : "0"}>
        {/* Page header */}
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-action">Investors · Access</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900">Who can see what</h1>
          <p className="mt-1 text-sm text-ink-500">
            Investor links, data-room views, the advisor portal and mentor access for your startup — all in one place.
          </p>
          <nav aria-label="On this page" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-action">
            <a href="#investor-links">Investor links</a>
            <a href="#data-room">Data room</a>
            <a href="#advisor">Advisor portal</a>
            <a href="#mentor-access">Mentor access</a>
            {showInvite ? <a href="#mentor-invite">Mentor invite</a> : null}
          </nav>
        </header>

        {/* (1) Investor links */}
        <section id="investor-links" aria-labelledby="investor-links-heading" data-access-section="investor-links" className="scroll-mt-24 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 id="investor-links-heading" className="text-2xl font-bold tracking-tight text-ink-900">
                Investor links
              </h2>
              <p className="mt-1 text-sm text-ink-500">
                Create attributed share links for each investor. Track views, revoke access, and set expiry dates.
              </p>
            </div>
            <Link
              href="/workspace/investors/access/new"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors shrink-0"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New Link
            </Link>
          </div>

          {/* Stats row */}
          {links.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard
                label="Total Links"
                value={String(links.length)}
              />
              <StatCard
                label="Active"
                value={String(linksWithMeta.filter((l) => l.status === "active").length)}
              />
              <StatCard
                label="Total Views"
                value={String(links.reduce((sum, l) => sum + l.viewCount, 0))}
              />
              <StatCard
                label="Revoked"
                value={String(linksWithMeta.filter((l) => l.status === "revoked").length)}
              />
            </div>
          )}

          {/* Client-side interactive table */}
          <InvestorLinksClient links={linksWithMeta} />
        </section>

        {/* (2) Data room access */}
        <DataRoomSection userEmail={user.email} />

        {/* (3) Advisor portal */}
        <AdvisorSection />

        {/* (4) Mentor access */}
        <MentorAccessSection userId={user.id} />

        {/* (5) Mentor invite — only for a magic-link visit (?grant_request= |
            ?upgrade= | ?renew= | ?cohort=); omitted entirely otherwise. */}
        {showInvite ? <MentorInviteSection params={inviteParams} /> : null}
      </div>
    </WorkspaceLayout>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-[11px] uppercase tracking-[0.15em] text-muted font-medium">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums text-ink-800">{value}</p>
    </div>
  );
}
