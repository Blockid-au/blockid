"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  Mail,
  Sparkles,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ScoreCard } from "@/components/score/score-card";
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
  persisted: boolean;
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
    trackEvent("score_form_started", {
      source: heroQuery.length > 0 ? "hero_search" : "direct",
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

  return (
    <div className="grid lg:grid-cols-2 gap-8 items-start">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-gold-600 font-medium">
          Your Investor-Ready Score
        </p>
        <h2 className="mt-2 text-2xl md:text-3xl font-semibold text-ink-800">
          {companyName}
        </h2>
        <p className="mt-2 text-sm text-ink-400">
          {result.persisted
            ? "Saved. Anyone with the link below can view this score."
            : "Demo mode — save once Supabase is configured to persist & share."}
        </p>
        <div className="mt-5 grid sm:grid-cols-2 gap-3">
          <MiniStat
            label="Confidence"
            value={`${result.confidenceScore}/100`}
            detail={
              result.missingInputs.length
                ? `${result.missingInputs.length} missing inputs`
                : "All core inputs present"
            }
          />
          <MiniStat
            label="Benchmark"
            value={result.benchmark.label}
            detail={`${result.benchmark.band}; median ${result.benchmark.medianScore}`}
          />
        </div>
        <div className="mt-6">
          <ScoreCard
            score={result.totalScore}
            subScores={result.breakdown.subs.map((s) => ({
              label: s.label,
              value: Math.round(s.value),
            }))}
            caption={`${new Date().toISOString().slice(0, 10)} · BlockID`}
          />
        </div>
        <ul className="mt-6 space-y-2 text-xs text-ink-400">
          {result.breakdown.subs.map((s) => (
            <li key={s.label} className="flex gap-2">
              <span className="font-mono tabular-nums text-brand-600">
                {Math.round(s.value)}
              </span>
              <span className="font-medium text-ink-500 w-44 shrink-0">
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
          {result.persisted && (
            <a
              href={`/reports/${result.slug}`}
              target="_blank"
              rel="noopener"
              className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-brand-500/30 bg-brand-500/5 px-4 py-3 hover:bg-brand-500/10 transition"
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
