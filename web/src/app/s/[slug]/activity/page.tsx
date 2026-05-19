import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  CalendarClock,
  Eye,
  Globe2,
  Mail,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Button } from "@/components/ui/button";
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
];

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

function uniqueViewers(views: ViewRow[]): number {
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

function deviceLabel(ua: string | null): string {
  if (!ua) return "Unknown device";
  if (/iphone|android|mobile/i.test(ua)) return "Mobile";
  if (/ipad|tablet/i.test(ua)) return "Tablet";
  if (/bot|crawler|spider/i.test(ua)) return "Crawler";
  return "Desktop";
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Sydney",
  }).format(new Date(iso));
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
  // Compute "now" once per render; the summary helper uses it to derive
  // expired/active status without any impure calls during JSX evaluation.
  const investorSummaries = summariseInvestorLinks(
    investorLinks,
    investorViews,
    new Date().getTime(),
  );
  const latestView = views[0]?.viewed_at ?? null;
  const topReferers = Array.from(
    views.reduce((acc, view) => {
      const host = hostFromReferer(view.referer);
      acc.set(host, (acc.get(host) ?? 0) + 1);
      return acc;
    }, new Map<string, number>()),
  ).sort((a, b) => b[1] - a[1]);

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

          <section className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Metric
              icon={Eye}
              label="Total views"
              value={String(views.length)}
              detail="Last 100 opens"
            />
            <Metric
              icon={Users}
              label="Unique viewers"
              value={String(uniqueViewers(views))}
              detail="Daily hashed identity"
            />
            <Metric
              icon={CalendarClock}
              label="Latest open"
              value={latestView ? formatDate(latestView) : "No views yet"}
              detail="Sydney time"
            />
            <Metric
              icon={Globe2}
              label="Score"
              value={`${score?.total_score ?? 82}/100`}
              detail={`/${slug}`}
            />
          </section>

          {investorSummaries.length > 0 && (
            <section className="mt-8 rounded-2xl border border-surface-200 bg-white p-6">
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
                          <tr key={link.token} className="border-b border-surface-200">
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

          <section className="mt-8 grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 rounded-2xl border border-surface-200 bg-white p-6">
              <h2 className="text-lg font-semibold text-ink-800">
                Recent views
              </h2>
              <div className="mt-5 overflow-x-auto">
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
                    {views.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="py-8 text-center text-ink-8000"
                        >
                          No investor views recorded yet.
                        </td>
                      </tr>
                    ) : (
                      views.map((view) => (
                        <tr key={view.id} className="border-b border-surface-200">
                          <td className="py-4 pr-4 text-ink-600">
                            {formatDate(view.viewed_at)}
                          </td>
                          <td className="py-4 pr-4 text-ink-400">
                            {hostFromReferer(view.referer)}
                          </td>
                          <td className="py-4 pr-4 text-ink-400">
                            {deviceLabel(view.viewer_ua)}
                          </td>
                          <td className="py-4 font-mono text-xs text-ink-8000">
                            {view.viewer_ip_hash
                              ? `${view.viewer_ip_hash.slice(0, 12)}...`
                              : "n/a"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="lg:col-span-4 rounded-2xl border border-surface-200 bg-white p-6">
              <h2 className="text-lg font-semibold text-ink-800">
                Top sources
              </h2>
              <ul className="mt-5 space-y-3">
                {topReferers.length === 0 ? (
                  <li className="text-sm text-ink-8000">
                    Sources appear once investors open the link.
                  </li>
                ) : (
                  topReferers.map(([host, count]) => (
                    <li
                      key={host}
                      className="flex items-center justify-between rounded-xl border border-surface-200 bg-surface-100/40 px-4 py-3"
                    >
                      <span className="text-sm text-ink-500">{host}</span>
                      <span className="font-mono text-sm text-brand-600">
                        {count}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </aside>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-surface-200 bg-white p-5">
      <div className="flex items-center gap-2 text-brand-600">
        <Icon strokeWidth={1.75} className="h-4 w-4" />
        <p className="text-xs uppercase tracking-[0.16em]">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-semibold text-ink-800">{value}</p>
      <p className="mt-1 text-xs text-ink-8000">{detail}</p>
    </div>
  );
}
