"use client";

import { useState } from "react";

type Phase = "score" | "comment" | "done" | "error";

function buttonTone(score: number): string {
  if (score <= 6) return "border-red-200 bg-red-50 text-red-700 hover:bg-red-100";
  if (score <= 8) return "border-yellow-200 bg-yellow-50 text-yellow-800 hover:bg-yellow-100";
  return "border-green-200 bg-green-50 text-green-700 hover:bg-green-100";
}

export function NpsClient({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>("score");
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(finalScore: number, finalComment: string) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/nps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, score: finalScore, comment: finalComment }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error ?? "Something went wrong");
        setPhase("error");
      } else {
        setPhase("done");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setPhase("error");
    } finally {
      setSubmitting(false);
    }
  }

  async function chooseScore(n: number) {
    setScore(n);
    // Fire off the score immediately so we capture the answer even if
    // the founder never writes a comment. The comment update replaces it.
    await submit(n, "");
    setPhase("comment");
  }

  async function submitComment() {
    if (score == null) return;
    await submit(score, comment);
  }

  if (phase === "done") {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-ink-900 mb-2">Thanks</h1>
        <p className="text-ink-600 text-sm">
          Your response was recorded. You can close this tab.
        </p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-ink-900 mb-2">Could not save</h1>
        <p className="text-ink-600 text-sm">{errorMsg || "Please try again in a moment."}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink-900 mb-2">
        How likely are you to recommend BlockID?
      </h1>
      <p className="text-ink-600 text-sm mb-6">
        0 means not at all, 10 means extremely likely.
      </p>

      <div className="grid grid-cols-11 gap-1 mb-2">
        {Array.from({ length: 11 }, (_, i) => (
          <button
            key={i}
            type="button"
            disabled={submitting}
            onClick={() => void chooseScore(i)}
            className={[
              "h-10 rounded-md border text-sm font-semibold transition-colors disabled:opacity-50",
              buttonTone(i),
              score === i ? "ring-2 ring-brand-500" : "",
            ].join(" ")}
            aria-pressed={score === i}
          >
            {i}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-ink-500 mb-6">
        <span>Not at all</span>
        <span>Extremely</span>
      </div>

      {phase === "comment" && score != null && (
        <div className="flex flex-col gap-3">
          <label htmlFor="nps-comment" className="text-sm font-medium text-ink-800">
            One line on why{score >= 9 ? " (optional)" : ""}
          </label>
          <textarea
            id="nps-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={score >= 9 ? "What worked?" : "What is the main gap?"}
            className="w-full rounded-lg border border-surface-200 text-sm px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submitComment()}
            className="self-start rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2"
          >
            {submitting ? "Saving" : "Submit comment"}
          </button>
          <p className="text-xs text-ink-500">Your score is already recorded — the comment just helps.</p>
        </div>
      )}
    </div>
  );
}
