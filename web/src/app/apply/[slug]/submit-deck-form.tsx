"use client";

// Client form for /apply/[slug] (G14 S35). Every string comes from the
// server page (intake.* catalogue) so this file has no locale logic. Posts
// multipart to /api/intake/[slug]/submit; the honeypot field is visually
// hidden + aria-hidden + tabIndex -1 so humans never touch it.

import { useId, useRef, useState } from "react";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import type { TemplateQuestion } from "@/lib/intake/templates-shared";

export interface SubmitDeckCopy {
  startupName: string;
  founderName: string;
  founderEmail: string;
  website: string;
  deck: string;
  deckHint: string;
  consentSentence: string;
  consentLabel: string;
  submit: string;
  submitting: string;
  successTitle: string;
  successBody: string;
  successHint: string;
  privacy: string;
  errors: Record<
    "duplicate" | "deck_required" | "deck_too_large" | "deck_type" | "deck_infected" | "scanner_unavailable" | "consent_required" | "invalid_input" | "rate_limited" | "closed" | "generic",
    string
  >;
}

export const HONEYPOT_FIELD = "company_website_confirm";
export const DECK_MAX_BYTES = 25 * 1024 * 1024;
export const DECK_ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const FIELD_CLASS =
  "w-full px-4 py-3 rounded-lg border border-line bg-surface text-primary placeholder:text-secondary focus:outline-none focus:ring-2 focus:ring-action focus:border-transparent transition-colors";
const LABEL_CLASS = "block text-sm font-medium text-primary mb-1.5";

/** Map an API error code (or HTTP status) to the catalogue line. Exported for the test. */
export function errorCopy(copy: SubmitDeckCopy, code: string | null | undefined, status: number): string {
  if (status === 429) return copy.errors.rate_limited;
  if (status === 404) return copy.errors.closed;
  if (code && code in copy.errors) return copy.errors[code as keyof SubmitDeckCopy["errors"]];
  return copy.errors.generic;
}

export interface SubmitDeckFormProps {
  slug: string;
  copy: SubmitDeckCopy;
  /** G21 P2-A — the linked intake template's questions (empty = the fixed form). */
  questions?: TemplateQuestion[];
  /** G21 P2-A — the program's own consent text, shown under the data-principle sentence. */
  programConsentText?: string | null;
}

export function SubmitDeckForm({ slug, copy, questions = [], programConsentText = null }: SubmitDeckFormProps) {
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ email: string; status: string } | null>(null);
  const [consent, setConsent] = useState(false);
  const [deckName, setDeckName] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const deck = fd.get("deck");
    if (!(deck instanceof File) || deck.size === 0) return setError(copy.errors.deck_required);
    if (deck.size > DECK_MAX_BYTES) return setError(copy.errors.deck_too_large);
    if (!consent) return setError(copy.errors.consent_required);
    fd.set("consent", "on");
    setLoading(true);
    try {
      const res = await fetch(`/api/intake/${encodeURIComponent(slug)}/submit`, { method: "POST", body: fd });
      if (res.status === 204) {
        // Honeypot path — a human never lands here; behave as if sent.
        setDone({ email: String(fd.get("founder_email") ?? ""), status: "received" });
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; status?: string };
      if (!res.ok || !data.ok) {
        setError(errorCopy(copy, data.error, res.status));
        return;
      }
      setDone({ email: String(fd.get("founder_email") ?? ""), status: data.status ?? "received" });
    } catch {
      setError(copy.errors.generic);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center" data-testid="apply-success" data-status={done.status}>
        <CheckCircle className="h-14 w-14 text-action" aria-hidden />
        <h2 className="text-2xl font-bold text-strong">{copy.successTitle}</h2>
        <p className="max-w-md text-secondary">{copy.successBody.replace("{email}", done.email)}</p>
        <p className="max-w-md text-xs text-secondary">{copy.successHint}</p>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="relative space-y-6" noValidate data-testid="apply-form" encType="multipart/form-data">
      <div>
        <label htmlFor={`${uid}-startup`} className={LABEL_CLASS}>
          {copy.startupName} <span className="text-action">*</span>
        </label>
        <input id={`${uid}-startup`} name="startup_name" type="text" required maxLength={100} autoComplete="organization" className={FIELD_CLASS} />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor={`${uid}-founder`} className={LABEL_CLASS}>
            {copy.founderName}
          </label>
          <input id={`${uid}-founder`} name="founder_name" type="text" maxLength={120} autoComplete="name" className={FIELD_CLASS} />
        </div>
        <div>
          <label htmlFor={`${uid}-email`} className={LABEL_CLASS}>
            {copy.founderEmail} <span className="text-action">*</span>
          </label>
          <input id={`${uid}-email`} name="founder_email" type="email" required maxLength={254} autoComplete="email" className={FIELD_CLASS} />
        </div>
      </div>

      <div>
        <label htmlFor={`${uid}-website`} className={LABEL_CLASS}>
          {copy.website}
        </label>
        <input id={`${uid}-website`} name="website" type="url" inputMode="url" placeholder="https://" maxLength={2048} autoComplete="url" className={FIELD_CLASS} />
      </div>

      <div>
        <label htmlFor={`${uid}-deck`} className={LABEL_CLASS}>
          {copy.deck} <span className="text-action">*</span>
        </label>
        <input
          id={`${uid}-deck`}
          name="deck"
          type="file"
          required
          accept={DECK_ACCEPT}
          onChange={(e) => setDeckName(e.target.files?.[0]?.name ?? null)}
          className="block w-full text-sm text-secondary file:mr-4 file:rounded-lg file:border-0 file:bg-action/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-action hover:file:bg-action/20"
        />
        <p className="mt-1.5 text-xs text-secondary">
          {copy.deckHint}
          {deckName ? <span className="ml-2 font-medium text-primary">{deckName}</span> : null}
        </p>
      </div>

      {questions.length > 0 ? (
        <fieldset className="space-y-4 rounded-xl border border-line p-4" data-testid="apply-template-questions">
          <legend className="px-1 text-sm font-semibold text-primary">Program questions</legend>
          {questions.map((q) => {
            const id = `${uid}-q-${q.key}`;
            const name = `answers[${q.key}]`;
            return (
              <div key={q.key}>
                <label htmlFor={id} className={LABEL_CLASS}>
                  {q.label} {q.required ? <span className="text-action">*</span> : null}
                </label>
                {q.type === "select" ? (
                  <select id={id} name={name} required={q.required} className={FIELD_CLASS} defaultValue="">
                    <option value="" disabled={q.required}>
                      —
                    </option>
                    {(q.options ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : q.type === "number" ? (
                  <input id={id} name={name} type="number" inputMode="decimal" step="any" required={q.required} className={FIELD_CLASS} />
                ) : q.type === "url" ? (
                  <input id={id} name={name} type="url" inputMode="url" placeholder="https://" maxLength={2048} required={q.required} className={FIELD_CLASS} />
                ) : (
                  // `file` questions take a link for now — the deck upload above is the one file field.
                  <input id={id} name={name} type="text" maxLength={2000} required={q.required} className={FIELD_CLASS} />
                )}
              </div>
            );
          })}
        </fieldset>
      ) : null}

      {/* Honeypot — humans never see or tab into it. */}
      <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor={`${uid}-hp`}>Company website (confirm)</label>
        <input id={`${uid}-hp`} name={HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <p className="text-sm text-primary" data-testid="apply-data-principle">
          {copy.consentSentence}
        </p>
        {programConsentText ? (
          <p className="mt-2 text-sm text-secondary" data-testid="apply-program-consent">
            {programConsentText}
          </p>
        ) : null}
        <label className="mt-3 flex items-start gap-3 text-sm text-secondary">
          <input
            type="checkbox"
            name="consent"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-line text-action focus:ring-action"
            data-testid="apply-consent"
          />
          <span>{copy.consentLabel}</span>
        </label>
      </div>

      {error ? (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" data-testid="apply-error">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-action px-5 py-3 text-sm font-semibold text-on-action transition-colors hover:bg-action-hover disabled:opacity-60"
        data-testid="apply-submit"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {loading ? copy.submitting : copy.submit}
      </button>

      <p className="text-center text-xs text-secondary">{copy.privacy}</p>
    </form>
  );
}
