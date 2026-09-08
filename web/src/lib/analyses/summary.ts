// Client-safe presentation helpers for saved /analyze runs.
//
// Deliberately free of `server-only` and of any Supabase import: the same
// functions shape the permalink panel on /analyze, the "Your analyses" list
// in the workspace, and the header of /analyze/[id]. Keeping them pure means
// the three surfaces cannot drift into describing the same run differently.

import { formatAUD } from "@/lib/valuation";

/** One row of GET /api/analyses. */
export interface AnalysisListRow {
  id: string;
  created_at: string;
  input_kind: string | null;
  input_url: string | null;
  input_filename: string | null;
  stage: number | null;
  stage_label: string | null;
  svi_total: number | null;
  valuation_mid_aud: number | null;
  user_id: string | null;
}

/**
 * Canonical path for a saved run.
 *
 * `/analyze/[id]` rather than a new `/a/[id]` namespace: the id is a child of
 * the tool that produced it, so the URL explains itself when a founder pastes
 * it into a chat, and no new top-level route has to be defended forever.
 */
export function savedAnalysisPath(id: string): string {
  return `/analyze/${id}`;
}

/** Absolute permalink, given the page origin (empty during SSR). */
export function savedAnalysisUrl(id: string, origin: string): string {
  const base = (origin || "").replace(/\/$/, "");
  return `${base}${savedAnalysisPath(id)}`;
}

const KIND_LABEL: Record<string, string> = {
  pitch_deck: "Pitch deck",
  website: "Website",
  idea_text: "Written idea",
  existing_company_text: "Company description",
};

/** Plain-English name for the input kind, never the raw enum. */
export function inputKindLabel(kind: string | null | undefined): string {
  if (!kind) return "Analysis";
  return KIND_LABEL[kind] ?? "Analysis";
}

/** Strip scheme and trailing slash so a URL reads as a name, not a link. */
export function tidyUrl(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

/**
 * What was analysed, in one line: the filename for a deck, the host+path for
 * a site, otherwise the kind. Never returns an empty string — a row with no
 * url and no filename still has to be clickable and describable.
 */
export function describeInput(row: {
  input_kind?: string | null;
  input_url?: string | null;
  input_filename?: string | null;
}): string {
  const filename = row.input_filename?.trim();
  if (filename) return filename;
  const url = row.input_url?.trim();
  if (url) return tidyUrl(url);
  return inputKindLabel(row.input_kind);
}

/** Day-precision Australian date: "8 Sep 2026". */
export function formatRunDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Date + time, for the access log where "when" means the exact moment. */
export function formatRunDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Valuation midpoint as a founder-facing string, or an em dash when absent. */
export function formatValuationMid(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "—";
  }
  return formatAUD(value);
}

/** SVI total rounded the way every other surface rounds it. */
export function formatSviTotal(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return String(Math.round(value));
}

/** Stage name for a row, falling back to the numeric stage, then a dash. */
export function stageText(row: {
  stage_label?: string | null;
  stage?: number | null;
}): string {
  const label = row.stage_label?.trim();
  if (label) return label;
  if (typeof row.stage === "number") return `Stage ${row.stage}`;
  return "—";
}

/**
 * The one sentence shown after a signup/login that claimed prior work.
 * Returns null when nothing was claimed — silence beats a congratulatory
 * message about zero things.
 */
export function claimedMessage(count: number): string | null {
  if (!Number.isFinite(count) || count < 1) return null;
  if (count === 1) {
    return "The analysis you ran before signing up is now saved to your account.";
  }
  return `${count} analyses you ran before signing up are now saved to your account.`;
}
