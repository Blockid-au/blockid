"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface InnovationAnswers {
  rndExpenditure: number; // 0-50
  ipDevelopment: number; // 0-50
  govFunding: number; // 0-50
  enforceableIP: boolean; // 25 pts if true
}

interface EarlyStageAnswers {
  incorporatedUnder6Years: boolean;
  expensesUnder1M: boolean;
  revenueUnder200K: boolean;
  notListed: boolean;
}

type Result = {
  status: "eligible" | "likely" | "not-eligible";
  innovationScore: number;
  earlyStagePass: boolean;
  earlyStageCount: number;
};

/* ─── Constants ─────────────────────────────────────────────────────────── */
const INNOVATION_THRESHOLD = 100;

const INNOVATION_ITEMS: {
  key: keyof InnovationAnswers;
  label: string;
  description: string;
  type: "range" | "boolean";
  max?: number;
  points?: number;
}[] = [
  {
    key: "rndExpenditure",
    label: "Expenditure on R&D activities",
    description:
      "Has the company spent money on eligible research and development activities?",
    type: "range",
    max: 50,
  },
  {
    key: "ipDevelopment",
    label: "IP development or registration",
    description:
      "Is the company developing or has registered intellectual property (patents, designs, trademarks)?",
    type: "range",
    max: 50,
  },
  {
    key: "govFunding",
    label: "Government R&D funding received",
    description:
      "Has the company received government grants or funding for R&D (e.g. CSIRO, ARC, state grants)?",
    type: "range",
    max: 50,
  },
  {
    key: "enforceableIP",
    label: "Enforceable right to IP",
    description:
      "Does the company own or have an enforceable legal right to use the IP it has developed?",
    type: "boolean",
    points: 25,
  },
];

/* ─── Component ─────────────────────────────────────────────────────────── */
export function ESICChecker() {
  const [innovation, setInnovation] = React.useState<InnovationAnswers>({
    rndExpenditure: 0,
    ipDevelopment: 0,
    govFunding: 0,
    enforceableIP: false,
  });

  const [earlyStage, setEarlyStage] = React.useState<EarlyStageAnswers>({
    incorporatedUnder6Years: false,
    expensesUnder1M: false,
    revenueUnder200K: false,
    notListed: false,
  });

  const [result, setResult] = React.useState<Result | null>(null);
  const [showExplainer, setShowExplainer] = React.useState(false);

  const handleCalculate = (e: React.FormEvent) => {
    e.preventDefault();

    const innovationScore =
      innovation.rndExpenditure +
      innovation.ipDevelopment +
      innovation.govFunding +
      (innovation.enforceableIP ? 25 : 0);

    const earlyStageChecks = [
      earlyStage.incorporatedUnder6Years,
      earlyStage.expensesUnder1M,
      earlyStage.revenueUnder200K,
      earlyStage.notListed,
    ];
    const earlyStageCount = earlyStageChecks.filter(Boolean).length;
    const earlyStagePass = earlyStageCount === 4;

    let status: Result["status"];
    if (innovationScore >= INNOVATION_THRESHOLD || earlyStagePass) {
      status = "eligible";
    } else if (innovationScore >= 75 || earlyStageCount >= 3) {
      status = "likely";
    } else {
      status = "not-eligible";
    }

    setResult({ status, innovationScore, earlyStagePass, earlyStageCount });
  };

  const handleReset = () => {
    setInnovation({
      rndExpenditure: 0,
      ipDevelopment: 0,
      govFunding: 0,
      enforceableIP: false,
    });
    setEarlyStage({
      incorporatedUnder6Years: false,
      expensesUnder1M: false,
      revenueUnder200K: false,
      notListed: false,
    });
    setResult(null);
  };

  return (
    <div className="space-y-10">
      {/* ── Investor Explainer ──────────────────────────────────────────── */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-6">
        <button
          type="button"
          onClick={() => setShowExplainer((v) => !v)}
          className="flex w-full items-center justify-between text-left cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Info strokeWidth={1.75} className="h-5 w-5 text-blue-600 shrink-0" />
            <h2 className="text-base font-semibold text-blue-900">
              What is ESIC and why does it matter?
            </h2>
          </div>
          <HelpCircle
            strokeWidth={1.75}
            className={cn(
              "h-4 w-4 text-blue-400 transition-transform",
              showExplainer && "rotate-180"
            )}
          />
        </button>
        {showExplainer && (
          <div className="mt-4 space-y-3 text-sm text-blue-800 leading-relaxed">
            <p>
              The <strong>Early Stage Innovation Company (ESIC)</strong> scheme
              is an Australian Government tax incentive designed to encourage
              investment in innovative startups. If your company qualifies as an
              ESIC, investors in your company can receive:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>20% non-refundable tax offset</strong> on the amount
                paid for shares (capped at $200,000 per investor per year)
              </li>
              <li>
                <strong>Capital gains tax (CGT) exemption</strong> on shares
                held for at least 12 months and less than 10 years
              </li>
            </ul>
            <p>
              This makes ESIC-eligible startups significantly more attractive to
              angel investors and early-stage VCs. It effectively reduces the
              risk for investors by providing direct tax benefits.
            </p>
            <p className="text-xs text-blue-600">
              Source: Australian Taxation Office. This tool is for guidance only
              and does not constitute tax advice.
            </p>
          </div>
        )}
      </div>

      {/* ── Form ───────────────────────────────────────────────────────── */}
      <form onSubmit={handleCalculate} className="space-y-10">
        {/* Innovation Test */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-xl font-bold text-ink-800">
              Innovation Test
            </h2>
            <span className="rounded-full bg-brand-50 border border-brand-200 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
              100-point test
            </span>
          </div>
          <p className="text-sm text-ink-500 mb-6">
            Score at least 100 points across R&D, IP, and government funding to
            pass the Innovation Test.
          </p>

          <div className="space-y-6">
            {INNOVATION_ITEMS.map((item) => (
              <div
                key={item.key}
                className="rounded-xl border border-surface-200 bg-white p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <label className="text-sm font-semibold text-ink-800">
                      {item.label}
                    </label>
                    <p className="text-xs text-ink-500 mt-0.5">
                      {item.description}
                    </p>
                  </div>
                  {item.type === "boolean" ? (
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-ink-400">
                        {item.points} pts
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={
                          innovation[item.key] as boolean
                        }
                        onClick={() =>
                          setInnovation((prev) => ({
                            ...prev,
                            [item.key]: !prev[item.key],
                          }))
                        }
                        className={cn(
                          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer",
                          innovation[item.key]
                            ? "bg-brand-600"
                            : "bg-surface-300"
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
                            innovation[item.key]
                              ? "translate-x-6"
                              : "translate-x-1"
                          )}
                        />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-semibold text-brand-600 tabular-nums w-12 text-right">
                        {innovation[item.key] as number} / {item.max}
                      </span>
                    </div>
                  )}
                </div>
                {item.type === "range" && (
                  <div className="mt-3">
                    <input
                      type="range"
                      min={0}
                      max={item.max}
                      step={5}
                      value={innovation[item.key] as number}
                      onChange={(e) =>
                        setInnovation((prev) => ({
                          ...prev,
                          [item.key]: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-brand-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-ink-400 mt-1">
                      <span>0 pts</span>
                      <span>{item.max} pts</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Innovation Score Preview */}
          <div className="mt-4 rounded-xl bg-surface-50 border border-surface-200 px-5 py-3 flex items-center justify-between">
            <span className="text-sm font-medium text-ink-600">
              Innovation Score
            </span>
            <span
              className={cn(
                "text-lg font-bold tabular-nums",
                innovation.rndExpenditure +
                  innovation.ipDevelopment +
                  innovation.govFunding +
                  (innovation.enforceableIP ? 25 : 0) >=
                  INNOVATION_THRESHOLD
                  ? "text-green-600"
                  : "text-ink-800"
              )}
            >
              {innovation.rndExpenditure +
                innovation.ipDevelopment +
                innovation.govFunding +
                (innovation.enforceableIP ? 25 : 0)}{" "}
              / 175
            </span>
          </div>
        </div>

        {/* ── Early Stage Test ──────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-xl font-bold text-ink-800">
              Early Stage Test
            </h2>
            <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              All 4 required
            </span>
          </div>
          <p className="text-sm text-ink-500 mb-6">
            All four criteria must be true to pass the Early Stage Test
            (alternative path to ESIC eligibility).
          </p>

          <div className="space-y-3">
            {[
              {
                key: "incorporatedUnder6Years" as const,
                label: "Incorporated in Australia for less than 6 years",
                description:
                  "The company was registered with ASIC within the last 6 financial years.",
              },
              {
                key: "expensesUnder1M" as const,
                label: "Total expenses less than $1,000,000 in prior year",
                description:
                  "The company's total expenses in the previous income year were under $1M AUD.",
              },
              {
                key: "revenueUnder200K" as const,
                label: "Revenue less than $200,000 in prior year",
                description:
                  "The company's assessable income in the previous year was under $200K AUD.",
              },
              {
                key: "notListed" as const,
                label: "Not listed on any stock exchange",
                description:
                  "The company is not listed on the ASX or any other stock exchange.",
              },
            ].map((item) => (
              <div
                key={item.key}
                className="rounded-xl border border-surface-200 bg-white p-5 flex items-start justify-between gap-4"
              >
                <div className="flex-1">
                  <label className="text-sm font-semibold text-ink-800">
                    {item.label}
                  </label>
                  <p className="text-xs text-ink-500 mt-0.5">
                    {item.description}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={earlyStage[item.key]}
                  onClick={() =>
                    setEarlyStage((prev) => ({
                      ...prev,
                      [item.key]: !prev[item.key],
                    }))
                  }
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer shrink-0 mt-0.5",
                    earlyStage[item.key]
                      ? "bg-emerald-600"
                      : "bg-surface-300"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
                      earlyStage[item.key]
                        ? "translate-x-6"
                        : "translate-x-1"
                    )}
                  />
                </button>
              </div>
            ))}
          </div>

          {/* Early Stage Preview */}
          <div className="mt-4 rounded-xl bg-surface-50 border border-surface-200 px-5 py-3 flex items-center justify-between">
            <span className="text-sm font-medium text-ink-600">
              Early Stage Criteria Met
            </span>
            <span
              className={cn(
                "text-lg font-bold tabular-nums",
                [
                  earlyStage.incorporatedUnder6Years,
                  earlyStage.expensesUnder1M,
                  earlyStage.revenueUnder200K,
                  earlyStage.notListed,
                ].every(Boolean)
                  ? "text-green-600"
                  : "text-ink-800"
              )}
            >
              {
                [
                  earlyStage.incorporatedUnder6Years,
                  earlyStage.expensesUnder1M,
                  earlyStage.revenueUnder200K,
                  earlyStage.notListed,
                ].filter(Boolean).length
              }{" "}
              / 4
            </span>
          </div>
        </div>

        {/* ── Submit ───────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            className="h-12 px-8 rounded-2xl bg-brand-600 text-base font-bold text-white hover:bg-brand-700 transition-colors cursor-pointer cta-glow"
          >
            Check ESIC Eligibility
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="h-12 px-6 rounded-2xl border border-surface-300 text-sm font-medium text-ink-600 hover:bg-surface-100 transition-colors cursor-pointer"
          >
            Reset
          </button>
        </div>
      </form>

      {/* ── Result ─────────────────────────────────────────────────────── */}
      {result && (
        <div
          className={cn(
            "rounded-2xl border-2 p-6 md:p-8 space-y-5 animate-fade-in",
            result.status === "eligible"
              ? "border-green-300 bg-green-50/60"
              : result.status === "likely"
                ? "border-amber-300 bg-amber-50/60"
                : "border-red-200 bg-red-50/40"
          )}
        >
          <div className="flex items-start gap-4">
            {result.status === "eligible" ? (
              <CheckCircle2
                strokeWidth={1.75}
                className="h-8 w-8 text-green-600 shrink-0 mt-0.5"
              />
            ) : result.status === "likely" ? (
              <AlertTriangle
                strokeWidth={1.75}
                className="h-8 w-8 text-amber-600 shrink-0 mt-0.5"
              />
            ) : (
              <XCircle
                strokeWidth={1.75}
                className="h-8 w-8 text-red-500 shrink-0 mt-0.5"
              />
            )}
            <div>
              <h3
                className={cn(
                  "text-xl font-bold",
                  result.status === "eligible"
                    ? "text-green-800"
                    : result.status === "likely"
                      ? "text-amber-800"
                      : "text-red-800"
                )}
              >
                {result.status === "eligible"
                  ? "Likely ESIC Eligible"
                  : result.status === "likely"
                    ? "Potentially Eligible"
                    : "Unlikely to Qualify"}
              </h3>
              <p className="text-sm text-ink-600 mt-1">
                {result.status === "eligible"
                  ? "Based on your responses, your company appears to meet ESIC eligibility criteria. Investors may qualify for the 20% tax offset and CGT exemption."
                  : result.status === "likely"
                    ? "You're close but may not meet all requirements. Consider speaking with a tax advisor to confirm eligibility."
                    : "Based on your responses, your company does not currently appear to meet ESIC requirements. This may change as your business develops."}
              </p>
            </div>
          </div>

          {/* Score Breakdown */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-surface-200 bg-white p-4">
              <p className="text-xs font-medium text-ink-500 uppercase tracking-wider mb-1">
                Innovation Test
              </p>
              <p className="text-2xl font-bold text-ink-800 tabular-nums">
                {result.innovationScore}{" "}
                <span className="text-sm font-normal text-ink-400">
                  / 175 pts
                </span>
              </p>
              <p
                className={cn(
                  "text-xs font-semibold mt-1",
                  result.innovationScore >= INNOVATION_THRESHOLD
                    ? "text-green-600"
                    : "text-ink-400"
                )}
              >
                {result.innovationScore >= INNOVATION_THRESHOLD
                  ? "PASS (100+ required)"
                  : `Need ${INNOVATION_THRESHOLD - result.innovationScore} more pts`}
              </p>
            </div>
            <div className="rounded-xl border border-surface-200 bg-white p-4">
              <p className="text-xs font-medium text-ink-500 uppercase tracking-wider mb-1">
                Early Stage Test
              </p>
              <p className="text-2xl font-bold text-ink-800 tabular-nums">
                {result.earlyStageCount}{" "}
                <span className="text-sm font-normal text-ink-400">
                  / 4 criteria
                </span>
              </p>
              <p
                className={cn(
                  "text-xs font-semibold mt-1",
                  result.earlyStagePass
                    ? "text-green-600"
                    : "text-ink-400"
                )}
              >
                {result.earlyStagePass
                  ? "PASS (all 4 met)"
                  : `Need all 4 — ${4 - result.earlyStageCount} remaining`}
              </p>
            </div>
          </div>

          {/* Investor Benefits */}
          <div className="rounded-xl border border-surface-200 bg-white p-5">
            <h4 className="text-sm font-semibold text-ink-800 mb-3">
              What ESIC eligibility means for investors
            </h4>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="flex items-start gap-2.5">
                <CheckCircle2
                  strokeWidth={1.75}
                  className="h-4 w-4 text-brand-600 shrink-0 mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-ink-700">
                    20% Tax Offset
                  </p>
                  <p className="text-xs text-ink-500">
                    Non-refundable tax offset on the amount paid for qualifying
                    shares, up to $200K/year per investor.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircle2
                  strokeWidth={1.75}
                  className="h-4 w-4 text-brand-600 shrink-0 mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-ink-700">
                    CGT Exemption
                  </p>
                  <p className="text-xs text-ink-500">
                    Capital gains on qualifying shares held for 12 months to 10
                    years may be exempt from capital gains tax.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center pt-2">
            <Link
              href="/"
              className="inline-flex h-12 items-center gap-2.5 rounded-2xl bg-brand-600 px-8 text-base font-semibold text-white hover:bg-brand-700 transition-colors cta-glow"
            >
              Get your full SVI analysis{" "}
              <ArrowRight strokeWidth={2} className="h-5 w-5" />
            </Link>
            <p className="mt-2 text-xs text-ink-500">
              Free AI-powered Startup Value Index with ESIC insights
            </p>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-ink-400 leading-relaxed">
        <strong>Disclaimer:</strong> This tool provides general guidance only
        and does not constitute legal, financial, or tax advice. ESIC
        eligibility is determined by the Australian Taxation Office (ATO). We
        recommend consulting a qualified tax professional for a formal
        assessment. Rules current as of 2024-25 financial year.
      </p>
    </div>
  );
}
