"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trackEvent } from "@/lib/analytics";

export function CtaStrip() {
  const [email, setEmail] = React.useState("");
  const [state, setState] = React.useState<"idle" | "submitting" | "ok" | "err">(
    "idle",
  );

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email || state === "submitting") return;
    setState("submitting");
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "landing-cta",
          email,
          payload: { intent: "founder-pack" },
        }),
      });
      if (!res.ok) throw new Error("Network error");
      setState("ok");
      trackEvent("lead_form_submitted", { source: "landing-cta", intent: "founder-pack" });
    } catch {
      setState("err");
    }
  };

  return (
    <section className="py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="relative overflow-hidden rounded-3xl gradient-brand px-6 py-12 md:px-12 md:py-16">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-gradient-to-br from-brand-600/30 via-transparent to-transparent"
          />
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gold-300 font-medium">
                Free for every Australian founder
              </p>
              <h2 className="mt-3 text-3xl md:text-5xl font-semibold tracking-tight text-white">
                Get your pre-diligence pack ready.
              </h2>
              <p className="mt-4 text-base md:text-lg leading-relaxed text-brand-100">
                Your readiness score, equity split and ownership summary in one
                shareable link. No password. No spam. Free to start.
              </p>
            </div>
            <div className="flex flex-col gap-6">
              <Link
                href="/score"
                className="inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-white px-8 text-base font-semibold text-brand-700 shadow-[0_18px_48px_rgba(0,0,0,0.15)] transition-colors hover:bg-brand-50 sm:self-start"
              >
                Get my Score &mdash; free
                <ArrowRight strokeWidth={1.75} className="h-5 w-5" />
              </Link>
              <div className="flex items-center gap-3 text-xs text-brand-200">
                <span className="h-px flex-1 bg-white/20" />
                <span>or save your Founder Pack</span>
                <span className="h-px flex-1 bg-white/20" />
              </div>
            </div>
            <form
              onSubmit={onSubmit}
              className="flex flex-col gap-3"
              noValidate
            >
              <Label htmlFor="cta-email" className="text-brand-100">
                Work email
              </Label>
              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  id="cta-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="founder@yourstartup.com.au"
                  className="flex-1 border-white/20 bg-white/10 text-white placeholder:text-brand-200"
                  aria-invalid={state === "err"}
                />
                <Button type="submit" variant="primary" size="md" disabled={state === "submitting"} className="bg-white text-brand-700 hover:bg-brand-50">
                  {state === "ok" ? "Sent" : state === "submitting" ? "Sending…" : "Send me the link"}
                  {state === "ok" ? (
                    <CheckCircle2 strokeWidth={1.75} className="h-5 w-5" />
                  ) : (
                    <ArrowRight strokeWidth={1.75} className="h-5 w-5" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-brand-200">
                Or skip the email and{" "}
                <Link
                  href="/tools/idea-valuation"
                  className="text-gold-300 hover:text-gold-200 underline underline-offset-4 cursor-pointer"
                >
                  start with your idea
                </Link>
                .
              </p>
              {state === "ok" && (
                <p
                  role="status"
                  className="text-sm text-brand-100"
                  aria-live="polite"
                >
                  Thanks — check your inbox in a minute.
                </p>
              )}
              {state === "err" && (
                <p
                  role="alert"
                  className="text-sm text-amber-300"
                  aria-live="assertive"
                >
                  Something went wrong. Try again.
                </p>
              )}
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
