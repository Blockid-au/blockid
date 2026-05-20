"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  Loader2,
  Rocket,
  Briefcase,
  Sparkles,
  Check,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";

// ---------------------------------------------------------------------------
// Industry options
// ---------------------------------------------------------------------------

const INDUSTRIES = [
  { id: "saas", label: "SaaS", icon: "💻" },
  { id: "fintech", label: "Fintech", icon: "💳" },
  { id: "marketplace", label: "Marketplace", icon: "🏪" },
  { id: "devtools", label: "DevTools", icon: "🔧" },
  { id: "healthtech", label: "HealthTech", icon: "🏥" },
  { id: "edtech", label: "EdTech", icon: "📚" },
  { id: "cleantech", label: "CleanTech", icon: "🌱" },
  { id: "proptech", label: "PropTech", icon: "🏠" },
  { id: "agritech", label: "AgriTech", icon: "🌾" },
  { id: "other", label: "Other", icon: "🚀" },
];

// ---------------------------------------------------------------------------
// Step indicators
// ---------------------------------------------------------------------------

const STEPS = [
  { label: "Name", icon: Briefcase },
  { label: "Industry", icon: Sparkles },
  { label: "Analyze", icon: Rocket },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface OnboardingWizardProps {
  userEmail: string;
}

export function OnboardingWizard({ userEmail }: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);

  // Step 1 state
  const [startupName, setStartupName] = React.useState("");
  const [description, setDescription] = React.useState("");

  // Step 2 state
  const [industry, setIndustry] = React.useState("");

  // Step 3 state
  const [ideaText, setIdeaText] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Pre-fill idea text when entering step 3
  React.useEffect(() => {
    if (step === 2 && startupName) {
      const industryLabel = INDUSTRIES.find((i) => i.id === industry)?.label ?? "";
      setIdeaText(
        `${startupName}${industryLabel ? ` - ${industryLabel} startup` : ""}`,
      );
    }
  }, [step, startupName, industry]);

  function goNext() {
    if (step < 2) setStep(step + 1);
  }

  function goBack() {
    if (step > 0) setStep(step - 1);
  }

  async function handleSubmit() {
    if (!startupName.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      // 1. Create the project
      const projRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: startupName.trim(),
          description: description.trim() || undefined,
          industry: INDUSTRIES.find((i) => i.id === industry)?.label ?? undefined,
        }),
      });
      const projData = await projRes.json();

      if (!projData.ok) {
        setError(projData.error ?? "Failed to create project");
        setSubmitting(false);
        return;
      }

      // 2. Set the active project cookie (best-effort)
      if (projData.project?.slug) {
        document.cookie = `blockid_project=${projData.project.slug};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
      }

      // 3. Submit SVI analysis
      try {
        await fetch("/api/svi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idea: ideaText.trim() || startupName.trim(),
            projectId: projData.project?.id,
          }),
        });
      } catch {
        // Non-blocking: SVI analysis is optional during onboarding
      }

      // 4. Redirect to SVI dashboard
      router.push("/dashboard/svi");
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-lg">
      {/* Logo */}
      <div className="flex justify-center mb-8">
        <Logo variant="light" />
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === step;
          const isComplete = i < step;
          return (
            <React.Fragment key={s.label}>
              {i > 0 && (
                <div
                  className={`w-10 h-px ${
                    isComplete ? "bg-brand-500" : "bg-surface-300"
                  }`}
                />
              )}
              <div
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  isActive
                    ? "bg-brand-600 text-white"
                    : isComplete
                      ? "bg-brand-100 text-brand-700"
                      : "bg-surface-200 text-ink-500"
                }`}
              >
                {isComplete ? (
                  <Check strokeWidth={2} className="h-3.5 w-3.5" />
                ) : (
                  <Icon strokeWidth={1.75} className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">{s.label}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Card */}
      <div className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
        {/* ---- Step 1: Name Your Startup ---- */}
        {step === 0 && (
          <div className="p-8">
            <h2 className="text-xl font-bold text-ink-900 mb-2">
              Name Your Startup
            </h2>
            <p className="text-sm text-ink-600 mb-6">
              What&rsquo;s your startup called? This will create your first project in BlockID.
            </p>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="startup-name"
                  className="block text-sm font-medium text-ink-700 mb-1.5"
                >
                  What&rsquo;s your startup called? *
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
                  htmlFor="startup-desc"
                  className="block text-sm font-medium text-ink-700 mb-1.5"
                >
                  Description{" "}
                  <span className="text-ink-400 font-normal">(optional)</span>
                </label>
                <textarea
                  id="startup-desc"
                  maxLength={500}
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Briefly describe what your startup does..."
                  className="w-full rounded-xl border border-surface-200 px-4 py-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <button
                type="button"
                onClick={goNext}
                disabled={!startupName.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
                <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ---- Step 2: Select Industry ---- */}
        {step === 1 && (
          <div className="p-8">
            <h2 className="text-xl font-bold text-ink-900 mb-2">
              Select Industry
            </h2>
            <p className="text-sm text-ink-600 mb-6">
              What space is <span className="font-semibold text-ink-800">{startupName}</span> in?
              This helps us tailor your SVI analysis.
            </p>

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
                disabled={!industry}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
                <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ---- Step 3: Get Your First SVI ---- */}
        {step === 2 && (
          <div className="p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-brand-50 border border-brand-100 mb-4">
                <Rocket strokeWidth={1.5} className="h-7 w-7 text-brand-600" />
              </div>
              <h2 className="text-xl font-bold text-ink-900 mb-2">
                You&rsquo;re all set!
              </h2>
              <p className="text-sm text-ink-600">
                Let&rsquo;s analyze{" "}
                <span className="font-semibold text-brand-600">
                  {startupName}
                </span>
              </p>
            </div>

            <div>
              <label
                htmlFor="idea-text"
                className="block text-sm font-medium text-ink-700 mb-1.5"
              >
                Describe your startup for the SVI analysis
              </label>
              <textarea
                id="idea-text"
                rows={4}
                maxLength={2000}
                value={ideaText}
                onChange={(e) => setIdeaText(e.target.value)}
                className="w-full rounded-xl border border-surface-200 px-4 py-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
              />
              <p className="text-xs text-ink-400 mt-1">
                You can edit this later. More detail = better analysis.
              </p>
            </div>

            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm text-red-700 font-medium">{error}</p>
              </div>
            )}

            <div className="flex items-center justify-between mt-6">
              <button
                type="button"
                onClick={goBack}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-ink-600 hover:bg-surface-100 transition-colors cursor-pointer disabled:opacity-50"
              >
                <ArrowLeft strokeWidth={1.75} className="h-4 w-4" />
                Back
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 strokeWidth={1.75} className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    Analyze Now
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
        Signed in as {userEmail}
      </p>
    </div>
  );
}
