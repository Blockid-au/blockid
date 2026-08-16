"use client";

import { useState } from "react";

const CATEGORIES = [
  { value: "product", label: "Product" },
  { value: "ux", label: "User Experience" },
  { value: "feature", label: "Feature Request" },
  { value: "bug", label: "Bug Report" },
  { value: "other", label: "Other" },
] as const;

type Category = (typeof CATEGORIES)[number]["value"];

export function FeedbackForm() {
  const [category, setCategory] = useState<Category>("product");
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ id: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const maxChars = 2000;
  const minChars = 50;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) {
      setError("Please select a star rating.");
      return;
    }
    if (body.length < minChars) {
      setError(`Please write at least ${minChars} characters.`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/feedback/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, body, rating }),
      });
      const data = await res.json() as { id?: string; message?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to submit feedback.");
        return;
      }
      setSuccess({ id: data.id ?? "", message: data.message ?? "Feedback submitted!" });
      setBody("");
      setRating(0);
      setCategory("product");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
        <div className="text-3xl mb-2">🎉</div>
        <h3 className="text-base font-semibold text-green-800 mb-1">Thank you!</h3>
        <p className="text-sm text-green-700">{success.message}</p>
        <button
          onClick={() => setSuccess(null)}
          className="mt-4 text-sm text-green-600 underline hover:text-green-800"
        >
          Submit more feedback
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Category */}
      <div>
        <label className="block text-sm font-medium text-ink-700 mb-1.5">
          Category
        </label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as Category)}
          className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* Star Rating */}
      <div>
        <label className="block text-sm font-medium text-ink-700 mb-1.5">
          Overall Rating
        </label>
        <div className="flex gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={rating === star}
              aria-label={`${star} star${star !== 1 ? "s" : ""}`}
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoveredRating(star)}
              onMouseLeave={() => setHoveredRating(0)}
              className="text-2xl leading-none transition-transform hover:scale-110 focus:outline-none"
            >
              <span
                className={
                  star <= (hoveredRating || rating)
                    ? "text-yellow-400"
                    : "text-ink-200"
                }
              >
                ★
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Textarea */}
      <div>
        <label className="block text-sm font-medium text-ink-700 mb-1.5">
          Your Feedback
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={maxChars}
          rows={6}
          placeholder="Tell us what you think — what's working well, what could be improved, and any specific suggestions..."
          className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-vertical"
          required
        />
        <div className="mt-1 flex justify-between text-xs text-ink-400">
          <span>
            {body.length < minChars
              ? `${minChars - body.length} more characters needed`
              : "Minimum reached"}
          </span>
          <span className={body.length > maxChars * 0.9 ? "text-amber-500" : ""}>
            {body.length}/{maxChars}
          </span>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 rounded-md bg-red-50 border border-red-200 px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || body.length < minChars || rating === 0}
        className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? "Submitting..." : "Submit Feedback"}
      </button>
    </form>
  );
}
