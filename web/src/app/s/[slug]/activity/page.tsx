import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  CalendarClock,
  Clock,
  Eye,
  Flame,
  Globe2,
  Link2,
  Mail,
  Monitor,
  Smartphone,
  Tablet,
  Thermometer,
  Users,
} from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import {
  listInvestorLinksForScore,
  listInvestorLinkViewsForScore,
  investorLabel,
  type InvestorLink,
  type InvestorLinkView,
} from "@/lib/investor-links";

export const metadata: Metadata = {
  title: "Score Activity",
  description: "Track investor engagement with your shared score link on BlockID.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface ScoreRow {
  id: string;
  email: string;
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
  time_spent_seconds: number | null;
  scroll_depth_pct: number | null;
  device_type: string | null;
  sections_viewed: string[] | null;
}

interface HeatRow {
  id: string;
  slug: string;
  viewer_hash: string;
  heat_score: number;
  total_views: number;
  total_time_seconds: number;
  last_viewed_at: string;
  created_at: string;
}

const DEMO_VIEWS: ViewRow[] = [
  {
    id: "demo-1",
    viewer_ip_hash: "demo-a",
    viewer_ua:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/123",
    referer: "https://mail.google.com",
    viewed_at: new Date(Date.now() - 1000 * 60 * 28).toISOString(),
    time_spent_seconds: 245,
    scroll_depth_pct: 92,
    device_type: "desktop",
    sections_viewed: ["score-hero", "dimension-overview", "strengths-gaps"],
  },
  {
    id: "demo-2",
    viewer_ip_hash: "demo-b",
    viewer_ua:
      "Mozilla/5.0 (iPhone; CPU iPhone OS) AppleWebKit/605.1.15 Safari/604.1",
    referer: "https://linkedin.com",
    viewed_at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    time_spent_seconds: 120,
    scroll_depth_pct: 65,
    device_type: "mobile",
    sections_viewed: ["score-hero", "quick-summary"],
  },
  {
    id: "demo-3",
    viewer_ip_hash: "demo-a",
    viewer_ua:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/123",
    referer: null,
    viewed_at: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
    time_spent_seconds: 180,
    scroll_depth_pct: 88,
    device_type: "desktop",
    sections_viewed: ["score-hero", "dimension-overview"],
  },
  {
    id: "demo-4",
    viewer_ip_hash: "demo-c",
    viewer_ua:
      "Mozilla/5.0 (iPad; CPU OS 16_6) AppleWebKit/605.1.15 Safari/604.1",
    referer: "https://twitter.com",
    viewed_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    time_spent_seconds: 30,
    scroll_depth_pct: 25,
    device_type: "tablet",
    sections_viewed: ["score-hero"],
  },
  {
    id: "demo-5",
    viewer_ip_hash: "demo-b",
    viewer_ua:
      "Mozilla/5.0 (iPhone; CPU iPhone OS) AppleWebKit/605.1.15 Safari/604.1",
    referer: "https://linkedin.com",
    viewed_at: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    time_spent_seconds: 90,
    scroll_depth_pct: 50,
    device_type: "mobile",
    sections_viewed: ["score-hero"],
  },
];

const DEMO_HEAT: HeatRow[] = [
  {
    id: "heat-1",
    slug: "demo",
    viewer_hash: "demo-a",
    heat_score: 78,
    total_views: 4,
    total_time_seconds: 425,
    last_viewed_at: new Date(Date.now() - 1000 * 60 * 28).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
  },
  {
    id: "heat-2",
    slug: "demo",
    viewer_hash: "demo-b",
    heat_score: 52,
    total_views: 3,
    total_time_seconds: 210,
    last_viewed_at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
  },
  {
    id: "heat-3",
    slug: "demo",
    viewer_hash: "demo-c",
    heat_score: 22,
    total_views: 1,
    total_time_seconds: 30,
    last_viewed_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
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
    .select("id, email, company_name, total_score, created_at")
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
    .select("id, viewer_ip_hash, viewer_ua, referer, viewed_at, time_spent_seconds, scroll_depth_pct, device_type, sections_viewed")
    .eq("score_id", slug)
    .order("viewed_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[blockid:activity] views fetch failed", error);
    return [];
  }
  return (data as ViewRow[]) ?? [];
}

async function fetchHeatScores(slug: string): Promise<HeatRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("investor_heat")
    .select("*")
    .eq("slug", slug)
    .order("heat_score", { ascending: false })
    .limit(50);
  if (error) {
    console.error("[blockid:activity] heat fetch failed", error);
    return [];
  }
  return (data as HeatRow[]) ?? [];
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

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
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

function heatLevel(score: number): { label: string; color: string; bgColor: string } {
  if (score >= 60) return { label: "Hot", color: "text-emerald-700", bgColor: "bg-emerald-100 border-emerald-200" };
  if (score >= 40) return { label: "Warm", color: "text-amber-700", bgColor: "bg-amber-100 border-amber-200" };
  return { label: "Cold", color: "text-slate-600", bgColor: "bg-slate-100 border-slate-200" };
}

function heatBarColor(score: number): string {
  if (score >= 60) return "bg-emerald-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-slate-400";
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

// ── Views by day (last 30 days) for chart ────────────────────────────────────
function viewsByDay(views: ViewRow[]): { date: string; count: number }[] {
  const now = new Date();
  const days: { date: string; count: number }[] = [];
  const countMap = new Map<string, number>();

  for (const v of views) {
    const d = v.viewed_at.slice(0, 10);
    countMap.set(d, (countMap.get(d) ?? 0) + 1);
  }

  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, count: countMap.get(key) ?? 0 });
  }

  return days;
}

export default async function ScoreActivityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const isDemo = slug.startsWith("demo-") || !isSupabaseConfigured();

  // Auth check: only the founder (or admin) can see the activity page
  if (!isDemo) {
    const user = await getCurrentUser();
    if (!user) {
      redirect(`/auth/login?next=/s/${slug}/activity`);
    }

    const score = await fetchScore(slug);
    if (!score) notFound();

    // Check ownership: the logged-in user must be the score owner or an admin
    if (user.role !== "admin" && user.email.toLowerCase() !== score.email.toLowerCase()) {
      notFound();
    }
  }

  const score = isDemo ? null : await fetchScore(slug);
  if (!isDemo && !score) notFound();

  const views = isDemo ? DEMO_VIEWS : await fetchViews(slug);
  const heatScores = isDemo ? DEMO_HEAT : await fetchHeatScores(slug);
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
  const dailyViews = viewsByDay(views);
  const maxDailyViews = Math.max(1, ...dailyViews.map((d) => d.count));

  // Hot investors count
  const hotInvestors = heatScores.filter((h) => h.heat_score >= 60).length;
  const warmInvestors = heatScores.filter((h) => h.heat_score >= 40 && h.heat_score < 60).length;

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
      const d = view.device_type || deviceLabel(view.viewer_ua).type;
      acc[d] = (acc[d] ?? 0) + 1;
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
          <section className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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
                <Flame strokeWidth={1.75} className="h-5 w-5 text-emerald-600" />
              </div>
              <p className="mt-3 text-3xl font-bold text-emerald-600">{hotInvestors}</p>
              <p className="text-sm text-ink-500 mt-1">Hot Investors</p>
              <p className="text-xs text-ink-400 mt-0.5">{warmInvestors} warm, {heatScores.length - hotInvestors - warmInvestors} cold</p>
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

          {/* ---- Investor Heat Map ---- */}
          {heatScores.length > 0 && (
            <section className="rounded-2xl border border-surface-200 bg-white p-6 mb-8">
              <h2 className="text-lg font-semibold text-ink-800 inline-flex items-center gap-2">
                <Thermometer strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
                Investor Heat Map
              </h2>
              <p className="mt-1 text-sm text-ink-400">
                Ranked by engagement level. Higher heat = more interested investor.
              </p>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.16em] text-ink-8000">
                    <tr>
                      <th className="border-b border-surface-200 pb-3 pr-4">Viewer</th>
                      <th className="border-b border-surface-200 pb-3 pr-4">Heat</th>
                      <th className="border-b border-surface-200 pb-3 pr-4">Score</th>
                      <th className="border-b border-surface-200 pb-3 pr-4">Views</th>
                      <th className="border-b border-surface-200 pb-3 pr-4">Time Spent</th>
                      <th className="border-b border-surface-200 pb-3 pr-4">Last Seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {heatScores.map((heat, idx) => {
                      const level = heatLevel(heat.heat_score);
                      return (
                        <tr
                          key={heat.id}
                          className={`border-b border-surface-200 last:border-b-0 ${
                            heat.heat_score >= 60 ? "bg-emerald-50/50" : ""
                          }`}
                        >
                          <td className="py-4 pr-4">
                            <span className="text-ink-700 font-medium">
                              Viewer #{idx + 1}
                            </span>
                            <span className="text-xs text-ink-300 font-mono ml-2">
                              {heat.viewer_hash.slice(0, 8)}...
                            </span>
                          </td>
                          <td className="py-4 pr-4">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${level.bgColor} ${level.color}`}>
                              {heat.heat_score >= 60 && <Flame strokeWidth={2} className="h-3 w-3" />}
                              {level.label}
                            </span>
                          </td>
                          <td className="py-4 pr-4">
                            <div className="flex items-center gap-2">
                              <span className="font-mono tabular-nums text-ink-700 font-semibold">
                                {heat.heat_score}
                              </span>
                              <div className="w-16 h-1.5 rounded-full bg-surface-200 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${heatBarColor(heat.heat_score)}`}
                                  style={{ width: `${heat.heat_score}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-4 pr-4 font-mono tabular-nums text-brand-600">
                            {heat.total_views}
                          </td>
                          <td className="py-4 pr-4 text-ink-500">
                            {formatDuration(heat.total_time_seconds)}
                          </td>
                          <td className="py-4 text-ink-400">
                            {relativeTime(heat.last_viewed_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ---- Views over time (last 30 days) ---- */}
          <section className="rounded-2xl border border-surface-200 bg-white p-6 mb-8">
            <h2 className="text-lg font-semibold text-ink-800 inline-flex items-center gap-2">
              <BarChart3 strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
              Views Over Time
            </h2>
            <p className="mt-1 text-sm text-ink-400">Last 30 days</p>
            <div className="mt-5">
              {totalViews === 0 ? (
                <div className="py-12 text-center">
                  <Eye strokeWidth={1.5} className="h-8 w-8 text-ink-300 mx-auto" />
                  <p className="mt-3 text-sm text-ink-400">
                    No views in the last 30 days.
                  </p>
                </div>
              ) : (
                <div className="flex items-end gap-[2px] h-24">
                  {dailyViews.map((day) => {
                    const heightPct = maxDailyViews > 0
                      ? Math.max(2, (day.count / maxDailyViews) * 100)
                      : 2;
                    return (
                      <div
                        key={day.date}
                        className="flex-1 group relative"
                        title={`${day.date}: ${day.count} views`}
                      >
                        <div
                          className={`w-full rounded-t-sm transition-colors ${
                            day.count > 0 ? "bg-brand-500 hover:bg-brand-600" : "bg-surface-200"
                          }`}
                          style={{ height: `${heightPct}%` }}
                        />
                        <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-ink-900 text-white text-[10px] rounded whitespace-nowrap z-10">
                          {day.date}: {day.count}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex justify-between mt-2 text-[10px] text-ink-300 font-mono">
                <span>{dailyViews[0]?.date}</span>
                <span>{dailyViews[dailyViews.length - 1]?.date}</span>
              </div>
            </div>
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
                      ({ link, totalViews: tv, uniqueViewers, latestView: lv, status }) => {
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
                              {tv}
                            </td>
                            <td className="py-4 pr-4 font-mono tabular-nums text-ink-500">
                              {uniqueViewers}
                            </td>
                            <td className="py-4 pr-4 text-ink-400">
                              {lv
                                ? formatDate(lv)
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
                          const device = view.device_type || deviceLabel(view.viewer_ua).type;
                          const deviceLbl = device === "mobile" ? "Mobile" : device === "tablet" ? "Tablet" : device === "desktop" ? "Desktop" : "Unknown";
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
                                  {view.time_spent_seconds && view.time_spent_seconds > 0 && (
                                    <span className="text-ink-400">
                                      {" "}for {formatDuration(view.time_spent_seconds)}
                                    </span>
                                  )}
                                  {source !== "Direct" && (
                                    <span className="text-ink-400">
                                      {" "}via {source}
                                    </span>
                                  )}
                                </p>
                                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-100 px-2 py-0.5 text-[11px] text-ink-400">
                                    {device === "mobile" && (
                                      <Smartphone strokeWidth={1.75} className="h-3 w-3" />
                                    )}
                                    {device === "tablet" && (
                                      <Tablet strokeWidth={1.75} className="h-3 w-3" />
                                    )}
                                    {device === "desktop" && (
                                      <Monitor strokeWidth={1.75} className="h-3 w-3" />
                                    )}
                                    {deviceLbl}
                                  </span>
                                  {source !== "Direct" && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-surface-100 px-2 py-0.5 text-[11px] text-ink-400">
                                      <Globe2 strokeWidth={1.75} className="h-3 w-3" />
                                      {source}
                                    </span>
                                  )}
                                  {view.scroll_depth_pct != null && view.scroll_depth_pct > 0 && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-surface-100 px-2 py-0.5 text-[11px] text-ink-400">
                                      {view.scroll_depth_pct}% scroll
                                    </span>
                                  )}
                                  {view.sections_viewed && view.sections_viewed.length > 0 && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-surface-100 px-2 py-0.5 text-[11px] text-ink-400">
                                      {view.sections_viewed.length} sections
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
                        <th className="border-b border-surface-200 pb-3 pr-4">
                          Time
                        </th>
                        <th className="border-b border-surface-200 pb-3 pr-4">
                          Scroll
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
                            {view.device_type || deviceLabel(view.viewer_ua).label}
                          </td>
                          <td className="py-4 pr-4 font-mono tabular-nums text-ink-500">
                            {view.time_spent_seconds ? formatDuration(view.time_spent_seconds) : "--"}
                          </td>
                          <td className="py-4 pr-4 font-mono tabular-nums text-ink-500">
                            {view.scroll_depth_pct != null ? `${view.scroll_depth_pct}%` : "--"}
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
