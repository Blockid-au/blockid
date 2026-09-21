"use client";

// G19-S45 (D6) — the one-question report-clarity survey.
//
//   EN "Was this report clear and useful?" / VI "Báo cáo này có rõ ràng và
//   hữu ích không?" — 0–10 chips + an optional 120-char comment.
//
// Mounted right after the Executive summary on the paid founder view and on
// the public share page (never on the free cut, the demo or the PDF render).
// Asked ONCE per snapshot: the answer (or a dismissal) is remembered in
// localStorage under `tbr-clarity:<snapshotId>` and the component renders
// nothing afterwards. The answer posts to the existing POST /api/nps with
// `context: "tbr_clarity:<snapshotId>"` (the route emits the server-side
// `tbr_clarity_answered` twin) and fires the client GA4 event.
//
// KPI (goal doc §5): median ≥ 8.5 with N ≥ 30 / month — read by the admin
// report-KPI tile (lib/admin/report-kpis.ts).
//
// Testability (no @testing-library here): the form is a pure component
// (`TbrClaritySurveyForm`), the side effects are one pure async function
// (`submitClarity`) with injectable fetch / storage / tracker, and the
// once-per-snapshot rule is `hasAnswered` / `markAnswered` over an injectable
// storage. The hook-bearing `<TbrClaritySurvey>` only wires them together.

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { getTbrStrings, type TbrLocale, type TbrV2Strings } from "@/lib/i18n/tbr-strings";

export const TBR_CLARITY_TESTID = "tbr-clarity-survey";
export const TBR_CLARITY_STORAGE_PREFIX = "tbr-clarity:";
export const TBR_CLARITY_CONTEXT_PREFIX = "tbr_clarity:";
export const TBR_CLARITY_COMMENT_MAX = 120;
export const TBR_CLARITY_SCORES: readonly number[] = Object.freeze(Array.from({ length: 11 }, (_, n) => n));

export type ClaritySurface = "founder" | "share";

/** `context` value the survey posts to /api/nps — parsed back by the admin KPI. */
export function clarityContext(snapshotId: string): string {
  return `${TBR_CLARITY_CONTEXT_PREFIX}${snapshotId}`;
}

export function clarityStorageKey(snapshotId: string): string {
  return `${TBR_CLARITY_STORAGE_PREFIX}${snapshotId}`;
}

/** The subset of Storage the once-per-snapshot rule needs (injectable for tests). */
export interface ClarityStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): ClarityStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Once per snapshot: true when this browser already answered (or dismissed) the survey for `snapshotId`. */
export function hasAnswered(snapshotId: string, storage: ClarityStorage | null = browserStorage()): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(clarityStorageKey(snapshotId)) !== null;
  } catch {
    return false;
  }
}

export function markAnswered(snapshotId: string, value: string, storage: ClarityStorage | null = browserStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(clarityStorageKey(snapshotId), value);
  } catch {
    /* private mode / quota — the survey may show again next visit, which is acceptable */
  }
}

export interface SubmitClarityInput {
  snapshotId: string;
  surface: ClaritySurface;
  score: number;
  comment: string;
  /** Test seams. */
  fetchImpl?: typeof fetch | null;
  storage?: ClarityStorage | null;
  track?: typeof trackEvent;
}

/** POST /api/nps (context `tbr_clarity:<snapshotId>`), GA4 `tbr_clarity_answered`, then remember the answer. Never throws. */
export async function submitClarity(input: SubmitClarityInput): Promise<{ posted: boolean }> {
  const score = Math.max(0, Math.min(10, Math.trunc(input.score)));
  const comment = input.comment.trim().slice(0, TBR_CLARITY_COMMENT_MAX);
  const f = input.fetchImpl === undefined ? (typeof fetch === "function" ? fetch : null) : input.fetchImpl;
  let posted = false;
  try {
    if (f) {
      const res = await f("/api/nps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        keepalive: true,
        body: JSON.stringify({ score, comment, context: clarityContext(input.snapshotId), surface: input.surface }),
      });
      posted = Boolean(res && (res as Response).ok !== false);
    }
  } catch {
    /* analytics-grade: never block the reader */
  }
  try {
    (input.track ?? trackEvent)("tbr_clarity_answered", { score, surface: input.surface, has_comment: comment.length > 0, snapshot_id: input.snapshotId });
  } catch {
    /* analytics only */
  }
  markAnswered(input.snapshotId, String(score), input.storage === undefined ? browserStorage() : input.storage);
  return { posted };
}

export type ClarityPhase = "idle" | "sending" | "done";

export interface TbrClaritySurveyFormProps {
  snapshotId: string;
  strings: TbrV2Strings["survey"];
  score: number | null;
  comment: string;
  phase: ClarityPhase;
  onScore?: (n: number) => void;
  onComment?: (text: string) => void;
  onSubmit?: () => void;
  onDismiss?: () => void;
}

/** Pure (hook-free) survey markup — rendered by the island and by the static tests. */
export function TbrClaritySurveyForm({ snapshotId, strings: t, score, comment, phase, onScore, onComment, onSubmit, onDismiss }: TbrClaritySurveyFormProps) {
  return (
    <aside
      data-testid={TBR_CLARITY_TESTID}
      data-tbr-clarity={snapshotId}
      data-tbr-clarity-phase={phase}
      aria-label={t.question}
      className="rounded-2xl border border-brand-300 dark:border-brand-800 bg-surface-sunken p-4 print:hidden"
    >
      {phase === "done" ? (
        <p role="status" className="text-sm font-medium text-action" data-testid="tbr-clarity-thanks">
          {t.thanks}
        </p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit?.();
          }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-primary">{t.question}</p>
            <p className="text-xs text-muted">{t.hint}</p>
          </div>
          <div role="radiogroup" aria-label={t.question} className="flex flex-wrap items-center gap-1.5">
            {TBR_CLARITY_SCORES.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={score === n}
                aria-label={t.ariaScore(n)}
                data-tbr-clarity-score={n}
                onClick={() => onScore?.(n)}
                className={cn(
                  "h-9 w-9 rounded-lg border text-sm font-semibold tabular-nums transition-colors",
                  score === n
                    ? "border-action bg-action text-on-action"
                    : "border-line-subtle bg-surface text-secondary hover:border-line",
                )}
              >
                {n}
              </button>
            ))}
            <span className="ml-1 text-[11px] uppercase tracking-wide text-muted">
              0 = {t.low} · 10 = {t.high}
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              value={comment}
              maxLength={TBR_CLARITY_COMMENT_MAX}
              onChange={(e) => onComment?.(e.target.value.slice(0, TBR_CLARITY_COMMENT_MAX))}
              placeholder={t.commentPlaceholder}
              aria-label={t.commentPlaceholder}
              data-testid="tbr-clarity-comment"
              className="h-9 flex-1 rounded-lg border border-line-subtle bg-surface px-3 text-sm text-primary placeholder:text-muted"
            />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={score === null || phase !== "idle"}
                data-testid="tbr-clarity-submit"
                className="inline-flex h-9 items-center rounded-lg bg-action px-4 text-sm font-semibold text-on-action transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t.submit}
              </button>
              <button type="button" onClick={onDismiss} data-testid="tbr-clarity-dismiss" className="text-xs text-muted underline-offset-2 hover:underline">
                {t.dismiss}
              </button>
            </div>
          </div>
        </form>
      )}
    </aside>
  );
}

export interface TbrClaritySurveyProps {
  /** The snapshot (or order) the survey is about — the once-per-snapshot key and the /api/nps context. */
  snapshotId: string;
  surface: ClaritySurface;
  locale?: TbrLocale;
}

export function TbrClaritySurvey({ snapshotId, surface, locale = "en" }: TbrClaritySurveyProps) {
  const t = getTbrStrings(locale).v2.survey;
  const [hidden, setHidden] = useState(true);
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [phase, setPhase] = useState<ClarityPhase>("idle");

  // Hydration-safe: decide visibility after mount from localStorage.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-hydration localStorage read; a lazy initialiser would mismatch the server render
    setHidden(hasAnswered(snapshotId));
  }, [snapshotId]);

  const submit = useCallback(async () => {
    if (score === null || phase !== "idle") return;
    setPhase("sending");
    await submitClarity({ snapshotId, surface, score, comment });
    setPhase("done");
    // Leave the thank-you line on screen briefly, then collapse for good.
    window.setTimeout(() => setHidden(true), 4000);
  }, [score, phase, snapshotId, surface, comment]);

  const dismiss = useCallback(() => {
    markAnswered(snapshotId, "dismissed");
    setHidden(true);
  }, [snapshotId]);

  if (hidden) return null;
  return <TbrClaritySurveyForm snapshotId={snapshotId} strings={t} score={score} comment={comment} phase={phase} onScore={setScore} onComment={setComment} onSubmit={() => void submit()} onDismiss={dismiss} />;
}
