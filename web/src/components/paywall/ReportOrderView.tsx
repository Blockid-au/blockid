/**
 * ReportOrderView — what a buyer sees after paying for a Trust Business
 * Report.
 *
 * Master Upgrade Plan §8.4. Both purchase paths now land here:
 *   * Path A (Stripe A$5.50) — the Checkout success_url returns to
 *     /dashboard/reports/order?session_id=…, which the server page
 *     resolves to an order id before rendering this component.
 *   * Path B (credits) — ReportPaywallGate's onRedeemed default pushes
 *     straight to /dashboard/reports/order?order=…
 *
 * The component is a thin state machine over GET /api/reports/[orderId]:
 *
 *   202 → keep polling at the server-supplied `retryInSeconds`
 *   200 → render the report and enable PDF/DOCX
 *   402 → the order was never paid; offer the way back
 *   410 → terminal (failed / refunded / expired); say plainly what
 *         happened to the money
 *   404 → not yours or does not exist (the API deliberately cannot
 *         tell the two apart)
 *
 * Polling stops on any non-202. There is no client-side timer fallback:
 * the retry cadence comes from the server so it can be tuned without a
 * redeploy of the bundle.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";

interface OrderMeta {
  orderId: string;
  status: string;
  paidAt: string | null;
  generatedAt: string | null;
  expiresAt: string | null;
  amountAud: number;
  creditsUsed: number;
}

interface ReportPayload {
  reportId: string;
  title: string;
  tier: string;
  executiveSummary: string;
  markdown: string;
  totalWords: number;
  sectionsCount: number;
  qualityScore: number | null;
}

interface ApiResponse {
  ok: boolean;
  status?: string;
  reason?: string;
  message?: string;
  order?: OrderMeta;
  report?: ReportPayload;
  retryInSeconds?: number;
  refunded?: boolean;
  regenerable?: boolean;
  failureReason?: string;
}

type ViewState =
  | { phase: "loading" }
  | { phase: "pending"; message: string; status: string }
  | { phase: "ready"; order: OrderMeta; report: ReportPayload }
  | {
      phase: "blocked";
      httpStatus: number;
      message: string;
      refunded: boolean;
      regenerable: boolean;
      failureReason?: string;
    };

const DEFAULT_RETRY_SECONDS = 15;

export interface ReportOrderViewProps {
  orderId: string;
}

export function ReportOrderView({ orderId }: ReportOrderViewProps) {
  const [state, setState] = useState<ViewState>({ phase: "loading" });
  // Guards the poll loop against firing after unmount (React 18 strict
  // mode double-invokes effects; a stray setState there is a warning).
  const liveRef = useRef(true);

  const poll = useCallback(async (): Promise<number | null> => {
    const res = await fetch(`/api/reports/${encodeURIComponent(orderId)}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    const data = (await res.json()) as ApiResponse;
    if (!liveRef.current) return null;

    if (res.status === 200 && data.ok && data.report && data.order) {
      setState({ phase: "ready", order: data.order, report: data.report });
      return null;
    }

    if (res.status === 202) {
      setState({
        phase: "pending",
        message: data.message ?? "Your report is being generated…",
        status: data.status ?? "GENERATING",
      });
      return data.retryInSeconds ?? DEFAULT_RETRY_SECONDS;
    }

    setState({
      phase: "blocked",
      httpStatus: res.status,
      message:
        data.message ??
        data.reason ??
        `We could not load this report (${res.status}).`,
      refunded: data.refunded === true,
      regenerable: data.regenerable === true,
      failureReason: data.failureReason,
    });
    return null;
  }, [orderId]);

  useEffect(() => {
    liveRef.current = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      try {
        const retryIn = await poll();
        if (retryIn !== null && liveRef.current) {
          timer = setTimeout(run, Math.max(3, retryIn) * 1000);
        }
      } catch {
        if (!liveRef.current) return;
        setState({
          phase: "blocked",
          httpStatus: 0,
          message:
            "We lost the connection while loading your report. Refresh to try again — your purchase is safe.",
          refunded: false,
          regenerable: false,
        });
      }
    };

    void run();

    return () => {
      liveRef.current = false;
      if (timer) clearTimeout(timer);
    };
  }, [poll]);

  if (state.phase === "loading") {
    return (
      <p className="text-sm text-ink-600" role="status">
        Loading your report…
      </p>
    );
  }

  if (state.phase === "pending") {
    return (
      <section
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3"
        aria-live="polite"
        data-testid="report-order-pending"
      >
        <h2 className="text-lg font-semibold text-ink-900">
          Writing your Trust Business Report
        </h2>
        <p className="text-sm text-ink-600 leading-relaxed">{state.message}</p>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
          role="progressbar"
          aria-label="Report generation in progress"
        >
          <div className="h-full w-1/3 animate-pulse rounded-full bg-brand-500" />
        </div>
        <p className="text-xs text-ink-500">
          You can leave this page — the report is saved to your account and
          this link keeps working for 90 days.
        </p>
      </section>
    );
  }

  if (state.phase === "blocked") {
    return (
      <section
        className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-6 space-y-3"
        role="alert"
        data-testid="report-order-blocked"
      >
        <h2 className="text-lg font-semibold text-ink-900">
          {state.refunded
            ? "This order was refunded"
            : "This report is not available"}
        </h2>
        <p className="text-sm text-ink-700 leading-relaxed">{state.message}</p>
        {state.failureReason ? (
          <p className="text-xs font-mono text-ink-500">
            Reference: {state.failureReason}
          </p>
        ) : null}
        <a
          href="/dashboard"
          className="inline-flex h-10 items-center rounded-xl border border-slate-300 px-4 text-sm font-medium hover:border-brand-400"
        >
          Back to dashboard
        </a>
      </section>
    );
  }

  const { order, report } = state;

  return (
    <article className="space-y-6" data-testid="report-order-ready">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">
          {report.title}
        </h1>
        <p className="text-sm text-ink-600">
          {report.totalWords.toLocaleString("en-AU")} words ·{" "}
          {report.sectionsCount} sections · {report.tier} tier
          {order.generatedAt
            ? ` · generated ${new Date(order.generatedAt).toLocaleDateString("en-AU")}`
            : null}
        </p>
        <p className="text-xs text-ink-500">
          {order.amountAud > 0
            ? `Paid A$${(order.amountAud / 100).toFixed(2)} inc-GST`
            : `Redeemed ${order.creditsUsed} credits`}
          {order.expiresAt
            ? ` · available until ${new Date(order.expiresAt).toLocaleDateString("en-AU")}`
            : null}
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <a
          href={`/api/reports/${encodeURIComponent(order.orderId)}?format=pdf`}
          className="inline-flex h-10 items-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
          data-testid="report-order-pdf"
        >
          Download PDF
        </a>
        <a
          href={`/api/reports/${encodeURIComponent(order.orderId)}?format=docx`}
          className="inline-flex h-10 items-center rounded-xl border border-slate-300 px-4 text-sm font-medium hover:border-brand-400"
          data-testid="report-order-docx"
        >
          Download DOCX
        </a>
      </div>

      {report.executiveSummary ? (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h2 className="mb-2 text-lg font-semibold text-ink-900">
            Executive summary
          </h2>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <Markdown>{report.executiveSummary}</Markdown>
          </div>
        </section>
      ) : null}

      <section className="prose prose-sm dark:prose-invert max-w-none rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <Markdown>{report.markdown}</Markdown>
      </section>
    </article>
  );
}

export default ReportOrderView;
