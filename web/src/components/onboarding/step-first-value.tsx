"use client";

// Step 3 · "First value" — G13-W4-IA4 (spec §B.3 row 3).
//
//   founder    "Run your first analysis" → /analyze
//   evaluator  "Add the first startup you're evaluating" →
//              /workspace/evaluations?add=1 (or pick from the Startup Index)
//
// A `?plan=` that rode in from a pricing card turns the primary CTA into
// "Start your <plan> trial" → Billing checkout with the SAME interval the
// card showed (annual stays annual — `ebba4641d`); the first-value action
// becomes the secondary link. Either exit marks onboarding complete.

import * as React from "react";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { useLocale, type Locale } from "@/lib/use-locale";
import { PLANS_V2 } from "@/lib/plans-v2";
import { evaluatorPlanLabel } from "@/lib/plans/signup-plans";
import { signedInSignupRedirect } from "@/lib/plans/signed-in-upgrade";
import { FIRST_VALUE_HREF, flowForPersona, onboardingExitHref, type WizardPersona } from "@/lib/onboarding/flow";

const COPY: Record<Locale, Record<string, string>> = {
  en: {
    founderTitle: "Run your first analysis",
    founderSub: "Three minutes, eight dimensions, a baseline score and the first three things to fix. Your desk builds itself from it.",
    founderCta: "Run analysis",
    evaluatorTitle: "Add the first startup you're evaluating",
    evaluatorSub: "Paste a website or pick from the Startup Index. Each startup gets the same 8-dimension score, and your desk tracks the movers every week.",
    evaluatorCta: "Add a startup",
    evaluatorAlt: "Pick from the Startup Index",
    trialCta: "Start your {plan} trial",
    trialLine: "Card required · {days} days free · {cadence} billing after the trial unless you cancel.",
    later: "Skip — go to my desk",
    finishing: "Opening…",
    annual: "Annual",
    monthly: "Monthly",
  },
  vi: {
    founderTitle: "Chạy phân tích đầu tiên",
    founderSub: "Ba phút, tám chiều, một điểm cơ sở và ba việc cần sửa đầu tiên. Bàn làm việc của bạn được dựng từ đó.",
    founderCta: "Chạy phân tích",
    evaluatorTitle: "Thêm startup đầu tiên bạn đang đánh giá",
    evaluatorSub: "Dán website hoặc chọn từ Chỉ số Startup. Mỗi startup nhận cùng một điểm 8 chiều và bàn làm việc theo dõi biến động hằng tuần.",
    evaluatorCta: "Thêm startup",
    evaluatorAlt: "Chọn từ Chỉ số Startup",
    trialCta: "Bắt đầu dùng thử {plan}",
    trialLine: "Cần thẻ · {days} ngày miễn phí · thanh toán {cadence} sau dùng thử trừ khi bạn hủy.",
    later: "Bỏ qua — vào bàn làm việc",
    finishing: "Đang mở…",
    annual: "hằng năm",
    monthly: "hằng tháng",
  },
};

export function planLabel(planId: string | undefined): string | null {
  if (!planId) return null;
  return evaluatorPlanLabel(planId) ?? PLANS_V2.find((p) => p.id === planId)?.name ?? planId;
}

export interface FirstValueTargets {
  primary: { href: string; kind: "trial" | "first_value" };
  secondary: { href: string; label: "first_value" | "index" } | null;
  exit: string;
}

/** Pure: where the three exits go (pinned by the wizard test — the interval must survive). */
export function firstValueTargets(state: { persona?: WizardPersona; planId?: string; interval?: "monthly" | "annual" }): FirstValueTargets {
  const flow = flowForPersona(state.persona);
  const firstValue = FIRST_VALUE_HREF[flow === "evaluator" ? "evaluator" : "founder"];
  const exit = onboardingExitHref(state.persona);
  if (state.planId) {
    return {
      // G25-D: the review step, never an auto-checkout.
      primary: { href: signedInSignupRedirect(state.planId, state.interval, "onboarding"), kind: "trial" },
      secondary: { href: firstValue, label: "first_value" },
      exit,
    };
  }
  return {
    primary: { href: firstValue, kind: "first_value" },
    secondary: flow === "evaluator" ? { href: "/startup-index", label: "index" } : null,
    exit,
  };
}

export interface StepFirstValueProps {
  persona: WizardPersona | undefined;
  planId?: string;
  interval?: "monthly" | "annual";
  /** Called with the destination; the wizard marks completion and navigates. */
  onFinish: (href: string, action: string) => Promise<void> | void;
  finishing: boolean;
}

export function StepFirstValue({ persona, planId, interval, onFinish, finishing }: StepFirstValueProps) {
  const [locale] = useLocale();
  const t = COPY[locale];
  const flow = flowForPersona(persona);
  const evaluator = flow === "evaluator";
  const targets = firstValueTargets({ persona, planId, interval });
  const label = planLabel(planId);
  const cadence = interval === "annual" ? t.annual : t.monthly;
  // G20-F3: the trial length is the plan row's (Programs rungs run 14 days,
  // founder / evaluator rungs 7) — never a typed "7".
  const trialDaysN = PLANS_V2.find((p) => p.id === planId)?.trial_days ?? 0;
  const trialDays = String(trialDaysN);

  const primary = "inline-flex items-center justify-center gap-2 rounded-xl bg-action px-6 py-3 text-sm font-semibold text-on-action transition-colors hover:bg-action-hover disabled:opacity-40";
  const link = "inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-muted underline decoration-line-strong underline-offset-4 hover:text-action disabled:opacity-40";

  return (
    <div data-wizard-step="first-value" data-wizard-flow={flow} data-wizard-interval={interval ?? ""}>
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">{evaluator ? t.evaluatorTitle : t.founderTitle}</h1>
      <p className="mt-2 text-muted">{evaluator ? t.evaluatorSub : t.founderSub}</p>

      {/* G20 review: custom / free rungs carry trial_days 0 — never render "0 days free". */}
      {targets.primary.kind === "trial" && label && trialDaysN > 0 ? (
        <p className="mt-4 text-sm text-muted" data-wizard-trial-line>
          {t.trialLine.replace("{cadence}", cadence).replace("{days}", trialDays)}
        </p>
      ) : null}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          {targets.secondary ? (
            <button type="button" disabled={finishing} onClick={() => onFinish(targets.secondary!.href, targets.secondary!.label)} data-testid="wizard-secondary" data-href={targets.secondary.href} className={link}>
              {targets.secondary.label === "index" ? t.evaluatorAlt : evaluator ? t.evaluatorCta : t.founderCta}
            </button>
          ) : null}
          <button type="button" disabled={finishing} onClick={() => onFinish(targets.exit, "skip")} data-testid="wizard-skip" data-href={targets.exit} className={link}>
            {t.later}
          </button>
        </div>
        <button type="button" disabled={finishing} onClick={() => onFinish(targets.primary.href, targets.primary.kind)} data-testid="wizard-continue" data-href={targets.primary.href} className={primary}>
          {finishing ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Sparkles aria-hidden="true" className="h-4 w-4" />}
          {finishing ? t.finishing : targets.primary.kind === "trial" && label ? t.trialCta.replace("{plan}", label) : evaluator ? t.evaluatorCta : t.founderCta}
          {!finishing ? <ArrowRight aria-hidden="true" className="h-4 w-4" /> : null}
        </button>
      </div>
    </div>
  );
}
