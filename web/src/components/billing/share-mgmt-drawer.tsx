"use client";

// <ShareMgmtDrawer /> — right-side purchase drawer for the Share Management
// add-on. Per docs/plans/reseller-module-plan.md § F.5 / P8.4:
//
//   • monthly/annual cadence toggle with savings badge
//   • benefit list (EN + VI copy)
//   • reseller code auto-detected from the `blockid_via` cookie
//   • proration preview via POST /api/stripe/change-plan { add_item, preview:true }
//   • primary CTA "Add to my subscription" → POST without preview flag
//
// The drawer is un-controlled from the outside via an `openAddon=<key>` URL
// query param. The billing page mounts it once and toggles based on the URL.

import * as React from "react";
import { Loader2, Sparkles, X } from "lucide-react";

import { readCachedVia } from "@/lib/reseller/attribution";

export type ShareMgmtDrawerLocale = "en" | "vi";

const COPY = {
  en: {
    title: "Add Share Management",
    subtitle: "Cap-table, ESOP, vesting, dividends and blockchain sync — all included.",
    benefits: [
      "Unlimited cap-table rows + share-class rules",
      "ESOP pool + Div-83A grant checks",
      "Vesting schedules with cliff + acceleration",
      "Dividend ledger + investor reporting",
      "Optional blockchain sync (Anvil chainId 420)",
    ],
    monthly: "Monthly",
    annual: "Annual",
    save: "Save 2 months",
    reseller: "Reseller code",
    resellerNone: "None applied",
    previewLoading: "Calculating proration…",
    previewLine: "Charged today (prorated):",
    previewMissing: "Preview unavailable — the add-on will bill from your next cycle.",
    cta: "Add to my subscription",
    ctaLoading: "Adding…",
    close: "Close",
    cancelHint: "You can remove this add-on any time from Billing → Manage add-ons.",
    notAvailable: "This add-on is not yet available in your Stripe account. Contact support.",
    genericError: "Something went wrong. Please try again.",
    added: "Add-on added. Refreshing your entitlements…",
  },
  vi: {
    title: "Thêm Quản lý Cổ phần",
    subtitle: "Cap-table, ESOP, vesting, cổ tức và đồng bộ blockchain — trọn gói.",
    benefits: [
      "Cap-table không giới hạn + quy tắc loại cổ phần",
      "Quỹ ESOP + kiểm tra Div-83A",
      "Lịch vesting với cliff + tăng tốc",
      "Sổ cổ tức + báo cáo nhà đầu tư",
      "Đồng bộ blockchain tuỳ chọn (Anvil chainId 420)",
    ],
    monthly: "Hàng tháng",
    annual: "Hàng năm",
    save: "Tiết kiệm 2 tháng",
    reseller: "Mã đại lý",
    resellerNone: "Không có",
    previewLoading: "Đang tính toán tỷ lệ theo ngày…",
    previewLine: "Thanh toán hôm nay (theo tỷ lệ):",
    previewMissing: "Không có bản xem trước — add-on sẽ tính từ chu kỳ tiếp theo.",
    cta: "Thêm vào gói của tôi",
    ctaLoading: "Đang thêm…",
    close: "Đóng",
    cancelHint: "Bạn có thể huỷ add-on bất cứ lúc nào trong Billing → Manage add-ons.",
    notAvailable: "Add-on chưa khả dụng trong tài khoản Stripe của bạn. Liên hệ hỗ trợ.",
    genericError: "Đã xảy ra lỗi. Vui lòng thử lại.",
    added: "Đã thêm add-on. Đang làm mới…",
  },
} as const;

export interface ShareMgmtDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Stripe price ids resolved server-side from env. */
  priceIds: { monthly: string | null; annual: string | null };
  locale?: ShareMgmtDrawerLocale;
  /** Called after a successful add so the parent can refresh entitlements. */
  onAdded?: () => void;
}

interface PreviewResult {
  amount_due_cents: number;
  currency: string;
}

function formatMoney(cents: number, currency: string): string {
  const cur = (currency ?? "AUD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${cur}`;
  }
}

export function ShareMgmtDrawer({
  open,
  onClose,
  priceIds,
  locale = "en",
  onAdded,
}: ShareMgmtDrawerProps) {
  const t = COPY[locale];
  const [cadence, setCadence] = React.useState<"monthly" | "annual">("monthly");
  const [preview, setPreview] = React.useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [flash, setFlash] = React.useState<string | null>(null);
  const [resellerCode, setResellerCode] = React.useState<string | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  const priceId = cadence === "annual" ? priceIds.annual : priceIds.monthly;

  // Focus trap + escape-to-close + body-scroll lock.
  React.useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prev?.focus?.();
    };
  }, [open, onClose]);

  React.useEffect(() => {
    if (!open) return;
    const code = readCachedVia();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read browser cookie on drawer open
    setResellerCode((prev) => (prev === code ? prev : code));
  }, [open]);

  // Refresh preview whenever cadence changes while drawer is open.
  React.useEffect(() => {
    if (!open) return;
    if (!priceId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kickoff loading state before async fetch
    setPreviewLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/stripe/change-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ add_item: { price_id: priceId, preview: true } }),
        });
        const json = (await res.json()) as {
          ok: boolean;
          preview?: PreviewResult;
          reason?: string;
        };
        if (cancelled) return;
        if (json.ok && json.preview) setPreview(json.preview);
        else {
          setPreview(null);
          setPreviewError(json.reason ?? null);
        }
      } catch {
        if (!cancelled) {
          setPreview(null);
          setPreviewError("network");
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, priceId]);

  async function commit() {
    if (!priceId) return;
    setSubmitting(true);
    setFlash(null);
    try {
      const res = await fetch("/api/stripe/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ add_item: { price_id: priceId } }),
      });
      const json = (await res.json()) as { ok: boolean; reason?: string };
      if (!json.ok) {
        setFlash(t.genericError);
        return;
      }
      setFlash(t.added);
      onAdded?.();
      // Give the user a beat to read the flash, then close.
      setTimeout(() => onClose(), 900);
    } catch {
      setFlash(t.genericError);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const disabled = !priceId || submitting;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.title}
      className="fixed inset-0 z-[60] flex justify-end"
    >
      <button
        type="button"
        aria-label={t.close}
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative h-full w-full max-w-md bg-white shadow-2xl flex flex-col outline-none"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-surface-200 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Sparkles strokeWidth={1.75} className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-ink-800">{t.title}</h2>
              <p className="mt-1 text-xs text-ink-600">{t.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label={t.close}
            onClick={onClose}
            className="text-ink-400 hover:text-ink-700"
          >
            <X strokeWidth={1.75} className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Cadence toggle */}
          <div className="grid grid-cols-2 rounded-xl bg-surface-100 p-1 text-sm">
            <button
              type="button"
              onClick={() => setCadence("monthly")}
              className={
                "rounded-lg py-2 font-medium transition " +
                (cadence === "monthly"
                  ? "bg-white shadow text-ink-800"
                  : "text-ink-500 hover:text-ink-700")
              }
            >
              {t.monthly}
            </button>
            <button
              type="button"
              onClick={() => setCadence("annual")}
              className={
                "relative rounded-lg py-2 font-medium transition " +
                (cadence === "annual"
                  ? "bg-white shadow text-ink-800"
                  : "text-ink-500 hover:text-ink-700")
              }
            >
              {t.annual}
              <span className="absolute -top-2 -right-2 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                {t.save}
              </span>
            </button>
          </div>

          {/* Benefits */}
          <ul className="space-y-2 text-sm text-ink-700">
            {t.benefits.map((b) => (
              <li key={b} className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                <span>{b}</span>
              </li>
            ))}
          </ul>

          {/* Reseller pill */}
          <div className="rounded-lg bg-surface-100 px-3 py-2 text-xs text-ink-700 flex items-center justify-between">
            <span>{t.reseller}</span>
            <span className="font-mono text-[11px]">
              {resellerCode ?? t.resellerNone}
            </span>
          </div>

          {/* Proration preview */}
          <div className="rounded-lg border border-surface-200 px-3 py-3 text-sm">
            {previewLoading ? (
              <div className="flex items-center gap-2 text-ink-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t.previewLoading}</span>
              </div>
            ) : preview ? (
              <div className="flex items-center justify-between">
                <span className="text-ink-600">{t.previewLine}</span>
                <span className="font-semibold text-ink-800">
                  {formatMoney(preview.amount_due_cents, preview.currency)}
                </span>
              </div>
            ) : (
              <p className="text-xs text-ink-500">
                {priceId ? t.previewMissing : t.notAvailable}
              </p>
            )}
            {previewError && priceId && (
              <p className="mt-1 text-[11px] text-amber-600">{previewError}</p>
            )}
          </div>

          <p className="text-[11px] text-ink-500">{t.cancelHint}</p>
        </div>

        {/* Footer */}
        <div className="border-t border-surface-200 px-5 py-4">
          {flash && (
            <p className="mb-2 text-xs text-emerald-600" role="status">
              {flash}
            </p>
          )}
          <button
            type="button"
            onClick={commit}
            disabled={disabled}
            className={
              "w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white shadow transition " +
              (disabled
                ? "opacity-60 cursor-not-allowed"
                : "hover:bg-brand-700")
            }
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> {t.ctaLoading}
              </span>
            ) : (
              t.cta
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
