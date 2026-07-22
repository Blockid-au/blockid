"use client";

// Client renderer for /reseller/requests. EN+VI parity via useLocale()
// matching the tick-61/62 pattern (customer-drawer + grant-form).
//
// Denied requests render the admin's decision_reason prominently in an
// amber card so the reseller knows WHY — closes Customer-Success advisory
// §24 (b) "reseller-side denial-reason surface as a page render".

import { useMemo } from "react";
import { useLocale, type Locale } from "@/lib/use-locale";
import {
  bucketByStatus,
  summariseRequest,
  type RequestSummary,
  type ResellerRequestRow,
} from "@/lib/reseller/request-summary";
import type { ResellerRequestStatus } from "@/lib/reseller/requests";

interface Copy {
  pageTitle: string;
  pageSubtitle: string;
  empty: string;
  emptyHint: string;
  loadError: string;
  bucketPending: string;
  bucketApproved: string;
  bucketDenied: string;
  bucketCancelled: string;
  filedOn: string;
  decidedOn: string;
  decisionReasonLabel: string;
  decisionReasonMissing: string;
  askAdmin: string;
  emailFallback: string;
  askAdminHref: string;
}

const COPY: Record<Locale, Copy> = {
  en: {
    pageTitle: "My requests",
    pageSubtitle:
      "Approval requests filed to BlockID admin. Denied requests show the admin's reason so you can adjust and resubmit.",
    empty: "No requests filed yet.",
    emptyHint:
      "Requests are created when you ask for a new code, an over-budget grant, or marketing collateral approval.",
    loadError:
      "Unable to load your requests right now. Please refresh, or email admin@blockid.au if this keeps happening.",
    bucketPending: "Pending",
    bucketApproved: "Approved",
    bucketDenied: "Denied",
    bucketCancelled: "Cancelled",
    filedOn: "Filed",
    decidedOn: "Decided",
    decisionReasonLabel: "Admin reason",
    decisionReasonMissing: "No reason recorded.",
    askAdmin: "Email admin@blockid.au",
    emailFallback: "or write to",
    askAdminHref:
      "mailto:admin@blockid.au?subject=Reseller%20request%20follow-up",
  },
  vi: {
    pageTitle: "Yêu cầu của tôi",
    pageSubtitle:
      "Các yêu cầu phê duyệt đã gửi tới quản trị viên BlockID. Yêu cầu bị từ chối hiển thị lý do để bạn điều chỉnh và gửi lại.",
    empty: "Chưa có yêu cầu nào.",
    emptyHint:
      "Yêu cầu được tạo khi bạn xin mã mới, cấp tín dụng vượt ngân sách, hoặc duyệt tài liệu tiếp thị.",
    loadError:
      "Không thể tải danh sách yêu cầu. Vui lòng thử lại, hoặc gửi email tới admin@blockid.au nếu lỗi tiếp diễn.",
    bucketPending: "Đang chờ",
    bucketApproved: "Đã duyệt",
    bucketDenied: "Đã từ chối",
    bucketCancelled: "Đã huỷ",
    filedOn: "Gửi",
    decidedOn: "Quyết định",
    decisionReasonLabel: "Lý do của quản trị viên",
    decisionReasonMissing: "Không có lý do được ghi lại.",
    askAdmin: "Gửi email tới admin@blockid.au",
    emailFallback: "hoặc gửi tới",
    askAdminHref:
      "mailto:admin@blockid.au?subject=Ph%E1%BA%A3n%20h%E1%BB%93i%20y%C3%AAu%20c%E1%BA%A7u%20reseller",
  },
};

function fmtDate(iso: string | null, locale: Locale): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-AU", {
      dateStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function statusPillClass(status: ResellerRequestStatus): string {
  switch (status) {
    case "pending":
      return "bg-blue-50 text-blue-800 border-blue-200";
    case "approved":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "denied":
      return "bg-rose-50 text-rose-800 border-rose-200";
    case "cancelled":
      return "bg-surface-100 text-ink-600 border-surface-200";
  }
}

function statusLabel(status: ResellerRequestStatus, copy: Copy): string {
  switch (status) {
    case "pending":
      return copy.bucketPending;
    case "approved":
      return copy.bucketApproved;
    case "denied":
      return copy.bucketDenied;
    case "cancelled":
      return copy.bucketCancelled;
  }
}

interface Props {
  rows: ResellerRequestRow[];
  queryError: string | null;
}

export function RequestsView({ rows, queryError }: Props) {
  const [locale] = useLocale();
  const copy = COPY[locale];

  const summaries = useMemo(() => rows.map(summariseRequest), [rows]);
  const buckets = useMemo(() => bucketByStatus(summaries), [summaries]);

  if (queryError) {
    return (
      <>
        <PageHeader copy={copy} />
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <p>{copy.loadError}</p>
          <p className="mt-1 text-xs text-rose-700/80">{queryError}</p>
        </div>
      </>
    );
  }

  if (summaries.length === 0) {
    return (
      <>
        <PageHeader copy={copy} />
        <div className="rounded-lg border border-dashed border-surface-300 bg-white p-8 text-center">
          <p className="text-sm text-ink-600">{copy.empty}</p>
          <p className="mt-1 text-xs text-ink-500">{copy.emptyHint}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader copy={copy} />
      <div className="space-y-6">
        <Bucket
          title={copy.bucketPending}
          items={buckets.pending}
          copy={copy}
          locale={locale}
        />
        <Bucket
          title={copy.bucketDenied}
          items={buckets.denied}
          copy={copy}
          locale={locale}
          emphasise
        />
        <Bucket
          title={copy.bucketApproved}
          items={buckets.approved}
          copy={copy}
          locale={locale}
        />
        <Bucket
          title={copy.bucketCancelled}
          items={buckets.cancelled}
          copy={copy}
          locale={locale}
        />
      </div>
    </>
  );
}

function PageHeader({ copy }: { copy: Copy }) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-ink-900">{copy.pageTitle}</h2>
      <p className="mt-1 text-sm text-ink-600">{copy.pageSubtitle}</p>
    </div>
  );
}

function Bucket({
  title,
  items,
  copy,
  locale,
  emphasise,
}: {
  title: string;
  items: RequestSummary[];
  copy: Copy;
  locale: Locale;
  emphasise?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
        {title} ({items.length})
      </h3>
      <ul className="space-y-3">
        {items.map((s) => (
          <li key={s.id}>
            <RequestCard summary={s} copy={copy} locale={locale} emphasise={emphasise} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RequestCard({
  summary,
  copy,
  locale,
  emphasise,
}: {
  summary: RequestSummary;
  copy: Copy;
  locale: Locale;
  emphasise?: boolean;
}) {
  const isDenied = summary.status === "denied";
  const border = emphasise && isDenied ? "border-rose-300" : "border-surface-200";
  return (
    <div className={`rounded-lg border ${border} bg-white p-4 shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-ink-900">
            {summary.title[locale]}
          </p>
          <p className="mt-1 text-sm text-ink-600">{summary.subtitle[locale]}</p>
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusPillClass(summary.status)}`}
        >
          {statusLabel(summary.status, copy)}
        </span>
      </div>
      {summary.details.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-ink-700">
          {summary.details.map((d, i) => (
            <li key={i}>{d[locale]}</li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
        <span>
          {copy.filedOn}: {fmtDate(summary.created_at, locale)}
        </span>
        {summary.decision_at && (
          <span>
            {copy.decidedOn}: {fmtDate(summary.decision_at, locale)}
          </span>
        )}
      </div>
      {isDenied && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            {copy.decisionReasonLabel}
          </p>
          <p className="mt-1 whitespace-pre-wrap">
            {summary.decision_reason && summary.decision_reason.trim()
              ? summary.decision_reason
              : copy.decisionReasonMissing}
          </p>
          <p className="mt-2 text-xs text-amber-800/90">
            {copy.emailFallback}{" "}
            <a href={copy.askAdminHref} className="font-medium underline">
              {copy.askAdmin}
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );
}
