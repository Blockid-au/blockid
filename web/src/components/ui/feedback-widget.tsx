"use client";

import * as React from "react";
import { MessageSquarePlus, X, Send, CheckCircle2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Category = "general" | "bug" | "feature" | "pricing" | "ux";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "general", label: "General" },
  { value: "bug", label: "Bug" },
  { value: "feature", label: "Feature request" },
  { value: "pricing", label: "Pricing" },
  { value: "ux", label: "UX / design" },
];

const MIN_LEN = 10;
const MAX_LEN = 2000;

export function FeedbackWidget(_props: { page?: string } = {}) {
  const [authed, setAuthed] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [category, setCategory] = React.useState<Category>("general");
  const [text, setText] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "sending" | "done" | "error">("idle");
  const [credits, setCredits] = React.useState<number | null>(null);
  const [resultMsg, setResultMsg] = React.useState<string>("");
  const [errorMsg, setErrorMsg] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setAuthed(Boolean(data?.ok && data?.user)); })
      .catch(() => { if (!cancelled) setAuthed(false); });
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    if (open && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [open]);

  // Auto-close 4s after a successful submission so the user can keep working.
  React.useEffect(() => {
    if (status !== "done") return;
    const t = setTimeout(() => reset(), 4000);
    return () => clearTimeout(t);
  }, [status]);

  function reset() {
    setStatus("idle");
    setErrorMsg("");
    setResultMsg("");
    setCredits(null);
    setOpen(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length < MIN_LEN || trimmed.length > MAX_LEN || status === "sending") return;
    setStatus("sending");
    setErrorMsg("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          feedback: trimmed,
          category,
          page: typeof window !== "undefined" ? window.location.pathname : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setErrorMsg(data?.error ?? "Failed to submit. Try again.");
        setStatus("error");
        return;
      }
      setCredits(typeof data.creditsAwarded === "number" ? data.creditsAwarded : 0);
      setResultMsg(data.aiSummary || data.message || "");
      setStatus("done");
      setText("");
    } catch {
      setErrorMsg("Network error. Please try again.");
      setStatus("error");
    }
  }

  if (!authed) return null;

  const len = text.trim().length;
  const canSubmit = len >= MIN_LEN && len <= MAX_LEN && status !== "sending";

  return (
    <div className="fixed z-50 flex flex-col items-end gap-2 bottom-5 right-5">
      {open && (
        <div className="w-[22rem] max-w-[calc(100vw-2.5rem)] rounded-2xl border border-surface-200 bg-white shadow-xl dark:border-surface-700 dark:bg-surface-900 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200 dark:border-surface-700">
            <div className="flex items-center gap-2">
              <MessageSquarePlus strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
              <span className="text-sm font-semibold text-brand-900 dark:text-ink-100">Help us improve — earn credits</span>
            </div>
            <button
              type="button"
              onClick={reset}
              className="h-6 w-6 flex items-center justify-center rounded-lg text-ink-400 hover:text-ink-700 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
              aria-label="Close feedback"
            >
              <X strokeWidth={2} className="h-3.5 w-3.5" />
            </button>
          </div>

          {status === "done" ? (
            <div className="px-4 py-6 flex flex-col items-center gap-3 text-center">
              <CheckCircle2 strokeWidth={1.5} className="h-10 w-10 text-green-500" />
              <p className="text-sm font-semibold text-brand-900 dark:text-ink-100">Thanks for the feedback</p>
              {credits != null && credits > 0 ? (
                <p className="text-xs text-ink-500 dark:text-ink-400">
                  You earned <span className="text-brand-600 font-semibold">{credits.toFixed(2)} credits</span>.
                </p>
              ) : null}
              {resultMsg ? (
                <p className="text-xs text-ink-500 dark:text-ink-400 italic">&ldquo;{resultMsg}&rdquo;</p>
              ) : null}
            </div>
          ) : (
            <form onSubmit={submit} className="p-4 space-y-3">
              <p className="text-[11px] leading-snug text-ink-500 dark:text-ink-400">
                Useful feedback earns 0.25–1.00 credit each, AI-graded for specificity / actionability / value. Max 5 per day.
              </p>

              <div className="relative">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as Category)}
                  className="w-full appearance-none rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 pr-8 text-xs text-ink-700 dark:border-surface-700 dark:bg-surface-800 dark:text-ink-200 focus:outline-none focus:ring-2 focus:ring-brand-300 cursor-pointer"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <ChevronDown strokeWidth={1.75} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-400" />
              </div>

              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
                rows={5}
                maxLength={MAX_LEN}
                placeholder="What would you change, add, or fix? Be specific."
                className="w-full resize-none rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-xs text-ink-700 placeholder:text-ink-400 dark:border-surface-700 dark:bg-surface-800 dark:text-ink-200 focus:outline-none focus:ring-2 focus:ring-brand-300"
              />

              <div className="flex items-center justify-between text-[10px]">
                <span className={cn(
                  "tabular-nums",
                  len < MIN_LEN ? "text-ink-400" : len > MAX_LEN ? "text-red-500" : "text-ink-500",
                )}>
                  {len}/{MAX_LEN} {len < MIN_LEN ? `(min ${MIN_LEN})` : ""}
                </span>
                {errorMsg ? <span className="text-red-500">{errorMsg}</span> : null}
              </div>

              <div className="flex items-center justify-end">
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Send strokeWidth={1.75} className="h-3 w-3" />
                  {status === "sending" ? "Sending…" : "Send feedback"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => { setOpen((v) => !v); if (status === "done" || status === "error") { setStatus("idle"); setCredits(null); setErrorMsg(""); setResultMsg(""); } }}
        className={cn(
          "flex items-center gap-2 rounded-full shadow-lg pl-3 pr-4 h-11 transition-all duration-200",
          open
            ? "bg-surface-200 text-ink-700 hover:bg-surface-300 dark:bg-surface-700 dark:text-ink-200"
            : "bg-brand-600 text-white hover:bg-brand-700 hover:scale-[1.03]",
        )}
        aria-label={open ? "Close feedback" : "Open feedback"}
      >
        {open
          ? <X strokeWidth={2} className="h-4 w-4" />
          : <MessageSquarePlus strokeWidth={1.75} className="h-4 w-4" />}
        <span className="text-xs font-medium">Feedback</span>
      </button>
    </div>
  );
}

export default FeedbackWidget;
