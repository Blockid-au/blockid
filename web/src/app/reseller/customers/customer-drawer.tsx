"use client";

// Reseller customer drawer — 3 tabs (Overview / Progression / Reports).
//
// Fetches /api/reseller/customers/[id]/drawer on open. The route writes a
// reseller_audit_log entry with action='view_customer_drawer' BEFORE
// returning the payload, so every drawer open is durable-logged (U.15 P4.2).

import { useEffect, useState } from "react";

import { useLocale, type Locale } from "@/lib/use-locale";

type Tab = "overview" | "progression" | "reports";

interface ProgressionEvent {
  kind: string;
  ts: string;
  label: string;
  detail?: string | null;
  // Track B B8 — /guide/<slug> deep-link envelope; null for cross-cutting events.
  phase?: number | null;
  chapterSlug?: string | null;
  href?: string | null;
}
interface SviCurvePoint {
  month: string;
  score: number;
}
interface ReportArtifact {
  id: string;
  title: string;
  type: string;
  generated_at: string;
  size_bytes: number | null;
}
interface Overview {
  display_name: string | null;
  masked_email: string;
  signup_at: string;
  last_active_at: string | null;
  onboarding_completed: boolean;
  plan_label: string | null;
  credits_balance: number;
  mrr_aud_cents: number;
}
interface DrawerData {
  ok: true;
  overview: Overview;
  progression: ProgressionEvent[];
  svi_curve: SviCurvePoint[];
  reports: ReportArtifact[];
}

interface Props {
  customerId: string;
  displayName: string | null;
  onClose: () => void;
}

// EN+VI parity per CPO advisory §25. VI copy is real translation, not a
// machine-translation stub; use the shared useLocale() cookie so it stays
// in sync with the rest of the workspace surface (product-tour banner,
// share-mgmt drawer, grant form, guide chapters).
interface Copy {
  header_eyebrow: string;
  header_fallback: string;
  close: string;
  tab_overview: string;
  tab_progression: string;
  tab_reports: string;
  loading: string;
  load_failed: string;
  ov_display_name: string;
  ov_contact_email: string;
  ov_signed_up: string;
  ov_last_active: string;
  ov_onboarding: string;
  ov_onboarding_done: string;
  ov_onboarding_in_progress: string;
  ov_current_plan: string;
  ov_credits: string;
  ov_mrr: string;
  ov_dash: string;
  pg_empty: string;
  pg_svi_heading: string;
  pg_timeline_heading: string;
  pg_guide_chapter: string;
  rp_empty: string;
  rp_col_title: string;
  rp_col_type: string;
  rp_col_generated: string;
}

export const COPY: Record<Locale, Copy> = {
  en: {
    header_eyebrow: "Customer",
    header_fallback: "—",
    close: "Close",
    tab_overview: "Overview",
    tab_progression: "Progression",
    tab_reports: "Reports",
    loading: "Loading customer detail…",
    load_failed: "Failed to load",
    ov_display_name: "Display name",
    ov_contact_email: "Contact email",
    ov_signed_up: "Signed up",
    ov_last_active: "Last active",
    ov_onboarding: "Onboarding",
    ov_onboarding_done: "Completed",
    ov_onboarding_in_progress: "In progress",
    ov_current_plan: "Current plan",
    ov_credits: "Credits balance",
    ov_mrr: "MRR (last 31 days)",
    ov_dash: "—",
    pg_empty: "No progression events yet.",
    pg_svi_heading: "SVI curve (monthly)",
    pg_timeline_heading: "Timeline (newest first)",
    pg_guide_chapter: "Guide chapter",
    rp_empty: "No reports generated yet.",
    rp_col_title: "Title",
    rp_col_type: "Type",
    rp_col_generated: "Generated",
  },
  vi: {
    header_eyebrow: "Khách hàng",
    header_fallback: "—",
    close: "Đóng",
    tab_overview: "Tổng quan",
    tab_progression: "Tiến trình",
    tab_reports: "Báo cáo",
    loading: "Đang tải chi tiết khách hàng…",
    load_failed: "Không tải được",
    ov_display_name: "Tên hiển thị",
    ov_contact_email: "Email liên hệ",
    ov_signed_up: "Đăng ký",
    ov_last_active: "Hoạt động gần nhất",
    ov_onboarding: "Khởi tạo",
    ov_onboarding_done: "Đã hoàn tất",
    ov_onboarding_in_progress: "Đang tiến hành",
    ov_current_plan: "Gói hiện tại",
    ov_credits: "Số tín dụng còn lại",
    ov_mrr: "MRR (31 ngày qua)",
    ov_dash: "—",
    pg_empty: "Chưa có sự kiện tiến trình nào.",
    pg_svi_heading: "Đường cong SVI (theo tháng)",
    pg_timeline_heading: "Dòng thời gian (mới nhất trước)",
    pg_guide_chapter: "Chương hướng dẫn",
    rp_empty: "Chưa có báo cáo nào được tạo.",
    rp_col_title: "Tiêu đề",
    rp_col_type: "Loại",
    rp_col_generated: "Đã tạo",
  },
};

function fmtDate(iso: string | null | undefined, dash: string): string {
  if (!iso) return dash;
  return new Date(iso).toISOString().slice(0, 10);
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toISOString().replace("T", " ").slice(0, 16);
}

function fmtAud(cents: number, locale: Locale): string {
  // Currency stays A$ in both locales; only the decimal separator flips
  // for VI so the number reads naturally in-country.
  const value = (cents / 100).toFixed(2);
  return locale === "vi" ? `A$${value.replace(".", ",")}` : `A$${value}`;
}

export function CustomerDrawer({ customerId, displayName, onClose }: Props) {
  const [locale] = useLocale();
  const copy = COPY[locale];
  const [tab, setTab] = useState<Tab>("overview");
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; data: DrawerData }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/reseller/customers/${encodeURIComponent(customerId)}/drawer`,
          { method: "GET" },
        );
        const body = (await res.json()) as DrawerData | { ok: false; reason: string };
        if (cancelled) return;
        if (!res.ok || !("ok" in body) || body.ok !== true) {
          setState({
            status: "error",
            message: "reason" in body ? body.reason : `HTTP ${res.status}`,
          });
          return;
        }
        setState({ status: "ready", data: body });
      } catch (err) {
        if (!cancelled) setState({ status: "error", message: (err as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "overview", label: copy.tab_overview },
    { key: "progression", label: copy.tab_progression },
    { key: "reports", label: copy.tab_reports },
  ];

  return (
    <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="relative ml-auto flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-surface-200 bg-white shadow-xl">
        <header className="flex items-start justify-between border-b border-surface-200 p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-500">
              {copy.header_eyebrow}
            </p>
            <h3 className="mt-0.5 text-base font-semibold text-ink-900">
              {displayName ?? copy.header_fallback}
            </h3>
          </div>
          <div className="flex items-center gap-3">
            {/* Deep-link to the Mentor console for this founder. Keeps the
                drawer as the billing view; Mentor is the engagement view. */}
            <a
              href={`/reseller/mentor/${customerId}/overview`}
              className="rounded-md border border-surface-300 px-2 py-1 text-xs text-ink-700 hover:bg-surface-50"
            >
              Open in Mentor console
            </a>
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-ink-500 hover:text-ink-800"
              aria-label={copy.close}
            >
              {copy.close}
            </button>
          </div>
        </header>

        <nav className="flex border-b border-surface-200 text-sm">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex-1 px-4 py-2 ${
                tab === t.key
                  ? "border-b-2 border-brand-600 font-medium text-brand-800"
                  : "text-ink-600 hover:text-ink-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto p-4 text-sm">
          {state.status === "loading" && (
            <p className="text-ink-500">{copy.loading}</p>
          )}
          {state.status === "error" && (
            <p className="text-red-600">
              {copy.load_failed}: {state.message}
            </p>
          )}
          {state.status === "ready" && tab === "overview" && (
            <OverviewTab overview={state.data.overview} copy={copy} locale={locale} />
          )}
          {state.status === "ready" && tab === "progression" && (
            <ProgressionTab
              events={state.data.progression}
              curve={state.data.svi_curve}
              copy={copy}
            />
          )}
          {state.status === "ready" && tab === "reports" && (
            <ReportsTab reports={state.data.reports} copy={copy} />
          )}
        </div>
      </aside>
    </div>
  );
}

function OverviewTab({
  overview,
  copy,
  locale,
}: {
  overview: Overview;
  copy: Copy;
  locale: Locale;
}) {
  const numberFormatter = new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-AU");
  const rows: Array<[string, string]> = [
    [copy.ov_display_name, overview.display_name ?? copy.ov_dash],
    [copy.ov_contact_email, overview.masked_email],
    [copy.ov_signed_up, fmtDate(overview.signup_at, copy.ov_dash)],
    [copy.ov_last_active, fmtDate(overview.last_active_at, copy.ov_dash)],
    [
      copy.ov_onboarding,
      overview.onboarding_completed
        ? copy.ov_onboarding_done
        : copy.ov_onboarding_in_progress,
    ],
    [copy.ov_current_plan, overview.plan_label ?? copy.ov_dash],
    [copy.ov_credits, numberFormatter.format(overview.credits_balance)],
    [copy.ov_mrr, fmtAud(overview.mrr_aud_cents, locale)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-y-3">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-xs uppercase tracking-wide text-ink-500">{k}</dt>
          <dd className="text-ink-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function ProgressionTab({
  events,
  curve,
  copy,
}: {
  events: ProgressionEvent[];
  curve: SviCurvePoint[];
  copy: Copy;
}) {
  if (events.length === 0) {
    return <p className="text-ink-500">{copy.pg_empty}</p>;
  }
  const displayed = [...events].reverse();
  return (
    <div>
      {curve.length > 0 && (
        <section className="mb-4">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-500">
            {copy.pg_svi_heading}
          </h4>
          <ul className="grid grid-cols-6 gap-2 text-xs">
            {curve.map((p) => (
              <li key={p.month} className="rounded border border-surface-200 px-2 py-1 text-center">
                <div className="text-ink-500">{p.month}</div>
                <div className="text-sm font-semibold text-ink-900">{p.score}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-500">
        {copy.pg_timeline_heading}
      </h4>
      <ol className="space-y-2">
        {displayed.map((e, idx) => (
          <li key={`${e.ts}-${idx}`} className="rounded border border-surface-200 p-3">
            <div className="flex items-baseline justify-between text-xs text-ink-500">
              <span className="font-medium capitalize text-ink-700">
                {e.label}
              </span>
              <span>{fmtDateTime(e.ts)}</span>
            </div>
            {e.detail ? (
              <p className="mt-1 text-xs text-ink-600">{e.detail}</p>
            ) : null}
            {e.href && e.phase ? (
              <p className="mt-2 text-xs">
                <a
                  href={e.href}
                  target="_blank"
                  rel="noopener"
                  className="text-brand-700 underline hover:text-brand-900"
                >
                  {copy.pg_guide_chapter} {e.phase} →
                </a>
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function ReportsTab({
  reports,
  copy,
}: {
  reports: ReportArtifact[];
  copy: Copy;
}) {
  if (reports.length === 0) {
    return <p className="text-ink-500">{copy.rp_empty}</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase tracking-wide text-ink-500">
        <tr>
          <th className="py-2">{copy.rp_col_title}</th>
          <th className="py-2">{copy.rp_col_type}</th>
          <th className="py-2">{copy.rp_col_generated}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-surface-100">
        {reports.map((r) => (
          <tr key={r.id}>
            <td className="py-2 text-ink-900">{r.title}</td>
            <td className="py-2 text-ink-700">{r.type}</td>
            <td className="py-2 text-ink-600">{fmtDate(r.generated_at, copy.ov_dash)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
