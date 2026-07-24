"use client";

// P4a-preview-ui — founder-facing landing-page draft preview panel mounted on
// the Chapter 4 (MVP / Product Discovery) guide surface. Wraps the public
// POST /api/landing-page/preview route (P4a-publish-route) around the pure
// renderer at web/src/lib/landing-page/preview.ts (P4a-landing-page-preview).
// No auth, no persistence — a raw client-side fetch on submit.
//
// Renders the returned HTML in a sandboxed <iframe srcDoc> so a founder can
// see the responsive light/dark preview inline without leaving the guide
// flow, plus a copy-to-clipboard markdown block for the CMO agent to review.

import * as React from "react";
import type { Locale } from "@/lib/i18n";
import {
  canSubmitPreview,
  makeEmptyLandingPagePreviewFormState,
  reasonCopy,
  toLandingPageInput,
  type LandingPagePreviewError,
  type LandingPagePreviewFormState,
  type LandingPagePreviewSuccess,
} from "./landing-page-preview.helpers";

type PanelVariant = "marketing" | "workspace";

interface LandingPagePreviewPanelProps {
  locale: Locale;
  variant?: PanelVariant;
}

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; body: LandingPagePreviewSuccess }
  | { status: "error"; body: LandingPagePreviewError };

const COPY = {
  en: {
    heading: "Draft your Chapter 4 landing page",
    subheading:
      "Type the copy a first-time visitor should see, then preview the HTML a founder can paste into Vercel, Netlify, Framer, or GitHub Pages. Analytics IDs are optional — stamp one before publishing.",
    headlineLabel: "Headline",
    headlineHint: "The single promise. Keep it under 120 characters.",
    subheadlineLabel: "Sub-headline",
    subheadlineHint: "Who it is for + what changes. Under 240 characters.",
    bulletsLabel: "Benefit bullets",
    bulletsHint: "One per line. 1–6 bullets. Commas inside a bullet are fine.",
    ctaLabelLabel: "CTA label",
    ctaLabelHint: 'e.g. "Book a demo".',
    ctaHrefLabel: "CTA link",
    ctaHrefHint:
      "Use https://, a relative /path, #anchor, mailto:, or tel:. Never javascript:.",
    ga4Label: "GA4 measurement ID (optional)",
    ga4Hint: "Shape G-XXXXXXX. Blank skips the GA4 snippet.",
    plausibleLabel: "Plausible domain (optional)",
    plausibleHint: "Bare hostname, e.g. blockid.au. Blank skips the Plausible snippet.",
    brandLabel: "Footer brand name (optional)",
    brandHint: "Blank falls back to the headline.",
    submit: "Preview",
    submitting: "Rendering…",
    resultHeading: "Preview",
    markdownHeading: "landing-page-draft.md",
    validationHeading: "Fix before publishing",
    validationValid: "Every check passed — ready to paste into your host.",
    copyMarkdown: "Copy markdown",
    copyMarkdownDone: "Copied",
    emptyHint: "Fill the headline + sub-headline to see a live preview.",
    errorHeading: "Preview failed",
  },
  vi: {
    heading: "Soạn landing page Chương 4",
    subheading:
      "Nhập nội dung mà người truy cập lần đầu nên thấy, sau đó xem trước HTML để founder dán vào Vercel, Netlify, Framer, hoặc GitHub Pages. ID phân tích là tuỳ chọn — hãy gắn trước khi công bố.",
    headlineLabel: "Tiêu đề chính",
    headlineHint: "Một lời hứa duy nhất. Dưới 120 ký tự.",
    subheadlineLabel: "Tiêu đề phụ",
    subheadlineHint: "Cho ai + thay đổi gì. Dưới 240 ký tự.",
    bulletsLabel: "Lợi ích chính",
    bulletsHint: "Mỗi dòng một gạch. 1–6 dòng. Dấu phẩy trong dòng vẫn được.",
    ctaLabelLabel: "Nhãn CTA",
    ctaLabelHint: 'Ví dụ: "Đặt lịch demo".',
    ctaHrefLabel: "Link CTA",
    ctaHrefHint:
      "Dùng https://, đường dẫn /path, #anchor, mailto:, hoặc tel:. Không dùng javascript:.",
    ga4Label: "GA4 ID (tuỳ chọn)",
    ga4Hint: "Dạng G-XXXXXXX. Bỏ trống bỏ qua snippet GA4.",
    plausibleLabel: "Plausible domain (tuỳ chọn)",
    plausibleHint: "Tên miền thuần, ví dụ blockid.au. Bỏ trống bỏ qua snippet Plausible.",
    brandLabel: "Tên thương hiệu footer (tuỳ chọn)",
    brandHint: "Bỏ trống thì dùng tiêu đề chính.",
    submit: "Xem trước",
    submitting: "Đang render…",
    resultHeading: "Xem trước",
    markdownHeading: "landing-page-draft.md",
    validationHeading: "Sửa trước khi công bố",
    validationValid: "Đã đạt hết kiểm tra — sẵn sàng dán vào host.",
    copyMarkdown: "Sao chép markdown",
    copyMarkdownDone: "Đã sao chép",
    emptyHint: "Nhập tiêu đề chính + phụ để xem preview trực tiếp.",
    errorHeading: "Render thất bại",
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
    ? "inline-flex items-center rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-surface-300"
    : "inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700";
}

export function LandingPagePreviewPanel({
  locale,
  variant = "marketing",
}: LandingPagePreviewPanelProps) {
  const copy = locale === "vi" ? COPY.vi : COPY.en;
  const [state, setState] = React.useState<LandingPagePreviewFormState>(() =>
    makeEmptyLandingPagePreviewFormState(),
  );
  const [fetchState, setFetchState] = React.useState<FetchState>({
    status: "idle",
  });
  const [copied, setCopied] = React.useState(false);

  const submittable = canSubmitPreview(state);
  const disabled = !submittable || fetchState.status === "loading";

  const runPreview = React.useCallback(async () => {
    setFetchState({ status: "loading" });
    setCopied(false);
    try {
      const res = await fetch("/api/landing-page/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toLandingPageInput(state)),
        cache: "no-store",
      });
      const body = (await res.json()) as
        | LandingPagePreviewSuccess
        | LandingPagePreviewError;
      if (!res.ok) {
        setFetchState({ status: "error", body: body as LandingPagePreviewError });
        return;
      }
      setFetchState({ status: "success", body: body as LandingPagePreviewSuccess });
    } catch (err) {
      setFetchState({
        status: "error",
        body: {
          error: "network_error",
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }, [state]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    void runPreview();
  };

  const copyMarkdown = async () => {
    if (fetchState.status !== "success") return;
    try {
      await navigator.clipboard.writeText(fetchState.body.markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked (rare — Safari denies without user gesture in some
      // contexts). Leave the button label untouched so the founder can retry.
    }
  };

  const hintTextClass =
    variant === "workspace"
      ? "mt-0.5 text-xs text-ink-500"
      : "mt-1 text-xs text-slate-500 dark:text-slate-400";
  const bodyTextClass =
    variant === "workspace"
      ? "text-sm text-ink-700"
      : "text-sm text-slate-700 dark:text-slate-300";

  return (
    <section
      className={panelClasses(variant)}
      data-testid="landing-page-preview-panel"
      data-status={fetchState.status}
    >
      <h2 className={headingClasses(variant)}>{copy.heading}</h2>
      <p className={subheadingClasses(variant)}>{copy.subheading}</p>

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <label className="block">
          <div className={labelClasses(variant)}>{copy.headlineLabel}</div>
          <div className={hintTextClass}>{copy.headlineHint}</div>
          <input
            type="text"
            value={state.headline}
            onChange={(e) =>
              setState((prev) => ({ ...prev, headline: e.target.value }))
            }
            className={inputClasses(variant)}
            data-testid="landing-page-preview-headline"
            maxLength={200}
            autoComplete="off"
          />
        </label>

        <label className="block">
          <div className={labelClasses(variant)}>{copy.subheadlineLabel}</div>
          <div className={hintTextClass}>{copy.subheadlineHint}</div>
          <textarea
            value={state.subheadline}
            onChange={(e) =>
              setState((prev) => ({ ...prev, subheadline: e.target.value }))
            }
            className={inputClasses(variant)}
            data-testid="landing-page-preview-subheadline"
            rows={2}
            maxLength={400}
          />
        </label>

        <label className="block">
          <div className={labelClasses(variant)}>{copy.bulletsLabel}</div>
          <div className={hintTextClass}>{copy.bulletsHint}</div>
          <textarea
            value={state.bulletsText}
            onChange={(e) =>
              setState((prev) => ({ ...prev, bulletsText: e.target.value }))
            }
            className={inputClasses(variant)}
            data-testid="landing-page-preview-bullets"
            rows={4}
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <div className={labelClasses(variant)}>{copy.ctaLabelLabel}</div>
            <div className={hintTextClass}>{copy.ctaLabelHint}</div>
            <input
              type="text"
              value={state.cta_label}
              onChange={(e) =>
                setState((prev) => ({ ...prev, cta_label: e.target.value }))
              }
              className={inputClasses(variant)}
              data-testid="landing-page-preview-cta-label"
              autoComplete="off"
            />
          </label>
          <label className="block">
            <div className={labelClasses(variant)}>{copy.ctaHrefLabel}</div>
            <div className={hintTextClass}>{copy.ctaHrefHint}</div>
            <input
              type="text"
              value={state.cta_href}
              onChange={(e) =>
                setState((prev) => ({ ...prev, cta_href: e.target.value }))
              }
              className={inputClasses(variant)}
              data-testid="landing-page-preview-cta-href"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <div className={labelClasses(variant)}>{copy.ga4Label}</div>
            <div className={hintTextClass}>{copy.ga4Hint}</div>
            <input
              type="text"
              value={state.ga4_measurement_id}
              onChange={(e) =>
                setState((prev) => ({
                  ...prev,
                  ga4_measurement_id: e.target.value,
                }))
              }
              className={inputClasses(variant)}
              placeholder="G-XXXXXXX"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label className="block">
            <div className={labelClasses(variant)}>{copy.plausibleLabel}</div>
            <div className={hintTextClass}>{copy.plausibleHint}</div>
            <input
              type="text"
              value={state.plausible_domain}
              onChange={(e) =>
                setState((prev) => ({
                  ...prev,
                  plausible_domain: e.target.value,
                }))
              }
              className={inputClasses(variant)}
              placeholder="blockid.au"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        </div>

        <label className="block">
          <div className={labelClasses(variant)}>{copy.brandLabel}</div>
          <div className={hintTextClass}>{copy.brandHint}</div>
          <input
            type="text"
            value={state.brand_name}
            onChange={(e) =>
              setState((prev) => ({ ...prev, brand_name: e.target.value }))
            }
            className={inputClasses(variant)}
            autoComplete="off"
          />
        </label>

        <button
          type="submit"
          disabled={disabled}
          className={submitClasses(variant)}
          data-testid="landing-page-preview-submit"
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
          data-testid="landing-page-preview-error"
          role="alert"
        >
          <p className="font-semibold">{copy.errorHeading}</p>
          <p className="mt-1">{fetchState.body.message}</p>
        </div>
      ) : null}

      {fetchState.status === "success" ? (
        <div className="mt-6 space-y-5" data-testid="landing-page-preview-result">
          <ValidationBlock
            valid={fetchState.body.validation.valid}
            reasons={fetchState.body.validation.reasons}
            locale={locale === "vi" ? "vi" : "en"}
            headingText={copy.validationHeading}
            validText={copy.validationValid}
            hintTextClass={hintTextClass}
            bodyTextClass={bodyTextClass}
          />
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wide ${hintTextClass}`}>
              {copy.resultHeading}
            </p>
            <div className="mt-2 overflow-hidden rounded-md border border-slate-200 dark:border-slate-800">
              <iframe
                srcDoc={fetchState.body.html}
                title="Landing page preview"
                sandbox=""
                className="block h-[560px] w-full bg-white"
                data-testid="landing-page-preview-iframe"
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <p className={`text-xs font-semibold uppercase tracking-wide ${hintTextClass}`}>
                {copy.markdownHeading}
              </p>
              <button
                type="button"
                onClick={copyMarkdown}
                className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-emerald-500 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-300"
                data-testid="landing-page-preview-copy-md"
              >
                {copied ? copy.copyMarkdownDone : copy.copyMarkdown}
              </button>
            </div>
            <pre
              className={`mt-2 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200`}
              data-testid="landing-page-preview-markdown"
            >
              {fetchState.body.markdown}
            </pre>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ValidationBlock(props: {
  valid: boolean;
  reasons: import("@/lib/landing-page/preview").LandingPageInvalidReason[];
  locale: "en" | "vi";
  headingText: string;
  validText: string;
  hintTextClass: string;
  bodyTextClass: string;
}) {
  const { valid, reasons, locale, headingText, validText, hintTextClass, bodyTextClass } = props;
  if (valid) {
    return (
      <div
        className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200"
        data-testid="landing-page-preview-validation"
        data-valid="true"
      >
        {validText}
      </div>
    );
  }
  return (
    <div
      className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-950/30"
      data-testid="landing-page-preview-validation"
      data-valid="false"
    >
      <p className={`text-xs font-semibold uppercase tracking-wide ${hintTextClass}`}>
        {headingText}
      </p>
      <ul className={`mt-2 space-y-1 ${bodyTextClass}`}>
        {reasons.map((r) => (
          <li key={r} data-reason={r}>
            {reasonCopy(r, locale)}
          </li>
        ))}
      </ul>
    </div>
  );
}
