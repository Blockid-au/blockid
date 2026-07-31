// /dashboard/admin/content — CMO content pillar tracker.
//
// Reads web/content/linkedin-svi-page-content-pack.json (T0211 content pack),
// surfaces queue + published per-pillar, links to LinkedIn page. Drains as the
// linkedin-page-post cron drains the FIFO. Closes T0203.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import * as fs from "fs";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";

export const metadata: Metadata = { title: "Content Pillar Tracker — BlockID Admin" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Post {
  id: string;
  pillar: string;
  scheduledFor?: string;
  title: string;
  body: string;
  hashtags?: string[];
  cta?: string;
  publishedAt?: string;
  postId?: string;
}

interface Pack {
  _meta: { page: string; cadence: string; domains?: Record<string, string> };
  pageProfile: { name: string; website: string; tagline?: string };
  queue: Post[];
  published?: Post[];
}

const PACK_FILE = "/home/dovanlong/blockid.au/web/content/linkedin-svi-page-content-pack.json";

function loadPack(): Pack | null {
  try { return JSON.parse(fs.readFileSync(PACK_FILE, "utf8")) as Pack; } catch { return null; }
}

const PILLARS_30D_TARGET = 12; // KPI from .claude/goals/30day-validation-mvp.md
const PILLAR_LABELS: Record<string, string> = {
  "worth-question": "What's it worth?",
  "investor-ready": "Investor-ready",
  "svi-launch": "SVI launch",
  "sme-mistakes": "SME mistakes",
  "investor-lens": "Investor lens",
  "cap-table": "Cap table",
  "health-check": "Health check",
  "founder-education": "Founder ed",
  "benchmark": "Benchmark",
};

export default async function ContentTrackerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/admin/content");
  if (user.role !== "admin") redirect("/dashboard");

  const pack = loadPack();
  const queue = pack?.queue ?? [];
  const published = pack?.published ?? [];

  // Per-pillar counts
  const pillarCounts = new Map<string, { queued: number; published: number }>();
  for (const p of queue) {
    const e = pillarCounts.get(p.pillar) ?? { queued: 0, published: 0 };
    e.queued++;
    pillarCounts.set(p.pillar, e);
  }
  for (const p of published) {
    const e = pillarCounts.get(p.pillar) ?? { queued: 0, published: 0 };
    e.published++;
    pillarCounts.set(p.pillar, e);
  }

  const totalPublished = published.length;
  const monthlyPace = Math.round((totalPublished / Math.max(1, PILLARS_30D_TARGET)) * 100);
  const next3 = queue.slice(0, 3);

  const oauthBlocked = !process.env.LINKEDIN_PAGE_ACCESS_TOKEN;

  return (
    <WorkspaceLayout user={user}>
      <div className="max-w-6xl">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-brand-600 font-semibold">CMO · Content Operations</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-800">Content Pillar Tracker</h1>
          <p className="mt-2 text-sm text-ink-500">
            {pack?._meta.page ?? "Startup Value Index"} · cadence: {pack?._meta.cadence ?? "—"} ·
            target: {PILLARS_30D_TARGET} posts / 30 days (30-day KPI).
          </p>
        </header>

        {oauthBlocked && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
            <strong>⚠️ LinkedIn auto-post deferred:</strong> LINKEDIN_PAGE_ACCESS_TOKEN not set in env.
            Run <code className="rounded bg-amber-100 px-1.5 py-0.5">bash web/scripts/linkedin-token-helper.sh</code> to wire OAuth.
            All {queue.length} queued posts ready below.
          </div>
        )}

        <section className="mb-8 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-ink-200 bg-white p-5">
            <p className="text-xs uppercase tracking-wide text-ink-500">Published</p>
            <p className="mt-1 text-2xl font-semibold text-ink-800">{totalPublished}<span className="text-base font-normal text-ink-400"> / {PILLARS_30D_TARGET}</span></p>
            <div className="mt-3 h-1.5 w-full rounded-full bg-ink-100">
              <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${Math.min(100, monthlyPace)}%` }} />
            </div>
          </div>
          <div className="rounded-2xl border border-ink-200 bg-white p-5">
            <p className="text-xs uppercase tracking-wide text-ink-500">In queue</p>
            <p className="mt-1 text-2xl font-semibold text-ink-800">{queue.length}</p>
            <p className="mt-2 text-xs text-ink-500">FIFO drain Mon/Wed/Fri 09:00 AEST.</p>
          </div>
          <div className="rounded-2xl border border-ink-200 bg-white p-5">
            <p className="text-xs uppercase tracking-wide text-ink-500">Pillars covered</p>
            <p className="mt-1 text-2xl font-semibold text-ink-800">{pillarCounts.size}<span className="text-base font-normal text-ink-400"> / 9</span></p>
            <p className="mt-2 text-xs text-ink-500">Rotate evenly for SEO + audience signal.</p>
          </div>
          <div className="rounded-2xl border border-ink-200 bg-white p-5">
            <p className="text-xs uppercase tracking-wide text-ink-500">LinkedIn page</p>
            <a className="mt-1 block text-sm font-semibold text-brand-700 underline" href="https://www.linkedin.com/company/startup-value-index" target="_blank" rel="noopener">linkedin.com/company/startup-value-index</a>
            <p className="mt-2 text-xs text-ink-500">Page ID 129624133 · {pack?.pageProfile.website ?? ""}</p>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-ink-800">Pillar coverage</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {Object.entries(PILLAR_LABELS).map(([key, label]) => {
              const c = pillarCounts.get(key) ?? { queued: 0, published: 0 };
              const total = c.queued + c.published;
              return (
                <div key={key} className="rounded-xl border border-ink-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-wide text-ink-500">{label}</p>
                  <p className="mt-1 text-base font-semibold text-ink-800">{c.published} pub · {c.queued} queue</p>
                  <div className="mt-2 h-1 w-full rounded-full bg-ink-100">
                    <div className="h-1 rounded-full bg-brand-500" style={{ width: `${Math.min(100, total * 12)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-ink-800">Next 3 scheduled</h2>
          <div className="space-y-4">
            {next3.length === 0 && <p className="text-sm text-ink-500">Queue empty — refill via web/content/linkedin-svi-page-content-pack.json.</p>}
            {next3.map(p => (
              <div key={p.id} className="rounded-xl border border-ink-200 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-xs uppercase tracking-wide text-ink-500">{p.id} · {PILLAR_LABELS[p.pillar] ?? p.pillar}</p>
                    <h3 className="mt-1 text-base font-semibold text-ink-800">{p.title}</h3>
                    {p.scheduledFor && <p className="mt-1 text-xs text-ink-400">Scheduled: {new Date(p.scheduledFor).toLocaleString("en-AU", { timeZone: "Australia/Sydney" })} AEST</p>}
                  </div>
                  {p.cta && <a href={p.cta} target="_blank" rel="noopener" className="rounded-md border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">CTA</a>}
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-ink-700">{p.body.slice(0, 400)}{p.body.length > 400 ? "…" : ""}</p>
                {p.hashtags && p.hashtags.length > 0 && (
                  <p className="mt-2 text-xs text-ink-500">{p.hashtags.join(" ")}</p>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-ink-800">Published ({published.length})</h2>
          {published.length === 0 ? (
            <p className="text-sm text-ink-500">Nothing published yet — first post fires once LINKEDIN_PAGE_ACCESS_TOKEN is set.</p>
          ) : (
            <ul className="space-y-2">
              {published.slice(-10).reverse().map(p => (
                <li key={p.id} className="rounded-lg border border-ink-200 bg-white p-3 text-sm">
                  <span className="font-medium text-ink-800">{p.id}</span> · {PILLAR_LABELS[p.pillar] ?? p.pillar} ·
                  <span className="ml-2 text-ink-600">{p.title}</span>
                  {p.publishedAt && <span className="ml-2 text-xs text-ink-400">({p.publishedAt.slice(0, 10)})</span>}
                  {p.postId && <span className="ml-2 text-xs text-ink-400">[{p.postId.slice(-12)}]</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </WorkspaceLayout>
  );
}
