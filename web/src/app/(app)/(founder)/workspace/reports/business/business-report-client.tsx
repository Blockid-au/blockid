"use client";

// Trusted Business Report — web surface.
//
// G13-W1-R1 (S-R1): the body now renders from the `ReportV2` contract
// (src/lib/report-v2/schema.ts) through `<TbrReportV2>` — cover, executive,
// 8 dimension chapters (one deterministic SVG visual each), valuation, phase
// gates, money on the table, 90-day plan, appendix. Stored v1 snapshots
// (dim_results / criterion_results) are lifted into v2 on the client by
// `fromSnapshot()`; when the server already has a `report_v2` row it is
// passed in as `initialReportV2` and used as-is.
//
// What stays from the pre-S-R1 client: localStorage → API hydration, the
// share / PDF / print / locale header, the sticky TOC, investor leads and
// views (founder-only), Peer-5 similarity, the live Action Plan widget and
// the Q&A chat.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { getTbrStrings, type TbrLocale } from "@/lib/i18n/tbr-strings";
import { TbrInvestorViews } from "@/components/tbr/tbr-investor-views";
import { TbrQaChat } from "@/components/tbr/tbr-qa-chat";
import { ActionPlan } from "@/components/score/ActionPlan";
import { TbrReportV2, tbrV2Toc, type TbrUnlockProps } from "@/components/tbr/v2/report";
import { ReportPaywallGate, type ReportPaywallQuote } from "@/components/paywall/ReportPaywallGate";
import { emitClientEvent } from "@/lib/analytics/client-emit";
import { fromSnapshot, type CohortBenchmarkInput, type SnapshotCriterionState, type SnapshotDimState } from "@/lib/report-v2/adapter";
import type { ReportV2 } from "@/lib/report-v2/schema";
import { FileText, ChevronRight } from "lucide-react";
import { ApiError, userErrorMessage } from "@/lib/ui/user-error";

// ── G16-B: paywall access (read-only; the confirm step is the gate) ─────────

/** Shape of GET /api/reports/access — what the page needs to decide the cut and quote. */
export interface ReportAccessInfo {
  projectId: string | null;
  included: boolean;
  paidOrderId: string | null;
  quote: ReportPaywallQuote;
  creditBalance: number;
  hasSubscription: boolean;
  price: { sku: string; amount_cents: number; label: string };
}

/**
 * Pure: which tier the founder page lifts a v1 snapshot into and which
 * unlock mode the rail shows. A stored document keeps its own tier; only
 * the read-time lift used to say "standard" for everyone (the silent free
 * → full leak G16 closes).
 */
export function resolveTbrAccess(
  stored: ReportV2 | null,
  access: ReportAccessInfo | null,
): { liftTier: "free" | "standard"; unlockMode: TbrUnlockProps["mode"] | null } {
  const owns = Boolean(access?.paidOrderId);
  const included = Boolean(access?.included);
  const liftTier: "free" | "standard" = owns || included ? "standard" : "free";
  // G16 review P1-2: a stored `tier: "standard"` is only trusted when the
  // caller owns a paid order or the plan includes the report — the deck
  // analyser (`/api/pitchdeck/save-snapshot`) stores every snapshot as
  // standard without charging, which handed free founders the full document.
  const effectiveTier = stored ? (stored.tier === "free" || owns || included ? stored.tier : "free") : liftTier;
  if (effectiveTier !== "free") return { liftTier, unlockMode: null };
  return { liftTier, unlockMode: owns ? "purchased" : included ? "included" : "buy" };
}

// ── Persisted state (localStorage / API / DB row) ────────────────────────────

type CriterionState = SnapshotCriterionState;
type DimState = SnapshotDimState & { status: string; score: number | null };

export interface PersistedState {
  savedAt: number;
  dimStates: Record<string, DimState>;
  criterionStates?: CriterionState[];
  completed: number;
  total: number;
  totalMs: number | null;
  done: boolean;
  industry: string | null;
  stage?: string | null;
  /** Set by the API / share page when the DB row is known. */
  snapshotId?: string | null;
  startupName?: string | null;
  /** `svi_snapshots.svi_total` — the stored headline score (the adapter otherwise re-derives it from the dims). */
  sviTotal?: number | null;
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
  return "text-ink-500 dark:text-ink-400";
}

// ── TOC ──────────────────────────────────────────────────────────────────────

function TocNav({
  activeId,
  t,
  items,
}: {
  activeId: string;
  t: ReturnType<typeof getTbrStrings>;
  items: Array<{ label: string; items: Array<{ id: string; label: string }> }>;
}) {
  return (
    <nav aria-label="Report sections" className="hidden xl:block sticky top-24 self-start w-56 shrink-0 print:hidden">
      <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-ink-500 dark:text-ink-400 mb-3">{t.tocContents}</p>
      <div className="space-y-4">
        {items.map((group) => (
          <div key={group.label}>
            <p className="text-[9px] uppercase tracking-[0.2em] font-bold text-muted dark:text-ink-600 px-2 mb-1">{group.label}</p>
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

function ReportSection({ id, title, children, className }: { id: string; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("scroll-mt-24 space-y-4 print:break-inside-avoid print:pt-6", className)} aria-labelledby={`${id}-heading`}>
      <div className="flex items-center gap-3 pb-3 border-b-2 border-ink-100 dark:border-ink-800 print:border-ink-300">
        <div className="h-5 w-1 rounded-full bg-brand-500 shrink-0 print:bg-brand-600" aria-hidden="true" />
        <h2 id={`${id}-heading`} className="text-lg font-bold text-ink-800 dark:text-ink-100 tracking-tight">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

// ── Peer-5 similarity (Wave 25C) ─────────────────────────────────────────────

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

function PeerFiveSection({ projectId, shareToken, industry, stage }: { projectId: string; shareToken?: string; industry: string | null; stage: string | null | undefined }) {
  const [peers, setPeers] = useState<PeerRow[] | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qs = shareToken ? `token=${encodeURIComponent(shareToken)}` : `projectId=${encodeURIComponent(projectId)}`;
        const res = await fetch(`/api/svi/report/peers?${qs}`, { credentials: "same-origin" });
        if (!res.ok) {
          if (!cancelled) setError("peer-lookup-unavailable");
          return;
        }
        const body = (await res.json()) as { ok?: boolean; peers?: PeerRow[]; fallback?: string };
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

  if (loading) return <p className="text-sm text-ink-500 dark:text-ink-400">Loading peer-5 similarity matches…</p>;

  if (error || !peers || peers.length === 0) {
    return (
      <p className="text-sm text-ink-500 dark:text-ink-400">
        Not enough AU peers in our dataset yet to compute a Peer-5 match. As more founders complete a BlockID SVI analysis, this section will populate with the 5 closest matches on the 8-dim vector.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-600 dark:text-ink-400">
        5 anonymised startups from the BlockID cohort with the closest 8-dimension SVI profile to yours (cosine similarity). Names are withheld — only industry, stage, and aggregate scores are shown.
      </p>
      {fallback === "cross_sector" && (
        <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
          Not enough AU {stage ?? "seed"}-stage {industry ?? "same-sector"} peers yet — showing top available cross-sector matches.
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
                  <span className={cn("font-bold tabular-nums", bandColor(scoreBand(p.sviScore)))}>{p.sviScore}</span>
                </td>
                <td className="py-2 pr-3 text-emerald-700 dark:text-emerald-400 text-xs">
                  {p.topStrengthLabel} <span className="tabular-nums">({p.topStrengthScore})</span>
                </td>
                <td className="py-2 pr-3 text-red-700 dark:text-red-400 text-xs">
                  {p.primaryGapLabel} <span className="tabular-nums">({p.primaryGapScore})</span>
                </td>
                <td className="text-right py-2 pl-3 tabular-nums font-semibold text-brand-700 dark:text-brand-300">{p.similarityPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-ink-500 dark:text-ink-500 leading-snug">
        Peer identities are strictly anonymised — no startup names, founder details, ABN, or contact info are ever exposed. Similarity is cosine distance on the normalised 8-dim SVI vector, sorted best match first.
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
  /** A stored `svi_snapshots.report_v2` document (migration 0395) when the
   * server already has one; otherwise the client lifts `initialData` /
   * the API state through the adapter. */
  initialReportV2?: ReportV2 | null;
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

export function BusinessReportClient({ projectId, initialData, initialReportV2, shareToken, pdfMode, locale = "en" }: BusinessReportClientProps) {
  const t = getTbrStrings(locale);
  const router = useRouter();
  const [data, setData] = useState<PersistedState | null>(initialData ?? null);
  const [storedReport, setStoredReport] = useState<ReportV2 | null>(initialReportV2 ?? null);
  const [activeId, setActiveId] = useState("tbr-cover");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Wave 27B — per-sector cohort benchmarks (fetched from
  // /api/svi/benchmarks/[sector]). The adapter uses them for p50/p75 when
  // the sample is ≥ 30, else the static stage anchors.
  const [benchmark, setBenchmark] = useState<CohortBenchmarkInput | null>(null);
  // Wave 27A — investor leads captured against this project's share token.
  interface InvestorLead {
    id: number;
    investor_name: string | null;
    investor_email: string;
    investor_firm: string | null;
    investor_role: string | null;
    interest_level: "exploring" | "warm" | "ready_to_talk";
    message: string | null;
    viewer_country: string | null;
    created_at: string;
  }
  const [leads, setLeads] = useState<InvestorLead[] | null>(null);
  const [leadsByInterest, setLeadsByInterest] = useState<Record<string, number>>({ exploring: 0, warm: 0, ready_to_talk: 0 });
  // Wave 28C — canonical svi_run_id from the latest snapshot, used by the
  // Personalised 30-Day Action Plan mount. Null until the report API returns.
  const [snapshotId, setSnapshotId] = useState<string | null>(initialData?.snapshotId ?? null);

  // G16-B — founder paywall access. `undefined` = still loading (the body
  // waits so a free founder never sees the full document flash before the
  // cut), `null` = the lookup failed (treated as free, buy mode with no
  // project → the rail explains). Public / PDF / share renders skip it.
  const founderMode = !initialData && !shareToken && !pdfMode;
  const [access, setAccess] = useState<ReportAccessInfo | null | undefined>(founderMode ? undefined : null);
  const [gateOpen, setGateOpen] = useState(false);
  const [unlockNotice, setUnlockNotice] = useState<string | null>(null);
  const paywallViewSent = useRef(false);

  useEffect(() => {
    if (!founderMode) return;
    let cancelled = false;
    (async () => {
      try {
        const qs = projectId && projectId !== "default" ? encodeURIComponent(projectId) : "default";
        const res = await fetch(`/api/reports/access?project=${qs}`, { credentials: "same-origin" });
        const body = (await res.json().catch(() => null)) as (ReportAccessInfo & { ok?: boolean }) | null;
        if (cancelled) return;
        setAccess(res.ok && body?.ok && body.quote ? body : null);
      } catch {
        if (!cancelled) setAccess(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [founderMode, projectId]);

  // Load from localStorage first (fast path), then fall back to Supabase
  // (/api/svi/report/[projectId]) so the report survives beyond the 30-min
  // localStorage TTL. When `initialData` is supplied (public /tbr/<token>
  // page), skip both — the parent already provided the DB row.
  useEffect(() => {
    if (initialData) return;
    const saved = loadPersisted(projectId);
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- post-hydration read of localStorage; a lazy initialiser would mismatch the server render
      setData(saved);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/svi/report/${encodeURIComponent(projectId)}`, { credentials: "same-origin" });
        if (!res.ok) return;
        const body = (await res.json()) as { ok?: boolean; persisted?: PersistedState; snapshotId?: string; reportV2?: ReportV2 | null };
        if (!cancelled && body.ok && body.persisted) {
          setData(body.persisted);
          if (typeof body.snapshotId === "string") setSnapshotId(body.snapshotId);
          if (body.reportV2 && typeof body.reportV2 === "object") setStoredReport(body.reportV2);
        }
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
          if (entry.isIntersecting) setActiveId(entry.target.id);
        }
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 },
    );
    const els = document.querySelectorAll("section[id^='tbr-']");
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [data, storedReport]);

  // Wave 27B — fetch sector benchmarks once we know the industry.
  const industryForFetch = data?.industry ?? null;
  useEffect(() => {
    let cancelled = false;
    const sector = (industryForFetch ?? "default").trim() || "default";
    (async () => {
      try {
        const res = await fetch(`/api/svi/benchmarks/${encodeURIComponent(sector)}`, { credentials: "same-origin" });
        if (!res.ok) return;
        const body = (await res.json()) as { ok?: boolean; benchmark?: CohortBenchmarkInput };
        if (!cancelled && body.ok && body.benchmark) setBenchmark(body.benchmark);
      } catch {
        /* silent — static stage anchors used */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [industryForFetch]);

  // Wave 27A — fetch investor leads (auth workspace only, never on the
  // public /tbr page and never in PDF export).
  useEffect(() => {
    if (initialData || pdfMode || !shareToken) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/svi/report/leads?projectId=${encodeURIComponent(projectId)}`, { credentials: "same-origin" });
        if (!res.ok) return;
        const body = (await res.json()) as { ok?: boolean; leads?: InvestorLead[]; leads_by_interest?: Record<string, number> };
        if (cancelled || !body.ok) return;
        setLeads(body.leads ?? []);
        if (body.leads_by_interest) setLeadsByInterest(body.leads_by_interest);
      } catch {
        /* silent — leads panel just stays hidden */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, initialData, pdfMode, shareToken]);

  // ── ReportV2: stored document wins; otherwise lift the v1 state ──────────
  // G16-B: the lift tier follows the founder's access (free unless the plan
  // includes the report or a paid order exists); public/share renders keep
  // the pre-G16 "standard" lift.
  const { liftTier, unlockMode } = useMemo(() => (founderMode ? resolveTbrAccess(storedReport, access ?? null) : { liftTier: "standard" as const, unlockMode: null }), [founderMode, storedReport, access]);
  const report = useMemo<ReportV2 | null>(() => {
    if (storedReport) return storedReport;
    if (!data) return null;
    return fromSnapshot({
      snapshotId: data.snapshotId ?? snapshotId,
      projectId,
      createdAt: data.savedAt,
      startupName: data.startupName ?? null,
      industry: data.industry,
      stageLabel: data.stage ?? null,
      sviTotal: data.sviTotal ?? null,
      dimStates: data.dimStates,
      criterionStates: data.criterionStates ?? null,
      cohort: benchmark,
      locale: locale === "vi" ? "vi" : "en",
      tier: liftTier,
    });
  }, [storedReport, data, benchmark, projectId, snapshotId, locale, liftTier]);

  // G16-B: the rail's one click → the confirm-before-charge modal (credits +
  // A$ shown, explicit confirm, then Stripe). No project → no businessId to
  // book against, so say so instead of opening a modal that cannot submit.
  const openUnlock = useCallback(() => {
    if (access?.projectId) {
      setUnlockNotice(null);
      setGateOpen(true);
      return;
    }
    setUnlockNotice("Create your startup workspace first so the report can be booked against it.");
  }, [access]);
  const closeGate = useCallback(() => setGateOpen(false), []);

  const unlock = useMemo<TbrUnlockProps | null>(() => {
    if (!unlockMode) return null;
    return { mode: unlockMode, onUnlock: openUnlock, orderId: access?.paidOrderId ?? null };
  }, [unlockMode, openUnlock, access]);

  // paywall_view — once per render of the free cut (client emit; lane A's
  // ingest route stamps user_id / qa server-side).
  const reportTierForEvent = report?.tier ?? null;
  useEffect(() => {
    if (!founderMode || unlockMode !== "buy" || !access || reportTierForEvent !== "free") return;
    if (paywallViewSent.current) return;
    paywallViewSent.current = true;
    void emitClientEvent("paywall_view", { surface: "tbr_free_cut", sku: access.price.sku, amount_cents: access.price.amount_cents, project_id: access.projectId });
  }, [founderMode, unlockMode, access, reportTierForEvent]);

  if (!data && !report) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800 p-6 text-center space-y-3">
          <FileText className="h-10 w-10 mx-auto text-amber-500 dark:text-amber-400" aria-hidden="true" />
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">{t.noAnalysisTitle}</p>
          <p className="text-xs text-amber-700 dark:text-amber-300">{t.noAnalysisBody}</p>
          <Link href="/workspace/raise/deck" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 transition-colors">
            {t.noAnalysisCta} <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  const scoredCount = report ? 8 - report.quality.degradedSections.length : 0;
  if (!report || scoredCount === 0) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="rounded-xl border border-ink-200 dark:border-ink-800 p-6 text-center space-y-3">
          <p className="text-sm text-ink-600 dark:text-ink-400">{t.scoresMissingBody}</p>
          <Link href="/workspace/raise/deck" className="text-brand-600 hover:underline text-sm">
            {t.scoresMissingCta}
          </Link>
        </div>
      </div>
    );
  }

  const industry = data?.industry ?? report.cover.sector;
  const stage = data?.stage ?? report.cover.stageLabel;
  const totalMs = data?.totalMs ?? null;
  const done = data?.done ?? true;
  const uiLocale: "en" | "vi" = locale === "vi" ? "vi" : "en";
  const tocGroups = [
    { label: t.tocOverview, items: tbrV2Toc(report, t, uiLocale).slice(0, 2) },
    { label: t.tocDimensions, items: tbrV2Toc(report, t, uiLocale).slice(2, 10) },
    {
      label: t.tocAnalysis,
      items: [
        ...tbrV2Toc(report, t, uiLocale).slice(10),
        ...(!pdfMode && !initialData && shareToken ? [{ id: "tbr-investor-views", label: "Investor Views" }] : []),
        { id: "tbr-peers", label: "Peer-5 Similarity Match" },
      ],
    },
  ];

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
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-100 print:text-3xl">{t.reportTitle}</h1>
          <span className="inline-flex items-center rounded-full bg-brand-100 dark:bg-brand-900/40 border border-brand-200 dark:border-brand-800 px-2.5 py-0.5 text-xs font-semibold text-brand-700 dark:text-brand-300">
            {t.brandBadge}
          </span>
          {!pdfMode && (
            // Wave 31D — 4-way locale selector (EN | VI | ES | JA). Each button
            // swaps the /vi, /es, /ja prefix on the current path so the user
            // stays on the same report but with translated shell copy.
            <div
              role="group"
              aria-label={t.languageToggleAria}
              className="inline-flex items-center rounded-full border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900 p-0.5 text-[10px] font-semibold text-ink-600 dark:text-ink-300 print:hidden"
            >
              {(["en", "vi", "es", "ja"] as const).map((code) => {
                const isActive = (locale ?? "en") === code;
                const label = code === "en" ? t.switchToEn : code === "vi" ? t.switchToVi : code === "es" ? t.switchToEs : t.switchToJa;
                return (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => {
                      if (typeof window === "undefined") return;
                      const { pathname, search } = window.location;
                      // Strip any existing /vi, /es, /ja prefix first.
                      const stripped = pathname.replace(/^\/(vi|es|ja)(\/|$)/, "/");
                      const nextPath = code === "en" ? stripped : `/${code}${stripped}`;
                      router.push(nextPath + search);
                    }}
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 transition-colors",
                      isActive ? "bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-200" : "hover:bg-ink-50 dark:hover:bg-ink-800",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
          {!pdfMode && (
            <div className="ml-auto flex items-center gap-2 print:hidden">
              {/* Share with Investor — only when running under the authed
                  /workspace/reports/business route (not on the public /tbr). */}
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
                        setShareError(userErrorMessage(ApiError.fromBody(res.status, body), "Could not create the share link. Please try again."));
                      }
                    } catch (err) {
                      console.error("[business-report] share", err);
                      setShareError(userErrorMessage(err, "Could not create the share link. Please try again."));
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
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
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
          {!pdfMode && shareError && <p className="mt-2 text-xs text-red-600 dark:text-red-400 print:hidden">{shareError}</p>}
        </div>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          {t.progressXofY(scoredCount, 8)} · {done ? t.completedInSeconds(((totalMs ?? 0) / 1000).toFixed(1)) : t.partialAnalysis}
          {industry && ` · ${industry}`}
        </p>
      </div>

      <div className="flex gap-8 items-start">
        {/* Sticky TOC — hidden in PDF-render mode so the printed doc isn't
            a wall of nav links. */}
        {!pdfMode && <TocNav activeId={activeId} t={t} items={tocGroups} />}

        {/* Report body — ReportV2 chapters */}
        <div className="flex-1 min-w-0 space-y-12">
          {founderMode && access === undefined ? (
            <div data-testid="tbr-access-loading" className="animate-pulse space-y-4" aria-busy="true" aria-live="polite">
              <div className="h-6 w-2/3 rounded bg-ink-100 dark:bg-ink-800" />
              <div className="h-40 rounded-xl bg-ink-100 dark:bg-ink-800" />
              <div className="h-6 w-1/2 rounded bg-ink-100 dark:bg-ink-800" />
            </div>
          ) : (
            <TbrReportV2
              report={report}
              strings={t}
              locale={uiLocale}
              upgradeHref="/pricing"
              unlock={unlock}
              afterChapters={
                /* Wave 28C: Personalised 30-Day Action Plan (live widget). */
                !pdfMode && snapshotId ? <ActionPlan sviRunId={snapshotId} /> : null
              }
            />
          )}
          {unlockNotice && (
            <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              {unlockNotice}{" "}
              <Link href="/workspace/projects" className="font-semibold underline">
                Open projects
              </Link>
            </p>
          )}
          {founderMode && access?.projectId && unlockMode === "buy" && (
            <ReportPaywallGate
              businessId={access.projectId}
              quote={access.quote}
              creditBalance={access.creditBalance}
              hasSubscription={access.hasSubscription}
              open={gateOpen}
              onClose={closeGate}
            />
          )}

          {/* ── Investor Leads (Wave 27A) ──────────────────────────────────
              Founder-only, only when leads exist. */}
          {!pdfMode && !initialData && shareToken && leads && leads.length > 0 && (
            <ReportSection id="tbr-investor-leads" title="Investor Leads">
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-600 dark:text-ink-400">
                <span className="font-semibold text-ink-800 dark:text-ink-100">{leads.length} total</span>
                {leadsByInterest.ready_to_talk > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 px-2 py-0.5 font-medium">{leadsByInterest.ready_to_talk} ready to talk</span>
                )}
                {leadsByInterest.warm > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 px-2 py-0.5 font-medium">{leadsByInterest.warm} warm</span>
                )}
                {leadsByInterest.exploring > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 dark:bg-sky-950/40 text-sky-800 dark:text-sky-200 px-2 py-0.5 font-medium">{leadsByInterest.exploring} exploring</span>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {leads.map((lead) => {
                  const badge =
                    lead.interest_level === "ready_to_talk"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                      : lead.interest_level === "warm"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                        : "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200";
                  const label = lead.interest_level === "ready_to_talk" ? "Ready to talk" : lead.interest_level === "warm" ? "Warm" : "Exploring";
                  const who = [lead.investor_name, lead.investor_firm].filter(Boolean).join(" · ") || "Anonymous investor";
                  const subline = [lead.investor_role, lead.viewer_country].filter(Boolean).join(" · ");
                  return (
                    <div key={lead.id} className="rounded-xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-4 flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-ink-800 dark:text-ink-100 truncate">{who}</p>
                          {subline && <p className="text-[11px] text-ink-500 dark:text-ink-400 truncate">{subline}</p>}
                        </div>
                        <span className={cn("shrink-0 text-[11px] font-semibold rounded-full px-2 py-0.5", badge)}>{label}</span>
                      </div>
                      {lead.message && (
                        <p className="text-xs text-ink-600 dark:text-ink-300 leading-snug bg-ink-50 dark:bg-ink-900/80 border border-ink-100 dark:border-ink-800 rounded-md px-2.5 py-2">{lead.message}</p>
                      )}
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-[10px] text-muted dark:text-ink-500 tabular-nums">
                          {new Date(lead.created_at).toLocaleDateString(locale === "vi" ? "vi-VN" : "en-AU", { day: "numeric", month: "short" })}
                        </span>
                        <a
                          href={`mailto:${lead.investor_email}?subject=${encodeURIComponent("Following up on your interest in our startup")}`}
                          className="text-xs font-semibold text-brand-700 dark:text-brand-300 hover:underline"
                        >
                          Reply via email →
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ReportSection>
          )}

          {/* ── Investor Views (Wave 26A) — authenticated workspace only ── */}
          {!pdfMode && !initialData && shareToken && (
            <ReportSection id="tbr-investor-views" title="Investor Views">
              <TbrInvestorViews projectId={projectId} />
            </ReportSection>
          )}

          {/* ── Peer-5 Similarity Match (Wave 25C) ─────────────────────────── */}
          <ReportSection id="tbr-peers" title="Peer-5 Similarity Match">
            <PeerFiveSection projectId={projectId} shareToken={shareToken} industry={industry} stage={stage} />
          </ReportSection>

          {/* Footer */}
          <div className="border-t border-ink-200 dark:border-ink-800 pt-4 pb-8 flex items-center justify-between gap-4 text-xs text-ink-500 dark:text-ink-500">
            <p>{t.footerDisclaimer}</p>
            <Link href="/workspace/raise/deck" className="text-brand-600 dark:text-brand-400 hover:underline shrink-0">
              {t.footerReanalyse}
            </Link>
          </div>
        </div>
      </div>

      {/* Wave 26B — floating "Ask about this report" chat widget.
          Hidden in pdfMode (Playwright PDF export must not capture chat chrome). */}
      {!pdfMode && <TbrQaChat projectId={initialData ? undefined : projectId} token={shareToken} />}
    </div>
  );
}
