"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
          payload: { intent: "score" },
        }),
      });
      if (!res.ok) throw new Error("Network error");
      setState("ok");
    } catch {
      setState("err");
    }
  };

  return (
    <section className="py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="relative overflow-hidden rounded-3xl border border-ink-700 bg-ink-900 px-6 py-12 md:px-12 md:py-16">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-gradient-to-br from-teal-500/10 via-transparent to-transparent"
          />
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-teal-400 font-medium">
                5 minutes. One number.
              </p>
              <h2 className="mt-3 text-3xl md:text-5xl font-semibold tracking-tight text-slate-50">
                Get your Investor-Ready Score
              </h2>
              <p className="mt-4 text-base md:text-lg leading-relaxed text-slate-400">
                Drop your email — we will send you the link to start. No credit
                card. No call required.
              </p>
            </div>
            <form
              onSubmit={onSubmit}
              className="flex flex-col gap-3"
              noValidate
            >
              <Label htmlFor="cta-email" className="text-slate-300">
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
                  className="flex-1"
                  aria-invalid={state === "err"}
                />
                <Button type="submit" variant="primary" size="md" disabled={state === "submitting"}>
                  {state === "ok" ? "Sent" : state === "submitting" ? "Sending…" : "Send me the link"}
                  {state === "ok" ? (
                    <CheckCircle2 strokeWidth={1.75} className="h-5 w-5" />
                  ) : (
                    <ArrowRight strokeWidth={1.75} className="h-5 w-5" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                Or skip the email and{" "}
                <Link
                  href="/score"
                  className="text-teal-300 hover:text-teal-200 underline underline-offset-4 cursor-pointer"
                >
                  generate it now
                </Link>
                .
              </p>
              {state === "ok" && (
                <p
                  role="status"
                  className="text-sm text-teal-300"
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
