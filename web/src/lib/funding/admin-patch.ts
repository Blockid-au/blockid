// Validator for PATCH /api/admin/funding/[kind]/[id] — the human-review
// edits allowed from /admin/funding (T0239). Pure so the route test and the
// client form share one contract. Anything not listed here is rejected: the
// row's catalogue fields are owned by the seed / refresh cron, not the admin
// form.

import { FUNDING_STATUSES, type FundingStatus } from "./seed-map";

export type FundingKind = "grants" | "programs";

export const KIND_TABLE: Record<FundingKind, "au_grants" | "au_programs"> = {
  grants: "au_grants",
  programs: "au_programs",
};

export function parseFundingKind(raw: string | null | undefined): FundingKind | null {
  const k = (raw ?? "").trim().toLowerCase();
  return k === "grants" || k === "programs" ? k : null;
}

export interface FundingAdminPatch {
  status?: FundingStatus;
  /** Grants: `date` column, ISO YYYY-MM-DD or null. Programs: free text (e.g. "2026-11-08", "Nov 2026"). */
  closes_at?: string | null;
  /** Grants only. */
  next_round_note?: string | null;
  /** Grants only. */
  lodgement_deadline?: string | null;
  /** Programs only. */
  applications_close?: string | null;
  /** Programs only. */
  next_cohort_start?: string | null;
  /** Programs only. */
  applications_open?: string | null;
  status_confidence?: "high" | "medium" | "low";
}

export type FundingAdminPatchResult =
  | { ok: true; update: Record<string, unknown> }
  | { ok: false; error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NOTE = 2000;

function optText(v: unknown, field: string, max = MAX_NOTE): { value: string | null } | { error: string } {
  if (v === null) return { value: null };
  if (typeof v !== "string") return { error: `${field} must be a string or null` };
  const s = v.trim();
  if (s.length > max) return { error: `${field} exceeds ${max} characters` };
  return { value: s.length ? s : null };
}

/**
 * Build the column update for a review edit. Every accepted edit stamps
 * verified_by='human' and last_verified_at=today (UTC) so the refresh cron
 * knows a person looked at the row after the seed.
 */
export function validateFundingAdminPatch(
  kind: FundingKind,
  body: unknown,
  today: Date = new Date(),
): FundingAdminPatchResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;
  const update: Record<string, unknown> = {};
  let touched = 0;

  if ("status" in b) {
    const s = typeof b.status === "string" ? b.status.trim().toLowerCase() : "";
    if (!(FUNDING_STATUSES as readonly string[]).includes(s)) {
      return { ok: false, error: `status must be one of ${FUNDING_STATUSES.join("|")}` };
    }
    update.status = s;
    touched++;
  }

  if ("status_confidence" in b) {
    const c = typeof b.status_confidence === "string" ? b.status_confidence.trim().toLowerCase() : "";
    if (!["high", "medium", "low"].includes(c)) {
      return { ok: false, error: "status_confidence must be high|medium|low" };
    }
    update.status_confidence = c;
    touched++;
  }

  if ("closes_at" in b) {
    const r = optText(b.closes_at, "closes_at", 64);
    if ("error" in r) return { ok: false, error: r.error };
    if (kind === "grants") {
      if (r.value !== null && !ISO_DATE.test(r.value)) {
        return { ok: false, error: "closes_at must be YYYY-MM-DD or null" };
      }
      update.closes_at = r.value;
    } else {
      // Programs keep applications_close as free text; `closes_at` is an alias.
      update.applications_close = r.value;
    }
    touched++;
  }

  const textFields: Array<[keyof FundingAdminPatch, FundingKind]> = [
    ["next_round_note", "grants"],
    ["lodgement_deadline", "grants"],
    ["applications_close", "programs"],
    ["applications_open", "programs"],
    ["next_cohort_start", "programs"],
  ];
  for (const [field, forKind] of textFields) {
    if (!(field in b)) continue;
    if (forKind !== kind) return { ok: false, error: `${field} is not a ${kind} field` };
    const r = optText(b[field], field);
    if ("error" in r) return { ok: false, error: r.error };
    update[field] = r.value;
    touched++;
  }

  const unknown = Object.keys(b).filter(
    (k) =>
      ![
        "status",
        "status_confidence",
        "closes_at",
        "next_round_note",
        "lodgement_deadline",
        "applications_close",
        "applications_open",
        "next_cohort_start",
        "verified",
      ].includes(k),
  );
  if (unknown.length) return { ok: false, error: `unknown field(s): ${unknown.join(", ")}` };

  // `verified: true` alone = "I checked it, nothing changed" — still stamps the row.
  if (touched === 0 && b.verified !== true) {
    return { ok: false, error: "nothing to update" };
  }

  update.verified_by = "human";
  update.last_verified_at = today.toISOString().slice(0, 10);
  return { ok: true, update };
}
