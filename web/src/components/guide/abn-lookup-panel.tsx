"use client";

// P1g-founder-panel — founder-facing ABN lookup panel mounted on the
// Chapter 1 (Vision / Day-0 Idea) guide surface. Wraps the public GET
// /api/abr/lookup route (P1g) around the ABR AbnDetails web service. No
// auth, no persistence — a raw client-side fetch on submit that gives
// founders the 60-second trust signal §1 phase 1 flagged as P0.
//
// Renders inline with the chapter body so a founder can validate their
// ABN + ACN + entity name without leaving the guide flow. Mirrors the
// AbsLookupPanel (P3c) posture — marketing + workspace variants share
// the same component and swap colour tokens.

import * as React from "react";
import type { Locale } from "@/lib/i18n";
import {
  buildAbnLookupUrl,
  formatAbrDate,
  formatAcnDisplay,
  isProbablyCompleteAbn,
  makeEmptyAbnLookupFormState,
  pickAbnBand,
  type AbnLookupError,
  type AbnLookupFormState,
  type AbnLookupSuccess,
} from "./abn-lookup.helpers";

type PanelVariant = "marketing" | "workspace";

interface AbnLookupPanelProps {
  locale: Locale;
  variant?: PanelVariant;
  initialAbn?: string;
}

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; body: AbnLookupSuccess }
  | { status: "error"; body: AbnLookupError | { error: string; message: string } };

const COPY = {
  en: {
    heading: "Validate your ABN + ACN in 60 seconds",
    subheading:
      "Investors check the ABR before every first meeting. Paste your 11-digit ABN — BlockID confirms the modulus-89 checksum and, when ABR_GUID is wired, the registered entity name, ACN, GST status, and address on record.",
    abnLabel: "ABN (11 digits)",
    abnHint: 'Spaces + dashes are stripped. Try "79 659 615 111".',
    submit: "Look up",
    submitting: "Looking up…",
    emptyHint: "Type your ABN above then click Look up.",
    incompleteHint: "ABN must be exactly 11 digits. Keep typing.",
    errorHeading: "Lookup failed",
    checksumOk: "Checksum passes",
    checksumFail: "Checksum failed — double-check the digits",
    liveMissing:
      "Live ABR record not fetched (ABR_GUID env var isn't wired on this deployment). Checksum-only confirmation.",
    liveOk: "ABR live match",
    entityName: "Entity name",
    entityType: "Entity type",
    acn: "ACN",
    abnStatus: "ABN status",
    abnEffective: "Effective from",
    gstRegistered: "GST registered",
    gstEffective: "GST effective from",
    businessState: "State",
    businessPostcode: "Postcode",
    yes: "Yes",
    no: "No",
    unknown: "—",
    disclaimer:
      "Data is sourced from the Australian Business Register (business.gov.au). Verify with your accountant or ASIC Connect before quoting into a Founder Agreement or investor deck.",
  },
  vi: {
    heading: "Xác thực ABN + ACN trong 60 giây",
    subheading:
      "Nhà đầu tư luôn tra ABR trước cuộc gặp đầu tiên. Dán ABN 11 chữ số — BlockID xác thực checksum modulus-89 và, khi đã cấu hình ABR_GUID, kéo về tên pháp nhân, ACN, trạng thái GST và địa chỉ đăng ký.",
    abnLabel: "ABN (11 chữ số)",
    abnHint: 'Khoảng trắng + dấu gạch được bỏ. Ví dụ: "79 659 615 111".',
    submit: "Tra cứu",
    submitting: "Đang tra cứu…",
    emptyHint: "Nhập ABN ở trên rồi nhấn Tra cứu.",
    incompleteHint: "ABN phải đúng 11 chữ số. Tiếp tục nhập.",
    errorHeading: "Tra cứu thất bại",
    checksumOk: "Checksum hợp lệ",
    checksumFail: "Checksum sai — kiểm tra lại các chữ số",
    liveMissing:
      "Chưa lấy được bản ghi ABR (ABR_GUID chưa cấu hình trên môi trường này). Chỉ xác nhận theo checksum.",
    liveOk: "Khớp với dữ liệu ABR",
    entityName: "Tên pháp nhân",
    entityType: "Loại pháp nhân",
    acn: "ACN",
    abnStatus: "Trạng thái ABN",
    abnEffective: "Hiệu lực từ",
    gstRegistered: "Đăng ký GST",
    gstEffective: "GST hiệu lực từ",
    businessState: "Bang",
    businessPostcode: "Mã bưu điện",
    yes: "Có",
    no: "Không",
    unknown: "—",
    disclaimer:
      "Dữ liệu lấy từ Australian Business Register (business.gov.au). Xác nhận với kế toán hoặc ASIC Connect trước khi ghi vào Founder Agreement hay pitch deck.",
  },
} as const;

function panelClasses(variant: PanelVariant): string {
  if (variant === "workspace") {
    return "rounded-lg border border-surface-200 bg-white p-4";
  }
  return "mt-10 rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900";
}

function headingClasses(variant: PanelVariant): string {
  return variant === "workspace"
    ? "text-lg font-semibold text-ink-800"
    : "text-xl font-semibold text-slate-900 dark:text-slate-100";
}

function subheadingClasses(variant: PanelVariant): string {
  return variant === "workspace"
    ? "mt-1 text-xs text-ink-500"
    : "mt-2 text-sm text-slate-600 dark:text-slate-400";
}

function labelClasses(variant: PanelVariant): string {
  return variant === "workspace"
    ? "text-sm font-semibold text-ink-800"
    : "text-sm font-semibold text-slate-900 dark:text-slate-100";
}

function inputClasses(variant: PanelVariant): string {
  return variant === "workspace"
    ? "mt-2 w-full rounded-md border border-surface-300 bg-white px-3 py-2 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
    : "mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
}

function submitClasses(variant: PanelVariant): string {
  return variant === "workspace"
    ? "mt-4 inline-flex items-center rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-surface-300"
    : "mt-4 inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700";
}

const BAND_STYLES: Record<
  "red" | "amber" | "emerald",
  { chip: string; container: string }
> = {
  red: {
    chip: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200",
    container:
      "border-red-300 bg-red-50 dark:border-red-900/40 dark:bg-red-950/30",
  },
  amber: {
    chip: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
    container:
      "border-amber-300 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30",
  },
  emerald: {
    chip:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
    container:
      "border-emerald-300 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30",
  },
};

export function AbnLookupPanel({
  locale,
  variant = "marketing",
  initialAbn,
}: AbnLookupPanelProps) {
  const copy = locale === "vi" ? COPY.vi : COPY.en;
  const [state, setState] = React.useState<AbnLookupFormState>(() =>
    makeEmptyAbnLookupFormState(initialAbn),
  );
  const [fetchState, setFetchState] = React.useState<FetchState>({
    status: "idle",
  });

  const url = buildAbnLookupUrl(state);
  const complete = isProbablyCompleteAbn(state);
  const canSubmit = url !== null && complete && fetchState.status !== "loading";

  const runLookup = React.useCallback(async (target: string) => {
    setFetchState({ status: "loading" });
    try {
      const res = await fetch(target, { cache: "no-store" });
      const body = (await res.json()) as AbnLookupSuccess | AbnLookupError;
      if (!res.ok) {
        setFetchState({ status: "error", body: body as AbnLookupError });
        return;
      }
      setFetchState({ status: "success", body: body as AbnLookupSuccess });
    } catch (err) {
      setFetchState({
        status: "error",
        body: {
          error: "network_error",
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url || !complete) return;
    void runLookup(url);
  };

  const hintTextClass =
    variant === "workspace"
      ? "mt-0.5 text-xs text-ink-500"
      : "mt-1 text-xs text-slate-500 dark:text-slate-400";

  return (
    <section
      className={panelClasses(variant)}
      data-testid="abn-lookup-panel"
      data-status={fetchState.status}
    >
      <h2 className={headingClasses(variant)}>{copy.heading}</h2>
      <p className={subheadingClasses(variant)}>{copy.subheading}</p>

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <label className="block">
          <div className={labelClasses(variant)}>{copy.abnLabel}</div>
          <div className={hintTextClass}>{copy.abnHint}</div>
          <input
            type="text"
            value={state.abn}
            onChange={(e) => setState({ abn: e.target.value })}
            className={inputClasses(variant)}
            data-testid="abn-lookup-input"
            placeholder="79 659 615 111"
            autoComplete="off"
            inputMode="numeric"
            spellCheck={false}
          />
        </label>

        <button
          type="submit"
          disabled={!canSubmit}
          className={submitClasses(variant)}
          data-testid="abn-lookup-submit"
        >
          {fetchState.status === "loading" ? copy.submitting : copy.submit}
        </button>
      </form>

      {fetchState.status === "idle" ? (
        <p className={`mt-6 ${hintTextClass}`}>
          {state.abn.trim().length === 0 || complete ? copy.emptyHint : copy.incompleteHint}
        </p>
      ) : null}

      {fetchState.status === "error" ? (
        <div
          className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200"
          data-testid="abn-lookup-error"
          role="alert"
        >
          <p className="font-semibold">{copy.errorHeading}</p>
          <p className="mt-1">{fetchState.body.message}</p>
        </div>
      ) : null}

      {fetchState.status === "success" ? (
        <ResultBlock
          body={fetchState.body}
          copy={copy}
          hintTextClass={hintTextClass}
          variant={variant}
        />
      ) : null}
    </section>
  );
}

type PanelCopy = {
  [K in keyof (typeof COPY)["en"]]: string;
};

function ResultBlock(props: {
  body: AbnLookupSuccess;
  copy: PanelCopy;
  hintTextClass: string;
  variant: PanelVariant;
}) {
  const { body, copy, hintTextClass, variant } = props;
  const band = pickAbnBand(body);
  const bandStyles = BAND_STYLES[band];
  const tileClass =
    variant === "workspace"
      ? "rounded-md border border-surface-200 bg-surface-50 p-3"
      : "rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950";
  const kvKey =
    variant === "workspace"
      ? "text-xs uppercase tracking-wide text-ink-500"
      : "text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400";
  const kvVal =
    variant === "workspace"
      ? "mt-1 text-sm font-semibold text-ink-800"
      : "mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100";

  const live = body.live;

  return (
    <div className="mt-6 space-y-5" data-testid="abn-lookup-result" data-band={band}>
      <header
        className={`rounded-md border p-4 ${bandStyles.container}`}
        data-testid="abn-lookup-band"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${bandStyles.chip}`}
          >
            {body.valid_checksum ? copy.checksumOk : copy.checksumFail}
          </span>
          {live ? (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${bandStyles.chip}`}
            >
              {copy.liveOk}
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-sm font-semibold" data-testid="abn-lookup-formatted">
          {body.abn_formatted}
        </p>
        {!live ? (
          <p className={`mt-1 text-xs italic ${hintTextClass}`}>
            {body.live_error ?? copy.liveMissing}
          </p>
        ) : null}
      </header>

      {live ? (
        <div className="grid gap-3 md:grid-cols-2" data-testid="abn-lookup-live-details">
          <div className={tileClass}>
            <p className={kvKey}>{copy.entityName}</p>
            <p className={kvVal} data-testid="abn-lookup-entity-name">
              {live.entity_name ?? copy.unknown}
            </p>
          </div>
          <div className={tileClass}>
            <p className={kvKey}>{copy.entityType}</p>
            <p className={kvVal}>{live.entity_type_name ?? copy.unknown}</p>
          </div>
          <div className={tileClass}>
            <p className={kvKey}>{copy.acn}</p>
            <p className={kvVal} data-testid="abn-lookup-acn">
              {formatAcnDisplay(live.acn)}
            </p>
          </div>
          <div className={tileClass}>
            <p className={kvKey}>{copy.abnStatus}</p>
            <p className={kvVal} data-testid="abn-lookup-abn-status">
              {live.abn_status ?? copy.unknown}
            </p>
            <p className={`mt-0.5 text-xs ${hintTextClass}`}>
              {copy.abnEffective}: {formatAbrDate(live.abn_status_effective_from)}
            </p>
          </div>
          <div className={tileClass}>
            <p className={kvKey}>{copy.gstRegistered}</p>
            <p className={kvVal}>
              {live.gst_registered === null
                ? copy.unknown
                : live.gst_registered
                  ? copy.yes
                  : copy.no}
            </p>
            <p className={`mt-0.5 text-xs ${hintTextClass}`}>
              {copy.gstEffective}: {formatAbrDate(live.gst_effective_from)}
            </p>
          </div>
          <div className={tileClass}>
            <p className={kvKey}>
              {copy.businessState} · {copy.businessPostcode}
            </p>
            <p className={kvVal}>
              {live.business_state ?? copy.unknown} ·{" "}
              {live.business_postcode ?? copy.unknown}
            </p>
          </div>
        </div>
      ) : null}

      <p
        className={`text-xs italic ${hintTextClass}`}
        data-testid="abn-lookup-disclaimer"
      >
        {copy.disclaimer}
      </p>
    </div>
  );
}
