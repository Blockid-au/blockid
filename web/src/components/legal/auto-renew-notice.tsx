"use client";

// AutoRenewNotice — ACL s31-style pre-charge reminder.
//
// Rendered on day 5, 6, or 7 of a BlockID trial subscription. Australian
// Consumer Law s31 requires clear disclosure of automatic recurring
// charges before conversion — this banner surfaces the exact amount,
// exact charge date, and a one-click path to /account/billing so the
// consumer can cancel or change plan without friction.
//
// Display-only: does NOT call /api/legal/ack. The trial-conversion
// consent is captured at signup; this banner is a reminder, not a fresh
// consent gate. Deliberately no useEffect side-effects on mount — the
// server picks the day-5/6/7 window and hands `trialEnd` down.

import * as React from "react";
import { useRouter } from "next/navigation";

export interface AutoRenewNoticeProps {
  /** ISO 8601 timestamp when the trial converts to a paid subscription. */
  trialEnd: string;
  /** Human-readable plan label, e.g. "Founder — Monthly". */
  planLabel: string;
  /** Amount in AUD (dollars, not cents) that will be charged on trialEnd. */
  amountAud: number;
  /** Optional override — if omitted, click routes to /account/billing. */
  onManage?: () => void;
}

const AU_TZ = "Australia/Sydney";

const DATE_FMT = new Intl.DateTimeFormat("en-AU", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  timeZone: AU_TZ,
});

const MONEY_FMT = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function formatChargeDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "your trial end date";
  return DATE_FMT.format(d);
}

function formatMoney(aud: number): string {
  if (!Number.isFinite(aud)) return "A$--";
  return MONEY_FMT.format(aud);
}

export function AutoRenewNotice({
  trialEnd,
  planLabel,
  amountAud,
  onManage,
}: AutoRenewNoticeProps): React.ReactElement {
  const router = useRouter();

  const chargeDate = React.useMemo(() => formatChargeDate(trialEnd), [trialEnd]);
  const money = React.useMemo(() => formatMoney(amountAud), [amountAud]);

  const handleManage = React.useCallback(() => {
    if (onManage) {
      onManage();
      return;
    }
    router.push("/workspace/billing");
  }, [onManage, router]);

  return (
    <aside
      role="status"
      aria-live="polite"
      aria-label="Auto-renew notice"
      className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            Your BlockID trial ends soon
          </p>
          <p className="mt-1 text-sm leading-relaxed">
            Your card on file will be charged{" "}
            <span className="font-semibold">{money}</span> on{" "}
            <span className="font-semibold">{chargeDate}</span> for the{" "}
            <span className="font-semibold">{planLabel}</span> plan. You can
            cancel or change plan any time before then.
          </p>
          <p className="mt-2 text-xs text-amber-800/80 dark:text-amber-200/80">
            Auschain PTY LTD · ACN 659 615 111 · ABN 79 659 615 111 · Sydney NSW
          </p>
        </div>
        <div className="shrink-0">
          <button
            type="button"
            onClick={handleManage}
            className="inline-flex items-center justify-center rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm font-semibold text-amber-900 shadow-sm transition-colors hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:border-amber-600 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/60"
          >
            Manage plan
          </button>
        </div>
      </div>
    </aside>
  );
}

export default AutoRenewNotice;
