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

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    }
  | { status: "error"; message: string };

const REASON_MAX = 200;

function labelFor(c: CustomerOption): string {
  const name = c.display_name?.trim();
  if (name) return `${name} (${c.masked_email})`;
  return c.masked_email;
}

export function GrantForm({ customers, remainingBudget }: Props) {
  const router = useRouter();
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
        No attributed customers yet — share your reseller code first (see{" "}
        <a href="/reseller/codes" className="text-brand-700 underline">
          /reseller/codes
        </a>
        ) then return here to grant credits.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="grant-customer" className="block text-xs font-medium text-ink-700">
          Customer
        </label>
        <select
          id="grant-customer"
          value={targetUserId}
          onChange={(e) => setTargetUserId(e.target.value)}
          className="mt-1 block w-full rounded-md border border-surface-300 bg-white p-2 text-sm text-ink-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          required
        >
          <option value="">Select an attributed customer…</option>
          {customers.map((c) => (
            <option key={c.user_id} value={c.user_id}>
              {labelFor(c)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="grant-amount" className="block text-xs font-medium text-ink-700">
          Credits (positive integer)
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
          Remaining budget this month: {remainingBudget.toLocaleString()}
        </p>
      </div>

      <div>
        <label htmlFor="grant-reason" className="block text-xs font-medium text-ink-700">
          Reason (optional)
        </label>
        <input
          id="grant-reason"
          type="text"
          maxLength={REASON_MAX}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. onboarding bonus, incident makegood"
          className="mt-1 block w-full rounded-md border border-surface-300 bg-white p-2 text-sm text-ink-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:bg-surface-300 disabled:text-ink-500"
        >
          {state.status === "submitting" ? "Granting…" : "Grant credits"}
        </button>
        {amount.trim().length > 0 && !amountValid && (
          <span className="text-xs text-red-600">
            Amount must be a positive whole number.
          </span>
        )}
      </div>

      {state.status === "success" && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <p>
            Granted successfully. Customer balance is now{" "}
            <span className="font-semibold">{state.balance.toLocaleString()}</span> credits.
          </p>
          <p className="mt-1 text-xs text-emerald-700">
            Remaining monthly budget: {state.remaining_budget.toLocaleString()}.
            {state.over_budget && " (This grant was approved as over-budget.)"}
          </p>
        </div>
      )}

      {state.status === "over_budget" && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Over-budget approval required.</p>
          <p className="mt-1 text-xs">
            This grant would push you past your monthly credit budget. Only{" "}
            <span className="font-semibold">{state.remaining_budget.toLocaleString()}</span>{" "}
            credits remain this month. Contact{" "}
            <a href="mailto:admin@blockid.au" className="underline">
              admin@blockid.au
            </a>{" "}
            for out-of-band approval (per H.4 / D3-CISO-05) or reduce the amount
            to fit the remaining budget.
          </p>
        </div>
      )}

      {state.status === "error" && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Grant failed: {state.message}
        </div>
      )}
    </form>
  );
}
