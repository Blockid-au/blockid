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
//
// G19-S45 (D4): this page IS the paid view. With `?order=<id>` (the
// post-purchase landing, `reportOrderPath`) or a paid `report_orders` row
// from /api/reports/access, the page polls GET /api/reports/[orderId] and,
// once the order carries `assembled_reports.report_json`, renders THAT
// ReportV2 with every chapter unlocked (no rail) plus order-scoped v2
// PDF / DOCX exports. While the order is still being written the current
// snapshot renders under a "being written" strip; a pre-v2 order keeps the
// snapshot unlocked and links to the thin markdown wrapper.
//
// G19-S45 (D6): the one-question clarity survey mounts after the Executive
// summary on the paid founder view and the public share page (once per
// snapshot); `tbr_section_view` (one per section per view) and `tbr_export`
// (PDF / DOCX) engagement events fire from here.

import { ReportFreshnessBanner, newerAnalysis, type AnalysisListItem } from "@/components/workspace/report-freshness-banner";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { getTbrStrings, type TbrLocale } from "@/lib/i18n/tbr-strings";
import { TbrInvestorViews } from "@/components/tbr/tbr-investor-views";
import { TbrQaChat } from "@/components/tbr/tbr-qa-chat";
import { ActionPlan } from "@/components/score/ActionPlan";
import type { TbrAssessmentBenchmarks } from "@/components/tbr/v2/assessment";
import { TbrReportV2, tbrV2TocGroups, type TbrUnlockOrderStatus, type TbrUnlockProps } from "@/components/tbr/v2/report";
import { TbrClaritySurvey } from "@/components/tbr/tbr-clarity-survey";
import { ReportPaywallGate, type ReportPaywallQuote } from "@/components/paywall/ReportPaywallGate";
import { ReportOrderBlocked, reportOrderExportHref } from "@/components/paywall/ReportOrderView";
import { useReportOrder } from "@/components/paywall/use-report-order";
import { legacyReportOrderPath } from "@/lib/paywall/report-delivery";
import { emitClientEvent } from "@/lib/analytics/client-emit";
import { trackEvent } from "@/lib/analytics";
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

/** G19-S45 (D4): what the page knows about the founder's paid order. */
export interface PaidOrderState {
  /** The paid ReportV2 (assembled_reports.report_json) once the order is READY and carries one. */
  report: ReportV2 | null;
  /** pending = PAID / GENERATING (still polling); legacy = READY without report_json; ready = READY with report_json. */
  status: TbrUnlockOrderStatus | null;
}

/**
 * Pure: which tier the founder page lifts a v1 snapshot into and which
 * unlock mode the rail shows. A stored document keeps its own tier; only
 * the read-time lift used to say "standard" for everyone (the silent free
 * → full leak G16 closes).
 *
 * G19-S45 (D4): a paid order that already carries its ReportV2 wins
 * outright — every chapter unlocked, no rail (`useOrderReport: true`). A
 * paid order still being written, or a pre-v2 order, keeps the snapshot
 * document fully unlocked (`purchased` rail with the order status) so the
 * founder never lands on the markdown wall.
 */
export function resolveTbrAccess(
  stored: ReportV2 | null,
  access: ReportAccessInfo | null,
  paid: PaidOrderState | null = null,
): { liftTier: "free" | "standard"; unlockMode: TbrUnlockProps["mode"] | null; orderStatus: TbrUnlockOrderStatus | null; useOrderReport: boolean } {
  if (paid?.report) return { liftTier: "standard", unlockMode: null, orderStatus: "ready", useOrderReport: true };
  const owns = Boolean(access?.paidOrderId) || Boolean(paid?.status);
  const included = Boolean(access?.included);
  const liftTier: "free" | "standard" = owns || included ? "standard" : "free";
  // G16 review P1-2: a stored `tier: "standard"` is only trusted when the
  // caller owns a paid order or the plan includes the report — the deck
  // analyser (`/api/pitchdeck/save-snapshot`) stores every snapshot as
  // standard without charging, which handed free founders the full document.
  const effectiveTier = stored ? (stored.tier === "free" || owns || included ? stored.tier : "free") : liftTier;
  const orderStatus: TbrUnlockOrderStatus | null = owns ? (paid?.status ?? "ready") : null;
  if (effectiveTier !== "free") return { liftTier, unlockMode: null, orderStatus, useOrderReport: false };
  return { liftTier, unlockMode: owns ? "purchased" : included ? "included" : "buy", orderStatus, useOrderReport: false };
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
  if (band === "strong") return "text-bull";
  if (band === "developing") return "text-warn";
  if (band === "early") return "text-bear";
  return "text-muted";
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
      <p className="text-[11px] uppercase tracking-[0.16em] font-semibold text-muted mb-3">{t.tocContents}</p>
      <div className="space-y-4">
        {items.map((group) => (
          <div key={group.label}>
            <p className="text-[9px] uppercase tracking-[0.2em] font-bold text-muted px-2 mb-1">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] transition-all leading-snug",
                      activeId === s.id
                        ? "bg-surface-sunken text-action font-semibold border-l-2 border-brand-500 pl-1.5"
                        : "text-secondary hover:text-primary hover:bg-surface-sunken",
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
      <div className="flex items-center gap-3 pb-3 border-b-2 border-line-subtle print:border-line">
        <div className="h-5 w-1 rounded-full bg-brand-500 shrink-0 print:bg-action" aria-hidden="true" />
        <h2 id={`${id}-heading`} className="text-lg font-bold text-primary tracking-tight">
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

function PeerFiveSection({ projectId, shareToken, industry, stage, skipFetch = false }: { projectId: string; shareToken?: string; industry: string | null; stage: string | null | undefined; /** G21-P1-B (page sweep): a static sample (initialData, no token) has no peers endpoint to call — the anonymous 401 was the page's one failed request + console error. */ skipFetch?: boolean }) {
  const [peers, setPeers] = useState<PeerRow[] | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [loading, setLoading] = useState(!skipFetch);
  const [error, setError] = useState<string | null>(skipFetch ? "static-sample" : null);

  useEffect(() => {
    if (skipFetch) return;
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
  }, [projectId, shareToken, skipFetch]);

  if (loading) return <p className="text-sm text-muted">Loading peer-5 similarity matches…</p>;

  if (error || !peers || peers.length === 0) {
    return (
      <p className="text-sm text-muted">
        Not enough AU peers in our dataset yet to compute a Peer-5 match. As more founders complete a BlockID SVI analysis, this section will populate with the 5 closest matches on the 8-dim vector.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-secondary">
        5 anonymised startups from the BlockID cohort with the closest 8-dimension SVI profile to yours (cosine similarity). Names are withheld — only industry, stage, and aggregate scores are shown.
      </p>
      {fallback === "cross_sector" && (
        <p className="text-xs text-warn bg-surface-sunken border border-amber-300 rounded-md px-3 py-2">
          Not enough AU {stage ?? "seed"}-stage {industry ?? "same-sector"} peers yet — showing top available cross-sector matches.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-surface-sunken text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <tr className="border-b border-line-subtle">
              <th className="text-left py-2 pr-3 text-xs font-semibold text-muted uppercase tracking-wide">#</th>
              <th className="text-left py-2 pr-3 text-xs font-semibold text-muted uppercase tracking-wide">Peer</th>
              <th className="text-left py-2 pr-3 text-xs font-semibold text-muted uppercase tracking-wide">Industry</th>
              <th className="text-left py-2 pr-3 text-xs font-semibold text-muted uppercase tracking-wide">Stage</th>
              <th className="text-center py-2 px-2 text-xs font-semibold text-muted uppercase tracking-wide">SVI</th>
              <th className="text-left py-2 pr-3 text-xs font-semibold text-muted uppercase tracking-wide">Top Strength</th>
              <th className="text-left py-2 pr-3 text-xs font-semibold text-muted uppercase tracking-wide">Primary Gap</th>
              <th className="text-right py-2 pl-3 text-xs font-semibold text-muted uppercase tracking-wide">Similarity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle [&>tr:nth-child(even)]:bg-surface-sunken">
            {peers.map((p) => (
              <tr key={p.rank} className="border-b border-line-subtle">
                <td className="py-2 pr-3 text-muted tabular-nums">{p.rank}</td>
                <td className="py-2 pr-3 font-medium text-secondary">{p.codename}</td>
                <td className="py-2 pr-3 text-secondary">{p.industry}</td>
                <td className="py-2 pr-3 text-secondary capitalize">{p.stage}</td>
                <td className="text-center py-2 px-2">
                  <span className={cn("font-bold tabular-nums", bandColor(scoreBand(p.sviScore)))}>{p.sviScore}</span>
                </td>
                <td className="py-2 pr-3 text-bull text-xs">
                  {p.topStrengthLabel} <span className="tabular-nums">({p.topStrengthScore})</span>
                </td>
                <td className="py-2 pr-3 text-bear text-xs">
                  {p.primaryGapLabel} <span className="tabular-nums">({p.primaryGapScore})</span>
                </td>
                <td className="text-right py-2 pl-3 tabular-nums font-semibold text-action">{p.similarityPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted leading-snug">
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
  /**
   * G19-S45 (D4): the paid `report_orders` row to render (`?order=<id>` —
   * the post-purchase landing). Falls back to the paid order
   * /api/reports/access reports for the project.
   */
  orderId?: string | null;
  /** G21 P1: the Assessment Card's benchmark (server-loaded under the n-rule). */
  benchmarks?: TbrAssessmentBenchmarks;
}

export function BusinessReportClient({ projectId, initialData, initialReportV2, shareToken, pdfMode, locale = "en", orderId = null, benchmarks }: BusinessReportClientProps) {
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

  // G19-S45 (D4): the paid order behind this page — explicit `?order=` first,
  // else the paid row /api/reports/access found for the project. Polled by
  // the shared hook (202 → retry at the server cadence).
  const paidOrderId = founderMode ? (orderId ?? access?.paidOrderId ?? null) : null;
  const orderState = useReportOrder(paidOrderId);
  const paid = useMemo<PaidOrderState | null>(() => {
    if (!paidOrderId) return null;
    if (orderState.phase === "ready") return { report: orderState.report.reportV2 ?? null, status: orderState.report.reportV2 ? "ready" : "legacy" };
    if (orderState.phase === "pending" || orderState.phase === "loading") return { report: null, status: "pending" };
    return null;
  }, [paidOrderId, orderState]);
  const surface: "founder" | "share" = shareToken ? "share" : "founder";

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

  // AF13 — the account's /analyze runs, to say when a newer one exists than the report on screen.
  const [analysesList, setAnalysesList] = useState<AnalysisListItem[]>([]);
  useEffect(() => {
    if (!founderMode) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/analyses", { credentials: "same-origin" });
        const body = res.ok ? ((await res.json().catch(() => null)) as { ok?: boolean; analyses?: AnalysisListItem[] } | null) : null;
        if (!cancelled && body?.ok && Array.isArray(body.analyses)) setAnalysesList(body.analyses);
      } catch {
        /* the banner simply omits the "newer" line */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [founderMode]);

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

  // Intersection observer for active TOC item + G19-S45 `tbr_section_view`
  // (one event per section per page view; never in the PDF render).
  const sectionsSeen = useRef<Set<string>>(new Set());
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setActiveId(entry.target.id);
          if (pdfMode || sectionsSeen.current.has(entry.target.id)) continue;
          sectionsSeen.current.add(entry.target.id);
          try {
            trackEvent("tbr_section_view", { section: entry.target.id, surface });
          } catch {
            /* analytics only */
          }
        }
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 },
    );
    const els = document.querySelectorAll("section[id^='tbr-']");
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [data, storedReport, paid, pdfMode, surface]);

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
  const { liftTier, unlockMode, orderStatus, useOrderReport } = useMemo(
    () => (founderMode ? resolveTbrAccess(storedReport, access ?? null, paid) : { liftTier: "standard" as const, unlockMode: null, orderStatus: null, useOrderReport: false }),
    [founderMode, storedReport, access, paid],
  );
  const report = useMemo<ReportV2 | null>(() => {
    // G19-S45 (D4): the paid ReportV2 wins over the snapshot document.
    if (useOrderReport && paid?.report) return paid.report;
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
      locale,
      tier: liftTier,
    });
  }, [useOrderReport, paid, storedReport, data, benchmark, projectId, snapshotId, locale, liftTier]);

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
    return { mode: unlockMode, onUnlock: openUnlock, orderId: paidOrderId ?? access?.paidOrderId ?? null, orderStatus: orderStatus ?? undefined };
  }, [unlockMode, openUnlock, access, paidOrderId, orderStatus]);

  // paywall_view — once per render of the free cut (client emit; lane A's
  // ingest route stamps user_id / qa server-side).
  const reportTierForEvent = report?.tier ?? null;
  useEffect(() => {
    if (!founderMode || unlockMode !== "buy" || !access || reportTierForEvent !== "free") return;
    if (paywallViewSent.current) return;
    paywallViewSent.current = true;
    void emitClientEvent("paywall_view", { surface: "tbr_free_cut", sku: access.price.sku, amount_cents: access.price.amount_cents, project_id: access.projectId });
  }, [founderMode, unlockMode, access, reportTierForEvent]);

  // G19-S45 (D4): a paid order that is still being written, with no snapshot
  // to show meanwhile → the order's own pending / blocked panel, never the
  // "no analysis" state a buyer would read as "my purchase is lost".
  if (!data && !report && paidOrderId && orderState.phase !== "idle" && orderState.phase !== "ready") {
    return (
      <div className="p-6 max-w-5xl mx-auto" data-testid="tbr-order-only">
        {orderState.phase === "blocked" ? (
          <ReportOrderBlocked refunded={orderState.refunded} message={orderState.message} failureReason={orderState.failureReason} locale={locale} />
        ) : (
          <div className="rounded-2xl border border-brand-300 bg-surface-sunken p-6" role="status" aria-live="polite" data-testid="tbr-order-pending">
            <p className="text-sm font-semibold text-primary">{t.v2.order.pendingTitle}</p>
            <p className="mt-1 text-xs text-secondary">{orderState.phase === "pending" ? orderState.message : t.v2.order.loading}</p>
            <p className="mt-2 text-xs text-muted">{t.v2.order.pendingLeave}</p>
          </div>
        )}
      </div>
    );
  }

  if (!data && !report) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="rounded-xl border border-amber-300 bg-surface-sunken p-6 text-center space-y-3">
          <FileText className="h-10 w-10 mx-auto text-amber-500" aria-hidden="true" />
          {/* G20-sweep: the empty state is the page — its title is the h1. */}
          <h1 className="text-sm font-medium text-warn">{t.noAnalysisTitle}</h1>
          <p className="text-xs text-warn">{t.noAnalysisBody}</p>
          <Link href="/workspace/raise/deck" className="inline-flex items-center gap-1.5 rounded-lg bg-action hover:bg-action-hover text-on-action text-sm font-semibold px-4 py-2 transition-colors">
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
        <div className="rounded-xl border border-line-subtle p-6 text-center space-y-3">
          <h1 className="text-sm font-medium text-primary">{t.reportTitle}</h1>
          <p className="text-sm text-secondary">{t.scoresMissingBody}</p>
          <Link href="/workspace/raise/deck" className="text-action hover:underline text-sm">
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
  const uiLocale: TbrLocale = locale;
  // G19-S45: the paid order's own exports (v2 twins, owner-scoped, no second charge).
  const paidExportsOrderId = useOrderReport && paidOrderId ? paidOrderId : null;
  const pdfHref = paidExportsOrderId
    ? reportOrderExportHref(paidExportsOrderId, "pdf")
    : shareToken
      ? `/api/svi/report/pdf?token=${encodeURIComponent(shareToken)}`
      : shareUrl
        ? `/api/svi/report/pdf?token=${encodeURIComponent(new URL(shareUrl).pathname.split("/").pop() ?? "")}`
        : undefined;
  // G19-S45 (D6): the clarity survey — paid founder view + public share, once per snapshot.
  const surveySnapshotId = report.snapshotId || snapshotId || paidExportsOrderId || null;
  const showSurvey = !pdfMode && Boolean(surveySnapshotId) && (shareToken ? true : founderMode && report.tier !== "free");
  // G27: the v3 TOC groups — overview (dashboard · investment view · key points · valuation), the 8 chapters, closing (risk matrix · plan · money · appendix · evidence cited).
  const v3Toc = tbrV2TocGroups(report, uiLocale);
  const tocGroups = [
    { label: t.tocOverview, items: v3Toc.overview },
    { label: t.tocDimensions, items: v3Toc.dimensions },
    {
      label: t.tocAnalysis,
      items: [
        ...v3Toc.closing,
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
          <h1 className="text-2xl font-bold text-primary print:text-3xl">{t.reportTitle}</h1>
          <span className="inline-flex items-center rounded-full bg-surface-sunken border border-brand-300 px-2.5 py-0.5 text-xs font-semibold text-action">
            {t.brandBadge}
          </span>
          {!pdfMode && (
            // Wave 31D — 4-way locale selector (EN | VI | ES | JA). Each button
            // swaps the /vi, /es, /ja prefix on the current path so the user
            // stays on the same report but with translated shell copy.
            <div
              role="group"
              aria-label={t.languageToggleAria}
              className="inline-flex items-center rounded-full border border-line-subtle bg-surface p-0.5 text-xs font-semibold text-secondary print:hidden"
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
                      isActive ? "bg-surface-sunken text-action" : "hover:bg-surface-sunken",
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
                  className="inline-flex items-center gap-1.5 rounded-lg border border-brand-300 bg-surface-sunken px-3 py-1.5 text-xs font-semibold text-action hover:bg-surface-sunken transition-colors disabled:opacity-60"
                >
                  {shareBusy ? t.sharing : t.shareWithInvestor}
                </button>
              )}
              {/* Download PDF — react-pdf v2 (`/api/svi/report/pdf?token=`,
                  needs a share token; mint one first on the authed page) or,
                  for a paid order, the order-scoped v2 export. */}
              <a
                href={pdfHref}
                data-testid="tbr-download-pdf"
                onClick={(e) => {
                  if (!pdfHref) {
                    e.preventDefault();
                    setShareError(t.clickShareFirst);
                    return;
                  }
                  trackEvent("tbr_export", { format: "pdf", surface });
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line-subtle bg-surface px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-sunken transition-colors"
              >
                {t.downloadPdf}
              </a>
              {paidExportsOrderId && (
                <a
                  href={reportOrderExportHref(paidExportsOrderId, "docx")}
                  data-testid="tbr-download-docx"
                  onClick={() => trackEvent("tbr_export", { format: "docx", surface })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line-subtle bg-surface px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-sunken transition-colors"
                >
                  {t.v2.order.downloadDocx}
                </a>
              )}
              <button
                type="button"
                onClick={() => typeof window !== "undefined" && window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line-subtle bg-surface px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-sunken transition-colors"
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
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-brand-300 bg-surface-sunken px-3 py-2 text-xs print:hidden">
              <span className="font-semibold text-action">{t.shareUrlLabel}</span>
              <code className="flex-1 truncate text-secondary">{shareUrl}</code>
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
                className="rounded border border-brand-300 bg-surface px-2 py-0.5 font-semibold text-action hover:bg-surface-sunken"
              >
                {copied ? t.copied : t.copy}
              </button>
            </div>
          )}
          {!pdfMode && shareError && <p className="mt-2 text-xs text-bear print:hidden">{shareError}</p>}
        </div>
        <p className="text-sm text-muted">
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
          {/* G19-S45 (D4): paid-order strip — being written / pre-v2 order. */}
          {founderMode && paid?.status === "pending" && (
            <p role="status" aria-live="polite" data-testid="tbr-order-strip" data-tbr-order-status="pending" className="rounded-xl border border-brand-300 bg-surface-sunken px-3 py-2 text-xs text-brand-900 print:hidden">
              {t.v2.order.generatingStrip}
            </p>
          )}
          {founderMode && paid?.status === "legacy" && paidOrderId && (
            <p data-testid="tbr-order-strip" data-tbr-order-status="legacy" className="rounded-xl border border-line-subtle bg-surface-sunken px-3 py-2 text-xs text-secondary print:hidden">
              {t.v2.order.legacyStrip}{" "}
              <Link href={legacyReportOrderPath(paidOrderId)} className="font-semibold text-action underline underline-offset-2">
                {t.v2.rail.openLegacy}
              </Link>
            </p>
          )}
          {founderMode && useOrderReport && (
            <p data-testid="tbr-order-strip" data-tbr-order-status="ready" className="sr-only">
              {t.v2.order.paidBadge}
            </p>
          )}
          {founderMode && access === undefined ? (
            <div data-testid="tbr-access-loading" className="animate-pulse space-y-4" aria-busy="true" aria-live="polite">
              <div className="h-6 w-2/3 rounded bg-surface-sunken" />
              <div className="h-40 rounded-xl bg-surface-sunken" />
              <div className="h-6 w-1/2 rounded bg-surface-sunken" />
            </div>
          ) : (
            <>
            {founderMode && report && (
              <ReportFreshnessBanner asOf={report.generatedAt ?? null} newer={newerAnalysis(analysesList, report.generatedAt ?? null, report.projectId ?? null)} />
            )}
            <TbrReportV2
              report={report}
              strings={t}
              locale={uiLocale}
              upgradeHref="/pricing"
              unlock={unlock}
              benchmarks={benchmarks}
              // G21 P1 review: the corrections link is founder-workspace only, never under a share token or on the static sample.
              canCorrect={!shareToken && !initialData}
              afterExecutive={showSurvey && surveySnapshotId ? <TbrClaritySurvey snapshotId={surveySnapshotId} surface={surface} locale={locale} /> : null}
              afterChapters={
                /* Wave 28C: Personalised 30-Day Action Plan (live widget). */
                !pdfMode && snapshotId ? <ActionPlan sviRunId={snapshotId} /> : null
              }
            />
            </>
          )}
          {unlockNotice && (
            <p role="status" className="rounded-lg border border-amber-300 bg-surface-sunken px-3 py-2 text-xs text-warn">
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
              <div className="flex flex-wrap items-center gap-2 text-xs text-secondary">
                <span className="font-semibold text-primary">{leads.length} total</span>
                {leadsByInterest.ready_to_talk > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-sunken text-bull px-2 py-0.5 font-medium">{leadsByInterest.ready_to_talk} ready to talk</span>
                )}
                {leadsByInterest.warm > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-sunken text-warn px-2 py-0.5 font-medium">{leadsByInterest.warm} warm</span>
                )}
                {leadsByInterest.exploring > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-sunken text-action px-2 py-0.5 font-medium">{leadsByInterest.exploring} exploring</span>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {leads.map((lead) => {
                  const badge =
                    lead.interest_level === "ready_to_talk"
                      ? "bg-surface-sunken text-bull"
                      : lead.interest_level === "warm"
                        ? "bg-surface-sunken text-warn"
                        : "bg-surface-sunken text-action";
                  const label = lead.interest_level === "ready_to_talk" ? "Ready to talk" : lead.interest_level === "warm" ? "Warm" : "Exploring";
                  const who = [lead.investor_name, lead.investor_firm].filter(Boolean).join(" · ") || "Anonymous investor";
                  const subline = [lead.investor_role, lead.viewer_country].filter(Boolean).join(" · ");
                  return (
                    <div key={lead.id} className="rounded-xl border border-line-subtle bg-surface p-4 flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-primary truncate">{who}</p>
                          {subline && <p className="text-xs text-muted truncate">{subline}</p>}
                        </div>
                        <span className={cn("shrink-0 text-xs font-semibold rounded-full px-2 py-0.5", badge)}>{label}</span>
                      </div>
                      {lead.message && (
                        <p className="text-xs text-secondary leading-snug bg-surface-sunken border border-line-subtle rounded-md px-2.5 py-2">{lead.message}</p>
                      )}
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-xs text-muted tabular-nums">
                          {new Date(lead.created_at).toLocaleDateString(locale === "vi" ? "vi-VN" : "en-AU", { day: "numeric", month: "short" })}
                        </span>
                        <a
                          href={`mailto:${lead.investor_email}?subject=${encodeURIComponent("Following up on your interest in our startup")}`}
                          className="text-xs font-semibold text-action hover:underline"
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
            <PeerFiveSection projectId={projectId} shareToken={shareToken} industry={industry} stage={stage} skipFetch={Boolean(initialData) && !shareToken} />
          </ReportSection>

          {/* Footer */}
          <div className="border-t border-line-subtle pt-4 pb-8 flex items-center justify-between gap-4 text-xs text-muted">
            <p>{t.footerDisclaimer}</p>
            <Link href="/workspace/raise/deck" className="text-action hover:underline shrink-0">
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
