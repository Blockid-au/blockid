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

export const metadata: Metadata = {
  title: "Investor Links — Dashboard — BlockID",
};

export const dynamic = "force-dynamic";

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

export default async function InvestorLinksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/investor-links");

  const links: InvestorLinkWithViewCount[] = isSupabaseConfigured()
    ? await listInvestorLinksForFounder(user.id, user.email)
    : [];

  const base = siteUrl();
  const linksWithMeta = links.map((link) => ({
    ...link,
    status: linkStatus(link),
    url: link.slug ? `${base}/s/${link.slug}` : `${base}/s/i/${link.token}`,
  }));

  return (
    <WorkspaceLayout user={user}>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink-900">
              Investor Links
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              Create attributed share links for each investor. Track views, revoke access, and set expiry dates.
            </p>
          </div>
          <Link
            href="/dashboard/investor-links/new"
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
      </div>
    </WorkspaceLayout>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-[11px] uppercase tracking-[0.15em] text-ink-400 font-medium">{label}</p>
      <p className="mt-1.5 text-2xl font-bold tabular-nums text-ink-800">{value}</p>
    </div>
  );
}
