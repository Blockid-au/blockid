"use client";

import * as React from "react";
import { CheckCircle2, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type State = "idle" | "validating" | "submitting" | "done" | "error";

interface CouponResult {
  ok: boolean;
  discount_pct?: number;
  description?: string;
  reason?: string;
}

const FULL_PRICE = 49;

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
      const res = await fetch("/api/lead", {
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
      const data = await res.json() as { ok: boolean };
      if (!data.ok) {
        setError("Something went wrong. Please try again.");
        setState("error");
        return;
      }
      setState("done");
    } catch {
      setError("Network error. Please try again.");
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <div className="rounded-2xl border border-green-500/30 bg-green-500/5 px-8 py-10 text-center">
        <CheckCircle2
          strokeWidth={1.75}
          className="mx-auto mb-4 h-10 w-10 text-green-400"
        />
        <h3 className="text-xl font-bold text-slate-50 mb-2">
          You&apos;re on the list!
        </h3>
        <p className="text-sm text-slate-400 leading-relaxed mb-6">
          We&apos;ve received your Founding 50 application for{" "}
          <span className="text-slate-200 font-medium">{email}</span>. We&apos;ll
          send payment details and account setup within 24 hours.
        </p>
        <div className="rounded-xl border border-ink-700 bg-ink-900 px-4 py-3 text-sm text-slate-400">
          <p className="font-medium text-slate-200 mb-1">What happens next</p>
          <ol className="text-left space-y-1 text-xs list-decimal list-inside">
            <li>We send you a secure payment link (AUD ${finalPrice})</li>
            <li>Payment confirms your spot in Founding 50</li>
            <li>Account access + 30-day plan within 24 hours</li>
          </ol>
        </div>
        <a
          href="/"
          className="mt-6 inline-block text-xs text-brand-400 hover:text-brand-300 transition-colors"
        >
          ← Analyze another idea
        </a>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-ink-700 bg-ink-900 p-6 space-y-4"
    >
      <h2 className="text-lg font-bold text-slate-50">
        Claim your spot
      </h2>
      <p className="text-xs text-slate-400">
        50 spots only. Fill in your details and we&apos;ll send you a payment link within minutes.
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
          <span className="text-slate-500">(optional)</span>
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
          <span className="text-slate-500">(optional)</span>
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
      <div className="rounded-xl border border-ink-700 bg-ink-800 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500">Total due</p>
          <div className="flex items-baseline gap-2 mt-0.5">
            {couponResult?.ok && couponResult.discount_pct && (
              <span className="text-slate-500 line-through font-mono text-sm">
                ${FULL_PRICE}
              </span>
            )}
            <span className="text-2xl font-bold font-mono text-slate-50">
              ${finalPrice}
            </span>
            <span className="text-slate-400 text-xs">AUD</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Payment method</p>
          <p className="text-xs text-slate-300 mt-0.5">Secure link via email</p>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      <Button
        type="submit"
        variant="primary"
        size="md"
        disabled={state === "submitting"}
        className="w-full"
      >
        {state === "submitting" ? (
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            Reserving your spot…
          </span>
        ) : (
          `Reserve my Founding 50 spot — $${finalPrice} AUD`
        )}
      </Button>

      <p className="text-center text-[10px] text-slate-500 leading-relaxed">
        No payment now. We send you a secure payment link within minutes.
        Your spot is reserved for 24 hours once you submit.
      </p>
    </form>
  );
}
