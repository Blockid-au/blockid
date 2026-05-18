"use client";

import * as React from "react";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  Lock,
  Mail,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  readPendingPayload,
  type PendingPackPayload,
} from "@/lib/idea-phase/session-state";

// Layer B CTA modal — "Save your Founder Pack".
//
// Reads the in-flight idea-phase state from sessionStorage at open time,
// POSTs email + pendingPayload to /api/auth/request, and shows a magic-
// link "check your inbox" success state. On the verify step the server
// hydrates the payload into typed rows + mints the founder_pack.
//
// Dismissible. Idempotent — POSTing twice with the same email just makes
// two magic links (the server tolerates it; only the latest one verifies).

export interface SaveFounderPackModalProps {
  open: boolean;
  onClose: () => void;
  trigger?: "manual" | "post-tool";
}

type State = "idle" | "submitting" | "ok" | "err";

export function SaveFounderPackModal({
  open,
  onClose,
}: SaveFounderPackModalProps) {
  if (!open) return null;

  return <SaveFounderPackModalContent onClose={onClose} />;
}

function SaveFounderPackModalContent({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = React.useState("");
  const [state, setState] = React.useState<State>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [snapshot] = React.useState<{
    payload: PendingPackPayload;
    filledCount: number;
    hasIdeaEval: boolean;
    hasEquitySplit: boolean;
    hasFundingPlan: boolean;
  }>(() => readPendingPayload());

  // Close on Escape.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock body scroll while open.
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (state === "submitting") return;
    if (!email.trim()) {
      setError("Enter your email.");
      setState("err");
      return;
    }
    setState("submitting");
    setError(null);

    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          intent: "save_founder_pack",
          pendingPayload: snapshot.payload,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error ?? "Could not send the link. Try again.");
      }
      setState("ok");
    } catch (err) {
      setState("err");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-founder-pack-title"
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8"
    >
      <div
        className="absolute inset-0 bg-ink-950/85 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-ink-700 bg-ink-900 shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
        >
          <X strokeWidth={1.75} className="h-5 w-5" />
        </button>

        <div className="px-7 pt-8 pb-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-400/40 bg-brand-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-200">
            <Sparkles strokeWidth={1.75} className="h-3.5 w-3.5" />
            Free forever at idea phase
          </div>

          <h2
            id="save-founder-pack-title"
            className="mt-4 text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl"
          >
            Save your Founder Pack
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400 sm:text-base">
            We&apos;ll email you a magic link to keep your idea valuation,
            equity split and funding plan in one shareable PDF — no password,
            no spam.
          </p>

          {snapshot.filledCount > 0 ? (
            <div className="mt-5 rounded-xl border border-ink-700 bg-ink-800/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-300">
                In your pack
              </p>
              <ul className="mt-3 space-y-2 text-sm text-slate-200">
                <PackItem ok={snapshot.hasIdeaEval} label="Idea valuation" />
                <PackItem
                  ok={snapshot.hasEquitySplit}
                  label="Equity split"
                />
                <PackItem
                  ok={snapshot.hasFundingPlan}
                  label="Funding plan"
                />
              </ul>
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm leading-relaxed text-amber-100">
              Nothing in your pack yet — go run any of the four free tools,
              then come back. Your inputs save automatically.
            </div>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="border-t border-ink-700 bg-ink-900/80 px-7 py-6"
          noValidate
        >
          {state === "ok" ? (
            <SuccessPanel email={email} />
          ) : (
            <>
              <Label
                htmlFor="founder-pack-email"
                className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400"
              >
                Work email
              </Label>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                <Input
                  id="founder-pack-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="founder@yourstartup.com.au"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={state === "submitting"}
                  aria-invalid={state === "err"}
                  className="flex-1"
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={state === "submitting" || snapshot.filledCount === 0}
                  className="h-11"
                >
                  {state === "submitting" ? (
                    <>
                      <Loader2
                        strokeWidth={1.75}
                        className="h-4 w-4 animate-spin"
                      />
                      Sending…
                    </>
                  ) : (
                    <>
                      Send me the link
                      <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>

              {state === "err" && error && (
                <p
                  role="alert"
                  className="mt-3 text-sm text-amber-300"
                  aria-live="assertive"
                >
                  {error}
                </p>
              )}

              <p className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                <Lock strokeWidth={1.75} className="h-3.5 w-3.5" />
                One BlockID account, free forever at idea phase. Magic link
                expires in 15 minutes.
              </p>
            </>
          )}
        </form>
      </div>
    </div>
  );
}

function PackItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
          ok
            ? "bg-brand-400/15 text-brand-300"
            : "bg-ink-700 text-slate-500"
        }`}
      >
        <CheckCircle2 strokeWidth={1.75} className="h-3.5 w-3.5" />
      </span>
      <span className={ok ? "text-slate-100" : "text-slate-500"}>{label}</span>
    </li>
  );
}

function SuccessPanel({ email }: { email: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-400/15 text-brand-300">
        <Mail strokeWidth={1.75} className="h-5 w-5" />
      </span>
      <div>
        <p className="text-base font-semibold text-slate-50">
          Check your inbox.
        </p>
        <p className="mt-1 text-sm leading-relaxed text-slate-400">
          We sent a magic link to{" "}
          <span className="font-medium text-slate-200">{email}</span>. Click it
          to mint your Founder Pack and dashboard. Link expires in 15 minutes.
        </p>
      </div>
    </div>
  );
}
