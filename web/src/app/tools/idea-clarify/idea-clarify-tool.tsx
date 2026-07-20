"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Lightbulb, Loader2, Sparkles } from "lucide-react";

type Question = {
  id: string;
  prompt: string;
  category: "problem" | "customer" | "solution" | "moat" | "market" | "monetization";
  followUps?: string[];
};

type Recommendation = {
  primaryFeature: string;
  primaryFeatureHref: string;
  rationale: string;
  secondaryFeatures: Array<{ label: string; href: string }>;
};

type Step = "idea" | "questions" | "result";

const CATEGORY_LABEL: Record<Question["category"], string> = {
  problem: "Problem",
  customer: "Customer",
  solution: "Solution",
  moat: "Moat",
  market: "Market",
  monetization: "Monetization",
};

export function IdeaClarifyTool() {
  const [step, setStep] = React.useState<Step>("idea");
  const [ideaText, setIdeaText] = React.useState("");
  const [questions, setQuestions] = React.useState<Question[]>([]);
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [recommendation, setRecommendation] = React.useState<Recommendation | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const submitIdea = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = ideaText.trim();
    if (trimmed.length < 20) {
      setError("Please describe your idea in at least a sentence or two.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/idea-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaText: trimmed }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not generate questions. Try again.");
        return;
      }
      setQuestions(data.questions ?? []);
      setStep("questions");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const submitAnswers = async (e: React.FormEvent) => {
    e.preventDefault();
    const answered = Object.values(answers).filter((v) => v.trim().length > 0).length;
    if (answered < Math.min(3, questions.length)) {
      setError("Answer at least 3 questions so we can route you well.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/idea-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaText: ideaText.trim(), answers }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not generate a recommendation. Try again.");
        return;
      }
      setRecommendation(data.recommendation);
      setStep("result");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    setStep("idea");
    setIdeaText("");
    setQuestions([]);
    setAnswers({});
    setRecommendation(null);
    setError("");
  };

  if (step === "result" && recommendation) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-6">
          <div className="flex items-start gap-3">
            <Sparkles className="h-6 w-6 flex-shrink-0 text-brand-600 mt-0.5" />
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-brand-600 font-medium">
                Recommended next step
              </p>
              <h2 className="mt-1 text-2xl font-semibold text-ink-900">
                {recommendation.primaryFeature}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-700">
                {recommendation.rationale}
              </p>
              <Link
                href={recommendation.primaryFeatureHref}
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                Continue there
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>

        {recommendation.secondaryFeatures.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-ink-500 font-medium mb-3">
              Also worth exploring
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {recommendation.secondaryFeatures.map((f) => (
                <Link
                  key={f.href}
                  href={f.href}
                  className="group flex items-center justify-between rounded-xl border border-surface-200 bg-white p-4 hover:border-brand-300 hover:bg-brand-50/30 transition-colors"
                >
                  <span className="text-sm font-medium text-ink-800">{f.label}</span>
                  <ArrowRight className="h-4 w-4 text-ink-400 group-hover:text-brand-600 transition-colors" />
                </Link>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={resetAll}
          className="text-xs text-ink-500 hover:text-ink-800 transition-colors"
        >
          Start over with a different idea
        </button>
      </div>
    );
  }

  if (step === "questions") {
    return (
      <form onSubmit={submitAnswers} className="space-y-6">
        <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-ink-500 font-medium mb-1">
            Your idea
          </p>
          <p className="text-sm text-ink-700 leading-relaxed">{ideaText}</p>
        </div>

        <p className="text-sm text-ink-600">
          Answer as many as you can. Even a rough answer beats leaving it blank —
          we&apos;ll use the pattern of your answers to route you.
        </p>

        <div className="space-y-5">
          {questions.map((q, idx) => (
            <div key={q.id} className="space-y-2">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                  {idx + 1}
                </span>
                <div className="flex-1">
                  <label
                    htmlFor={`q-${q.id}`}
                    className="block text-sm font-medium text-ink-900"
                  >
                    {q.prompt}
                  </label>
                  <p className="mt-0.5 text-[11px] uppercase tracking-wider text-ink-400">
                    {CATEGORY_LABEL[q.category]}
                  </p>
                </div>
              </div>
              <textarea
                id={`q-${q.id}`}
                value={answers[q.id] ?? ""}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                }
                maxLength={1000}
                rows={2}
                placeholder="Your answer..."
                className="w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-ink-800 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              {q.followUps && q.followUps.length > 0 && (
                <p className="pl-8 text-xs text-ink-500 italic">
                  Hint: {q.followUps.join(" · ")}
                </p>
              )}
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Routing...
              </>
            ) : (
              <>
                Get my next step
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => setStep("idea")}
            className="text-xs text-ink-500 hover:text-ink-800 transition-colors"
          >
            Back to idea
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submitIdea} className="space-y-5">
      <div>
        <label
          htmlFor="idea"
          className="flex items-center gap-2 text-sm font-medium text-ink-900"
        >
          <Lightbulb className="h-4 w-4 text-gold-600" />
          Describe your startup idea
        </label>
        <p className="mt-1 text-xs text-ink-500">
          A sentence or a paragraph — whatever you&apos;ve got. Skip fancy
          language; plain English works best.
        </p>
        <textarea
          id="idea"
          value={ideaText}
          onChange={(e) => setIdeaText(e.target.value)}
          maxLength={4000}
          rows={6}
          placeholder="e.g. A marketplace connecting Australian tradies with residential property managers who need same-day quotes for maintenance jobs..."
          className="mt-3 w-full rounded-lg border border-surface-300 bg-white px-3 py-3 text-sm text-ink-800 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <p className="mt-1 text-right text-[11px] text-ink-400">
          {ideaText.length} / 4000
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating questions...
          </>
        ) : (
          <>
            Ask me the right questions
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </form>
  );
}
