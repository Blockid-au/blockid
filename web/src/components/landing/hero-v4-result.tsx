"use client";

/**
 * Inline result panel for HeroV4. Shows the user their SVI score,
 * AUD valuation range, per-dimension mini-radar, and top-3 upgrade
 * actions — with a soft magic-link save CTA. No paywall, no
 * navigation. The paywalled surfaces (PDF report, investor-share
 * link, weekly tracking) are pitched further down the page.
 */

import Link from "next/link";
import { useEffect, useState } from "react";

export interface HeroAnalyzeResponse {
  ok: boolean;
  svi: {
    score: number;
    baseline: number;
    delta: number;
    confidence: number;
    stage: number;
    stageLabel: string;
    potentialScore: number;
    percentile: number;
    stageBenchmark: { median: number; topDecile: number; bottomDecile: number };
  };
  valuation: {
    lowAud: number;
    midAud: number;
    highAud: number;
    lowLabel: string;
    midLabel: string;
    highLabel: string;
    method: string;
    confidence: number;
  };
  sector: { key: string; label: string } | null;
  dimensions: Record<string, number>;
  strengths: string[];
  gaps: { priority: "P0" | "P1" | "P2"; label: string; action: string; impact: number }[];
  topActions: {
    priority: "P0" | "P1" | "P2";
    title: string;
    detail: string;
    impact: string;
    impactPoints: number;
  }[];
}

const DIM_ORDER: Array<[string, string]> = [
  ["ftv", "Team"],
  ["mpc", "Market"],
  ["ptd", "Product"],
  ["tre", "Traction"],
  ["cgh", "Governance"],
  ["iri", "Investor Ready"],
  ["lco", "Legal"],
  ["svm", "Moat"],
];

export function HeroV4Result({
  result,
  sourceText,
}: {
  result: HeroAnalyzeResponse;
  sourceText: string;
}) {
  const { svi, valuation, sector, dimensions, strengths, topActions } = result;
  const potentialGain = Math.max(0, svi.potentialScore - svi.score);
  const vsMedian = svi.score - svi.stageBenchmark.median;
  const vsMedianText =
    vsMedian >= 0
      ? `+${vsMedian} above stage median`
      : `${Math.abs(vsMedian)} below stage median`;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
      {/* SVI score card */}
      <div className="md:col-span-2 rounded-2xl border border-[var(--fintech-accent)]/25 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-6 text-left">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--fintech-ink-muted)]">
          Startup Value Index
        </p>
        <div className="mt-2 flex items-baseline gap-3">
          <span className="font-display text-5xl font-semibold tabular-nums text-[var(--fintech-ink)]">
            {svi.score}
          </span>
          {potentialGain > 0 ? (
            <span className="text-sm font-medium text-emerald-400">
              → {svi.potentialScore} potential
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-[var(--fintech-ink-muted)]">
          <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[var(--fintech-ink)]">
            {svi.percentile}th percentile
          </span>{" "}
          {vsMedianText} · Stage {svi.stage}{" "}
          <span className="text-[var(--fintech-ink)]">{svi.stageLabel}</span>
          {sector ? (
            <>
              {" "}
              · <span className="text-[var(--fintech-ink)]">{sector.label}</span>
            </>
          ) : null}
        </p>
        <p className="mt-2 text-[11px] text-[var(--fintech-ink-muted)]">
          AU stage median {svi.stageBenchmark.median} · top-decile {svi.stageBenchmark.topDecile}
          {" · "}Evidence confidence {svi.confidence}%
        </p>
      </div>

      {/* Valuation card */}
      <div className="md:col-span-3 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-left">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--fintech-ink-muted)]">
          Estimated pre-money valuation (AUD)
        </p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-display text-3xl font-semibold text-[var(--fintech-ink)] sm:text-4xl">
            {valuation.lowLabel} – {valuation.highLabel}
          </span>
        </div>
        <p className="mt-2 text-xs text-[var(--fintech-ink-muted)]">
          Midpoint <span className="tabular-nums text-[var(--fintech-ink)]">{valuation.midLabel}</span>
          {" · "}
          {valuation.method}
          {" · "}
          Confidence {valuation.confidence}%
        </p>
        <p className="mt-3 text-[11px] text-[var(--fintech-ink-muted)]">
          Blended Berkus + Scorecard + revenue multiples, benchmarked against
          AU-only comparables (Cut Through Venture, AVCAL 2024–2025).
        </p>
      </div>

      {/* Dimension bars */}
      <div className="md:col-span-5 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-left">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--fintech-ink-muted)]">
          8 SVI dimensions
        </p>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-4">
          {DIM_ORDER.map(([key, label]) => {
            const v = Math.max(0, Math.min(100, dimensions[key] ?? 0));
            return (
              <div key={key} className="text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[var(--fintech-ink-muted)]">{label}</span>
                  <span className="tabular-nums text-[var(--fintech-ink)]">{v}</span>
                </div>
                <div
                  className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]"
                  role="progressbar"
                  aria-valuenow={v}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={label}
                >
                  <div
                    className="h-full rounded-full bg-[var(--fintech-accent)]"
                    style={{ width: `${v}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top actions */}
      {topActions.length > 0 ? (
        <div className="md:col-span-3 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-left">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--fintech-ink-muted)]">
            3 fastest ways to raise your score
          </p>
          <ol className="mt-3 space-y-3 text-sm text-[var(--fintech-ink)]">
            {topActions.map((a, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--fintech-accent)]/40 bg-[var(--fintech-accent)]/10 text-[11px] font-semibold text-[var(--fintech-accent)]">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-medium">{a.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--fintech-ink-muted)]">{a.detail}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--fintech-accent)]">{a.impact}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {/* Strengths */}
      {strengths.length > 0 ? (
        <div className="md:col-span-2 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-left">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--fintech-ink-muted)]">
            What&apos;s already working
          </p>
          <ul className="mt-3 space-y-2 text-sm text-[var(--fintech-ink)]">
            {strengths.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="text-emerald-400">✓</span>
                <span className="text-[var(--fintech-ink-muted)]">{s}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Soft CTA — save & track, not paywall */}
      <SaveShareBand sourceText={sourceText} />
    </div>
  );
}

function SaveShareBand({ sourceText }: { sourceText: string }) {
  const [copied, setCopied] = useState(false);
  const [seed, setSeed] = useState("");

  useEffect(() => {
    try {
      const encoded = encodeSeed(sourceText);
      setSeed(encoded);
    } catch {
      setSeed("");
    }
  }, [sourceText]);

  async function copyShareUrl() {
    if (typeof window === "undefined" || !seed) return;
    const url = `${window.location.origin}/?a=${seed}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const signupHref = seed ? `/signup?seed=${seed}` : "/signup";

  return (
    <div className="md:col-span-5 rounded-2xl border border-[var(--fintech-accent)]/25 bg-[var(--fintech-accent)]/[0.06] p-6 text-left">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-semibold text-[var(--fintech-ink)]">
            Save this analysis and track your SVI every week.
          </p>
          <p className="mt-1 text-xs text-[var(--fintech-ink-muted)]">
            Connect GitHub, Stripe, cap table and pitch deck to unlock the
            full investor-grade report — no card required to start.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={signupHref}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-[var(--fintech-accent)] px-5 text-sm font-semibold text-[var(--fintech-bg-primary)] hover:bg-[var(--fintech-accent-hover)]"
          >
            Save my analysis
          </Link>
          <button
            type="button"
            onClick={copyShareUrl}
            disabled={!seed}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-white/15 bg-white/[0.03] px-5 text-sm font-medium text-[var(--fintech-ink)] hover:border-[var(--fintech-accent)]/60 hover:bg-white/[0.06] disabled:opacity-50"
          >
            {copied ? "Copied ✓" : "Share this analysis"}
          </button>
          <Link
            href="/how-it-works"
            className="text-xs uppercase tracking-wider text-[var(--fintech-ink-muted)] underline-offset-4 hover:text-[var(--fintech-ink)] hover:underline"
          >
            How the SVI is scored
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * base64url encode of the raw input text. Keeps URLs safe; the /?a= param
 * is re-decoded by HeroV4 on next visit to auto-run the analysis. Not a
 * security boundary — just an opaque handle for the shared analysis.
 */
export function encodeSeed(text: string): string {
  if (typeof window === "undefined") {
    return Buffer.from(text, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return window
    .btoa(bin)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodeSeed(seed: string): string | null {
  try {
    const b64 = seed.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    if (typeof window === "undefined") {
      return Buffer.from(b64 + pad, "base64").toString("utf8");
    }
    const bin = window.atob(b64 + pad);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}
