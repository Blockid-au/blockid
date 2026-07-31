"use client";

import * as React from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Edit3,
  ExternalLink,
  FileText,
  Target,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PillarStats } from "./page";

interface Props {
  stats: PillarStats[];
  totalArticles: number;
}

function statusFromTarget(actual: number, target: number): "ok" | "warn" | "bad" {
  if (actual >= target) return "ok";
  if (actual >= target * 0.5) return "warn";
  return "bad";
}

function PillarCard({ stats }: { stats: PillarStats }) {
  const [open, setOpen] = React.useState(false);
  const status = statusFromTarget(stats.postsThisWeek, stats.weeklyTarget);
  const monthlyTarget = stats.weeklyTarget * 4;
  const monthlyStatus = statusFromTarget(stats.postsLast30d, monthlyTarget);

  return (
    <div className={cn(
      "rounded-xl border bg-card overflow-hidden",
      status === "bad" ? "border-red-200 dark:border-red-800/40" :
      status === "warn" ? "border-amber-200 dark:border-amber-700/50" :
      "border-border"
    )}>
      <button onClick={() => setOpen(!open)} className="w-full px-5 py-4 text-left hover:bg-muted/30 transition-colors">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            {status === "ok" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> :
             status === "warn" ? <Target className="h-4 w-4 text-amber-500" /> :
             <XCircle className="h-4 w-4 text-red-400" />}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm">{stats.name}</h3>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">{stats.description}</span>
            </div>

            <div className="flex items-center gap-4 mt-2 text-xs">
              <span className={cn(
                "font-semibold",
                status === "ok" ? "text-emerald-600" :
                status === "warn" ? "text-amber-600" :
                "text-red-500"
              )}>
                This week: {stats.postsThisWeek}/{stats.weeklyTarget}
              </span>
              <span className={cn(
                "font-semibold",
                monthlyStatus === "ok" ? "text-emerald-600" :
                monthlyStatus === "warn" ? "text-amber-600" :
                "text-red-500"
              )}>
                Last 30d: {stats.postsLast30d}/{monthlyTarget}
              </span>
              <span className="text-muted-foreground">Total: {stats.totalPosts}</span>
            </div>
          </div>

          <div className="shrink-0 text-muted-foreground mt-1">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-border px-5 py-4 space-y-3 bg-muted/10">
          {stats.recentPosts.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No posts in this pillar yet. Create one with the &ldquo;New post&rdquo; button below.</p>
          ) : (
            <>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recent posts</p>
              <div className="space-y-2">
                {stats.recentPosts.map((p) => (
                  <Link
                    key={p.slug}
                    href={`/insights/${p.slug}`}
                    className="flex items-center gap-2 text-xs hover:text-blue-600 transition-colors group"
                  >
                    <FileText className="h-3 w-3 text-muted-foreground group-hover:text-blue-600" />
                    <span className="flex-1 truncate">{p.title}</span>
                    <span className="text-muted-foreground shrink-0">
                      {new Date(p.publishedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}

          <div className="flex items-center gap-3 pt-3 border-t border-border/50">
            <a
              href={`/api/insights/generate?pillar=${stats.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              <Edit3 className="h-3 w-3" />
              Generate new post
            </a>
            <a
              href={`https://www.linkedin.com/company/startup-value-index/admin/page-posts/published/`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
              LinkedIn queue
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export function ContentPillarsClient({ stats, totalArticles }: Props) {
  const overallWeekly = stats.reduce((s, p) => s + p.postsThisWeek, 0);
  const overallTarget = stats.reduce((s, p) => s + p.weeklyTarget, 0);
  const overallMonth = stats.reduce((s, p) => s + p.postsLast30d, 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-blue-600" />
          Content Pillar Tracker
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          CMO weekly publishing dashboard · 7 pillars × LinkedIn queue · CEO-aligned content calendar
        </p>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">This Week</p>
          <p className="text-2xl font-bold mt-1">
            {overallWeekly}/<span className="text-muted-foreground text-base">{overallTarget}</span>
          </p>
          <p className="text-xs text-muted-foreground">posts published</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Last 30 Days</p>
          <p className="text-2xl font-bold mt-1">{overallMonth}</p>
          <p className="text-xs text-muted-foreground">posts published</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Active Pillars</p>
          <p className="text-2xl font-bold mt-1">
            {stats.filter((p) => p.postsLast30d > 0).length}/<span className="text-muted-foreground text-base">{stats.length}</span>
          </p>
          <p className="text-xs text-muted-foreground">with recent activity</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Library</p>
          <p className="text-2xl font-bold mt-1">{totalArticles}</p>
          <p className="text-xs text-muted-foreground">all-time articles</p>
        </div>
      </div>

      {/* Status banner */}
      {overallWeekly < overallTarget * 0.5 && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4 text-sm text-amber-800 dark:text-amber-400">
          <strong>Pacing warning:</strong> Only {overallWeekly} of {overallTarget} target posts published this week. CMO orchestrator should escalate to /api/insights/generate or schedule a content sprint.
        </div>
      )}

      {/* Pillar cards */}
      <div className="space-y-3">
        {stats.map((p) => <PillarCard key={p.id} stats={p} />)}
      </div>

      {/* Footer actions */}
      <div className="rounded-xl border border-dashed border-border p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Need to publish manually?</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Drop a new .md file with <code className="bg-muted px-1 rounded">pillar: &quot;...&quot;</code> front-matter into <code className="bg-muted px-1 rounded">content/insights/</code> — it&apos;ll appear here on next refresh.
          </p>
        </div>
        <Link
          href="/insights"
          className="text-xs text-blue-600 hover:text-blue-700 font-medium whitespace-nowrap"
        >
          View live insights →
        </Link>
      </div>

      <p className="text-xs text-muted-foreground text-center pb-4">
        Pillar inference uses keyword matching when <code className="bg-muted px-1 rounded">pillar</code> front-matter is missing. Add explicit pillar field to articles for accurate categorisation.
      </p>
    </div>
  );
}
