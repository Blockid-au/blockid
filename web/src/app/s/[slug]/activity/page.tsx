import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  CalendarClock,
  Clock,
  Eye,
  Globe2,
  Link2,
  Mail,
  Monitor,
  Smartphone,
  Tablet,
  Users,
} from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import {
  listInvestorLinksForScore,
  listInvestorLinkViewsForScore,
  investorLabel,
  type InvestorLink,
  type InvestorLinkView,
} from "@/lib/investor-links";

export const dynamic = "force-dynamic";

interface ScoreRow {
  id: string;
  company_name: string | null;
  total_score: number;
  created_at: string;
}

interface ViewRow {
  id: string;
  viewer_ip_hash: string | null;
  viewer_ua: string | null;
  referer: string | null;
  viewed_at: string;
}

const DEMO_VIEWS: ViewRow[] = [
  {
    id: "demo-1",
    viewer_ip_hash: "demo-a",
    viewer_ua:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/123",
    referer: "https://mail.google.com",
    viewed_at: new Date(Date.now() - 1000 * 60 * 28).toISOString(),
  },
  {
    id: "demo-2",
    viewer_ip_hash: "demo-b",
    viewer_ua:
      "Mozilla/5.0 (iPhone; CPU iPhone OS) AppleWebKit/605.1.15 Safari/604.1",
    referer: "https://linkedin.com",
    viewed_at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
  },
  {
    id: "demo-3",
    viewer_ip_hash: "demo-a",
    viewer_ua:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/123",
    referer: null,
    viewed_at: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
  },
  {
    id: "demo-4",
    viewer_ip_hash: "demo-c",
    viewer_ua:
      "Mozilla/5.0 (iPad; CPU OS 16_6) AppleWebKit/605.1.15 Safari/604.1",
    referer: "https://twitter.com",
    viewed_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
  },
  {
    id: "demo-5",
    viewer_ip_hash: "demo-b",
    viewer_ua:
      "Mozilla/5.0 (iPhone; CPU iPhone OS) AppleWebKit/605.1.15 Safari/604.1",
    referer: "https://linkedin.com",
    viewed_at: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
  },
];

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

async function fetchScore(slug: string): Promise<ScoreRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("scores")
    .select("id, company_name, total_score, created_at")
    .eq("id", slug)
    .maybeSingle();
  if (error) {
    console.error("[blockid:activity] score fetch failed", error);
    return null;
  }
  return (data as ScoreRow) ?? null;
}

async function fetchViews(slug: string): Promise<ViewRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("score_views")
    .select("id, viewer_ip_hash, viewer_ua, referer, viewed_at")
    .eq("score_id", slug)
    .order("viewed_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[blockid:activity] views fetch failed", error);
    return [];
  }
  return (data as ViewRow[]) ?? [];
}

function countUniqueViewers(views: ViewRow[]): number {
  const ids = new Set(
    views.map((v) => v.viewer_ip_hash).filter((v): v is string => Boolean(v)),
  );
  return ids.size || views.length;
}

function hostFromReferer(referer: string | null): string {
  if (!referer) return "Direct";
  try {
    return new URL(referer).hostname.replace(/^www\./, "");
  } catch {
    return referer.slice(0, 32);
  }
}

function deviceLabel(ua: string | null): { label: string; type: "mobile" | "tablet" | "desktop" | "unknown" } {
  if (!ua) return { label: "Unknown", type: "unknown" };
  if (/iphone|android|mobile/i.test(ua)) return { label: "Mobile", type: "mobile" };
  if (/ipad|tablet/i.test(ua)) return { label: "Tablet", type: "tablet" };
  if (/bot|crawler|spider/i.test(ua)) return { label: "Crawler", type: "unknown" };
  return { label: "Desktop", type: "desktop" };
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Sydney",
  }).format(new Date(iso));
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/** Build a stable numeric label for each unique viewer hash, e.g. "Viewer #1". */
function buildViewerLabels(views: ViewRow[]): Map<string, number> {
  const labels = new Map<string, number>();
  let counter = 0;
  for (const view of views) {
    const hash = view.viewer_ip_hash ?? view.id;
    if (!labels.has(hash)) {
      counter++;
      labels.set(hash, counter);
    }
  }
  return labels;
}

type InvestorLinkStatus = "active" | "expired" | "revoked";

interface InvestorLinkSummary {
  link: InvestorLink;
  totalViews: number;
  uniqueViewers: number;
  latestView: string | null;
  status: InvestorLinkStatus;
}

function summariseInvestorLinks(
  links: InvestorLink[],
  views: InvestorLinkView[],
  now: number,
): InvestorLinkSummary[] {
  const byToken = new Map<string, InvestorLinkView[]>();
  for (const view of views) {
    const arr = byToken.get(view.linkToken) ?? [];
    arr.push(view);
    byToken.set(view.linkToken, arr);
  }
  return links.map((link) => {
    const linkViews = byToken.get(link.token) ?? [];
    const uniques = new Set(
      linkViews.map((v) => v.viewerIpHash).filter((v): v is string => Boolean(v)),
    );
    const status: InvestorLinkStatus = link.revokedAt
      ? "revoked"
      : link.expiresAt && new Date(link.expiresAt).getTime() < now
        ? "expired"
        : "active";
    return {
      link,
      totalViews: linkViews.length,
      uniqueViewers: uniques.size || linkViews.length,
      latestView: linkViews[0]?.viewedAt ?? null,
      status,
    };
  });
}

export default async function ScoreActivityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const isDemo = slug.startsWith("demo-") || !isSupabaseConfigured();
  const score = isDemo ? null : await fetchScore(slug);
  if (!isDemo && !score) notFound();

  const views = isDemo ? DEMO_VIEWS : await fetchViews(slug);
  const investorLinks = isDemo ? [] : await listInvestorLinksForScore(slug);
  const investorViews = isDemo
    ? []
    : await listInvestorLinkViewsForScore(slug);
  const investorSummaries = summariseInvestorLinks(
    investorLinks,
    investorViews,
    new Date().getTime(),
  );
  const totalViews = views.length;
  const uniqueViewerCount = countUniqueViewers(views);
  const latestView = views[0]?.viewed_at ?? null;
  const viewerLabels = buildViewerLabels(views);
  const shareUrl = `${siteUrl()}/s/${slug}`;

  const topReferers = Array.from(
    views.reduce((acc, view) => {
      const host = hostFromReferer(view.referer);
      acc.set(host, (acc.get(host) ?? 0) + 1);
      return acc;
    }, new Map<string, number>()),
  ).sort((a, b) => b[1] - a[1]);

  // Compute device breakdown
  const deviceBreakdown = views.reduce(
    (acc, view) => {
      const d = deviceLabel(view.viewer_ua);
      acc[d.type] = (acc[d.type] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <>
      <Navbar />
      <main id="main" className="flex-1 pt-32 md:pt-40 pb-24">
        <div className="mx-auto max-w-6xl px-6">
          <Link href={`/s/${slug}`} className="inline-flex">
            <Button variant="ghost">
              <ArrowLeft strokeWidth={1.75} className="h-5 w-5" />
              Back to score
            </Button>
          </Link>

          <header className="mt-8 max-w-3xl">
            <p className="text-xs uppercase tracking-[0.2em] text-gold-600 font-medium inline-flex items-center gap-2">
              <BarChart3 strokeWidth={1.75} className="h-4 w-4" />
              Investor Link Activity
            </p>
            <h1 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight text-ink-800">
              {score?.company_name || "Demo company"}
            </h1>
            <p className="mt-4 text-base md:text-lg leading-relaxed text-ink-400">
              Track how the Investor View Link is being opened. IPs are hashed
              daily; BlockID never stores raw viewer IP addresses.
            </p>
          </header>

          {/* ---- Hero stat cards ---- */}
          <section className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="rounded-2xl border border-surface-200 bg-white p-6 text-center shadow-sm">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-ink-900/5">
                <Eye strokeWidth={1.75} className="h-5 w-5 text-ink-700" />
              </div>
              <p className="mt-3 text-3xl font-bold text-ink-900">{totalViews}</p>
              <p className="text-sm text-ink-500 mt-1">Total Views</p>
              <p className="text-xs text-ink-400 mt-0.5">Last 100 opens</p>
            </div>
            <div className="rounded-2xl border border-surface-200 bg-white p-6 text-center shadow-sm">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-600/5">
                <Users strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
              </div>
              <p className="mt-3 text-3xl font-bold text-brand-600">{uniqueViewerCount}</p>
              <p className="text-sm text-ink-500 mt-1">Unique Viewers</p>
              <p className="text-xs text-ink-400 mt-0.5">Daily hashed identity</p>
            </div>
            <div className="rounded-2xl border border-surface-200 bg-white p-6 text-center shadow-sm">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600/5">
                <CalendarClock strokeWidth={1.75} className="h-5 w-5 text-emerald-600" />
              </div>
              <p className="mt-3 text-3xl font-bold text-emerald-600">
                {latestView ? relativeTime(latestView) : "--"}
              </p>
              <p className="text-sm text-ink-500 mt-1">Last Viewed</p>
              <p className="text-xs text-ink-400 mt-0.5">
                {latestView ? formatDate(latestView) : "No views yet"}
              </p>
            </div>
          </section>

          {/* ---- Share link ---- */}
          <section className="rounded-2xl border border-surface-200 bg-white p-5 mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2 text-ink-700">
                <Link2 strokeWidth={1.75} className="h-5 w-5 text-brand-600 shrink-0" />
                <p className="text-sm font-medium">Shareable Link</p>
              </div>
              <div className="flex-1 flex items-center gap-2 rounded-xl border border-surface-200 bg-surface-100/60 px-4 py-2.5">
                <code className="flex-1 text-sm text-ink-500 font-mono truncate select-all">
                  {shareUrl}
                </code>
                <CopyButton text={shareUrl} />
              </div>
            </div>
            <p className="mt-2 text-xs text-ink-400 ml-7">
              Anyone with this link can view the score. View tracking is active -- every open is recorded above.
            </p>
          </section>

          {/* ---- Per-investor links ---- */}
          {investorSummaries.length > 0 && (
            <section className="rounded-2xl border border-surface-200 bg-white p-6 mb-8">
              <h2 className="text-lg font-semibold text-ink-800 inline-flex items-center gap-2">
                <Mail strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
                Per-investor links
              </h2>
              <p className="mt-1 text-sm text-ink-400">
                Each investor gets a unique URL. We attribute every open and
                email you when this specific investor reads the score.
              </p>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.16em] text-ink-8000">
                    <tr>
                      <th className="border-b border-surface-200 pb-3 pr-4">
                        Recipient
                      </th>
                      <th className="border-b border-surface-200 pb-3 pr-4">
                        Sent
                      </th>
                      <th className="border-b border-surface-200 pb-3 pr-4">
                        Opens
                      </th>
                      <th className="border-b border-surface-200 pb-3 pr-4">
                        Unique
                      </th>
                      <th className="border-b border-surface-200 pb-3 pr-4">
                        Latest open
                      </th>
                      <th className="border-b border-surface-200 pb-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {investorSummaries.map(
                      ({ link, totalViews, uniqueViewers, latestView, status }) => {
                        return (
                          <tr key={link.token} className="border-b border-surface-200 last:border-b-0">
                            <td className="py-4 pr-4">
                              <div className="text-ink-700 font-medium">
                                {investorLabel(link)}
                              </div>
                              {link.investorEmail && (
                                <div className="text-xs text-ink-8000">
                                  {link.investorEmail}
                                </div>
                              )}
                            </td>
                            <td className="py-4 pr-4 text-ink-400">
                              {formatDate(link.createdAt)}
                            </td>
                            <td className="py-4 pr-4 font-mono tabular-nums text-brand-600">
                              {totalViews}
                            </td>
                            <td className="py-4 pr-4 font-mono tabular-nums text-ink-500">
                              {uniqueViewers}
                            </td>
                            <td className="py-4 pr-4 text-ink-400">
                              {latestView
                                ? formatDate(latestView)
                                : "Not opened"}
                            </td>
                            <td className="py-4">
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                                  status === "active"
                                    ? "border-brand-500/30 bg-brand-500/10 text-brand-600"
                                    : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                                }`}
                              >
                                {status}
                              </span>
                            </td>
                          </tr>
                        );
                      },
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ---- Activity timeline + sidebar ---- */}
          <section className="grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 space-y-6">
              {/* Activity timeline */}
              <div className="rounded-2xl border border-surface-200 bg-white p-6">
                <h2 className="text-lg font-semibold text-ink-800 inline-flex items-center gap-2">
                  <Clock strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
                  Activity Timeline
                </h2>
                <p className="mt-1 text-sm text-ink-400">
                  Chronological feed of all view events
                </p>
                <div className="mt-5">
                  {views.length === 0 ? (
                    <div className="py-12 text-center">
                      <Eye strokeWidth={1.5} className="h-8 w-8 text-ink-300 mx-auto" />
                      <p className="mt-3 text-sm text-ink-400">
                        No investor views recorded yet.
                      </p>
                      <p className="mt-1 text-xs text-ink-300">
                        Views will appear here once someone opens the share link.
                      </p>
                    </div>
                  ) : (
                    <div className="relative">
                      {/* Timeline line */}
                      <div className="absolute left-[19px] top-2 bottom-2 w-px bg-surface-200" />
                      <ul className="space-y-0">
                        {views.map((view, idx) => {
                          const device = deviceLabel(view.viewer_ua);
                          const viewerNum = viewerLabels.get(
                            view.viewer_ip_hash ?? view.id,
                          );
                          const source = hostFromReferer(view.referer);
                          const isFirst = idx === 0;
                          return (
                            <li
                              key={view.id}
                              className="relative flex items-start gap-4 py-3"
                            >
                              {/* Timeline dot */}
                              <div
                                className={`relative z-10 mt-0.5 flex h-[10px] w-[10px] shrink-0 items-center justify-center rounded-full ring-4 ring-white ${
                                  isFirst
                                    ? "bg-brand-600"
                                    : "bg-surface-300"
                                }`}
                                style={{ marginLeft: "14px" }}
                              />
                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="text-sm font-medium text-ink-700">
                                    Viewer #{viewerNum}
                                  </span>
                                  <span className="text-xs text-ink-400">
                                    {relativeTime(view.viewed_at)}
                                  </span>
                                </div>
                                <p className="mt-0.5 text-sm text-ink-500">
                                  Viewed score
                                  {source !== "Direct" && (
                                    <span className="text-ink-400">
                                      {" "}via {source}
                                    </span>
                                  )}
                                </p>
                                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-100 px-2 py-0.5 text-[11px] text-ink-400">
                                    {device.type === "mobile" && (
                                      <Smartphone strokeWidth={1.75} className="h-3 w-3" />
                                    )}
                                    {device.type === "tablet" && (
                                      <Tablet strokeWidth={1.75} className="h-3 w-3" />
                                    )}
                                    {device.type === "desktop" && (
                                      <Monitor strokeWidth={1.75} className="h-3 w-3" />
                                    )}
                                    {device.label}
                                  </span>
                                  {source !== "Direct" && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-surface-100 px-2 py-0.5 text-[11px] text-ink-400">
                                      <Globe2 strokeWidth={1.75} className="h-3 w-3" />
                                      {source}
                                    </span>
                                  )}
                                  <span className="text-[11px] text-ink-300 font-mono">
                                    {formatDate(view.viewed_at)}
                                  </span>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* Detailed view table (collapsed) */}
              <details className="rounded-2xl border border-surface-200 bg-white">
                <summary className="cursor-pointer p-6 text-lg font-semibold text-ink-800 select-none">
                  Raw view log
                </summary>
                <div className="px-6 pb-6 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="text-xs uppercase tracking-[0.16em] text-ink-8000">
                      <tr>
                        <th className="border-b border-surface-200 pb-3 pr-4">
                          Viewed
                        </th>
                        <th className="border-b border-surface-200 pb-3 pr-4">
                          Source
                        </th>
                        <th className="border-b border-surface-200 pb-3 pr-4">
                          Device
                        </th>
                        <th className="border-b border-surface-200 pb-3">
                          Viewer hash
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {views.map((view) => (
                        <tr key={view.id} className="border-b border-surface-200 last:border-b-0">
                          <td className="py-4 pr-4 text-ink-600">
                            {formatDate(view.viewed_at)}
                          </td>
                          <td className="py-4 pr-4 text-ink-400">
                            {hostFromReferer(view.referer)}
                          </td>
                          <td className="py-4 pr-4 text-ink-400">
                            {deviceLabel(view.viewer_ua).label}
                          </td>
                          <td className="py-4 font-mono text-xs text-ink-8000">
                            {view.viewer_ip_hash
                              ? `${view.viewer_ip_hash.slice(0, 12)}...`
                              : "n/a"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>

            {/* ---- Sidebar ---- */}
            <aside className="lg:col-span-4 space-y-6">
              {/* Top sources */}
              <div className="rounded-2xl border border-surface-200 bg-white p-6">
                <h2 className="text-lg font-semibold text-ink-800 inline-flex items-center gap-2">
                  <Globe2 strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
                  Top Sources
                </h2>
                <ul className="mt-5 space-y-2">
                  {topReferers.length === 0 ? (
                    <li className="text-sm text-ink-8000">
                      Sources appear once investors open the link.
                    </li>
                  ) : (
                    topReferers.map(([host, count]) => {
                      const pct = totalViews > 0 ? Math.round((count / totalViews) * 100) : 0;
                      return (
                        <li key={host}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-ink-600">{host}</span>
                            <span className="font-mono text-sm text-brand-600 tabular-nums">
                              {count}
                              <span className="text-ink-300 text-xs ml-1">({pct}%)</span>
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-surface-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-brand-500/40"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>

              {/* Device breakdown */}
              <div className="rounded-2xl border border-surface-200 bg-white p-6">
                <h2 className="text-lg font-semibold text-ink-800 inline-flex items-center gap-2">
                  <Monitor strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
                  Devices
                </h2>
                <ul className="mt-5 space-y-3">
                  {Object.entries(deviceBreakdown)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, count]) => {
                      const pct = totalViews > 0 ? Math.round((count / totalViews) * 100) : 0;
                      const label =
                        type === "mobile"
                          ? "Mobile"
                          : type === "tablet"
                            ? "Tablet"
                            : type === "desktop"
                              ? "Desktop"
                              : "Other";
                      return (
                        <li key={type} className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm text-ink-600">
                            {type === "mobile" && <Smartphone strokeWidth={1.75} className="h-4 w-4 text-ink-400" />}
                            {type === "tablet" && <Tablet strokeWidth={1.75} className="h-4 w-4 text-ink-400" />}
                            {type === "desktop" && <Monitor strokeWidth={1.75} className="h-4 w-4 text-ink-400" />}
                            {type === "unknown" && <Globe2 strokeWidth={1.75} className="h-4 w-4 text-ink-400" />}
                            {label}
                          </div>
                          <span className="font-mono text-sm tabular-nums text-ink-500">
                            {count} <span className="text-ink-300 text-xs">({pct}%)</span>
                          </span>
                        </li>
                      );
                    })}
                  {Object.keys(deviceBreakdown).length === 0 && (
                    <li className="text-sm text-ink-8000">
                      Device data appears with views.
                    </li>
                  )}
                </ul>
              </div>

              {/* Score summary card */}
              <div className="rounded-2xl border border-surface-200 bg-white p-6">
                <h2 className="text-lg font-semibold text-ink-800">Score</h2>
                <p className="mt-3 text-4xl font-bold text-brand-600 tabular-nums">
                  {score?.total_score ?? 82}
                  <span className="text-lg font-normal text-ink-300">/100</span>
                </p>
                <p className="mt-1 text-xs text-ink-400 font-mono">/{slug}</p>
                <div className="mt-4">
                  <Link href={`/s/${slug}`} className="inline-flex">
                    <Button variant="secondary" className="w-full justify-center text-sm">
                      View full score
                    </Button>
                  </Link>
                </div>
              </div>
            </aside>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}

