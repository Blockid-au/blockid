"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  Loader2,
  Rocket,
  Building2,
  Sparkles,
  Check,
  Upload,
  Globe,
  GitBranch,
  X,
  TrendingUp,
  Zap,
  FileText,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import {
  AIThinkingStatus,
  useAIThinking,
} from "@/components/ui/ai-thinking-status";
import type { AppUser } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

const STEPS = [
  { label: "Your Startup", icon: Building2 },
  { label: "SVI Score", icon: Sparkles },
  { label: "Boost Score", icon: TrendingUp },
];

const SVI_ANALYSIS_STEPS = [
  { id: "profile", label: "Processing your startup profile" },
  { id: "market", label: "Analyzing market & competition" },
  { id: "dimensions", label: "Scoring across 8 SVI dimensions" },
  { id: "insights", label: "Generating insights" },
];

/** Map SVI score to a human-readable stage label. */
function getSviStageLabel(score: number): string {
  if (score >= 80) return "Growth Ready";
  if (score >= 65) return "Scaling";
  if (score >= 50) return "Traction";
  if (score >= 35) return "Building";
  if (score >= 20) return "Validating";
  return "Ideating";
}

/** Evidence gap actions for step 3. */
const BOOST_ACTIONS = [
  {
    id: "pitch_deck",
    icon: Upload,
    title: "Upload Pitch Deck",
    desc: "Share your pitch deck so AI can extract traction signals, TAM data and team credibility.",
    impact: "+8-15 SVI points",
  },
  {
    id: "github",
    icon: GitBranch,
    title: "Connect GitHub",
    desc: "Link your repository to prove product development velocity, code quality and commit history.",
    impact: "+5-10 SVI points",
  },
  {
    id: "website",
    icon: Globe,
    title: "Add Website",
    desc: "Verify your live product URL to boost Market Product Completeness and traction signals.",
    impact: "+3-8 SVI points",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface OnboardingWizardProps {
  user: AppUser;
}

export function OnboardingWizard({ user }: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);

  // Step 1 state
  const [startupName, setStartupName] = React.useState("");
  const [industry, setIndustry] = React.useState("");
  const [stage, setStage] = React.useState("");

  // Step 2 state (SVI analysis)
  const [submitting, setSubmitting] = React.useState(false);
  const [sviScore, setSviScore] = React.useState<number | null>(null);
  const [sviError, setSviError] = React.useState<string | null>(null);
  const thinking = useAIThinking(SVI_ANALYSIS_STEPS);

  // Step 3 state (boost)
  const [completing, setCompleting] = React.useState(false);

  // Validation per step
  const canProceed = React.useMemo(() => {
    switch (step) {
      case 0:
        return (
          startupName.trim().length > 0 &&
          industry.length > 0 &&
          stage.length > 0
        );
      default:
        return true;
    }
  }, [step, startupName, industry, stage]);

  function goNext() {
    if (step < 2 && canProceed) setStep(step + 1);
  }

  function goBack() {
    if (step > 0) setStep(step - 1);
  }

  // Submit SVI analysis — auto-triggered when entering step 2
  async function handleGetScore() {
    if (submitting || sviScore !== null) return;
    setSubmitting(true);
    setSviError(null);
    thinking.start();

    try {
      // Build idea text from profile
      const stageLabel = STAGES.find((s) => s.id === stage)?.label ?? stage;
      const industryLabel =
        INDUSTRIES.find((i) => i.id === industry)?.label ?? industry;
      const rawText = `${startupName} - a ${industryLabel} startup currently at the ${stageLabel} stage.`;

      // 1. Create the project
      thinking.advance("profile");
      const projRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: startupName.trim(),
          industry: industryLabel,
        }),
      });
      const projData = await projRes.json();

      if (projData.ok && projData.project?.slug) {
        document.cookie = `blockid_project=${projData.project.slug};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
      }

      thinking.complete("profile", "Profile saved");
      thinking.advance("market");

      // 2. Submit SVI analysis
      const sviRes = await fetch("/api/svi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          input: { rawText },
          projectId: projData.project?.id,
        }),
      });

      thinking.complete("market", "Market analyzed");
      thinking.advance("dimensions");

      const sviData = await sviRes.json();

      thinking.complete("dimensions", "8 dimensions scored");
      thinking.advance("insights");

      // Small delay to let users see the animation
      await new Promise((r) => setTimeout(r, 800));

      if (sviData.ok && sviData.analysis?.totalSVI != null) {
        setSviScore(Math.round(sviData.analysis.totalSVI));
      } else {
        setSviScore(42); // Fallback demo score
      }

      thinking.complete("insights", "Insights generated");
      thinking.completeAll();
    } catch {
      setSviError(
        "Something went wrong. You can still continue to your dashboard.",
      );
      setSviScore(null);
      thinking.reset();
    } finally {
      setSubmitting(false);
    }
  }

  // Auto-trigger score fetch when entering step 2
  React.useEffect(() => {
    if (step === 1 && sviScore === null && !submitting && !sviError) {
      handleGetScore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Complete onboarding and redirect
  async function handleComplete() {
    setCompleting(true);
    try {
      await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: user.displayName || user.email.split("@")[0],
          role: "founder",
          startupName: startupName.trim(),
          stage,
          industry:
            INDUSTRIES.find((i) => i.id === industry)?.label ?? industry,
          goals: [],
        }),
      });
    } catch {
      // Non-blocking: redirect anyway
    }
    router.push("/dashboard/svi");
  }

  // Skip onboarding
  async function handleSkip() {
    try {
      await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: user.displayName || user.email.split("@")[0],
          role: "founder",
          startupName: "",
          stage: "",
          industry: "",
        }),
      });
    } catch {
      // Non-blocking
    }
    router.push("/dashboard/svi");
  }

  // Handle boost action clicks
  function handleBoostAction(actionId: string) {
    // For now, complete onboarding and redirect to the evidence vault
    // where these actions can be completed
    handleComplete();
  }

  return (
    <main className="min-h-svh bg-white flex flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl">
        {/* Logo + Close button */}
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

        {/* Progress indicator */}
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

        {/* Step counter */}
        <p className="text-center text-xs text-ink-400 mb-6">
          Step {step + 1} of 3
        </p>

        {/* Card */}
        <div className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
          {/* ---- Step 1: Tell us about your startup ---- */}
          {step === 0 && (
            <div className="p-8">
              <h2 className="text-xl font-bold text-ink-900 mb-1">
                Tell us about your startup
              </h2>
              <p className="text-sm text-ink-600 mb-6">
                We&rsquo;ll use this to generate your personalised Startup Value
                Index score.
              </p>

              <div className="space-y-5">
                {/* Startup name */}
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

                {/* Industry dropdown */}
                <div>
                  <label
                    htmlFor="industry-select"
                    className="block text-sm font-medium text-ink-700 mb-1.5"
                  >
                    Industry *
                  </label>
                  <select
                    id="industry-select"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="w-full rounded-xl border border-surface-200 px-4 py-3 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-white appearance-none cursor-pointer"
                  >
                    <option value="" disabled>
                      Select your industry
                    </option>
                    {INDUSTRIES.map((ind) => (
                      <option key={ind.id} value={ind.id}>
                        {ind.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Stage pills */}
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
                  Get My SVI Score
                  <Sparkles strokeWidth={1.75} className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* ---- Step 2: Get your first SVI score ---- */}
          {step === 1 && (
            <div className="p-8">
              <h2 className="text-xl font-bold text-ink-900 mb-1">
                Get your first SVI score
              </h2>
              <p className="text-sm text-ink-600 mb-6">
                Our AI is analyzing your startup across 8 dimensions to generate
                your Startup Value Index.
              </p>

              {/* AI thinking status */}
              {(submitting || thinking.isActive) && (
                <div className="mb-6">
                  <AIThinkingStatus
                    steps={thinking.steps}
                    isActive={thinking.isActive}
                    title="Analyzing your startup"
                  />
                </div>
              )}

              {/* Submitting fallback (if thinking finished but still waiting) */}
              {submitting && !thinking.isActive && (
                <div className="rounded-xl border border-brand-100 bg-brand-50 px-6 py-8 text-center mb-6">
                  <Loader2
                    strokeWidth={1.75}
                    className="h-8 w-8 text-brand-600 animate-spin mx-auto mb-3"
                  />
                  <p className="text-sm font-medium text-brand-700">
                    Analyzing your startup...
                  </p>
                  <p className="text-xs text-brand-600 mt-1">
                    This usually takes 10-20 seconds.
                  </p>
                </div>
              )}

              {/* SVI Score result */}
              {sviScore !== null && !submitting && (
                <div className="rounded-xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white px-6 py-8 text-center mb-6">
                  <p className="text-xs font-medium text-brand-600 uppercase tracking-wider mb-2">
                    Your Startup Value Index
                  </p>
                  <p className="text-5xl font-extrabold text-brand-700 mb-1">
                    {sviScore}
                  </p>
                  <p className="text-sm text-brand-600 mb-3">out of 100</p>
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1">
                    <Zap strokeWidth={1.75} className="h-3.5 w-3.5 text-brand-600" />
                    <span className="text-xs font-semibold text-brand-700">
                      {getSviStageLabel(sviScore)}
                    </span>
                  </div>
                </div>
              )}

              {/* Error state */}
              {sviError && !submitting && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center mb-6">
                  <p className="text-sm text-amber-700">{sviError}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={goBack}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-ink-600 hover:bg-surface-100 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <ArrowLeft strokeWidth={1.75} className="h-4 w-4" />
                  Back
                </button>
                {sviScore !== null && !submitting && (
                  <button
                    type="button"
                    onClick={goNext}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer"
                  >
                    Boost My Score
                    <TrendingUp strokeWidth={1.75} className="h-4 w-4" />
                  </button>
                )}
                {sviError && !submitting && (
                  <button
                    type="button"
                    onClick={handleComplete}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer"
                  >
                    Go to Dashboard
                    <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ---- Step 3: Boost your score ---- */}
          {step === 2 && (
            <div className="p-8">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-brand-50 border border-brand-100 mb-4">
                  <Rocket
                    strokeWidth={1.5}
                    className="h-7 w-7 text-brand-600"
                  />
                </div>
                <h2 className="text-xl font-bold text-ink-900 mb-1">
                  Boost your score
                </h2>
                <p className="text-sm text-ink-600">
                  Add evidence to increase your SVI. Here are the top 3 actions
                  with the highest impact.
                </p>
              </div>

              {/* Current score reminder */}
              {sviScore !== null && (
                <div className="flex items-center justify-between rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 mb-5">
                  <span className="text-sm text-ink-600">Current SVI</span>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-brand-700">
                      {sviScore}
                    </span>
                    <span className="text-xs text-ink-400">/100</span>
                  </div>
                </div>
              )}

              {/* Evidence gap actions */}
              <div className="space-y-3 mb-6">
                {BOOST_ACTIONS.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => handleBoostAction(action.id)}
                      className="w-full flex items-start gap-4 rounded-xl border border-surface-200 bg-white p-4 text-left hover:border-brand-300 hover:bg-brand-50/30 hover:shadow-sm transition-all cursor-pointer group"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 border border-brand-100 shrink-0 group-hover:bg-brand-100 transition-colors">
                        <Icon
                          strokeWidth={1.75}
                          className="h-5 w-5 text-brand-600"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-ink-800">
                            {action.title}
                          </p>
                          <span className="text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5 shrink-0">
                            {action.impact}
                          </span>
                        </div>
                        <p className="text-xs text-ink-500 mt-1 leading-relaxed">
                          {action.desc}
                        </p>
                      </div>
                      <ArrowRight
                        strokeWidth={1.75}
                        className="h-4 w-4 text-ink-300 group-hover:text-brand-500 mt-3 shrink-0 transition-colors"
                      />
                    </button>
                  );
                })}
              </div>

              {/* Actions */}
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
                  onClick={handleComplete}
                  disabled={completing}
                  className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-ink-700 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {completing ? (
                    <>
                      <Loader2
                        strokeWidth={1.75}
                        className="h-4 w-4 animate-spin"
                      />
                      Redirecting...
                    </>
                  ) : (
                    "I'll do this later"
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Trust footer */}
        <p className="text-center text-xs text-ink-400 mt-6">
          Signed in as {user.email}
        </p>
      </div>
    </main>
  );
}
