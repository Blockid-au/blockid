"use client";

// Evaluator Assessment form — block 4 "My view" (G13-W4-D2, S-D2; BA spec
// §A.3 block 4, stories S3–S5, E4.2–E4.4).
//
// Left column = the AI verdict (read-only, from the persisted snapshot);
// right column = "me": 1–5 rating + Agree / Disagree / Unsure + note per
// dimension, a 13-criteria stance strip, risks, questions for the founder,
// a valuation view, private vs shared notes and the sticky footer
// (conviction · thesis fit % · PASS / TRACK / PROCEED · Save draft ·
// Submit · Share with founder).
//
//   * autosave: a dirty draft is PUT 1.5 s after the last edit (status
//     "draft") — never while the current row is submitted (an edit after a
//     submit is an explicit "Save as v(n+1)" so a click, not a keystroke,
//     opens a new version).
//   * submit: PUT status "submitted" → the row (or the new version) is
//     stamped; the decision chip in the header updates on refresh.
//   * share: ShareDialog (allow-list checkboxes + the literal preview) →
//     POST …/share; revoke → DELETE.
//   * GA4: investor_decision_saved · assessment_shared ·
//     assessment_history_viewed (§C.5).
//
// Everything the founder must never see stays in this component's state
// and the assessor's own row — the founder route renders FounderPreview
// from the server-masked projection instead (§C.1).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { userErrorMessage } from "@/lib/ui/user-error";
import { trackEvent } from "@/lib/analytics";
import type { AssessmentDecision, AssessmentDimKey, AssessmentHistoryEntry, EvaluationAssessment, FounderShareField, RiskItem } from "@/lib/evaluations/assessments";
import type { AssessmentPrefill } from "@/lib/evaluations/assessment-prefill";
import type { DossierCriterionRow, DossierDimRow } from "@/lib/evaluations/dossier";
import {
  DECISION_LABELS,
  DIM_LABELS,
  STANCE_LABELS,
  emptyFormValues,
  formValuesFromAssessment,
  hasAnyContent,
  submitBlockers,
  toPutBody,
  type AssessmentFormValues,
} from "./assessment-shared";
import { ShareDialog } from "./share-dialog";
import { AssessmentHistory } from "./assessment-history";

export interface AssessmentFormProps {
  evaluationId: string;
  initial: EvaluationAssessment | null;
  history: AssessmentHistoryEntry[];
  prefill: AssessmentPrefill | null;
  /** the snapshot on screen — stamped on the row (S3) */
  snapshotId: string | null;
  aiDims: DossierDimRow[];
  criteria: DossierCriterionRow[];
  founderClaimed: boolean;
  /**
   * G14-S34: the seat's current "exclude from the founder's anonymised
   * feedback letter" flag. `undefined` / `null` = migration 0406 not applied
   * → the checkbox is not rendered at all.
   */
  feedbackOptOut?: boolean | null;
}

const AUTOSAVE_MS = 1500;
const DIM_ORDER_UPPER: AssessmentDimKey[] = ["FTV", "MPC", "PTD", "TRE", "CGH", "IRI", "LCO", "SVM"];
const SEVERITIES: RiskItem["severity"][] = ["low", "medium", "high", "critical"];
const RATINGS = [1, 2, 3, 4, 5] as const;
/** G14-S37: the four FTV flags (jsonb in dimension_ratings.FTV.flags — no migration). */
const FTV_FLAGS: Array<{ key: "key_person_risk" | "full_time" | "complementary_skills" | "references_checked"; label: string; hint: string }> = [
  { key: "key_person_risk", label: "Key-person risk", hint: "the startup depends on one person" },
  { key: "full_time", label: "Full-time", hint: "founders are on this full-time" },
  { key: "complementary_skills", label: "Complementary skills", hint: "builder + seller + domain covered" },
  { key: "references_checked", label: "References checked", hint: "lifts the self-reported cap on the founder execution score" },
];

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: string; version: number; status: "draft" | "submitted" } | { kind: "error"; message: string };

function seedFromPrefill(p: AssessmentPrefill, snapshotId: string | null): AssessmentFormValues {
  const v = emptyFormValues(p.snapshotId ?? snapshotId);
  v.thesis_fit_pct = p.thesisFitPct;
  v.dimension_ratings = { ...p.dimensionRatings };
  v.risks = p.risks.map((r) => ({ ...r }));
  v.questions_for_founder = p.questionsForFounder.map((q) => ({ ...q }));
  return v;
}

const inputCls = "rounded-lg border border-surface-300 bg-white px-2 py-1 text-sm text-ink-800 focus:border-brand-500 focus:outline-none";
const btnCls = "rounded-lg border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50";

export function AssessmentForm({ evaluationId, initial, history, prefill, snapshotId, aiDims, criteria, founderClaimed, feedbackOptOut = null }: AssessmentFormProps) {
  const [current, setCurrent] = useState<EvaluationAssessment | null>(initial);
  // G14-S34 opt-out — null hides the control (0406 missing); saved on change.
  const [optOut, setOptOut] = useState<boolean | null>(feedbackOptOut);
  const [optOutState, setOptOutState] = useState<"idle" | "saving" | "error">("idle");
  const [timeline, setTimeline] = useState<AssessmentHistoryEntry[]>(history);
  const [values, setValues] = useState<AssessmentFormValues>(() =>
    initial ? formValuesFromAssessment(initial) : prefill && prefill.seeded ? seedFromPrefill(prefill, snapshotId) : emptyFormValues(snapshotId),
  );
  const [dirty, setDirty] = useState(false);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [shareOpen, setShareOpen] = useState(false);
  const [blockers, setBlockers] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);

  const submitted = current?.status === "submitted";
  const shared = Boolean(current?.sharedWithFounderAt);

  const update = useCallback((patch: Partial<AssessmentFormValues> | ((v: AssessmentFormValues) => AssessmentFormValues)) => {
    setValues((v) => (typeof patch === "function" ? patch(v) : { ...v, ...patch }));
    setDirty(true);
  }, []);

  const persist = useCallback(
    async (status: "draft" | "submitted"): Promise<boolean> => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setSave({ kind: "saving" });
      try {
        const res = await fetch(`/api/evaluations/${encodeURIComponent(evaluationId)}/assessment`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toPutBody(values, status)),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; assessment?: EvaluationAssessment; history?: AssessmentHistoryEntry[]; message?: string; error?: string };
        if (!res.ok || !json.ok || !json.assessment) {
          setSave({ kind: "error", message: json.message ?? json.error ?? `Save failed (${res.status})` });
          return false;
        }
        setCurrent(json.assessment);
        if (json.history) setTimeline(json.history);
        setDirty(false);
        setSave({ kind: "saved", at: json.assessment.updatedAt, version: json.assessment.version, status: json.assessment.status });
        trackEvent("investor_decision_saved", { evaluation_id: evaluationId, decision: json.assessment.decision ?? "none", status: json.assessment.status, version: json.assessment.version });
        return true;
      } catch (err) {
        setSave({ kind: "error", message: userErrorMessage(err, "Could not save your assessment. Please try again.") });
        return false;
      } finally {
        inFlight.current = false;
      }
    },
    [evaluationId, values],
  );

  // Autosave — drafts only (see header comment).
  useEffect(() => {
    if (!dirty || submitted || !hasAnyContent(values)) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist("draft"), AUTOSAVE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [dirty, submitted, values, persist]);

  const onSubmit = async () => {
    const b = submitBlockers(values);
    setBlockers(b);
    if (b.length) return;
    if (timer.current) clearTimeout(timer.current);
    await persist("submitted");
  };

  const onSaveDraft = async () => {
    if (timer.current) clearTimeout(timer.current);
    setBlockers([]);
    await persist("draft");
  };

  const onShared = (a: EvaluationAssessment, fieldsCount: number) => {
    setCurrent(a);
    setTimeline((t) => t.map((h) => (h.id === a.id ? { ...h, updatedAt: a.updatedAt } : h)));
    trackEvent("assessment_shared", { evaluation_id: evaluationId, fields_count: fieldsCount });
  };
  const onRevoked = () => {
    setCurrent((c) => (c ? { ...c, sharedWithFounderAt: null, sharedFields: [] } : c));
  };

  // G14-S34: exclude / re-include this seat from the founder's anonymised
  // feedback letter. Optimistic tick; reverted on a failed POST.
  const onOptOutChange = async (next: boolean) => {
    const before = optOut;
    setOptOut(next);
    setOptOutState("saving");
    try {
      const res = await fetch(`/api/evaluations/${encodeURIComponent(evaluationId)}/assessment/opt-out-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opt_out: next }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; opt_out?: boolean };
      if (!res.ok || !json.ok) throw new Error(`opt-out failed (${res.status})`);
      setOptOut(Boolean(json.opt_out));
      setOptOutState("idle");
    } catch {
      setOptOut(before);
      setOptOutState("error");
    }
  };

  const aiByDim = useMemo(() => {
    const m = new Map<AssessmentDimKey, DossierDimRow>();
    for (const d of aiDims) m.set(d.code.toUpperCase() as AssessmentDimKey, d);
    return m;
  }, [aiDims]);

  const statusLine = current
    ? `v${current.version} · ${current.status === "submitted" ? `submitted ${fmt(current.submittedAt)}` : "draft"}${shared ? ` · shared with founder ${fmt(current.sharedWithFounderAt)} (${current.sharedFields.length} section${current.sharedFields.length === 1 ? "" : "s"})` : ""}`
    : "No assessment yet";

  return (
    <div className="space-y-5" data-testid="assessment-form" data-status={current?.status ?? "new"} data-version={current?.version ?? 0}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-600">
        <span data-testid="assessment-status-line">{statusLine}</span>
        <span aria-live="polite" data-testid="assessment-save-state">
          {save.kind === "saving" ? "Saving…" : save.kind === "saved" ? `Saved v${save.version} (${save.status}) ${fmt(save.at)}` : save.kind === "error" ? <span className="text-red-700">{save.message}</span> : dirty ? "Unsaved changes" : ""}
        </span>
      </div>

      {!current && prefill?.seeded ? (
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-900" data-testid="assessment-prefill-hint">
          Prefilled from {prefill.mandateName ? `your mandate “${prefill.mandateName}”` : "the latest snapshot"}
          {prefill.thesisFitPct != null ? ` — thesis fit ${prefill.thesisFitPct}%` : ""}. Every AI-suggested item is marked; edit or delete anything before you submit.
        </p>
      ) : null}
      {submitted ? (
        <p className="rounded-lg bg-surface-50 px-3 py-2 text-xs text-ink-600" data-testid="assessment-new-version-note">
          This version is submitted. Editing and saving creates <strong>v{current!.version + 1}</strong> pre-filled from v{current!.version} — the timeline below keeps both.
        </p>
      ) : null}

      {/* ── A. AI vs me per dimension ── */}
      <section aria-labelledby="assessment-dims-heading">
        <h3 id="assessment-dims-heading" className="text-sm font-semibold text-ink-900">AI verdict vs my view — per dimension</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm" data-testid="assessment-dims-table">
            <thead>
              <tr className="text-left text-xs text-ink-500">
                <th scope="col" className="py-1 pr-2">Dimension</th>
                <th scope="col" className="py-1 pr-2">AI score</th>
                <th scope="col" className="py-1 pr-2">My rating</th>
                <th scope="col" className="py-1 pr-2">Stance</th>
                <th scope="col" className="py-1">Note</th>
              </tr>
            </thead>
            <tbody>
              {DIM_ORDER_UPPER.map((k) => {
                const ai = aiByDim.get(k);
                const mine = values.dimension_ratings[k];
                const ratingId = `dim-${k}-rating`;
                const stanceId = `dim-${k}-stance`;
                const noteId = `dim-${k}-note`;
                return (
                  <tr key={k} className="border-t border-surface-100 align-top">
                    <th scope="row" className="py-2 pr-2 text-left font-medium text-ink-800">
                      {DIM_LABELS[k]} <span className="text-xs text-ink-400">{k}</span>
                    </th>
                    <td className="py-2 pr-2 tabular-nums text-ink-700" data-testid={`ai-score-${k}`}>
                      {ai?.score != null ? `${Math.round(ai.score)}/100` : "not scored"}
                      {ai?.delta30d != null ? <span className={`ml-1 text-xs ${ai.delta30d > 0 ? "text-emerald-700" : ai.delta30d < 0 ? "text-red-700" : "text-ink-400"}`}>{ai.delta30d > 0 ? "+" : ""}{ai.delta30d}</span> : null}
                    </td>
                    <td className="py-2 pr-2">
                      <label htmlFor={ratingId} className="sr-only">My rating for {DIM_LABELS[k]}</label>
                      <select
                        id={ratingId}
                        className={inputCls}
                        value={mine?.rating ?? ""}
                        onChange={(e) => {
                          const r = e.target.value ? (Number(e.target.value) as 1 | 2 | 3 | 4 | 5) : null;
                          update((v) => {
                            const next = { ...v.dimension_ratings };
                            if (r == null) delete next[k];
                            else next[k] = { rating: r, stance: next[k]?.stance ?? "unsure", ...(next[k]?.note ? { note: next[k]!.note } : {}) };
                            return { ...v, dimension_ratings: next };
                          });
                        }}
                      >
                        <option value="">—</option>
                        {RATINGS.map((r) => (
                          <option key={r} value={r}>{r} / 5</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-2">
                      <label htmlFor={stanceId} className="sr-only">Stance on the AI score for {DIM_LABELS[k]}</label>
                      <select
                        id={stanceId}
                        className={inputCls}
                        value={mine?.stance ?? "unsure"}
                        disabled={!mine}
                        onChange={(e) => update((v) => ({ ...v, dimension_ratings: { ...v.dimension_ratings, [k]: { ...v.dimension_ratings[k]!, stance: e.target.value as "agree" | "disagree" | "unsure" } } }))}
                      >
                        {(Object.keys(STANCE_LABELS) as Array<keyof typeof STANCE_LABELS>).map((s) => (
                          <option key={s} value={s}>{STANCE_LABELS[s]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2">
                      <label htmlFor={noteId} className="sr-only">Note for {DIM_LABELS[k]}</label>
                      <input
                        id={noteId}
                        className={`${inputCls} w-full min-w-[12rem]`}
                        maxLength={500}
                        placeholder="Why you agree or disagree"
                        value={mine?.note ?? ""}
                        disabled={!mine}
                        onChange={(e) => update((v) => ({ ...v, dimension_ratings: { ...v.dimension_ratings, [k]: { ...v.dimension_ratings[k]!, note: e.target.value || undefined } } }))}
                      />
                      {k === "FTV" && (
                        <fieldset className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1" data-testid="ftv-flags">
                          <legend className="sr-only">Founder & Team flags</legend>
                          {FTV_FLAGS.map((f) => {
                            const id = `dim-FTV-flag-${f.key}`;
                            const checked = mine?.flags?.[f.key] === true;
                            return (
                              <label key={f.key} htmlFor={id} className="inline-flex items-center gap-1 text-[11px] text-ink-600" title={f.hint}>
                                <input
                                  id={id}
                                  type="checkbox"
                                  className="h-3.5 w-3.5 rounded border-surface-300"
                                  checked={checked}
                                  disabled={!mine}
                                  onChange={(e) =>
                                    update((v) => {
                                      const cur = v.dimension_ratings.FTV;
                                      if (!cur) return v;
                                      const flags = { ...(cur.flags ?? {}), [f.key]: e.target.checked };
                                      return { ...v, dimension_ratings: { ...v.dimension_ratings, FTV: { ...cur, flags } } };
                                    })
                                  }
                                />
                                {f.label}
                              </label>
                            );
                          })}
                        </fieldset>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── B. 13-criteria strip ── */}
      {criteria.length ? (
        <section aria-labelledby="assessment-criteria-heading">
          <h3 id="assessment-criteria-heading" className="text-sm font-semibold text-ink-900">Criterion ratings (optional)</h3>
          <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3" data-testid="assessment-criteria-strip">
            {criteria.map((c) => {
              const id = `crit-${c.key}`;
              return (
                <li key={c.key} className="flex items-center justify-between gap-2 rounded-lg bg-surface-50 px-2.5 py-1.5 text-xs">
                  <label htmlFor={id} className="truncate text-ink-800">
                    {c.title} <span className="tabular-nums text-ink-500">{c.score != null ? Math.round(c.score) : "—"}</span>
                  </label>
                  <select
                    id={id}
                    className={inputCls}
                    value={values.criterion_ratings[c.key]?.stance ?? ""}
                    onChange={(e) =>
                      update((v) => {
                        const next = { ...v.criterion_ratings };
                        if (!e.target.value) delete next[c.key];
                        else next[c.key] = { stance: e.target.value as "agree" | "disagree" | "unsure" };
                        return { ...v, criterion_ratings: next };
                      })
                    }
                  >
                    <option value="">—</option>
                    {(Object.keys(STANCE_LABELS) as Array<keyof typeof STANCE_LABELS>).map((s) => (
                      <option key={s} value={s}>{STANCE_LABELS[s]}</option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* ── C. Risks ── */}
      <section aria-labelledby="assessment-risks-heading">
        <div className="flex items-center justify-between">
          <h3 id="assessment-risks-heading" className="text-sm font-semibold text-ink-900">Risks</h3>
          <button type="button" className={`${btnCls} border-surface-300 text-ink-700`} onClick={() => update((v) => ({ ...v, risks: [...v.risks, { title: "", severity: "medium", source: "evaluator" }] }))} disabled={values.risks.length >= 30}>
            + Add risk
          </button>
        </div>
        {values.risks.length === 0 ? <p className="mt-1 text-xs text-ink-500">No risks listed.</p> : null}
        <ul className="mt-2 space-y-2" data-testid="assessment-risks">
          {values.risks.map((r, i) => (
            <li key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-surface-200 p-2 sm:grid-cols-[1fr_auto_auto_auto]">
              <div>
                <label htmlFor={`risk-${i}-title`} className="sr-only">Risk {i + 1} title</label>
                <input id={`risk-${i}-title`} className={`${inputCls} w-full`} maxLength={120} placeholder="Risk title" value={r.title} onChange={(e) => update((v) => ({ ...v, risks: v.risks.map((x, j) => (j === i ? { ...x, title: e.target.value, source: "evaluator" } : x)) }))} />
                {r.source === "ai" ? <span className="mt-1 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800">suggested by AI</span> : null}
              </div>
              <div>
                <label htmlFor={`risk-${i}-severity`} className="sr-only">Risk {i + 1} severity</label>
                <select id={`risk-${i}-severity`} className={inputCls} value={r.severity} onChange={(e) => update((v) => ({ ...v, risks: v.risks.map((x, j) => (j === i ? { ...x, severity: e.target.value as RiskItem["severity"] } : x)) }))}>
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`risk-${i}-dim`} className="sr-only">Risk {i + 1} dimension</label>
                <select id={`risk-${i}-dim`} className={inputCls} value={r.dimension ?? ""} onChange={(e) => update((v) => ({ ...v, risks: v.risks.map((x, j) => (j === i ? { ...x, dimension: (e.target.value || undefined) as AssessmentDimKey | undefined } : x)) }))}>
                  <option value="">any dim</option>
                  {DIM_ORDER_UPPER.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>
              <button type="button" className={`${btnCls} border-surface-300 text-ink-600`} aria-label={`Remove risk ${i + 1}`} onClick={() => update((v) => ({ ...v, risks: v.risks.filter((_, j) => j !== i) }))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* ── D. Questions for the founder ── */}
      <section aria-labelledby="assessment-questions-heading">
        <div className="flex items-center justify-between">
          <h3 id="assessment-questions-heading" className="text-sm font-semibold text-ink-900">Questions for the founder</h3>
          <button type="button" className={`${btnCls} border-surface-300 text-ink-700`} onClick={() => update((v) => ({ ...v, questions_for_founder: [...v.questions_for_founder, { text: "", sent_at: null }] }))} disabled={values.questions_for_founder.length >= 30}>
            + Add question
          </button>
        </div>
        {values.questions_for_founder.length === 0 ? <p className="mt-1 text-xs text-ink-500">No questions yet.</p> : null}
        <ul className="mt-2 space-y-2" data-testid="assessment-questions">
          {values.questions_for_founder.map((q, i) => (
            <li key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-surface-200 p-2 sm:grid-cols-[1fr_auto_auto]">
              <div>
                <label htmlFor={`q-${i}-text`} className="sr-only">Question {i + 1}</label>
                <input id={`q-${i}-text`} className={`${inputCls} w-full`} maxLength={300} placeholder="What would you ask the founder?" value={q.text} onChange={(e) => update((v) => ({ ...v, questions_for_founder: v.questions_for_founder.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) }))} />
              </div>
              <div>
                <label htmlFor={`q-${i}-dim`} className="sr-only">Question {i + 1} dimension</label>
                <select id={`q-${i}-dim`} className={inputCls} value={q.dimension ?? ""} onChange={(e) => update((v) => ({ ...v, questions_for_founder: v.questions_for_founder.map((x, j) => (j === i ? { ...x, dimension: (e.target.value || undefined) as AssessmentDimKey | undefined } : x)) }))}>
                  <option value="">any dim</option>
                  {DIM_ORDER_UPPER.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>
              <button type="button" className={`${btnCls} border-surface-300 text-ink-600`} aria-label={`Remove question ${i + 1}`} onClick={() => update((v) => ({ ...v, questions_for_founder: v.questions_for_founder.filter((_, j) => j !== i) }))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* ── E. Valuation view ── */}
      <section aria-labelledby="assessment-valuation-heading">
        <h3 id="assessment-valuation-heading" className="text-sm font-semibold text-ink-900">My valuation view (A$)</h3>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <label htmlFor="val-low" className="block text-xs text-ink-600">Low (A$)</label>
            <input id="val-low" type="number" min={0} step={1000} className={`${inputCls} w-full`} value={values.valuation_view?.low_aud ?? ""} onChange={(e) => update((v) => ({ ...v, valuation_view: { ...(v.valuation_view ?? {}), low_aud: e.target.value ? Number(e.target.value) : undefined } }))} />
          </div>
          <div>
            <label htmlFor="val-high" className="block text-xs text-ink-600">High (A$)</label>
            <input id="val-high" type="number" min={0} step={1000} className={`${inputCls} w-full`} value={values.valuation_view?.high_aud ?? ""} onChange={(e) => update((v) => ({ ...v, valuation_view: { ...(v.valuation_view ?? {}), high_aud: e.target.value ? Number(e.target.value) : undefined } }))} />
          </div>
          <div>
            <label htmlFor="val-note" className="block text-xs text-ink-600">Method note</label>
            <input id="val-note" className={`${inputCls} w-full`} maxLength={300} placeholder="e.g. comps at 6× ARR" value={values.valuation_view?.method_note ?? ""} onChange={(e) => update((v) => ({ ...v, valuation_view: { ...(v.valuation_view ?? {}), method_note: e.target.value || undefined } }))} />
          </div>
        </div>
      </section>

      {/* ── F. Notes ── */}
      <section aria-labelledby="assessment-notes-heading" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <h3 id="assessment-notes-heading" className="sr-only">Notes</h3>
        <div>
          <label htmlFor="private-notes" className="block text-xs font-medium text-ink-700">Private notes <span className="font-normal text-ink-500">— never shared, never shown to other seats</span></label>
          <textarea id="private-notes" className={`${inputCls} mt-1 w-full`} rows={4} maxLength={20000} value={values.private_notes} onChange={(e) => update({ private_notes: e.target.value })} />
        </div>
        <div>
          <label htmlFor="shared-notes" className="block text-xs font-medium text-ink-700">Shared notes <span className="font-normal text-ink-500">— visible to the founder only if you tick them when sharing</span></label>
          <textarea id="shared-notes" className={`${inputCls} mt-1 w-full`} rows={4} maxLength={20000} value={values.shared_notes} onChange={(e) => update({ shared_notes: e.target.value })} />
        </div>
      </section>

      {/* ── Sticky footer ── */}
      <div className="sticky bottom-0 -mx-5 border-t border-surface-200 bg-white/95 px-5 py-3 backdrop-blur sm:-mx-6 sm:px-6" data-testid="assessment-footer">
        <div className="flex flex-wrap items-end gap-4">
          <fieldset>
            <legend className="text-xs font-medium text-ink-700">Conviction</legend>
            <div className="mt-1 flex gap-1" role="radiogroup" aria-label="Conviction 1 to 5">
              {RATINGS.map((r) => (
                <button key={r} type="button" role="radio" aria-checked={values.conviction === r} aria-label={`Conviction ${r} of 5`} className={`h-8 w-8 rounded-full border text-sm ${values.conviction === r ? "border-brand-600 bg-brand-600 text-white" : "border-surface-300 text-ink-700"}`} onClick={() => update({ conviction: r })}>
                  {r}
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="thesis-fit" className="block text-xs font-medium text-ink-700">Thesis fit %</label>
            <input id="thesis-fit" type="number" min={0} max={100} className={`${inputCls} mt-1 w-24`} value={values.thesis_fit_pct ?? ""} onChange={(e) => update({ thesis_fit_pct: e.target.value === "" ? null : Math.max(0, Math.min(100, Math.round(Number(e.target.value)))) })} />
          </div>
          <fieldset>
            <legend className="text-xs font-medium text-ink-700">Decision</legend>
            <div className="mt-1 inline-flex overflow-hidden rounded-lg border border-surface-300" role="radiogroup" aria-label="Decision">
              {(Object.keys(DECISION_LABELS) as AssessmentDecision[]).map((d) => (
                <button key={d} type="button" role="radio" aria-checked={values.decision === d} className={`px-3 py-1.5 text-sm ${values.decision === d ? "bg-ink-900 text-white" : "bg-white text-ink-700"}`} onClick={() => update({ decision: d })} data-testid={`decision-${d}`}>
                  {DECISION_LABELS[d]}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" className={`${btnCls} border-surface-300 text-ink-700`} onClick={() => void onSaveDraft()} disabled={save.kind === "saving" || !hasAnyContent(values)} data-testid="assessment-save-draft">
              {submitted ? `Save as v${current!.version + 1} draft` : "Save draft"}
            </button>
            <button type="button" className={`${btnCls} border-brand-600 bg-brand-600 text-white`} onClick={() => void onSubmit()} disabled={save.kind === "saving"} data-testid="assessment-submit">
              {submitted ? `Submit v${current!.version + 1}` : "Submit assessment"}
            </button>
            <button type="button" className={`${btnCls} border-surface-300 text-ink-700`} onClick={() => setShareOpen(true)} disabled={!current || !founderClaimed || dirty} title={!founderClaimed ? "The founder has not claimed this evaluation yet" : dirty ? "Save first" : undefined} data-testid="assessment-share-open">
              {shared ? "Sharing…" : "Share with founder"}
            </button>
          </div>
        </div>
        {blockers.length ? (
          <ul className="mt-2 text-xs text-red-700" role="alert" data-testid="assessment-blockers">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        ) : null}
        {!founderClaimed ? <p className="mt-2 text-xs text-ink-500">Sharing unlocks once the founder claims the evaluation.</p> : null}
        {optOut !== null ? (
          <label className="mt-2 flex items-start gap-2 text-xs text-ink-600" data-testid="assessment-feedback-opt-out">
            <input
              type="checkbox"
              className="mt-0.5 h-3.5 w-3.5 rounded border-surface-300"
              checked={optOut}
              disabled={!current || optOutState === "saving"}
              onChange={(e) => void onOptOutChange(e.target.checked)}
              aria-describedby="assessment-feedback-opt-out-hint"
            />
            <span>
              Exclude my ratings from the founder&apos;s anonymised feedback letter
              <span id="assessment-feedback-opt-out-hint" className="block text-[11px] text-ink-500">
                Letters aggregate at least 3 evaluators from 2 organisations; this seat&apos;s ratings, risks and questions are left out when ticked.
                {optOutState === "error" ? <span className="ml-1 text-red-700">Could not save — try again.</span> : null}
              </span>
            </span>
          </label>
        ) : null}
      </div>

      <AssessmentHistory evaluationId={evaluationId} history={timeline} current={current} />

      {shareOpen && current ? (
        <ShareDialog
          evaluationId={evaluationId}
          values={values}
          initialFields={current.sharedFields as FounderShareField[]}
          shared={shared}
          onClose={() => setShareOpen(false)}
          onShared={onShared}
          onRevoked={onRevoked}
        />
      ) : null}
    </div>
  );
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
