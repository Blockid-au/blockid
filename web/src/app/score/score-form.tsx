"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  Mail,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ScoreCard } from "@/components/score/score-card";
import { ActionPlan } from "@/components/score/ActionPlan";
import { NotFinancialAdvice } from "@/components/legal/not-financial-advice";
import type { ScoreInput } from "@/lib/score";
import { trackEvent } from "@/lib/analytics";

const defaultInput: ScoreInput = {
  companyName: "",
  abn: "",
  sector: "saas",
  stage: "seed",
  yearsTrading: 1,
  monthlyRevenue: 25000,
  monthlyBurn: 35000,
  runwayMonths: 9,
  arrBand: "250k-1m",
  targetRaiseAud: 1_500_000,
  valuationCapAud: 8_000_000,
  founders: 2,
  esopAllocated: 10,
  hasShareholdersAgreement: true,
  hasBoardMeetings: true,
  hasFinancialAudit: false,
};

interface SviDimAnalysis {
  dim: string;
  label: string;
  score: number;
  status: "strong" | "developing" | "gap";
  commentary: string;
  weight: number;
}

interface SviFullAnalysis {
  dims: SviDimAnalysis[];
  executiveSummary: string;
  topThreePriorities: string[];
}

interface ScoreApiResponse {
  ok: boolean;
  slug: string;
  totalScore: number;
  subScores: Record<string, number>;
  scoreVersion: string;
  confidenceScore: number;
  missingInputs: string[];
  actionPlan: {
    title: string;
    detail: string;
    impact: "high" | "medium" | "low";
  }[];
  benchmark: {
    label: string;
    medianScore: number;
    band: string;
    rationale: string;
  };
  breakdown: {
    version: string;
    total: number;
    confidence: number;
    missingInputs: string[];
    actionPlan: ScoreApiResponse["actionPlan"];
    benchmark: ScoreApiResponse["benchmark"];
    subs: {
      label: string;
      value: number;
      rationale: string;
      evidence: string[];
    }[];
  };
  valuation?: {
    lowAud: number;
    midAud: number;
    highAud: number;
    method: string;
  } | null;
  fundingReadiness?: {
    seed: { pass: boolean; missing: string[] };
    seriesA: { pass: boolean; missing: string[] };
  } | null;
  evidenceGaps?: string[] | null;
  sviAnalysis?: SviFullAnalysis | null;
  persisted: boolean;
  attribution?: {
    firstTouch: AttributionEcho | null;
    lastTouch: AttributionEcho | null;
  } | null;
}

interface AttributionEcho {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  term?: string | null;
  content?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  referrer?: string | null;
  landing_path?: string | null;
}

// Read attribution snapshot from localStorage (written by <UtmCapture />).
// Guards against private-mode SecurityError + malformed JSON.
function readLocalAttribution(key: string): AttributionEcho | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as AttributionEcho;
  } catch {
    return null;
  }
}

function fmtAudMillionsShort(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "A$0";
  if (v >= 1_000_000) return `A$${(v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)}M`;
  if (v >= 1_000) return `A$${Math.round(v / 1_000)}k`;
  return `A$${Math.round(v)}`;
}

export function ScoreForm() {
  const searchParams = useSearchParams();
  const heroQuery = (searchParams?.get("q") ?? "").trim();

  const [input, setInput] = React.useState<ScoreInput>(defaultInput);
  const [email, setEmail] = React.useState("");
  const [result, setResult] = React.useState<ScoreApiResponse | null>(null);
  const [submitState, setSubmitState] = React.useState<
    "idle" | "submitting" | "ok" | "err"
  >("idle");
  const [advancedOpen, setAdvancedOpen] = React.useState(false);

  // Prefill company name from hero search query, if provided. Only runs
  // when the query changes so we don't clobber a user's typed edit.
  React.useEffect(() => {
    if (heroQuery.length > 0) {
      setInput((p) => (p.companyName ? p : { ...p, companyName: heroQuery }));
    }
  }, [heroQuery]);

  // Fire score_form_started exactly once per session on first Company Name
  // focus. Guarded by ref so quick blur/focus doesn't double-fire.
  const startedFiredRef = React.useRef(false);
  const handleCompanyFocus = React.useCallback(() => {
    if (startedFiredRef.current) return;
    startedFiredRef.current = true;
    const lt = readLocalAttribution("bid_last_touch_v1");
    trackEvent("score_form_started", {
      source: heroQuery.length > 0 ? "hero_search" : "direct",
      utm_source: lt?.source ?? undefined,
      utm_medium: lt?.medium ?? undefined,
      utm_campaign: lt?.campaign ?? undefined,
    });
  }, [heroQuery]);

  const update = <K extends keyof ScoreInput>(key: K, value: ScoreInput[K]) =>
    setInput((p) => ({ ...p, [key]: value }));

  const onCompute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setSubmitState("err");
      return;
    }
    setSubmitState("submitting");
    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          companyName: input.companyName || "My Startup",
          inputs: { ...input, companyName: input.companyName || "My Startup" },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        console.error("[score-form] API error:", data);
        setSubmitState("err");
        return;
      }
      const payload = data as ScoreApiResponse;
      setResult(payload);
      setSubmitState("ok");
      trackEvent("score_form_submitted", {
        company_name: input.companyName || "My Startup",
        totalScore: payload.totalScore,
        persisted: payload.persisted,
        hasValuation: !!payload.valuation,
        hasFundingReadiness: !!payload.fundingReadiness,
      });
    } catch (err) {
      console.error("[score-form] Network error:", err);
      setSubmitState("err");
    }
  };

  if (result) {
    return (
      <ResultPanel
        result={result}
        companyName={input.companyName || "Your company"}
        founderEmail={email}
        onReset={() => {
          setResult(null);
          setSubmitState("idle");
          setAdvancedOpen(false);
        }}
      />
    );
  }

  return (
    <form onSubmit={onCompute} className="space-y-6">
      {heroQuery.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-brand-500/30 bg-brand-500/5 px-4 py-3 text-sm text-brand-700"
        >
          Analyzing:{" "}
          <span className="font-medium text-ink-700">
            &ldquo;{heroQuery}&rdquo;
          </span>
          <span className="ml-2 text-xs text-ink-400">
            — we prefilled the company name; edit anything below.
          </span>
        </div>
      )}
      <fieldset className="space-y-5">
        <legend className="sr-only">Get your score</legend>
        <p className="text-sm text-ink-500">
          Two fields, one click. We&apos;ll compute your full SVI report and
          email the detailed evaluation. Sector + financial defaults are used
          so you can skip the cap-table paperwork — unlock <em>Advanced</em>{" "}
          below to tune anything.
        </p>
        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Company name" htmlFor="company">
            <Input
              id="company"
              required
              value={input.companyName}
              onChange={(e) => update("companyName", e.target.value)}
              onFocus={handleCompanyFocus}
              placeholder="Acme Co Pty Ltd"
              autoComplete="organization"
            />
          </Field>
          <Field label="Work email (report is sent here)" htmlFor="email">
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="founder@yourstartup.com.au"
            />
          </Field>
        </div>
      </fieldset>

      <details
        open={advancedOpen}
        onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
        className="rounded-xl border border-surface-200 bg-white/60"
      >
        <summary className="cursor-pointer select-none px-5 py-3 text-sm font-medium text-ink-700 hover:text-ink-900">
          Advanced (optional) — sector, financials, cap-table
          <span className="ml-2 text-xs font-normal text-ink-400">
            Improves accuracy; not required
          </span>
        </summary>
        <div className="space-y-6 border-t border-surface-200 px-5 py-5">
          <div className="grid sm:grid-cols-2 gap-5">
            <Field label="ABN (optional)" htmlFor="abn">
              <Input
                id="abn"
                inputMode="numeric"
                value={input.abn}
                onChange={(e) => update("abn", e.target.value)}
                placeholder="00 000 000 000"
                className="font-mono tabular-nums"
              />
            </Field>
            <Field label="Sector" htmlFor="sector">
              <select
                id="sector"
                value={input.sector}
                onChange={(e) =>
                  update("sector", e.target.value as ScoreInput["sector"])
                }
                className="h-11 w-full rounded-[10px] border border-surface-200 bg-white px-3 py-3 text-ink-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 cursor-pointer"
              >
                <option value="saas">SaaS</option>
                <option value="fintech">Fintech</option>
                <option value="marketplace">Marketplace</option>
                <option value="devtools">DevTools</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Funding stage" htmlFor="stage">
              <select
                id="stage"
                value={input.stage}
                onChange={(e) =>
                  update("stage", e.target.value as ScoreInput["stage"])
                }
                className="h-11 w-full rounded-[10px] border border-surface-200 bg-white px-3 py-3 text-ink-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 cursor-pointer"
              >
                <option value="pre-seed">Pre-seed</option>
                <option value="seed">Seed</option>
                <option value="series-a">Series A</option>
                <option value="growth">Growth</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Years trading" htmlFor="years">
              <Input
                id="years"
                type="number"
                min={0}
                step={1}
                value={input.yearsTrading}
                onChange={(e) =>
                  update("yearsTrading", Number(e.target.value) || 0)
                }
                className="font-mono tabular-nums"
              />
            </Field>
            <Field label="Monthly revenue (AUD)" htmlFor="rev">
              <Input
                id="rev"
                type="number"
                min={0}
                step={1000}
                value={input.monthlyRevenue}
                onChange={(e) =>
                  update("monthlyRevenue", Number(e.target.value) || 0)
                }
                className="font-mono tabular-nums"
              />
            </Field>
            <Field label="Monthly burn (AUD)" htmlFor="burn">
              <Input
                id="burn"
                type="number"
                min={0}
                step={1000}
                value={input.monthlyBurn}
                onChange={(e) =>
                  update("monthlyBurn", Number(e.target.value) || 0)
                }
                className="font-mono tabular-nums"
              />
            </Field>
            <Field label="Runway (months)" htmlFor="runway">
              <Input
                id="runway"
                type="number"
                min={0}
                step={1}
                value={input.runwayMonths}
                onChange={(e) =>
                  update("runwayMonths", Number(e.target.value) || 0)
                }
                className="font-mono tabular-nums"
              />
            </Field>
            <Field label="ARR band" htmlFor="arr-band">
              <select
                id="arr-band"
                value={input.arrBand}
                onChange={(e) =>
                  update("arrBand", e.target.value as ScoreInput["arrBand"])
                }
                className="h-11 w-full rounded-[10px] border border-surface-200 bg-white px-3 py-3 text-ink-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 cursor-pointer"
              >
                <option value="pre-revenue">Pre-revenue</option>
                <option value="0-250k">AUD 0-250k</option>
                <option value="250k-1m">AUD 250k-1M</option>
                <option value="1m-3m">AUD 1M-3M</option>
                <option value="3m-plus">AUD 3M+</option>
              </select>
            </Field>
            <Field label="Target raise (AUD)" htmlFor="target-raise">
              <Input
                id="target-raise"
                type="number"
                min={0}
                step={50000}
                value={input.targetRaiseAud}
                onChange={(e) =>
                  update("targetRaiseAud", Number(e.target.value) || 0)
                }
                className="font-mono tabular-nums"
              />
            </Field>
            <Field label="Valuation / cap (AUD)" htmlFor="valuation-cap">
              <Input
                id="valuation-cap"
                type="number"
                min={0}
                step={100000}
                value={input.valuationCapAud}
                onChange={(e) =>
                  update("valuationCapAud", Number(e.target.value) || 0)
                }
                className="font-mono tabular-nums"
              />
            </Field>
            <Field label="Founders" htmlFor="founders">
              <Input
                id="founders"
                type="number"
                min={1}
                step={1}
                value={input.founders}
                onChange={(e) =>
                  update("founders", Number(e.target.value) || 1)
                }
                className="font-mono tabular-nums"
              />
            </Field>
            <Field label="ESOP allocated (%)" htmlFor="esop">
              <Input
                id="esop"
                type="number"
                min={0}
                max={50}
                step={1}
                value={input.esopAllocated}
                onChange={(e) =>
                  update("esopAllocated", Number(e.target.value) || 0)
                }
                className="font-mono tabular-nums"
              />
            </Field>
          </div>
          <div className="space-y-3">
            <Toggle
              id="sha"
              label="Shareholders agreement signed"
              checked={input.hasShareholdersAgreement}
              onChange={(v) => update("hasShareholdersAgreement", v)}
            />
            <Toggle
              id="board"
              label="Regular board meetings (≥ quarterly)"
              checked={input.hasBoardMeetings}
              onChange={(v) => update("hasBoardMeetings", v)}
            />
            <Toggle
              id="audit"
              label="Audited financials in last 12 months"
              checked={input.hasFinancialAudit}
              onChange={(v) => update("hasFinancialAudit", v)}
            />
          </div>
        </div>
      </details>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-200">
        <Button
          type="submit"
          variant="primary"
          disabled={submitState === "submitting"}
        >
          <Sparkles strokeWidth={1.75} className="h-5 w-5" />
          {submitState === "submitting"
            ? "Generating your report…"
            : "Score & email me the report"}
          <ArrowRight strokeWidth={1.75} className="h-5 w-5" />
        </Button>
      </div>

      {submitState === "err" && (
        <p
          role="alert"
          aria-live="assertive"
          className="text-sm text-amber-300"
        >
          Something went wrong. Please double-check the company name + email
          and try again.
        </p>
      )}
    </form>
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

function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex items-center justify-between rounded-lg border border-surface-200 bg-white px-4 py-3 cursor-pointer hover:border-brand-500/40 transition-colors"
    >
      <span className="text-sm text-ink-600">{label}</span>
      <span className="relative inline-flex h-6 w-11 items-center">
        <input
          id={id}
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="absolute inset-0 rounded-full bg-surface-200 transition-colors peer-checked:bg-brand-500" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-slate-50 transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

function siteUrl(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return "https://blockid.au";
}

interface InvestorLinkRecord {
  url: string;
  investorEmail: string | null;
  investorName: string | null;
  fundName: string | null;
}

function ResultPanel({
  result,
  companyName,
  founderEmail,
  onReset,
}: {
  result: ScoreApiResponse;
  companyName: string;
  founderEmail: string;
  onReset: () => void;
}) {
  const shareUrl = `${siteUrl()}/s/${result.slug}`;
  const pdfUrl = `/s/${result.slug}/pdf`;

  // Fire score_result_viewed once per rendered result. Guarded so a re-render
  // (state change on the panel) does not re-fire for the same slug.
  const viewedSlugRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (viewedSlugRef.current === result.slug) return;
    viewedSlugRef.current = result.slug;
    trackEvent("score_result_viewed", {
      slug: result.slug,
      total_score: result.totalScore,
    });
  }, [result.slug, result.totalScore]);

  const [copied, setCopied] = React.useState(false);
  const [investorEmail, setInvestorEmail] = React.useState("");
  const [investorName, setInvestorName] = React.useState("");
  const [fundName, setFundName] = React.useState("");
  const [shareState, setShareState] = React.useState<
    "idle" | "submitting" | "ok" | "err"
  >("idle");
  const [shareError, setShareError] = React.useState<string | null>(null);
  const [createdLinks, setCreatedLinks] = React.useState<InvestorLinkRecord[]>([]);
  const [copiedToken, setCopiedToken] = React.useState<string | null>(null);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  const onCopyInvestorLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(url);
      setTimeout(() => setCopiedToken(null), 1800);
    } catch {
      // ignore
    }
  };

  const onShareWithInvestor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!investorEmail || shareState === "submitting") return;
    if (!result.persisted) {
      setShareState("err");
      setShareError(
        "Per-investor links need a persisted score. Configure Supabase to enable.",
      );
      return;
    }
    setShareState("submitting");
    setShareError(null);
    try {
      const res = await fetch("/api/investor-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scoreId: result.slug,
          founderEmail,
          investorEmail,
          investorName: investorName || undefined,
          fundName: fundName || undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        url?: string;
        investorEmail?: string | null;
        investorName?: string | null;
        fundName?: string | null;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.url) {
        throw new Error(data.error || "Could not create link");
      }
      setCreatedLinks((prev) => [
        {
          url: data.url!,
          investorEmail: data.investorEmail ?? investorEmail,
          investorName: data.investorName ?? investorName ?? null,
          fundName: data.fundName ?? fundName ?? null,
        },
        ...prev,
      ]);
      setInvestorEmail("");
      setInvestorName("");
      setFundName("");
      setShareState("ok");
    } catch (err) {
      setShareState("err");
      setShareError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  // Wave 28C — action plan requires a real `svi_snapshots.id` (svi_run_id).
  // The /api/score deterministic-preview endpoint uses `slug` only; a
  // downstream card in this panel is where founders trigger a persisted
  // analysis. Until that flow returns a snapshot id, gate the component on
  // null so it stays a no-op here.
  const sviRunId: string | null = null;

  return (
    <>
    <div className="grid lg:grid-cols-2 gap-8 items-start">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-gold-600 font-medium">
          Your Investor-Ready Score
        </p>
        <h2 className="mt-2 text-2xl md:text-3xl font-semibold text-ink-800">
          {companyName}
        </h2>
        <p className="mt-1 text-sm text-ink-400">
          {result.persisted
            ? "Saved. Anyone with the link below can view this score."
            : "Demo mode — save once Supabase is configured to persist & share."}
        </p>

        {/* Score gauge hero */}
        <div className="mt-5 flex flex-col items-center py-4 rounded-2xl border border-surface-200 bg-gradient-to-b from-white to-surface-50">
          <ScoreGauge score={result.totalScore} />
          <div className="mt-1 flex items-center gap-3 flex-wrap justify-center">
            <MiniStat
              label="Confidence"
              value={`${result.confidenceScore}/100`}
              detail={
                result.missingInputs.length
                  ? `${result.missingInputs.length} missing inputs`
                  : "All inputs present"
              }
            />
            <MiniStat
              label="Benchmark"
              value={result.benchmark.label}
              detail={`${result.benchmark.band}; median ${result.benchmark.medianScore}`}
            />
          </div>
        </div>

        {/* Sub-score gradient bars */}
        <div className="mt-5 space-y-2">
          <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-ink-500">
            Five sub-scores
          </p>
          <div className="grid sm:grid-cols-2 gap-2">
            {result.breakdown.subs.map((s) => (
              <SubScoreBar key={s.label} label={s.label} value={Math.round(s.value)} />
            ))}
          </div>
        </div>

        {/* Rationale detail list */}
        <ul className="mt-4 space-y-2 text-xs text-ink-400">
          {result.breakdown.subs.map((s) => (
            <li key={s.label} className="flex gap-2">
              <span className="font-mono tabular-nums text-brand-600">
                {Math.round(s.value)}
              </span>
              <span className="font-medium text-ink-500 w-40 shrink-0">
                {s.label}
              </span>
              <span className="text-ink-400">{s.rationale}</span>
            </li>
          ))}
        </ul>

        {result.valuation && (
          <div className="mt-6 rounded-2xl border border-surface-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-ink-800">
              Valuation range
            </h3>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-surface-200 bg-surface-100/40 px-3 py-4 text-center">
                <div className="text-lg font-semibold text-ink-500 tabular-nums">
                  {fmtAudMillionsShort(result.valuation.lowAud)}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-ink-400">
                  Low
                </div>
              </div>
              <div className="rounded-xl border border-brand-500/40 bg-brand-500/5 px-3 py-4 text-center">
                <div className="text-xl font-bold text-brand-600 tabular-nums">
                  {fmtAudMillionsShort(result.valuation.midAud)}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-ink-400">
                  Mid
                </div>
              </div>
              <div className="rounded-xl border border-surface-200 bg-surface-100/40 px-3 py-4 text-center">
                <div className="text-lg font-semibold text-emerald-600 tabular-nums">
                  {fmtAudMillionsShort(result.valuation.highAud)}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-ink-400">
                  High
                </div>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-ink-400 italic">
              VC Scorecard blend, {result.benchmark.label} benchmarks. Indicative only — not a fairness opinion or financial advice.
            </p>
          </div>
        )}

        {result.fundingReadiness && (
          <div className="mt-6 rounded-2xl border border-surface-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-ink-800">
              Funding readiness gates
            </h3>
            <div className="mt-4 space-y-3">
              {(["seed", "seriesA"] as const).map((k) => {
                const gate = result.fundingReadiness![k];
                const label = k === "seed" ? "Seed" : "Series A";
                return (
                  <div
                    key={k}
                    className="flex flex-col sm:flex-row sm:items-start gap-3 rounded-xl border border-surface-200 bg-surface-100/30 px-4 py-3"
                  >
                    <span
                      className={
                        "inline-flex h-6 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap " +
                        (gate.pass
                          ? "bg-emerald-500/15 text-emerald-700 border border-emerald-500/40"
                          : "bg-surface-200 text-ink-500 border border-surface-300")
                      }
                    >
                      {gate.pass ? (
                        <>
                          <CheckCircle2 strokeWidth={2} className="h-3.5 w-3.5" />
                          {label} ready
                        </>
                      ) : (
                        <>{label} not ready</>
                      )}
                    </span>
                    <div className="flex-1 text-xs text-ink-500 leading-relaxed">
                      {gate.pass
                        ? "All gates met — you can credibly open an investor conversation."
                        : gate.missing.length > 0
                          ? (
                              <ul className="space-y-1">
                                {gate.missing.slice(0, 5).map((m) => (
                                  <li key={m} className="flex gap-2">
                                    <span className="text-amber-500">&middot;</span>
                                    <span>{m}</span>
                                  </li>
                                ))}
                              </ul>
                            )
                          : "No gaps recorded."}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {result.evidenceGaps && result.evidenceGaps.length > 0 && (
          <div className="mt-6 rounded-2xl border border-surface-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-ink-800">
              Evidence gaps to close
            </h3>
            <ul className="mt-3 space-y-2">
              {result.evidenceGaps.slice(0, 8).map((g) => (
                <li key={g} className="flex gap-2 text-xs text-ink-500">
                  <Sparkles strokeWidth={1.75} className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>{g}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-surface-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-ink-800">
            Next founder actions
          </h3>
          <ul className="mt-4 space-y-3">
            {result.actionPlan.map((action) => (
              <li key={action.title} className="flex gap-3">
                <span className="mt-0.5 inline-flex h-5 min-w-12 items-center justify-center rounded-full border border-brand-500/30 bg-brand-500/10 px-2 text-[10px] uppercase tracking-wider text-brand-600">
                  {action.impact}
                </span>
                <span>
                  <span className="block text-sm font-medium text-ink-600">
                    {action.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-400">
                    {action.detail}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        {/* Wave 29 — Full 8-dimension SVI breakdown */}
        {result.sviAnalysis && (
          <SviFullAnalysisPanel analysis={result.sviAnalysis} />
        )}

        <div className="mt-6">
          <NotFinancialAdvice kind="not_financial_advice" compact />
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={onReset}
          className="mt-6"
        >
          <ArrowLeft strokeWidth={1.75} className="h-5 w-5" />
          Run again
        </Button>
      </div>

      <div className="space-y-6">
        <div className="rounded-2xl border border-surface-200 bg-white p-6">
          <h3 className="text-lg font-semibold text-ink-800">
            Your shareable Investor View Link
          </h3>
          <p className="mt-1 text-sm text-ink-400">
            Send this link to investors — they can open it without signing
            up. You&apos;ll be notified when it&apos;s viewed.
          </p>
          <div className="mt-5 flex items-center gap-2 rounded-[10px] border border-surface-200 bg-white px-3 py-3">
            <span className="font-mono text-sm tabular-nums text-ink-600 truncate flex-1">
              {shareUrl}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onCopy}
              aria-label="Copy share URL"
            >
              {copied ? (
                <>
                  <CheckCircle2 strokeWidth={1.75} className="h-4 w-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy strokeWidth={1.75} className="h-4 w-4" />
                  Copy
                </>
              )}
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener"
              className="inline-flex"
            >
              <Button variant="primary">
                <Download strokeWidth={1.75} className="h-5 w-5" />
                Download PDF
              </Button>
            </a>
            <a
              href={shareUrl}
              target="_blank"
              rel="noopener"
              className="inline-flex"
            >
              <Button variant="secondary">
                Open share page
                <ArrowRight strokeWidth={1.75} className="h-5 w-5" />
              </Button>
            </a>
            <a
              href={`/s/${result.slug}/activity`}
              target="_blank"
              rel="noopener"
              className="inline-flex"
            >
              <Button variant="secondary">View activity</Button>
            </a>
          </div>
          {/* Full Analyst Report CTA — prominent action card */}
          <a
            href="/workspace/business-report"
            className="mt-5 group flex items-start justify-between gap-3 rounded-2xl border-2 border-brand-600 bg-gradient-to-br from-brand-50 to-brand-100/60 px-5 py-5 hover:from-brand-100 hover:to-brand-200/60 hover:shadow-md transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <div className="flex items-start gap-4">
              <div className="flex-none h-11 w-11 rounded-xl bg-brand-600 flex items-center justify-center shadow-sm group-hover:bg-brand-700 transition-colors">
                <FileText strokeWidth={1.5} className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.14em] font-semibold text-brand-600 mb-0.5">
                  Premium · AI Analyst Report
                </p>
                <p className="text-base font-bold text-brand-800 leading-snug">
                  Full 10-Page Investor Memo
                </p>
                <p className="mt-1 text-xs text-ink-600 leading-relaxed">
                  13-criteria deep dive · directional valuation · risk register · cohort benchmarks · methodology
                </p>
              </div>
            </div>
            <ArrowRight strokeWidth={2} className="h-5 w-5 text-brand-600 shrink-0 mt-1 group-hover:translate-x-0.5 transition-transform" />
          </a>
          {result.persisted && (
            <a
              href={`/reports/${result.slug}`}
              target="_blank"
              rel="noopener"
              className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-brand-500/30 bg-brand-500/5 px-4 py-3 hover:bg-brand-500/10 transition"
            >
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-brand-600 font-semibold">
                  Public trust report
                </p>
                <p className="mt-0.5 text-xs text-ink-500">
                  Deep, indexable listing for search engines & directories.
                </p>
              </div>
              <ArrowRight strokeWidth={1.75} className="h-5 w-5 text-brand-600 shrink-0" />
            </a>
          )}
        </div>

        <form
          onSubmit={onShareWithInvestor}
          className="rounded-2xl border border-surface-200 bg-white p-6"
          noValidate
        >
          <h3 className="text-lg font-semibold text-ink-800 inline-flex items-center gap-2">
            <Mail strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
            Send a per-investor link
          </h3>
          <p className="mt-1 text-sm text-ink-400">
            Generate a unique URL for each investor. We&apos;ll attribute every
            open and notify you when this specific investor reads the score.
          </p>
          <div className="mt-5 grid sm:grid-cols-2 gap-3">
            <Input
              id="investor-email"
              type="email"
              required
              value={investorEmail}
              onChange={(e) => setInvestorEmail(e.target.value)}
              placeholder="partner@fund.com.au"
              aria-invalid={shareState === "err"}
            />
            <Input
              id="investor-name"
              value={investorName}
              onChange={(e) => setInvestorName(e.target.value)}
              placeholder="Investor name (optional)"
              autoComplete="off"
            />
            <Input
              id="fund-name"
              value={fundName}
              onChange={(e) => setFundName(e.target.value)}
              placeholder="Fund (optional, e.g. Blackbird)"
              autoComplete="organization"
              className="sm:col-span-2"
            />
          </div>
          <div className="mt-4">
            <Button
              type="submit"
              variant="primary"
              disabled={shareState === "submitting"}
            >
              {shareState === "submitting"
                ? "Generating link…"
                : shareState === "ok"
                  ? "Generate another"
                  : "Generate investor link"}
              {shareState === "ok" ? (
                <CheckCircle2 strokeWidth={1.75} className="h-5 w-5" />
              ) : (
                <ArrowRight strokeWidth={1.75} className="h-5 w-5" />
              )}
            </Button>
          </div>
          {shareState === "err" && (
            <p
              role="alert"
              aria-live="assertive"
              className="mt-3 text-sm text-amber-300"
            >
              {shareError ||
                "Couldn't create the link right now. Try again in a moment."}
            </p>
          )}
          <p className="mt-3 text-xs text-ink-800">
            We store the investor&apos;s details against your score. AU data
            residency. We never sell data.
          </p>

          {createdLinks.length > 0 && (
            <div className="mt-6 space-y-3">
              <p className="text-xs uppercase tracking-[0.16em] text-ink-800">
                Per-investor links
              </p>
              <ul className="space-y-3">
                {createdLinks.map((link) => (
                  <li
                    key={link.url}
                    className="rounded-xl border border-surface-200 bg-surface-100/40 p-4"
                  >
                    <p className="text-sm font-medium text-ink-700">
                      {link.fundName ||
                        link.investorName ||
                        link.investorEmail ||
                        "Investor"}
                    </p>
                    {link.investorEmail && link.investorEmail !== link.fundName && (
                      <p className="text-xs text-ink-400">
                        {link.investorEmail}
                      </p>
                    )}
                    <div className="mt-3 flex items-center gap-2 rounded-[10px] border border-surface-200 bg-white px-3 py-2">
                      <span className="font-mono text-xs tabular-nums text-ink-600 truncate flex-1">
                        {link.url}
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => onCopyInvestorLink(link.url)}
                        aria-label="Copy investor link"
                      >
                        {copiedToken === link.url ? (
                          <>
                            <CheckCircle2
                              strokeWidth={1.75}
                              className="h-4 w-4"
                            />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy strokeWidth={1.75} className="h-4 w-4" />
                            Copy
                          </>
                        )}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>
      </div>
    </div>
    {/* Wave 28C — Personalised 30-Day Action Plan (renders nothing when sviRunId is null). */}
    <ActionPlan sviRunId={sviRunId} />
    </>
  );
}

// ── Wave 29 — Full 8-Dimension SVI Analysis Panel ────────────────────────────

const DIM_BADGE_COLORS: Record<string, string> = {
  ftv: "bg-indigo-50 text-indigo-700 border-indigo-200",
  mpc: "bg-emerald-50 text-emerald-700 border-emerald-200",
  ptd: "bg-sky-50 text-sky-700 border-sky-200",
  tre: "bg-amber-50 text-amber-700 border-amber-200",
  cgh: "bg-violet-50 text-violet-700 border-violet-200",
  iri: "bg-rose-50 text-rose-700 border-rose-200",
  lco: "bg-slate-100 text-slate-700 border-slate-200",
  svm: "bg-teal-50 text-teal-700 border-teal-200",
};

const STATUS_COLORS: Record<string, string> = {
  strong: "text-emerald-700 bg-emerald-50 border-emerald-200",
  developing: "text-amber-700 bg-amber-50 border-amber-200",
  gap: "text-red-700 bg-red-50 border-red-200",
};

const STATUS_BAR_COLORS: Record<string, string> = {
  strong: "bg-emerald-500",
  developing: "bg-amber-400",
  gap: "bg-red-500",
};

const STATUS_LABEL: Record<string, string> = {
  strong: "Strong",
  developing: "Developing",
  gap: "Gap",
};

function SviFullAnalysisPanel({ analysis }: { analysis: SviFullAnalysis }) {
  const [expanded, setExpanded] = React.useState<string | null>(null);

  return (
    <div className="mt-8 space-y-5">
      {/* Executive Summary */}
      <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-brand-100/40 p-5">
        <p className="text-[10px] uppercase tracking-[0.2em] text-brand-600 font-semibold mb-1">
          Executive Assessment
        </p>
        <p className="text-sm leading-relaxed text-ink-700">{analysis.executiveSummary}</p>
      </div>

      {/* Top 3 Priorities */}
      {analysis.topThreePriorities.length > 0 && (
        <div className="rounded-2xl border border-surface-200 bg-white p-5">
          <p className="text-[10px] uppercase tracking-[0.2em] text-gold-600 font-semibold mb-3">
            Top priorities for next 90 days
          </p>
          <ol className="space-y-2.5">
            {analysis.topThreePriorities.map((p, i) => (
              <li key={i} className="flex gap-3 items-start">
                <span className="flex-none w-6 h-6 rounded-full bg-brand-100 border border-brand-300 flex items-center justify-center text-[11px] font-bold text-brand-700">
                  {i + 1}
                </span>
                <p className="text-sm text-ink-600 leading-relaxed">{p}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* 8-dimension breakdown */}
      <div className="rounded-2xl border border-surface-200 bg-white p-5">
        <p className="text-[10px] uppercase tracking-[0.2em] text-ink-500 font-semibold mb-4">
          8-Dimension SVI breakdown
        </p>
        <div className="space-y-2">
          {analysis.dims.map((dim) => {
            const isOpen = expanded === dim.dim;
            const badgeCls = DIM_BADGE_COLORS[dim.dim] ?? "bg-surface-100 text-ink-700 border-surface-200";
            const statusCls = STATUS_COLORS[dim.status] ?? "";
            const barCls = STATUS_BAR_COLORS[dim.status] ?? "bg-surface-300";
            return (
              <div
                key={dim.dim}
                className="rounded-xl border border-surface-200 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : dim.dim)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-50/50 transition-colors"
                  aria-expanded={isOpen}
                >
                  <span
                    className={cn(
                      "flex-none inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest",
                      badgeCls,
                    )}
                  >
                    {dim.dim.toUpperCase()}
                  </span>
                  <span className="flex-1 text-sm font-medium text-ink-700 truncate">
                    {dim.label}
                  </span>
                  <span
                    className={cn(
                      "flex-none text-xs font-semibold tabular-nums",
                      dim.status === "strong" ? "text-emerald-600" : dim.status === "gap" ? "text-red-600" : "text-amber-600",
                    )}
                  >
                    {dim.score}/100
                  </span>
                  <span
                    className={cn(
                      "flex-none hidden sm:inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                      statusCls,
                    )}
                  >
                    {STATUS_LABEL[dim.status]}
                  </span>
                  <svg
                    className={cn("flex-none h-4 w-4 text-ink-400 transition-transform duration-200", isOpen && "rotate-180")}
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    aria-hidden="true"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {/* Score bar */}
                <div className="px-4 pb-2">
                  <div className="h-1.5 w-full rounded-full bg-surface-100 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500", barCls)}
                      style={{ width: `${dim.score}%` }}
                    />
                  </div>
                </div>
                {/* Expanded commentary */}
                {isOpen && (
                  <div className="px-4 pt-1 pb-4 border-t border-surface-100">
                    <p className="text-xs text-ink-500 leading-relaxed mt-2">
                      {dim.commentary}
                    </p>
                    <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-ink-400">
                      Weight: <span className="font-semibold text-ink-500">{dim.weight}%</span> of total SVI score
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-[11px] text-ink-400 italic leading-relaxed">
          Dimension scores are deterministic estimates based on your inputs. For AI-powered analysis with evidence streaming, run the full investor report in your workspace.
        </p>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-ink-800">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-ink-700">{value}</p>
      <p className="mt-1 text-xs text-ink-800">{detail}</p>
    </div>
  );
}

// ── SVG Score Gauge ───────────────────────────────────────────────────────────
function ScoreGauge({ score }: { score: number }) {
  const clampedScore = Math.max(0, Math.min(100, score));
  // Arc parameters — 270° sweep (135° to 405°, i.e. bottom-left to bottom-right)
  const cx = 80;
  const cy = 80;
  const r = 62;
  const startAngle = 135;
  const sweepAngle = 270;
  const endAngle = startAngle + (sweepAngle * clampedScore) / 100;

  function polarToXY(angleDeg: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  const startPt = polarToXY(startAngle);
  const endPt = polarToXY(endAngle);
  const largeArc = sweepAngle * clampedScore / 100 > 180 ? 1 : 0;

  // Track arc (grey)
  const trackEnd = polarToXY(startAngle + sweepAngle);
  const trackD = `M ${startPt.x} ${startPt.y} A ${r} ${r} 0 1 1 ${trackEnd.x} ${trackEnd.y}`;

  // Score arc (brand color)
  const scoreD = clampedScore === 0
    ? ""
    : `M ${startPt.x} ${startPt.y} A ${r} ${r} 0 ${largeArc} 1 ${endPt.x} ${endPt.y}`;

  const bandColor =
    clampedScore >= 70 ? "#10b981" : clampedScore >= 40 ? "#f59e0b" : "#ef4444";

  return (
    <div className="flex flex-col items-center" role="img" aria-label={`Score: ${score} out of 100`}>
      <svg width="160" height="140" viewBox="0 0 160 140" fill="none" aria-hidden="true">
        {/* Track */}
        <path d={trackD} stroke="#e5e7eb" strokeWidth="12" strokeLinecap="round" fill="none" />
        {/* Score arc */}
        {scoreD && (
          <path
            d={scoreD}
            stroke={bandColor}
            strokeWidth="12"
            strokeLinecap="round"
            fill="none"
            style={{ filter: `drop-shadow(0 0 6px ${bandColor}55)` }}
          />
        )}
        {/* Score number */}
        <text x={cx} y={cy - 4} textAnchor="middle" className="tabular-nums" fontSize="36" fontWeight="700" fill={bandColor} fontFamily="inherit">
          {clampedScore}
        </text>
        <text x={cx} y={cy + 20} textAnchor="middle" fontSize="13" fill="#9ca3af" fontFamily="inherit">
          / 100
        </text>
        <text x={cx} y={cy + 38} textAnchor="middle" fontSize="10" fill="#6b7280" fontFamily="inherit" letterSpacing="0.08em">
          {clampedScore >= 70 ? "INVESTOR-READY" : clampedScore >= 40 ? "DEVELOPING" : "EARLY-STAGE"}
        </text>
      </svg>
    </div>
  );
}

// ── Sub-score gradient bar card ────────────────────────────────────────────────
function SubScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const color =
    pct >= 70 ? "from-emerald-400 to-emerald-600" :
    pct >= 40 ? "from-amber-400 to-amber-600" :
    "from-red-400 to-red-600";
  const textColor =
    pct >= 70 ? "text-emerald-700" : pct >= 40 ? "text-amber-700" : "text-red-700";
  return (
    <div className="rounded-xl border border-surface-200 bg-white px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink-600 leading-snug flex-1">{label}</span>
        <span className={`text-sm font-bold tabular-nums ${textColor}`}>{value}</span>
      </div>
      <div className="h-2 rounded-full bg-surface-100 overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-700`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}
