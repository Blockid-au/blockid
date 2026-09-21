"use client";

// Wave 27A — investor lead-capture modal.
//
// Mounted only on the anon /tbr/[token] page and only when not in PDF mode.
// Slides in from the bottom-right after 30 seconds of *foreground* dwell
// (paused when the tab is hidden). Dismissal persists per token so we
// don't nag the same reader on refresh.

import { useEffect, useState } from "react";
import { X } from "lucide-react";

interface Props {
  token: string;
  /** Dwell before showing, in ms. Default 30_000. Exposed for tests. */
  dwellMs?: number;
}

type Interest = "exploring" | "warm" | "ready_to_talk";

const STORAGE_KEY = (token: string) => `tbr-lead-dismissed:${token}`;

export function TbrLeadModal({ token, dwellMs = 30_000 }: Props) {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [firm, setFirm] = useState("");
  const [role, setRole] = useState("");
  const [interest, setInterest] = useState<Interest>("exploring");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    // Respect prior dismissal.
    try {
      if (typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY(token))) return;
    } catch {
      /* localStorage unavailable — fall through and still allow the modal */
    }

    // Dwell timer only ticks while the tab is visible.
    let dwellRemaining = dwellMs;
    let lastResume =
      typeof document !== "undefined" && document.visibilityState === "visible" ? Date.now() : null;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let mounted = true;

    const schedule = () => {
      if (!mounted || timerId !== null) return;
      timerId = setTimeout(() => {
        timerId = null;
        if (mounted) setOpen(true);
      }, dwellRemaining);
    };

    const onVisibility = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "visible") {
        lastResume = Date.now();
        schedule();
      } else {
        if (timerId !== null) {
          clearTimeout(timerId);
          timerId = null;
        }
        if (lastResume !== null) {
          dwellRemaining = Math.max(0, dwellRemaining - (Date.now() - lastResume));
          lastResume = null;
        }
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    if (lastResume !== null) schedule();

    return () => {
      mounted = false;
      document.removeEventListener("visibilitychange", onVisibility);
      if (timerId !== null) clearTimeout(timerId);
    };
  }, [token, dwellMs]);

  function dismiss() {
    setOpen(false);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY(token), String(Date.now()));
      }
    } catch {
      /* ignore */
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    const trimmedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tbr/${encodeURIComponent(token)}/lead`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          investor_name: name.trim() || undefined,
          investor_email: trimmedEmail,
          investor_firm: firm.trim() || undefined,
          investor_role: role.trim() || undefined,
          interest_level: interest,
          message: message.trim() || undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        if (res.status === 429) {
          setError("Too many submissions from this network — please try again tomorrow.");
        } else if (body.error === "invalid_email") {
          setError("Please enter a valid email address.");
        } else {
          setError("Something went wrong. Please try again.");
        }
        return;
      }
      setSubmitted(true);
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_KEY(token), String(Date.now()));
        }
      } catch {
        /* ignore */
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="tbr-lead-title"
      className="fixed bottom-4 right-4 z-40 w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-line-subtle bg-surface shadow-2xl print:hidden"
    >
      <div className="flex items-start gap-3 p-4 border-b border-line-subtle">
        <div className="flex-1">
          <h2 id="tbr-lead-title" className="text-sm font-bold text-primary">
            {submitted ? "Thanks — the founder has been notified." : "Interested in this startup?"}
          </h2>
          {!submitted && (
            <p className="text-xs text-muted mt-1 leading-snug">
              Reach out to the founder directly. Your details are shared only with them.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="rounded-md p-1 text-muted hover:text-primary hover:bg-surface-hover"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {submitted ? (
        <div className="p-4">
          <p className="text-xs text-muted leading-relaxed">
            They&apos;ll be in touch. You can close this window.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-sm rounded-md border border-line-subtle bg-surface px-2.5 py-1.5 text-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
              maxLength={120}
            />
            <input
              type="email"
              required
              placeholder="Email *"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="text-sm rounded-md border border-line-subtle bg-surface px-2.5 py-1.5 text-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
              maxLength={254}
            />
            <input
              type="text"
              placeholder="Firm"
              value={firm}
              onChange={(e) => setFirm(e.target.value)}
              className="text-sm rounded-md border border-line-subtle bg-surface px-2.5 py-1.5 text-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
              maxLength={160}
            />
            <input
              type="text"
              placeholder="Role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="text-sm rounded-md border border-line-subtle bg-surface px-2.5 py-1.5 text-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
              maxLength={120}
            />
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Interest level
            </legend>
            <div className="flex gap-3 text-xs text-secondary">
              {(
                [
                  { v: "exploring" as const, label: "Exploring" },
                  { v: "warm" as const, label: "Warm" },
                  { v: "ready_to_talk" as const, label: "Ready to talk" },
                ]
              ).map((opt) => (
                <label key={opt.v} className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="interest"
                    value={opt.v}
                    checked={interest === opt.v}
                    onChange={() => setInterest(opt.v)}
                    className="text-brand-600 focus:ring-brand-500"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>

          <textarea
            placeholder="Message (optional)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            maxLength={2000}
            className="w-full text-sm rounded-md border border-line-subtle bg-surface px-2.5 py-1.5 text-primary focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
          />

          {error && (
            <p role="alert" className="text-xs text-bear">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={dismiss}
              className="text-xs text-muted hover:text-primary px-2 py-1"
            >
              Not now
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 bg-action hover:bg-action-hover disabled:opacity-50 text-on-action text-xs font-semibold rounded-md px-3 py-1.5"
            >
              {submitting ? "Sending…" : "Send to founder"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
