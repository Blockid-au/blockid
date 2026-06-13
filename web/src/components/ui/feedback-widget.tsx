"use client";

import * as React from "react";
import { MessageSquarePlus, X, Send, CheckCircle2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Category = "feature" | "bug" | "ux" | "data" | "other";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "feature", label: "Feature request" },
  { value: "bug", label: "Bug / broken" },
  { value: "ux", label: "UX / design" },
  { value: "data", label: "Data / accuracy" },
  { value: "other", label: "Other" },
];

interface FeedbackWidgetProps {
  /** Page context sent with the feedback */
  page?: string;
  /** Position on screen */
  position?: "bottom-right" | "bottom-left";
  className?: string;
}

export function FeedbackWidget({ page, position = "bottom-right", className }: FeedbackWidgetProps) {
  const [open, setOpen] = React.useState(false);
  const [category, setCategory] = React.useState<Category>("feature");
  const [text, setText] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "sending" | "done" | "error">("idle");
  const [credits, setCredits] = React.useState<number | null>(null);
  const [errorMsg, setErrorMsg] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (open && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (text.trim().length < 10 || status === "sending") return;
    setStatus("sending");
    setErrorMsg("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: text.trim(), category, page }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "Failed to submit. Try again.");
        setStatus("error");
        return;
      }
      setCredits(data.creditsAwarded ?? 0);
      setStatus("done");
      setText("");
    } catch {
      setErrorMsg("Network error. Please try again.");
      setStatus("error");
    }
  }

  function reset() {
    setStatus("idle");
    setErrorMsg("");
    setCredits(null);
    setOpen(false);
  }

  return (
    <div
      className={cn(
        "fixed z-50 flex flex-col items-end gap-2",
        position === "bottom-right" ? "bottom-5 right-5" : "bottom-5 left-5",
        className,
      )}
    >
      {/* Panel */}
      {open && (
        <div className="w-80 rounded-2xl border border-surface-200 bg-white shadow-xl dark:bg-surface-100 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200">
            <div className="flex items-center gap-2">
              <MessageSquarePlus strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
              <span className="text-sm font-semibold text-ink-800">Share feedback</span>
            </div>
            <button
              type="button"
              onClick={reset}
              className="h-6 w-6 flex items-center justify-center rounded-lg text-ink-400 hover:text-ink-700 hover:bg-surface-100 transition-colors"
            >
              <X strokeWidth={2} className="h-3.5 w-3.5" />
            </button>
          </div>

          {status === "done" ? (
            <div className="px-4 py-6 flex flex-col items-center gap-3 text-center">
              <CheckCircle2 strokeWidth={1.5} className="h-10 w-10 text-green-500" />
              <p className="text-sm font-semibold text-ink-800">Thanks for the feedback!</p>
              {credits != null && credits > 0 ? (
                <p className="text-xs text-ink-500">
                  You earned <span className="text-brand-600 font-semibold">{credits} credits</span> for the useful input.
                </p>
              ) : (
                <p className="text-xs text-ink-500">We review every submission and ship improvements weekly.</p>
              )}
              <button
                type="button"
                onClick={reset}
                className="mt-1 text-xs text-brand-600 hover:underline"
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="p-4 space-y-3">
              {/* Category selector */}
              <div className="relative">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as Category)}
                  className="w-full appearance-none rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 pr-8 text-xs text-ink-700 focus:outline-none focus:ring-2 focus:ring-brand-300 cursor-pointer"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <ChevronDown strokeWidth={1.75} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-400" />
              </div>

              {/* Text area */}
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="What would you change, add, or fix? (min 10 chars)"
                className="w-full resize-none rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-xs text-ink-700 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-300"
              />

              {errorMsg && (
                <p className="text-xs text-red-500">{errorMsg}</p>
              )}

              <div className="flex items-center justify-between">
                <p className="text-[10px] text-ink-400">
                  Good feedback earns credits
                </p>
                <button
                  type="submit"
                  disabled={text.trim().length < 10 || status === "sending"}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Send strokeWidth={1.75} className="h-3 w-3" />
                  {status === "sending" ? "Sending…" : "Send"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* FAB trigger */}
      <button
        type="button"
        onClick={() => { setOpen(v => !v); if (status === "done") { setStatus("idle"); setCredits(null); } }}
        className={cn(
          "h-11 w-11 rounded-full shadow-lg flex items-center justify-center transition-all duration-200",
          open
            ? "bg-surface-200 text-ink-600 hover:bg-surface-300"
            : "bg-brand-600 text-white hover:bg-brand-700 hover:scale-105",
        )}
        aria-label="Send feedback"
      >
        {open
          ? <X strokeWidth={2} className="h-4 w-4" />
          : <MessageSquarePlus strokeWidth={1.75} className="h-5 w-5" />
        }
      </button>
    </div>
  );
}
