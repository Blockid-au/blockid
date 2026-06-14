"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";

type State = "idle" | "validating" | "submitting" | "redirecting" | "done" | "error";

interface CouponResult {
  ok: boolean;
  discount_pct?: number;
  description?: string;
  reason?: string;
}

const FULL_PRICE = 1;

export function Founding50Form() {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [startup, setStartup] = React.useState("");
  const [coupon, setCoupon] = React.useState("");
  const [couponResult, setCouponResult] = React.useState<CouponResult | null>(null);
  const [state, setState] = React.useState<State>("idle");
  const [error, setError] = React.useState("");

  const finalPrice =
    couponResult?.ok && couponResult.discount_pct
      ? Math.round(FULL_PRICE * (1 - couponResult.discount_pct / 100))
      : FULL_PRICE;

  const validateCoupon = async () => {
    if (!coupon.trim()) return;
    setState("validating");
    try {
      const res = await fetch("/api/coupon/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: coupon.trim() }),
      });
      const data = await res.json() as CouponResult;
      setCouponResult(data);
      trackEvent("coupon_applied", { code: coupon.trim().toUpperCase(), discount_pct: data.discount_pct ?? 0 });
    } catch {
      setCouponResult({ ok: false, reason: "Could not validate coupon" });
    } finally {
      setState("idle");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.includes("@")) {
      setError("Please fill in your name and a valid email.");
      return;
    }
    setError("");
    setState("submitting");

    try {
      // Step 1: Save the lead for tracking (keep existing behaviour).
      const leadRes = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          source: "founding50",
          payload: {
            name,
            startup: startup.trim() || null,
            coupon: couponResult?.ok ? coupon.trim().toUpperCase() : null,
            finalPrice,
            discountPct: couponResult?.discount_pct ?? 0,
          },
        }),
      });
      const leadData = await leadRes.json() as { ok: boolean };
      if (!leadData.ok) {
        setError("Something went wrong. Please try again.");
        setState("error");
        return;
      }

      trackEvent("founding50_submitted", { has_coupon: !!(couponResult?.ok) });
      trackEvent("lead_form_submitted", { source: "founding50" });

      // Step 2: Attempt Stripe checkout.
      setState("redirecting");

      const checkoutRes = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: "founding50",
          ...(couponResult?.ok && coupon.trim()
            ? { couponCode: coupon.trim().toUpperCase() }
            : {}),
        }),
      });

      if (checkoutRes.status === 401) {
        // User is not logged in — send them to login with a redirect back.
        const params = new URLSearchParams({
          plan: "founding50",
          next: "/founding-50",
          email,
        });
        window.location.href = `/auth/login?${params.toString()}`;
        return;
      }

      const checkoutData = await checkoutRes.json() as {
        ok: boolean;
        url?: string;
        reason?: string;
      };

      if (checkoutData.ok && checkoutData.url) {
        trackEvent("founding50_checkout_redirect", { price: finalPrice });
        window.location.href = checkoutData.url;
        return;
      }

      // Stripe not configured or other non-auth error — fall back to confirmation.
      setState("done");
    } catch {
      setError("Network error. Please try again.");
      setState("error");
    }
  };

  if (state === "redirecting") {
    return (
      <div className="rounded-2xl border border-brand-600/30 bg-brand-50/30 px-8 py-10 text-center">
        <Loader2
          strokeWidth={1.75}
          className="mx-auto mb-4 h-10 w-10 text-brand-600 animate-spin"
        />
        <h3 className="text-xl font-bold text-ink-800 mb-2">
          Redirecting to checkout&hellip;
        </h3>
        <p className="text-sm text-ink-600 leading-relaxed">
          Setting up your secure Stripe checkout session. You&apos;ll be
          redirected in a moment.
        </p>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className="rounded-2xl border border-green-500/30 bg-green-500/5 px-8 py-10 text-center">
        <CheckCircle2
          strokeWidth={1.75}
          className="mx-auto mb-4 h-10 w-10 text-green-400"
        />
        <h3 className="text-xl font-bold text-ink-800 mb-2">
          Almost there!
        </h3>
        <p className="text-sm text-ink-600 leading-relaxed mb-6">
          Your Founding 100 spot for{" "}
          <span className="text-ink-800 font-medium">{email}</span> is reserved.
          Complete checkout to activate your account.
        </p>
        <div className="rounded-xl border border-surface-200 bg-white px-4 py-3 text-sm text-ink-600">
          <p className="font-medium text-ink-800 mb-1">What happens next</p>
          <ol className="text-left space-y-1 text-xs list-decimal list-inside">
            <li>Complete secure payment via Stripe</li>
            <li>Account activated instantly</li>
            <li>Start your 30-day growth plan</li>
          </ol>
        </div>
        <Link
          href="/"
          className="mt-6 inline-block text-xs text-brand-600 hover:text-brand-700 transition-colors"
        >
          &larr; Analyze another idea
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-surface-200 bg-white p-6 space-y-4 shadow-sm"
    >
      <h2 className="text-lg font-bold text-ink-800">
        Claim your spot
      </h2>
      <p className="text-xs text-ink-600">
        100 spots only. Fill in your details and checkout securely via Stripe.
      </p>

      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="f50-name">Full name</Label>
        <Input
          id="f50-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Smith"
          required
        />
      </div>

      {/* Email */}
      <div className="space-y-1.5">
        <Label htmlFor="f50-email">Email</Label>
        <Input
          id="f50-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jane@startup.com"
          required
        />
      </div>

      {/* Startup */}
      <div className="space-y-1.5">
        <Label htmlFor="f50-startup">
          Startup name{" "}
          <span className="text-ink-700">(optional)</span>
        </Label>
        <Input
          id="f50-startup"
          value={startup}
          onChange={(e) => setStartup(e.target.value)}
          placeholder="Acme Co"
        />
      </div>

      {/* Coupon */}
      <div className="space-y-1.5">
        <Label htmlFor="f50-coupon">
          Coupon code{" "}
          <span className="text-ink-700">(optional)</span>
        </Label>
        <div className="flex gap-2">
          <Input
            id="f50-coupon"
            value={coupon}
            onChange={(e) => { setCoupon(e.target.value.toUpperCase()); setCouponResult(null); }}
            placeholder="FOUNDING50"
            className="font-mono tracking-wider"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={validateCoupon}
            disabled={!coupon.trim() || state === "validating"}
            className="h-11 shrink-0"
          >
            <Tag strokeWidth={1.75} className="h-3.5 w-3.5 mr-1" />
            Apply
          </Button>
        </div>
        {couponResult && (
          <p
            className={cn(
              "text-xs",
              couponResult.ok ? "text-green-400" : "text-red-400",
            )}
          >
            {couponResult.ok
              ? `✓ ${couponResult.description ?? `${couponResult.discount_pct}% off applied`}`
              : `✗ ${couponResult.reason}`}
          </p>
        )}
      </div>

      {/* Price summary */}
      <div className="rounded-xl border border-surface-200 bg-surface-100 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-ink-700">Total due</p>
          <div className="flex items-baseline gap-2 mt-0.5">
            {couponResult?.ok && couponResult.discount_pct && (
              <span className="text-ink-700 line-through font-mono text-sm">
                ${FULL_PRICE}
              </span>
            )}
            <span className="text-2xl font-bold font-mono text-ink-800">
              ${finalPrice}
            </span>
            <span className="text-ink-600 text-xs">AUD</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-ink-700">Payment method</p>
          <p className="text-xs text-ink-600 mt-0.5">Secure checkout via Stripe</p>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      <Button
        type="submit"
        variant="primary"
        size="md"
        disabled={state === "validating"}
        className="w-full"
      >
        {`Checkout — $${finalPrice} AUD`}
      </Button>

      <p className="text-center text-[10px] text-ink-700 leading-relaxed">
        You&apos;ll be redirected to Stripe for secure payment.
        Your spot is reserved once payment is complete.
      </p>
    </form>
  );
}
