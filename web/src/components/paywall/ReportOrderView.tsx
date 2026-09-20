/**
 * ReportOrderView — the thin order wrapper (`/workspace/reports/order`).
 *
 * G19-S45 (D4): the paid product is the ReportV2 page. After checkout /
 * redeem the founder lands on `/workspace/reports/business?order=<id>`
 * (`reportOrderPath`), where the same document renders with every chapter
 * unlocked, the TOC, share link and the v2 PDF / DOCX exports. The order
 * page now only exists for:
 *
 *   * the Stripe success_url (`?session_id=…`) and old e-mails — the page
 *     resolves the order and redirects to the ReportV2 page;
 *   * `?view=legacy` — orders generated before ReportV2 existed
 *     (no `assembled_reports.report_json`), which keep the markdown here.
 *
 * The component is a thin state machine over GET /api/reports/[orderId]
 * (`useReportOrder`): 202 → poll, 200 → render, 402/404/410 → say what
 * happened. When the order carries a ReportV2 document it renders
 * `<TbrReportV2>` (all chapters); otherwise the executive summary plus the
 * legacy markdown collapsed under "Legacy text version".
 */

"use client";

import Markdown from "react-markdown";
import { withGst } from "@/lib/plans-v2";
import { getTbrStrings, type TbrLocale } from "@/lib/i18n/tbr-strings";
import { TbrReportV2 } from "@/components/tbr/v2/report";
import { reportOrderPath } from "@/lib/paywall/report-delivery";
import { trackEvent } from "@/lib/analytics";
import { useReportOrder, type OrderMeta, type ReportPayload } from "./use-report-order";

export interface ReportOrderViewProps {
  orderId: string;
  locale?: TbrLocale;
}

/** Order-scoped export URL — owner-checked, status-gated, no second charge (v2 twins when report_json exists). */
export function reportOrderExportHref(orderId: string, format: "pdf" | "docx"): string {
  return `/api/reports/${encodeURIComponent(orderId)}?format=${format}`;
}

export function ReportOrderExportLinks({ orderId, locale = "en", surface = "order_page" }: { orderId: string; locale?: TbrLocale; surface?: string }) {
  const t = getTbrStrings(locale);
  return (
    <div className="flex flex-wrap gap-2" data-testid="report-order-exports">
      <a
        href={reportOrderExportHref(orderId, "pdf")}
        onClick={() => trackEvent("tbr_export", { format: "pdf", surface })}
        className="inline-flex h-10 items-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
        data-testid="report-order-pdf"
      >
        {t.downloadPdf}
      </a>
      <a
        href={reportOrderExportHref(orderId, "docx")}
        onClick={() => trackEvent("tbr_export", { format: "docx", surface })}
        className="inline-flex h-10 items-center rounded-xl border border-slate-300 px-4 text-sm font-medium hover:border-line"
        data-testid="report-order-docx"
      >
        {t.v2.order.downloadDocx}
      </a>
    </div>
  );
}

/** Pure (hook-free) ready state — exported for the static-render test. */
export function ReportOrderReady({ order, report, locale = "en" }: { order: OrderMeta; report: ReportPayload; locale?: TbrLocale }) {
  const t = getTbrStrings(locale);
  const v2 = report.reportV2 ?? null;
  const dateLocale = locale === "vi" ? "vi-VN" : "en-AU";
  return (
    <article className="space-y-6" data-testid="report-order-ready" data-report-order-source={v2 ? "report_v2" : "legacy_markdown"}>
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-primary">{v2 ? t.reportTitle : report.title}</h1>
        <p className="text-sm text-secondary">
          {v2 ? `${v2.cover.startupName} · ${v2.dimensions.length} ${t.tocDimensions.toLowerCase()}` : `${report.totalWords.toLocaleString("en-AU")} words · ${report.sectionsCount} sections`} · {report.tier}
          {order.generatedAt ? ` · ${t.v2.order.generated(new Date(order.generatedAt).toLocaleDateString(dateLocale))}` : null}
        </p>
        <p className="text-xs text-muted">
          {order.amountAud > 0 ? t.v2.order.paid(withGst(`A$${(order.amountAud / 100).toFixed(2)}`)) : t.v2.order.redeemed(order.creditsUsed)}
          {order.expiresAt ? ` · ${t.v2.order.availableUntil(new Date(order.expiresAt).toLocaleDateString(dateLocale))}` : null}
        </p>
      </header>

      <ReportOrderExportLinks orderId={order.orderId} locale={locale} />

      {v2 ? (
        <>
          <p className="text-xs text-muted">
            <a href={reportOrderPath(order.orderId)} className="font-medium text-action underline underline-offset-2">
              {t.v2.order.openInWorkspace}
            </a>
          </p>
          <TbrReportV2 report={v2} strings={t} locale={locale} />
        </>
      ) : (
        <>
          {report.executiveSummary ? (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-surface p-6">
              <h2 className="mb-2 text-lg font-semibold text-primary">{t.secExecutive}</h2>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <Markdown>{report.executiveSummary}</Markdown>
              </div>
            </section>
          ) : null}
          <details className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-surface p-6" data-testid="report-order-legacy">
            <summary className="cursor-pointer text-sm font-semibold text-primary">{t.v2.order.legacyText(report.totalWords)}</summary>
            <div className="prose prose-sm dark:prose-invert mt-4 max-w-none">
              <Markdown>{report.markdown}</Markdown>
            </div>
          </details>
        </>
      )}
    </article>
  );
}

export function ReportOrderPending({ message, locale = "en" }: { message: string; locale?: TbrLocale }) {
  const t = getTbrStrings(locale).v2.order;
  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-surface p-6 space-y-3" aria-live="polite" data-testid="report-order-pending">
      <h2 className="text-lg font-semibold text-primary">{t.pendingTitle}</h2>
      <p className="text-sm text-secondary leading-relaxed">{message}</p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label={t.pendingAria}>
        <div className="h-full w-1/3 animate-pulse rounded-full bg-brand-500" />
      </div>
      <p className="text-xs text-muted">{t.pendingLeave}</p>
    </section>
  );
}

export function ReportOrderBlocked({ refunded, message, failureReason, locale = "en" }: { refunded: boolean; message: string; failureReason?: string; locale?: TbrLocale }) {
  const t = getTbrStrings(locale).v2.order;
  return (
    <section className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-surface-sunken p-6 space-y-3" role="alert" data-testid="report-order-blocked">
      <h2 className="text-lg font-semibold text-primary">{refunded ? t.blockedRefunded : t.blockedUnavailable}</h2>
      <p className="text-sm text-secondary leading-relaxed">{message}</p>
      {failureReason ? <p className="text-xs font-mono text-muted">{t.reference(failureReason)}</p> : null}
      <a href="/dashboard" className="inline-flex h-10 items-center rounded-xl border border-slate-300 px-4 text-sm font-medium hover:border-line">
        {t.backToDashboard}
      </a>
    </section>
  );
}

export function ReportOrderView({ orderId, locale = "en" }: ReportOrderViewProps) {
  const state = useReportOrder(orderId);
  const t = getTbrStrings(locale).v2.order;

  if (state.phase === "loading" || state.phase === "idle") {
    return (
      <p className="text-sm text-secondary" role="status">
        {t.loading}
      </p>
    );
  }
  if (state.phase === "pending") return <ReportOrderPending message={state.message} locale={locale} />;
  if (state.phase === "blocked") return <ReportOrderBlocked refunded={state.refunded} message={state.message} failureReason={state.failureReason} locale={locale} />;
  return <ReportOrderReady order={state.order} report={state.report} locale={locale} />;
}

export default ReportOrderView;
