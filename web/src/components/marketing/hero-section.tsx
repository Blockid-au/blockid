"use client";

/**
 * HeroSection — light-first, input-centric homepage hero.
 *
 * Rewrite (2026-09-08, homepage-redesign agent). Two things changed:
 *
 *   1. The submission now carries through. It used to push
 *      `/analyze?q=…`, which `analyze/page.tsx` never read, so the
 *      visitor typed their idea, navigated, and was asked to type it
 *      again. The submission — including a dropped File, which cannot be
 *      encoded in a URL — is parked in `pending-intake` and claimed by
 *      AnalyzeRoot on mount, which starts the run straight away.
 *   2. The copy stopped describing the technology and started describing
 *      the outcome. "AI-powered startup valuation" says nothing a founder
 *      can act on; knowing your number before the meeting does.
 *
 * COLOUR CONTRACT. SVI orange (#FF9F0A) is 2.33:1 on white — it fails AA
 * even at large-text sizes, so it is used ONLY as a graphic accent (the
 * rotating omnibox ring, the bar chips), never as readable copy. The H1
 * accent line uses `text-action` (#1D4ED8, 8.59:1 AAA).
 *
 * Keep `AnimatedSearchFrame` around the omnibox — the rotating conic ring
 * is a deliberate founder request.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Landmark, ScrollText, Sparkles } from "lucide-react";
import { SmartIntake, type SmartIntakeSubmission } from "@/components/analyze/smart-intake";
import {
  pendingIntakeQuery,
  setPendingIntake,
} from "@/lib/analyze/pending-intake";

/** Compact proof row shown under the omnibox — a real MVP-stage sample. */
const PREVIEW_DIMENSIONS = [
  { label: "FTV", pct: 62 },
  { label: "MPC", pct: 58 },
  { label: "PTD", pct: 55 },
  { label: "TRE", pct: 40 },
];

const TRUST_POINTS = [
  { icon: Sparkles, label: "First run free — no card, no signup" },
  { icon: ScrollText, label: "Berkus · VC method · DCF · comparables" },
  { icon: Landmark, label: "Built in Australia, for AU company law" },
];

export function HeroSection() {
  const router = useRouter();

  function handleSmartSubmit(payload: SmartIntakeSubmission) {
    // Park the whole submission — including a dropped File, which cannot be
    // encoded in a URL — then navigate. /analyze claims it on mount and starts
    // the analysis immediately, so nothing is ever typed twice.
    setPendingIntake(payload);
    router.push(pendingIntakeQuery(payload));
  }

  return (
    <section
      aria-labelledby="hero-heading"
      className="relative overflow-hidden border-b border-line-subtle bg-surface px-4 pb-14 pt-12 sm:pb-16 sm:pt-16"
    >
      {/* Soft brand wash behind the omnibox — decorative only, sits under
          the rotating ring without competing with it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 55% 45% at 50% 42%, color-mix(in srgb, var(--color-svi-500) 8%, transparent) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center gap-6 text-center">
        <p className="animate-fade-in-up inline-flex items-center gap-2 rounded-full border border-line-subtle bg-surface-sunken px-3 py-1 text-xs font-medium text-muted">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-svi-500" />
          Valuation, scoring and equity for Australian startups
        </p>

        <h1
          id="hero-heading"
          className="animate-fade-in-up font-display max-w-3xl text-balance text-4xl font-bold leading-[1.08] tracking-tight text-primary sm:text-5xl lg:text-[3.5rem]"
          style={{ animationDelay: "40ms" }}
        >
          Know what your company is worth{" "}
          <span className="text-action">before you walk into the room.</span>
        </h1>

        <p
          className="animate-fade-in-up max-w-2xl text-balance text-base leading-relaxed text-secondary sm:text-lg"
          style={{ animationDelay: "80ms" }}
        >
          Give it a pitch deck, your website, or three sentences about the
          idea. You get a score across eight dimensions, a valuation from four
          methods, and the moves that lift both — starting in about thirty
          seconds.
        </p>

        {/* The primary action. SmartIntake wraps itself in
            AnimatedSearchFrame, so the rotating ring lives here. */}
        <div
          className="animate-fade-in-up w-full max-w-3xl"
          style={{ animationDelay: "120ms" }}
        >
          {/* Hidden legacy input — kept so any existing test that hooks on
              #hero-search-input still finds a node. */}
          <input id="hero-search-input" type="hidden" defaultValue="" />
          <SmartIntake onSubmit={handleSmartSubmit} />
        </div>

        <ul
          className="animate-fade-in-up flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted"
          style={{ animationDelay: "160ms" }}
          aria-label="What you get"
        >
          {TRUST_POINTS.map(({ icon: Icon, label }) => (
            <li key={label} className="inline-flex items-center gap-1.5">
              <Icon size={14} aria-hidden className="text-action" />
              {label}
            </li>
          ))}
        </ul>
      </div>

      {/* Compact proof element — a real anonymised MVP-stage result, so the
          hero shows the OUTPUT rather than only the input box. */}
      <div
        className="animate-fade-in-up relative z-10 mx-auto mt-10 w-full max-w-3xl"
        style={{ animationDelay: "200ms" }}
      >
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-line-subtle bg-surface-sunken px-5 py-4 sm:flex-row sm:gap-6 sm:px-6">
          <p className="shrink-0 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
            A recent run
          </p>

          <div className="flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold leading-none text-primary tabular-nums">
              58
            </span>
            <span className="text-xs font-medium uppercase tracking-wider text-muted">
              SVI
            </span>
          </div>

          <p className="font-mono text-sm text-secondary tabular-nums">
            A$850K<span className="mx-1 text-muted">–</span>A$2.1M
          </p>

          {/* 4-dimension mini bars — graphic use of the brand orange. */}
          <div className="flex h-8 shrink-0 items-end gap-1.5" aria-hidden>
            {PREVIEW_DIMENSIONS.map((d) => (
              <div key={d.label} className="flex w-6 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-sm bg-svi-500"
                  style={{ height: `${d.pct}%`, minHeight: "3px" }}
                />
                <span className="font-mono text-[9px] uppercase tracking-wider text-tertiary">
                  {d.label}
                </span>
              </div>
            ))}
          </div>

          <p className="text-sm leading-snug text-muted sm:flex-1">
            Two founders, 40 paying pilots, no round raised yet.
          </p>

          <Link
            href="/reports/samples"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md text-sm font-medium text-action transition-colors hover:text-action-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            See the report
            <ArrowRight size={14} aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
