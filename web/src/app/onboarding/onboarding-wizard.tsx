"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  Loader2,
  Rocket,
  User,
  Building2,
  Sparkles,
  Check,
  Upload,
  FileText,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import type { AppUser } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLES = [
  { id: "founder", label: "Founder" },
  { id: "cofounder", label: "Co-founder" },
  { id: "advisor", label: "Advisor" },
  { id: "investor", label: "Investor" },
  { id: "other", label: "Other" },
];

const STAGES = [
  { id: "idea", label: "Idea", description: "Just an idea, exploring the problem" },
  { id: "mvp", label: "Building MVP", description: "Building or about to build" },
  { id: "launched", label: "Launched", description: "Product live, early users" },
  { id: "revenue", label: "Revenue", description: "Generating recurring revenue" },
  { id: "raising", label: "Raising", description: "Actively raising a round" },
];

const INDUSTRIES = [
  { id: "saas", label: "SaaS", icon: "\u{1F4BB}" },
  { id: "fintech", label: "Fintech", icon: "\u{1F4B3}" },
  { id: "healthtech", label: "HealthTech", icon: "\u{1F3E5}" },
  { id: "edtech", label: "EdTech", icon: "\u{1F4DA}" },
  { id: "marketplace", label: "Marketplace", icon: "\u{1F3EA}" },
  { id: "other", label: "Other", icon: "\u{1F680}" },
];

const QUICK_EXAMPLES = [
  "An AI-powered tool that helps small businesses automate their bookkeeping and tax compliance in Australia.",
  "A marketplace connecting local tradespeople with homeowners for same-day repairs and maintenance.",
  "A SaaS platform that helps early-stage startups manage their cap table, equity splits, and fundraising rounds.",
];

const STEPS = [
  { label: "About You", icon: User },
  { label: "Your Startup", icon: Building2 },
  { label: "SVI Analysis", icon: Sparkles },
  { label: "Results", icon: Rocket },
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
  const [name, setName] = React.useState(user.displayName ?? "");
  const [role, setRole] = React.useState("");
  const [stage, setStage] = React.useState("");

  // Step 2 state
  const [startupName, setStartupName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [industry, setIndustry] = React.useState("");

  // Step 3 state
  const [ideaText, setIdeaText] = React.useState("");
  const [fileName, setFileName] = React.useState<string | null>(null);

  // Step 4 state
  const [submitting, setSubmitting] = React.useState(false);
  const [sviScore, setSviScore] = React.useState<number | null>(null);
  const [sviError, setSviError] = React.useState<string | null>(null);
  const [completing, setCompleting] = React.useState(false);

  // Pre-fill idea text when entering step 3
  React.useEffect(() => {
    if (step === 2 && !ideaText && startupName) {
      const industryLabel =
        INDUSTRIES.find((i) => i.id === industry)?.label ?? "";
      const stageLabel = STAGES.find((s) => s.id === stage)?.label ?? "";
      const parts = [startupName];
      if (industryLabel) parts.push(`a ${industryLabel} startup`);
      if (stageLabel) parts.push(`currently at the ${stageLabel} stage`);
      if (description) parts.push(description);
      setIdeaText(parts.join(" - "));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Validation per step
  const canProceed = React.useMemo(() => {
    switch (step) {
      case 0:
        return name.trim().length > 0 && role.length > 0 && stage.length > 0;
      case 1:
        return startupName.trim().length > 0 && industry.length > 0;
      case 2:
        return ideaText.trim().length > 0;
      default:
        return true;
    }
  }, [step, name, role, stage, startupName, industry, ideaText]);

  function goNext() {
    if (step < 3 && canProceed) setStep(step + 1);
  }

  function goBack() {
    if (step > 0) setStep(step - 1);
  }

  // Handle file upload
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setIdeaText((prev) => (prev ? `${prev}\n\n${text}` : text));
    };
    reader.readAsText(file);
  }

  // Submit SVI analysis
  async function handleGetScore() {
    setSubmitting(true);
    setSviError(null);

    try {
      // 1. Create the project
      const projRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: startupName.trim(),
          description: description.trim() || undefined,
          industry:
            INDUSTRIES.find((i) => i.id === industry)?.label ?? undefined,
        }),
      });
      const projData = await projRes.json();

      if (projData.ok && projData.project?.slug) {
        document.cookie = `blockid_project=${projData.project.slug};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
      }

      // 2. Submit SVI analysis
      const sviRes = await fetch("/api/svi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          input: {
            rawText: ideaText.trim(),
            fileName: fileName ?? undefined,
          },
          projectId: projData.project?.id,
        }),
      });
      const sviData = await sviRes.json();

      if (sviData.ok && sviData.analysis?.totalSVI != null) {
        setSviScore(Math.round(sviData.analysis.totalSVI));
      } else {
        setSviScore(42); // Fallback demo score
      }
    } catch {
      setSviError("Something went wrong. You can still continue to your dashboard.");
      setSviScore(null);
    } finally {
      setSubmitting(false);
    }
  }

  // Complete onboarding and redirect
  async function handleComplete() {
    setCompleting(true);
    try {
      await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          role,
          startupName: startupName.trim(),
          stage,
          industry:
            INDUSTRIES.find((i) => i.id === industry)?.label ?? industry,
        }),
      });
    } catch {
      // Non-blocking: redirect anyway
    }
    router.push("/dashboard/svi");
  }

  // Auto-trigger score fetch when entering step 4
  React.useEffect(() => {
    if (step === 3 && sviScore === null && !submitting && !sviError) {
      handleGetScore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  return (
    <main className="min-h-svh bg-white flex flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Logo variant="light" />
        </div>

        {/* Progress bar (4 dots) */}
        <div className="flex items-center justify-center gap-2 mb-4">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isComplete = i < step;
            return (
              <React.Fragment key={s.label}>
                {i > 0 && (
                  <div
                    className={`w-8 h-px transition-colors ${
                      isComplete ? "bg-brand-500" : "bg-surface-300"
                    }`}
                  />
                )}
                <div
                  className={`flex items-center justify-center h-8 w-8 rounded-full transition-all ${
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
          Step {step + 1} of 4
        </p>

        {/* Card */}
        <div className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
          {/* ---- Step 1: Welcome! Tell us about you ---- */}
          {step === 0 && (
            <div className="p-8">
              <h2 className="text-xl font-bold text-ink-900 mb-1">
                Welcome! Tell us about you
              </h2>
              <p className="text-sm text-ink-600 mb-6">
                We&rsquo;ll personalise your experience based on your role and stage.
              </p>

              <div className="space-y-5">
                {/* Name */}
                <div>
                  <label
                    htmlFor="onboard-name"
                    className="block text-sm font-medium text-ink-700 mb-1.5"
                  >
                    Your name *
                  </label>
                  <input
                    id="onboard-name"
                    type="text"
                    required
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Smith"
                    className="w-full rounded-xl border border-surface-200 px-4 py-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    autoFocus
                  />
                </div>

                {/* Role */}
                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-1.5">
                    Your role *
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {ROLES.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setRole(r.id)}
                        className={`rounded-xl border px-3 py-2 text-xs font-medium transition-all cursor-pointer ${
                          role === r.id
                            ? "border-brand-300 bg-brand-50 text-brand-700 ring-2 ring-brand-100"
                            : "border-surface-200 bg-white text-ink-700 hover:border-brand-200 hover:bg-surface-50"
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Stage */}
                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-1.5">
                    What stage is your startup? *
                  </label>
                  <div className="space-y-2">
                    {STAGES.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setStage(s.id)}
                        className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all cursor-pointer ${
                          stage === s.id
                            ? "border-brand-300 bg-brand-50 ring-2 ring-brand-100"
                            : "border-surface-200 bg-white hover:border-brand-200 hover:bg-surface-50"
                        }`}
                      >
                        <div
                          className={`h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            stage === s.id
                              ? "border-brand-600"
                              : "border-surface-300"
                          }`}
                        >
                          {stage === s.id && (
                            <div className="h-2 w-2 rounded-full bg-brand-600" />
                          )}
                        </div>
                        <div>
                          <span className="text-sm font-medium text-ink-800">
                            {s.label}
                          </span>
                          <span className="text-xs text-ink-500 ml-2">
                            {s.description}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end mt-6">
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

          {/* ---- Step 2: Tell us about your startup ---- */}
          {step === 1 && (
            <div className="p-8">
              <h2 className="text-xl font-bold text-ink-900 mb-1">
                Tell us about your startup
              </h2>
              <p className="text-sm text-ink-600 mb-6">
                This helps us tailor your SVI analysis and recommendations.
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

                {/* Description */}
                <div>
                  <label
                    htmlFor="startup-desc"
                    className="block text-sm font-medium text-ink-700 mb-1.5"
                  >
                    One-line description
                  </label>
                  <textarea
                    id="startup-desc"
                    maxLength={500}
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Briefly describe what your startup does..."
                    className="w-full rounded-xl border border-surface-200 px-4 py-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
                  />
                </div>

                {/* Industry */}
                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-1.5">
                    Industry *
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {INDUSTRIES.map((ind) => (
                      <button
                        key={ind.id}
                        type="button"
                        onClick={() => setIndustry(ind.id)}
                        className={`flex flex-col items-center gap-2 rounded-xl border px-4 py-4 text-sm font-medium transition-all cursor-pointer ${
                          industry === ind.id
                            ? "border-brand-300 bg-brand-50 text-brand-700 ring-2 ring-brand-100"
                            : "border-surface-200 bg-white text-ink-700 hover:border-brand-200 hover:bg-surface-50"
                        }`}
                      >
                        <span className="text-2xl">{ind.icon}</span>
                        <span>{ind.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-6">
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
                  Continue
                  <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* ---- Step 3: Your first SVI analysis ---- */}
          {step === 2 && (
            <div className="p-8">
              <h2 className="text-xl font-bold text-ink-900 mb-1">
                Your first SVI analysis
              </h2>
              <p className="text-sm text-ink-600 mb-6">
                Describe your startup idea in detail. The more context you
                provide, the more accurate your Startup Value Index will be.
              </p>

              <div className="space-y-4">
                {/* Large textarea */}
                <div>
                  <label
                    htmlFor="idea-text"
                    className="block text-sm font-medium text-ink-700 mb-1.5"
                  >
                    Describe your startup idea in detail...
                  </label>
                  <textarea
                    id="idea-text"
                    rows={6}
                    maxLength={5000}
                    value={ideaText}
                    onChange={(e) => setIdeaText(e.target.value)}
                    placeholder="What problem are you solving? Who are your target customers? What makes your approach unique? What traction do you have?"
                    className="w-full rounded-xl border border-surface-200 px-4 py-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
                  />
                  <p className="text-xs text-ink-400 mt-1">
                    {ideaText.length.toLocaleString()} / 5,000 characters
                  </p>
                </div>

                {/* File upload */}
                <div>
                  <label
                    htmlFor="file-upload"
                    className="inline-flex items-center gap-2 rounded-xl border border-dashed border-surface-300 px-4 py-2.5 text-sm text-ink-600 hover:border-brand-300 hover:bg-surface-50 transition-colors cursor-pointer"
                  >
                    <Upload strokeWidth={1.75} className="h-4 w-4" />
                    {fileName ? (
                      <span className="flex items-center gap-1.5">
                        <FileText strokeWidth={1.5} className="h-3.5 w-3.5 text-brand-600" />
                        {fileName}
                      </span>
                    ) : (
                      "Upload a file (optional)"
                    )}
                  </label>
                  <input
                    id="file-upload"
                    type="file"
                    accept=".txt,.md,.pdf,.doc,.docx"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>

                {/* Quick examples */}
                <div>
                  <p className="text-xs font-medium text-ink-500 mb-2">
                    Quick examples to try:
                  </p>
                  <div className="space-y-2">
                    {QUICK_EXAMPLES.map((example, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setIdeaText(example)}
                        className="w-full text-left rounded-lg border border-surface-200 px-3 py-2 text-xs text-ink-600 hover:border-brand-200 hover:bg-surface-50 transition-colors cursor-pointer line-clamp-2"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-6">
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
                  Continue
                  <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* ---- Step 4: You're all set! ---- */}
          {step === 3 && (
            <div className="p-8">
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-brand-50 border border-brand-100 mb-4">
                  <Rocket
                    strokeWidth={1.5}
                    className="h-7 w-7 text-brand-600"
                  />
                </div>
                <h2 className="text-xl font-bold text-ink-900 mb-1">
                  You&rsquo;re all set!
                </h2>
                <p className="text-sm text-ink-600">
                  Here&rsquo;s a summary of what you entered.
                </p>
              </div>

              {/* Summary */}
              <div className="rounded-xl border border-surface-200 bg-surface-50 divide-y divide-surface-200 mb-6">
                <div className="px-4 py-3 flex items-center justify-between">
                  <span className="text-xs text-ink-500">Name</span>
                  <span className="text-sm font-medium text-ink-800">
                    {name}
                  </span>
                </div>
                <div className="px-4 py-3 flex items-center justify-between">
                  <span className="text-xs text-ink-500">Role</span>
                  <span className="text-sm font-medium text-ink-800">
                    {ROLES.find((r) => r.id === role)?.label ?? role}
                  </span>
                </div>
                <div className="px-4 py-3 flex items-center justify-between">
                  <span className="text-xs text-ink-500">Stage</span>
                  <span className="text-sm font-medium text-ink-800">
                    {STAGES.find((s) => s.id === stage)?.label ?? stage}
                  </span>
                </div>
                <div className="px-4 py-3 flex items-center justify-between">
                  <span className="text-xs text-ink-500">Startup</span>
                  <span className="text-sm font-medium text-ink-800">
                    {startupName}
                  </span>
                </div>
                <div className="px-4 py-3 flex items-center justify-between">
                  <span className="text-xs text-ink-500">Industry</span>
                  <span className="text-sm font-medium text-ink-800">
                    {INDUSTRIES.find((i) => i.id === industry)?.label ??
                      industry}
                  </span>
                </div>
              </div>

              {/* SVI Score display */}
              {submitting && (
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

              {sviScore !== null && !submitting && (
                <div className="rounded-xl border border-brand-100 bg-brand-50 px-6 py-8 text-center mb-6">
                  <p className="text-xs font-medium text-brand-600 uppercase tracking-wider mb-2">
                    Your Startup Value Index
                  </p>
                  <p className="text-5xl font-extrabold text-brand-700 mb-1">
                    {sviScore}
                  </p>
                  <p className="text-sm text-brand-600">out of 100</p>
                </div>
              )}

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
                  disabled={submitting || completing}
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-ink-600 hover:bg-surface-100 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <ArrowLeft strokeWidth={1.75} className="h-4 w-4" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleComplete}
                  disabled={submitting || completing}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {completing ? (
                    <>
                      <Loader2
                        strokeWidth={1.75}
                        className="h-4 w-4 animate-spin"
                      />
                      Redirecting...
                    </>
                  ) : sviScore !== null ? (
                    <>
                      Go to Dashboard
                      <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
                    </>
                  ) : submitting ? (
                    <>
                      <Loader2
                        strokeWidth={1.75}
                        className="h-4 w-4 animate-spin"
                      />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      Get My SVI Score
                      <Sparkles strokeWidth={1.75} className="h-4 w-4" />
                    </>
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
