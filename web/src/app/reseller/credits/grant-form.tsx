"use client";

// Client-side grant form for /reseller/credits (P6.6).
//
// POSTs to /api/reseller/credits/grant (P6.3). The reseller must pick one
// attributed customer, an integer credit amount, and an optional reason.
// The endpoint enforces monthly_credit_budget via decideGrant(); when a
// grant would exceed the remaining budget it returns 402 with
// reason=over_budget_requires_approval — we surface a persistent notice
// telling the reseller the request has to be approved out-of-band by a
// BlockID admin (P9.3 requests inbox is still pending).
//
// EN+VI parity per Customer-Success advisory §24. VI copy is real
// translation, not a machine-translation stub; uses the shared useLocale()
// cookie so it stays in sync with the rest of the workspace surface
// (customer-drawer, product-tour banner, share-mgmt drawer, guide chapters).

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useLocale, type Locale } from "@/lib/use-locale";

interface CustomerOption {
  user_id: string;
  display_name: string | null;
  masked_email: string;
}

interface Props {
  customers: readonly CustomerOption[];
  remainingBudget: number;
}

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | {
      status: "success";
      credit_transaction_id: string;
      balance: number;
      remaining_budget: number;
      over_budget: boolean;
    }
  | {
      status: "over_budget";
      remaining_budget: number;
      request_id: string | null;
      request_error: string | null;
      requesting: boolean;
    }
  | { status: "error"; message: string };

const REASON_MAX = 200;

interface Copy {
  no_customers_prefix: string;
  no_customers_link_label: string;
  no_customers_suffix: string;
  label_customer: string;
  select_placeholder: string;
  label_amount: string;
  remaining_budget: (n: string) => string;
  label_reason: string;
  reason_placeholder: string;
  submit_idle: string;
  submit_busy: string;
  amount_invalid: string;
  success_prefix: string;
  success_middle: string;
  success_suffix_credits: string;
  success_remaining: (n: string) => string;
  success_over_budget_note: string;
  over_budget_title: string;
  over_budget_body: (n: string) => string;
  over_budget_request_submitted: (short: string) => string;
  over_budget_request_admin: string;
  over_budget_requesting: string;
  over_budget_or_email: string;
  request_failed: (m: string) => string;
  grant_failed: (m: string) => string;
}

const COPY: Record<Locale, Copy> = {
  en: {
    no_customers_prefix:
      "No attributed customers yet — share your reseller code first (see ",
    no_customers_link_label: "/reseller/codes",
    no_customers_suffix: ") then return here to grant credits.",
    label_customer: "Customer",
    select_placeholder: "Select an attributed customer…",
    label_amount: "Credits (positive integer)",
    remaining_budget: (n) => `Remaining budget this month: ${n}`,
    label_reason: "Reason (optional)",
    reason_placeholder: "e.g. onboarding bonus, incident makegood",
    submit_idle: "Grant credits",
    submit_busy: "Granting…",
    amount_invalid: "Amount must be a positive whole number.",
    success_prefix: "Granted successfully. Customer balance is now ",
    success_middle: " ",
    success_suffix_credits: "credits.",
    success_remaining: (n) => `Remaining monthly budget: ${n}.`,
    success_over_budget_note: " (This grant was approved as over-budget.)",
    over_budget_title: "Over-budget approval required.",
    over_budget_body: (n) =>
      `This grant would push you past your monthly credit budget. Only ${n} credits remain this month. Submit an approval request for the BlockID admin to review, or reduce the amount to fit the remaining budget.`,
    over_budget_request_submitted: (short) =>
      `Request submitted (${short}). You'll be notified once an admin decides.`,
    over_budget_request_admin: "Request admin approval",
    over_budget_requesting: "Submitting…",
    over_budget_or_email: "or email admin@blockid.au",
    request_failed: (m) => `Request failed: ${m}`,
    grant_failed: (m) => `Grant failed: ${m}`,
  },
  vi: {
    no_customers_prefix:
      "Chưa có khách hàng nào được ghi nhận — hãy chia sẻ mã đại lý trước (xem ",
    no_customers_link_label: "/reseller/codes",
    no_customers_suffix: ") rồi quay lại đây để cấp tín dụng.",
    label_customer: "Khách hàng",
    select_placeholder: "Chọn một khách hàng đã ghi nhận…",
    label_amount: "Tín dụng (số nguyên dương)",
    remaining_budget: (n) => `Ngân sách còn lại tháng này: ${n}`,
    label_reason: "Lý do (tuỳ chọn)",
    reason_placeholder: "ví dụ: thưởng khởi tạo, đền bù sự cố",
    submit_idle: "Cấp tín dụng",
    submit_busy: "Đang cấp…",
    amount_invalid: "Số lượng phải là số nguyên dương.",
    success_prefix: "Cấp thành công. Số dư khách hàng hiện là ",
    success_middle: " ",
    success_suffix_credits: "tín dụng.",
    success_remaining: (n) => `Ngân sách tháng còn lại: ${n}.`,
    success_over_budget_note:
      " (Khoản cấp này được duyệt vượt ngân sách.)",
    over_budget_title: "Cần phê duyệt vượt ngân sách.",
    over_budget_body: (n) =>
      `Khoản cấp này sẽ vượt ngân sách tín dụng tháng của bạn. Chỉ còn ${n} tín dụng trong tháng. Hãy gửi yêu cầu phê duyệt cho quản trị viên BlockID, hoặc giảm số lượng cho vừa ngân sách còn lại.`,
    over_budget_request_submitted: (short) =>
      `Đã gửi yêu cầu (${short}). Bạn sẽ được thông báo khi quản trị viên quyết định.`,
    over_budget_request_admin: "Yêu cầu quản trị viên phê duyệt",
    over_budget_requesting: "Đang gửi…",
    over_budget_or_email: "hoặc gửi email tới admin@blockid.au",
    request_failed: (m) => `Yêu cầu thất bại: ${m}`,
    grant_failed: (m) => `Cấp tín dụng thất bại: ${m}`,
  },
};

function labelFor(c: CustomerOption): string {
  const name = c.display_name?.trim();
  if (name) return `${name} (${c.masked_email})`;
  return c.masked_email;
}

function fmtNum(n: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-AU").format(n);
}

export function GrantForm({ customers, remainingBudget }: Props) {
  const router = useRouter();
  const [locale] = useLocale();
  const copy = COPY[locale];
  const [targetUserId, setTargetUserId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [state, setState] = useState<SubmitState>({ status: "idle" });

  const parsedAmount = Number(amount);
  const amountValid =
    amount.trim().length > 0 &&
    Number.isFinite(parsedAmount) &&
    Number.isInteger(parsedAmount) &&
    parsedAmount > 0;
  const canSubmit =
    state.status !== "submitting" &&
    targetUserId.length > 0 &&
    amountValid;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setState({ status: "submitting" });
    try {
      const res = await fetch("/api/reseller/credits/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_user_id: targetUserId,
          amount: parsedAmount,
          reason: reason.trim() ? reason.trim().slice(0, REASON_MAX) : undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        reason?: string;
        credit_transaction_id?: string;
        balance?: number;
        over_budget?: boolean;
        remaining_budget?: number;
      };
      if (res.status === 402 && body.reason === "over_budget_requires_approval") {
        setState({
          status: "over_budget",
          remaining_budget: body.remaining_budget ?? 0,
          request_id: null,
          request_error: null,
          requesting: false,
        });
        return;
      }
      if (!res.ok || !body.ok || !body.credit_transaction_id) {
        setState({
          status: "error",
          message: body.reason ?? `HTTP ${res.status}`,
        });
        return;
      }
      setState({
        status: "success",
        credit_transaction_id: body.credit_transaction_id,
        balance: body.balance ?? 0,
        remaining_budget: body.remaining_budget ?? 0,
        over_budget: body.over_budget ?? false,
      });
      setAmount("");
      setReason("");
      router.refresh();
    } catch (err) {
      setState({ status: "error", message: (err as Error).message });
    }
  }

  if (customers.length === 0) {
    return (
      <p className="text-sm text-ink-600">
        {copy.no_customers_prefix}
        <a href="/reseller/codes" className="text-brand-700 underline">
          {copy.no_customers_link_label}
        </a>
        {copy.no_customers_suffix}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="grant-customer" className="block text-xs font-medium text-ink-700">
          {copy.label_customer}
        </label>
        <select
          id="grant-customer"
          value={targetUserId}
          onChange={(e) => setTargetUserId(e.target.value)}
          className="mt-1 block w-full rounded-md border border-surface-300 bg-white p-2 text-sm text-ink-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          required
        >
          <option value="">{copy.select_placeholder}</option>
          {customers.map((c) => (
            <option key={c.user_id} value={c.user_id}>
              {labelFor(c)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="grant-amount" className="block text-xs font-medium text-ink-700">
          {copy.label_amount}
        </label>
        <input
          id="grant-amount"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 block w-full rounded-md border border-surface-300 bg-white p-2 text-sm text-ink-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          required
        />
        <p className="mt-1 text-xs text-ink-500">
          {copy.remaining_budget(fmtNum(remainingBudget, locale))}
        </p>
      </div>

      <div>
        <label htmlFor="grant-reason" className="block text-xs font-medium text-ink-700">
          {copy.label_reason}
        </label>
        <input
          id="grant-reason"
          type="text"
          maxLength={REASON_MAX}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={copy.reason_placeholder}
          className="mt-1 block w-full rounded-md border border-surface-300 bg-white p-2 text-sm text-ink-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:bg-surface-300 disabled:text-ink-500"
        >
          {state.status === "submitting" ? copy.submit_busy : copy.submit_idle}
        </button>
        {amount.trim().length > 0 && !amountValid && (
          <span className="text-xs text-red-600">
            {copy.amount_invalid}
          </span>
        )}
      </div>

      {state.status === "success" && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <p>
            {copy.success_prefix}
            <span className="font-semibold">{fmtNum(state.balance, locale)}</span>
            {copy.success_middle}
            {copy.success_suffix_credits}
          </p>
          <p className="mt-1 text-xs text-emerald-700">
            {copy.success_remaining(fmtNum(state.remaining_budget, locale))}
            {state.over_budget && copy.success_over_budget_note}
          </p>
        </div>
      )}

      {state.status === "over_budget" && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">{copy.over_budget_title}</p>
          <p className="mt-1 text-xs">
            {copy.over_budget_body(fmtNum(state.remaining_budget, locale))}
          </p>
          {state.request_id ? (
            <p className="mt-2 text-xs font-medium">
              {copy.over_budget_request_submitted(state.request_id.slice(0, 8))}
            </p>
          ) : (
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                disabled={state.requesting}
                onClick={async () => {
                  if (state.status !== "over_budget") return;
                  setState({ ...state, requesting: true, request_error: null });
                  try {
                    const res = await fetch("/api/reseller/requests", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        request_type: "over_budget_approval",
                        payload: {
                          target_user_id: targetUserId,
                          requested_amount: parsedAmount,
                          reason: reason.trim() ? reason.trim().slice(0, REASON_MAX) : null,
                          remaining_budget_snapshot: state.remaining_budget,
                        },
                      }),
                    });
                    const body = (await res.json().catch(() => ({}))) as {
                      ok?: boolean;
                      reason?: string;
                      request?: { id?: string };
                    };
                    if (!res.ok || !body.ok || !body.request?.id) {
                      setState({
                        ...state,
                        requesting: false,
                        request_error: body.reason ?? `HTTP ${res.status}`,
                      });
                      return;
                    }
                    setState({
                      ...state,
                      requesting: false,
                      request_id: body.request.id,
                      request_error: null,
                    });
                  } catch (err) {
                    setState({
                      ...state,
                      requesting: false,
                      request_error: (err as Error).message,
                    });
                  }
                }}
                className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white disabled:bg-surface-300"
              >
                {state.requesting
                  ? copy.over_budget_requesting
                  : copy.over_budget_request_admin}
              </button>
              <a
                href="mailto:admin@blockid.au"
                className="text-xs underline"
              >
                {copy.over_budget_or_email}
              </a>
            </div>
          )}
          {state.request_error && (
            <p className="mt-2 text-xs text-red-700">
              {copy.request_failed(state.request_error)}
            </p>
          )}
        </div>
      )}

      {state.status === "error" && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {copy.grant_failed(state.message)}
        </div>
      )}
    </form>
  );
}
