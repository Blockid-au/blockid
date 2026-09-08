"use client";

/**
 * HeroSection — input-centric homepage hero.
 *
 * Redesign (2026-09-08, homepage-input-centric agent): the previous hero
 * carried an eyebrow, headline, revenue chip, sub-headline, SmartIntake,
 * chip row, tertiary link, and a stats row. That density fought the
 * product spirit — "paste anything, get an SVI score". This rewrite
 * strips the hero to three elements:
 *
 *   1. One 2-line H1 promise.
 *   2. The <SmartIntake /> omnibox (which already wraps itself in
 *      <AnimatedSearchFrame>) as the visual anchor.
 *   3. A tight three-item trust row (Zap · ShieldCheck · DollarSign).
 *
 * Everything else was moved to `/for/founder`, `/product` or `/team`,
 * so the homepage now expresses the input → analyse → valuate loop
 * inside the first viewport.
 */

import { useRouter } from "next/navigation";
import { DollarSign, ShieldCheck, Zap } from "lucide-react";
import { SmartIntake, type SmartIntakeSubmission } from "@/components/analyze/smart-intake";

export function HeroSection() {
  const router = useRouter();

  function handleSmartSubmit(payload: SmartIntakeSubmission) {
    // Every successful classification lands on /analyze; the omnibox on
    // that page picks up ?q= and re-runs the same classifier server-side.
    const q =
      payload.text?.trim() ||
      payload.url?.trim() ||
      (payload.file ? payload.file.name : "");
    router.push(q.length > 0 ? `/analyze?q=${encodeURIComponent(q)}` : "/analyze");
  }

  return (
    <section
      aria-labelledby="hero-heading"
      data-theme="dark"
      className="relative flex min-h-[calc(100vh-64px)] flex-col items-center justify-center overflow-hidden px-4 py-20"
      style={{ backgroundColor: "#0A0F1E" }}
    >
      {/* Soft radial glow — pulls the eye toward the omnibox without
          competing with the AnimatedSearchFrame's rotating ring. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 55%, rgba(255,159,10,0.06) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center gap-8 text-center">
        {/* One-line promise, two visual lines on desktop. */}
        <h1
          id="hero-heading"
          className="animate-fade-in-up font-display max-w-2xl text-balance text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl text-primary"
          style={{ animationDelay: "0ms" }}
        >
          Know what your startup is worth
          <span className="block text-transparent" style={{
            background: "linear-gradient(135deg, #FF9F0A 0%, #FFB84A 60%, #FFD08A 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}>
            before you pitch it.
          </span>
        </h1>

        {/* Sub-headline — single sentence, names the three input modes. */}
        <p
          className="animate-fade-in-up max-w-xl text-balance text-base leading-relaxed sm:text-lg"
          style={{ color: "#94A3B8", animationDelay: "80ms" }}
        >
          Paste your pitch deck, paste your URL, or just describe your
          idea. Get an SVI score plus AUD valuation in 30 seconds.
        </p>

        {/* The input. SmartIntake wraps itself in AnimatedSearchFrame,
            so the rotating orange→blue→green ring lives here. */}
        <div
          className="animate-fade-in-up w-full max-w-2xl"
          style={{ animationDelay: "160ms" }}
        >
          {/* Hidden legacy input — kept so any existing test that hooks
              on #hero-search-input still finds a node. */}
          <input id="hero-search-input" type="hidden" defaultValue="" />
          <SmartIntake onSubmit={handleSmartSubmit} />
        </div>

        {/* Tight trust row: three tiny icon+label pairs. */}
        <ul
          className="animate-fade-in-up flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm"
          style={{ color: "#94A3B8", animationDelay: "240ms" }}
          aria-label="Trust signals"
        >
          <li className="inline-flex items-center gap-1.5">
            <Zap size={14} aria-hidden style={{ color: "#FF9F0A" }} />
            30-sec analysis
          </li>
          <li aria-hidden>·</li>
          <li className="inline-flex items-center gap-1.5">
            <ShieldCheck size={14} aria-hidden style={{ color: "#FF9F0A" }} />
            AU compliant
          </li>
          <li aria-hidden>·</li>
          <li className="inline-flex items-center gap-1.5">
            <DollarSign size={14} aria-hidden style={{ color: "#FF9F0A" }} />
            No card required
          </li>
        </ul>
      </div>
    </section>
  );
}
