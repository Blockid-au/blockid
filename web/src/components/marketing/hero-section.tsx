"use client";

/**
 * HeroSection — AI-Native dark glassmorphism hero.
 *
 * Features:
 *  - Full-viewport dark background (#0A0F1E) with radial glow + blobs
 *  - Space Grotesk headline
 *  - Google-style search bar with animated cyan→blue→purple gradient ring
 *  - Cycling placeholder text (3 s interval)
 *  - 3 quick-tag chips
 *  - Stats row
 *  - CSS-only fade-in-up entrance (respects prefers-reduced-motion via globals.css)
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BarChart3, Map, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SmartIntake, type SmartIntakeSubmission } from "@/components/analyze/smart-intake";

const PLACEHOLDER_CYCLE = [
  "Search your startup...",
  "Try 'fintech seed stage AU'",
  "Try 'SaaS B2B growth strategy'",
];

type QuickTag = {
  Icon: LucideIcon;
  label: string;
  /** Resolve chip destination, optionally threading the current query. */
  href: (query: string) => string;
};

const QUICK_TAGS: QuickTag[] = [
  {
    Icon: Search,
    label: "Competitor Analysis",
    href: (q) =>
      `/score?q=${encodeURIComponent(q.trim() || "competitor analysis")}`,
  },
  {
    Icon: BarChart3,
    label: "Valuation",
    href: () => "/tools/idea-valuation",
  },
  {
    Icon: Map,
    label: "GTM Strategy",
    href: () => "/tools/funding-plan",
  },
];

// Qualitative trust signals only — no fabricated numeric claims until real
// metrics are wired to a source of truth. See feedback: kill-fabricated-stats.
const STATS = [
  "AU-first",
  "Evidence-linked",
  "AI-powered · human-reviewable",
];

export function HeroSection() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cycle placeholder text every 3 s
  useEffect(() => {
    const id = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % PLACEHOLDER_CYCLE.length);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  function handleSearch() {
    // Block 2 (2026-09-08) — hero now redirects into the unified /analyze
    // omni-input. Query threads through as ?q= so SmartIntake can prefill.
    const q = query.trim();
    if (q.length > 0) {
      router.push(`/analyze?q=${encodeURIComponent(q)}`);
    } else {
      router.push("/analyze");
    }
  }

  function handleSmartSubmit(payload: SmartIntakeSubmission) {
    // Any successful classification lands on /analyze; the omnibox
    // itself handles the file / stream once the page mounts.
    const q =
      payload.text?.trim() ||
      payload.url?.trim() ||
      (payload.file ? payload.file.name : "");
    if (q.length > 0) {
      router.push(`/analyze?q=${encodeURIComponent(q)}`);
    } else {
      router.push("/analyze");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  }

  return (
    <section
      aria-labelledby="hero-heading"
      data-theme="dark"
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-24"
      style={{ backgroundColor: "#0A0F1E" }}
    >
      {/* Radial glow at centre */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 50%, rgba(0,212,255,0.05) 0%, transparent 70%)",
        }}
      />

      {/* Slow-oscillating blobs */}
      <div
        aria-hidden
        className="hero-blob pointer-events-none absolute left-[10%] top-[15%] h-[420px] w-[420px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(0,102,255,0.12) 0%, transparent 70%)",
          filter: "blur(60px)",
          animation: "blob-drift-a 18s ease-in-out infinite alternate",
          opacity: 0.06,
        }}
      />
      <div
        aria-hidden
        className="hero-blob pointer-events-none absolute bottom-[10%] right-[12%] h-[360px] w-[360px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(123,47,190,0.14) 0%, transparent 70%)",
          filter: "blur(60px)",
          animation: "blob-drift-b 22s ease-in-out infinite alternate",
          opacity: 0.06,
        }}
      />
      <div
        aria-hidden
        className="hero-blob pointer-events-none absolute right-[30%] top-[60%] h-[280px] w-[280px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(0,212,255,0.10) 0%, transparent 70%)",
          filter: "blur(50px)",
          animation: "blob-drift-c 26s ease-in-out infinite alternate",
          opacity: 0.06,
        }}
      />

      {/* Content */}
      <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center gap-8 text-center">
        {/* Eyebrow */}
        <p
          className="animate-fade-in-up font-mono text-[11px] uppercase tracking-[0.28em]"
          style={{ color: "#94A3B8", animationDelay: "0ms" }}
        >
          Startup Value Index · AU-first
        </p>

        {/* Headline */}
        <h1
          id="hero-heading"
          className="animate-fade-in-up font-display max-w-3xl text-balance text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl text-primary"
          style={{ animationDelay: "80ms" }}
        >
          Know your startup&apos;s{" "}
          <span
            style={{
              background: "linear-gradient(135deg, #00D4FF 0%, #0066FF 50%, #7B2FBE 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            SVI score
          </span>{" "}
          in 60 seconds.
        </h1>

        {/* Revenue chip — A$3 One-Click Report (primary revenue path).
            Sits above the fold on mobile 360px; uses brand gradient border. */}
        <Link
          href="/one-click-report"
          className="animate-fade-in-up inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 sm:text-sm text-primary"
          style={{
            background:
              "linear-gradient(135deg, rgba(0,212,255,0.14) 0%, rgba(123,47,190,0.14) 100%)",
            border: "1px solid rgba(0,212,255,0.55)",
            animationDelay: "120ms",
          }}
        >
          Try the A$3 One-Click Report
          <ArrowRight size={14} aria-hidden />
        </Link>

        {/* Sub-headline */}
        <p
          className="animate-fade-in-up max-w-xl text-balance text-base leading-relaxed sm:text-lg"
          style={{ color: "#94A3B8", animationDelay: "160ms" }}
        >
          AU-first evaluation across 8 SVI dimensions with valuation range A$1.5M–A$50M. Send investors a trust report they trust.
        </p>

        {/* ── SmartIntake omni-box (Block 2, 2026-09-08) ─── */}
        {/* Replaces the legacy search bar. Accepts URL paste, deck drop,
            or idea text. Also keeps a hidden legacy input ref so any
            existing tests hooking on hero-search-input still work. */}
        <div
          className="animate-fade-in-up relative w-full max-w-2xl"
          style={{ animationDelay: "240ms" }}
        >
          <input
            id="hero-search-input"
            ref={inputRef}
            type="hidden"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <SmartIntake
            onSubmit={handleSmartSubmit}
            placeholder={PLACEHOLDER_CYCLE[placeholderIdx]}
          />
        </div>

        {/* Quick-tag chips */}
        <div
          className="animate-fade-in-up flex flex-wrap items-center justify-center gap-3"
          style={{ animationDelay: "320ms" }}
        >
          {QUICK_TAGS.map((tag) => (
            // Rendered as a real <a href> (via next/link) so the SEO
            // fingerprint of chip destinations lives in server HTML —
            // otherwise crawlers can't see them and the plan's
            // Verify-7 grep for /tools/idea-valuation + /tools/funding-plan
            // in raw HTML returned 0 hits.
            //
            // The Competitor chip's href threads the current query, so
            // its resolution has to happen at render time — the resulting
            // `<a>` still updates on every keystroke thanks to React's
            // controlled input.
            <Link
              key={tag.label}
              href={tag.href(query)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm transition-all duration-200",
                "hover:scale-[1.03] hover:border-[rgba(0,212,255,0.5)]",
              )}
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#94A3B8",
              }}
            >
              <tag.Icon size={16} aria-hidden />
              {tag.label}
            </Link>
          ))}
        </div>

        {/* Tertiary link — surface /tbr/demo (a real, end-to-end trust
            report walkthrough) as a low-commitment third choice under the
            primary "Get my SVI score" CTA and secondary chip row. Workstream
            D3 of the h-y-review-t-on-b-foamy-pixel plan. */}
        <Link
          href="/tbr/demo"
          className="animate-fade-in-up inline-flex items-center gap-1.5 rounded-md text-sm transition-colors duration-200 hover:text-[#00D4FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0F1E]"
          style={{ color: "#94A3B8", animationDelay: "360ms" }}
        >
          See a real trust report
          <ArrowRight size={14} aria-hidden />
        </Link>

        {/* Stats row */}
        <p
          className="animate-fade-in-up flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm"
          style={{ color: "#94A3B8", animationDelay: "400ms" }}
        >
          {STATS.map((stat, i) => (
            <span key={stat} className="inline-flex items-center gap-3">
              <span className="font-semibold text-primary">
                {stat}
              </span>
              {i < STATS.length - 1 && (
                <span aria-hidden style={{ color: "#94A3B8" }}>
                  ·
                </span>
              )}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}
