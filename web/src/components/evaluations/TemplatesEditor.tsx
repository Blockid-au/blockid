"use client";

// TemplatesEditor — /workspace/accelerator/templates (G21 P2-A): the list
// of my intake templates + a create / edit form (questions builder, rubric
// weight sliders shared with the batch dialog, consent text). Talks to
// /api/intake/templates (+ [id]); every rule lives in
// lib/intake/templates-shared.ts so the form only collects input.

import * as React from "react";
import Link from "next/link";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { equalWeights, isEqualWeights, type RubricWeights } from "@/lib/evaluations/batch-shared";
import { MAX_QUESTIONS, QUESTION_TYPES, keyFromLabel, type IntakeTemplate, type QuestionType, type TemplateQuestion } from "@/lib/intake/templates-shared";
import { RubricWeightsSliders } from "@/components/evaluations/RubricWeightsSliders";

export interface TemplatesEditorProps {
  initialTemplates: IntakeTemplate[];
  /** The approved data-principle sentence — shown as the fixed consent line the program text is appended to. */
  dataPrincipleSentence: string;
}

interface DraftQuestion extends TemplateQuestion {
  /** Editor-only: options as one comma-separated string. */
  optionsText: string;
  /** True once the author edited the key by hand (stop deriving it from the label). */
  keyTouched: boolean;
}

const FIELD = "w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-ink-800 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-navy";
const LABEL = "mb-1 block text-sm font-medium text-ink-800";

function toDraft(q: TemplateQuestion): DraftQuestion {
  return { ...q, optionsText: (q.options ?? []).join(", "), keyTouched: true };
}

function fromDraft(q: DraftQuestion): TemplateQuestion {
  const options = q.type === "select" ? q.optionsText.split(",").map((o) => o.trim()).filter(Boolean) : undefined;
  return { key: q.key, label: q.label, type: q.type, required: q.required, ...(options ? { options } : {}) };
}

export function TemplatesEditor({ initialTemplates, dataPrincipleSentence }: TemplatesEditorProps) {
  const [templates, setTemplates] = React.useState(initialTemplates);
  const [editing, setEditing] = React.useState<IntakeTemplate | "new" | null>(initialTemplates.length === 0 ? "new" : null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [questions, setQuestions] = React.useState<DraftQuestion[]>([]);
  const [weights, setWeights] = React.useState<RubricWeights>(equalWeights());
  const [consent, setConsent] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  function load(t: IntakeTemplate | "new") {
    setEditing(t);
    setError(null);
    setNotice(null);
    if (t === "new") {
      setName("");
      setDescription("");
      setQuestions([]);
      setWeights(equalWeights());
      setConsent("");
    } else {
      setName(t.name);
      setDescription(t.description ?? "");
      setQuestions(t.questions.map(toDraft));
      setWeights(t.rubricWeights);
      setConsent(t.consentText ?? "");
    }
  }

  function addQuestion() {
    if (questions.length >= MAX_QUESTIONS) return;
    setQuestions((qs) => [...qs, { key: "", label: "", type: "text", required: false, optionsText: "", keyTouched: false }]);
  }

  function updateQuestion(i: number, patch: Partial<DraftQuestion>) {
    setQuestions((qs) =>
      qs.map((q, idx) => {
        if (idx !== i) return q;
        const next = { ...q, ...patch };
        if (!next.keyTouched && patch.label !== undefined) next.key = keyFromLabel(patch.label);
        return next;
      }),
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !editing) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const body = {
      name,
      description: description || undefined,
      questions: questions.map(fromDraft),
      rubric_weights: isEqualWeights(weights) ? undefined : weights,
      consent_text: consent || undefined,
    };
    try {
      const isNew = editing === "new";
      const res = await fetch(isNew ? "/api/intake/templates" : `/api/intake/templates/${encodeURIComponent(editing.id)}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; template?: IntakeTemplate; message?: string; error?: string };
      if (!res.ok || !json.ok || !json.template) {
        setError(json.message ?? (json.error === "not_migrated" ? "Intake templates are not enabled on this server yet." : "Could not save the template."));
        return;
      }
      const saved = json.template;
      setTemplates((list) => (isNew ? [saved, ...list] : list.map((t) => (t.id === saved.id ? saved : t))));
      setEditing(saved);
      setQuestions(saved.questions.map(toDraft));
      setNotice(isNew ? "Template created." : "Template saved.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(t: IntakeTemplate) {
    if (busy) return;
    if (typeof window !== "undefined" && !window.confirm(`Delete "${t.name}"? Links and cohorts using it fall back to the default form.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/intake/templates/${encodeURIComponent(t.id)}`, { method: "DELETE" });
      if (res.ok) {
        setTemplates((list) => list.filter((x) => x.id !== t.id));
        if (editing !== "new" && editing?.id === t.id) setEditing(null);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]" data-testid="templates-editor">
      <aside className="space-y-3">
        <button type="button" onClick={() => load("new")} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-navy-elev-1" data-testid="template-new">
          <Plus className="h-4 w-4" aria-hidden="true" />
          New template
        </button>
        {templates.length === 0 ? (
          <p className="text-xs text-ink-500" data-testid="templates-empty">No templates yet. The default form asks for startup, founder, e-mail, website and deck.</p>
        ) : (
          <ul className="divide-y divide-surface-100 rounded-xl border border-surface-200 bg-white" data-testid="templates-list">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <button type="button" onClick={() => load(t)} className={`min-w-0 flex-1 truncate text-left ${editing !== "new" && editing?.id === t.id ? "font-semibold text-brand-700" : "text-ink-800 hover:text-brand-700"}`}>
                  {t.name}
                  <span className="ml-1 text-xs font-normal text-ink-500">· {t.questions.length} q</span>
                </button>
                <button type="button" onClick={() => void remove(t)} aria-label={`Delete ${t.name}`} className="rounded-md p-1 text-ink-400 hover:bg-red-50 hover:text-red-700">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-ink-500">
          Attach a template when you create an intake link on{" "}
          <Link href="/workspace/accelerator/applications" className="font-medium text-brand-700 hover:underline">
            Intake inbox
          </Link>{" "}
          or a cohort on{" "}
          <Link href="/workspace/evaluations/cohort" className="font-medium text-brand-700 hover:underline">
            Cohorts
          </Link>
          .
        </p>
      </aside>

      {editing ? (
        <form onSubmit={save} className="space-y-6 rounded-2xl border border-surface-200 bg-white p-5" data-testid="template-form">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="tpl-name" className={LABEL}>Template name</label>
              <input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required className={FIELD} placeholder="e.g. Fellowship intake 2026" />
            </div>
            <div>
              <label htmlFor="tpl-desc" className={LABEL}>Description (internal)</label>
              <input id="tpl-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} className={FIELD} />
            </div>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-ink-900">Questions</legend>
            <p className="text-xs text-ink-500">Shown under the fixed fields on the public form. Up to {MAX_QUESTIONS}. Keys become the answer columns.</p>
            {questions.map((q, i) => (
              <div key={i} className="grid gap-2 rounded-xl border border-surface-200 p-3 sm:grid-cols-[1fr_140px_120px_auto]" data-testid="template-question">
                <div>
                  <label htmlFor={`q-label-${i}`} className="sr-only">Question {i + 1} label</label>
                  <input id={`q-label-${i}`} value={q.label} onChange={(e) => updateQuestion(i, { label: e.target.value })} maxLength={160} placeholder="Question label" className={FIELD} />
                  <div className="mt-1 flex items-center gap-2 text-xs text-ink-500">
                    <label htmlFor={`q-key-${i}`}>key</label>
                    <input id={`q-key-${i}`} value={q.key} onChange={(e) => updateQuestion(i, { key: e.target.value.toLowerCase(), keyTouched: true })} maxLength={40} className="w-40 rounded-md border border-surface-200 px-2 py-0.5 font-mono" />
                  </div>
                  {q.type === "select" ? (
                    <input value={q.optionsText} onChange={(e) => updateQuestion(i, { optionsText: e.target.value })} placeholder="Options, comma-separated" className={`${FIELD} mt-1`} aria-label={`Question ${i + 1} options`} />
                  ) : null}
                </div>
                <div>
                  <label htmlFor={`q-type-${i}`} className="sr-only">Type</label>
                  <select id={`q-type-${i}`} value={q.type} onChange={(e) => updateQuestion(i, { type: e.target.value as QuestionType })} className={FIELD}>
                    {QUESTION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-ink-700">
                  <input type="checkbox" checked={q.required} onChange={(e) => updateQuestion(i, { required: e.target.checked })} className="h-4 w-4" />
                  Required
                </label>
                <button type="button" onClick={() => setQuestions((qs) => qs.filter((_, idx) => idx !== i))} aria-label={`Remove question ${i + 1}`} className="self-start rounded-md p-1 text-ink-400 hover:bg-red-50 hover:text-red-700">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
            <button type="button" onClick={addQuestion} disabled={questions.length >= MAX_QUESTIONS} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-surface-300 bg-white px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-surface-50 disabled:opacity-50" data-testid="template-add-question">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add question
            </button>
          </fieldset>

          <div>
            <span id="tpl-weights-label" className="text-sm font-semibold text-ink-900">Rubric weights</span>
            <RubricWeightsSliders weights={weights} onChange={setWeights} labelledBy="tpl-weights-label" id="tpl-weight-sliders" idPrefix="tw" />
          </div>

          <div>
            <label htmlFor="tpl-consent" className={LABEL}>Program consent text</label>
            <p className="mb-2 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-xs text-ink-600" data-testid="template-data-principle">{dataPrincipleSentence}</p>
            <textarea id="tpl-consent" value={consent} onChange={(e) => setConsent(e.target.value)} maxLength={2000} rows={3} className={FIELD} placeholder="e.g. The selection committee reads your evidence to shortlist for the program; nothing is shared with sponsors without your consent." />
            <p className="mt-1 text-xs text-ink-500">Appended under the data-principle sentence on the public form and in the founder invite e-mail.</p>
          </div>

          {error ? (
            <p role="alert" className="rounded-lg border border-line-subtle border-l-4 border-l-bear bg-surface-sunken px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="text-sm text-emerald-700">
              {notice}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(null)} className="inline-flex min-h-11 items-center rounded-xl border border-surface-300 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-surface-50">
              Close
            </button>
            <button type="submit" disabled={busy || !name.trim()} aria-busy={busy} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-navy-elev-1 disabled:opacity-60" data-testid="template-save">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {editing === "new" ? "Create template" : "Save template"}
            </button>
          </div>
        </form>
      ) : (
        <div className="rounded-2xl border border-dashed border-surface-300 bg-white px-6 py-14 text-center text-sm text-ink-500">Pick a template to edit, or create a new one.</div>
      )}
    </div>
  );
}
