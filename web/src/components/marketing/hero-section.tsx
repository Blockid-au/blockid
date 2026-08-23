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
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

const PLACEHOLDER_CYCLE = [
  "Search your startup...",
  "Try 'fintech seed stage AU'",
  "Try 'SaaS B2B growth strategy'",
];

const QUICK_TAGS = [
  { emoji: "🔍", label: "Competitor Analysis" },
  { emoji: "📊", label: "Valuation" },
  { emoji: "🗺", label: "GTM Strategy" },
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
    router.push("/score");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSearch();
  }

  return (
    <section
      aria-labelledby="hero-heading"
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
          AI-Native · Australian Startup Intelligence
        </p>

        {/* Headline */}
        <h1
          id="hero-heading"
          className="animate-fade-in-up font-display max-w-3xl text-balance text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl"
          style={{ color: "#F8FAFC", animationDelay: "80ms" }}
        >
          Australia&apos;s{" "}
          <span
            style={{
              background: "linear-gradient(135deg, #00D4FF 0%, #0066FF 50%, #7B2FBE 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Startup Intelligence
          </span>{" "}
          Platform
        </h1>

        {/* Sub-headline */}
        <p
          className="animate-fade-in-up max-w-xl text-balance text-base leading-relaxed sm:text-lg"
          style={{ color: "#94A3B8", animationDelay: "160ms" }}
        >
          AI-powered analysis. Real benchmarks. Founder-first tools.
        </p>

        {/* ── Animated gradient ring search bar ─── */}
        <div
          className="animate-fade-in-up relative w-full max-w-2xl"
          style={{ animationDelay: "240ms" }}
        >
          {/* Gradient ring wrapper */}
          <div
            className="search-ring relative rounded-2xl p-[2px]"
            style={{
              background:
                "linear-gradient(270deg, #00D4FF, #0066FF, #7B2FBE, #00D4FF)",
              backgroundSize: "400% 400%",
              animation: "spin-ring 3s ease infinite",
            }}
          >
            {/* Inner search row */}
            <div
              className="flex items-center gap-3 rounded-2xl px-4 py-3"
              style={{ backgroundColor: "#111827" }}
            >
              {/* Search icon */}
              <Search
                size={20}
                className="shrink-0"
                style={{ color: "#94A3B8" }}
                aria-hidden
              />

              {/* Input */}
              <label htmlFor="hero-search-input" className="sr-only">
                Search your startup
              </label>
              <input
                id="hero-search-input"
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={PLACEHOLDER_CYCLE[placeholderIdx]}
                className="flex-1 bg-transparent text-sm focus:outline-none sm:text-base"
                style={{ color: "#F8FAFC" }}
                autoComplete="off"
              />

              {/* Analyse button */}
              <button
                type="button"
                onClick={handleSearch}
                className="shrink-0 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4FF] focus-visible:ring-offset-2 active:translate-y-0"
                style={{
                  background:
                    "linear-gradient(135deg, #00D4FF 0%, #0066FF 100%)",
                  boxShadow: "0 4px 20px -4px rgba(0,212,255,0.5)",
                }}
              >
                Analyse
              </button>
            </div>
          </div>
        </div>

        {/* Quick-tag chips */}
        <div
          className="animate-fade-in-up flex flex-wrap items-center justify-center gap-3"
          style={{ animationDelay: "320ms" }}
        >
          {QUICK_TAGS.map((tag) => (
            <button
              key={tag.label}
              type="button"
              onClick={() => router.push("/score")}
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
              <span aria-hidden>{tag.emoji}</span>
              {tag.label}
            </button>
          ))}
        </div>

        {/* Stats row */}
        <p
          className="animate-fade-in-up flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm"
          style={{ color: "#94A3B8", animationDelay: "400ms" }}
        >
          {STATS.map((stat, i) => (
            <span key={stat} className="inline-flex items-center gap-3">
              <span className="font-semibold" style={{ color: "#F8FAFC" }}>
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
