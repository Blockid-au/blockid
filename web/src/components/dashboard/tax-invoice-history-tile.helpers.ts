// Pure helpers for <TaxInvoiceHistoryTile /> (P5-tax-invoice-checker-tile).
//
// Classifies the GET /api/compliance/tax-invoice-check payload into a
// tile band (red/amber/emerald/slate) + copy pack so the tile renders
// deterministically without a second threshold layer in the client.
// Mirrors the CompliancePanel Tile shape (pill colour + subtitle body).

import type {
  TaxInvoiceBand,
  TaxInvoiceResult,
} from "@/lib/compliance/tax-invoice-checker";

export type TileColour = "red" | "amber" | "emerald" | "slate";

export interface HistoryTilePayload {
  total: number;
  latest: {
    ok: boolean;
    band: TaxInvoiceBand;
    gst_inclusive_total_aud: number;
    computed_gst_component_aud: number;
    missing_field_count: number;
    warning_count: number;
    computed_at: string;
    result_json?: TaxInvoiceResult | null;
  } | null;
}

export interface HistoryTileView {
  colour: TileColour;
  chipLabel: string;
  body: string;
}

export const TAX_INVOICE_BAND_LABEL: Record<TaxInvoiceBand, string> = {
  under_threshold: "Under A$82.50",
  standard: "A$82.50 – A$1,000",
  large: "A$1,000+",
};

export function pickHistoryTileView(payload: HistoryTilePayload | null): HistoryTileView {
  if (!payload || payload.total === 0 || !payload.latest) {
    return {
      colour: "slate",
      chipLabel: "None saved",
      body: "Run a receipt through the ATO tax-invoice checker to save your first audit snapshot.",
    };
  }

  const { total, latest } = payload;
  const bandLabel = TAX_INVOICE_BAND_LABEL[latest.band];
  const savedSuffix = total === 1 ? "1 saved" : `${total} saved`;

  if (!latest.ok || latest.missing_field_count > 0) {
    return {
      colour: "red",
      chipLabel: `${latest.missing_field_count} missing`,
      body: `${savedSuffix}. Latest ${bandLabel} invoice failed the ATO checklist — fix ${latest.missing_field_count} missing field${latest.missing_field_count === 1 ? "" : "s"} before you claim the input-tax credit.`,
    };
  }

  if (latest.warning_count > 0) {
    return {
      colour: "amber",
      chipLabel: `${latest.warning_count} warning${latest.warning_count === 1 ? "" : "s"}`,
      body: `${savedSuffix}. Latest ${bandLabel} invoice passed with ${latest.warning_count} warning${latest.warning_count === 1 ? "" : "s"} — review before lodging.`,
    };
  }

  return {
    colour: "emerald",
    chipLabel: `${savedSuffix}`,
    body: `Latest ${bandLabel} invoice passes the ATO valid-tax-invoice rules — safe to file in data-room folder 3.`,
  };
}

/**
 * Renders a computed_at ISO into "N days ago" / "today" / "yesterday".
 * Returns "recently" for garbage or future dates so the tile never renders
 * "in -3 days" or NaN.
 */
export function formatComputedAtRelative(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "recently";
  const then = new Date(iso);
  const t = then.getTime();
  if (!Number.isFinite(t)) return "recently";
  const nowT = now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor((nowT - t) / dayMs);
  if (diffDays < 0) return "recently";
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
}
