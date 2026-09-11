"use client";

/**
 * "Let matching founders see me" — the investor_discoverable opt-in
 * (T0251 follow-up). Rendered on /workspace/investor/preferences for
 * evaluator personas only (the server page decides; this component never
 * checks persona itself). Off by default. Saves through the existing
 * POST /api/investor/preferences, which also carries the two public card
 * fields (firm, thesis) the founder-facing "Investors who match" card shows.
 * The investor's email is never part of that card.
 */

import * as React from "react";
import Link from "next/link";

export const VISIBILITY_COPY = {
  title: "Let matching founders see me",
  sub: "Growth founders whose sector, stage and location fit your preferences can see your name, firm and thesis and ask us for an intro. We never share your email.",
  firmLabel: "Firm / organisation",
  firmPlaceholder: "e.g. Sydney Angels",
  thesisLabel: "Thesis (one line)",
  thesisPlaceholder: "e.g. Pre-seed B2B SaaS in ANZ, A$50k–250k first cheques",
  save: "Save visibility",
  saving: "Saving…",
  savedOn: "Saved — matching founders can now see you.",
  savedOff: "Saved — you are hidden from founders.",
  pending: "Saved locally — the visibility column is not live on this install yet.",
  locked: "Visibility is part of the investor plans.",
  ignored: "Only investor, advisor and accelerator accounts can opt in.",
  failed: "Could not save. Try again in a minute.",
} as const;

export interface InvestorVisibilityFormProps {
  initialDiscoverable: boolean;
  initialFirm: string | null;
  initialThesis: string | null;
  firmMaxLen: number;
  thesisMaxLen: number;
}

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; on: boolean }
  | { kind: "pending" }
  | { kind: "locked" }
  | { kind: "ignored" }
  | { kind: "failed" };

export function InvestorVisibilityForm({ initialDiscoverable, initialFirm, initialThesis, firmMaxLen, thesisMaxLen }: InvestorVisibilityFormProps) {
  const [on, setOn] = React.useState(initialDiscoverable === true);
  const [firm, setFirm] = React.useState(initialFirm ?? "");
  const [thesis, setThesis] = React.useState(initialThesis ?? "");
  const [status, setStatus] = React.useState<Status>({ kind: "idle" });

  async function save(next: boolean) {
    setStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/investor/preferences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ investor_discoverable: next, firm: firm.trim() || null, thesis: thesis.trim() || null }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        reason?: string;
        error?: string;
        discoverable?: boolean;
        discoverable_ignored?: string;
      };
      if (res.status === 402 || body.error === "feature_locked") {
        setStatus({ kind: "locked" });
        return;
      }
      if (body.discoverable_ignored) {
        setStatus({ kind: "ignored" });
        return;
      }
      if (body.reason === "column_missing") {
        setStatus({ kind: "pending" });
        return;
      }
      if (!res.ok || body.ok === false) {
        setStatus({ kind: "failed" });
        return;
      }
      setOn(body.discoverable === true);
      setStatus({ kind: "saved", on: body.discoverable === true });
    } catch {
      setStatus({ kind: "failed" });
    }
  }

  const saving = status.kind === "saving";

  return (
    <section
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6"
      data-investor-visibility
      data-discoverable={on ? "1" : "0"}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="investor-visibility-title" className="text-lg font-semibold text-ink-900">{VISIBILITY_COPY.title}</h2>
          <p id="investor-visibility-sub" className="mt-1 text-sm text-ink-600 leading-relaxed">{VISIBILITY_COPY.sub}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="investor-visibility-title"
          aria-describedby="investor-visibility-sub"
          aria-busy={saving}
          disabled={saving}
          onClick={() => {
            const next = !on;
            setOn(next);
            void save(next);
          }}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-60 ${
            on ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-700"
          }`}
          data-visibility-switch
        >
          <span aria-hidden="true" className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none ${on ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-ink-800">{VISIBILITY_COPY.firmLabel}</span>
          <input
            type="text"
            name="firm"
            value={firm}
            maxLength={firmMaxLen}
            placeholder={VISIBILITY_COPY.firmPlaceholder}
            onChange={(e) => setFirm(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-ink-900 placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="font-medium text-ink-800">{VISIBILITY_COPY.thesisLabel}</span>
          <input
            type="text"
            name="thesis"
            value={thesis}
            maxLength={thesisMaxLen}
            placeholder={VISIBILITY_COPY.thesisPlaceholder}
            onChange={(e) => setThesis(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-ink-900 placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={saving}
          aria-busy={saving}
          onClick={() => void save(on)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60"
          data-visibility-save
        >
          {saving ? VISIBILITY_COPY.saving : VISIBILITY_COPY.save}
        </button>
        <p className="text-xs text-ink-600" role="status" aria-live="polite" data-visibility-status={status.kind}>
          {status.kind === "saved" ? (status.on ? VISIBILITY_COPY.savedOn : VISIBILITY_COPY.savedOff) : null}
          {status.kind === "pending" ? VISIBILITY_COPY.pending : null}
          {status.kind === "ignored" ? VISIBILITY_COPY.ignored : null}
          {status.kind === "failed" ? VISIBILITY_COPY.failed : null}
          {status.kind === "locked" ? (
            <>
              {VISIBILITY_COPY.locked}{" "}
              <Link href="/pricing" className="font-semibold text-brand-600 hover:text-brand-700">
                See plans
              </Link>
            </>
          ) : null}
        </p>
      </div>
    </section>
  );
}
