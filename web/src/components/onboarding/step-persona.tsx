"use client";

// Step 1 · "Who are you" — G13-W4-IA4 (spec §B.3 row 1). Same screen for
// both flows: a radiogroup over the five wizard personas and one Continue.
// The pick writes `app_users.account_type` (+ derived segment) through
// /api/onboarding/save-progress and decides which flow steps 2–3 run.
//
// G13-W5-IA5 (W4 review P3-a): `options` narrows the cards. The page passes
// `personaOptionsFor(current, { onboardingCompleted, ownsProject })`, so a
// founder who already owns a project or finished onboarding sees only the
// founder card — the evaluator choices are hidden, and the API refuses them
// with 400 persona_locked anyway.

import * as React from "react";
import { ArrowRight, Rocket, TrendingUp, Building, Users, Layers } from "lucide-react";
import { useLocale, type Locale } from "@/lib/use-locale";
import { WIZARD_PERSONAS, type WizardPersona } from "@/lib/onboarding/flow";

const PERSONA_CARDS: Record<WizardPersona, { label: { en: string; vi: string }; tagline: { en: string; vi: string }; icon: typeof Rocket }> = {
  founder: {
    label: { en: "Founder", vi: "Nhà sáng lập" },
    tagline: { en: "Score your startup, fix the gaps, raise faster.", vi: "Chấm điểm startup, vá lỗ hổng, gọi vốn nhanh hơn." },
    icon: Rocket,
  },
  investor_angel: {
    label: { en: "Angel investor", vi: "Nhà đầu tư thiên thần" },
    tagline: { en: "Screen deals and track the startups you back.", vi: "Sàng lọc thương vụ và theo dõi startup bạn đầu tư." },
    icon: TrendingUp,
  },
  investor_vc: {
    label: { en: "VC / fund", vi: "Quỹ đầu tư" },
    tagline: { en: "Run a deal-flow pipeline against your mandate.", vi: "Vận hành pipeline thương vụ theo khẩu vị đầu tư." },
    icon: Building,
  },
  advisor: {
    label: { en: "Advisor", vi: "Cố vấn" },
    tagline: { en: "Keep every client's score and evidence in one place.", vi: "Điểm số và bằng chứng của mọi khách hàng ở một nơi." },
    icon: Users,
  },
  accelerator: {
    label: { en: "Accelerator", vi: "Vườn ươm" },
    tagline: { en: "Rank applications and report on the cohort.", vi: "Xếp hạng hồ sơ và báo cáo về khóa ươm." },
    icon: Layers,
  },
};

const COPY: Record<Locale, { title: string; subtitle: string; lockedSubtitle: string; continue: string; pick: string }> = {
  en: {
    title: "Who are you?",
    subtitle: "We set up the right desk, steps and reports for you. You can change this later in Settings.",
    lockedSubtitle: "Your desk is already set up for this role. Contact support to change it.",
    continue: "Continue",
    pick: "Pick one to continue.",
  },
  vi: {
    title: "Bạn là ai?",
    subtitle: "Chúng tôi sẽ thiết lập bàn làm việc, các bước và báo cáo phù hợp. Bạn có thể đổi sau trong Cài đặt.",
    lockedSubtitle: "Bàn làm việc của bạn đã được thiết lập cho vai trò này. Liên hệ hỗ trợ để thay đổi.",
    continue: "Tiếp tục",
    pick: "Chọn một vai trò để tiếp tục.",
  },
};

export interface StepPersonaProps {
  value: WizardPersona | undefined;
  onChange: (p: WizardPersona) => void;
  onContinue: () => void;
  /** Cards to offer — defaults to all five; the page narrows it when the persona is locked (S-IA5). */
  options?: readonly WizardPersona[];
}

export function StepPersona({ value, onChange, onContinue, options = WIZARD_PERSONAS }: StepPersonaProps) {
  const [locale] = useLocale();
  const copy = COPY[locale];
  const [touched, setTouched] = React.useState(false);
  const groupId = React.useId();
  const locked = options.length < WIZARD_PERSONAS.length;

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setTouched(true);
    if (value) onContinue();
  }

  return (
    <form onSubmit={submit} data-wizard-step="persona" data-persona-locked={locked ? "1" : "0"}>
      <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">{copy.title}</h1>
      <p className="mt-2 text-brand-ink-muted">{locked ? copy.lockedSubtitle : copy.subtitle}</p>

      <fieldset className="mt-8">
        <legend className="sr-only">{copy.title}</legend>
        <div role="radiogroup" aria-labelledby={`${groupId}-legend`} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <span id={`${groupId}-legend`} className="sr-only">{copy.title}</span>
          {options.map((id) => {
            const card = PERSONA_CARDS[id];
            const Icon = card.icon;
            const on = value === id;
            const inputId = `${groupId}-${id}`;
            return (
              <label
                key={id}
                htmlFor={inputId}
                data-persona-option={id}
                data-on={on ? "1" : "0"}
                className={`group flex cursor-pointer flex-col items-start gap-3 rounded-2xl border p-6 text-left transition-all focus-within:ring-2 focus-within:ring-brand-cyan ${on ? "border-brand-cyan bg-brand-navy-elev-2" : "border-brand-cyan/15 bg-brand-navy-elev-1 hover:border-brand-cyan/40 hover:bg-brand-navy-elev-2"}`}
              >
                <input id={inputId} type="radio" name="persona" value={id} checked={on} onChange={() => onChange(id)} className="sr-only" aria-label={card.label[locale]} />
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-cyan/10 text-brand-cyan transition-colors group-hover:bg-brand-cyan/20">
                  <Icon aria-hidden="true" className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-brand-ink">{card.label[locale]}</p>
                  <p className="mt-1 text-sm text-brand-ink-muted">{card.tagline[locale]}</p>
                </div>
              </label>
            );
          })}
        </div>
      </fieldset>

      {touched && !value ? (
        <p role="alert" className="mt-4 text-sm text-red-400">
          {copy.pick}
        </p>
      ) : null}

      <div className="mt-8 flex justify-end">
        <button
          type="submit"
          data-testid="wizard-continue"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-cyan px-6 py-3 text-sm font-semibold text-brand-navy transition-colors hover:bg-brand-blue-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
        >
          {copy.continue}
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}
