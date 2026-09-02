"use client";

import { useCallback, useMemo, useState } from "react";
import { Upload, FileText, ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PitchdeckCoverageGrid,
  type CoverageMap,
} from "@/components/svi/pitchdeck-coverage-grid";
import { SviStreamAnalysis } from "@/components/svi/svi-stream-analysis";

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
  const [pitchdeckId, setPitchdeckId] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<CoverageMap>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Kept for the streaming analyzer once step === "analyze".
  const [analyzeDims, setAnalyzeDims] = useState<string[] | null>(null);

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
          setError(
            `Not enough credits: need ${body.required?.toFixed(2)}, have ${body.balance?.toFixed(2)}. Top up in Billing.`,
          );
        } else {
          setError(body.error ?? "analyze_failed");
        }
        return;
      }
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
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-100">
          Pitchdeck Analysis
        </h1>
        <p className="text-sm text-ink-600 dark:text-ink-400 max-w-3xl">
          Upload your deck. We&rsquo;ll classify how well each of the 8 SVI
          dimensions is covered, then let you pick which ones to analyse —
          free where the deck has evidence, credit-gated when you want us
          to speculate on gaps.
        </p>
      </header>

      {/* Step 1 — Upload */}
      {step === "upload" && (
        <div className="rounded-xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-6 space-y-4">
          <div>
            <label htmlFor="deck-file" className="text-sm font-semibold text-ink-800 dark:text-ink-100">
              Choose your deck (PDF or DOCX, up to 10 MB)
            </label>
            <div className="mt-2 flex items-center gap-3">
              <input
                id="deck-file"
                type="file"
                accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-white file:font-semibold file:cursor-pointer hover:file:bg-brand-700 text-ink-700 dark:text-ink-300"
              />
              {file && (
                <span className="text-xs text-ink-500 dark:text-ink-400 inline-flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5" /> {file.name} · {(file.size / 1024).toFixed(1)} KB
                </span>
              )}
            </div>
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
          <div className="flex items-center justify-end">
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
          <PitchdeckCoverageGrid
            coverage={coverage}
            selected={selected}
            onToggle={toggleDim}
            speculativeCostPerDim={SPECULATIVE_COST}
          />
          <div className="flex items-center justify-between gap-3 flex-wrap pt-1 border-t border-ink-200 dark:border-ink-800">
            <div className="text-xs text-ink-600 dark:text-ink-400">
              <strong className="tabular-nums text-sm text-ink-800 dark:text-ink-100">{selected.size}</strong>
              {" "}of 8 dimensions selected · speculative cost{" "}
              <strong className="tabular-nums text-sm text-brand-700 dark:text-brand-300">
                {speculativeCost.toFixed(2)} cr
              </strong>
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
