"use client";

/**
 * FundingPaywall — the transparent card under the free preview (T0242,
 * plan §4a / §4g / §5a, transparent-pricing rule).
 *
 * Three rails, decided by the caller from auth + entitlement state:
 *   guest    — email + Stripe Checkout, A$3.00 inc. GST (POST /api/funding/checkout)
 *   credits  — signed in, 3 credits; CreditConfirm shows cost + balance BEFORE
 *              the call (POST /api/funding/report); 402 opens CreditGate
 *   plan     — `grant_finder` entitlement: included, one click
 *   anonymous— still resolving who is signed in; renders the guest copy
 *              without the form so the card never flashes the wrong price
 *
 * Copy carries the §5a positioning ("Grant information is free from
 * government — we sell the analysis") and the §5f disclaimer lives in the
 * page-level FundingDisclaimer right below.
 *
 * T0247: after the third paid report (A$9 spent) the Founder Radar card
 * (`RadarUpsellCard`) renders under the rails — counted from
 * `funding_reports` (GET /api/funding/report) when signed in, from
 * localStorage (`guest-paid-reports.ts`) for guests. Plan rail never sees it.
 *
 * G35 D25 (Pricing v5): when `payg_enabled` is on (GET /api/pricing/payg) the
 * card shows the `report_funding` price (A$19, "inc. GST · one-off") and its
 * 19 credits — the same SKU the checkout / credits routes charge. While the
 * price loads the pay buttons stay disabled (the A$3 copy shows until the
 * answer lands); flag off → the A$3 copy below, unchanged.
 *
 * G35 P5 (copy): the eyebrow / card headline and the Radar upsell line follow
 * the server-read `view` prop (getPaygView(), threaded through FundingIntake);
 * the PRICE and credits on the rails come from /api/pricing/payg above (W3) —
 * both read the same platform_config. Legacy amounts are derived from the v3
 * SKU (payg-copy), never typed.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Coins, Mail, ShieldCheck } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { CreditConfirm } from "@/components/ui/credit-confirm";
import { CreditGate } from "@/components/ui/credit-gate";
import { RadarUpsellCard } from "@/components/funding/radar-upsell-card";
import { useEntitlement } from "@/hooks/useEntitlement";
import { guestPaidReportCount, RADAR_UPSELL_AFTER_REPORTS } from "@/lib/funding/guest-paid-reports";
import { fundingReportAud, radarViewerKind } from "@/lib/funding/radar-upsell";
import { LEGACY_FUNDING_CREDITS, PAYG_OFF_VIEW, type PaygView } from "@/lib/pricing/payg-copy";
import { usePaygPricing } from "@/lib/pricing/use-payg-pricing";

/** What the rails show and charge (legacy A$3 / 3 credits, or the v5 report_funding SKU). */
export interface FundingRailPrice {
  /** "A$3" | "A$19" */
  label: string;
  /** Suffix after the label. */
  note: string;
  credits: number;
  creditFeature: "grant_match" | "report_funding";
  /** v5: credits are shown without an A$ equivalent (D27). */
  v5: boolean;
  loading: boolean;
}

export const LEGACY_FUNDING_PRICE: FundingRailPrice = {
  label: PAYG_OFF_VIEW.funding,
  note: ".00 inc. GST · one-off",
  credits: LEGACY_FUNDING_CREDITS,
  creditFeature: "grant_match",
  v5: false,
  loading: false,
};

/** Pure: the rail price for a /api/pricing/payg state (error → legacy copy; Stripe still shows the real price). */
export function fundingRailPrice(state: ReturnType<typeof usePaygPricing>): FundingRailPrice {
  if (state.status === "loading") return { ...LEGACY_FUNDING_PRICE, loading: true };
  if (state.status === "error" || !state.pricing.enabled || !state.pricing.funding) return LEGACY_FUNDING_PRICE;
  const f = state.pricing.funding;
  return {
    label: f.priceLabel,
    note: " inc. GST · one-off",
    credits: f.credits ?? 19,
    creditFeature: "report_funding",
    v5: true,
    loading: false,
  };
}
import { fundingCopyFor } from "@/lib/funding/copy";
import type { FundingPreviewPayload } from "@/lib/funding/preview";

export type PaywallRail = "anonymous" | "guest" | "credits" | "plan";

/** Flag-OFF (legacy) credit cost — derived from the v3 SKU; the rails read the live one. */
export const GRANT_MATCH_CREDITS = LEGACY_FUNDING_CREDITS;
/** Flag-OFF (legacy) price label — derived; the rails read the live one. */
export const FUNDING_REPORT_PRICE_LABEL = PAYG_OFF_VIEW.funding;

export interface FundingPaywallProps {
  intake: Record<string, unknown>;
  preview: FundingPreviewPayload;
  rail: PaywallRail;
  /** G35 P5: payg_enabled view (server-read) for the card copy. Default = flag OFF. */
  view?: PaygView;
}

const UNLOCKS = [
  "Every match ranked with a 0–100 fit score",
  "Eligibility checklist per grant — what passes, what fails, what we could not tell",
  "A$ estimate where a calculator exists (R&D Tax Incentive, ESIC)",
  "12-month timeline: what to lodge in which month, and why",
  "Next 3 actions, written for your stage",
];

export function FundingPaywall({ intake, preview, rail, view = PAYG_OFF_VIEW }: FundingPaywallProps) {
  const copy = fundingCopyFor(view);
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [balance, setBalance] = React.useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [gateOpen, setGateOpen] = React.useState(false);
  const trackedRail = React.useRef<PaywallRail | null>(null);
  const [paidCount, setPaidCount] = React.useState(0);
  const { user: entUser } = useEntitlement();
  const price = fundingRailPrice(usePaygPricing());

  // GA4 — once per rail resolution (anonymous → guest/credits/plan).
  React.useEffect(() => {
    if (trackedRail.current === rail) return;
    trackedRail.current = rail;
    trackEvent("funding_paywall_hit", { state: String(intake.state ?? ""), stage: String(intake.stage ?? ""), rail });
  }, [rail, intake.state, intake.stage]);

  // Credit balance for the confirm modal — only on the credits rail.
  React.useEffect(() => {
    if (rail !== "credits") return;
    let cancelled = false;
    fetch("/api/credits", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { balance?: number } | null) => {
        if (!cancelled && d && typeof d.balance === "number") setBalance(d.balance);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [rail]);

  // Paid-report count for the 3rd-purchase Radar card (T0247). Signed-in →
  // funding_reports via GET /api/funding/report; guest → localStorage.
  React.useEffect(() => {
    if (rail === "guest") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- storage read after hydration
      setPaidCount(guestPaidReportCount());
      return;
    }
    if (rail !== "credits") return;
    let cancelled = false;
    fetch("/api/funding/report", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { paid_count?: number } | null) => {
        if (!cancelled && d && typeof d.paid_count === "number") setPaidCount(d.paid_count);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [rail]);

  async function startGuestCheckout(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/funding/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...intake, email: email.trim() }),
      });
      const data = (await res.json()) as { ok: boolean; checkoutUrl?: string; error?: string };
      if (!res.ok || !data.ok || !data.checkoutUrl) {
        setError(data.error ?? "Could not start checkout — try again.");
        return;
      }
      window.location.assign(data.checkoutUrl);
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function generateSignedIn() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/funding/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(intake),
      });
      const data = (await res.json()) as {
        ok: boolean;
        url?: string;
        reportId?: string;
        paidVia?: "plan" | "credits";
        error?: string;
        balance?: number;
      };
      if (res.status === 402) {
        if (typeof data.balance === "number") setBalance(data.balance);
        setGateOpen(true);
        return;
      }
      if (!res.ok || !data.ok || !data.url || !data.reportId) {
        setError(data.error ?? "Could not generate the report — try again.");
        return;
      }
      trackEvent("funding_report_paid", { paid_via: data.paidVia ?? "credits", report_id: data.reportId });
      router.push(data.url);
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const total = preview.grant_count + preview.program_count;
  const showRadarCard = rail !== "plan" && rail !== "anonymous" && paidCount >= RADAR_UPSELL_AFTER_REPORTS;

  return (
    <div className="mt-6 rounded-2xl border border-action/40 bg-surface-raised p-6 shadow-sm sm:p-8" data-funding-paywall data-rail={rail}>
      <div className="grid gap-8 md:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-action">{copy.paywall.eyebrow}</p>
          <h3 className="mt-1 font-display text-xl font-semibold text-primary sm:text-2xl">{copy.paywall.card}</h3>
          <ul className="mt-4 space-y-2 text-sm text-secondary">
            {UNLOCKS.map((u) => (
              <li key={u} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-bull" aria-hidden />
                <span>{u}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-tertiary">
            <ShieldCheck className="mr-1 inline h-3.5 w-3.5" aria-hidden />
            Grant information is free from government — we sell the analysis. Every row links to the official
            portal; apply there, never through a middleman. A grants consultant charges A$500–2,000 for this scan.
          </p>
        </div>

        <div className="rounded-xl border border-line-subtle bg-surface p-5">
          {rail === "plan" ? (
            <PlanRail busy={busy} onGenerate={generateSignedIn} total={total} />
          ) : rail === "credits" ? (
            <CreditsRail busy={busy} balance={balance} onStart={() => setConfirmOpen(true)} price={price} />
          ) : (
            <GuestRail busy={busy} email={email} onEmail={setEmail} onSubmit={startGuestCheckout} disabled={rail === "anonymous"} errorId={error ? "fp-error" : undefined} price={price} />
          )}
          {/* Busy state announced for screen readers (the button label alone is not re-read). */}
          <p className="sr-only" role="status" aria-live="polite" data-paywall-status>
            {busy ? (rail === "guest" ? "Opening checkout" : "Generating your report") : ""}
          </p>
          {error ? (
            <p id="fp-error" role="alert" className="mt-3 rounded-lg border border-bear/30 bg-bear/10 px-3 py-2 text-xs text-bear">
              {error}
            </p>
          ) : null}
          <p className="mt-4 border-t border-line-subtle pt-3 text-xs text-secondary">
            Deadlines move.{" "}
            <Link href="/signup?plan=founder_starter&trial=1" className="font-semibold text-action underline-offset-2 hover:underline">
              Founder Radar (Starter, A$29/mo)
            </Link>{" "}
            includes this report, 20 AI credits a month and alerts before every window you match closes — 7-day trial.
          </p>
        </div>
      </div>

      {showRadarCard ? (
        <RadarUpsellCard
          surface="funding_paywall"
          viewer={rail === "guest" ? "guest" : radarViewerKind(entUser)}
          lead={
            view.enabled || price.v5
              ? // Earlier purchases may have been at the legacy price — count, never sum.
                `You've bought ${paidCount} Money Finder reports — Founder Radar is A$29/mo and includes this report every month.`
              : `You've spent A$${paidCount * fundingReportAud(view)} on ${paidCount} reports — Founder Radar is A$29/mo and includes this report every month.`
          }
          paidReports={paidCount}
          className="mt-6"
        />
      ) : null}

      <CreditConfirm
        isOpen={confirmOpen}
        action="Grant & Program match report (≈1,200 words, 12-month timeline)"
        cost={price.credits}
        balance={balance ?? 0}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void generateSignedIn();
        }}
      />
      <CreditGate isOpen={gateOpen} onClose={() => setGateOpen(false)} feature={price.creditFeature} cost={price.credits} balance={balance ?? 0} />
    </div>
  );
}

function GuestRail({
  busy,
  email,
  onEmail,
  onSubmit,
  disabled,
  errorId,
  price = LEGACY_FUNDING_PRICE,
}: {
  price?: FundingRailPrice;
  busy: boolean;
  email: string;
  onEmail: (v: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  disabled: boolean;
  /** id of the visible error line, wired to the input via aria-describedby. */
  errorId?: string;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3" data-rail-form="guest">
      <p className="text-3xl font-semibold text-primary">
        {price.label}
        <span className="ml-1 text-sm font-normal text-secondary">{price.note}</span>
      </p>
      <p className="text-xs text-secondary">
        Your report link is emailed to you and opens straight after payment. No account needed.
      </p>
      <label htmlFor="fp-email" className="block text-xs font-medium text-secondary">
        Email for the report link
      </label>
      {/* The input drops its own outline; the wrapper carries the visible focus ring (WCAG 2.4.7). */}
      <div className="flex items-center gap-2 rounded-lg border border-line-subtle bg-surface-raised px-3 focus-within:border-action focus-within:ring-2 focus-within:ring-action/30">
        <Mail className="h-4 w-4 text-tertiary" aria-hidden />
        <input
          id="fp-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => onEmail(e.target.value)}
          placeholder="you@startup.com.au"
          aria-describedby={errorId}
          aria-invalid={errorId ? true : undefined}
          className="w-full bg-transparent py-2.5 text-sm text-primary placeholder:text-tertiary focus:outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={busy || disabled || price.loading || email.trim().length < 5}
        aria-busy={busy}
        className="inline-flex w-full items-center justify-center rounded-lg bg-action px-5 py-3 text-sm font-semibold text-on-action shadow-sm transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Opening checkout…" : `Pay ${price.label} & unlock`}
      </button>
      <p className="text-xs text-tertiary">
        Have an account?{" "}
        <Link href="/auth/login?next=/funding" className="font-semibold text-action underline-offset-2 hover:underline">
          Sign in
        </Link>{" "}
        to pay with {price.credits} credits or use your plan.
      </p>
    </form>
  );
}

function CreditsRail({ busy, balance, onStart, price = LEGACY_FUNDING_PRICE }: { busy: boolean; balance: number | null; onStart: () => void; price?: FundingRailPrice }) {
  return (
    <div className="space-y-3" data-rail-form="credits">
      <p className="text-3xl font-semibold text-primary">
        {price.credits} credits
        {price.v5 ? null : <span className="ml-1 text-sm font-normal text-secondary">≈ {price.label}</span>}
      </p>
      <p className="text-xs text-secondary">
        <Coins className="mr-1 inline h-3.5 w-3.5" aria-hidden />
        Balance: {balance === null ? "…" : `${balance.toFixed(2)} credits`}. You confirm the cost before anything is
        charged; credits are only deducted after the report is generated.
      </p>
      <button
        type="button"
        onClick={onStart}
        disabled={busy || price.loading}
        aria-busy={busy}
        className="inline-flex w-full items-center justify-center rounded-lg bg-action px-5 py-3 text-sm font-semibold text-on-action shadow-sm transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Generating…" : `Generate for ${price.credits} credits`}
      </button>
    </div>
  );
}

function PlanRail({ busy, onGenerate, total }: { busy: boolean; onGenerate: () => void; total: number }) {
  return (
    <div className="space-y-3" data-rail-form="plan">
      <p className="text-3xl font-semibold text-primary">
        Included
        <span className="ml-1 text-sm font-normal text-secondary">in your plan</span>
      </p>
      <p className="text-xs text-secondary">
        Your plan includes the Grant &amp; Program Finder. No credits are spent — generate as many times as your
        profile changes.
      </p>
      <button
        type="button"
        onClick={onGenerate}
        disabled={busy}
        aria-busy={busy}
        className="inline-flex w-full items-center justify-center rounded-lg bg-action px-5 py-3 text-sm font-semibold text-on-action shadow-sm transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Generating…" : `Generate my report (${total} matches)`}
      </button>
    </div>
  );
}

export default FundingPaywall;
