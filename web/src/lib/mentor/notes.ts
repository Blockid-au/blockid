// Mentor notes — pure lib (no DB, no IO).
//
// Mentor keeps rolling private-by-default markdown notes per mentee. The
// composer autosaves a draft to localStorage under `draftKey(subjectUserId)`;
// the server route validates the body with `validateBody` before persisting.
// `summarize` renders a one-line preview for roster tooltips + digest rows,
// and `diffAudit` shapes the reseller_audit_log payload for every mutation.
//
// Kept dependency-free so unit tests can run without a DB or a browser env.

export type NoteVisibility = "private" | "shared_with_founder";

export interface NoteRecord {
  id: string;
  mentor_user_id: string;
  subject_user_id: string;
  body: string;
  visibility: NoteVisibility;
  created_at: string;
  updated_at: string;
}

export const NOTE_MAX_LEN = 4000;

const DRAFT_KEY_PREFIX = "blockid:mentor-note-draft:";

/**
 * Namespaced localStorage key for the mentor's WIP draft against a mentee.
 * Namespacing avoids collisions across mentees; the composer discloses in
 * a tooltip that the draft is not encrypted and is auto-cleared after 30d.
 */
export function draftKey(subjectUserId: string): string {
  if (typeof subjectUserId !== "string" || subjectUserId.trim().length === 0) {
    return `${DRAFT_KEY_PREFIX}unknown`;
  }
  return `${DRAFT_KEY_PREFIX}${subjectUserId.trim()}`;
}

export type ValidateResult =
  | { ok: true; body: string }
  | { ok: false; reason: "empty" | "too_long" | "invalid_type" };

/**
 * Non-empty, ≤NOTE_MAX_LEN chars, trims trailing whitespace but keeps
 * intentional inner markdown. Rejects non-strings.
 */
export function validateBody(raw: unknown): ValidateResult {
  if (typeof raw !== "string") return { ok: false, reason: "invalid_type" };
  const trimmed = raw.replace(/\s+$/, "");
  if (trimmed.trim().length === 0) return { ok: false, reason: "empty" };
  if (trimmed.length > NOTE_MAX_LEN) return { ok: false, reason: "too_long" };
  return { ok: true, body: trimmed };
}

/**
 * One-line preview for tooltips + digest. Strips leading markdown headers
 * (#, ##…), strips inline formatting markers, collapses whitespace, caps
 * at ~140 chars with an ellipsis when truncated.
 */
export function summarize(body: string, max = 140): string {
  if (typeof body !== "string") return "";
  const firstLine = body.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  const stripped = firstLine
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (stripped.length <= max) return stripped;
  return `${stripped.slice(0, Math.max(0, max - 1))}…`;
}

export interface NoteDiffFields {
  action: "create" | "update" | "delete";
  fields: string[];
  before?: Partial<Pick<NoteRecord, "body" | "visibility">>;
  after?: Partial<Pick<NoteRecord, "body" | "visibility">>;
}

/**
 * Shape a diff payload suitable for reseller_audit_log.metadata. Body content
 * is intentionally NOT echoed back — only a short summary + length delta so
 * the audit trail cannot leak private notes downstream.
 */
export function diffAudit(
  action: NoteDiffFields["action"],
  before: Pick<NoteRecord, "body" | "visibility"> | null,
  after: Pick<NoteRecord, "body" | "visibility"> | null,
): NoteDiffFields {
  const fields: string[] = [];
  if (before?.body !== after?.body) fields.push("body");
  if (before?.visibility !== after?.visibility) fields.push("visibility");
  return {
    action,
    fields,
    before: before
      ? { visibility: before.visibility }
      : undefined,
    after: after
      ? { visibility: after.visibility }
      : undefined,
  };
}
