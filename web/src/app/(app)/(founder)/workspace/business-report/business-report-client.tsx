"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { getTbrStrings, type TbrLocale } from "@/lib/i18n/tbr-strings";
import { computeThreeCaseValuation, formatAud } from "@/lib/svi/three-case-valuation";
import {
  selectValuationMethod,
  inferTractionFromTreScore,
} from "@/lib/svi/valuation-method-selector";
import {
  Users,
  Target,
  Cog,
  TrendingUp,
  Landmark,
  Briefcase,
  Scale,
  Sparkles,
  AlertTriangle,
  ArrowUpCircle,
  CheckCircle2,
  ChevronRight,
  FileText,
  Lightbulb,
  Globe,
  Code,
  BarChart3,
  Megaphone,
  FolderCheck,
  Network,
  Map,
  DollarSign,
  User,
  type LucideIcon,
} from "lucide-react";

// ── Criterion state (from criteria_synthesis SSE event) ───────────────────────

interface CriterionState {
  key: string;
  title: string;
  primary_dimension: string;
  weight: number;
  score: number;
  verdict: string;
  strengths: string[];
  gaps: string[];
  next_action: string;
}

// Icon map for 13 criteria
const CRITERION_ICONS: Record<string, LucideIcon> = {
  idea: Lightbulb,
  market: Target,
  founder_profile: User,
  code_git: Code,
  website: Globe,
  team: Users,
  customer_size: BarChart3,
  gtm_strategy: Megaphone,
  documents: FileText,
  dataroom: FolderCheck,
  team_structure: Network,
  roadmap: Map,
  revenue: DollarSign,
};

// ── Dimension metadata ────────────────────────────────────────────────────────

const DIMS: Record<string, { label: string; Icon: LucideIcon; weight: number; section: string }> = {
  ftv: { label: "Founder & Team Value",      Icon: Users,       weight: 15, section: "Founding Team" },
  mpc: { label: "Market & Problem Clarity",  Icon: Target,      weight: 18, section: "Market & Problem" },
  ptd: { label: "Product & Tech Depth",      Icon: Cog,         weight: 12, section: "Product & Technology" },
  tre: { label: "Traction & Revenue",        Icon: TrendingUp,  weight: 20, section: "Traction & Revenue" },
  cgh: { label: "Cap Table & Governance",    Icon: Landmark,    weight: 12, section: "Cap Table & Governance" },
  iri: { label: "Investor Readiness",        Icon: Briefcase,   weight: 10, section: "Investor Readiness" },
  lco: { label: "Legal & Compliance",        Icon: Scale,       weight: 8,  section: "Legal & Compliance" },
  svm: { label: "Strategic Vision & Moat",   Icon: Sparkles,    weight: 5,  section: "Strategic Vision" },
};

const DIM_ORDER = ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface DimState {
  status: string;
  score: number | null;
  markdown: string | null;
  insights: string[];
  priority: "high" | "medium" | "low" | null;
  marketBenchmark: string | null;
}

interface PersistedState {
  savedAt: number;
  dimStates: Record<string, DimState>;
  criterionStates?: CriterionState[];
  completed: number;
  total: number;
  totalMs: number | null;
  done: boolean;
  industry: string | null;
  stage?: string | null;
}

const STORAGE_PREFIX = "svi-stream:";
const STORAGE_MAX_AGE_MS = 30 * 60_000;

function loadPersisted(projectId: string): PersistedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${projectId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (Date.now() - parsed.savedAt > STORAGE_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ── Score helpers ─────────────────────────────────────────────────────────────

function scoreBand(score: number | null): "strong" | "developing" | "early" | "pending" {
  if (score === null) return "pending";
  if (score >= 70) return "strong";
  if (score >= 40) return "developing";
  return "early";
}

function bandColor(band: "strong" | "developing" | "early" | "pending"): string {
  if (band === "strong") return "text-emerald-700 dark:text-emerald-300";
  if (band === "developing") return "text-amber-700 dark:text-amber-300";
  if (band === "early") return "text-red-700 dark:text-red-300";
  return "text-ink-400 dark:text-ink-500";
}

function bandBg(band: "strong" | "developing" | "early" | "pending"): string {
  if (band === "strong") return "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800";
  if (band === "developing") return "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800";
  if (band === "early") return "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800";
  return "bg-ink-50 border-ink-200 dark:bg-ink-900 dark:border-ink-800";
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split(/\n\n+/);
  return (
    <div className="space-y-2.5">
      {lines.map((block, i) => {
        const headingMatch = block.match(/^\*\*([^*]+)\*\*/);
        if (headingMatch) {
          const heading = headingMatch[1];
          const rest = block.slice(headingMatch[0].length).replace(/^:\s*/, "");
          return (
            <div key={i}>
              <p className="text-xs font-bold text-ink-700 dark:text-ink-200 uppercase tracking-wide">{heading}</p>
              {rest && (
                <p className="text-sm text-ink-600 dark:text-ink-400 mt-1 leading-relaxed">{rest}</p>
              )}
            </div>
          );
        }
        if (block.startsWith("- ")) {
          const items = block.split("\n").filter((l) => l.startsWith("- "));
          return (
            <ul key={i} className="space-y-1.5">
              {items.map((item, j) => (
                <li key={j} className="flex items-start gap-2 text-sm text-ink-600 dark:text-ink-400">
                  <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-brand-400" />
                  <span>{item.slice(2)}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="text-sm text-ink-600 dark:text-ink-400 leading-relaxed">{block}</p>
        );
      })}
    </div>
  );
}

// ── Sticky TOC ────────────────────────────────────────────────────────────────

const TOC_SECTIONS = [
  { id: "tbr-executive", label: "Executive Summary" },
  { id: "tbr-svi", label: "SVI Score" },
  { id: "tbr-valuation", label: "Valuation" },
  ...DIM_ORDER.map((k) => ({ id: `tbr-dim-${k}`, label: DIMS[k].section })),
  { id: "tbr-criteria", label: "13-Criteria Analysis" },
  { id: "tbr-risk", label: "Risk Register" },
  { id: "tbr-roadmap", label: "Improvement Roadmap" },
  { id: "tbr-cohort", label: "Cohort Compare" },
  { id: "tbr-peers", label: "Peer-5 Similarity Match" },
  { id: "tbr-methodology", label: "Methodology" },
];

// ── TOC section groups ────────────────────────────────────────────────────────
function buildTocGroups(t: ReturnType<typeof getTbrStrings>) {
  return [
    {
      label: t.tocOverview,
      items: [
        { id: "tbr-executive", label: t.secExecutive },
        { id: "tbr-svi", label: t.thScore },
        { id: "tbr-valuation", label: t.secValuation },
      ],
    },
    {
      label: t.tocDimensions,
      items: DIM_ORDER.map((k) => ({ id: `tbr-dim-${k}`, label: DIMS[k].section })),
    },
    {
      label: t.tocAnalysis,
      items: [
        { id: "tbr-criteria", label: t.secCriteria },
        { id: "tbr-risk", label: t.secRisk },
        { id: "tbr-roadmap", label: t.secRoadmap },
        { id: "tbr-cohort", label: t.secCohort },
        { id: "tbr-peers", label: "Peer-5 Similarity Match" },
        { id: "tbr-methodology", label: t.secMethodology },
      ],
    },
  ];
}

function TocNav({ activeId, t }: { activeId: string; t: ReturnType<typeof getTbrStrings> }) {
  const groups = buildTocGroups(t);
  return (
    <nav
      aria-label="Report sections"
      className="hidden xl:block sticky top-24 self-start w-56 shrink-0 print:hidden"
    >
      <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-ink-500 dark:text-ink-400 mb-3">
        {t.tocContents}
      </p>
      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="text-[9px] uppercase tracking-[0.2em] font-bold text-ink-400 dark:text-ink-600 px-2 mb-1">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] transition-all leading-snug",
                      activeId === s.id
                        ? "bg-brand-100 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 font-semibold border-l-2 border-brand-500 dark:border-brand-400 pl-1.5"
                        : "text-ink-600 dark:text-ink-400 hover:text-ink-900 dark:hover:text-ink-200 hover:bg-ink-100 dark:hover:bg-ink-800",
                    )}
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function ReportSection({
  id,
  title,
  children,
  className,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn("scroll-mt-24 space-y-4 print:break-inside-avoid print:pt-6", className)}
      aria-labelledby={`${id}-heading`}
    >
      <div className="flex items-center gap-3 pb-3 border-b-2 border-ink-100 dark:border-ink-800 print:border-ink-300">
        <div className="h-5 w-1 rounded-full bg-brand-500 shrink-0 print:bg-brand-600" aria-hidden="true" />
        <h2
          id={`${id}-heading`}
          className="text-lg font-bold text-ink-800 dark:text-ink-100 tracking-tight"
        >
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

// ── Criterion score ring (SVG) ─────────────────────────────────────────────────
function CriterionRing({ score, size = 56 }: { score: number; size?: number }) {
  const r = (size - 10) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const dashOffset = circ - (circ * Math.max(0, Math.min(100, score))) / 100;
  const color =
    score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";
  return (
    <div className="shrink-0" role="img" aria-label={`Score ${score}/100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" aria-hidden="true">
        <circle cx={cx} cy={cy} r={r} stroke="#e5e7eb" strokeWidth="5" className="dark:stroke-ink-700" />
        <circle
          cx={cx} cy={cy} r={r}
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fontSize={size > 48 ? "13" : "11"} fontWeight="700" fill={color} fontFamily="inherit">
          {score}
        </text>
      </svg>
    </div>
  );
}

// ── Wave 25C: Peer-5 Similarity Match ────────────────────────────────────────

interface PeerRow {
  rank: number;
  codename: string;
  industry: string;
  stage: string;
  sviScore: number;
  topStrengthDim: string;
  topStrengthLabel: string;
  topStrengthScore: number;
  primaryGapDim: string;
  primaryGapLabel: string;
  primaryGapScore: number;
  similarityPct: number;
}

function PeerFiveSection({
  projectId,
  shareToken,
  industry,
  stage,
}: {
  projectId: string;
  shareToken?: string;
  industry: string | null;
  stage: string | null | undefined;
}) {
  const [peers, setPeers] = useState<PeerRow[] | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qs = shareToken
          ? `token=${encodeURIComponent(shareToken)}`
          : `projectId=${encodeURIComponent(projectId)}`;
        const res = await fetch(`/api/svi/report/peers?${qs}`, {
          credentials: "same-origin",
        });
        if (!res.ok) {
          if (!cancelled) setError("peer-lookup-unavailable");
          return;
        }
        const body = (await res.json()) as {
          ok?: boolean;
          peers?: PeerRow[];
          fallback?: string;
        };
        if (cancelled) return;
        if (body.ok && Array.isArray(body.peers)) {
          setPeers(body.peers);
          setFallback(body.fallback ?? null);
        } else {
          setError("no-peers");
        }
      } catch {
        if (!cancelled) setError("network-error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, shareToken]);

  if (loading) {
    return (
      <p className="text-sm text-ink-500 dark:text-ink-400">
        Loading peer-5 similarity matches…
      </p>
    );
  }

  if (error || !peers || peers.length === 0) {
    return (
      <p className="text-sm text-ink-500 dark:text-ink-400">
        Not enough AU peers in our dataset yet to compute a Peer-5 match. As
        more founders complete a BlockID SVI analysis, this section will
        populate with the 5 closest matches on the 8-dim vector.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-600 dark:text-ink-400">
        5 anonymised startups from the BlockID cohort with the closest
        8-dimension SVI profile to yours (cosine similarity). Names are
        withheld — only industry, stage, and aggregate scores are shown.
      </p>
      {fallback === "cross_sector" && (
        <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
          Not enough AU {stage ?? "seed"}-stage {industry ?? "same-sector"}{" "}
          peers yet — showing top available cross-sector matches.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-ink-200 dark:border-ink-700">
              <th className="text-left py-2 pr-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">#</th>
              <th className="text-left py-2 pr-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Peer</th>
              <th className="text-left py-2 pr-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Industry</th>
              <th className="text-left py-2 pr-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Stage</th>
              <th className="text-center py-2 px-2 text-xs font-semibold text-ink-500 uppercase tracking-wide">SVI</th>
              <th className="text-left py-2 pr-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Top Strength</th>
              <th className="text-left py-2 pr-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Primary Gap</th>
              <th className="text-right py-2 pl-3 text-xs font-semibold text-ink-500 uppercase tracking-wide">Similarity</th>
            </tr>
          </thead>
          <tbody>
            {peers.map((p) => (
              <tr key={p.rank} className="border-b border-ink-100 dark:border-ink-800/60">
                <td className="py-2 pr-3 text-ink-500 tabular-nums">{p.rank}</td>
                <td className="py-2 pr-3 font-medium text-ink-700 dark:text-ink-200">{p.codename}</td>
                <td className="py-2 pr-3 text-ink-600 dark:text-ink-400">{p.industry}</td>
                <td className="py-2 pr-3 text-ink-600 dark:text-ink-400 capitalize">{p.stage}</td>
                <td className="text-center py-2 px-2">
                  <span className={cn("font-bold tabular-nums", bandColor(scoreBand(p.sviScore)))}>
                    {p.sviScore}
                  </span>
                </td>
                <td className="py-2 pr-3 text-emerald-700 dark:text-emerald-400 text-xs">
                  {p.topStrengthLabel} <span className="tabular-nums">({p.topStrengthScore})</span>
                </td>
                <td className="py-2 pr-3 text-red-700 dark:text-red-400 text-xs">
                  {p.primaryGapLabel} <span className="tabular-nums">({p.primaryGapScore})</span>
                </td>
                <td className="text-right py-2 pl-3 tabular-nums font-semibold text-brand-700 dark:text-brand-300">
                  {p.similarityPct}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-ink-500 dark:text-ink-500 leading-snug">
        Peer identities are strictly anonymised — no startup names, founder
        details, ABN, or contact info are ever exposed. Similarity is cosine
        distance on the normalised 8-dim SVI vector, sorted best match first.
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export interface BusinessReportClientProps {
  projectId: string;
  /** When set, render this state directly and skip both localStorage and the
   * API fallback. Used by the public /tbr/[token] page which passes DB rows
   * fetched server-side. */
  initialData?: PersistedState;
  /** Public share token — when set the "Share with Investor" button is
   * hidden (it only makes sense in the authenticated founder context) and
   * the "Download PDF" button hits /api/svi/report/pdf?token=<shareToken>. */
  shareToken?: string;
  /** Called from /tbr/[token]?pdf=1 to hide all interactive chrome so the
   * headless-chromium PDF export doesn't capture buttons/TOC. */
  pdfMode?: boolean;
  /** UI locale for shell copy (headings, TOC, methodology). AI-generated
   *  content is never translated. Wave 25B — powers /vi/workspace/business-
   *  report and /vi/tbr/[token]. Default "en". */
  locale?: TbrLocale;
}

export function BusinessReportClient({
  projectId,
  initialData,
  shareToken,
  pdfMode,
  locale = "en",
}: BusinessReportClientProps) {
  const t = getTbrStrings(locale);
  const router = useRouter();
  const [data, setData] = useState<PersistedState | null>(initialData ?? null);
  const [activeId, setActiveId] = useState("tbr-executive");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // Load from localStorage first (fast path), then fall back to Supabase
  // (/api/svi/report/[projectId]) so the report survives beyond the 30-min
  // localStorage TTL. When `initialData` is supplied (public /tbr/<token>
  // page), skip both — the parent already provided the DB row.
  useEffect(() => {
    if (initialData) return;
    const saved = loadPersisted(projectId);
    if (saved) {
      setData(saved);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/svi/report/${encodeURIComponent(projectId)}`, {
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const body = (await res.json()) as { ok?: boolean; persisted?: PersistedState };
        if (!cancelled && body.ok && body.persisted) setData(body.persisted);
      } catch {
        /* silent — the "no analysis" state will render */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, initialData]);

  // Intersection observer for active TOC item
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 },
    );
    const els = document.querySelectorAll("section[id^='tbr-']");
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [data]);

  if (!data) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800 p-6 text-center space-y-3">
          <FileText className="h-10 w-10 mx-auto text-amber-500 dark:text-amber-400" aria-hidden="true" />
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            {t.noAnalysisTitle}
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {t.noAnalysisBody}
          </p>
          <Link
            href="/workspace/pitchdeck-analyze"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 transition-colors"
          >
            {t.noAnalysisCta} <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  const { dimStates, criterionStates, industry, stage, totalMs, done } = data;

  const scored = DIM_ORDER
    .map((k) => ({ key: k, ...DIMS[k], state: dimStates[k] ?? null }))
    .filter((d) => d.state?.score !== null && d.state !== null) as Array<{
      key: string;
      label: string;
      Icon: LucideIcon;
      weight: number;
      section: string;
      state: DimState & { score: number };
    }>;

  if (scored.length === 0) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="rounded-xl border border-ink-200 dark:border-ink-800 p-6 text-center space-y-3">
          <p className="text-sm text-ink-600 dark:text-ink-400">
            {t.scoresMissingBody}
          </p>
          <Link href="/workspace/pitchdeck-analyze" className="text-brand-600 hover:underline text-sm">
            {t.scoresMissingCta}
          </Link>
        </div>
      </div>
    );
  }

  const totalWeight = scored.reduce((acc, d) => acc + d.weight, 0);
  const totalSvi = Math.round(
    scored.reduce((acc, d) => acc + (d.state.score * d.weight) / totalWeight, 0),
  );
  const overallBand = scoreBand(totalSvi);

  // Valuation
  const treState = dimStates["tre"];
  const traction = inferTractionFromTreScore(treState?.score ?? null);
  const normStage = (s: string | null | undefined): "idea" | "pre_seed" | "seed" | "series_a" | "series_b" | "growth" => {
    if (!s) return "seed";
    const l = s.toLowerCase().replace(/[-\s]/g, "_");
    if (l.startsWith("idea") || l === "pre_launch") return "idea";
    if (l.startsWith("pre_seed") || l === "preseed") return "pre_seed";
    if (l.startsWith("seed")) return "seed";
    if (l === "a" || l.includes("series_a")) return "series_a";
    if (l === "b" || l.includes("series_b")) return "series_b";
    return "growth";
  };
  const methodSel = selectValuationMethod(normStage(null), totalSvi, traction);
  const valuation = computeThreeCaseValuation(totalSvi, null, industry);

  // Risk register: high-priority dims sorted by weight × gap (1 - score/100)
  const riskItems = scored
    .filter((d) => d.state.priority === "high" || d.state.score < 50)
    .sort((a, b) => {
      const riskA = a.weight * (1 - a.state.score / 100);
      const riskB = b.weight * (1 - b.state.score / 100);
      return riskB - riskA;
    });

  // Improvement roadmap: sorted by potential SVI lift = weight × (70 - score) / 100
  // Only dims below 70 (not already "strong")
  const roadmapItems = scored
    .filter((d) => d.state.score < 70)
    .sort((a, b) => {
      const liftA = a.weight * (70 - a.state.score) / 100;
      const liftB = b.weight * (70 - b.state.score) / 100;
      return liftB - liftA;
    })
    .slice(0, 5);

  // Executive summary band description
  const above70Count = scored.filter((d) => d.state.score >= 70).length;
  const execVerdict =
    overallBand === "strong"
      ? t.verdictStrong(totalSvi, above70Count)
      : overallBand === "developing"
      ? t.verdictDeveloping(totalSvi, riskItems.length)
      : t.verdictEarly(totalSvi);
  const bandDisplay =
    overallBand === "strong" ? t.bandStrong
    : overallBand === "developing" ? t.bandDeveloping
    : t.bandEarly;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto print:p-0 print:max-w-none">
      {/* Print styles injected as a style tag */}
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          @page { margin: 1.5cm 2cm; size: A4; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* Header */}
      <div className="mb-6 space-y-1 print:mb-8">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-100 print:text-3xl">
            {t.reportTitle}
          </h1>
          <span className="inline-flex items-center rounded-full bg-brand-100 dark:bg-brand-900/40 border border-brand-200 dark:border-brand-800 px-2.5 py-0.5 text-xs font-semibold text-brand-700 dark:text-brand-300">
            {t.brandBadge}
          </span>
          {!pdfMode && (
            <button
              type="button"
              onClick={() => {
                // Toggle between EN <-> VI by swapping the /vi prefix.
                if (typeof window === "undefined") return;
                const { pathname, search } = window.location;
                const nextPath = locale === "vi"
                  ? pathname.replace(/^\/vi(\/|$)/, "/")
                  : (pathname.startsWith("/vi/") ? pathname : "/vi" + pathname);
                router.push(nextPath + search);
              }}
              aria-label={t.languageToggleAria}
              className="inline-flex items-center rounded-full border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900 px-2 py-0.5 text-[10px] font-semibold text-ink-600 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-800 print:hidden"
            >
              {locale === "vi" ? t.switchToEn : t.switchToVi}
            </button>
          )}
          {!pdfMode && (
            <div className="ml-auto flex items-center gap-2 print:hidden">
              {/* Share with Investor — only when running under the authed
                  /workspace/business-report route (not on the public /tbr). */}
              {!initialData && (
                <button
                  type="button"
                  onClick={async () => {
                    setShareBusy(true);
                    setShareError(null);
                    setCopied(false);
                    try {
                      const res = await fetch("/api/svi/report/share", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "same-origin",
                        body: JSON.stringify({ projectId }),
                      });
                      const body = (await res.json()) as { ok?: boolean; url?: string; error?: string };
                      if (body.ok && body.url) {
                        setShareUrl(body.url);
                      } else {
                        setShareError(body.error ?? "Share failed");
                      }
                    } catch (err) {
                      setShareError(err instanceof Error ? err.message : "Share failed");
                    } finally {
                      setShareBusy(false);
                    }
                  }}
                  disabled={shareBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-950/40 px-3 py-1.5 text-xs font-semibold text-brand-700 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900/40 transition-colors disabled:opacity-60"
                >
                  {shareBusy ? t.sharing : t.shareWithInvestor}
                </button>
              )}
              {/* Download PDF — server-generated via Playwright. Requires a
                  share token (mint one first if we're on the authed page). */}
              <a
                href={
                  shareToken
                    ? `/api/svi/report/pdf?token=${encodeURIComponent(shareToken)}`
                    : shareUrl
                    ? `/api/svi/report/pdf?token=${encodeURIComponent(new URL(shareUrl).pathname.split("/").pop() ?? "")}`
                    : undefined
                }
                onClick={(e) => {
                  if (!shareToken && !shareUrl) {
                    e.preventDefault();
                    setShareError(t.clickShareFirst);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900 px-3 py-1.5 text-xs font-medium text-ink-600 dark:text-ink-400 hover:bg-ink-50 dark:hover:bg-ink-800 transition-colors"
              >
                {t.downloadPdf}
              </a>
              <button
                type="button"
                onClick={() => typeof window !== "undefined" && window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900 px-3 py-1.5 text-xs font-medium text-ink-600 dark:text-ink-400 hover:bg-ink-50 dark:hover:bg-ink-800 transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                {t.print}
              </button>
            </div>
          )}
        {/* Share URL feedback strip */}
        {!pdfMode && shareUrl && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-brand-200 dark:border-brand-800 bg-brand-50/60 dark:bg-brand-950/30 px-3 py-2 text-xs print:hidden">
            <span className="font-semibold text-brand-700 dark:text-brand-300">{t.shareUrlLabel}</span>
            <code className="flex-1 truncate text-ink-700 dark:text-ink-300">{shareUrl}</code>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  /* clipboard blocked */
                }
              }}
              className="rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-ink-900 px-2 py-0.5 font-semibold text-brand-700 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900/40"
            >
              {copied ? t.copied : t.copy}
            </button>
          </div>
        )}
        {!pdfMode && shareError && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400 print:hidden">{shareError}</p>
        )}
        </div>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          {t.progressXofY(scored.length, 8)} · {done ? t.completedInSeconds(((totalMs ?? 0) / 1000).toFixed(1)) : t.partialAnalysis}
          {industry && ` · ${industry}`}
        </p>
      </div>

      <div className="flex gap-8 items-start">
        {/* Sticky TOC — hidden in PDF-render mode so the printed doc isn't
            a wall of nav links. */}
        {!pdfMode && <TocNav activeId={activeId} t={t} />}

        {/* Report body */}
        <div className="flex-1 min-w-0 space-y-12">

          {/* ── Executive Summary ──────────────────────────────────────────── */}
          <ReportSection id="tbr-executive" title={t.secExecutive}>
            <div className={cn("rounded-2xl border p-6 md:p-8 space-y-5", bandBg(overallBand))}>
              {/* Hero score display */}
              <div className="flex items-center gap-6 flex-wrap">
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      "text-7xl md:text-8xl font-black tabular-nums leading-none tracking-tighter",
                      bandColor(overallBand),
                    )}
                    aria-label={`SVI Score: ${totalSvi} out of 100`}
                  >
                    {totalSvi}
                  </span>
                  <span className="text-base text-ink-400 dark:text-ink-500 font-normal mt-1">/ 100</span>
                </div>
                <div className="flex-1 space-y-2">
                  <div className={cn("inline-flex items-center rounded-full px-3 py-1 text-sm font-bold border", bandBg(overallBand), bandColor(overallBand))}>
                    {bandDisplay}
                  </div>
                  <p className="text-sm text-ink-700 dark:text-ink-300 leading-relaxed max-w-lg">{execVerdict}</p>
                </div>
              </div>
              {/* Mini dimension scorecard */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                {scored.slice(0, 4).map((d) => (
                  <div key={d.key} className="rounded-xl bg-white/70 dark:bg-ink-900/50 border border-ink-200/60 dark:border-ink-800/60 p-3 space-y-1">
                    <p className="text-[10px] text-ink-500 dark:text-ink-400 uppercase tracking-wide leading-snug">{d.section}</p>
                    <p className={cn("text-xl font-black tabular-nums", bandColor(scoreBand(d.state.score)))}>
                      {d.state.score}
                      <span className="text-xs font-normal text-ink-400">/100</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </ReportSection>

          {/* ── SVI Score breakdown ────────────────────────────────────────── */}
          <ReportSection id="tbr-svi" title={t.secSvi}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-ink-200 dark:border-ink-700">
                    <th className="text-left py-2 pr-4 text-xs font-semibold text-ink-500 dark:text-ink-400 uppercase tracking-wide">Dimension</th>
                    <th className="text-center py-2 px-2 text-xs font-semibold text-ink-500 dark:text-ink-400 uppercase tracking-wide w-16">Weight</th>
                    <th className="text-center py-2 px-2 text-xs font-semibold text-ink-500 dark:text-ink-400 uppercase tracking-wide w-20">Score</th>
                    <th className="text-center py-2 pl-2 text-xs font-semibold text-ink-500 dark:text-ink-400 uppercase tracking-wide w-20">Priority</th>
                    <th className="text-right py-2 pl-4 text-xs font-semibold text-ink-500 dark:text-ink-400 uppercase tracking-wide w-24">Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {DIM_ORDER.map((k) => {
                    const meta = DIMS[k];
                    const state = dimStates[k];
                    const contrib = state?.score !== null && state?.score !== undefined
                      ? Math.round((state.score * meta.weight) / totalWeight)
                      : null;
                    return (
                      <tr key={k} className="border-b border-ink-100 dark:border-ink-800/60 hover:bg-ink-50/60 dark:hover:bg-ink-900/30 transition-colors">
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <meta.Icon className="h-4 w-4 text-brand-500 dark:text-brand-400 shrink-0" aria-hidden="true" />
                            <a
                              href={`#tbr-dim-${k}`}
                              className="font-medium text-ink-700 dark:text-ink-200 hover:text-brand-600 dark:hover:text-brand-300"
                            >
                              {meta.label}
                            </a>
                          </div>
                        </td>
                        <td className="text-center py-2.5 px-2 text-ink-600 dark:text-ink-400 tabular-nums">{meta.weight}%</td>
                        <td className="text-center py-2.5 px-2">
                          {state?.score != null ? (
                            <span className={cn("font-bold tabular-nums", bandColor(scoreBand(state.score)))}>
                              {state.score}
                            </span>
                          ) : (
                            <span className="text-ink-400 dark:text-ink-600">—</span>
                          )}
                        </td>
                        <td className="text-center py-2.5 pl-2">
                          {state?.priority && (
                            <span className={cn(
                              "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                              state.priority === "high" && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
                              state.priority === "medium" && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
                              state.priority === "low" && "bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-400",
                            )}>
                              {state.priority}
                            </span>
                          )}
                        </td>
                        <td className="text-right py-2.5 pl-4 tabular-nums text-ink-600 dark:text-ink-400">
                          {contrib !== null ? `${contrib} pts` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-ink-50/60 dark:bg-ink-900/40">
                    <td className="py-2.5 pr-4 font-bold text-ink-800 dark:text-ink-100">Total SVI</td>
                    <td className="text-center py-2.5 px-2 font-semibold text-ink-600 dark:text-ink-300">{totalWeight}%</td>
                    <td className="text-center py-2.5 px-2">
                      <span className={cn("text-lg font-bold tabular-nums", bandColor(overallBand))}>{totalSvi}</span>
                    </td>
                    <td />
                    <td className="text-right py-2.5 pl-4 font-bold text-ink-800 dark:text-ink-100 tabular-nums">{totalSvi} pts</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </ReportSection>

          {/* ── Valuation ─────────────────────────────────────────────────── */}
          <ReportSection id="tbr-valuation" title={t.secValuation}>
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center rounded-full border border-brand-200 dark:border-brand-800 bg-brand-50/60 dark:bg-brand-950/30 px-2.5 py-0.5 text-xs font-semibold text-brand-700 dark:text-brand-300">
                  {methodSel.meta.shortLabel}
                </span>
                <p className="text-sm text-ink-600 dark:text-ink-400">{methodSel.rationale}</p>
              </div>
              <p className="text-xs text-ink-500 dark:text-ink-500">{methodSel.meta.description}</p>
              <p className="text-xs text-ink-500 dark:text-ink-500">{methodSel.meta.auBenchmark}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(["worst", "average", "best"] as const).map((c) => (
                  <div
                    key={c}
                    className={cn(
                      "rounded-xl border p-4",
                      c === "worst" && "border-red-200 bg-red-50/40 dark:border-red-800 dark:bg-red-950/20",
                      c === "average" && "border-brand-200 bg-brand-50/60 dark:border-brand-800 dark:bg-brand-950/30",
                      c === "best" && "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20",
                    )}
                  >
                    <p className="text-[11px] uppercase tracking-wider font-semibold text-ink-600 dark:text-ink-400">
                      {c === "worst" ? "Worst Case" : c === "average" ? "Average Case" : "Best Case"}
                    </p>
                    <p className={cn(
                      "mt-1 text-2xl font-bold tabular-nums",
                      c === "worst" && "text-red-700 dark:text-red-300",
                      c === "average" && "text-brand-700 dark:text-brand-300",
                      c === "best" && "text-emerald-700 dark:text-emerald-300",
                    )}>
                      {formatAud(valuation[c].mid)}
                    </p>
                    <p className="text-xs text-ink-500 dark:text-ink-500 tabular-nums mt-0.5">
                      {formatAud(valuation[c].low)}–{formatAud(valuation[c].high)}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-ink-500 dark:text-ink-500 leading-snug">{valuation.disclaimer}</p>
            </div>
          </ReportSection>

          {/* ── Per-dimension sections ─────────────────────────────────────── */}
          {DIM_ORDER.map((k) => {
            const meta = DIMS[k];
            const state = dimStates[k];
            if (!state || state.score === null) return null;
            const band = scoreBand(state.score);
            return (
              <ReportSection
                key={k}
                id={`tbr-dim-${k}`}
                title={`${meta.section} (${meta.label})`}
              >
                <div className={cn("rounded-xl border p-5 space-y-4 print:break-inside-avoid", bandBg(band))}>
                  {/* Score row with ring */}
                  <div className="flex items-center gap-4 flex-wrap">
                    <CriterionRing score={state.score} size={72} />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <meta.Icon className="h-5 w-5 text-brand-500 dark:text-brand-400" aria-hidden="true" />
                        <span className="text-xs text-ink-500 dark:text-ink-400">{meta.weight}% of total SVI</span>
                        {state.priority && (
                          <span className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            state.priority === "high" && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800",
                            state.priority === "medium" && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800",
                            state.priority === "low" && "bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-400 border border-ink-200 dark:border-ink-700",
                          )}>
                            {state.priority} priority
                          </span>
                        )}
                      </div>
                      <div className={cn("text-3xl font-black tabular-nums tracking-tight", bandColor(band))}>
                        {state.score}
                        <span className="text-base font-normal text-ink-400 dark:text-ink-500">/100</span>
                      </div>
                    </div>
                  </div>

                  {/* Insights */}
                  {state.insights.length > 0 && (
                    <div className="space-y-1.5">
                      {state.insights.map((ins, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-brand-500" aria-hidden="true" />
                          <p className="text-sm text-ink-700 dark:text-ink-200">{ins}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* AU market benchmark */}
                  {state.marketBenchmark && (
                    <div className="rounded-lg bg-white/50 dark:bg-ink-900/30 border border-brand-200/60 dark:border-brand-800/40 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.14em] font-semibold text-ink-500 dark:text-ink-400 mb-0.5">AU Market Benchmark</p>
                      <p className="text-sm text-ink-600 dark:text-ink-300">{state.marketBenchmark}</p>
                    </div>
                  )}

                  {/* Full markdown */}
                  {state.markdown && (
                    <div className="border-t border-ink-200/60 dark:border-ink-700/40 pt-4">
                      <SimpleMarkdown text={state.markdown} />
                    </div>
                  )}
                </div>
              </ReportSection>
            );
          })}

          {/* ── Risk Register ─────────────────────────────────────────────── */}
          {riskItems.length > 0 && (
            <ReportSection id="tbr-risk" title={t.secRisk}>
              <p className="text-sm text-ink-600 dark:text-ink-400">
                Dimensions that represent the highest investment risk — sorted by impact × gap.
              </p>
              <div className="space-y-3">
                {riskItems.map((d, i) => (
                  <div
                    key={d.key}
                    className="flex items-start gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50/40 dark:bg-red-950/20 p-4"
                  >
                    <span className="flex-none w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/40 border border-red-300 dark:border-red-700 flex items-center justify-center text-[11px] font-bold text-red-700 dark:text-red-300">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a
                          href={`#tbr-dim-${d.key}`}
                          className="font-semibold text-sm text-ink-800 dark:text-ink-100 hover:text-brand-600 dark:hover:text-brand-300"
                        >
                          {d.label}
                        </a>
                        <span className={cn("tabular-nums text-sm font-bold", bandColor(scoreBand(d.state.score)))}>
                          {d.state.score}/100
                        </span>
                        <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" aria-hidden="true" />
                      </div>
                      <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">
                        {d.weight}% weight · estimated {Math.round(d.weight * (1 - d.state.score / 100))} pts drag on total SVI
                      </p>
                      {d.state.insights[0] && (
                        <p className="text-sm text-ink-600 dark:text-ink-400 mt-1">{d.state.insights[0]}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ReportSection>
          )}

          {/* ── Improvement Roadmap ────────────────────────────────────────── */}
          {roadmapItems.length > 0 && (
            <ReportSection id="tbr-roadmap" title={t.secRoadmap}>
              <p className="text-sm text-ink-600 dark:text-ink-400">
                Top {roadmapItems.length} actions ranked by expected SVI lift (weight × gap to 70-point threshold).
              </p>
              <div className="space-y-3">
                {roadmapItems.map((d, i) => {
                  const lift = Math.round(d.weight * (70 - d.state.score) / 100);
                  return (
                    <div
                      key={d.key}
                      className="flex items-start gap-3 rounded-lg border border-brand-200 dark:border-brand-800 bg-brand-50/40 dark:bg-brand-950/20 p-4"
                    >
                      <span className="flex-none w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/40 border border-brand-300 dark:border-brand-700 flex items-center justify-center text-[11px] font-bold text-brand-700 dark:text-brand-300">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <a
                            href={`#tbr-dim-${d.key}`}
                            className="font-semibold text-sm text-ink-800 dark:text-ink-100 hover:text-brand-600 dark:hover:text-brand-300"
                          >
                            {d.label}
                          </a>
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 dark:text-brand-300">
                            <ArrowUpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                            +{lift} pts potential lift
                          </span>
                        </div>
                        <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">
                          Current: {d.state.score}/100 · Target: 70+ · {d.weight}% weight
                        </p>
                        <a
                          href={`/workspace/svi-evidence?dim=${d.key}`}
                          className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-brand-700 dark:text-brand-300 hover:underline"
                        >
                          Add evidence for {d.section} <ChevronRight className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ReportSection>
          )}

          {/* ── 13 Criteria Analysis ──────────────────────────────────── */}
          <ReportSection id="tbr-criteria" title={t.secCriteria}>
            {criterionStates && criterionStates.length > 0 ? (
              <div className="space-y-5">
                <p className="text-sm text-ink-600 dark:text-ink-400">
                  Granular assessment across all 13 investor evaluation criteria — derived from the 8 SVI dimension analyses above. Each criterion maps to a primary SVI dimension and contributes to the composite score.
                </p>
                {criterionStates.map((c) => {
                  const CriterionIcon = CRITERION_ICONS[c.key] ?? FileText;
                  const band = scoreBand(c.score);
                  return (
                    <div key={c.key} className={cn("rounded-xl border p-5 space-y-3 print:break-inside-avoid", bandBg(band))}>
                      <div className="flex items-start gap-4">
                        {/* Score ring on the left */}
                        <CriterionRing score={c.score} size={60} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <CriterionIcon className="h-4 w-4 text-brand-500 dark:text-brand-400 shrink-0" aria-hidden="true" />
                            <h3 className="font-bold text-sm text-ink-800 dark:text-ink-100">{c.title}</h3>
                            <span className="text-[10px] uppercase tracking-wide text-ink-500 dark:text-ink-400 ml-auto">
                              {c.weight}% weight · {c.primary_dimension.toUpperCase()}
                            </span>
                          </div>
                          <p className="mt-1.5 text-sm text-ink-700 dark:text-ink-300 leading-relaxed">{c.verdict}</p>
                        </div>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3 pt-1">
                        <div className="rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 p-3">
                          <p className="text-[10px] uppercase tracking-wide font-semibold text-emerald-700 dark:text-emerald-400 mb-1.5">Strengths</p>
                          <ul className="space-y-1">
                            {(c.strengths ?? []).map((s, i) => (
                              <li key={i} className="flex items-start gap-1.5 text-xs text-ink-700 dark:text-ink-300">
                                <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
                                <span>{s}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="rounded-lg bg-red-50/60 dark:bg-red-950/20 border border-red-200/60 dark:border-red-800/40 p-3">
                          <p className="text-[10px] uppercase tracking-wide font-semibold text-red-700 dark:text-red-400 mb-1.5">Gaps</p>
                          <ul className="space-y-1">
                            {(c.gaps ?? []).map((g, i) => (
                              <li key={i} className="flex items-start gap-1.5 text-xs text-ink-700 dark:text-ink-300">
                                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-red-500" aria-hidden="true" />
                                <span>{g}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      {c.next_action && (
                        <div className="rounded-lg bg-brand-50/60 dark:bg-brand-950/20 border border-brand-200/60 dark:border-brand-800/40 px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wide font-semibold text-brand-700 dark:text-brand-400 mb-0.5">Next Action (This Week)</p>
                          <p className="text-xs text-ink-700 dark:text-ink-300">{c.next_action}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800 p-5 space-y-2">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Criteria synthesis not yet available
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Re-run the pitchdeck analysis (Wave 24+) to generate the full 13-criteria breakdown. This section requires the latest analysis version.
                </p>
                <Link
                  href="/workspace/pitchdeck-analyze"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-1.5 transition-colors"
                >
                  Re-analyse now <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
            )}
          </ReportSection>

          {/* ── Risk Register ─────────────────────────────────────────────── */}
          {riskItems.length > 0 && (
            <ReportSection id="tbr-risk" title={t.secRisk}>
              <p className="text-sm text-ink-600 dark:text-ink-400">
                Dimensions that represent the highest investment risk — sorted by impact × gap.
              </p>
              <div className="space-y-3">
                {riskItems.map((d, i) => (
                  <div
                    key={d.key}
                    className="flex items-start gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50/40 dark:bg-red-950/20 p-4"
                  >
                    <span className="flex-none w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/40 border border-red-300 dark:border-red-700 flex items-center justify-center text-[11px] font-bold text-red-700 dark:text-red-300">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a
                          href={`#tbr-dim-${d.key}`}
                          className="font-semibold text-sm text-ink-800 dark:text-ink-100 hover:text-brand-600 dark:hover:text-brand-300"
                        >
                          {d.label}
                        </a>
                        <span className={cn("tabular-nums text-sm font-bold", bandColor(scoreBand(d.state.score)))}>
                          {d.state.score}/100
                        </span>
                        <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" aria-hidden="true" />
                      </div>
                      <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">
                        {d.weight}% weight · estimated {Math.round(d.weight * (1 - d.state.score / 100))} pts drag on total SVI
                      </p>
                      {d.state.insights[0] && (
                        <p className="text-sm text-ink-600 dark:text-ink-400 mt-1">{d.state.insights[0]}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ReportSection>
          )}

          {/* ── Improvement Roadmap ────────────────────────────────────────── */}
          {roadmapItems.length > 0 && (
            <ReportSection id="tbr-roadmap" title={t.secRoadmap}>
              <p className="text-sm text-ink-600 dark:text-ink-400">
                Top {roadmapItems.length} actions ranked by expected SVI lift (weight × gap to 70-point threshold).
              </p>
              <div className="space-y-3">
                {roadmapItems.map((d, i) => {
                  const lift = Math.round(d.weight * (70 - d.state.score) / 100);
                  return (
                    <div
                      key={d.key}
                      className="flex items-start gap-3 rounded-lg border border-brand-200 dark:border-brand-800 bg-brand-50/40 dark:bg-brand-950/20 p-4"
                    >
                      <span className="flex-none w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/40 border border-brand-300 dark:border-brand-700 flex items-center justify-center text-[11px] font-bold text-brand-700 dark:text-brand-300">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <a
                            href={`#tbr-dim-${d.key}`}
                            className="font-semibold text-sm text-ink-800 dark:text-ink-100 hover:text-brand-600 dark:hover:text-brand-300"
                          >
                            {d.label}
                          </a>
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 dark:text-brand-300">
                            <ArrowUpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                            +{lift} pts potential lift
                          </span>
                        </div>
                        <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">
                          Current: {d.state.score}/100 · Target: 70+ · {d.weight}% weight
                        </p>
                        <a
                          href={`/workspace/svi-evidence?dim=${d.key}`}
                          className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-brand-700 dark:text-brand-300 hover:underline"
                        >
                          Add evidence for {d.section} <ChevronRight className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ReportSection>
          )}

          {/* ── Cohort Compare ─────────────────────────────────────────────── */}
          <ReportSection id="tbr-cohort" title={t.secCohort}>
            <p className="text-sm text-ink-600 dark:text-ink-400">
              How this startup compares against Australian seed-stage peers by SVI band, based on anonymised BlockID Index data (PitchBook AU 2024–2026 seed cohort).
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-ink-200 dark:border-ink-700">
                    <th className="text-left py-2 pr-4 text-xs font-semibold text-ink-500 uppercase tracking-wide">Dimension</th>
                    <th className="text-center py-2 px-2 text-xs font-semibold text-ink-500 uppercase tracking-wide">This Startup</th>
                    <th className="text-center py-2 px-2 text-xs font-semibold text-ink-500 uppercase tracking-wide">AU Seed Median</th>
                    <th className="text-center py-2 pl-2 text-xs font-semibold text-ink-500 uppercase tracking-wide">AU Top Quartile</th>
                    <th className="text-right py-2 pl-4 text-xs font-semibold text-ink-500 uppercase tracking-wide">vs Median</th>
                  </tr>
                </thead>
                <tbody>
                  {DIM_ORDER.map((k) => {
                    const meta = DIMS[k];
                    const state = dimStates[k];
                    if (!state?.score) return null;
                    // AU seed medians sourced from BlockID anonymised cohort + PitchBook AU 2024-2026
                    const medians: Record<string, number> = {
                      ftv: 58, mpc: 52, ptd: 55, tre: 42, cgh: 48, iri: 45, lco: 50, svm: 47,
                    };
                    const topQ: Record<string, number> = {
                      ftv: 75, mpc: 70, ptd: 72, tre: 65, cgh: 68, iri: 64, lco: 68, svm: 68,
                    };
                    const median = medians[k] ?? 50;
                    const tq = topQ[k] ?? 68;
                    const delta = state.score - median;
                    return (
                      <tr key={k} className="border-b border-ink-100 dark:border-ink-800/60">
                        <td className="py-2 pr-4 font-medium text-ink-700 dark:text-ink-200">{meta.label}</td>
                        <td className="text-center py-2 px-2">
                          <span className={cn("font-bold tabular-nums", bandColor(scoreBand(state.score)))}>{state.score}</span>
                        </td>
                        <td className="text-center py-2 px-2 text-ink-500 dark:text-ink-400 tabular-nums">{median}</td>
                        <td className="text-center py-2 pl-2 text-ink-500 dark:text-ink-400 tabular-nums">{tq}</td>
                        <td className={cn("text-right py-2 pl-4 tabular-nums font-semibold text-sm",
                          delta > 0 ? "text-emerald-600 dark:text-emerald-400" : delta < 0 ? "text-red-600 dark:text-red-400" : "text-ink-500"
                        )}>
                          {delta > 0 ? `+${delta}` : delta}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-ink-50/60 dark:bg-ink-900/40">
                    <td className="py-2 pr-4 font-bold text-ink-800 dark:text-ink-100">Composite SVI</td>
                    <td className="text-center py-2 px-2">
                      <span className={cn("text-lg font-bold tabular-nums", bandColor(overallBand))}>{totalSvi}</span>
                    </td>
                    <td className="text-center py-2 px-2 text-ink-500 tabular-nums font-semibold">50</td>
                    <td className="text-center py-2 pl-2 text-ink-500 tabular-nums font-semibold">70</td>
                    <td className={cn("text-right py-2 pl-4 tabular-nums font-bold",
                      totalSvi > 50 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                    )}>
                      {totalSvi > 50 ? `+${totalSvi - 50}` : totalSvi - 50}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-ink-500 dark:text-ink-500 leading-snug">
              Benchmarks sourced from BlockID anonymised cohort data + PitchBook AU 2024–2026 seed-stage analysis.
              Industry: {industry ?? "Technology"} · Stage: {stage ?? "Seed"}.
              This is a directional comparison — individual startup profiles vary significantly.
            </p>
          </ReportSection>

          {/* ── Peer-5 Similarity Match (Wave 25C) ─────────────────────────── */}
          <ReportSection id="tbr-peers" title="Peer-5 Similarity Match">
            <PeerFiveSection
              projectId={projectId}
              shareToken={shareToken}
              industry={industry}
              stage={stage}
            />
          </ReportSection>

          {/* ── Methodology ────────────────────────────────────────────────── */}
          <ReportSection id="tbr-methodology" title={t.secMethodology}>
            <div className="space-y-4 text-sm text-ink-600 dark:text-ink-400">
              <div>
                <p className="font-semibold text-ink-800 dark:text-ink-100 mb-1">{t.methHeaderSvi}</p>
                <p>{t.methBodySvi}</p>
              </div>
              <div>
                <p className="font-semibold text-ink-800 dark:text-ink-100 mb-1">{t.methHeaderDims}</p>
                <ul className="space-y-1 list-none">
                  {DIM_ORDER.map((k) => (
                    <li key={k} className="flex gap-2">
                      <span className="font-mono text-[10px] bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-400 rounded px-1 py-0.5 self-start mt-0.5">{k.toUpperCase()}</span>
                      <span><strong>{DIMS[k].label}</strong> — {DIMS[k].weight}% weight.</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-semibold text-ink-800 dark:text-ink-100 mb-1">{t.methHeaderCriteria}</p>
                <p>{t.methBodyCriteria}</p>
              </div>
              <div>
                <p className="font-semibold text-ink-800 dark:text-ink-100 mb-1">{t.methHeaderValuation}</p>
                <p>{t.methBodyValuation}</p>
              </div>
              <div>
                <p className="font-semibold text-ink-800 dark:text-ink-100 mb-1">{t.methHeaderAi}</p>
                <p>{t.methBodyAi}</p>
              </div>
              <div className="border-t border-ink-200 dark:border-ink-800 pt-3 text-[11px] text-ink-400 dark:text-ink-500">
                <p>{t.methFooter(new Date().toLocaleDateString(locale === "vi" ? "vi-VN" : "en-AU", { day: "numeric", month: "long", year: "numeric" }))}</p>
              </div>
            </div>
          </ReportSection>

          {/* Footer */}
          <div className="border-t border-ink-200 dark:border-ink-800 pt-4 pb-8 flex items-center justify-between gap-4 text-xs text-ink-500 dark:text-ink-500">
            <p>{t.footerDisclaimer}</p>
            <Link
              href="/workspace/pitchdeck-analyze"
              className="text-brand-600 dark:text-brand-400 hover:underline shrink-0"
            >
              {t.footerReanalyse}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
