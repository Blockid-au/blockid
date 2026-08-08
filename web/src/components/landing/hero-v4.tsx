"use client";

/**
 * HeroV4 — value-first hero.
 *
 * On landing, the user is asked ONE question: "What are you building?"
 * They paste a description and get their Startup Value Index + AUD
 * valuation range in the same view, no navigation and no signup. The
 * pricing / Founding-100 offer lives further down the page.
 *
 * Design intent (per founder brief, Aug 2026):
 *   • Simple, effective, impressive.
 *   • Solve the hard question every founder wants answered:
 *     "Am I fundable? What's my biz worth? How do investors see me?"
 *   • Benefits first, offers later.
 */

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  HeroV4Result,
  decodeSeed,
  type HeroAnalyzeResponse,
} from "./hero-v4-result";

interface HeroV4Props {
  signedInHref?: string;
  verifiedCount?: number;
}

const QUICK_FILL_TEMPLATES: Array<{ label: string; text: string }> = [
  {
    label: "Just an idea",
    text: "AI copilot for Australian small-business bookkeepers. Problem: SMEs spend 6+ hours a week reconciling. Solo founder, ex-Xero product manager, no code yet, targeting the 2.5M AU SMEs.",
  },
  {
    label: "MVP built",
    text: "MVP live for 3 months. Web app that helps AU startups generate ASIC-compliant cap tables. 40 waitlist, 2 design-partner LOIs. Two co-founders (ex-KPMG + ex-Atlassian). Pre-revenue, raising A$500k pre-seed.",
  },
  {
    label: "First revenue",
    text: "SaaS for AU accounting firms. A$4.2k MRR from 12 paying customers, 15% MoM growth, <2% churn. Three co-founders, ex-MYOB. Australian addressable market ~A$180M. Raising A$1.5M seed.",
  },
  {
    label: "Raising now",
    text: "FinTech neobank for AU tradies. A$28k MRR, 480 customers, AFSL applied. Team of 6 (ex-Up, ex-Judo). Data room ready, pitch deck done, term sheet from angel syndicate for A$2M at A$18M pre-money.",
  },
];

export function HeroV4({ signedInHref, verifiedCount }: HeroV4Props) {
  const [text, setText] = useState("");
  const [analysedText, setAnalysedText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HeroAnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoRan = useRef(false);

  const isSignedIn = Boolean(signedInHref);
  const canSubmit = text.trim().length >= 20 && !loading;

  async function runAnalyze(rawText: string) {
    const trimmed = rawText.trim();
    if (trimmed.length < 20) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hero/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      const json = (await res.json()) as HeroAnalyzeResponse & {
        ok: boolean;
        error?: string;
      };
      if (!json.ok) {
        setError(json.error ?? "Analysis failed. Please try again.");
        return;
      }
      setResult(json);
      setAnalysedText(trimmed);
      requestAnimationFrame(() => {
        document
          .getElementById("hero-v4-result")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch {
      setError("Network error — please retry.");
    } finally {
      setLoading(false);
    }
  }

  // Auto-run when user lands with a shared analysis: /?a=<seed>
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    if (typeof window === "undefined") return;
    const seed = new URLSearchParams(window.location.search).get("a");
    if (!seed) return;
    const decoded = decodeSeed(seed);
    if (!decoded || decoded.trim().length < 20) return;
    setText(decoded);
    void runAnalyze(decoded);
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    await runAnalyze(text);
  }

  function reset() {
    setResult(null);
    setError(null);
  }

  return (
    <section
      aria-labelledby="hero-v4-heading"
      className="fintech-hero-glow relative w-full px-4 pb-12 pt-12 md:pt-20"
    >
      <div className="fintech-enter mx-auto flex w-full max-w-3xl flex-col items-center gap-6 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--fintech-ink-muted)]">
          Free · 30-second instant analysis · No signup
        </p>

        <h1
          id="hero-v4-heading"
          className="font-display max-w-2xl text-balance text-3xl font-semibold tracking-tight text-[var(--fintech-ink)] sm:text-4xl md:text-5xl"
        >
          Know what your startup is{" "}
          <span className="bg-gradient-to-r from-[var(--fintech-accent)] to-[var(--fintech-accent-hot)] bg-clip-text text-transparent">
            worth
          </span>{" "}
          — before you pitch.
        </h1>

        <p className="max-w-xl text-balance text-base leading-relaxed text-[var(--fintech-ink-muted)] sm:text-lg">
          Paste your idea, MVP or biz. Get your Startup Value Index score,
          AUD valuation range, and the 3 fastest actions to raise both — in
          under 3 seconds.
        </p>

        {/* Numbers strip — real, defensible stats (P3 of value-first-hero-goal) */}
        <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-[var(--fintech-ink-muted)]">
          {typeof verifiedCount === "number" && verifiedCount > 0 ? (
            <>
              <span>
                <span className="tabular-nums font-semibold text-[var(--fintech-ink)]">
                  {verifiedCount.toLocaleString("en-AU")}+
                </span>{" "}
                AU businesses on BlockID
              </span>
              <span aria-hidden>·</span>
            </>
          ) : null}
          <span>
            AU pre-money band{" "}
            <span className="tabular-nums font-semibold text-[var(--fintech-ink)]">
              A$1.5M–A$50M
            </span>
          </span>
          <span aria-hidden>·</span>
          <span>
            <span className="tabular-nums font-semibold text-[var(--fintech-ink)]">
              &lt;3 seconds
            </span>{" "}
            to your number
          </span>
        </p>

        <form
          onSubmit={onSubmit}
          className="mt-2 flex w-full flex-col items-stretch gap-3"
        >
          <label htmlFor="hero-v4-input" className="sr-only">
            Describe your business, idea or MVP
          </label>
          <textarea
            id="hero-v4-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            maxLength={4000}
            placeholder={`e.g. "AI compliance assistant for AU accountants — 12 paying customers, A$4k MRR, ex-KPMG founding team, raising A$750k seed…"`}
            className="min-h-[140px] w-full resize-y rounded-2xl border border-white/15 bg-white/[0.04] px-4 py-3 text-left text-sm text-[var(--fintech-ink)] shadow-inner placeholder:text-[var(--fintech-ink-muted)]/70 focus:border-[var(--fintech-accent)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--fintech-focus-ring)]/40 sm:text-base"
            aria-describedby="hero-v4-input-help"
          />
          <div
            id="hero-v4-input-help"
            className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-[var(--fintech-ink-muted)]"
          >
            <span>
              {text.length < 20
                ? `${Math.max(0, 20 - text.length)} more characters to unlock analysis`
                : `${text.length}/4000 characters`}
            </span>
            <span>No signup · Not stored · No PII collected</span>
          </div>

          {/* Quick-fill chips — no blank-page paralysis */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <span className="text-[11px] uppercase tracking-wider text-[var(--fintech-ink-muted)]/80">
              Try:
            </span>
            {QUICK_FILL_TEMPLATES.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => {
                  setText(t.text);
                  setResult(null);
                }}
                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-[var(--fintech-ink-muted)] transition hover:border-[var(--fintech-accent)]/60 hover:bg-white/[0.06] hover:text-[var(--fintech-ink)]"
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4">
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--fintech-accent)] px-8 text-sm font-semibold text-[var(--fintech-bg-primary)] shadow-[0_8px_24px_-8px_rgba(34,211,238,0.6)] transition-all duration-200 hover:bg-[var(--fintech-accent-hover)] hover:shadow-[0_12px_32px_-8px_rgba(34,211,238,0.7)] hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fintech-bg-primary)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-[0_8px_24px_-8px_rgba(34,211,238,0.6)]"
            >
              {loading
                ? "Analysing…"
                : result
                  ? "Re-analyse"
                  : "Get my instant Startup Value →"}
            </button>
            {result ? (
              <button
                type="button"
                onClick={reset}
                className="text-xs uppercase tracking-wider text-[var(--fintech-ink-muted)] underline-offset-4 hover:underline"
              >
                Clear
              </button>
            ) : null}
          </div>

          {error ? (
            <p
              role="alert"
              className="text-center text-xs text-[var(--fintech-accent-hot)]"
            >
              {error}
            </p>
          ) : null}
        </form>

        {/* Micro-links row */}
        <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] uppercase tracking-[0.2em] text-[var(--fintech-ink-muted)]">
          <Link href="/how-it-works" className="hover:text-[var(--fintech-ink)]">
            How the SVI works
          </Link>
          <span aria-hidden>·</span>
          <Link href="/index" className="hover:text-[var(--fintech-ink)]">
            Live BSI-AU index
          </Link>
          <span aria-hidden>·</span>
          <Link
            href="/reports/samples"
            className="hover:text-[var(--fintech-ink)]"
          >
            Sample report
          </Link>
          {isSignedIn && signedInHref ? (
            <>
              <span aria-hidden>·</span>
              <Link href={signedInHref} className="hover:text-[var(--fintech-ink)]">
                Continue to your dashboard
              </Link>
            </>
          ) : null}
        </p>

      </div>

      {result ? (
        <div id="hero-v4-result" className="mx-auto mt-10 w-full max-w-4xl">
          <HeroV4Result result={result} sourceText={analysedText} />
        </div>
      ) : null}
    </section>
  );
}

export default HeroV4;
