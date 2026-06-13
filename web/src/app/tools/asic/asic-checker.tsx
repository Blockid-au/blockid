"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ASICAnswers {
  hasABN: boolean;
  hasACN: boolean;
  registeredProprietaryLimited: boolean;
  annualReviewPaid: boolean;
  directorsResidentAU: boolean;
  registeredOfficeAU: boolean;
  shareholderRegisterCurrent: boolean;
  minutesRecorded: boolean;
  financialRecordsKept: boolean;
  solvencyDeclaration: boolean;
}

type ComplianceStatus = "compliant" | "at-risk" | "non-compliant";

interface CheckItem {
  key: keyof ASICAnswers;
  label: string;
  description: string;
  critical: boolean;
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

const CHECKS: CheckItem[] = [
  {
    key: "hasABN",
    label: "Australian Business Number (ABN)",
    description:
      "The company holds a current ABN registered with the Australian Business Register (ABR). Required for all business activities.",
    critical: true,
  },
  {
    key: "hasACN",
    label: "Australian Company Number (ACN)",
    description:
      "The company has a registered ACN (9-digit number) issued by ASIC on registration. Must appear on all public documents.",
    critical: true,
  },
  {
    key: "registeredProprietaryLimited",
    label: "Registered as Proprietary Limited (Pty Ltd)",
    description:
      "The company is incorporated as a proprietary limited company under the Corporations Act 2001, limiting director/shareholder liability.",
    critical: true,
  },
  {
    key: "annualReviewPaid",
    label: "Annual review fee paid",
    description:
      "ASIC annual review fee has been paid on time. Late payment triggers penalty fees and eventual deregistration.",
    critical: true,
  },
  {
    key: "directorsResidentAU",
    label: "At least one Australian-resident director",
    description:
      "At least one director ordinarily resides in Australia (s.201A Corporations Act). This is a mandatory legal requirement.",
    critical: true,
  },
  {
    key: "registeredOfficeAU",
    label: "Registered office in Australia",
    description:
      "The company's registered office address is in Australia and is notified to ASIC (s.142 Corporations Act).",
    critical: false,
  },
  {
    key: "shareholderRegisterCurrent",
    label: "Share register up to date",
    description:
      "The company's member (shareholder) register is current and includes all required particulars (name, address, shares held).",
    critical: false,
  },
  {
    key: "minutesRecorded",
    label: "Board/member minutes recorded",
    description:
      "Minutes of all board and shareholder meetings are recorded and retained for at least 7 years (s.251A).",
    critical: false,
  },
  {
    key: "financialRecordsKept",
    label: "Financial records maintained",
    description:
      "The company keeps written financial records that correctly record transactions and can explain financial position (s.286). Required for 7 years.",
    critical: false,
  },
  {
    key: "solvencyDeclaration",
    label: "Solvency declaration signed",
    description:
      "Directors have considered whether the company can pay its debts as they fall due and documented this in the ASIC annual statement.",
    critical: false,
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const INITIAL: ASICAnswers = {
  hasABN: false,
  hasACN: false,
  registeredProprietaryLimited: false,
  annualReviewPaid: false,
  directorsResidentAU: false,
  registeredOfficeAU: false,
  shareholderRegisterCurrent: false,
  minutesRecorded: false,
  financialRecordsKept: false,
  solvencyDeclaration: false,
};

export function ASICChecker() {
  const [answers, setAnswers] = React.useState<ASICAnswers>(INITIAL);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [showResult, setShowResult] = React.useState(false);

  const criticalFailed = CHECKS.filter(
    (c) => c.critical && !answers[c.key],
  ).length;
  const nonCriticalFailed = CHECKS.filter(
    (c) => !c.critical && !answers[c.key],
  ).length;
  const allPassed = criticalFailed === 0 && nonCriticalFailed === 0;

  function status(): ComplianceStatus {
    if (criticalFailed > 0) return "non-compliant";
    if (nonCriticalFailed > 0) return "at-risk";
    return "compliant";
  }

  const answeredCount = Object.values(answers).filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Checklist */}
      <div className="space-y-3">
        {CHECKS.map((item) => {
          const isExpanded = expanded === item.key;
          const checked = answers[item.key];
          return (
            <div
              key={item.key}
              className={cn(
                "rounded-xl border transition-colors",
                checked
                  ? "border-green-200 bg-green-50/40"
                  : item.critical
                    ? "border-red-200 bg-red-50/30"
                    : "border-surface-200 bg-white",
              )}
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  id={item.key}
                  checked={checked}
                  onChange={(e) =>
                    setAnswers((prev) => ({
                      ...prev,
                      [item.key]: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-surface-300 text-brand-600 accent-brand-600 cursor-pointer"
                />
                <label
                  htmlFor={item.key}
                  className="flex-1 text-sm font-medium text-ink-700 cursor-pointer select-none"
                >
                  {item.label}
                  {item.critical && (
                    <span className="ml-2 text-xs font-semibold text-red-600 uppercase tracking-wide">
                      required
                    </span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setExpanded(isExpanded ? null : item.key)
                  }
                  className="text-ink-400 hover:text-ink-600 transition-colors"
                  aria-label="Toggle info"
                >
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
              </div>
              {isExpanded && (
                <div className="px-4 pb-3">
                  <p className="text-xs text-ink-500 leading-relaxed border-t border-surface-100 pt-2">
                    <Info className="inline h-3.5 w-3.5 mr-1 text-ink-400 align-text-bottom" />
                    {item.description}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* CTA */}
      <button
        type="button"
        disabled={answeredCount === 0}
        onClick={() => setShowResult(true)}
        className={cn(
          "w-full rounded-xl py-3 text-sm font-semibold transition-colors",
          answeredCount > 0
            ? "bg-brand-600 text-white hover:bg-brand-700 cursor-pointer"
            : "bg-surface-200 text-ink-400 cursor-not-allowed",
        )}
      >
        Check ASIC Compliance
      </button>

      {/* Result */}
      {showResult && (
        <div
          className={cn(
            "rounded-2xl border p-6",
            status() === "compliant"
              ? "border-green-200 bg-green-50"
              : status() === "at-risk"
                ? "border-amber-200 bg-amber-50"
                : "border-red-200 bg-red-50",
          )}
        >
          <div className="flex items-start gap-3 mb-4">
            {status() === "compliant" ? (
              <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0 mt-0.5" />
            ) : status() === "at-risk" ? (
              <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
            )}
            <div>
              <h3
                className={cn(
                  "font-bold text-base",
                  status() === "compliant"
                    ? "text-green-800"
                    : status() === "at-risk"
                      ? "text-amber-800"
                      : "text-red-800",
                )}
              >
                {status() === "compliant"
                  ? "Your company appears ASIC-compliant"
                  : status() === "at-risk"
                    ? "Your company has compliance gaps"
                    : "Your company has critical ASIC failures"}
              </h3>
              <p
                className={cn(
                  "text-sm mt-1",
                  status() === "compliant"
                    ? "text-green-700"
                    : status() === "at-risk"
                      ? "text-amber-700"
                      : "text-red-700",
                )}
              >
                {status() === "compliant"
                  ? "All 10 ASIC compliance requirements are met. Keep your records up to date."
                  : status() === "at-risk"
                    ? `${nonCriticalFailed} non-critical gap${nonCriticalFailed > 1 ? "s" : ""} found. Address these to reduce risk.`
                    : `${criticalFailed} critical requirement${criticalFailed > 1 ? "s" : ""} missing. Take immediate action to avoid deregistration.`}
              </p>
            </div>
          </div>

          {!allPassed && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500 mb-2">
                Action required
              </p>
              <ul className="space-y-1.5">
                {CHECKS.filter((c) => !answers[c.key]).map((c) => (
                  <li key={c.key} className="flex items-start gap-2 text-xs">
                    <span
                      className={cn(
                        "mt-0.5 h-1.5 w-1.5 rounded-full shrink-0",
                        c.critical ? "bg-red-500" : "bg-amber-500",
                      )}
                    />
                    <span className="text-ink-700">
                      <span className="font-medium">{c.label}</span>
                      {c.critical && (
                        <span className="text-red-600 ml-1">(critical)</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-4 text-xs text-ink-400">
            This tool provides educational guidance only — not legal advice.
            Consult a registered company secretary or solicitor for your
            specific situation.
          </p>
        </div>
      )}
    </div>
  );
}
