"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Upload, FileText, ArrowRight, Loader2, Wallet, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PitchdeckCoverageGrid,
  type CoverageMap,
} from "@/components/svi/pitchdeck-coverage-grid";
import { SviStreamAnalysis } from "@/components/svi/svi-stream-analysis";

// Compact sample pitch — enough for the classifier to score every dim so
// first-time founders can preview the flow without paying or uploading.
const SAMPLE_PITCH = `Aussie SaaS Co (Seed, Sydney)

Team — Co-founders Priya Chen (ex-Atlassian, 2 exits) and Marcus Ho
(ex-Canva PM, Y Combinator W22). Team of 6, 4 engineers. All full-time
since Jan 2026.

Market & Problem — Australian SMBs spend AUD $2.4B/yr on manual bookkeeping
reconciliation. Our TAM AU is $310M ARR at a 12% penetration ceiling.

Product — AI-native bank-feed reconciliation for Xero. Live with 82
paying customers, 47 more in a 4-week paid pilot. Weekly retention 91%.

Traction — $18k MRR in month 5, growing 34% MoM. LTV/CAC 4.2. 2 letter-
of-intent enterprise deals worth AUD $180k ARR combined pending signature.

Cap table — 82% founders, 12% ESOP unallocated, 6% angels. All vested
4y / 1y cliff. Corporate governance: 3-seat board (2 founders + 1
independent director).

Financials — Runway 14 months at current burn ($42k/mo). Seed target
$1.5M AUD at $8M post. Raising to hit $60k MRR + Series A metrics.

Legal — Pty Ltd registered, IP assigned, GDPR + Aus Privacy Act
compliant. Waiting on trademark registration.`;

interface CreditsInfo {
  balance: number;
  plan: string;
}

// Kept in sync with FEATURE_COSTS in /web/src/lib/credits.ts. Rendered on
// the coverage grid so the founder sees the price before opting in.
const SPECULATIVE_COST: Record<string, number> = {
  ftv: 0.75,
  mpc: 0.75,
  ptd: 0.75,
  tre: 1.0,
  cgh: 0.75,
  iri: 0.75,
  lco: 0.5,
  svm: 0.75,
};

type Step = "upload" | "coverage" | "analyze";

interface ClassifyResponse {
  ok: boolean;
  pitchdeckId?: string;
  coverage?: CoverageMap;
  textBytes?: number;
  error?: string;
}

interface AnalyzeResponse {
  ok: boolean;
  pitchdeckId?: string;
  dims?: string[];
  speculativeDims?: string[];
  creditsCharged?: number;
  deckText?: string;
  error?: string;
  balance?: number;
  required?: number;
}

export function PitchdeckAnalyzeClient({ projectId }: { projectId?: string }) {
  const [step, setStep] = useState<Step>("upload");
  const [pastedText, setPastedText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insufficient, setInsufficient] = useState<{
    required: number;
    balance: number;
  } | null>(null);
  const [pitchdeckId, setPitchdeckId] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<CoverageMap>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Kept for the streaming analyzer once step === "analyze".
  const [analyzeDims, setAnalyzeDims] = useState<string[] | null>(null);
  const [credits, setCredits] = useState<CreditsInfo | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Fetch the current balance so the header chip + insufficient-credits
  // messages are accurate. Silent on failure — the analyze endpoint
  // still gates authoritatively.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/credits", { credentials: "same-origin" });
        if (!res.ok) return;
        const body = (await res.json()) as { ok?: boolean; balance?: number; plan?: string };
        if (!body.ok || cancelled) return;
        setCredits({ balance: body.balance ?? 0, plan: body.plan ?? "free" });
      } catch {
        /* silent */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Preselect all dims where the deck has strong or partial evidence —
  // those are free and there's no reason not to run them.
  const primeSelection = useCallback((cov: CoverageMap) => {
    const initial = new Set<string>();
    for (const [k, v] of Object.entries(cov)) {
      if (v.level === "strong" || v.level === "partial") initial.add(k);
    }
    setSelected(initial);
  }, []);

  const speculativeCost = useMemo(() => {
    let total = 0;
    for (const k of selected) {
      if (coverage[k]?.level === "missing") total += SPECULATIVE_COST[k] ?? 0;
    }
    return Math.round(total * 100) / 100;
  }, [selected, coverage]);

  const toggleDim = useCallback((dim: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(dim)) next.delete(dim);
      else next.add(dim);
      return next;
    });
  }, []);

  const submitClassify = useCallback(async () => {
    setError(null);
    if (!file && pastedText.trim().length < 40) {
      setError("Upload a deck or paste at least 40 characters of pitch text.");
      return;
    }
    setBusy(true);
    try {
      let storageUrl = "";
      let filename = pastedText.trim().length > 0 ? "pasted-pitch.txt" : file?.name ?? "pitchdeck.pdf";

      if (file) {
        // Multipart upload via the existing authenticated /api/upload route.
        const fd = new FormData();
        fd.append("file", file);
        fd.append("subdir", "pitchdecks");
        const upRes = await fetch("/api/upload", { method: "POST", body: fd });
        if (!upRes.ok) {
          const body = (await upRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `upload_failed_${upRes.status}`);
        }
        const upBody = (await upRes.json()) as { url?: string; filename?: string };
        storageUrl = upBody.url ?? "";
        filename = upBody.filename ?? filename;
      }

      const clsRes = await fetch("/api/pitchdeck/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename,
          storageUrl,
          projectId: projectId || null,
          rawText: file ? undefined : pastedText,
        }),
      });
      const clsBody = (await clsRes.json()) as ClassifyResponse;
      if (!clsBody.ok || !clsBody.coverage || !clsBody.pitchdeckId) {
        throw new Error(clsBody.error ?? "classify_failed");
      }
      setPitchdeckId(clsBody.pitchdeckId);
      setCoverage(clsBody.coverage);
      primeSelection(clsBody.coverage);
      setStep("coverage");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }, [file, pastedText, projectId, primeSelection]);

  const submitAnalyze = useCallback(async () => {
    if (!pitchdeckId || selected.size === 0) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/pitchdeck/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pitchdeckId, dims: Array.from(selected) }),
      });
      const body = (await res.json()) as AnalyzeResponse;
      if (!body.ok || !body.dims) {
        if (res.status === 402 && body.error === "insufficient_credits") {
          setInsufficient({
            required: body.required ?? 0,
            balance: body.balance ?? 0,
          });
        } else {
          setError(body.error ?? "analyze_failed");
        }
        return;
      }
      setInsufficient(null);
      setAnalyzeDims(body.dims);
      setStep("analyze");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }, [pitchdeckId, selected]);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-100">
            Pitchdeck Analysis
          </h1>
          <p className="text-sm text-ink-600 dark:text-ink-400 max-w-3xl">
            Upload your deck. We&rsquo;ll classify how well each of the 8 SVI
            dimensions is covered, then let you pick which ones to analyse —
            free where the deck has evidence, credit-gated when you want us
            to speculate on gaps.
          </p>
        </div>
        {credits && (
          <Link
            href="/workspace/billing"
            className="inline-flex items-center gap-2 rounded-lg border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 px-3 py-2 text-xs font-medium text-ink-700 dark:text-ink-300 hover:border-brand-500 hover:text-brand-700 dark:hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-ink-950 transition-colors shrink-0"
            aria-label={`Credit balance ${credits.balance.toFixed(2)} — go to billing`}
          >
            <Wallet className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
            <span className="tabular-nums">{credits.balance.toFixed(2)} cr</span>
            <span className="text-ink-400 dark:text-ink-500">·</span>
            <span className="text-ink-500 dark:text-ink-400">{credits.plan}</span>
          </Link>
        )}
      </header>

      {/* Step 1 — Upload */}
      {step === "upload" && (
        <div className="rounded-xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-6 space-y-4">
          <div>
            <label htmlFor="deck-file" className="text-sm font-semibold text-ink-800 dark:text-ink-100">
              Choose your deck (PDF or DOCX, up to 10 MB)
            </label>
            {/* Drag-and-drop dropzone — clickable to open the file picker,
                keyboard accessible, visual hover + dragover feedback. */}
            <label
              htmlFor="deck-file"
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const dropped = e.dataTransfer.files?.[0];
                if (dropped) setFile(dropped);
              }}
              className={cn(
                "mt-2 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 cursor-pointer transition-colors",
                "focus-within:ring-2 focus-within:ring-brand-500 focus-within:ring-offset-2 focus-within:ring-offset-white dark:focus-within:ring-offset-ink-900",
                isDragging
                  ? "border-brand-500 bg-brand-50 dark:bg-brand-950/30"
                  : "border-ink-300 dark:border-ink-700 hover:border-brand-400 hover:bg-ink-50/40 dark:hover:bg-ink-950/40",
              )}
            >
              <Upload className="h-6 w-6 text-brand-600 dark:text-brand-400" aria-hidden="true" />
              <p className="text-sm font-medium text-ink-700 dark:text-ink-300">
                {file ? (
                  <span className="inline-flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" /> {file.name} · {(file.size / 1024).toFixed(1)} KB
                  </span>
                ) : (
                  "Drop your deck here or click to browse"
                )}
              </p>
              <p className="text-[11px] text-ink-500 dark:text-ink-400">
                PDF or DOCX · max 10 MB · nothing charged at this step
              </p>
              <input
                id="deck-file"
                type="file"
                accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="sr-only"
              />
            </label>
          </div>
          <div className="text-xs text-ink-500 dark:text-ink-400 flex items-center gap-2">
            <span className="h-px flex-1 bg-ink-200 dark:bg-ink-800" />
            <span>or paste raw pitch text</span>
            <span className="h-px flex-1 bg-ink-200 dark:bg-ink-800" />
          </div>
          <textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder="Paste your executive summary, elevator pitch, or a rough combo of team + traction bullets…"
            rows={5}
            className="w-full rounded-md border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-950 px-3 py-2 text-sm text-ink-800 dark:text-ink-100 placeholder:text-ink-400 dark:placeholder:text-ink-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          />
          {error && (
            <p className="text-xs text-red-700 dark:text-red-400" role="alert">
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setPastedText(SAMPLE_PITCH);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 dark:text-brand-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Try a sample deck (paste example text)
            </button>
            <button
              type="button"
              onClick={submitClassify}
              disabled={busy || (!file && pastedText.trim().length < 40)}
              className={cn(
                "inline-flex items-center justify-center min-h-[44px] rounded-lg px-5 text-sm font-semibold text-white transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-ink-900",
                busy || (!file && pastedText.trim().length < 40)
                  ? "bg-brand-300 cursor-not-allowed opacity-70"
                  : "bg-brand-600 hover:bg-brand-700",
              )}
            >
              {busy ? (
                <><Loader2 className="h-4 w-4 motion-safe:animate-spin mr-2" /> Classifying…</>
              ) : (
                <><Upload className="h-4 w-4 mr-2" /> Classify coverage</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 2 — Coverage & selection */}
      {step === "coverage" && (
        <div className="rounded-xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-6 space-y-5">
          <div className="flex items-center justify-end gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setSelected(new Set(Object.keys(coverage)))}
              className="text-[11px] font-medium text-brand-700 dark:text-brand-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-1"
            >
              Select all 8
            </button>
            <span className="text-ink-300 dark:text-ink-700">·</span>
            <button
              type="button"
              onClick={() => {
                const freeOnly = new Set<string>();
                for (const [k, v] of Object.entries(coverage)) {
                  if (v.level !== "missing") freeOnly.add(k);
                }
                setSelected(freeOnly);
              }}
              className="text-[11px] font-medium text-brand-700 dark:text-brand-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-1"
            >
              Free only
            </button>
            <span className="text-ink-300 dark:text-ink-700">·</span>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-[11px] font-medium text-ink-600 dark:text-ink-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-1"
            >
              Clear
            </button>
          </div>
          <PitchdeckCoverageGrid
            coverage={coverage}
            selected={selected}
            onToggle={toggleDim}
            speculativeCostPerDim={SPECULATIVE_COST}
          />
          {/* Insufficient-credits panel — replaces the generic error banner
              when the user hits the 402 gate, offering a direct path to Billing. */}
          {insufficient && (
            <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-4 flex items-start justify-between gap-3 flex-wrap">
              <div className="text-xs text-amber-900 dark:text-amber-200 space-y-1">
                <p className="font-semibold">
                  Not enough credits — need <span className="tabular-nums">{insufficient.required.toFixed(2)}</span>,
                  you have <span className="tabular-nums">{insufficient.balance.toFixed(2)}</span>
                </p>
                <p>
                  Top up in Billing, or drop the speculative dims from your selection to run only the free ones.
                </p>
              </div>
              <Link
                href="/workspace/billing"
                className="inline-flex items-center justify-center min-h-[44px] rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-50 transition-colors shrink-0"
              >
                Top up credits <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Link>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 flex-wrap pt-1 border-t border-ink-200 dark:border-ink-800">
            <div className="text-xs text-ink-600 dark:text-ink-400">
              <strong className="tabular-nums text-sm text-ink-800 dark:text-ink-100">{selected.size}</strong>
              {" "}of 8 dimensions selected · speculative cost{" "}
              <strong className={cn(
                "tabular-nums text-sm",
                credits && speculativeCost > credits.balance
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-brand-700 dark:text-brand-300",
              )}>
                {speculativeCost.toFixed(2)} cr
              </strong>
              {credits && (
                <span className="ml-2 text-ink-500 dark:text-ink-400">
                  (balance {credits.balance.toFixed(2)} cr)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep("upload")}
                className="inline-flex items-center justify-center min-h-[44px] rounded-md px-4 text-xs font-medium text-ink-600 dark:text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-ink-900 transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={submitAnalyze}
                disabled={busy || selected.size === 0}
                className={cn(
                  "inline-flex items-center justify-center min-h-[44px] rounded-lg px-5 text-sm font-semibold text-white transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-ink-900",
                  busy || selected.size === 0
                    ? "bg-brand-300 cursor-not-allowed opacity-70"
                    : "bg-brand-600 hover:bg-brand-700",
                )}
              >
                {busy ? (
                  <><Loader2 className="h-4 w-4 motion-safe:animate-spin mr-2" /> Reserving…</>
                ) : (
                  <>Analyse {selected.size} dimension{selected.size === 1 ? "" : "s"} <ArrowRight className="h-4 w-4 ml-2" /></>
                )}
              </button>
            </div>
          </div>
          {error && (
            <p className="text-xs text-red-700 dark:text-red-400" role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      {/* Step 3 — Streaming analysis */}
      {step === "analyze" && analyzeDims && pitchdeckId && (
        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 px-4 py-2.5 text-xs text-emerald-800 dark:text-emerald-300">
            Credits reserved. Streaming analysis for {analyzeDims.length} dimension{analyzeDims.length === 1 ? "" : "s"} below —
            each result appears as the model finishes.
          </div>
          {/*
            SviStreamAnalysis already handles the per-dim card grid,
            progress bar, retry, cohort compare, done-state, and
            score-delta. We reuse it verbatim — projectId keeps the
            snapshot linkage intact, dims filter narrows the SSE run to
            what the founder picked in step 2, and deckText hands the
            extracted pitch to each dim's prompt as context.
          */}
          <SviStreamAnalysis
            projectId={projectId}
            initialDims={analyzeDims}
            initialDeckText={undefined}
            autoStart
          />
        </div>
      )}
    </div>
  );
}
