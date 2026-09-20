// templates-shared — client-safe types + pure rules for program intake
// templates (G21 P2-A, migration 0422 `intake_templates`).
//
// A template is a program-owned question set (+ rubric weights + consent
// text) that /apply/<slug> renders when `program_intakes.template_id` is
// set, and that a BlockID Cohort is created with (`evaluation_batches.
// template_id`). No template = today's fixed form (startup name, founder
// name, e-mail, website, deck, consent), so nothing changes for existing
// links. The DB layer is ./templates.ts (server-only); the editor page and
// the public form import from here.

import { equalWeights, normaliseWeights, type RubricWeights } from "@/lib/evaluations/batch-shared";

export const QUESTION_TYPES = ["text", "url", "number", "select", "file"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const MAX_QUESTIONS = 20;
export const MAX_OPTIONS = 12;
export const QUESTION_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
/** The fixed-form fields a template question may not shadow. */
export const RESERVED_QUESTION_KEYS: readonly string[] = Object.freeze(["startup_name", "founder_name", "founder_email", "website", "deck", "consent", "company_website_confirm"]);

export interface TemplateQuestion {
  /** Stable answer key (`intake_submissions.answers[key]`): `^[a-z][a-z0-9_]{0,39}$`. */
  key: string;
  label: string;
  type: QuestionType;
  required: boolean;
  /** `select` only. */
  options?: string[];
}

export interface IntakeTemplate {
  id: string;
  ownerUserId: string;
  name: string;
  description: string | null;
  questions: TemplateQuestion[];
  rubricWeights: RubricWeights;
  consentText: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateInput {
  name?: unknown;
  description?: unknown;
  questions?: unknown;
  rubric_weights?: unknown;
  consent_text?: unknown;
}

export interface NormalisedTemplateInput {
  name: string;
  description: string | null;
  questions: TemplateQuestion[];
  rubricWeights: RubricWeights;
  consentText: string | null;
}

/** `"Team size (FTE)"` → `team_size_fte` — the key the editor proposes for a new question. */
export function keyFromLabel(label: string): string {
  const k = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 40)
    .replace(/_+$/g, "");
  return k || "q";
}

export function normaliseQuestions(raw: unknown): { ok: true; questions: TemplateQuestion[] } | { ok: false; message: string } {
  if (raw == null) return { ok: true, questions: [] };
  if (!Array.isArray(raw)) return { ok: false, message: "questions must be an array" };
  if (raw.length > MAX_QUESTIONS) return { ok: false, message: `A template holds up to ${MAX_QUESTIONS} questions` };
  const out: TemplateQuestion[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i += 1) {
    const q = raw[i] as Record<string, unknown> | null;
    if (!q || typeof q !== "object") return { ok: false, message: `Question ${i + 1} must be an object` };
    const label = typeof q.label === "string" ? q.label.trim().slice(0, 160) : "";
    if (!label) return { ok: false, message: `Question ${i + 1} needs a label` };
    const key = typeof q.key === "string" && q.key.trim() ? q.key.trim().toLowerCase() : keyFromLabel(label);
    if (!QUESTION_KEY_RE.test(key)) return { ok: false, message: `Question ${i + 1}: key "${key}" must match ${QUESTION_KEY_RE}` };
    if (RESERVED_QUESTION_KEYS.includes(key)) return { ok: false, message: `Question ${i + 1}: "${key}" is a fixed form field` };
    if (seen.has(key)) return { ok: false, message: `Question ${i + 1}: duplicate key "${key}"` };
    seen.add(key);
    const type = (QUESTION_TYPES as readonly string[]).includes(String(q.type)) ? (q.type as QuestionType) : "text";
    const required = q.required === true;
    let options: string[] | undefined;
    if (type === "select") {
      const opts = Array.isArray(q.options) ? q.options.map((o) => String(o ?? "").trim()).filter(Boolean) : [];
      if (opts.length === 0) return { ok: false, message: `Question ${i + 1}: a select needs at least one option` };
      if (opts.length > MAX_OPTIONS) return { ok: false, message: `Question ${i + 1}: up to ${MAX_OPTIONS} options` };
      options = Array.from(new Set(opts.map((o) => o.slice(0, 80))));
    }
    out.push({ key, label, type, required, ...(options ? { options } : {}) });
  }
  return { ok: true, questions: out };
}

export function normaliseTemplateInput(raw: TemplateInput): { ok: true; value: NormalisedTemplateInput } | { ok: false; message: string } {
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return { ok: false, message: "Template name is required" };
  if (name.length > 120) return { ok: false, message: "Template name must be under 120 characters" };
  const description = typeof raw.description === "string" && raw.description.trim() ? raw.description.trim().slice(0, 1000) : null;
  const q = normaliseQuestions(raw.questions);
  if (!q.ok) return q;
  const rubricWeights = raw.rubric_weights == null ? equalWeights() : normaliseWeights(raw.rubric_weights);
  const consentText = typeof raw.consent_text === "string" && raw.consent_text.trim() ? raw.consent_text.trim().slice(0, 2000) : null;
  return { ok: true, value: { name, description, questions: q.questions, rubricWeights, consentText } };
}

export type AnswerValue = string | number;

/**
 * Validate the answers a founder gave against the template's questions.
 * Unknown keys are dropped; required questions must be answered; `url`
 * must parse; `number` must be finite; `select` must be one of the options.
 * `file` questions are recorded as the file name the route stored (a string)
 * — the deck upload stays the fixed form's own field.
 */
export function validateAnswers(
  questions: readonly TemplateQuestion[],
  raw: Record<string, unknown> | null | undefined,
): { ok: true; answers: Record<string, AnswerValue> } | { ok: false; field: string; message: string } {
  const src = raw ?? {};
  const answers: Record<string, AnswerValue> = {};
  for (const q of questions) {
    const v = src[q.key];
    const s = v == null ? "" : String(v).trim();
    if (!s) {
      if (q.required) return { ok: false, field: q.key, message: `${q.label} is required` };
      continue;
    }
    if (q.type === "number") {
      const n = Number(s.replace(/[,\s]/g, ""));
      if (!Number.isFinite(n)) return { ok: false, field: q.key, message: `${q.label} must be a number` };
      answers[q.key] = n;
      continue;
    }
    if (q.type === "url") {
      const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
      try {
        const u = new URL(withScheme);
        if (!u.hostname.includes(".")) throw new Error("host");
        answers[q.key] = u.toString().replace(/\/$/, "").slice(0, 2048);
      } catch {
        return { ok: false, field: q.key, message: `${q.label} must be a valid link` };
      }
      continue;
    }
    if (q.type === "select") {
      if (!(q.options ?? []).includes(s)) return { ok: false, field: q.key, message: `${q.label} must be one of the listed options` };
      answers[q.key] = s;
      continue;
    }
    answers[q.key] = s.slice(0, 2000);
  }
  return { ok: true, answers };
}

// ── Row mapping (shared by the store and the tests) ─────────────────────────

type Row = Record<string, unknown>;

export function mapTemplateRow(row: Row): IntakeTemplate {
  const q = normaliseQuestions(row.questions);
  return {
    id: String(row.id),
    ownerUserId: String(row.owner_user_id),
    name: String(row.name ?? ""),
    description: row.description == null ? null : String(row.description),
    questions: q.ok ? q.questions : [],
    rubricWeights: normaliseWeights(row.rubric_weights),
    consentText: row.consent_text == null ? null : String(row.consent_text),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? row.created_at ?? ""),
  };
}
