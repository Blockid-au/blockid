"use client";

// Wholesale payment-method-setup UI for /reseller/settings.
//
// Composes two already-tested endpoints:
//   POST /api/reseller/billing/setup-intent            → mint SetupIntent
//   POST /api/reseller/billing/save-default-payment-method → persist PM
//
// Card capture uses the vanilla Stripe.js Elements shape (same as
// components/onboarding/step-payment.tsx) — @stripe/react-stripe-js is not
// installed and adding it would violate the "no new npm deps" constraint.
//
// Only wholesale + active resellers with an owner/admin role can bind money-
// movement PMs. The endpoints enforce the same gate server-side; this UI
// mirrors it so the button is disabled with an explanatory message instead
// of a raw 403.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  Stripe,
  StripeCardElement,
  StripeElements,
} from "@stripe/stripe-js";
import { getStripeClient } from "@/lib/stripe-client";
import { useLocale, type Locale } from "@/lib/use-locale";

interface Props {
  hasExistingPaymentMethod: boolean;
  existingPaymentMethodId: string | null;
}

type Mode = "collapsed" | "loading" | "ready" | "submitting" | "success" | "error";

interface Copy {
  section_title: string;
  existing_on_file: string;
  existing_none: string;
  cta_add: string;
  cta_update: string;
  cta_cancel: string;
  cta_submit_idle: string;
  cta_submit_busy: string;
  loading_intent: string;
  card_help: string;
  success: string;
  network_error: string;
  card_incomplete: string;
  intent_failed_prefix: string;
  save_failed_prefix: string;
  confirm_failed_prefix: string;
  card_not_ready: string;
}

const COPY: Record<Locale, Copy> = {
  en: {
    section_title: "Payment method",
    existing_on_file: "Default payment method on file",
    existing_none: "No default payment method on file. Add one to start provisioning wholesale founder subscriptions.",
    cta_add: "Add payment method",
    cta_update: "Update payment method",
    cta_cancel: "Cancel",
    cta_submit_idle: "Save payment method",
    cta_submit_busy: "Saving…",
    loading_intent: "Preparing secure card entry…",
    card_help: "Card is charged in AUD. Reseller org is the seller of record; wholesale founder subscriptions bill against this method.",
    success: "Default payment method saved.",
    network_error: "Network error — please try again.",
    card_incomplete: "Please complete the card details.",
    intent_failed_prefix: "Could not start card entry: ",
    save_failed_prefix: "Could not save payment method: ",
    confirm_failed_prefix: "Card verification failed: ",
    card_not_ready: "Card is not ready yet.",
  },
  vi: {
    section_title: "Phương thức thanh toán",
    existing_on_file: "Phương thức thanh toán mặc định đã có",
    existing_none: "Chưa có phương thức thanh toán mặc định. Thêm một phương thức để bắt đầu cấp gói cho founder.",
    cta_add: "Thêm phương thức",
    cta_update: "Cập nhật phương thức",
    cta_cancel: "Hủy",
    cta_submit_idle: "Lưu phương thức",
    cta_submit_busy: "Đang lưu…",
    loading_intent: "Đang chuẩn bị nhập thẻ an toàn…",
    card_help: "Thẻ sẽ được thanh toán bằng AUD. Tổ chức đại lý là bên bán chính thức; các gói founder bán buôn tính vào phương thức này.",
    success: "Đã lưu phương thức thanh toán mặc định.",
    network_error: "Lỗi mạng — vui lòng thử lại.",
    card_incomplete: "Vui lòng nhập đầy đủ thông tin thẻ.",
    intent_failed_prefix: "Không thể bắt đầu nhập thẻ: ",
    save_failed_prefix: "Không thể lưu phương thức: ",
    confirm_failed_prefix: "Xác thực thẻ thất bại: ",
    card_not_ready: "Thẻ chưa sẵn sàng.",
  },
};

function maskPaymentMethodId(pmId: string | null): string {
  if (!pmId) return "—";
  const tail = pmId.slice(-4);
  return `pm_••••${tail}`;
}

export function PaymentMethodForm({
  hasExistingPaymentMethod,
  existingPaymentMethodId,
}: Props) {
  const router = useRouter();
  const [locale] = useLocale();
  const copy = COPY[locale];

  const [mode, setMode] = useState<Mode>("collapsed");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [setupIntentId, setSetupIntentId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cardReady, setCardReady] = useState(false);

  const cardMountRef = useRef<HTMLDivElement | null>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const cardElementRef = useRef<StripeCardElement | null>(null);

  async function beginSetup() {
    setMode("loading");
    setErrorMessage(null);
    setCardReady(false);
    try {
      const res = await fetch("/api/reseller/billing/setup-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        client_secret?: string;
        setup_intent_id?: string;
        message?: string;
        reason?: string;
      };
      if (!res.ok || !body.ok || !body.client_secret || !body.setup_intent_id) {
        setErrorMessage(
          copy.intent_failed_prefix + (body.message ?? body.reason ?? `HTTP ${res.status}`),
        );
        setMode("error");
        return;
      }
      setClientSecret(body.client_secret);
      setSetupIntentId(body.setup_intent_id);
      setMode("ready");
    } catch {
      setErrorMessage(copy.network_error);
      setMode("error");
    }
  }

  function cancel() {
    cardElementRef.current?.unmount();
    cardElementRef.current = null;
    elementsRef.current = null;
    setClientSecret(null);
    setSetupIntentId(null);
    setErrorMessage(null);
    setCardReady(false);
    setMode("collapsed");
  }

  useEffect(() => {
    if (mode !== "ready" || !cardMountRef.current || !clientSecret) return;
    let mounted = true;

    getStripeClient().then((stripe) => {
      if (!mounted || !stripe || !cardMountRef.current) return;
      stripeRef.current = stripe;
      const elements = stripe.elements();
      elementsRef.current = elements;
      const card = elements.create("card", {
        style: {
          base: {
            color: "#0F172A",
            fontSize: "15px",
            "::placeholder": { color: "#94A3B8" },
          },
          invalid: { color: "#DC2626" },
        },
      });
      card.mount(cardMountRef.current);
      card.on("ready", () => setCardReady(true));
      card.on("change", (event) => {
        setErrorMessage(event.error ? event.error.message : null);
      });
      cardElementRef.current = card;
    });

    return () => {
      mounted = false;
      cardElementRef.current?.unmount();
      cardElementRef.current = null;
    };
  }, [mode, clientSecret]);

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const stripe = stripeRef.current;
    const card = cardElementRef.current;
    if (!stripe || !card || !clientSecret) {
      setErrorMessage(copy.card_not_ready);
      return;
    }
    if (!cardReady) {
      setErrorMessage(copy.card_incomplete);
      return;
    }
    setMode("submitting");
    setErrorMessage(null);

    const result = await stripe.confirmCardSetup(clientSecret, {
      payment_method: { card },
    });
    if (result.error) {
      setErrorMessage(copy.confirm_failed_prefix + (result.error.message ?? ""));
      setMode("ready");
      return;
    }

    const returnedId =
      typeof result.setupIntent?.id === "string"
        ? result.setupIntent.id
        : setupIntentId;
    if (!returnedId) {
      setErrorMessage(copy.confirm_failed_prefix + "no setup intent id");
      setMode("ready");
      return;
    }

    try {
      const res = await fetch("/api/reseller/billing/save-default-payment-method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setup_intent_id: returnedId }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        reason?: string;
      };
      if (!res.ok || !body.ok) {
        setErrorMessage(
          copy.save_failed_prefix + (body.message ?? body.reason ?? `HTTP ${res.status}`),
        );
        setMode("ready");
        return;
      }
      cancel();
      setMode("success");
      router.refresh();
    } catch {
      setErrorMessage(copy.network_error);
      setMode("ready");
    }
  }

  return (
    <section className="mb-4 rounded-lg border border-surface-200 bg-white p-4">
      <h3 className="text-base font-semibold text-ink-900">{copy.section_title}</h3>

      <div className="mt-3 text-sm text-ink-800">
        {hasExistingPaymentMethod ? (
          <p>
            <span className="text-ink-500">{copy.existing_on_file}: </span>
            <span className="font-mono text-ink-900">
              {maskPaymentMethodId(existingPaymentMethodId)}
            </span>
          </p>
        ) : (
          <p className="text-ink-600">{copy.existing_none}</p>
        )}
      </div>

      {mode === "collapsed" && (
        <div className="mt-3">
          <button
            type="button"
            onClick={beginSetup}
            className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
          >
            {hasExistingPaymentMethod ? copy.cta_update : copy.cta_add}
          </button>
        </div>
      )}

      {mode === "success" && (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {copy.success}
        </div>
      )}

      {mode === "loading" && (
        <p className="mt-3 text-sm text-ink-600">{copy.loading_intent}</p>
      )}

      {(mode === "ready" || mode === "submitting") && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="rounded-md border border-surface-300 bg-white p-3">
            <div ref={cardMountRef} className="min-h-[24px]" />
          </div>
          <p className="text-xs text-ink-500">{copy.card_help}</p>
          {errorMessage && (
            <p role="alert" className="text-xs text-red-700">
              {errorMessage}
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={mode === "submitting" || !cardReady}
              className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:bg-surface-300 disabled:text-ink-500"
            >
              {mode === "submitting" ? copy.cta_submit_busy : copy.cta_submit_idle}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={mode === "submitting"}
              className="rounded-md border border-surface-300 bg-white px-3 py-2 text-sm text-ink-700 hover:bg-surface-100 disabled:text-ink-500"
            >
              {copy.cta_cancel}
            </button>
          </div>
        </form>
      )}

      {mode === "error" && (
        <div className="mt-3 space-y-2">
          <p role="alert" className="text-sm text-red-700">
            {errorMessage}
          </p>
          <button
            type="button"
            onClick={beginSetup}
            className="rounded-md border border-surface-300 bg-white px-3 py-2 text-sm text-ink-700 hover:bg-surface-100"
          >
            {hasExistingPaymentMethod ? copy.cta_update : copy.cta_add}
          </button>
        </div>
      )}
    </section>
  );
}
