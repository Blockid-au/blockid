"use client";

// P3c — founder-facing TAM/SAM/SOM lookup panel mounted on the Chapter 3
// (Market Research) guide surface. Wraps the public GET /api/abs/lookup route
// (P3b) around the seeded au-market-lookup fixture (P3a). No auth, no
// persistence — a raw client-side fetch on submit.
//
// Renders inline with the chapter body so a founder can size their AU market
// without leaving the guide flow, and pivots to a sibling ANZSIC class via
// the response's `suggestions[]` when the auto-pick doesn't match intent.

import * as React from "react";
import type { Locale } from "@/lib/i18n";
import {
  buildAbsLookupUrl,
  formatAudCompact,
  formatPct,
  makeEmptyAbsLookupFormState,
  type AbsLookupError,
  type AbsLookupFormState,
  type AbsLookupSuccess,
} from "./abs-lookup.helpers";

type PanelVariant = "marketing" | "workspace";

interface AbsLookupPanelProps {
  locale: Locale;
  variant?: PanelVariant;
  initialKeyword?: string;
}

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; body: AbsLookupSuccess }
  | { status: "error"; body: AbsLookupError | { error: string; message: string } };

const COPY = {
  en: {
    heading: "Size your AU market (TAM / SAM / SOM)",
    subheading:
      "Anchor your Chapter 3 market memo with an ABS + IBISWorld starting range. Refine with primary research before quoting to investors.",
    queryLabel: "Industry keyword or ANZSIC 2006 class code",
    queryHint:
      'Try "saas", "fintech", "healthtech", or a code like "J5810".',
    addressableLabel: "Addressable share (SAM as % of TAM)",
    addressableHint: "Blank uses the default 20%.",
    shareLabel: "Target share (SOM as % of SAM)",
    shareHint: "Blank uses the default 1%.",
    submit: "Look up",
    submitting: "Looking up…",
    tam: "TAM",
    sam: "SAM",
    som: "SOM",
    cagr: "5-yr CAGR",
    businessCount: "AU businesses",
    sources: "Sources",
    notes: "Notes",
    suggestionsHeading: "Also worth checking",
    suggestionsHint:
      "These sibling ANZSIC classes matched your keyword — click one to re-run the lookup with the exact code.",
    emptyHint:
      "Enter an industry keyword or ANZSIC code above, then click Look up.",
    errorHeading: "No match",
  },
  vi: {
    heading: "Ước tính thị trường AU (TAM / SAM / SOM)",
    subheading:
      "Neo bản memo thị trường Chương 3 bằng dữ liệu ABS + IBISWorld. Tinh chỉnh với nghiên cứu thực địa trước khi trình bày cho nhà đầu tư.",
    queryLabel: "Từ khoá ngành hoặc mã ANZSIC 2006",
    queryHint: 'Ví dụ: "saas", "fintech", "healthtech", hoặc mã như "J5810".',
    addressableLabel: "Tỷ lệ tiếp cận được (SAM / TAM)",
    addressableHint: "Bỏ trống dùng mặc định 20%.",
    shareLabel: "Thị phần mục tiêu (SOM / SAM)",
    shareHint: "Bỏ trống dùng mặc định 1%.",
    submit: "Tra cứu",
    submitting: "Đang tra cứu…",
    tam: "TAM",
    sam: "SAM",
    som: "SOM",
    cagr: "CAGR 5 năm",
    businessCount: "Doanh nghiệp AU",
    sources: "Nguồn",
    notes: "Ghi chú",
    suggestionsHeading: "Có thể liên quan",
    suggestionsHint:
      "Các mã ANZSIC lân cận khớp với từ khoá — chọn một để chạy lại tra cứu với mã chính xác.",
    emptyHint:
      "Nhập từ khoá hoặc mã ANZSIC ở trên rồi nhấn Tra cứu.",
    errorHeading: "Không tìm thấy",
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

export function AbsLookupPanel({
  locale,
  variant = "marketing",
  initialKeyword,
}: AbsLookupPanelProps) {
  const copy = locale === "vi" ? COPY.vi : COPY.en;
  const [state, setState] = React.useState<AbsLookupFormState>(() =>
    makeEmptyAbsLookupFormState(initialKeyword),
  );
  const [fetchState, setFetchState] = React.useState<FetchState>({
    status: "idle",
  });

  const url = buildAbsLookupUrl(state);
  const canSubmit = url !== null && fetchState.status !== "loading";

  const runLookup = React.useCallback(
    async (target: string) => {
      setFetchState({ status: "loading" });
      try {
        const res = await fetch(target, { cache: "no-store" });
        const body = (await res.json()) as AbsLookupSuccess | AbsLookupError;
        if (!res.ok) {
          setFetchState({ status: "error", body: body as AbsLookupError });
          return;
        }
        setFetchState({ status: "success", body: body as AbsLookupSuccess });
      } catch (err) {
        setFetchState({
          status: "error",
          body: {
            error: "network_error",
            message: err instanceof Error ? err.message : String(err),
          },
        });
      }
    },
    [],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    void runLookup(url);
  };

  const pivotToAnzsic = (code: string) => {
    const next: AbsLookupFormState = { ...state, query: code };
    setState(next);
    const nextUrl = buildAbsLookupUrl(next);
    if (nextUrl) void runLookup(nextUrl);
  };

  const bodyTextClass =
    variant === "workspace"
      ? "text-sm text-ink-700"
      : "text-sm text-slate-700 dark:text-slate-300";
  const hintTextClass =
    variant === "workspace"
      ? "mt-0.5 text-xs text-ink-500"
      : "mt-1 text-xs text-slate-500 dark:text-slate-400";

  return (
    <section
      className={panelClasses(variant)}
      data-testid="abs-lookup-panel"
      data-status={fetchState.status}
    >
      <h2 className={headingClasses(variant)}>{copy.heading}</h2>
      <p className={subheadingClasses(variant)}>{copy.subheading}</p>

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <label className="block">
          <div className={labelClasses(variant)}>{copy.queryLabel}</div>
          <div className={hintTextClass}>{copy.queryHint}</div>
          <input
            type="text"
            value={state.query}
            onChange={(e) =>
              setState((prev) => ({ ...prev, query: e.target.value }))
            }
            className={inputClasses(variant)}
            data-testid="abs-lookup-query"
            placeholder="saas"
            autoComplete="off"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <div className={labelClasses(variant)}>{copy.addressableLabel}</div>
            <div className={hintTextClass}>{copy.addressableHint}</div>
            <input
              type="number"
              min={0}
              max={100}
              step="any"
              inputMode="decimal"
              value={state.addressablePct}
              onChange={(e) =>
                setState((prev) => ({ ...prev, addressablePct: e.target.value }))
              }
              className={inputClasses(variant)}
              placeholder="20"
            />
          </label>
          <label className="block">
            <div className={labelClasses(variant)}>{copy.shareLabel}</div>
            <div className={hintTextClass}>{copy.shareHint}</div>
            <input
              type="number"
              min={0}
              max={100}
              step="any"
              inputMode="decimal"
              value={state.targetSharePct}
              onChange={(e) =>
                setState((prev) => ({ ...prev, targetSharePct: e.target.value }))
              }
              className={inputClasses(variant)}
              placeholder="1"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className={submitClasses(variant)}
          data-testid="abs-lookup-submit"
        >
          {fetchState.status === "loading" ? copy.submitting : copy.submit}
        </button>
      </form>

      {fetchState.status === "idle" ? (
        <p className={`mt-6 ${hintTextClass}`}>{copy.emptyHint}</p>
      ) : null}

      {fetchState.status === "error" ? (
        <div
          className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200"
          data-testid="abs-lookup-error"
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
          bodyTextClass={bodyTextClass}
          hintTextClass={hintTextClass}
          variant={variant}
          onPivot={pivotToAnzsic}
        />
      ) : null}
    </section>
  );
}

type PanelCopy = {
  [K in keyof (typeof COPY)["en"]]: string;
};

function ResultBlock(props: {
  body: AbsLookupSuccess;
  copy: PanelCopy;
  bodyTextClass: string;
  hintTextClass: string;
  variant: PanelVariant;
  onPivot: (code: string) => void;
}) {
  const { body, copy, bodyTextClass, hintTextClass, variant, onPivot } = props;
  const tileClass =
    variant === "workspace"
      ? "rounded-md border border-surface-200 bg-surface-50 p-3"
      : "rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950";
  return (
    <div className="mt-6 space-y-5" data-testid="abs-lookup-result">
      <header>
        <p className={hintTextClass}>
          ANZSIC {body.industry.anzsic_code} · Division {body.industry.division}
        </p>
        <h3
          className={
            variant === "workspace"
              ? "mt-0.5 text-base font-semibold text-ink-800"
              : "mt-0.5 text-base font-semibold text-slate-900 dark:text-slate-100"
          }
          data-testid="abs-lookup-label"
        >
          {body.industry.label}
        </h3>
      </header>

      <div className="grid gap-3 md:grid-cols-3" data-testid="abs-lookup-tam-sam-som">
        <div className={tileClass}>
          <p className={`text-xs uppercase tracking-wide ${hintTextClass}`}>{copy.tam}</p>
          <p className="mt-1 text-lg font-semibold" data-testid="abs-lookup-tam">
            {formatAudCompact(body.tam_aud)}
          </p>
        </div>
        <div className={tileClass}>
          <p className={`text-xs uppercase tracking-wide ${hintTextClass}`}>
            {copy.sam} ({formatPct(body.addressable_pct)})
          </p>
          <p className="mt-1 text-lg font-semibold" data-testid="abs-lookup-sam">
            {formatAudCompact(body.sam_aud)}
          </p>
        </div>
        <div className={tileClass}>
          <p className={`text-xs uppercase tracking-wide ${hintTextClass}`}>
            {copy.som} ({formatPct(body.target_share_pct)})
          </p>
          <p className="mt-1 text-lg font-semibold" data-testid="abs-lookup-som">
            {formatAudCompact(body.som_aud)}
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className={tileClass}>
          <p className={`text-xs uppercase tracking-wide ${hintTextClass}`}>{copy.cagr}</p>
          <p className="mt-1 text-base font-semibold">
            {formatPct(body.industry.cagr)}
          </p>
        </div>
        <div className={tileClass}>
          <p className={`text-xs uppercase tracking-wide ${hintTextClass}`}>
            {copy.businessCount}
          </p>
          <p className="mt-1 text-base font-semibold">
            {body.industry.business_count.toLocaleString("en-AU")}
          </p>
        </div>
      </div>

      {body.industry.notes ? (
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wide ${hintTextClass}`}>
            {copy.notes}
          </p>
          <p className={`mt-1 ${bodyTextClass}`}>{body.industry.notes}</p>
        </div>
      ) : null}

      {body.industry.sources.length > 0 ? (
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wide ${hintTextClass}`}>
            {copy.sources}
          </p>
          <ul className={`mt-1 space-y-1 ${bodyTextClass}`}>
            {body.industry.sources.map((s) => (
              <li key={s.url}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-700 underline hover:text-emerald-900 dark:text-emerald-300"
                >
                  {s.publisher} — {s.title} ({s.publishedYear})
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {body.suggestions.length > 0 ? (
        <div data-testid="abs-lookup-suggestions">
          <p className={`text-xs font-semibold uppercase tracking-wide ${hintTextClass}`}>
            {copy.suggestionsHeading}
          </p>
          <p className={`mt-1 ${hintTextClass}`}>{copy.suggestionsHint}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {body.suggestions.map((s) => (
              <li key={s.anzsic_code}>
                <button
                  type="button"
                  onClick={() => onPivot(s.anzsic_code)}
                  className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-emerald-500 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-300"
                >
                  {s.label} · {s.anzsic_code} · {formatAudCompact(s.tam_aud)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className={`text-xs italic ${hintTextClass}`} data-testid="abs-lookup-disclaimer">
        {body.disclaimer}
      </p>
    </div>
  );
}

