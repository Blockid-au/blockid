"use client";

import { useState } from "react";

interface CouponResult {
  code: string;
  discount_pct: number;
  label?: string;
}

interface PricingCouponProps {
  /** Original prices keyed by plan name, e.g. { Founder: 99, Growth: 499 } */
  prices: Record<string, number>;
}

export function PricingCoupon({ prices }: PricingCouponProps) {
  const [code, setCode] = useState("");
  const [state, setState] = useState<
    "idle" | "validating" | "valid" | "invalid"
  >("idle");
  const [result, setResult] = useState<CouponResult | null>(null);

  async function validate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    setState("validating");
    try {
      const res = await fetch("/api/coupon/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      if (!res.ok) {
        setState("invalid");
        setResult(null);
        return;
      }
      const data: CouponResult = await res.json();
      setState("valid");
      setResult(data);
      sessionStorage.setItem("blockid_coupon", JSON.stringify(data));
    } catch {
      setState("invalid");
      setResult(null);
    }
  }

  const discountPct = result?.discount_pct ?? 0;

  return (
    <div className="mt-12 mx-auto max-w-xl">
      <div className="rounded-2xl border border-surface-300 bg-surface-50 dark:bg-surface-100 p-6 md:p-8 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-gold-500 font-medium mb-1">
          Partner discount
        </p>
        <p className="text-slate-600 text-sm leading-relaxed mb-4">
          WSTI partners get <span className="text-brand-900 font-medium">50% off</span> all
          paid plans. Enter your code below to see discounted pricing.
        </p>

        <form onSubmit={validate} className="flex gap-2">
          <input
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              if (state === "invalid") setState("idle");
            }}
            placeholder="Enter partner code"
            className="flex-1 bg-surface-50 dark:bg-surface-200 border border-surface-300 rounded-lg px-3 py-2.5 text-sm text-brand-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          <button
            type="submit"
            disabled={state === "validating" || !code.trim()}
            className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {state === "validating" ? "Checking..." : "Apply"}
          </button>
        </form>

        {state === "invalid" && (
          <p className="mt-3 text-xs text-rose-500">
            Code not recognised. Check the spelling and try again.
          </p>
        )}

        {state === "valid" && result && (
          <div className="mt-4">
            <p className="text-sm text-emerald-600 font-medium mb-3">
              {result.label ?? `${discountPct}% discount unlocked!`}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(prices).map(([name, price]) => {
                const discounted = Math.round(
                  price * (1 - discountPct / 100),
                );
                return (
                  <div
                    key={name}
                    className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2.5 text-center"
                  >
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                      {name}
                    </p>
                    <p className="text-slate-400 text-xs line-through">
                      ${price}
                    </p>
                    <p className="text-brand-500 font-mono text-lg font-semibold">
                      ${discounted}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
