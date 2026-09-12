// NDA click-wrap — the pure half (S21-A).
//
// Everything that decides WHETHER an investor link must accept the room's
// NDA before it sees a document lives here, dependency-free, so the token
// page, the PDF route, the accept route and the founder settings all answer
// the question the same way and the colocated suite can pin it.
//
// The rule:
//   - a room asks for an NDA when `data_rooms.nda_required` is true, or the
//     individual link was minted with `nda_required` (0062);
//   - the ask is only honoured when the room owner's plan carries
//     `investor_links.premium` (founder_starter+, migration 0131). A Free
//     room renders without the gate rather than showing a clause the plan
//     does not include — the founder is told this in settings;
//   - a link has accepted when `nda_signed_version` equals the room's
//     current `nda_version`. Bumping the version re-prompts every link.
//
// No `server-only` import and no node built-ins: the client-side gate
// component reads DEFAULT_NDA_TEXT and the disclaimer line too. The clause
// hash and the owner-plan lookup live in ./nda-server.ts.

/**
 * The default clause. Plain English, general in nature, mutual. This is the
 * text an investor sees when the founder has not written their own. It is
 * deliberately short: a click-wrap that nobody reads protects nobody.
 */
export const DEFAULT_NDA_TEXT = [
  "Mutual confidentiality.",
  "",
  "The documents and figures in this data room are shared with you in confidence so that you can evaluate a possible investment. You agree to keep them confidential, to use them only for that evaluation, and not to share them with anyone outside your firm and its professional advisers who need to see them for the same purpose. The founder agrees to treat anything you disclose about your own fund, process or terms the same way.",
  "",
  "This does not cover information that is already public, that you already held, or that you are required by law to disclose. Nothing here obliges either side to proceed with an investment. It applies for two years from the date you accept it.",
].join("\n");

/** Same line the reports carry — the clause is a template, not legal advice. */
export const NDA_NOT_LEGAL_ADVICE =
  "This clause is a general template provided by BlockID.au (Auschain PTY LTD, ACN 659 615 111) and does not constitute legal advice. BlockID.au is not a law firm. Either party should consult a qualified Australian solicitor before relying on it.";

export const NDA_TEXT_MAX_CHARS = 8000;

export interface NdaRoomSettings {
  ndaRequired: boolean;
  ndaText: string | null;
  ndaVersion: number;
}

export interface NdaLinkState {
  ndaRequired: boolean;
  ndaSignedAt: string | null;
  ndaSignedVersion: number | null;
}

export type NdaGateStatus =
  /** Room does not ask, or the plan does not include the gate. */
  | "not_required"
  /** Must accept before documents are listed / served. */
  | "pending"
  /** Accepted the current version. */
  | "accepted";

export interface NdaGate {
  status: NdaGateStatus;
  /** The version the investor must (or did) accept. */
  version: number;
  /** The clause to show, defaulted. */
  text: string;
  /** Why it is pending, for the UI copy. */
  reason: "never" | "stale_version" | null;
}

/** Normalise whatever the DB row had into a version ≥ 1. */
export function normaliseNdaVersion(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/** Founder-edited text or the default; trims and caps. */
export function resolveNdaText(text: string | null | undefined): string {
  const t = typeof text === "string" ? text.trim() : "";
  return (t || DEFAULT_NDA_TEXT).slice(0, NDA_TEXT_MAX_CHARS);
}

/**
 * Does this link have to accept before it sees anything?
 *
 * `entitled` is whether the ROOM OWNER's plan includes investor_links.premium.
 * Passing false collapses the gate to `not_required` regardless of settings —
 * the Free room must never show a clause its plan does not include.
 */
export function ndaGate(
  room: NdaRoomSettings,
  link: NdaLinkState,
  entitled: boolean,
): NdaGate {
  const version = normaliseNdaVersion(room.ndaVersion);
  const text = resolveNdaText(room.ndaText);
  const required = entitled && (room.ndaRequired || link.ndaRequired);
  if (!required) return { status: "not_required", version, text, reason: null };
  const signed = link.ndaSignedVersion;
  if (link.ndaSignedAt && typeof signed === "number" && signed >= version) {
    return { status: "accepted", version, text, reason: null };
  }
  return {
    status: "pending",
    version,
    text,
    reason: link.ndaSignedAt ? "stale_version" : "never",
  };
}

/** True when documents may be listed / served through this link. */
export function ndaAllowsDocuments(gate: Pick<NdaGate, "status">): boolean {
  return gate.status !== "pending";
}

/**
 * Validate an acceptance POST body. Returns the cleaned fields or the reason
 * it was refused — the route maps `error` straight to a 400.
 */
export function parseNdaAcceptBody(body: unknown):
  | { ok: true; token: string; version: number; email: string | null }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Body must be a JSON object" };
  const { token, version, email } = body as Record<string, unknown>;
  if (typeof token !== "string" || token.length < 16 || token.length > 128) {
    return { ok: false, error: "token is required" };
  }
  const v = Number(version);
  if (!Number.isInteger(v) || v < 1) return { ok: false, error: "version must be a positive integer" };
  let cleanEmail: string | null = null;
  if (email !== undefined && email !== null && email !== "") {
    if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: "email is not a valid address" };
    }
    cleanEmail = email.trim().toLowerCase();
  }
  return { ok: true, token, version: v, email: cleanEmail };
}

/**
 * Validate the founder's settings PUT. Every field optional; unknown fields
 * ignored; a text longer than the cap is refused rather than truncated so the
 * founder knows what was saved.
 */
export function parseNdaSettingsBody(body: unknown):
  | {
      ok: true;
      patch: {
        nda_required?: boolean;
        nda_text?: string | null;
        watermark_enabled?: boolean;
      };
      bumpVersion: boolean;
    }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Body must be a JSON object" };
  const b = body as Record<string, unknown>;
  const patch: { nda_required?: boolean; nda_text?: string | null; watermark_enabled?: boolean } = {};
  if (b.ndaRequired !== undefined) {
    if (typeof b.ndaRequired !== "boolean") return { ok: false, error: "ndaRequired must be a boolean" };
    patch.nda_required = b.ndaRequired;
  }
  if (b.watermarkEnabled !== undefined) {
    if (typeof b.watermarkEnabled !== "boolean") return { ok: false, error: "watermarkEnabled must be a boolean" };
    patch.watermark_enabled = b.watermarkEnabled;
  }
  if (b.ndaText !== undefined) {
    if (b.ndaText === null || b.ndaText === "") {
      patch.nda_text = null;
    } else if (typeof b.ndaText !== "string") {
      return { ok: false, error: "ndaText must be a string" };
    } else if (b.ndaText.length > NDA_TEXT_MAX_CHARS) {
      return { ok: false, error: `ndaText must be at most ${NDA_TEXT_MAX_CHARS} characters` };
    } else {
      patch.nda_text = b.ndaText.trim() || null;
    }
  }
  const bumpVersion = b.bumpVersion === true;
  if (Object.keys(patch).length === 0 && !bumpVersion) {
    return { ok: false, error: "Nothing to update" };
  }
  return { ok: true, patch, bumpVersion };
}
