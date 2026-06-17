"use client";

// "Why this number?" explainer card — sits above DeepValuationCard and breaks
// down WHY the SVI is what it is. The dashboard request was for every summary
// to have an obvious drill-down ("33 users → click → user list"). For the SVI
// number itself the drill-down is the breakdown of how each dimension
// contributes — surfaced here with a radar chart, contribution bars and an
// in-line "guide me" reference for each dimension.

import * as React from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Compass,
  HelpCircle,
  Info,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SVIAnalysis } from "@/lib/svi-analysis";

interface Props {
  analysis: SVIAnalysis;
}

const DIMENSION_GUIDES: Record<string, { title: string; whyItMatters: string; quickWins: string[]; deepLink: string }> = {
  ftv: {
    title: "Founder & Team Value",
    whyItMatters: "Investors back people first. A complete founder profile + signed team agreements unlocks roughly 15% of the index.",
    quickWins: [
      "Add a LinkedIn URL to your profile",
      "Document founder experience + domain fit on /workspace/profile",
      "Upload a team org chart to the Data Room",
    ],
    deepLink: "/workspace/profile",
  },
  mpc: {
    title: "Market & Problem Clarity",
    whyItMatters: "Without a clear problem-customer fit, valuation drops to TAM-percentile fallbacks. This is the highest-leverage dimension at idea/early stage.",
    quickWins: [
      "Run 10 customer-discovery calls (Mom Test framework)",
      "Publish a Problem-Customer-Solution canvas",
      "Add evidence of demand (waitlist signups, LOIs)",
    ],
    deepLink: "/workspace/evaluation",
  },
  ptd: {
    title: "Product & Technical Depth",
    whyItMatters: "A live product (URL or GitHub) signals execution and removes the 'just a deck' discount investors apply.",
    quickWins: [
      "Publish a public landing page or live demo URL",
      "Connect GitHub so commit cadence + stars are evidence",
      "Document the tech stack + roadmap",
    ],
    deepLink: "/dashboard/svi#evidence",
  },
  tre: {
    title: "Traction & Revenue Evidence",
    whyItMatters: "The single biggest valuation multiplier. A$1 of paying revenue moves you from anchor-based pricing to multiple-based pricing.",
    quickWins: [
      "Log your first revenue via /dashboard/finance",
      "Connect Stripe for real-time MRR",
      "Upload an LOI or contract as evidence",
    ],
    deepLink: "/dashboard/finance",
  },
  cgh: {
    title: "Cap Table & Governance Health",
    whyItMatters: "ESOP pool, founder vesting and a signed SHA close the 'governance discount' VCs apply at term-sheet stage.",
    quickWins: [
      "Set up ESOP pool via /dashboard/esop",
      "Sign founder vesting (4yr / 1yr cliff)",
      "Upload signed SHA to Data Room",
    ],
    deepLink: "/dashboard/esop",
  },
  iri: {
    title: "Investor Readiness",
    whyItMatters: "Pitch deck + data room + financial model — the 3 things every VC asks for in the first email.",
    quickWins: [
      "Generate a 10-slide pitch deck via the Pitch Deck builder",
      "Upload financial projections (3-scenario)",
      "Curate Data Room into 7 folders",
    ],
    deepLink: "/workspace/data-room",
  },
  lco: {
    title: "Legal & Compliance",
    whyItMatters: "ASIC registration + ABN + IP protection. Cheap to fix and removes red flags in DD.",
    quickWins: [
      "Confirm ASIC registration + ABN active",
      "File IP / trademark applications if relevant",
      "Add a privacy + terms page to your website",
    ],
    deepLink: "/tools/asic",
  },
  svm: {
    title: "Strategic Vision & Moat",
    whyItMatters: "What stops a competitor catching up? Network effects, data flywheel, regulatory moat — these unlock higher multiples at growth stage.",
    quickWins: [
      "Document your moat in a 1-page memo",
      "Map 3 competitors + how you're differentiated",
      "Highlight network/data effects in the deck",
    ],
    deepLink: "/dashboard/svi#moat",
  },
};

function ContributionBar({ sub }: { sub: SVIAnalysis["subs"][number] }) {
  const guide = DIMENSION_GUIDES[sub.key];
  const [open, setOpen] = React.useState(false);

  const color = sub.value >= 70 ? "bg-emerald-500" : sub.value >= 50 ? "bg-blue-500" : sub.value >= 30 ? "bg-amber-500" : "bg-rose-500";
  const textColor = sub.value >= 70 ? "text-emerald-700 dark:text-emerald-400" : sub.value >= 50 ? "text-blue-700 dark:text-blue-400" : sub.value >= 30 ? "text-amber-700 dark:text-amber-400" : "text-rose-700 dark:text-rose-400";
  const adjustmentSign = sub.adjustment >= 0 ? "+" : "";

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <span className="text-sm font-semibold">{guide?.title ?? sub.label}</span>
              <span className={cn("text-sm font-bold tabular-nums", textColor)}>{Math.round(sub.value)}/100</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.min(100, sub.value)}%` }} />
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Contributes <span className={cn("font-semibold", sub.adjustment >= 0 ? "text-emerald-600" : "text-rose-600")}>{adjustmentSign}{sub.adjustment.toFixed(1)}</span> SVI points
            </p>
          </div>
          <HelpCircle className={cn("h-4 w-4 transition-transform shrink-0", open ? "text-blue-500 rotate-180" : "text-muted-foreground")} />
        </div>
      </button>

      {open && guide && (
        <div className="px-4 pb-4 pt-1 border-t border-border bg-muted/10 space-y-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Why this matters</p>
            <p className="text-xs text-foreground leading-relaxed">{guide.whyItMatters}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Quick wins for this dimension</p>
            <ul className="space-y-0.5">
              {guide.quickWins.map((qw, i) => (
                <li key={i} className="text-xs text-foreground">&bull; {qw}</li>
              ))}
            </ul>
          </div>
          {sub.evidence?.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 mb-1">Evidence we found</p>
              <ul className="space-y-0.5">
                {sub.evidence.slice(0, 3).map((e, i) => (
                  <li key={i} className="text-xs text-emerald-700 dark:text-emerald-400">✓ {e}</li>
                ))}
              </ul>
            </div>
          )}
          {sub.gaps?.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-1">Gaps to close</p>
              <ul className="space-y-0.5">
                {sub.gaps.slice(0, 3).map((g, i) => (
                  <li key={i} className="text-xs text-amber-700 dark:text-amber-400">○ {g}</li>
                ))}
              </ul>
            </div>
          )}
          <a href={guide.deepLink} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1">
            Open the relevant tool →
          </a>
        </div>
      )}
    </div>
  );
}

/* ─── Compact SVI radar (SVG, no external lib) ─────────────────────────── */

function RadarChart({ subs }: { subs: SVIAnalysis["subs"] }) {
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 20;
  const angleStep = (2 * Math.PI) / subs.length;

  function point(value: number, i: number) {
    const angle = -Math.PI / 2 + i * angleStep;
    const ratio = Math.max(0, Math.min(1, value / 100));
    return {
      x: cx + Math.cos(angle) * r * ratio,
      y: cy + Math.sin(angle) * r * ratio,
    };
  }

  const points = subs.map((sub, i) => point(sub.value, i));
  const path = points.map((p, i) => (i === 0 ? `M ${p.x},${p.y}` : `L ${p.x},${p.y}`)).join(" ") + " Z";

  // Grid: 25, 50, 75, 100 rings
  const gridRings = [25, 50, 75, 100].map((v) => {
    const ringPoints = subs.map((_, i) => {
      const angle = -Math.PI / 2 + i * angleStep;
      const ratio = v / 100;
      return `${cx + Math.cos(angle) * r * ratio},${cy + Math.sin(angle) * r * ratio}`;
    });
    return ringPoints.join(" ");
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto block">
      {/* Grid rings */}
      {gridRings.map((pts, i) => (
        <polygon
          key={i}
          points={pts}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.1}
          strokeWidth={i === gridRings.length - 1 ? 1.5 : 0.7}
        />
      ))}
      {/* Spokes + labels */}
      {subs.map((sub, i) => {
        const angle = -Math.PI / 2 + i * angleStep;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        const labelX = cx + Math.cos(angle) * (r + 12);
        const labelY = cy + Math.sin(angle) * (r + 12);
        return (
          <g key={sub.key}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="currentColor" strokeOpacity={0.12} />
            <text
              x={labelX}
              y={labelY}
              fontSize={9}
              fill="currentColor"
              fillOpacity={0.7}
              textAnchor={Math.cos(angle) > 0.3 ? "start" : Math.cos(angle) < -0.3 ? "end" : "middle"}
              dominantBaseline={Math.sin(angle) > 0.3 ? "hanging" : Math.sin(angle) < -0.3 ? "auto" : "central"}
              fontWeight={600}
            >
              {sub.key.toUpperCase()}
            </text>
          </g>
        );
      })}
      {/* User polygon */}
      <path d={path} fill="rgb(59 130 246 / 0.18)" stroke="rgb(59 130 246)" strokeWidth={2} />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill="rgb(59 130 246)" />
      ))}
    </svg>
  );
}

/* ─── Main card ────────────────────────────────────────────────────────── */

export function SviExplainerCard({ analysis }: Props) {
  const subs = analysis.subs ?? [];
  if (subs.length === 0) return null;

  const sortedByContribution = [...subs].sort((a, b) => b.adjustment - a.adjustment);
  const top3 = sortedByContribution.slice(0, 3);
  const bottom3 = sortedByContribution.slice(-3).reverse();

  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-6">
      <div>
        <h3 className="text-base font-bold flex items-center gap-2">
          <Compass className="h-4 w-4 text-blue-500" />
          Why your SVI is {analysis.totalSVI}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Every dimension contributes <code className="text-[10px] bg-muted px-1 py-0.5 rounded">score × weight</code> to the total.
          Click any bar to see why it matters and exactly how to lift it.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        {/* Radar chart */}
        <div className="text-foreground">
          <RadarChart subs={subs} />
          <div className="mt-3 flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full bg-blue-500" />
              Your scores
            </span>
            <span>Rings = 25 / 50 / 75 / 100</span>
          </div>
        </div>

        {/* Top / bottom contributors */}
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-2 flex items-center gap-1.5">
              <ArrowUpRight className="h-3 w-3" /> Top contributors
            </p>
            <div className="space-y-1.5">
              {top3.map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-emerald-50/40 dark:bg-emerald-950/15">
                  <span className="text-xs font-medium">{DIMENSION_GUIDES[s.key]?.title ?? s.label}</span>
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{s.adjustment >= 0 ? "+" : ""}{s.adjustment.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-1.5">
              <ArrowDownRight className="h-3 w-3" /> Biggest drags (highest leverage to fix)
            </p>
            <div className="space-y-1.5">
              {bottom3.map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-amber-50/40 dark:bg-amber-950/15">
                  <span className="text-xs font-medium">{DIMENSION_GUIDES[s.key]?.title ?? s.label}</span>
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-400 tabular-nums">{s.adjustment >= 0 ? "+" : ""}{s.adjustment.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Full breakdown */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
          <Info className="h-3 w-3" /> Full dimension breakdown — click any row for guide
        </p>
        <div className="space-y-2">
          {subs.map((sub) => <ContributionBar key={sub.key} sub={sub} />)}
        </div>
      </div>

      {/* AI insight */}
      <div className="rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40 p-3 flex items-start gap-2">
        <Sparkles className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-900 dark:text-blue-300 leading-relaxed">
          The 3 amber rows above are your highest-leverage fixes. Closing them typically lifts SVI by{" "}
          <strong>10–25 points</strong> within 30 days. Each row links to the exact tool you need.
        </p>
      </div>
    </div>
  );
}
