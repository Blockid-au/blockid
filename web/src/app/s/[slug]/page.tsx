import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  FileText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Footer } from "@/components/site/footer";
import { Button } from "@/components/ui/button";
import { ViewTracker } from "@/components/tracking/view-tracker";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { hashIp, clientIpFromHeaders } from "@/lib/iphash";
import {
  SVI_STAGE_LABELS,
  SVI_BENCHMARKS,
  type SVIAnalysis,
  type SVISubScore,
} from "@/lib/svi-analysis";

export const dynamic = "force-dynamic";

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface ScoreRow {
  id: string;
  email: string;
  company_name: string | null;
  total_score: number;
  sub_scores: Record<string, number>;
  inputs: Record<string, unknown>;
  score_version?: string | null;
  confidence_score?: number | null;
  missing_inputs?: string[] | null;
  action_plan?: Array<{
    title: string;
    detail: string;
    impact: "high" | "medium" | "low";
  }> | null;
  benchmark?: {
    label: string;
    medianScore: number;
    band: string;
    rationale: string;
  } | null;
  created_at: string;
}

interface SviRow {
  id: string;
  total_svi: number;
  analysis_json: SVIAnalysis;
  created_at: string;
}

/* ── Demo data ─────────────────────────────────────────────────────────────── */

const DEMO_SUBS: SVISubScore[] = [
  { label: "Founder & Team Value", key: "ftv", value: 78, adjustment: 4, rationale: "", evidence: ["Co-founder team", "Experienced founder"], gaps: ["Add named advisors"] },
  { label: "Market & Problem Clarity", key: "mpc", value: 72, adjustment: 4, rationale: "", evidence: ["Clear problem statement", "Medium addressable market"], gaps: ["Add customer validation"] },
  { label: "Product & Technical Depth", key: "ptd", value: 68, adjustment: 2, rationale: "", evidence: ["Demo available", "Website present"], gaps: ["Link GitHub repository"] },
  { label: "Traction & Revenue", key: "tre", value: 55, adjustment: 1, rationale: "", evidence: ["Early revenue traction"], gaps: ["Scale to $100k ARR"] },
  { label: "Cap Table & Governance", key: "cgh", value: 65, adjustment: 2, rationale: "", evidence: ["Cap table referenced", "Vesting schedule"], gaps: ["Create shareholders agreement"] },
  { label: "Investor Readiness", key: "iri", value: 48, adjustment: -0.2, rationale: "", evidence: ["Raise target mentioned"], gaps: ["Upload pitch deck", "Add financial model"] },
  { label: "Legal & Compliance", key: "lco", value: 60, adjustment: 1, rationale: "", evidence: ["ABN registered"], gaps: ["File trademark", "Draft ToS"] },
  { label: "Strategic Vision & Moat", key: "svm", value: 45, adjustment: -0.3, rationale: "", evidence: [], gaps: ["Articulate defensible advantage"] },
];

const DEMO_ANALYSIS: SVIAnalysis = {
  version: "2.0.0",
  totalSVI: 112,
  baselineSVI: 100,
  netAdjustment: 12,
  confidenceMultiplier: 0.5,
  subs: DEMO_SUBS,
  riskPenalties: [],
  evidenceGaps: [],
  nextActions: [],
  signals: {} as SVIAnalysis["signals"],
  summary: "This is a seed-stage SaaS company with a co-founder team, early revenue traction, and a clear problem statement. The cap table and governance foundations are in place. Key areas to strengthen include investor readiness materials (pitch deck, financial model) and articulating a clearer competitive moat.",
  stage: 2,
  stageLabel: "MVP / Prototype",
  stageBonus: 5,
  percentileRank: 50,
};

/* ── Helpers ───────────────────────────────────────────────────────────────── */

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
    .select("*")
    .eq("id", slug)
    .maybeSingle();
  if (error) {
    console.error("[blockid:s] supabase fetch failed", error);
    return null;
  }
  return (data as ScoreRow) ?? null;
}

async function fetchSviAnalysis(email: string): Promise<SviRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("svi_analyses")
    .select("id, total_svi, analysis_json, created_at")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[blockid:s] svi_analyses fetch failed", error);
    return null;
  }
  return (data as SviRow) ?? null;
}

async function fetchEvidenceCount(email: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;
  // Look up the svi_account for this email
  const { data: account } = await supabase
    .from("svi_accounts")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (!account) return 0;
  const { count, error } = await supabase
    .from("svi_evidence")
    .select("id", { count: "exact", head: true })
    .eq("account_id", account.id);
  if (error) return 0;
  return count ?? 0;
}

async function recordView(slug: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const h = await headers();
  const ip = clientIpFromHeaders(h);
  const { error } = await supabase.from("score_views").insert({
    score_id: slug,
    viewer_ip_hash: hashIp(ip),
    viewer_ua: h.get("user-agent")?.slice(0, 512) ?? null,
    referer: h.get("referer")?.slice(0, 512) ?? null,
  });
  if (error) {
    console.error("[blockid:s] view insert failed", error);
  }

  // Also upsert investor_heat total_views
  const viewerHash = hashIp(ip);
  if (viewerHash) {
    const { data: existing } = await supabase
      .from("investor_heat")
      .select("id, total_views")
      .eq("slug", slug)
      .eq("viewer_hash", viewerHash)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("investor_heat")
        .update({
          total_views: existing.total_views + 1,
          last_viewed_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("investor_heat").insert({
        slug,
        viewer_hash: viewerHash,
        heat_score: 15, // first view = 15 points
        total_views: 1,
        total_time_seconds: 0,
      }).then(({ error: insertErr }) => {
        // Ignore unique constraint race
        if (insertErr && insertErr.code !== "23505") {
          console.error("[blockid:s] investor_heat insert failed", insertErr);
        }
      });
    }
  }
}

function scoreColor(score: number): string {
  if (score >= 140) return "text-emerald-600";
  if (score >= 110) return "text-brand-600";
  if (score >= 80) return "text-amber-600";
  return "text-red-500";
}

function scoreBgColor(score: number): string {
  if (score >= 140) return "bg-emerald-600";
  if (score >= 110) return "bg-brand-600";
  if (score >= 80) return "bg-amber-500";
  return "bg-red-500";
}

function barColor(value: number): string {
  if (value >= 75) return "bg-emerald-500";
  if (value >= 55) return "bg-brand-500";
  if (value >= 35) return "bg-amber-500";
  return "bg-red-400";
}

function percentileLabel(percentile: number, stage: number): string {
  const stageLabel = SVI_STAGE_LABELS[stage] ?? "Concept";
  if (percentile >= 90) return `Top 10% of ${stageLabel} startups`;
  if (percentile >= 75) return `Top 25% of ${stageLabel} startups`;
  if (percentile >= 50) return `Top 50% of ${stageLabel} startups`;
  if (percentile >= 25) return `Top 75% of ${stageLabel} startups`;
  return `Within ${stageLabel} cohort`;
}

/* ── Metadata ──────────────────────────────────────────────────────────────── */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  let title = "Startup Value Report — BlockID";
  let description =
    "A Startup Value Index report generated by BlockID — eight dimensions of startup readiness, scored and benchmarked.";

  let ogImageUrl = `${siteUrl()}/api/og/svi?svi=112&stage=2&name=${encodeURIComponent("My Startup")}`;

  if (slug.startsWith("demo-") || !isSupabaseConfigured()) {
    title = `Startup Value Report · SVI 112 — Demo (BlockID)`;
  } else {
    const score = await fetchScore(slug);
    if (score) {
      const co = score.company_name || "Company";
      const svi = await fetchSviAnalysis(score.email);
      const sviScore = svi?.total_svi ?? score.total_score;
      const stageValue = svi?.analysis_json?.stage ?? 0;
      const startupName = score.company_name ?? "My Startup";
      title = `${co} · Startup Value Report — BlockID`;
      description = `${co} scored SVI ${sviScore} across 8 dimensions. Generated by BlockID.au — AI-powered startup intelligence.`;
      ogImageUrl = `${siteUrl()}/api/og/svi?svi=${sviScore}&stage=${stageValue}&name=${encodeURIComponent(startupName)}`;
    }
  }

  const url = `${siteUrl()}/s/${slug}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: "BlockID",
      type: "website",
      images: [ogImageUrl],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
    robots: { index: false, follow: false },
  };
}

/* ── Page ───────────────────────────────────────────────────────────────────── */

export default async function ShareScorePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const isDemo = slug.startsWith("demo-") || !isSupabaseConfigured();
  let row: ScoreRow | null = null;
  let analysis: SVIAnalysis = DEMO_ANALYSIS;
  let evidenceCount = 5;

  if (!isDemo) {
    // Try svi_analyses first (SVI API stores slug here), then scores table
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data: sviRow } = await supabase
        .from("svi_analyses")
        .select("id, email, total_svi, analysis_json, created_at")
        .eq("id", slug)
        .maybeSingle();

      if (sviRow) {
        // Found in svi_analyses — build row from it
        row = {
          id: sviRow.id,
          email: sviRow.email,
          company_name: null,
          total_score: sviRow.total_svi,
          sub_scores: null,
          inputs: null,
          score_version: "svi",
          created_at: sviRow.created_at,
        } as unknown as ScoreRow;
        if (sviRow.analysis_json) {
          analysis = sviRow.analysis_json;
        }
      }
    }

    // Fallback to scores table
    if (!row) {
      row = await fetchScore(slug);
    }

    if (!row) notFound();
    await recordView(slug);

    // Fetch the full SVI analysis if not already loaded
    if (analysis === DEMO_ANALYSIS && row.email) {
      const svi = await fetchSviAnalysis(row.email);
      if (svi?.analysis_json) {
        analysis = svi.analysis_json;
      }
    }
    evidenceCount = await fetchEvidenceCount(row.email);
  }

  const companyName = row?.company_name || "Acme Co Pty Ltd";
  const totalSVI = analysis.totalSVI;
  const stage = analysis.stage;
  const stageLabel = analysis.stageLabel || SVI_STAGE_LABELS[stage] || "Concept";
  const confidencePercent = Math.round((analysis.confidenceMultiplier ?? 0.5) * 100);
  const percentile = analysis.percentileRank ?? 50;
  const dimensions = analysis.subs?.length ? analysis.subs : DEMO_SUBS;
  const summary = analysis.summary || DEMO_ANALYSIS.summary;
  const createdAt = row?.created_at || new Date().toISOString();

  // Top 3 strengths (highest value dimensions with evidence)
  const sortedByValue = [...dimensions].sort((a, b) => b.value - a.value);
  const strengths = sortedByValue
    .filter((d) => d.evidence.length > 0)
    .slice(0, 3);

  // Top 3 gaps (lowest value dimensions with gaps)
  const sortedByGap = [...dimensions].sort((a, b) => a.value - b.value);
  const gaps = sortedByGap
    .filter((d) => d.gaps.length > 0)
    .slice(0, 3);

  // Section IDs for tracking
  const sectionIds = [
    "score-hero",
    "quick-summary",
    "dimension-overview",
    "strengths-gaps",
    "cta-section",
  ];

  return (
    <>
      {/* ── Minimal header (not the full navbar — investors don't need site nav) ── */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-surface-200/60">
        <div className="mx-auto max-w-5xl px-6 py-3 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 cursor-pointer"
            aria-label="BlockID home"
          >
            <Image
              src="/images/logo-icon-transparent.png"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 shrink-0"
            />
            <span className="font-extrabold tracking-tight text-lg text-ink-900">
              BlockID<span className="text-brand-500">.au</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-ink-400">
              <ShieldCheck strokeWidth={1.75} className="h-3.5 w-3.5 text-brand-500" />
              Startup Value Report
            </span>
            <span className="text-xs font-mono tabular-nums text-ink-300">
              {createdAt.slice(0, 10)}
            </span>
          </div>
        </div>
      </header>

      <main id="main" className="flex-1 pt-20 pb-24 bg-gradient-to-b from-surface-50 to-white">
        <div className="mx-auto max-w-5xl px-6">
          {isDemo && (
            <div className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
              Demo mode — this page renders sample data. Set{" "}
              <code className="font-mono text-xs">SUPABASE_URL</code> and{" "}
              <code className="font-mono text-xs">SUPABASE_SERVICE_ROLE_KEY</code>{" "}
              to display real scores.
            </div>
          )}

          {/* ── Score Hero ────────────────────────────────────────────────── */}
          <section id="score-hero" data-section className="mt-4">
            <div className="rounded-2xl border border-surface-200 bg-white p-8 md:p-10 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">
                {/* Left: company + score */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs uppercase tracking-[0.2em] text-brand-500 font-semibold inline-flex items-center gap-1.5">
                    <ShieldCheck strokeWidth={1.75} className="h-3.5 w-3.5" />
                    Startup Value Report
                  </p>
                  <h1 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight text-ink-900 truncate">
                    {companyName}
                  </h1>
                  <p className="mt-2 text-sm text-ink-400">
                    Report generated{" "}
                    <span className="font-mono tabular-nums">{createdAt.slice(0, 10)}</span>
                    {" "}by BlockID.au
                  </p>
                </div>

                {/* Right: big score */}
                <div className="flex flex-col items-center md:items-end shrink-0">
                  <div className="flex items-end gap-1">
                    <span className={`font-mono tabular-nums text-6xl md:text-7xl font-bold tracking-tight leading-none ${scoreColor(totalSVI)}`}>
                      {totalSVI}
                    </span>
                  </div>
                  <p className="mt-1 text-xs uppercase tracking-[0.15em] text-ink-400 font-medium">
                    Startup Value Index
                  </p>
                </div>
              </div>

              {/* Stat row */}
              <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatPill label="Stage" value={`${stageLabel}`} detail={`Stage ${stage + 1} of 8`} />
                <StatPill label="Confidence" value={`${confidencePercent}%`} detail="Evidence quality" />
                <StatPill
                  label="Percentile"
                  value={percentile >= 75 ? `Top ${100 - percentile}%` : `${percentile}th`}
                  detail={percentileLabel(percentile, stage)}
                />
                <StatPill
                  label="Dimensions"
                  value={`${dimensions.length}`}
                  detail={`${evidenceCount} evidence items`}
                />
              </div>
            </div>
          </section>

          {/* ── Quick Summary ─────────────────────────────────────────────── */}
          <section id="quick-summary" data-section className="mt-6">
            <div className="rounded-2xl border border-surface-200 bg-white p-6 md:p-8 shadow-sm">
              <h2 className="text-lg font-semibold text-ink-800 inline-flex items-center gap-2">
                <FileText strokeWidth={1.75} className="h-5 w-5 text-brand-500" />
                Executive Summary
              </h2>
              <p className="mt-4 text-sm md:text-base leading-relaxed text-ink-600">
                {summary}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-100 px-3 py-1 text-xs font-medium text-ink-500">
                  <BarChart3 strokeWidth={1.75} className="h-3.5 w-3.5" />
                  {dimensions.length} dimensions scored
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-100 px-3 py-1 text-xs font-medium text-ink-500">
                  <Sparkles strokeWidth={1.75} className="h-3.5 w-3.5" />
                  {evidenceCount} evidence items
                </span>
              </div>
            </div>
          </section>

          {/* ── Dimension Overview ────────────────────────────────────────── */}
          <section id="dimension-overview" data-section className="mt-6">
            <div className="rounded-2xl border border-surface-200 bg-white p-6 md:p-8 shadow-sm">
              <h2 className="text-lg font-semibold text-ink-800 inline-flex items-center gap-2">
                <BarChart3 strokeWidth={1.75} className="h-5 w-5 text-brand-500" />
                Dimension Scores
              </h2>
              <p className="mt-1 text-sm text-ink-400">
                Eight dimensions of startup readiness, each scored 0-100
              </p>
              <div className="mt-6 space-y-4">
                {dimensions.map((dim) => (
                  <div key={dim.key}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-ink-700">{dim.label}</span>
                      <span className={`text-sm font-mono font-semibold tabular-nums ${
                        dim.value >= 70 ? "text-emerald-600" : dim.value >= 50 ? "text-brand-600" : "text-amber-600"
                      }`}>
                        {dim.value}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-surface-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${barColor(dim.value)}`}
                        style={{ width: `${Math.max(2, Math.min(100, dim.value))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Strengths & Gaps ──────────────────────────────────────────── */}
          <section id="strengths-gaps" data-section className="mt-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Strengths */}
              <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/30 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-ink-800 inline-flex items-center gap-2">
                  <CheckCircle2 strokeWidth={1.75} className="h-5 w-5 text-emerald-600" />
                  Key Strengths
                </h2>
                <ul className="mt-4 space-y-3">
                  {strengths.map((dim) => (
                    <li key={dim.key} className="flex items-start gap-3">
                      <CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-ink-700">{dim.label}</p>
                        <p className="text-xs text-ink-400 mt-0.5">
                          Score: {dim.value}/100 — {dim.evidence[0] || "Strong performance"}
                        </p>
                      </div>
                    </li>
                  ))}
                  {strengths.length === 0 && (
                    <li className="text-sm text-ink-400">Strengths will appear as evidence is added.</li>
                  )}
                </ul>
              </div>

              {/* Areas to improve */}
              <div className="rounded-2xl border border-amber-200/60 bg-amber-50/30 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-ink-800 inline-flex items-center gap-2">
                  <AlertTriangle strokeWidth={1.75} className="h-5 w-5 text-amber-500" />
                  Areas to Improve
                </h2>
                <ul className="mt-4 space-y-3">
                  {gaps.map((dim) => (
                    <li key={dim.key} className="flex items-start gap-3">
                      <AlertTriangle strokeWidth={1.75} className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-ink-700">{dim.label}</p>
                        <p className="text-xs text-ink-400 mt-0.5">
                          Score: {dim.value}/100 — {dim.gaps[0] || "Room for improvement"}
                        </p>
                      </div>
                    </li>
                  ))}
                  {gaps.length === 0 && (
                    <li className="text-sm text-ink-400">No significant gaps identified.</li>
                  )}
                </ul>
              </div>
            </div>
          </section>

          {/* ── CTA Section ───────────────────────────────────────────────── */}
          <section id="cta-section" data-section className="mt-8">
            <div className="rounded-2xl border border-brand-200/40 bg-gradient-to-br from-brand-50/50 to-white p-6 md:p-8 shadow-sm">
              <div className="grid md:grid-cols-3 gap-6">
                <div className="rounded-xl border border-surface-200 bg-white p-5">
                  <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center mb-3">
                    <FileText strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
                  </div>
                  <h3 className="text-sm font-semibold text-ink-800">Full Report</h3>
                  <p className="mt-1 text-xs text-ink-400 leading-relaxed">
                    Want to see the complete 10-page deep dive with evidence, benchmarks, and action plan? Ask the founder for access.
                  </p>
                </div>
                <div className="rounded-xl border border-surface-200 bg-white p-5">
                  <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center mb-3">
                    <ShieldCheck strokeWidth={1.75} className="h-5 w-5 text-emerald-600" />
                  </div>
                  <h3 className="text-sm font-semibold text-ink-800">Interested in Investing?</h3>
                  <p className="mt-1 text-xs text-ink-400 leading-relaxed">
                    This report was shared by the founder. Contact them directly to discuss the opportunity and access the full data room.
                  </p>
                </div>
                <div className="rounded-xl border border-surface-200 bg-white p-5">
                  <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center mb-3">
                    <Sparkles strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
                  </div>
                  <h3 className="text-sm font-semibold text-ink-800">Get Your Own SVI</h3>
                  <p className="mt-1 text-xs text-ink-400 leading-relaxed">
                    Generate a free Startup Value Index for your own company in under 5 minutes.
                  </p>
                  <Link href="/score" className="mt-3 inline-flex">
                    <Button variant="primary" size="sm" className="text-xs">
                      Generate my score
                      <ArrowRight strokeWidth={1.75} className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </section>

          {/* ── Benchmark context ─────────────────────────────────────────── */}
          <section className="mt-6">
            <div className="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.15em] text-ink-400 font-medium">Benchmark</p>
                  <p className="mt-1 text-sm text-ink-600">
                    Compared against {SVI_STAGE_LABELS[stage] ?? "Concept"} stage AU startups.
                    Median SVI for this stage: <span className="font-mono font-semibold tabular-nums">{SVI_BENCHMARKS[stage]?.p50 ?? 100}</span>
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="text-xs text-ink-400">p25</p>
                    <p className="text-sm font-mono tabular-nums text-ink-500">{SVI_BENCHMARKS[stage]?.p25 ?? 75}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-ink-400">p50</p>
                    <p className="text-sm font-mono tabular-nums text-ink-600 font-semibold">{SVI_BENCHMARKS[stage]?.p50 ?? 100}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-ink-400">p75</p>
                    <p className="text-sm font-mono tabular-nums text-ink-500">{SVI_BENCHMARKS[stage]?.p75 ?? 125}</p>
                  </div>
                  <div className={`text-center rounded-lg px-3 py-1.5 ${scoreBgColor(totalSVI)}/10`}>
                    <p className="text-xs text-ink-400">This startup</p>
                    <p className={`text-sm font-mono tabular-nums font-bold ${scoreColor(totalSVI)}`}>{totalSVI}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-surface-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <Link
                href="/"
                className="inline-flex items-center gap-2 cursor-pointer"
                aria-label="BlockID home"
              >
                <Image
                  src="/images/logo-icon-transparent.png"
                  alt=""
                  width={20}
                  height={20}
                  className="h-5 w-5"
                />
                <span className="font-bold text-sm text-ink-700">
                  BlockID<span className="text-brand-500">.au</span>
                </span>
              </Link>
              <p className="mt-1 text-xs text-ink-400">
                AI-powered startup intelligence. AU data residency.
              </p>
            </div>
            <p className="text-[11px] text-ink-300 leading-relaxed max-w-md sm:text-right">
              This is an automated assessment generated by BlockID.au, not investment advice.
              It does not constitute a recommendation to buy, sell, or hold any security.
              Always conduct your own due diligence.
            </p>
          </div>
        </div>
      </footer>

      {/* Client-side engagement tracker */}
      <ViewTracker slug={slug} sectionIds={sectionIds} />
    </>
  );
}

/* ── Sub-components ────────────────────────────────────────────────────────── */

function StatPill({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-surface-200 bg-surface-50/60 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-ink-400 font-medium">
        {label}
      </p>
      <p className="mt-1 text-base font-semibold text-ink-800">{value}</p>
      <p className="mt-0.5 text-[11px] text-ink-400">{detail}</p>
    </div>
  );
}
