"use client";

// Wave 26B — floating "Ask about this report" chat widget.
//
// Mounts on both /workspace/business-report (auth, `projectId`) and
// /tbr/[token] (anon, `token`). NEVER rendered when `pdfMode` is true —
// the Playwright PDF export must not capture chat chrome.

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  projectId?: string;
  token?: string;
  className?: string;
}

const SUGGESTED_QUESTIONS = [
  "What are my biggest risks?",
  "Is this valuation realistic?",
  "What should I do this week?",
];

export function TbrQaChat({ projectId, token, className }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const historyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open && historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [open, messages, sending]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || sending) return;
    setError(null);
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: q }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    try {
      const res = await fetch("/api/svi/report/qa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          projectId,
          token,
          question: q,
          history: nextMessages.slice(-7, -1),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        answer?: string;
        error?: string;
        retryInSeconds?: number;
      };
      if (!res.ok || !body.ok || !body.answer) {
        if (res.status === 429 && body.retryInSeconds) {
          setError(`Rate limit reached — try again in ${Math.ceil(body.retryInSeconds / 60)} min.`);
        } else if (body.error === "ai_unavailable") {
          setError("The analyst is offline right now. Please try again in a minute.");
        } else {
          setError("Couldn't reach the analyst. Please try again.");
        }
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: body.answer ?? "" }]);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  }

  const showSuggestions = messages.length === 0 && !sending;

  return (
    <div className={cn("fixed bottom-4 right-4 z-40 print:hidden", className)}>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2.5 shadow-lg transition-colors"
          aria-label="Ask about this report"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          <span>Ask about this report</span>
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Report Q&A"
          className="w-[min(24rem,calc(100vw-2rem))] h-[min(32rem,calc(100vh-6rem))] flex flex-col rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900 shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-ink-100 dark:border-ink-800 bg-brand-50/60 dark:bg-brand-950/30">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="h-4 w-4 text-brand-600 dark:text-brand-300 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-ink-800 dark:text-ink-100 truncate">
                  Ask the BlockID analyst
                </p>
                <p className="text-[10px] text-ink-500 dark:text-ink-400 truncate">
                  Grounded on this report — no invented facts
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1 rounded hover:bg-ink-100 dark:hover:bg-ink-800 text-ink-500 dark:text-ink-400 shrink-0"
              aria-label="Close chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Message history */}
          <div
            ref={historyRef}
            className="flex-1 overflow-y-auto px-3 py-3 space-y-3 text-sm"
          >
            {messages.length === 0 && (
              <p className="text-xs text-ink-500 dark:text-ink-400">
                Ask a question about this Trusted Business Report. The analyst answers only from the
                report data (dim scores, criteria, valuation).
              </p>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  m.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 whitespace-pre-wrap leading-relaxed",
                    m.role === "user"
                      ? "bg-brand-600 text-white"
                      : "bg-ink-100 dark:bg-ink-800 text-ink-800 dark:text-ink-100",
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="rounded-lg px-3 py-2 bg-ink-100 dark:bg-ink-800 text-ink-500 dark:text-ink-400 text-xs">
                  Thinking…
                </div>
              </div>
            )}

            {error && (
              <p className="text-xs text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 rounded p-2">
                {error}
              </p>
            )}

            {showSuggestions && (
              <div className="pt-2 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400 dark:text-ink-500">
                  Try one of these
                </p>
                <div className="flex flex-col gap-1.5">
                  {SUGGESTED_QUESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void ask(s)}
                      className="text-left text-xs rounded-md border border-ink-200 dark:border-ink-700 hover:border-brand-400 dark:hover:border-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/30 text-ink-700 dark:text-ink-200 px-2.5 py-1.5 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
            }}
            className="flex items-end gap-2 p-2 border-t border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void ask(input);
                }
              }}
              rows={2}
              maxLength={1000}
              placeholder="Ask about this report…"
              className="flex-1 resize-none rounded-md border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 px-2 py-1.5 text-sm text-ink-800 dark:text-ink-100 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={sending || input.trim().length === 0}
              className="inline-flex items-center justify-center rounded-md bg-brand-600 hover:bg-brand-700 disabled:bg-ink-300 dark:disabled:bg-ink-700 text-white h-8 w-8 shrink-0 transition-colors"
              aria-label="Send question"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
