"use client";

import * as React from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Download,
  FileSignature,
  Info,
  Loader2,
  MessageCircleQuestion,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
  XCircle,
  Zap,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, formatAud, formatNumber, formatPercent } from "@/lib/utils";
import {
  type CapTableDiff,
  type Holder,
  type Round,
  type ShareClass,
} from "@/lib/cap-table";
import type { TermSheetAnalysis } from "@/lib/term-sheet/schema";
import { DEMO_TERM_SHEET } from "@/lib/term-sheet/demo";

const MAX_CHARS = 30_000;

const DEFAULT_ROUND: Round = {
  preMoneyAud: 8_000_000,
  raiseAud: 2_000_000,
  esopTopUpPct: 12,
  esopTimingPreMoney: true,
  leadInvestorName: "Lead VC",
};

const SHARE_CLASS_OPTIONS: { value: ShareClass; label: string }[] = [
  { value: "common", label: "Common" },
  { value: "preferred", label: "Preferred" },
  { value: "esop", label: "ESOP" },
  { value: "safe", label: "SAFE" },
];

const COLOR = {
  founder: "#3B7DD8",
  esop: "#5B9AEB",
  existing: "#94A3B8",
  newInvestor: "#F59E0B",
} as const;

type RowKind = "founder" | "esop" | "existing" | "newInvestor";

function rowColor(kind: RowKind): string {
  return COLOR[kind];
}

function classifyAfter(holder: {
  isFounder?: boolean;
  isEsop?: boolean;
  isNewInvestor?: boolean;
}): RowKind {
  if (holder.isNewInvestor) return "newInvestor";
  if (holder.isEsop) return "esop";
  if (holder.isFounder) return "founder";
  return "existing";
}

function classifyHolder(h: Holder): RowKind {
  if (h.isFounder) return "founder";
  if (h.shareClass === "esop") return "esop";
  return "existing";
}

function genId(): string {
  return `h-${Math.random().toString(36).slice(2, 9)}`;
}

function defaultMiniCapTable(): Holder[] {
  return [
    {
      id: "founder-1",
      name: "Founder A",
      shares: 5_000_000,
      shareClass: "common",
      isFounder: true,
    },
    {
      id: "founder-2",
      name: "Founder B",
      shares: 3_000_000,
      shareClass: "common",
      isFounder: true,
    },
    {
      id: "esop",
      name: "ESOP pool",
      shares: 800_000,
      shareClass: "esop",
    },
  ];
}

interface ApiResponse {
  ok: boolean;
  mode?: "live" | "demo";
  analysis?: TermSheetAnalysis;
  dilution?: CapTableDiff | null;
  error?: string;
  analysis_id?: string | null;
  balance?: number;
  creditsUsed?: number;
}

export function TermSheetTool() {
  const [termSheet, setTermSheet] = React.useState("");
  const [includeCapTable, setIncludeCapTable] = React.useState(false);
  const [holders, setHolders] = React.useState<Holder[]>(() =>
    defaultMiniCapTable(),
  );
  const [round, setRound] = React.useState<Round>(DEFAULT_ROUND);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ApiResponse | null>(null);
  const [activeTab, setActiveTab] = React.useState("summary");
  const [email, setEmail] = React.useState("");
  const [submitState, setSubmitState] = React.useState<
    "idle" | "submitting" | "ok" | "err"
  >("idle");
  const resultRef = React.useRef<HTMLDivElement | null>(null);

  const charCount = termSheet.length;
  const overLimit = charCount > MAX_CHARS;
  const tooShort = charCount > 0 && charCount < 100;

  const onLoadDemo = () => {
    setTermSheet(DEMO_TERM_SHEET);
    setError(null);
  };

  const updateHolder = (id: string, patch: Partial<Holder>) =>
    setHolders((prev) =>
      prev.map((h) => (h.id === id ? { ...h, ...patch } : h)),
    );

  const removeHolder = (id: string) =>
    setHolders((prev) => prev.filter((h) => h.id !== id));

  const addHolder = () =>
    setHolders((prev) => [
      ...prev,
      {
        id: genId(),
        name: "New holder",
        shares: 500_000,
        shareClass: "common",
      },
    ]);

  const updateRound = <K extends keyof Round>(key: K, value: Round[K]) =>
    setRound((p) => ({ ...p, [key]: value }));

  const onAnalyze = async () => {
    if (loading) return;
    if (charCount < 100) {
      setError("Term sheet is too short — paste at least 100 characters.");
      return;
    }
    if (overLimit) {
      setError("Term sheet is too long — paste up to 30,000 characters.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body: {
        termSheet: string;
        capTable?: Holder[];
        round?: Round;
      } = { termSheet };
      if (includeCapTable) {
        body.capTable = holders;
        body.round = round;
      }
      const res = await fetch("/api/term-sheet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as ApiResponse;
      if (!res.ok || !json.ok || !json.analysis) {
        throw new Error(json.error || "Analysis failed");
      }
      setResult(json);
      setActiveTab("summary");
      // Smooth scroll to result section after the next paint.
      window.requestAnimationFrame(() => {
        resultRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Analysis failed — please try again.";
      // Don't expose stack traces.
      const safe =
        msg.length > 140
          ? "Analysis failed — please try again or paste a shorter term sheet."
          : msg;
      setError(safe);
    } finally {
      setLoading(false);
    }
  };

  const onLeadSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email || submitState === "submitting" || !result?.analysis) return;
    setSubmitState("submitting");
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "term_sheet_ai",
          email,
          payload: {
            mode: result.mode,
            instrumentType: result.analysis.instrumentType,
            redlineCount: result.analysis.redline.length,
            criticalCount: result.analysis.redline.filter(
              (r) => r.severity === "critical",
            ).length,
            redactedSnippet: termSheet.slice(0, 200),
          },
        }),
      });
      if (!res.ok) throw new Error("Network error");
      setSubmitState("ok");
    } catch {
      setSubmitState("err");
    }
  };

  return (
    <div className="space-y-8">
      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-300"
        >
          <p className="flex items-start gap-2">
            <XCircle
              strokeWidth={1.75}
              className="h-4 w-4 mt-0.5 shrink-0"
              aria-hidden
            />
            <span>{error}</span>
          </p>
        </div>
      )}

      {/* TOP — input + analyze button */}
      <div className="grid lg:grid-cols-12 gap-6 lg:gap-8">
        <section
          aria-labelledby="ts-input"
          className="lg:col-span-7 rounded-2xl border border-surface-200 bg-white p-6 md:p-8"
        >
          <div className="flex items-center justify-between gap-3">
            <h2
              id="ts-input"
              className="text-lg font-semibold text-ink-800 flex items-center gap-2"
            >
              <ClipboardPaste
                strokeWidth={1.75}
                className="h-5 w-5 text-brand-600"
                aria-hidden
              />
              Paste term sheet
            </h2>
            <button
              type="button"
              onClick={onLoadDemo}
              className="inline-flex items-center gap-1.5 rounded-md border border-surface-200 bg-surface-100/60 px-2.5 py-1.5 text-xs font-medium text-ink-500 hover:border-brand-500/40 hover:text-ink-800 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
            >
              <Sparkles
                strokeWidth={1.75}
                className="h-3.5 w-3.5"
                aria-hidden
              />
              Load demo term sheet
            </button>
          </div>

          <div className="mt-5">
            <Label htmlFor="ts-textarea" className="sr-only">
              Term sheet text
            </Label>
            <textarea
              id="ts-textarea"
              value={termSheet}
              onChange={(e) => setTermSheet(e.target.value)}
              placeholder={`Paste any SAFE, convertible note, or priced-round term sheet — for example:\n\n"BLOCKID INC. — SAFE — Investor amount: AUD $500,000. Valuation cap: $5M post-money. Discount: 20%. MFN: 24 month expiry. Pro-rata: yes. Board: no seat. Liquidation preference: 1x non-participating..."`}
              rows={14}
              className="w-full rounded-[10px] border border-surface-200 bg-surface-50/40 px-4 py-3 text-sm text-ink-800 placeholder:text-ink-8000 transition-colors duration-200 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 font-mono leading-relaxed"
              aria-invalid={overLimit || tooShort}
            />
            <div className="mt-2 flex items-center justify-between text-xs">
              <span
                className={cn(
                  "font-mono tabular-nums",
                  overLimit
                    ? "text-red-400"
                    : tooShort
                      ? "text-amber-300"
                      : "text-ink-8000",
                )}
              >
                {formatNumber(charCount)} / {formatNumber(MAX_CHARS)}
              </span>
              {tooShort && !overLimit && (
                <span className="text-amber-300">
                  Paste at least 100 characters.
                </span>
              )}
              {overLimit && (
                <span className="text-red-400">Trim to 30,000 characters.</span>
              )}
            </div>
          </div>

          {/* Cap-table toggle + mini editor */}
          <div className="mt-6 rounded-xl border border-surface-200 bg-surface-100/40 p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeCapTable}
                onChange={(e) => setIncludeCapTable(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-surface-200 bg-white text-brand-500 focus:ring-brand-500/30 cursor-pointer"
              />
              <span className="flex-1">
                <span className="text-sm font-medium text-ink-800">
                  Also model dilution against my cap table
                </span>
                <span className="block text-xs text-ink-400 mt-0.5">
                  Optional — adds a Dilution tab to the result with a live
                  before/after diff.
                </span>
              </span>
            </label>

            {includeCapTable && (
              <div className="mt-4 space-y-3">
                {holders.map((h) => (
                  <MiniHolderRow
                    key={h.id}
                    holder={h}
                    onChange={(patch) => updateHolder(h.id, patch)}
                    onRemove={() => removeHolder(h.id)}
                    canRemove={holders.length > 1}
                  />
                ))}
                <button
                  type="button"
                  onClick={addHolder}
                  className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-surface-200 bg-transparent px-3 py-2 text-xs font-medium text-ink-500 hover:border-brand-500/40 hover:text-ink-800 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
                >
                  <Plus strokeWidth={1.75} className="h-3.5 w-3.5" />
                  Add holder
                </button>

                <div className="mt-4 grid sm:grid-cols-2 gap-4">
                  <Field label="Pre-money (AUD)" htmlFor="ts-pre">
                    <Input
                      id="ts-pre"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={100000}
                      value={round.preMoneyAud}
                      onChange={(e) =>
                        updateRound("preMoneyAud", Number(e.target.value) || 0)
                      }
                      className="font-mono tabular-nums h-9 text-sm"
                    />
                  </Field>
                  <Field label="Raise (AUD)" htmlFor="ts-raise">
                    <Input
                      id="ts-raise"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={50000}
                      value={round.raiseAud}
                      onChange={(e) =>
                        updateRound("raiseAud", Number(e.target.value) || 0)
                      }
                      className="font-mono tabular-nums h-9 text-sm"
                    />
                  </Field>
                  <Field label="ESOP post-money (%)" htmlFor="ts-esop">
                    <Input
                      id="ts-esop"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={40}
                      step={0.5}
                      value={round.esopTopUpPct}
                      onChange={(e) =>
                        updateRound("esopTopUpPct", Number(e.target.value) || 0)
                      }
                      className="font-mono tabular-nums h-9 text-sm"
                    />
                  </Field>
                  <Field label="Lead investor name" htmlFor="ts-lead">
                    <Input
                      id="ts-lead"
                      type="text"
                      value={round.leadInvestorName}
                      onChange={(e) =>
                        updateRound("leadInvestorName", e.target.value)
                      }
                      placeholder="Lead VC"
                      className="h-9 text-sm"
                    />
                  </Field>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* RIGHT — analyze CTA */}
        <section className="lg:col-span-5 rounded-2xl border border-surface-200 bg-white p-6 md:p-8 flex flex-col">
          <h2 className="text-lg font-semibold text-ink-800 flex items-center gap-2">
            <FileSignature
              strokeWidth={1.75}
              className="h-5 w-5 text-brand-600"
              aria-hidden
            />
            Analyse
          </h2>
          <p className="mt-3 text-sm text-ink-400 leading-relaxed">
            Get a plain-English summary, severity-ranked redline, AU-market
            comparison, and (optionally) a live dilution simulation against
            your cap table.
          </p>

          <div className="mt-6">
            <Button
              type="button"
              variant="primary"
              size="lg"
              disabled={loading || charCount < 100 || overLimit}
              onClick={onAnalyze}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2
                    strokeWidth={1.75}
                    className="h-4 w-4 animate-spin"
                    aria-hidden
                  />
                  Analysing against AU market data…
                </>
              ) : (
                <>
                  Analyse term sheet
                  <ArrowRight strokeWidth={1.75} className="h-5 w-5" aria-hidden />
                </>
              )}
            </Button>
            <p className="mt-3 text-xs text-ink-8000">
              Powered by Claude Sonnet 4.6 · Analysis takes ~15s
            </p>
          </div>

          {result && (
            <div className="mt-6">
              <ModePill mode={result.mode ?? "demo"} />
            </div>
          )}

          <div className="mt-auto pt-6 text-xs text-ink-8000 leading-relaxed">
            We don&apos;t store your pasted term sheet beyond the analysis
            call. The instrument type, redline count, and a 200-character
            redacted snippet are sent only if you opt in via the email capture
            below.
          </div>
        </section>
      </div>

      {/* RESULT */}
      {result?.analysis && (
        <div ref={resultRef}>
          <ResultPanel
            analysis={result.analysis}
            dilution={result.dilution ?? null}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            analysisId={result.analysis_id ?? null}
          />

          {/* Email capture row */}
          <form
            onSubmit={onLeadSubmit}
            className="mt-8 rounded-2xl border border-brand-500/30 bg-white p-6 md:p-8"
            noValidate
          >
            <div className="grid lg:grid-cols-2 gap-8 items-center">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-gold-600 font-medium">
                  Save this analysis
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-ink-800">
                  Want this baked into your Investor-Ready Score?
                </h3>
                <p className="mt-2 text-sm text-ink-400">
                  We&apos;ll email a magic link so you can re-open this redline
                  with your verified score and AU sector comps attached.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <Label htmlFor="ts-email">Work email</Label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Input
                    id="ts-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="founder@yourstartup.com.au"
                    className="flex-1"
                    aria-invalid={submitState === "err"}
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={submitState === "submitting"}
                  >
                    {submitState === "ok"
                      ? "Sent"
                      : submitState === "submitting"
                        ? "Sending…"
                        : "Get my Score"}
                    {submitState === "ok" ? (
                      <CheckCircle2 strokeWidth={1.75} className="h-5 w-5" />
                    ) : (
                      <ArrowRight strokeWidth={1.75} className="h-5 w-5" />
                    )}
                  </Button>
                </div>
                {submitState === "err" && (
                  <p
                    role="alert"
                    aria-live="assertive"
                    className="text-sm text-amber-300"
                  >
                    Couldn&apos;t send right now. Try again.
                  </p>
                )}
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

/* -------------------------------- subcomponents ------------------------------ */

function ModePill({ mode }: { mode: "live" | "demo" }) {
  if (mode === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-500/40 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-600">
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-brand-400"
        />
        Live analysis
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-surface-200 bg-surface-100 px-3 py-1 text-xs font-medium text-ink-400">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-slate-500" />
      Demo mode (set ANTHROPIC_API_KEY)
    </span>
  );
}

function ResultPanel({
  analysis,
  dilution,
  activeTab,
  onTabChange,
  analysisId,
}: {
  analysis: TermSheetAnalysis;
  dilution: CapTableDiff | null;
  activeTab: string;
  onTabChange: (v: string) => void;
  analysisId: string | null;
}) {
  const handleExportJson = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      analysis_id: analysisId,
      analysis,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `blockid-term-sheet-analysis-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section
      aria-labelledby="ts-result"
      className="rounded-2xl border border-surface-200 bg-white p-6 md:p-8"
    >
      {analysisId && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-emerald-800">
            <CheckCircle2 strokeWidth={1.75} className="h-4 w-4" aria-hidden />
            <span>
              <strong className="font-semibold">Saved to your library.</strong>{" "}
              Analysis ID <code className="font-mono text-xs">{analysisId.slice(0, 8)}</code> — re-open anytime from your dashboard.
            </span>
          </div>
          <a
            href="/dashboard"
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
          >
            View my SVI score
            <ArrowRight strokeWidth={1.75} className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <h2
          id="ts-result"
          className="text-lg font-semibold text-ink-800 flex items-center gap-2"
        >
          <Sparkles
            strokeWidth={1.75}
            className="h-5 w-5 text-brand-600"
            aria-hidden
          />
          Analysis
        </h2>
        <button
          type="button"
          onClick={handleExportJson}
          className="inline-flex items-center gap-1.5 rounded-md border border-surface-200 bg-surface-100/60 px-2.5 py-1.5 text-xs font-medium text-ink-500 hover:border-brand-500/40 hover:text-ink-800 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
          title="Download full analysis as JSON"
        >
          <Download strokeWidth={1.75} className="h-3.5 w-3.5" aria-hidden />
          Export JSON
        </button>
      </div>
      <Tabs value={activeTab} onValueChange={onTabChange} defaultValue="summary">
        <div className="mt-5 overflow-x-auto">
          <TabsList>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="redline">
              Redline ({analysis.redline.length})
            </TabsTrigger>
            <TabsTrigger value="comparison">AU comparison</TabsTrigger>
            <TabsTrigger value="lawyer">Lawyer Q&amp;A</TabsTrigger>
            <TabsTrigger value="actions">Actions</TabsTrigger>
            {dilution && <TabsTrigger value="dilution">Dilution</TabsTrigger>}
          </TabsList>
        </div>

        <TabsContent value="summary">
          <SummaryTab analysis={analysis} />
        </TabsContent>
        <TabsContent value="redline">
          <RedlineTab analysis={analysis} />
        </TabsContent>
        <TabsContent value="comparison">
          <ComparisonTab analysis={analysis} />
        </TabsContent>
        <TabsContent value="lawyer">
          <LawyerQuestionsTab analysis={analysis} />
        </TabsContent>
        <TabsContent value="actions">
          <FounderActionsTab analysis={analysis} />
        </TabsContent>
        {dilution && (
          <TabsContent value="dilution">
            <DilutionTab diff={dilution} />
          </TabsContent>
        )}
      </Tabs>
    </section>
  );
}

function SummaryTab({ analysis }: { analysis: TermSheetAnalysis }) {
  const k = analysis.keyTerms;
  const pairs: Array<[string, string]> = [
    ["Investor amount", k.investorAmountAud != null ? formatAud(k.investorAmountAud) : "—"],
    ["Valuation cap", k.valuationCapAud != null ? formatAud(k.valuationCapAud) : "—"],
    ["Discount", k.discountPct != null ? `${k.discountPct.toFixed(1)}%` : "—"],
    ["Pre-money", k.preMoneyAud != null ? formatAud(k.preMoneyAud) : "—"],
    ["Post-money", k.postMoneyAud != null ? formatAud(k.postMoneyAud) : "—"],
    ["Option pool (post)", k.optionPoolPostMoneyPct != null ? `${k.optionPoolPostMoneyPct.toFixed(1)}%` : "—"],
    ["Investor board seats", k.boardSeatsToInvestor != null ? String(k.boardSeatsToInvestor) : "—"],
    ["Liquidation preference", k.liquidationPreference ?? "—"],
    ["Pro-rata rights", k.proRataRights == null ? "—" : k.proRataRights ? "Yes" : "No"],
    ["Lead investor", k.leadInvestorName ?? "—"],
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-600">
          {analysis.instrumentType}
        </span>
      </div>

      <div className="rounded-xl border border-surface-200 bg-surface-100/40 p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-ink-8000">
          Key terms
        </p>
        <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          {pairs.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-3 border-b border-surface-200/60 pb-2 last:border-b-0 sm:last:border-b sm:[&:nth-last-child(-n+2)]:border-b-0">
              <dt className="text-xs text-ink-400">{label}</dt>
              <dd className="font-mono tabular-nums text-sm text-ink-800 text-right">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="rounded-xl border border-brand-500/30 bg-surface-100/40 p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-gold-600 font-medium flex items-center gap-2">
          <Sparkles strokeWidth={1.75} className="h-3.5 w-3.5" aria-hidden />
          Plain English
        </p>
        <p className="mt-3 text-sm md:text-base leading-relaxed text-ink-500">
          {analysis.plainEnglishSummary}
        </p>
      </div>

      {analysis.riskFlags.length > 0 && (
        <div className="rounded-xl border border-surface-200 bg-surface-100/40 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-ink-8000 flex items-center gap-2">
            <TriangleAlert
              strokeWidth={1.75}
              className="h-3.5 w-3.5 text-amber-400"
              aria-hidden
            />
            Risk flags
          </p>
          <ul className="mt-4 space-y-3">
            {analysis.riskFlags.map((r) => (
              <li
                key={r.flag}
                className="rounded-lg border border-surface-200 bg-white p-3"
              >
                <p className="text-sm font-medium text-ink-800">{r.flag}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-400">
                  {r.why}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RedlineTab({ analysis }: { analysis: TermSheetAnalysis }) {
  if (analysis.redline.length === 0) {
    return (
      <p className="text-sm text-ink-400">
        No redline items — the term sheet looks clean against AU market norms.
      </p>
    );
  }
  return (
    <ul className="space-y-4">
      {analysis.redline.map((r, i) => (
        <RedlineCard key={`${r.clause}-${i}`} item={r} />
      ))}
    </ul>
  );
}

/** Color-coded confidence badge: green ≥0.8, yellow ≥0.5, red <0.5 */
function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const cls =
    value >= 0.8
      ? "border-green-500/40 bg-green-500/10 text-green-600"
      : value >= 0.5
        ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
        : "border-red-500/40 bg-red-500/10 text-red-400";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono tabular-nums",
        cls,
      )}
      title={`Clause confidence: ${pct}%`}
    >
      {pct}%
    </span>
  );
}

type RedlineRiskLevel = "low" | "medium" | "high" | "critical";

/** Per-clause risk level badge */
function RiskLevelBadge({ level }: { level: RedlineRiskLevel }) {
  const map: Record<RedlineRiskLevel, { cls: string; label: string }> = {
    low: { cls: "border-slate-400/40 bg-slate-400/10 text-slate-500", label: "Low risk" },
    medium: { cls: "border-amber-400/40 bg-amber-400/10 text-amber-400", label: "Medium risk" },
    high: { cls: "border-orange-500/40 bg-orange-500/10 text-orange-500", label: "High risk" },
    critical: { cls: "border-red-500/40 bg-red-500/10 text-red-400", label: "Critical" },
  };
  const { cls, label } = map[level] ?? map.low;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        cls,
      )}
    >
      {label}
    </span>
  );
}

function RedlineCard({
  item,
}: {
  item: TermSheetAnalysis["redline"][number];
}) {
  const tone = {
    info: {
      border: "border-slate-500/40",
      bg: "bg-surface-100/40",
      pill: "border-slate-500/40 bg-slate-500/10 text-ink-500",
      icon: Info,
      iconColor: "text-ink-500",
      label: "Info",
    },
    warning: {
      border: "border-amber-500/40",
      bg: "bg-amber-500/5",
      pill: "border-amber-500/40 bg-amber-500/10 text-amber-300",
      icon: TriangleAlert,
      iconColor: "text-amber-300",
      label: "Warning",
    },
    critical: {
      border: "border-red-500/40",
      bg: "bg-red-500/5",
      pill: "border-red-500/40 bg-red-500/10 text-red-300",
      icon: XCircle,
      iconColor: "text-red-300",
      label: "Critical",
    },
  }[item.severity];
  const Icon = tone.icon;
  return (
    <li
      className={cn(
        "rounded-xl border p-5 space-y-3",
        tone.border,
        tone.bg,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-ink-800 flex items-center gap-2">
          <Icon
            strokeWidth={1.75}
            className={cn("h-4 w-4 shrink-0", tone.iconColor)}
            aria-hidden
          />
          {item.clause}
        </h3>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {item.risk_level != null && (
            <RiskLevelBadge level={item.risk_level as RedlineRiskLevel} />
          )}
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider",
              tone.pill,
            )}
          >
            {tone.label}
          </span>
          {item.clause_confidence != null && (
            <ConfidenceBadge value={item.clause_confidence} />
          )}
        </div>
      </div>
      <p className="text-sm leading-relaxed text-ink-500">{item.issue}</p>
      <blockquote className="rounded-lg border-l-2 border-brand-500/60 bg-white px-4 py-3 text-sm leading-relaxed text-ink-500">
        <p className="text-[11px] uppercase tracking-[0.18em] text-gold-600 font-medium">
          Suggested revision
        </p>
        <p className="mt-1.5">{item.suggestedRevision}</p>
      </blockquote>
    </li>
  );
}

function LawyerQuestionsTab({ analysis }: { analysis: TermSheetAnalysis }) {
  const [open, setOpen] = React.useState(true);
  const questions = analysis.lawyer_questions ?? [];

  if (questions.length === 0) {
    return (
      <p className="text-sm text-ink-400">
        No lawyer questions generated for this analysis.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-surface-200 bg-surface-100/40 overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-surface-100/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 cursor-pointer"
          aria-expanded={open}
        >
          <span className="flex items-center gap-2 text-sm font-medium text-ink-800">
            <MessageCircleQuestion
              strokeWidth={1.75}
              className="h-4 w-4 text-brand-600 shrink-0"
              aria-hidden
            />
            Questions your lawyer will ask ({questions.length})
          </span>
          {open ? (
            <ChevronUp strokeWidth={1.75} className="h-4 w-4 text-ink-400 shrink-0" aria-hidden />
          ) : (
            <ChevronDown strokeWidth={1.75} className="h-4 w-4 text-ink-400 shrink-0" aria-hidden />
          )}
        </button>
        {open && (
          <ul className="divide-y divide-surface-200/70 border-t border-surface-200">
            {questions.map((q, i) => (
              <li key={i} className="flex items-start gap-3 px-5 py-4">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-brand-500/30 bg-brand-500/10 text-[10px] font-semibold text-brand-600">
                  {i + 1}
                </span>
                <p className="text-sm leading-relaxed text-ink-500">{q}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs leading-relaxed text-ink-8000">
        These questions surface material ambiguities in your term sheet. Prepare answers before your first lawyer consultation to save billable time.
      </p>
    </div>
  );
}

function FounderActionsTab({ analysis }: { analysis: TermSheetAnalysis }) {
  const [checked, setChecked] = React.useState<Record<number, boolean>>({});
  const actions = analysis.founder_actions ?? [];

  if (actions.length === 0) {
    return (
      <p className="text-sm text-ink-400">
        No founder actions generated for this analysis.
      </p>
    );
  }

  const toggleChecked = (i: number) =>
    setChecked((prev) => ({ ...prev, [i]: !prev[i] }));

  const doneCount = Object.values(checked).filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap strokeWidth={1.75} className="h-4 w-4 text-gold-600" aria-hidden />
          <p className="text-xs uppercase tracking-[0.2em] text-gold-600 font-medium">
            Immediate actions ({doneCount}/{actions.length} done)
          </p>
        </div>
      </div>

      <ul className="space-y-3">
        {actions.map((action, i) => (
          <li key={i}>
            <label
              className={cn(
                "flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors",
                checked[i]
                  ? "border-green-500/30 bg-green-500/5"
                  : "border-surface-200 bg-surface-100/40 hover:border-brand-500/30 hover:bg-brand-500/5",
              )}
            >
              <input
                type="checkbox"
                checked={!!checked[i]}
                onChange={() => toggleChecked(i)}
                className="mt-0.5 h-4 w-4 rounded border-surface-200 bg-white text-brand-500 focus:ring-brand-500/30 cursor-pointer shrink-0"
              />
              <span
                className={cn(
                  "text-sm leading-relaxed",
                  checked[i] ? "line-through text-ink-400" : "text-ink-500",
                )}
              >
                <span className="font-mono tabular-nums text-[11px] text-ink-8000 mr-2">
                  #{i + 1}
                </span>
                {action}
              </span>
            </label>
          </li>
        ))}
      </ul>

      {doneCount === actions.length && actions.length > 0 && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 flex items-center gap-3">
          <CheckCircle2 strokeWidth={1.75} className="h-5 w-5 text-green-500 shrink-0" aria-hidden />
          <p className="text-sm text-ink-500">
            All actions checked — you&apos;re ready to engage your lawyer for final review.
          </p>
        </div>
      )}

      <p className="text-xs leading-relaxed text-ink-8000">
        Ordered by urgency. Tick each action as you complete it. This checklist is not saved — export the JSON if you want a record.
      </p>
    </div>
  );
}

function ComparisonTab({ analysis }: { analysis: TermSheetAnalysis }) {
  return (
    <div className="space-y-6">
      <p className="text-sm md:text-base leading-relaxed text-ink-500">
        {analysis.auMarketComparison.summary}
      </p>
      <div className="rounded-xl border border-surface-200 bg-surface-100/40 p-4 md:p-5 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.15em] text-ink-8000">
              <th className="py-2 pr-3 font-medium">Term</th>
              <th className="py-2 px-3 font-medium">Your term</th>
              <th className="py-2 px-3 font-medium">AU norm</th>
              <th className="py-2 pl-3 font-medium text-right">Verdict</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-200/70">
            {analysis.auMarketComparison.deviations.map((d, i) => {
              const verdictTone = {
                founder_friendly: {
                  pill: "border-brand-500/40 bg-brand-500/10 text-brand-600",
                  label: "Founder-friendly",
                },
                neutral: {
                  pill: "border-slate-500/40 bg-slate-500/10 text-ink-500",
                  label: "Neutral",
                },
                investor_friendly: {
                  pill: "border-amber-500/40 bg-amber-500/10 text-amber-300",
                  label: "Investor-friendly",
                },
              }[d.verdict];
              return (
                <tr key={`${d.term}-${i}`}>
                  <td className="py-3 pr-3 font-medium text-ink-800">
                    {d.term}
                  </td>
                  <td className="py-3 px-3 text-ink-500">{d.yourTerm}</td>
                  <td className="py-3 px-3 text-ink-400">{d.auMarketNorm}</td>
                  <td className="py-3 pl-3 text-right">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                        verdictTone.pill,
                      )}
                    >
                      {verdictTone.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DilutionTab({ diff }: { diff: CapTableDiff }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryTile
          label="Post-money"
          value={formatAud(diff.pricing.postMoneyAud)}
        />
        <SummaryTile
          label="New share price"
          value={
            diff.pricing.newSharePriceAud > 0
              ? `$${diff.pricing.newSharePriceAud.toFixed(4)}`
              : "—"
          }
        />
        <SummaryTile
          label="Founder %"
          value={formatPercent(diff.summary.foundersAfterPct)}
          tone="brand"
        />
        <SummaryTile
          label="ESOP %"
          value={formatPercent(diff.summary.esopAfterPct)}
          tone="brand-soft"
        />
      </div>

      <div className="rounded-xl border border-surface-200 bg-surface-100/40 p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-ink-8000">
          Ownership — before vs. after
        </p>
        <div className="mt-4 space-y-5">
          <StackedBar
            label="Before"
            segments={diff.before.holders.map((h) => ({
              key: h.id,
              name: h.name,
              pct: (h.shares / Math.max(1, diff.before.totalShares)) * 100,
              kind: classifyHolder(h),
            }))}
          />
          <StackedBar
            label="After"
            segments={diff.rows.map((r) => ({
              key: `${r.name}-after`,
              name: r.name,
              pct: r.pctAfter,
              kind: classifyAfter(r),
            }))}
          />
        </div>
        <Legend />
      </div>

      <div className="rounded-xl border border-surface-200 bg-surface-100/40 p-4 md:p-5 overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.15em] text-ink-8000">
              <th className="py-2 pr-3 font-medium">Holder</th>
              <th className="py-2 px-3 font-medium text-right">% before</th>
              <th className="py-2 px-3 font-medium text-right">% after</th>
              <th className="py-2 pl-3 font-medium text-right">Δ%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-200/70">
            {diff.rows.map((r) => {
              const deltaTone =
                r.deltaPct < -1
                  ? "text-red-400"
                  : r.deltaPct > 1
                    ? "text-green-400"
                    : "text-ink-400";
              const sign = r.deltaPct > 0 ? "+" : "";
              return (
                <tr key={r.name + r.sharesAfter}>
                  <td className="py-2.5 pr-3 font-medium text-ink-600">
                    {r.name}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink-400">
                    {formatPercent(r.pctBefore)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink-800">
                    {formatPercent(r.pctAfter)}
                  </td>
                  <td
                    className={cn(
                      "py-2.5 pl-3 text-right font-mono tabular-nums",
                      deltaTone,
                    )}
                  >
                    {sign}
                    {r.deltaPct.toFixed(1)}pp
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-sm leading-relaxed text-ink-400">
        {diff.plainEnglish}
      </p>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "brand" | "brand-soft";
}) {
  const valueClass =
    tone === "brand"
      ? "text-brand-600"
      : tone === "brand-soft"
        ? "text-brand-500"
        : "text-ink-800";
  return (
    <div className="rounded-xl border border-surface-200 bg-white p-4 transition-colors hover:border-brand-500/40">
      <p className="text-[11px] uppercase tracking-[0.18em] text-ink-8000">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 font-mono tabular-nums text-xl font-semibold",
          valueClass,
        )}
      >
        {value}
      </p>
    </div>
  );
}

interface BarSegment {
  key: string;
  name: string;
  pct: number;
  kind: RowKind;
}

function StackedBar({
  label,
  segments,
}: {
  label: string;
  segments: BarSegment[];
}) {
  const total = segments.reduce((acc, s) => acc + s.pct, 0) || 1;
  const filtered = segments.filter((s) => s.pct > 0);
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-ink-8000">
        <span>{label}</span>
        <span className="font-mono tabular-nums text-ink-400">100.0%</span>
      </div>
      <svg
        viewBox="0 0 400 28"
        preserveAspectRatio="none"
        className="mt-2 w-full h-7"
        role="img"
        aria-label={`${label} cap table — ${filtered
          .map((s) => `${s.name} ${s.pct.toFixed(1)} percent`)
          .join(", ")}`}
      >
        {filtered.map((s, i) => {
          const offset =
            (filtered.slice(0, i).reduce((acc, p) => acc + p.pct, 0) / total) *
            400;
          const w = (s.pct / total) * 400;
          const isFirst = i === 0;
          const isLast = i === filtered.length - 1;
          return (
            <rect
              key={s.key}
              x={offset + (isFirst ? 0 : 0.5)}
              y={0}
              width={Math.max(0, w - (isFirst || isLast ? 0.5 : 1))}
              height={28}
              fill={rowColor(s.kind)}
              rx={isFirst || isLast ? 4 : 0}
            >
              <title>
                {s.name} — {s.pct.toFixed(1)}%
              </title>
            </rect>
          );
        })}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-400">
        {filtered.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-sm"
              style={{ backgroundColor: rowColor(s.kind) }}
            />
            <span className="text-ink-500">{s.name}</span>
            <span className="font-mono tabular-nums text-ink-400">
              {s.pct.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Legend() {
  const items: { kind: RowKind; label: string }[] = [
    { kind: "founder", label: "Founders" },
    { kind: "esop", label: "ESOP" },
    { kind: "existing", label: "Existing investors" },
    { kind: "newInvestor", label: "New investor" },
  ];
  return (
    <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] uppercase tracking-[0.15em] text-ink-8000">
      {items.map((i) => (
        <li key={i.kind} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: rowColor(i.kind) }}
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function MiniHolderRow({
  holder,
  onChange,
  onRemove,
  canRemove,
}: {
  holder: Holder;
  onChange: (patch: Partial<Holder>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const nameId = `mini-holder-${holder.id}-name`;
  const sharesId = `mini-holder-${holder.id}-shares`;
  const classId = `mini-holder-${holder.id}-class`;
  const founderId = `mini-holder-${holder.id}-founder`;
  return (
    <div className="rounded-xl border border-surface-200 bg-white p-3">
      <div className="grid grid-cols-12 gap-2 items-end">
        <div className="col-span-12 sm:col-span-5">
          <Label htmlFor={nameId} className="text-xs text-ink-400">
            Name
          </Label>
          <Input
            id={nameId}
            value={holder.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="mt-1 h-9 text-sm"
          />
        </div>
        <div className="col-span-7 sm:col-span-3">
          <Label htmlFor={sharesId} className="text-xs text-ink-400">
            Shares
          </Label>
          <Input
            id={sharesId}
            type="number"
            inputMode="decimal"
            min={0}
            step={10000}
            value={holder.shares}
            onChange={(e) =>
              onChange({ shares: Number(e.target.value) || 0 })
            }
            className="mt-1 h-9 text-sm font-mono tabular-nums"
          />
        </div>
        <div className="col-span-5 sm:col-span-3">
          <Label htmlFor={classId} className="text-xs text-ink-400">
            Class
          </Label>
          <select
            id={classId}
            value={holder.shareClass}
            onChange={(e) =>
              onChange({ shareClass: e.target.value as ShareClass })
            }
            className="mt-1 h-9 w-full rounded-[10px] border border-surface-200 bg-white px-2.5 text-sm text-ink-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 cursor-pointer transition-colors"
          >
            {SHARE_CLASS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="bg-white">
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-12 sm:col-span-1 flex justify-end">
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${holder.name}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-surface-200 bg-white text-ink-400 hover:border-red-500/40 hover:text-red-400 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
            >
              <Trash2 strokeWidth={1.75} className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          id={founderId}
          type="checkbox"
          checked={!!holder.isFounder}
          onChange={(e) => onChange({ isFounder: e.target.checked })}
          className="h-4 w-4 rounded border-surface-200 bg-white text-brand-500 focus:ring-brand-500/30 cursor-pointer"
        />
        <Label
          htmlFor={founderId}
          className="text-xs text-ink-400 cursor-pointer"
        >
          Mark as founder
        </Label>
      </div>
    </div>
  );
}
