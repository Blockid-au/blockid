// Investor CRM — the pure half (S28-B).
//
// The founder's raise pipeline the way a CRM (Affinity / Notion / HubSpot)
// keeps it: one contact per investor per project (`investor_contacts`,
// migration 0375) moving through the stages a real conversation goes
// through, and a timeline of touchpoints under each (`investor_touchpoints`,
// 0376). Everything here is dependency-free so the colocated suite can pin
// the validation, the CSV import / export rules, the pipeline roll-up and
// the cursor without a database; the routes under api/investors/crm do the
// I/O.
//
// No `server-only`: the /workspace/investors client imports the labels,
// the stage order and the overdue rule.

export const CONTACT_TYPES = ["angel", "vc", "family_office", "accelerator", "advisor", "other"] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

/** Kanban columns, in pipeline order. `passed` sits after the live stages. */
export const CONTACT_STAGES = ["researching", "contacted", "meeting", "diligence", "committed", "passed", "invested"] as const;
export type ContactStage = (typeof CONTACT_STAGES)[number];

export const TOUCHPOINT_KINDS = ["note", "email", "call", "meeting", "data_room_view", "commitment", "status_change"] as const;
export type TouchpointKind = (typeof TOUCHPOINT_KINDS)[number];

/** Kinds a person can add by hand; the other three are written by the system. */
export const MANUAL_TOUCHPOINT_KINDS: readonly TouchpointKind[] = ["note", "email", "call", "meeting"];

export const CONTACT_TEXT_MAX = 200;
export const CONTACT_NEXT_STEP_MAX = 500;
export const TOUCHPOINT_BODY_MAX = 4_000;
export const MAX_TAGS = 20;
export const TAG_MAX = 40;
export const IMPORT_MAX_ROWS = 500;
export const LIST_DEFAULT_LIMIT = 50;
export const LIST_MAX_LIMIT = 200;

export const TYPE_LABEL: Record<ContactType, string> = {
  angel: "Angel",
  vc: "VC",
  family_office: "Family office",
  accelerator: "Accelerator",
  advisor: "Advisor",
  other: "Other",
};

export const STAGE_LABEL: Record<ContactStage, string> = {
  researching: "Researching",
  contacted: "Contacted",
  meeting: "Meeting",
  diligence: "Diligence",
  committed: "Committed",
  passed: "Passed",
  invested: "Invested",
};

export const TOUCHPOINT_LABEL: Record<TouchpointKind, string> = {
  note: "Note",
  email: "Email",
  call: "Call",
  meeting: "Meeting",
  data_room_view: "Data room view",
  commitment: "Commitment",
  status_change: "Stage change",
};

/** Rank on the ladder — `passed` is a terminal side-exit, ranked below `committed`. */
const STAGE_RANK: Record<ContactStage, number> = {
  researching: 0,
  contacted: 1,
  meeting: 2,
  diligence: 3,
  passed: 3.5,
  committed: 4,
  invested: 5,
};

export function isContactType(v: unknown): v is ContactType {
  return typeof v === "string" && (CONTACT_TYPES as readonly string[]).includes(v);
}

export function isContactStage(v: unknown): v is ContactStage {
  return typeof v === "string" && (CONTACT_STAGES as readonly string[]).includes(v);
}

export function isTouchpointKind(v: unknown): v is TouchpointKind {
  return typeof v === "string" && (TOUCHPOINT_KINDS as readonly string[]).includes(v);
}

export function stageRank(stage: ContactStage): number {
  return STAGE_RANK[stage];
}

/** True when `to` is further down the ladder than `from` (an auto-advance never moves backwards). */
export function isStageAdvance(from: ContactStage, to: ContactStage): boolean {
  return STAGE_RANK[to] > STAGE_RANK[from];
}

// ── Cleaning ─────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}

/**
 * Lower-cased, trimmed address; `null` for empty, `false` for a string that
 * is not an address. The DB CHECK (`email = lower(email)`) relies on every
 * writer going through here.
 */
export function normaliseEmail(v: unknown): string | null | false {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return false;
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if (s.length > 254 || !EMAIL_RE.test(s)) return false;
  return s;
}

/** Tags: trimmed, lower-cased, de-duplicated, capped. Accepts an array or a `;`/`|`-separated string. */
export function cleanTags(v: unknown): string[] {
  const raw: unknown[] = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[;|]/) : [];
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== "string") continue;
    const s = t.replace(/\s+/g, " ").trim().toLowerCase().slice(0, TAG_MAX);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** `YYYY-MM-DD` (a date, no time) or null; `false` when unparseable. */
export function cleanDateOnly(v: unknown): string | null | false {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return false;
  return s;
}

/** ISO timestamp or null; `false` when unparseable or in the far future. */
export function cleanTimestamp(v: unknown, now: Date = new Date()): string | null | false {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return false;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return false;
  if (d.getTime() > now.getTime() + 86_400_000) return false;
  return d.toISOString();
}

// ── Contact input ────────────────────────────────────────────────────────

export interface ContactInput {
  name: string;
  email: string | null;
  org: string | null;
  role: string | null;
  type: ContactType;
  stage: ContactStage;
  source: string | null;
  tags: string[];
  nextStep: string | null;
  nextStepDue: string | null;
  ownerUserId: string | null;
}

export type ContactPatch = Partial<ContactInput> & { archived?: boolean };

/**
 * Validate a POST body (name required, defaults for the rest) or a PATCH
 * body (`partial: true` — only the keys sent are checked and returned).
 * Every failure is a 400 in the route with the message returned here.
 */
export function parseContactInput(
  body: unknown,
  opts: { partial?: boolean } = {},
): { ok: true; value: ContactInput } | { ok: true; value: ContactPatch } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Invalid JSON body" };
  const b = body as Record<string, unknown>;
  const partial = opts.partial === true;
  const out: ContactPatch = {};

  if ("name" in b || !partial) {
    const name = cleanText(b.name, CONTACT_TEXT_MAX);
    if (!name) return { ok: false, error: "name is required" };
    out.name = name;
  }
  if ("email" in b || !partial) {
    const email = normaliseEmail(b.email);
    if (email === false) return { ok: false, error: "email is not a valid email address" };
    out.email = email;
  }
  if ("org" in b || !partial) out.org = cleanText(b.org, CONTACT_TEXT_MAX);
  if ("role" in b || !partial) out.role = cleanText(b.role, CONTACT_TEXT_MAX);
  if ("type" in b) {
    if (!isContactType(b.type)) return { ok: false, error: `type must be one of ${CONTACT_TYPES.join(", ")}` };
    out.type = b.type;
  } else if (!partial) {
    out.type = "other";
  }
  if ("stage" in b) {
    if (!isContactStage(b.stage)) return { ok: false, error: `stage must be one of ${CONTACT_STAGES.join(", ")}` };
    out.stage = b.stage;
  } else if (!partial) {
    out.stage = "researching";
  }
  if ("source" in b || !partial) out.source = cleanText(b.source, CONTACT_TEXT_MAX);
  if ("tags" in b || !partial) out.tags = cleanTags(b.tags);
  if ("nextStep" in b || !partial) out.nextStep = cleanText(b.nextStep, CONTACT_NEXT_STEP_MAX);
  if ("nextStepDue" in b || !partial) {
    const due = cleanDateOnly(b.nextStepDue);
    if (due === false) return { ok: false, error: "nextStepDue must be a YYYY-MM-DD date" };
    out.nextStepDue = due;
  }
  if ("ownerUserId" in b || !partial) {
    const o = b.ownerUserId;
    if (o === null || o === undefined || o === "") out.ownerUserId = null;
    else if (isUuid(o)) out.ownerUserId = o;
    else return { ok: false, error: "ownerUserId must be a uuid" };
  }
  if (partial && "archived" in b) {
    if (typeof b.archived !== "boolean") return { ok: false, error: "archived must be a boolean" };
    out.archived = b.archived;
  }
  if (partial && Object.keys(out).length === 0) return { ok: false, error: "Nothing to update" };
  return { ok: true, value: partial ? out : (out as ContactInput) };
}

// ── Touchpoint input ─────────────────────────────────────────────────────

export interface TouchpointInput {
  kind: TouchpointKind;
  body: string | null;
  occurredAt: string;
}

/** Manual touchpoints only (`note|email|call|meeting`); the system kinds are never accepted from a client. */
export function parseTouchpointInput(body: unknown, now: Date = new Date()): { ok: true; value: TouchpointInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Invalid JSON body" };
  const b = body as Record<string, unknown>;
  const kind = b.kind === undefined ? "note" : b.kind;
  if (!isTouchpointKind(kind) || !MANUAL_TOUCHPOINT_KINDS.includes(kind)) {
    return { ok: false, error: `kind must be one of ${MANUAL_TOUCHPOINT_KINDS.join(", ")}` };
  }
  const text = cleanText(b.body, TOUCHPOINT_BODY_MAX);
  if (!text) return { ok: false, error: "body is required" };
  const occurred = cleanTimestamp(b.occurredAt, now);
  if (occurred === false) return { ok: false, error: "occurredAt must be an ISO timestamp (not in the future)" };
  return { ok: true, value: { kind, body: text, occurredAt: occurred ?? now.toISOString() } };
}

// ── List filters + cursor ────────────────────────────────────────────────

export interface ContactListFilters {
  stage: ContactStage | null;
  type: ContactType | null;
  tag: string | null;
  /** Lower-cased free text matched against name / email / org. */
  search: string | null;
  includeArchived: boolean;
  limit: number;
  cursor: { createdAt: string; id: string } | null;
}

export function parseListFilters(sp: URLSearchParams): { ok: true; value: ContactListFilters } | { ok: false; error: string } {
  const stage = sp.get("stage");
  if (stage && !isContactStage(stage)) return { ok: false, error: "stage filter is not a known stage" };
  const type = sp.get("type");
  if (type && !isContactType(type)) return { ok: false, error: "type filter is not a known type" };
  const tag = cleanTags(sp.get("tag") ?? "")[0] ?? null;
  const search = cleanText(sp.get("q") ?? sp.get("search"), 100)?.toLowerCase() ?? null;
  const rawLimit = Number(sp.get("limit") ?? LIST_DEFAULT_LIMIT);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), LIST_MAX_LIMIT) : LIST_DEFAULT_LIMIT;
  const cursorRaw = sp.get("cursor");
  let cursor: ContactListFilters["cursor"] = null;
  if (cursorRaw) {
    cursor = decodeCursor(cursorRaw);
    if (!cursor) return { ok: false, error: "cursor is invalid" };
  }
  return {
    ok: true,
    value: {
      stage: (stage as ContactStage | null) || null,
      type: (type as ContactType | null) || null,
      tag,
      search,
      includeArchived: sp.get("archived") === "1" || sp.get("archived") === "true",
      limit,
      cursor,
    },
  };
}

/** Keyset cursor on (created_at DESC, id DESC) — opaque to the client (no Buffer: this file is client-safe). */
export function encodeCursor(row: { created_at: string; id: string }): string {
  return encodeURIComponent(`${row.created_at}|${row.id}`).replace(/%/g, "~");
}

/**
 * S28-review: the cursor's timestamp is spliced into a PostgREST `or()`
 * filter (`cursorOrFilter`), so it must be a strict ISO-8601 instant — V8's
 * `new Date()` also accepts legacy forms with parenthesised comments
 * (`Jan 1 2026 (a,b)`) that would carry filter syntax into the query.
 */
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

export function decodeCursor(s: string): { createdAt: string; id: string } | null {
  try {
    const raw = decodeURIComponent(s.replace(/~/g, "%"));
    const i = raw.lastIndexOf("|");
    if (i <= 0) return null;
    const createdAt = raw.slice(0, i);
    const id = raw.slice(i + 1);
    if (!ISO_INSTANT_RE.test(createdAt) || Number.isNaN(new Date(createdAt).getTime()) || !isUuid(id)) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

/** The PostgREST `or()` filter that continues a keyset page. */
export function cursorOrFilter(c: { createdAt: string; id: string }): string {
  return `created_at.lt.${c.createdAt},and(created_at.eq.${c.createdAt},id.lt.${c.id})`;
}

// ── Rows ─────────────────────────────────────────────────────────────────

export interface ContactRow {
  id: string;
  project_id: string;
  name: string;
  email: string | null;
  org: string | null;
  role: string | null;
  type: ContactType;
  stage: ContactStage;
  source: string | null;
  tags: string[];
  last_touch_at: string | null;
  next_step: string | null;
  next_step_due: string | null;
  owner_user_id: string | null;
  created_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TouchpointRow {
  id: string;
  contact_id: string;
  project_id: string;
  kind: TouchpointKind;
  body: string | null;
  occurred_at: string;
  created_by: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

/** A next step is overdue when its due DATE is before today (UTC calendar day) and the contact is still live. */
export function isOverdue(row: Pick<ContactRow, "next_step_due" | "archived_at" | "stage">, now: Date = new Date()): boolean {
  if (!row.next_step_due || row.archived_at) return false;
  if (row.stage === "passed" || row.stage === "invested") return false;
  const today = now.toISOString().slice(0, 10);
  return row.next_step_due < today;
}

// ── CSV import ───────────────────────────────────────────────────────────

/**
 * Spreadsheet formula guard on the way IN: a leading `= + - @` (or tab /
 * CR) is stripped so a cell can never come back out as a formula, even
 * through a client that forgets to guard on export.
 */
export function stripFormulaPrefix(s: string): string {
  return s.replace(/^[=+\-@\t\r]+/, "");
}

/** RFC-4180-ish parser: quoted fields, doubled quotes, CRLF / LF, BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export const IMPORT_COLUMNS = ["name", "email", "org", "type", "stage", "tags"] as const;
/** Header aliases a real export (HubSpot / Affinity / Notion) tends to carry. */
const HEADER_ALIASES: Record<string, (typeof IMPORT_COLUMNS)[number]> = {
  name: "name",
  "full name": "name",
  contact: "name",
  investor: "name",
  email: "email",
  "email address": "email",
  org: "org",
  organisation: "org",
  organization: "org",
  firm: "org",
  fund: "org",
  company: "org",
  type: "type",
  "investor type": "type",
  stage: "stage",
  status: "stage",
  tags: "tags",
  labels: "tags",
};

const TYPE_ALIASES: Record<string, ContactType> = {
  angel: "angel",
  "angel investor": "angel",
  vc: "vc",
  "venture capital": "vc",
  fund: "vc",
  "family office": "family_office",
  family_office: "family_office",
  accelerator: "accelerator",
  incubator: "accelerator",
  advisor: "advisor",
  adviser: "advisor",
  other: "other",
};

const STAGE_ALIASES: Record<string, ContactStage> = {
  researching: "researching",
  research: "researching",
  new: "researching",
  lead: "researching",
  contacted: "contacted",
  outreach: "contacted",
  "intro sent": "contacted",
  meeting: "meeting",
  "first meeting": "meeting",
  pitch: "meeting",
  diligence: "diligence",
  "due diligence": "diligence",
  dd: "diligence",
  committed: "committed",
  "term sheet": "committed",
  passed: "passed",
  pass: "passed",
  declined: "passed",
  lost: "passed",
  invested: "invested",
  closed: "invested",
  won: "invested",
  funded: "invested",
};

export interface ImportRow extends ContactInput {
  /** 1-based line in the file (header excluded from numbering: first data row = 2). */
  line: number;
}

export interface ImportParseResult {
  rows: ImportRow[];
  /** Lines skipped and why — a duplicate inside the file, a bad address, no name. */
  skipped: Array<{ line: number; reason: string }>;
  /** True when the file had more than IMPORT_MAX_ROWS data rows (the rest were ignored). */
  truncated: boolean;
}

/**
 * Parse an investor CSV into contact inputs. Header row required (the
 * `name` column at minimum); unknown columns are ignored; `type` / `stage`
 * accept the usual CRM spellings and fall back to `other` / `researching`.
 * Rows are de-duplicated by email inside the file (first wins); a row with
 * no email is kept as a name-only contact. Cells are formula-guarded.
 */
export function parseContactsCsv(text: string): { ok: true; value: ImportParseResult } | { ok: false; error: string } {
  const table = parseCsv(text);
  if (table.length === 0) return { ok: false, error: "The file is empty" };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const colIndex: Partial<Record<(typeof IMPORT_COLUMNS)[number], number>> = {};
  header.forEach((h, i) => {
    const key = HEADER_ALIASES[h];
    if (key && colIndex[key] === undefined) colIndex[key] = i;
  });
  if (colIndex.name === undefined) return { ok: false, error: "The header row needs a 'name' column (name,email,org,type,stage,tags)" };

  const dataRows = table.slice(1);
  const truncated = dataRows.length > IMPORT_MAX_ROWS;
  const rows: ImportRow[] = [];
  const skipped: ImportParseResult["skipped"] = [];
  const seen = new Set<string>();
  const cell = (r: string[], key: (typeof IMPORT_COLUMNS)[number]): string => {
    const i = colIndex[key];
    if (i === undefined) return "";
    return stripFormulaPrefix((r[i] ?? "").trim());
  };
  dataRows.slice(0, IMPORT_MAX_ROWS).forEach((r, idx) => {
    const line = idx + 2;
    const name = cleanText(cell(r, "name"), CONTACT_TEXT_MAX);
    if (!name) {
      skipped.push({ line, reason: "no name" });
      return;
    }
    const email = normaliseEmail(cell(r, "email"));
    if (email === false) {
      skipped.push({ line, reason: "invalid email" });
      return;
    }
    if (email) {
      if (seen.has(email)) {
        skipped.push({ line, reason: "duplicate email in file" });
        return;
      }
      seen.add(email);
    }
    const typeRaw = cell(r, "type").toLowerCase();
    const stageRaw = cell(r, "stage").toLowerCase();
    rows.push({
      line,
      name,
      email,
      org: cleanText(cell(r, "org"), CONTACT_TEXT_MAX),
      role: null,
      type: TYPE_ALIASES[typeRaw] ?? "other",
      stage: STAGE_ALIASES[stageRaw] ?? "researching",
      source: "csv_import",
      tags: cleanTags(cell(r, "tags")),
      nextStep: null,
      nextStepDue: null,
      ownerUserId: null,
    });
  });
  return { ok: true, value: { rows, skipped, truncated } };
}

/**
 * The update an existing contact gets from a CSV row on re-import: the
 * file wins on name / org / type (when it says something), the stage only
 * moves FORWARD (a spreadsheet must never drag a committed investor back
 * to "researching"), tags are unioned, and an archived contact comes back
 * into the pipeline. Only the keys that change are returned (+ updated_at).
 */
export function mergeImportRow(existing: ContactRow, row: ImportRow, now: string): Record<string, unknown> {
  const update: Record<string, unknown> = { updated_at: now };
  if (row.name && row.name !== existing.name) update.name = row.name;
  if (row.org && row.org !== existing.org) update.org = row.org;
  if (row.type !== "other" && row.type !== existing.type) update.type = row.type;
  if (row.stage !== existing.stage && isStageAdvance(existing.stage, row.stage)) update.stage = row.stage;
  const tags = Array.from(new Set([...(existing.tags ?? []), ...row.tags]));
  if (tags.length !== (existing.tags ?? []).length) update.tags = tags;
  if (existing.archived_at) update.archived_at = null;
  return update;
}

// ── CSV export ───────────────────────────────────────────────────────────

/**
 * RFC-4180 escape + spreadsheet formula guard (same rule as
 * lib/audit/events `csvCellGuarded`): a cell starting with `= + - @` or a
 * tab / CR is prefixed with `'` so Excel / Sheets never evaluate it.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = Array.isArray(value) ? value.join(";") : typeof value === "string" ? value : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const EXPORT_COLUMNS = [
  "name",
  "email",
  "org",
  "role",
  "type",
  "stage",
  "source",
  "tags",
  "next_step",
  "next_step_due",
  "last_touch_at",
  "created_at",
  "archived_at",
] as const;

export function contactsToCsv(rows: readonly ContactRow[]): string {
  const lines = [EXPORT_COLUMNS.join(",")];
  for (const r of rows) {
    lines.push(EXPORT_COLUMNS.map((c) => csvCell(r[c])).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

// ── Pipeline summary ─────────────────────────────────────────────────────

export interface CommitmentLike {
  investor_email: string | null;
  amount_aud: number | string | null;
  status: string;
}

export interface PipelineSummary {
  total: number;
  byStage: Record<ContactStage, number>;
  overdue: number;
  dueThisWeek: number;
  /** committed + signed on cheques whose email matches a live contact */
  committedAud: number;
  /** funded on the same */
  fundedAud: number;
  /** contacts with at least one matching cheque */
  contactsWithCommitments: number;
  /** per contact id → { committedAud, fundedAud } for the kanban cards */
  byContact: Record<string, { committedAud: number; fundedAud: number }>;
}

function num(v: number | string | null | undefined): number {
  const n = typeof v === "number" ? v : v == null ? 0 : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Counts by stage over the live (non-archived) contacts, the overdue /
 * due-this-week next steps, and the A$ on cheques (`fundraise_commitments`)
 * whose `investor_email` matches a contact — matched in memory, lower-cased.
 */
export function summarisePipeline(contacts: readonly ContactRow[], commitments: readonly CommitmentLike[], now: Date = new Date()): PipelineSummary {
  const byStage = Object.fromEntries(CONTACT_STAGES.map((s) => [s, 0])) as Record<ContactStage, number>;
  const live = contacts.filter((c) => !c.archived_at);
  const today = now.toISOString().slice(0, 10);
  const weekOut = new Date(now.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
  let overdue = 0;
  let dueThisWeek = 0;
  const byEmail = new Map<string, string>();
  for (const c of live) {
    if (isContactStage(c.stage)) byStage[c.stage]++;
    if (isOverdue(c, now)) overdue++;
    else if (c.next_step_due && c.next_step_due >= today && c.next_step_due <= weekOut && c.stage !== "passed" && c.stage !== "invested") dueThisWeek++;
    if (c.email) byEmail.set(c.email, c.id);
  }
  const byContact: PipelineSummary["byContact"] = {};
  let committed = 0;
  let funded = 0;
  for (const k of commitments) {
    const email = k.investor_email?.trim().toLowerCase();
    if (!email) continue;
    const id = byEmail.get(email);
    if (!id) continue;
    const amt = num(k.amount_aud);
    const slot = (byContact[id] ??= { committedAud: 0, fundedAud: 0 });
    if (k.status === "committed" || k.status === "signed") {
      slot.committedAud = round2(slot.committedAud + amt);
      committed += amt;
    } else if (k.status === "funded") {
      slot.fundedAud = round2(slot.fundedAud + amt);
      funded += amt;
    }
  }
  return {
    total: live.length,
    byStage,
    overdue,
    dueThisWeek,
    committedAud: round2(committed),
    fundedAud: round2(funded),
    contactsWithCommitments: Object.keys(byContact).length,
    byContact,
  };
}

const AUD = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
export function formatAud(n: number): string {
  return AUD.format(Number.isFinite(n) ? n : 0);
}
