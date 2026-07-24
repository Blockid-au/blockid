// P10-rofr-workflow-ui — form-state helpers for the /compliance/s708 wizard
// that runs a founder-supplied cap table + proposed transfer through the pure
// assessRofrWorkflow calculator.
//
// The pure workflow lib lives at web/src/lib/compliance/rofr-workflow.ts and
// takes strongly-typed arrays. This module owns the string-shaped UI state so
// <input> / <textarea> values round-trip cleanly, plus tolerant CSV parsers
// that silently drop malformed rows so a naïve spreadsheet paste is safe.

import type {
  CapTableHolder,
  RofrExercise,
  RofrStatus,
  RofrWaiver,
  RofrWorkflowInput,
} from "@/lib/compliance/rofr-workflow";

export interface RofrWizardFormState {
  cap_table_csv: string;
  waivers_csv: string;
  exercises_csv: string;
  seller_id: string;
  buyer_name: string;
  share_count: string;
  price_per_share_aud: string;
  notice_date_iso: string;
  original_issue_date_iso: string;
  notice_period_days: string;
  is_related_body_corporate_transfer: boolean;
}

export function makeEmptyRofrWizardFormState(): RofrWizardFormState {
  return {
    cap_table_csv: "",
    waivers_csv: "",
    exercises_csv: "",
    seller_id: "",
    buyer_name: "",
    share_count: "",
    price_per_share_aud: "",
    notice_date_iso: "",
    original_issue_date_iso: "",
    notice_period_days: "",
    is_related_body_corporate_transfer: false,
  };
}

function splitRows(raw: string): string[][] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => line.split(/[,\t]/).map((c) => c.trim()));
}

function parseBoolCell(raw: string | undefined): boolean {
  if (!raw) return false;
  const v = raw.toLowerCase();
  return v === "y" || v === "yes" || v === "true" || v === "1" || v === "founder";
}

/**
 * Parse a two-to-four column CSV (or TSV) of cap-table holders.
 * Expected columns: `holder_id, name?, held_shares, is_founder?`.
 * Rows without a holder_id or a positive share count are silently dropped.
 * A blank `name` cell resolves to `undefined` so the workflow tile can fall
 * back to the holder_id label.
 */
export function parseCapTableCsv(raw: string): CapTableHolder[] {
  const out: CapTableHolder[] = [];
  for (const cells of splitRows(raw)) {
    if (cells.length === 0) continue;
    const holder_id = cells[0];
    if (!holder_id) continue;
    let name: string | undefined;
    let sharesRaw: string | undefined;
    let founderRaw: string | undefined;
    if (cells.length >= 4) {
      name = cells[1] || undefined;
      sharesRaw = cells[2];
      founderRaw = cells[3];
    } else if (cells.length === 3) {
      // Ambiguity: 3 columns can be (id, name, shares) or (id, shares, is_founder).
      // Disambiguate by whether the middle cell parses as a positive number.
      const midNum = Number.parseFloat(cells[1]);
      if (Number.isFinite(midNum) && midNum > 0) {
        sharesRaw = cells[1];
        founderRaw = cells[2];
      } else {
        name = cells[1] || undefined;
        sharesRaw = cells[2];
      }
    } else if (cells.length === 2) {
      sharesRaw = cells[1];
    } else {
      continue;
    }
    const shares = Number.parseFloat(sharesRaw ?? "");
    if (!Number.isFinite(shares) || shares <= 0) continue;
    out.push({
      holder_id,
      name,
      held_shares: shares,
      is_founder: parseBoolCell(founderRaw),
    });
  }
  return out;
}

/** Parse a `holder_id, waived_at_iso` CSV. Missing / malformed dates default
 *  to today so a founder can record an undated waiver without hunting for it. */
export function parseWaiversCsv(raw: string): RofrWaiver[] {
  const today = new Date().toISOString().slice(0, 10);
  const out: RofrWaiver[] = [];
  for (const cells of splitRows(raw)) {
    const holder_id = cells[0];
    if (!holder_id) continue;
    const dateCell = cells[1];
    const waived_at_iso =
      dateCell && /^\d{4}-\d{2}-\d{2}$/.test(dateCell) ? dateCell : today;
    out.push({ holder_id, waived_at_iso });
  }
  return out;
}

/** Parse a `holder_id, exercised_at_iso, shares_taken` CSV. Rows without a
 *  positive share count are silently dropped. */
export function parseExercisesCsv(raw: string): RofrExercise[] {
  const today = new Date().toISOString().slice(0, 10);
  const out: RofrExercise[] = [];
  for (const cells of splitRows(raw)) {
    const holder_id = cells[0];
    if (!holder_id) continue;
    let dateCell: string | undefined;
    let sharesCell: string | undefined;
    if (cells.length >= 3) {
      dateCell = cells[1];
      sharesCell = cells[2];
    } else if (cells.length === 2) {
      sharesCell = cells[1];
    } else {
      continue;
    }
    const shares = Number.parseFloat(sharesCell ?? "");
    if (!Number.isFinite(shares) || shares <= 0) continue;
    const exercised_at_iso =
      dateCell && /^\d{4}-\d{2}-\d{2}$/.test(dateCell) ? dateCell : today;
    out.push({ holder_id, exercised_at_iso, shares_taken: shares });
  }
  return out;
}

function optionalNumber(raw: string): number | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : undefined;
}

function requiredNumber(raw: string): number {
  return optionalNumber(raw) ?? 0;
}

/**
 * Convert form state → RofrWorkflowInput. The proposed_transfer block is
 * always populated (the pure helper accepts empty strings / zero counts and
 * classifies them as `pending_notice`); optional fields collapse to `undefined`
 * so the checker's branch matrix fires cleanly.
 */
export function toRofrInput(state: RofrWizardFormState): RofrWorkflowInput {
  const cap_table = parseCapTableCsv(state.cap_table_csv);
  const waivers = parseWaiversCsv(state.waivers_csv);
  const exercises = parseExercisesCsv(state.exercises_csv);
  const notice_period_days = optionalNumber(state.notice_period_days);
  return {
    cap_table,
    proposed_transfer: {
      seller_id: state.seller_id.trim(),
      buyer_name: state.buyer_name.trim(),
      share_count: requiredNumber(state.share_count),
      price_per_share_aud: requiredNumber(state.price_per_share_aud),
      notice_date_iso: state.notice_date_iso.trim(),
      original_issue_date_iso:
        state.original_issue_date_iso.trim() || undefined,
      is_related_body_corporate_transfer:
        state.is_related_body_corporate_transfer,
    },
    waivers,
    exercises,
    ...(notice_period_days !== undefined ? { notice_period_days } : {}),
  };
}

export type RofrBand = "grey" | "green" | "amber" | "red";

/**
 * Map a RofrStatus to a traffic-light band. Chosen so a founder sees:
 * - grey  when nothing has happened yet or pre-emption is bypassed entirely,
 * - green when the transfer can proceed cleanly (fully_waived / no eligible
 *   pool),
 * - amber when action is outstanding but a path forward exists
 *   (notice_period_open / notice_period_closed / partially_exercised),
 * - red   when the sale to the third party is off (fully_exercised — existing
 *   holders took the whole block).
 */
export function pickRofrBand(status: RofrStatus): RofrBand {
  switch (status) {
    case "fully_waived":
      return "green";
    case "notice_period_open":
    case "notice_period_closed":
    case "partially_exercised":
      return "amber";
    case "fully_exercised":
      return "red";
    case "not_applicable":
    case "pending_notice":
    default:
      return "grey";
  }
}

/** Headline copy per status — kept alongside the state helpers so the wizard
 * and any future test/snapshot pull from the same source of truth. */
export const ROFR_STATUS_HEADLINE: Record<RofrStatus, string> = {
  not_applicable: "Pre-emption does not apply to this transfer",
  pending_notice: "Serve the pre-emption notice",
  notice_period_open: "Notice window is open",
  notice_period_closed: "Notice window has closed",
  fully_waived: "All holders waived — proceed with the transfer",
  partially_exercised: "Existing holders took part of the block",
  fully_exercised: "Existing holders took the whole block",
};
