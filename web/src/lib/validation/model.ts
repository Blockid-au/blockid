// G22-D — the validation tracker's pure model: the five advisor-plan
// validation levels (docs/plans/g21-fi-upgrade-2026-09-20.md § 4 + the FI
// targets), the founder-edited entry schema, ledger merge helpers, the
// ladder counts, the "next objection to answer" grouping, the auto-row
// derivation from platform data (fed by lib/validation/auto.ts with real
// rows, by the tests with fakes) and the 14-question validation script.
//
// Nothing in here touches the filesystem or a database; lib/validation/ledger.ts
// owns the file and lib/validation/auto.ts owns the reads. Copy rule: every
// number on the page is a TARGET or an ACTUAL count of recorded events —
// never a claim about the business.

import { z } from "zod";

// ── Levels ──────────────────────────────────────────────────────────────────

export type ValidationLevel = 1 | 2 | 3 | 4 | 5;
export const VALIDATION_LEVEL_VALUES: readonly ValidationLevel[] = [1, 2, 3, 4, 5];

export interface ValidationLevelMeta {
  level: ValidationLevel;
  key: "interviews" | "demos" | "proposals" | "paid_pilot" | "renewal";
  label: string;
  /** What one counted entry means — the bar a row must clear before `outcome: done`. */
  counts_when: string;
  target: number;
}

/** The advisor plan's ladder (L1 → L5), targets as written. */
export const VALIDATION_LEVELS: readonly ValidationLevelMeta[] = Object.freeze([
  { level: 1, key: "interviews", label: "Qualified interviews", counts_when: "a 30–45 min conversation with someone who screens startups and owns or influences the budget, notes captured", target: 5 },
  { level: 2, key: "demos", label: "Real workflow demonstrations", counts_when: "the buyer ran a real intake, cohort or dossier workflow on their own applicants (not a slide walkthrough)", target: 3 },
  { level: 3, key: "proposals", label: "Written pilot proposals", counts_when: "a written pilot proposal with scope, price and dates was sent to a named organisation", target: 2 },
  { level: 4, key: "paid_pilot", label: "Paid pilot ≥ A$1,500", counts_when: "a paid Cohort Validation Pilot order of at least A$1,500 (auto-filled from pilot_orders)", target: 1 },
  { level: 5, key: "renewal", label: "Renewal or second institutional customer", counts_when: "the same organisation paid again, or a second organisation paid (auto-filled from pilot_orders)", target: 1 },
]);

export function levelMeta(level: ValidationLevel): ValidationLevelMeta {
  return VALIDATION_LEVELS[level - 1]!;
}

// ── Entries (founder-edited) ────────────────────────────────────────────────

export const VALIDATION_OUTCOMES = ["booked", "done", "declined"] as const;
export type ValidationOutcome = (typeof VALIDATION_OUTCOMES)[number];

export const ENTRY_LIMITS = Object.freeze({ organisation: 160, contact_role: 120, objection: 500, next_step: 300, note: 2_000 });
export const LEDGER_MAX_ENTRIES = 2_000;

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
/** ISO-8601 timestamp (`toISOString()` shape) — `proposal_generated_at` is stamped by the proposal route, never typed. */
const ISO_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** What the founder submits (POST) or patches — every field validated, unknown keys rejected. */
export const validationEntryInputSchema = z
  .object({
    organisation: z.string().trim().min(1).max(ENTRY_LIMITS.organisation),
    contact_role: z.string().trim().max(ENTRY_LIMITS.contact_role).default(""),
    date: z.string().trim().regex(DATE_RE, "date must be YYYY-MM-DD"),
    level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    outcome: z.enum(VALIDATION_OUTCOMES),
    objection: z.string().trim().max(ENTRY_LIMITS.objection).default(""),
    objection_answered: z.boolean().default(false),
    next_step: z.string().trim().max(ENTRY_LIMITS.next_step).default(""),
    note: z.string().trim().max(ENTRY_LIMITS.note).default(""),
    // G23-B: when the pilot proposal PDF was last generated for this entry
    // (GET /api/admin/validation/[id]/proposal). Optional so older rows and
    // founder-typed bodies stay valid; null clears it.
    proposal_generated_at: z.string().regex(ISO_TS_RE, "proposal_generated_at must be an ISO timestamp").nullable().optional(),
  })
  .strict();

export type ValidationEntryInput = z.infer<typeof validationEntryInputSchema>;

/** PATCH body: any subset of the input fields (still strict; no defaults, so an absent key stays absent). */
export const validationEntryPatchSchema = z
  .object({
    organisation: z.string().trim().min(1).max(ENTRY_LIMITS.organisation).optional(),
    contact_role: z.string().trim().max(ENTRY_LIMITS.contact_role).optional(),
    date: z.string().trim().regex(DATE_RE, "date must be YYYY-MM-DD").optional(),
    level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
    outcome: z.enum(VALIDATION_OUTCOMES).optional(),
    objection: z.string().trim().max(ENTRY_LIMITS.objection).optional(),
    objection_answered: z.boolean().optional(),
    next_step: z.string().trim().max(ENTRY_LIMITS.next_step).optional(),
    note: z.string().trim().max(ENTRY_LIMITS.note).optional(),
    proposal_generated_at: z.string().regex(ISO_TS_RE, "proposal_generated_at must be an ISO timestamp").nullable().optional(),
  })
  .strict();
export type ValidationEntryPatch = z.infer<typeof validationEntryPatchSchema>;

export interface ValidationEntry extends ValidationEntryInput {
  id: string;
  created_at: string;
  updated_at: string;
}

export const LEDGER_VERSION = 1 as const;

export interface ValidationLedger {
  version: typeof LEDGER_VERSION;
  updated_at: string | null;
  entries: ValidationEntry[];
}

export const EMPTY_VALIDATION_LEDGER: ValidationLedger = Object.freeze({ version: LEDGER_VERSION, updated_at: null, entries: [] }) as ValidationLedger;

export type ParsedEntry<T> = { ok: true; value: T } | { ok: false; message: string; issues: Array<{ path: string; message: string }> };

function formatIssues(r: { error: z.ZodError }): { message: string; issues: Array<{ path: string; message: string }> } {
  const issues = r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  return { message: issues[0] ? `${issues[0].path || "body"}: ${issues[0].message}` : "Invalid entry", issues };
}

export function parseEntryInput(raw: unknown): ParsedEntry<ValidationEntryInput> {
  const r = validationEntryInputSchema.safeParse(raw);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, ...formatIssues(r) };
}

export function parseEntryPatch(raw: unknown): ParsedEntry<ValidationEntryPatch> {
  const r = validationEntryPatchSchema.safeParse(raw);
  if (!r.success) return { ok: false, ...formatIssues(r) };
  if (Object.keys(r.data).length === 0) return { ok: false, message: "body: at least one field to change", issues: [{ path: "body", message: "at least one field to change" }] };
  return { ok: true, value: r.data };
}

/** True when `v` has the shape of a stored entry (a corrupt row is dropped, never a crash). */
export function isValidationEntry(v: unknown): v is ValidationEntry {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.created_at !== "string" || typeof r.updated_at !== "string") return false;
  const { id: _id, created_at: _c, updated_at: _u, ...rest } = r;
  void _id;
  void _c;
  void _u;
  return validationEntryInputSchema.safeParse(rest).success;
}

/** Parse a ledger file body; missing / corrupt → the empty ledger, bad rows dropped. */
export function parseLedger(raw: string): ValidationLedger {
  let parsed: Partial<ValidationLedger>;
  try {
    parsed = JSON.parse(raw) as Partial<ValidationLedger>;
  } catch {
    return { ...EMPTY_VALIDATION_LEDGER, entries: [] };
  }
  const entries = Array.isArray(parsed?.entries) ? parsed.entries.filter(isValidationEntry) : [];
  return { version: LEDGER_VERSION, updated_at: typeof parsed?.updated_at === "string" ? parsed.updated_at : null, entries };
}

export function newEntry(input: ValidationEntryInput, id: string, now: Date = new Date()): ValidationEntry {
  const ts = now.toISOString();
  return { id, ...input, created_at: ts, updated_at: ts };
}

/** Insert or replace by id; newest date first, ties by created_at. Pure. */
export function upsertEntry(ledger: ValidationLedger, entry: ValidationEntry): ValidationLedger {
  const idx = ledger.entries.findIndex((e) => e.id === entry.id);
  const entries = idx === -1 ? [...ledger.entries, entry] : ledger.entries.map((e, i) => (i === idx ? entry : e));
  return { ...ledger, entries: sortEntries(entries) };
}

export function applyPatch(entry: ValidationEntry, patch: ValidationEntryPatch, now: Date = new Date()): ValidationEntry {
  return { ...entry, ...patch, id: entry.id, created_at: entry.created_at, updated_at: now.toISOString() };
}

export function removeEntry(ledger: ValidationLedger, id: string): { ledger: ValidationLedger; removed: ValidationEntry | null } {
  const removed = ledger.entries.find((e) => e.id === id) ?? null;
  if (!removed) return { ledger, removed: null };
  return { ledger: { ...ledger, entries: ledger.entries.filter((e) => e.id !== id) }, removed };
}

export function sortEntries(entries: readonly ValidationEntry[]): ValidationEntry[] {
  return [...entries].sort((a, b) => (a.date === b.date ? Date.parse(b.created_at) - Date.parse(a.created_at) : a.date < b.date ? 1 : -1));
}

// ── Auto rows (read-only, source-labelled) ──────────────────────────────────

export type AutoRowSource = "pilot_orders" | "pilot_orders.metrics" | "pilot-applications.jsonl" | "founder_feedback_letters" | "evaluation_batches";

export interface AutoRow {
  /** Stable id (`<source>:<row id>`) so the table can key on it. */
  id: string;
  source: AutoRowSource;
  level: ValidationLevel;
  /** `true` when the row is an actual for its level (paid pilot → L4, renewal / second buyer → L5); signals never count. */
  counts: boolean;
  date: string;
  /** Organisation / programme label — never a full e-mail address. */
  organisation: string;
  detail: string;
}

/** The minimum each auto source needs — the DB reader maps real rows onto these; tests pass literals. */
export interface AutoInputs {
  pilotOrders: ReadonlyArray<{ id: string; user_id: string; buyer_email: string; sku: string; amount_cents: number; currency: string; status: string; created_at: string; metrics: Record<string, unknown> | null; converted_at?: string | null; converted_plan?: string | null }>;
  applications: ReadonlyArray<{ id: string; program_name: string; cohort_size: number; intake_month: string; received_at: string }>;
  feedbackLetters: ReadonlyArray<{ id: string; project_id: string; status: string; sent_at: string | null; org_count: number; k: number }>;
  batches: ReadonlyArray<{
    id: string;
    name: string | null;
    program_name?: string | null;
    status: string;
    total: number;
    done_count: number;
    finished_at: string | null;
    created_at: string;
    owner_email?: string | null;
    /** G24-C (0436): the fictional demo cohort — never a "Cohort scored" row. */
    is_demo?: boolean;
    /** G24-C: the creator is an admin / the operator account (a demo run by ourselves is not buyer evidence). */
    owner_is_admin?: boolean;
  }>;
}

export const PAID_PILOT_MIN_CENTS = 150_000;

/** `a***@domain` — the same masking rule as the pilots ledger. */
function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  if (!domain) return "***";
  return `${user.slice(0, 1)}***@${domain}`;
}

function orgFromEmail(email: string): string {
  const domain = email.split("@")[1];
  return domain ? domain.toLowerCase() : maskEmail(email);
}

function day(iso: string | null | undefined): string {
  return typeof iso === "string" && iso.length >= 10 ? iso.slice(0, 10) : "";
}

function isQaEmail(email: string | null | undefined): boolean {
  return /^qa-live-/i.test(email ?? "");
}

const METRIC_INTERNAL_KEYS = new Set(["updated_at", "updated_by"]);

function metricsCaptured(m: Record<string, unknown> | null | undefined): number {
  if (!m || typeof m !== "object") return 0;
  return Object.entries(m).filter(([k, v]) => !METRIC_INTERNAL_KEYS.has(k) && v !== null && v !== undefined && v !== "").length;
}

/**
 * Derive the read-only rows. Pure and deterministic:
 *   • L4: every `paid` pilot order ≥ A$1,500 (first order per buyer);
 *   • L5: a later paid order by the same buyer (renewal) or a paid order by a
 *     second distinct buyer (second institutional customer), and — G23-B — a
 *     pilot that converted to an annual Cohort plan (`converted_at` set by
 *     the webhook, migration 0434): the same organisation paid again;
 *   • signals (never counted): metrics captured on an order, comp
 *     applications from /pilot, feedback letters sent, cohorts scored.
 * QA accounts (qa-live-*) are dropped from every source.
 */
export function deriveAutoRows(input: AutoInputs): AutoRow[] {
  const rows: AutoRow[] = [];

  const paid = input.pilotOrders
    .filter((o) => o.status === "paid" && !isQaEmail(o.buyer_email))
    .slice()
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const seenBuyers = new Set<string>();
  for (const o of paid) {
    const buyer = o.user_id || o.buyer_email.toLowerCase();
    const aud = `${o.currency.toUpperCase() === "AUD" ? "A$" : `${o.currency.toUpperCase()} `}${(o.amount_cents / 100).toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;
    const qualifies = o.amount_cents >= PAID_PILOT_MIN_CENTS;
    const repeat = seenBuyers.has(buyer);
    const secondOrg = !repeat && seenBuyers.size >= 1;
    seenBuyers.add(buyer);
    if (repeat || secondOrg) {
      rows.push({ id: `pilot_orders:${o.id}:l5`, source: "pilot_orders", level: 5, counts: qualifies, date: day(o.created_at), organisation: orgFromEmail(o.buyer_email), detail: `${repeat ? "Renewal — same buyer paid again" : "Second organisation paid"} · ${o.sku} · ${aud}${qualifies ? "" : " (below A$1,500 — not counted)"}` });
    } else {
      rows.push({ id: `pilot_orders:${o.id}`, source: "pilot_orders", level: 4, counts: qualifies, date: day(o.created_at), organisation: orgFromEmail(o.buyer_email), detail: `Paid pilot · ${o.sku} · ${aud}${qualifies ? "" : " (below A$1,500 — not counted)"}` });
    }
    if (o.converted_at) {
      const plan = o.converted_plan === "accelerator_growth" ? "Cohort 100" : o.converted_plan === "accelerator_starter" ? "Cohort 25" : (o.converted_plan ?? "Cohort plan");
      rows.push({ id: `pilot_orders:${o.id}:converted`, source: "pilot_orders", level: 5, counts: qualifies, date: day(o.converted_at), organisation: orgFromEmail(o.buyer_email), detail: `Pilot converted to ${plan} (annual) — same organisation paid again${qualifies ? "" : " (pilot below A$1,500 — not counted)"}` });
    }
    const captured = metricsCaptured(o.metrics);
    if (captured > 0) {
      rows.push({ id: `pilot_orders.metrics:${o.id}`, source: "pilot_orders.metrics", level: 4, counts: false, date: day(typeof o.metrics?.updated_at === "string" ? (o.metrics.updated_at as string) : o.created_at), organisation: orgFromEmail(o.buyer_email), detail: `Pilot metrics captured · ${captured} field${captured === 1 ? "" : "s"}${o.metrics?.case_study_consent === true ? " · case-study consent given" : ""}` });
    }
  }

  for (const a of input.applications) {
    rows.push({ id: `pilot-applications.jsonl:${a.id}`, source: "pilot-applications.jsonl", level: 1, counts: false, date: day(a.received_at), organisation: a.program_name, detail: `Comp pilot application · cohort ${a.cohort_size} · intake ${a.intake_month}` });
  }

  for (const l of input.feedbackLetters) {
    if (l.status !== "sent" && l.status !== "opened") continue;
    rows.push({ id: `founder_feedback_letters:${l.id}`, source: "founder_feedback_letters", level: 2, counts: false, date: day(l.sent_at), organisation: `project ${l.project_id.slice(0, 8)}`, detail: `Feedback letter ${l.status} · k = ${l.k} · ${l.org_count} organisation${l.org_count === 1 ? "" : "s"}` });
  }

  for (const b of input.batches) {
    if (isQaEmail(b.owner_email)) continue;
    // G24-C: a demo cohort is fictional data — it is never "Cohort scored"
    // evidence. Loaded by an EXTERNAL (non-admin) seat it is a Level-2
    // "workflow demo run" signal (the buyer ran the workflow themselves);
    // loaded by us it is nothing.
    if (b.is_demo) {
      if (b.owner_is_admin) continue;
      rows.push({ id: `evaluation_batches:${b.id}:demo`, source: "evaluation_batches", level: 2, counts: false, date: day(b.created_at), organisation: (b.owner_email ? orgFromEmail(b.owner_email) : null) || b.program_name || b.name || `cohort ${b.id.slice(0, 8)}`, detail: `Workflow demo run · demo cohort loaded by an external seat (${b.total} fictional startups) — not a scored cohort` });
      continue;
    }
    if (b.done_count <= 0) continue;
    rows.push({ id: `evaluation_batches:${b.id}`, source: "evaluation_batches", level: 2, counts: false, date: day(b.finished_at ?? b.created_at), organisation: b.program_name || b.name || `cohort ${b.id.slice(0, 8)}`, detail: `Cohort scored · ${b.done_count} of ${b.total} startups · ${b.status}` });
  }

  return rows.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? 1 : -1));
}

// ── Ladder + objections ─────────────────────────────────────────────────────

export interface LadderRung extends ValidationLevelMeta {
  /** Founder entries with `outcome: done` + counted auto rows. */
  actual: number;
  manual_done: number;
  auto_counted: number;
  booked: number;
  declined: number;
  /** min(actual / target, 1). */
  progress: number;
}

export function computeLadder(entries: readonly ValidationEntry[], auto: readonly AutoRow[]): LadderRung[] {
  return VALIDATION_LEVELS.map((meta) => {
    const mine = entries.filter((e) => e.level === meta.level);
    const manualDone = mine.filter((e) => e.outcome === "done").length;
    const autoCounted = auto.filter((r) => r.level === meta.level && r.counts).length;
    const actual = manualDone + autoCounted;
    return {
      ...meta,
      actual,
      manual_done: manualDone,
      auto_counted: autoCounted,
      booked: mine.filter((e) => e.outcome === "booked").length,
      declined: mine.filter((e) => e.outcome === "declined").length,
      progress: meta.target > 0 ? Math.min(actual / meta.target, 1) : 0,
    };
  });
}

export interface ObjectionGroup {
  /** Normalised key (lower-case, single-spaced). */
  key: string;
  /** The most recent wording. */
  text: string;
  count: number;
  organisations: string[];
  levels: ValidationLevel[];
  last_date: string;
}

export function normaliseObjection(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!?]+$/, "");
}

/** Open objections (captured, not yet answered) grouped by wording, most frequent first. */
export function openObjections(entries: readonly ValidationEntry[]): ObjectionGroup[] {
  const groups = new Map<string, ObjectionGroup>();
  for (const e of sortEntries(entries)) {
    const key = normaliseObjection(e.objection);
    if (!key || e.objection_answered) continue;
    const g = groups.get(key);
    if (g) {
      g.count += 1;
      if (!g.organisations.includes(e.organisation)) g.organisations.push(e.organisation);
      if (!g.levels.includes(e.level)) g.levels.push(e.level);
    } else {
      groups.set(key, { key, text: e.objection.trim(), count: 1, organisations: [e.organisation], levels: [e.level], last_date: e.date });
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || (a.last_date < b.last_date ? 1 : a.last_date > b.last_date ? -1 : 0));
}

// ── The 14-question validation script ───────────────────────────────────────

export interface ScriptQuestion {
  n: number;
  text: string;
  /** What a useful answer contains — the founder ticks the box only when it was captured. */
  listen_for: string;
}

/**
 * The advisor plan's validation script (walk me through your intake … "Will
 * you pay for the next cohort now?"). Asked in order; a question counts as
 * answered when the note carries the "listen for" element.
 */
export const VALIDATION_SCRIPT: readonly ScriptQuestion[] = Object.freeze([
  // The advisor plan's script verbatim (docs/plans/g21-fi-upgrade-2026-09-20.md source § 28).
  { n: 1, text: "Walk me through your current intake process.", listen_for: "steps, people, tools, where the first cut happens" },
  { n: 2, text: "How many startups do you assess per year?", listen_for: "a volume — the repeat-intake wedge" },
  { n: 3, text: "Who reviews them?", listen_for: "reviewer count, committee, sponsor or LP sign-off" },
  { n: 4, text: "How many minutes/hours per startup?", listen_for: "a minutes-per-startup number" },
  { n: 5, text: "What information is hardest to trust?", listen_for: "the claims they cannot verify today" },
  { n: 6, text: "How do reviewers compare applicants?", listen_for: "a rubric, a spreadsheet, gut feel" },
  { n: 7, text: "How do you give rejected founders feedback?", listen_for: "nothing / a template / a call" },
  { n: 8, text: "How do you show sponsors program impact?", listen_for: "the report, its cadence, who chases" },
  { n: 9, text: "Which tools are you paying for today?", listen_for: "tools, subscriptions, contractors" },
  { n: 10, text: "What does the review process cost?", listen_for: "a spend figure or an honest 'nothing'" },
  { n: 11, text: "If BlockID reduced first-pass assessment time by X%, what would that be worth?", listen_for: "a number, not 'interesting'" },
  { n: 12, text: "Would you pay A$1,500 to use it on the next cohort?", listen_for: "yes / no / a condition" },
  { n: 13, text: "What would prevent you paying today?", listen_for: "the objection, in their words — capture it verbatim" },
  // The most important question.
  { n: 14, text: "Will you pay for the next cohort now?", listen_for: "record the answer exactly" },
]);

// ── Dashboard payload ───────────────────────────────────────────────────────

export interface NorthStarLine {
  month: string;
  assessed: number;
  assessed_all: number;
  paying_batches: number;
  paying_orgs: number;
  partial: string | null;
}

export interface WindowMetric {
  key: string;
  label: string;
  value: number | null;
  unit: "count" | "aud_cents" | "ratio";
}

export interface ValidationDashboard {
  ledger: ValidationLedger;
  ladder: LadderRung[];
  objections: ObjectionGroup[];
  auto: AutoRow[];
  north_star: NorthStarLine | null;
  /** Live metrics from the institutional funnel's window (28 d today). */
  window: { days: number; from: string; to: string; metrics: WindowMetric[] } | null;
  warnings: string[];
}

export function buildDashboard(ledger: ValidationLedger, auto: AutoRow[], extras: Pick<ValidationDashboard, "north_star" | "window" | "warnings">): ValidationDashboard {
  return { ledger, ladder: computeLadder(ledger.entries, auto), objections: openObjections(ledger.entries), auto, ...extras };
}
