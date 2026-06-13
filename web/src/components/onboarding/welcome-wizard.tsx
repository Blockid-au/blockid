"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  Loader2,
  Building2,
  Compass,
  Sparkles,
  Check,
  X,
  Target,
  TrendingUp,
  Users,
  ShieldCheck,
  BarChart3,
  Lightbulb,
  Briefcase,
  Rocket,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import type { AppUser } from "@/lib/auth";

const INDUSTRIES = [
  { id: "saas", label: "SaaS" },
  { id: "marketplace", label: "Marketplace" },
  { id: "fintech", label: "FinTech" },
  { id: "healthtech", label: "HealthTech" },
  { id: "edtech", label: "EdTech" },
  { id: "ecommerce", label: "E-commerce" },
  { id: "deeptech", label: "DeepTech" },
  { id: "other", label: "Other" },
];

const STAGES = [
  { id: "idea", label: "Idea" },
  { id: "validated", label: "Validated" },
  { id: "mvp", label: "MVP" },
  { id: "traction", label: "Traction" },
  { id: "revenue", label: "Revenue" },
  { id: "growth", label: "Growth" },
];

const TARGET_RAISES = [
  { id: "0", label: "Not raising yet" },
  { id: "250000", label: "$250K" },
  { id: "500000", label: "$500K" },
  { id: "1000000", label: "$1M" },
  { id: "2500000", label: "$2.5M" },
  { id: "5000000", label: "$5M+" },
];

const INTENTS = [
  {
    id: "raising_now",
    icon: Rocket,
    title: "Raising now",
    desc: "I'm in the middle of a round or kicking one off in the next 1-3 months.",
  },
  {
    id: "preparing",
    icon: Target,
    title: "Preparing to raise",
    desc: "I plan to raise in the next 3-6 months and want to be investor-ready.",
  },
  {
    id: "exploring",
    icon: Compass,
    title: "Exploring",
    desc: "I'm benchmarking, validating, or building before any raise conversation.",
  },
];

const SVI_DIMENSIONS = [
  { icon: Users, title: "Founder & Team", desc: "Track record, complementary skills, advisor depth" },
  { icon: Lightbulb, title: "Market & Problem", desc: "TAM/SAM clarity, customer pain validation" },
  { icon: BarChart3, title: "Product & Tech", desc: "Build velocity, defensibility, IP" },
  { icon: TrendingUp, title: "Traction & Revenue", desc: "ARR, growth rate, retention" },
  { icon: Briefcase, title: "Cap Table & Governance", desc: "Vesting, share classes, board" },
  { icon: ShieldCheck, title: "Investor Readiness", desc: "Pitch deck, model, data room" },
  { icon: Building2, title: "Legal & Compliance", desc: "ABN/ACN, IP, contracts" },
  { icon: Sparkles, title: "Strategic Vision & Moat", desc: "Defensible advantage, vision clarity" },
];

const STEPS = [
  { label: "Your Startup", icon: Building2 },
  { label: "Your Intent", icon: Compass },
  { label: "Action Plan", icon: Sparkles },
];

interface WelcomeWizardProps {
  user: AppUser;
}

export function WelcomeWizard({ user }: WelcomeWizardProps) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);

  // Step 1
  const [startupName, setStartupName] = React.useState(user.startupName ?? "");
  const [industry, setIndustry] = React.useState(user.industry ?? "");
  const [stage, setStage] = React.useState(user.startupStage ?? "");
  const [targetRaise, setTargetRaise] = React.useState("");

  // Step 2
  const [intent, setIntent] = React.useState("");

  // Step 3
  const [completing, setCompleting] = React.useState(false);

  const canProceed = React.useMemo(() => {
    if (step === 0) {
      return (
        startupName.trim().length > 0 &&
        industry.length > 0 &&
        stage.length > 0 &&
        targetRaise.length > 0
      );
    }
    if (step === 1) return intent.length > 0;
    return true;
  }, [step, startupName, industry, stage, targetRaise, intent]);

  function goNext() {
    if (step < 2 && canProceed) setStep(step + 1);
  }
  function goBack() {
    if (step > 0) setStep(step - 1);
  }

  async function persist(args: { skipped?: boolean }) {
    const industryLabel =
      INDUSTRIES.find((i) => i.id === industry)?.label ?? industry;
    const goals: string[] = [];
    if (targetRaise) goals.push(`target_raise:${targetRaise}`);
    if (intent) goals.push(`intent:${intent}`);

    try {
      await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: user.displayName || user.email.split("@")[0],
          role: "founder",
          startupName: args.skipped ? "" : startupName.trim(),
          stage: args.skipped ? "" : stage,
          industry: args.skipped ? "" : industryLabel,
          goals: args.skipped ? [] : goals,
        }),
      });
    } catch {
      // Non-blocking
    }
  }

  async function handleFinish() {
    setCompleting(true);
    await persist({ skipped: false });
    router.push("/score");
  }

  async function handleSkip() {
    await persist({ skipped: true });
    router.push("/dashboard");
  }

  return (
    <main className="min-h-svh bg-white flex flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl">
        <div className="flex items-center justify-between mb-8">
          <div className="w-8" />
          <Logo variant="light" />
          <button
            type="button"
            onClick={handleSkip}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-ink-400 hover:text-ink-700 hover:bg-surface-100 transition-colors cursor-pointer"
            aria-label="Skip onboarding"
            title="Skip for now"
          >
            <X strokeWidth={1.75} className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center justify-center gap-2 mb-4">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isComplete = i < step;
            return (
              <React.Fragment key={s.label}>
                {i > 0 && (
                  <div
                    className={`w-10 h-px transition-colors ${
                      isComplete ? "bg-brand-500" : "bg-surface-300"
                    }`}
                  />
                )}
                <div
                  className={`flex items-center justify-center h-9 w-9 rounded-full transition-all ${
                    isActive
                      ? "bg-brand-600 text-white shadow-sm"
                      : isComplete
                        ? "bg-brand-100 text-brand-700"
                        : "bg-surface-200 text-ink-400"
                  }`}
                >
                  {isComplete ? (
                    <Check strokeWidth={2.5} className="h-4 w-4" />
                  ) : (
                    <Icon strokeWidth={1.75} className="h-4 w-4" />
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>

        <p className="text-center text-xs text-ink-400 mb-6">
          Step {step + 1} of 3
        </p>

        <div className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
          {step === 0 && (
            <div className="p-8">
              <h2 className="text-xl font-bold text-ink-900 mb-1">
                Tell us about your startup
              </h2>
              <p className="text-sm text-ink-600 mb-6">
                A 30-second profile that personalises your SVI benchmarks and
                action plan.
              </p>

              <div className="space-y-5">
                <div>
                  <label
                    htmlFor="startup-name"
                    className="block text-sm font-medium text-ink-700 mb-1.5"
                  >
                    Startup name *
                  </label>
                  <input
                    id="startup-name"
                    type="text"
                    required
                    maxLength={100}
                    value={startupName}
                    onChange={(e) => setStartupName(e.target.value)}
                    placeholder="e.g. PayRight, GreenGrid, SkillForge"
                    className="w-full rounded-xl border border-surface-200 px-4 py-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    autoFocus
                  />
                </div>

                <div>
                  <label
                    htmlFor="industry-select"
                    className="block text-sm font-medium text-ink-700 mb-1.5"
                  >
                    Sector *
                  </label>
                  <select
                    id="industry-select"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="w-full rounded-xl border border-surface-200 px-4 py-3 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-white appearance-none cursor-pointer"
                  >
                    <option value="" disabled>
                      Select your sector
                    </option>
                    {INDUSTRIES.map((ind) => (
                      <option key={ind.id} value={ind.id}>
                        {ind.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-1.5">
                    Stage *
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {STAGES.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setStage(s.id)}
                        className={`rounded-full border px-4 py-2 text-sm font-medium transition-all cursor-pointer ${
                          stage === s.id
                            ? "border-brand-300 bg-brand-50 text-brand-700 ring-2 ring-brand-100"
                            : "border-surface-200 bg-white text-ink-700 hover:border-brand-200 hover:bg-surface-50"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-1.5">
                    Target raise (AUD) *
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {TARGET_RAISES.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setTargetRaise(r.id)}
                        className={`rounded-full border px-4 py-2 text-sm font-medium transition-all cursor-pointer ${
                          targetRaise === r.id
                            ? "border-brand-300 bg-brand-50 text-brand-700 ring-2 ring-brand-100"
                            : "border-surface-200 bg-white text-ink-700 hover:border-brand-200 hover:bg-surface-50"
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-8">
                <button
                  type="button"
                  onClick={handleSkip}
                  className="text-sm text-ink-400 hover:text-ink-600 transition-colors cursor-pointer"
                >
                  Skip for now
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={!canProceed}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                  <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="p-8">
              <h2 className="text-xl font-bold text-ink-900 mb-1">
                What brings you here?
              </h2>
              <p className="text-sm text-ink-600 mb-6">
                We&rsquo;ll tailor your roadmap to where you actually are in the
                journey.
              </p>

              <div className="space-y-3">
                {INTENTS.map((it) => {
                  const Icon = it.icon;
                  const selected = intent === it.id;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => setIntent(it.id)}
                      className={`w-full flex items-start gap-4 rounded-xl border p-4 text-left transition-all cursor-pointer ${
                        selected
                          ? "border-brand-300 bg-brand-50/60 ring-2 ring-brand-100"
                          : "border-surface-200 bg-white hover:border-brand-200 hover:bg-surface-50"
                      }`}
                    >
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 ${
                          selected
                            ? "bg-brand-100 border border-brand-200"
                            : "bg-surface-100 border border-surface-200"
                        }`}
                      >
                        <Icon
                          strokeWidth={1.75}
                          className={`h-5 w-5 ${selected ? "text-brand-600" : "text-ink-500"}`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-ink-800">
                          {it.title}
                        </p>
                        <p className="text-xs text-ink-500 mt-1 leading-relaxed">
                          {it.desc}
                        </p>
                      </div>
                      {selected && (
                        <Check
                          strokeWidth={2.25}
                          className="h-5 w-5 text-brand-600 shrink-0 mt-1"
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between mt-8">
                <button
                  type="button"
                  onClick={goBack}
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-ink-600 hover:bg-surface-100 transition-colors cursor-pointer"
                >
                  <ArrowLeft strokeWidth={1.75} className="h-4 w-4" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={!canProceed}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  See Action Plan
                  <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="p-8">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-brand-50 border border-brand-100 mb-4">
                  <Sparkles
                    strokeWidth={1.5}
                    className="h-7 w-7 text-brand-600"
                  />
                </div>
                <h2 className="text-xl font-bold text-ink-900 mb-1">
                  Your action plan
                </h2>
                <p className="text-sm text-ink-600">
                  The BlockID Startup Value Index scores you across these 8
                  dimensions. Every action you take feeds into your live score.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                {SVI_DIMENSIONS.map((d) => {
                  const Icon = d.icon;
                  return (
                    <div
                      key={d.title}
                      className="flex items-start gap-3 rounded-xl border border-surface-200 bg-surface-50/40 p-3"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 border border-brand-100 shrink-0">
                        <Icon
                          strokeWidth={1.75}
                          className="h-4 w-4 text-brand-600"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-ink-800">
                          {d.title}
                        </p>
                        <p className="text-[11px] text-ink-500 mt-0.5 leading-snug">
                          {d.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4 mb-6">
                <p className="text-xs text-brand-700 leading-relaxed">
                  <strong>Next:</strong> we&rsquo;ll run your first SVI analysis
                  in about 60 seconds, then drop you into your live dashboard
                  with the top 3 actions to lift your score.
                </p>
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={goBack}
                  disabled={completing}
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-ink-600 hover:bg-surface-100 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <ArrowLeft strokeWidth={1.75} className="h-4 w-4" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleFinish}
                  disabled={completing}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {completing ? (
                    <>
                      <Loader2
                        strokeWidth={1.75}
                        className="h-4 w-4 animate-spin"
                      />
                      Starting…
                    </>
                  ) : (
                    <>
                      Run my first SVI
                      <Sparkles strokeWidth={1.75} className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-ink-400 mt-6">
          Signed in as {user.email}
        </p>
      </div>
    </main>
  );
}
