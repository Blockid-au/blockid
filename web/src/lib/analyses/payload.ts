// Row shaping for `public.analyses` — pure, no I/O, so the size rules that
// keep a whole pitch deck from becoming a 2 MB row are unit-testable.
//
// See the header of migration 0124 for the reasoning. In short:
//   * `input_text` is the canonical raw text, hard-truncated at 64 KB, with
//     the true length kept alongside so nothing pretends to be complete;
//   * `intake` never repeats `rawText`, and drops `structured` (slide/page
//     splits) once it serialises past 128 KB;
//   * `svi` is a compact summary, because `computeSVI(signals)` is pure and
//     free and `signals` is retained — the full analysis is reproducible, so
//     storing it would be paying ~30 KB a row for derivable data.

import type { IntakeResult } from "@/lib/intake/analyze-input";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import type { ValuationEstimate } from "@/lib/valuation";

/** Hard cap on stored raw text. ~64 KB covers every real deck we have seen. */
export const MAX_INPUT_TEXT_CHARS = 65_536;
/** Above this, `structured` (per-slide / per-page text) is dropped. */
export const MAX_STRUCTURED_BYTES = 131_072;
/** Top-N next actions kept in the compact SVI summary. */
export const MAX_STORED_ACTIONS = 5;

export interface TruncatedText {
  text: string | null;
  chars: number;
  truncated: boolean;
}

/** Truncate to the row budget, reporting the original length honestly. */
export function truncateInputText(raw: string | undefined | null): TruncatedText {
  if (typeof raw !== "string" || raw.length === 0) {
    return { text: null, chars: 0, truncated: false };
  }
  if (raw.length <= MAX_INPUT_TEXT_CHARS) {
    return { text: raw, chars: raw.length, truncated: false };
  }
  return {
    text: raw.slice(0, MAX_INPUT_TEXT_CHARS),
    chars: raw.length,
    truncated: true,
  };
}

/**
 * The IntakeResult as stored: rawText removed (it lives in `input_text`) and
 * `structured` dropped when oversized. Everything else — signals, warnings,
 * classifier mode — is small and worth keeping verbatim.
 */
export function compactIntake(result: IntakeResult): Record<string, unknown> {
  const { rawText: _rawText, structured, context: _context, ...rest } = result;
  const out: Record<string, unknown> = { ...rest };
  if (structured) {
    let bytes = 0;
    try {
      bytes = JSON.stringify(structured).length;
    } catch {
      bytes = MAX_STRUCTURED_BYTES + 1; // unserialisable → drop it
    }
    if (bytes <= MAX_STRUCTURED_BYTES) {
      out.structured = structured;
    } else {
      out.structuredDropped = true;
      out.structuredBytes = bytes;
    }
  }
  return out;
}

export interface CompactSvi {
  version: string;
  totalSVI: number;
  stage: number;
  stageLabel: string;
  summary: string;
  sector?: string;
  sectorLabel?: string;
  confidenceMultiplier: number;
  dimensions: Record<string, number>;
  nextActions: { priority: string; title: string; detail: string }[];
  valuation: {
    low: number;
    mid: number;
    high: number;
    method: string;
    confidence: number;
    currency: string;
  };
}

/** Compact score + valuation summary. The full analysis stays reproducible. */
export function compactSvi(
  analysis: SVIAnalysis,
  valuation: ValuationEstimate,
): CompactSvi {
  const dimensions: Record<string, number> =
    analysis.dimensionScores ??
    Object.fromEntries(analysis.subs.map((s) => [s.key, s.value]));
  return {
    version: analysis.version,
    totalSVI: analysis.totalSVI,
    stage: analysis.stage,
    stageLabel: analysis.stageLabel,
    summary: analysis.summary,
    sector: analysis.sector,
    sectorLabel: analysis.sectorLabel,
    confidenceMultiplier: analysis.confidenceMultiplier,
    dimensions,
    nextActions: (analysis.nextActions ?? [])
      .slice(0, MAX_STORED_ACTIONS)
      .map((a) => ({ priority: a.priority, title: a.title, detail: a.detail })),
    valuation: {
      low: valuation.low,
      mid: valuation.mid,
      high: valuation.high,
      method: valuation.method,
      confidence: valuation.confidence,
      currency: valuation.currency,
    },
  };
}

export interface AnalysisRowInput {
  anonKey: string;
  userId?: string | null;
  result: IntakeResult;
  svi?: CompactSvi | null;
  url?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  bytes?: number | null;
}

/** The exact object handed to `supabase.from("analyses").insert(...)`. */
export function buildAnalysisRow(input: AnalysisRowInput): Record<string, unknown> {
  const { text, chars, truncated } = truncateInputText(input.result.rawText);
  return {
    anon_key: input.anonKey,
    user_id: input.userId ?? null,
    claimed_at: input.userId ? new Date().toISOString() : null,
    input_kind: input.result.inputKind,
    input_text: text,
    input_chars: chars,
    input_truncated: truncated,
    input_url: input.url ?? null,
    input_filename: input.filename ?? null,
    input_mime: input.mimeType ?? null,
    input_bytes: input.bytes ?? null,
    intake: compactIntake(input.result),
    context: input.result.context ?? null,
    svi: input.svi ?? null,
    svi_total: input.svi ? Math.round(input.svi.totalSVI * 100) / 100 : null,
    stage: input.svi ? input.svi.stage : (input.result.context?.stage ?? null),
    stage_label: input.svi?.stageLabel ?? null,
    valuation_mid_aud: input.svi ? Math.round(input.svi.valuation.mid) : null,
    // 0122 precedent: consent is never assumed. Both flags stay false until a
    // founder explicitly opts in through a publish control that does not yet
    // exist — so nothing written here can reach a public or investor surface.
    public_visible: false,
    investor_visible: false,
  };
}

/** Shape returned by GET /api/analyses/[id]. */
export interface StoredAnalysisRow {
  id: string;
  anon_key: string;
  user_id: string | null;
  input_kind: string;
  input_text: string | null;
  input_chars: number | null;
  input_truncated: boolean;
  input_url: string | null;
  input_filename: string | null;
  intake: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
  svi: CompactSvi | null;
  svi_total: number | null;
  stage: number | null;
  stage_label: string | null;
  valuation_mid_aud: number | null;
  created_at: string;
}

/**
 * Re-assemble the client-facing analysis. `rawText` is stitched back on from
 * `input_text` so the payload matches the IntakeResult the UI already knows
 * how to render — a caller should not have to care that we split the two.
 */
export function toClientAnalysis(row: StoredAnalysisRow): Record<string, unknown> {
  return {
    id: row.id,
    createdAt: row.created_at,
    owned: Boolean(row.user_id),
    input: {
      kind: row.input_kind,
      url: row.input_url,
      filename: row.input_filename,
      chars: row.input_chars,
      truncated: row.input_truncated,
    },
    intake: {
      ...(row.intake ?? {}),
      inputKind: row.input_kind,
      rawText: row.input_text ?? "",
      context: row.context ?? undefined,
    },
    context: row.context,
    svi: row.svi,
  };
}
