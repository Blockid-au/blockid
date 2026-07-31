"use client";

import * as React from "react";
import {
  AlertTriangle,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Rocket,
  Target,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AcceleratorPageProps } from "./page";

/* ─── Accelerator Data ───────────────────────────────────────────────────── */

interface AcceleratorProgram {
  id: string;
  name: string;
  country: "AU" | "US" | "GLOBAL";
  type: "equity" | "grant" | "no-equity";
  chequeSize: string;
  equity: string;
  minSvi: number;
  minStage: number;
  deadline: string; // ISO date of next application close
  cohortStart: string;
  url: string;
  tags: string[];
  requirements: string[];
  successRate: string; // "3% acceptance"
}

const PROGRAMS: AcceleratorProgram[] = [
  {
    id: "antler",
    name: "Antler",
    country: "AU",
    type: "equity",
    chequeSize: "A$100K",
    equity: "9%",
    minSvi: 50,
    minStage: 0,
    deadline: "2026-08-01",
    cohortStart: "2026-10-01",
    url: "https://www.antler.co/location/sydney",
    tags: ["Pre-idea OK", "Co-founder matching", "Global"],
    requirements: [
      "Strong founder background (domain expertise or technical)",
      "Willingness to find co-founder in cohort",
      "SVI 50+ recommended (can apply lower)",
    ],
    successRate: "1–2%",
  },
  {
    id: "startmate",
    name: "Startmate",
    country: "AU",
    type: "equity",
    chequeSize: "A$120K",
    equity: "7.5%",
    minSvi: 60,
    minStage: 1,
    deadline: "2026-09-15",
    cohortStart: "2026-11-01",
    url: "https://www.startmate.com",
    tags: ["AU-focused", "Strong network", "B2B preferred"],
    requirements: [
      "MVP or validated idea with user evidence",
      "AU/NZ founding team preferred",
      "SVI 60+ strongly recommended",
    ],
    successRate: "3–4%",
  },
  {
    id: "yc",
    name: "Y Combinator",
    country: "US",
    type: "equity",
    chequeSize: "US$500K",
    equity: "7%",
    minSvi: 70,
    minStage: 2,
    deadline: "2026-10-01",
    cohortStart: "2027-01-01",
    url: "https://www.ycombinator.com/apply",
    tags: ["Global prestige", "US relocation likely", "Most competitive"],
    requirements: [
      "Strong product with early traction preferred",
      "Technical co-founder highly valued",
      "SVI 70+ recommended for AU applicants",
    ],
    successRate: "1–2%",
  },
  {
    id: "techstars",
    name: "Techstars",
    country: "GLOBAL",
    type: "equity",
    chequeSize: "US$120K",
    equity: "6%",
    minSvi: 60,
    minStage: 1,
    deadline: "2026-07-30",
    cohortStart: "2026-10-01",
    url: "https://www.techstars.com/apply",
    tags: ["Vertical focus", "Corporate partners", "US/global"],
    requirements: [
      "Revenue or strong traction evidence",
      "Alignment with specific vertical cohort",
      "Clear market fit documentation",
    ],
    successRate: "1%",
  },
  {
    id: "skydeck",
    name: "SkyDeck (Berkeley)",
    country: "US",
    type: "equity",
    chequeSize: "US$200K",
    equity: "4%",
    minSvi: 65,
    minStage: 1,
    deadline: "2026-08-15",
    cohortStart: "2026-11-01",
    url: "https://skydeck.berkeley.edu",
    tags: ["UC Berkeley", "Deep tech", "AI/biotech focus"],
    requirements: [
      "Deep tech, AI, or life sciences preferred",
      "Defensible IP or technical moat",
    ],
    successRate: "2–3%",
  },
  {
    id: "mv1",
    name: "MVi (Melbourne Uni)",
    country: "AU",
    type: "no-equity",
    chequeSize: "A$20K",
    equity: "0%",
    minSvi: 40,
    minStage: 0,
    deadline: "2026-07-15",
    cohortStart: "2026-08-01",
    url: "https://www.unimelb.edu.au/accelerator",
    tags: ["No equity", "AU only", "University network"],
    requirements: ["AU founding team", "Pre-revenue OK"],
    successRate: "10–15%",
  },
  {
    id: "cicada",
    name: "Cicada Innovations",
    country: "AU",
    type: "no-equity",
    chequeSize: "Workspace + Network",
    equity: "0%",
    minSvi: 50,
    minStage: 1,
    deadline: "2026-09-01",
    cohortStart: "2026-10-01",
    url: "https://cicadainnovations.com",
    tags: ["Deep tech", "IP-heavy", "Sydney"],
    requirements: ["Deep tech or science-based startup", "AU incorporation preferred"],
    successRate: "8–12%",
  },
];

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function daysUntil(iso: string): number {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function readinessColor(pct: number): string {
  if (pct >= 80) return "text-emerald-600";
  if (pct >= 60) return "text-blue-600";
  if (pct >= 40) return "text-amber-600";
  return "text-red-500";
}

function readinessBg(pct: number): string {
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 60) return "bg-blue-500";
  if (pct >= 40) return "bg-amber-400";
  return "bg-red-400";
}

function getReadiness(svi: number, stage: number, program: AcceleratorProgram): number {
  const sviScore = Math.min(100, Math.round((svi / program.minSvi) * 60));
  const stageScore = stage >= program.minStage ? 40 : Math.max(0, 40 - (program.minStage - stage) * 15);
  return Math.min(100, sviScore + stageScore);
}

/* ─── Program Card ───────────────────────────────────────────────────────── */

function ProgramCard({
  program,
  svi,
  stage,
}: {
  program: AcceleratorProgram;
  svi: number;
  stage: number;
}) {
  const days = daysUntil(program.deadline);
  const readiness = getReadiness(svi, stage, program);
  const isOpen = days > 0;
  const isUrgent = days > 0 && days <= 30;
  const isMissed = days <= 0;

  return (
    <div className={cn(
      "rounded-xl border p-5 space-y-4 transition-all",
      isUrgent ? "border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/10" : "border-border bg-card",
      isMissed ? "opacity-60" : "",
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-base">{program.name}</h3>
            <span className={cn(
              "text-[10px] font-semibold px-1.5 py-0.5 rounded",
              program.country === "AU" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
              program.country === "US" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" :
              "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
            )}>{program.country}</span>
            <span className={cn(
              "text-[10px] font-semibold px-1.5 py-0.5 rounded",
              program.type === "no-equity" ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"
            )}>{program.equity === "0%" ? "No equity" : `${program.equity} equity`}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{program.chequeSize} · {program.successRate} acceptance</p>
        </div>
        <a
          href={program.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
        >
          Apply <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Readiness bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-muted-foreground">Your readiness</span>
          <span className={cn("text-sm font-bold", readinessColor(readiness))}>{readiness}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", readinessBg(readiness))}
            style={{ width: `${readiness}%` }}
          />
        </div>
        {readiness < 60 && (
          <p className="text-xs text-muted-foreground mt-1">
            Need SVI {program.minSvi}+ (you have {svi}) · Stage {program.minStage}+ (you are Stage {stage})
          </p>
        )}
      </div>

      {/* Deadline */}
      <div className={cn(
        "flex items-center gap-2 text-sm font-medium rounded-lg px-3 py-2",
        isMissed ? "bg-muted text-muted-foreground" :
        isUrgent ? "bg-amber-100 dark:bg-amber-900/20 text-amber-800 dark:text-amber-400" :
        "bg-muted/50 text-foreground"
      )}>
        {isMissed ? <XCircle className="h-4 w-4" /> : isUrgent ? <AlertTriangle className="h-4 w-4" /> : <Calendar className="h-4 w-4 text-muted-foreground" />}
        <span>
          {isMissed ? `Closed (${formatDate(program.deadline)})` :
          isUrgent ? `⚡ ${days} days left — closes ${formatDate(program.deadline)}` :
          `Closes ${formatDate(program.deadline)} · ${days} days`}
        </span>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5">
        {program.tags.map((t) => (
          <span key={t} className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{t}</span>
        ))}
      </div>

      {/* Requirements */}
      <div className="space-y-1">
        {program.requirements.map((r) => {
          const met = (r.includes(`SVI`) && svi >= program.minSvi) ||
                       (r.includes(`Stage`) && stage >= program.minStage);
          const relevant = r.includes("SVI") || r.includes("Stage");
          return (
            <div key={r} className="flex items-start gap-2 text-xs">
              {relevant ? (
                met ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" /> :
                      <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
              )}
              <span className={cn(relevant && !met ? "text-red-500" : "text-muted-foreground")}>{r}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Evidence Binder ────────────────────────────────────────────────────── */

function EvidenceBinder({
  svi,
  stage,
  startupName,
  milestones,
}: {
  svi: number;
  stage: number;
  startupName: string;
  milestones: AcceleratorPageProps["milestones"];
}) {
  const items = [
    { label: "SVI Score", value: `${svi}/300`, done: svi >= 60, icon: Target },
    { label: "Startup Stage", value: `Stage ${stage} of 7`, done: stage >= 1, icon: TrendingUp },
    { label: "Product/MVP evidence", value: "Check /dashboard/svi", done: stage >= 2, icon: Rocket },
    { label: "Cap table documented", value: "Check /dashboard/esop", done: false, icon: Award },
    { label: "Financial projections", value: "Check /dashboard/finance", done: false, icon: BookOpen },
    { label: "Pitch deck uploaded", value: "Upload to Data Room", done: false, icon: BookOpen },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">Pitch Evidence Binder</h3>
        <span className="text-xs text-muted-foreground">— {startupName}</span>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-3">
            {item.done
              ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              : <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />
            }
            <div className="flex-1 min-w-0">
              <span className={cn("text-sm", item.done ? "text-foreground" : "text-muted-foreground")}>{item.label}</span>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">{item.value}</span>
          </div>
        ))}
      </div>

      {milestones.length > 0 && (
        <div className="pt-3 border-t border-border">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Recent SVI Milestones</p>
          <div className="space-y-1.5">
            {milestones.slice(0, 4).map((m) => (
              <div key={m.id} className="flex items-start gap-2 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <span className="text-muted-foreground">{m.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <a
        href="/dashboard/data-room"
        className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-700 font-medium"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Open Data Room to upload documents
      </a>
    </div>
  );
}

/* ─── Main ───────────────────────────────────────────────────────────────── */

export function AcceleratorClient({ currentSvi, stage, startupName, milestones }: AcceleratorPageProps) {
  const [filter, setFilter] = React.useState<"all" | "au" | "open">("open");

  const filtered = PROGRAMS.filter((p) => {
    const days = daysUntil(p.deadline);
    if (filter === "au") return p.country === "AU";
    if (filter === "open") return days > 0;
    return true;
  }).sort((a, b) => {
    const dA = daysUntil(a.deadline);
    const dB = daysUntil(b.deadline);
    if (dA <= 0 && dB > 0) return 1;
    if (dB <= 0 && dA > 0) return -1;
    return dA - dB;
  });

  const urgentCount = PROGRAMS.filter((p) => {
    const d = daysUntil(p.deadline);
    return d > 0 && d <= 45;
  }).length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Rocket className="h-6 w-6 text-blue-600" />
          Accelerator Tracker
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {startupName} · SVI {currentSvi} · Stage {stage} — track application deadlines and readiness
        </p>
      </div>

      {urgentCount > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
          <Zap className="h-5 w-5 text-amber-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">
              {urgentCount} deadline{urgentCount > 1 ? "s" : ""} closing in the next 45 days
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-500 mt-0.5">
              Prioritise your applications — filter by &ldquo;Open only&rdquo; to see what&apos;s active.
            </p>
          </div>
        </div>
      )}

      {/* SVI summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{currentSvi}</p>
          <p className="text-xs text-muted-foreground mt-1">Current SVI</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-2xl font-bold">Stage {stage}</p>
          <p className="text-xs text-muted-foreground mt-1">Maturity level</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">
            {PROGRAMS.filter((p) => getReadiness(currentSvi, stage, p) >= 60).length}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Programs you qualify for</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Programs */}
        <div className="lg:col-span-2 space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-2">
            {(["open", "au", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "text-xs font-medium px-3 py-1.5 rounded-lg transition-colors",
                  filter === f
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {f === "open" ? "Open only" : f === "au" ? "AU programs" : "All programs"}
              </button>
            ))}
            <span className="text-xs text-muted-foreground ml-2">{filtered.length} shown</span>
          </div>

          {filtered.map((p) => (
            <ProgramCard key={p.id} program={p} svi={currentSvi} stage={stage} />
          ))}
        </div>

        {/* Evidence Binder */}
        <div>
          <EvidenceBinder
            svi={currentSvi}
            stage={stage}
            startupName={startupName}
            milestones={milestones}
          />

          {/* Timeline reminder */}
          <div className="mt-4 rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Upcoming Deadlines</h3>
            </div>
            <div className="space-y-2">
              {PROGRAMS.filter((p) => daysUntil(p.deadline) > 0)
                .sort((a, b) => daysUntil(a.deadline) - daysUntil(b.deadline))
                .slice(0, 5)
                .map((p) => {
                  const d = daysUntil(p.deadline);
                  return (
                    <div key={p.id} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{p.name}</span>
                      <span className={cn(
                        "font-semibold",
                        d <= 14 ? "text-red-500" : d <= 30 ? "text-amber-600" : "text-muted-foreground"
                      )}>
                        {d}d
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center pb-4">
        Deadlines are indicative — always verify at the accelerator&apos;s official site before applying.
      </p>
    </div>
  );
}
