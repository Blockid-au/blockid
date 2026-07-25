// Pure helpers for parsing the /api/fundraise response into the three
// UI states the wholesale-only fundraise wizard renders (P6b).
//
// Contract: docs/plans/atlassian-standard-mapping-goal.md
//   §P6b-test — pin the (fetch-response → banner state) branch matrix
//   so a regression in the ESIC + Div 83A gate wire shape shows up as a
//   failing unit test instead of a broken banner in production.
//
// No I/O, no imports beyond types — safe to unit-test under vitest.
// Kept colocated with fundraise-client.tsx so the client can re-import
// the same structural types without dragging server-side symbols across
// the client boundary.

/**
 * Non-blocking gate warning attached to a happy-path 200 response —
 * shape mirrors the `esic_warn` / `div83a_warn` envelope returned by
 * `web/src/app/api/fundraise/route.ts` (see `esicWarn` / `div83aWarn`
 * assembly at lines 121 / 147 / 244–245).
 */
export interface GateWarn {
  reason: string;
  message: string;
  url_to_fix: string;
}

/**
 * Blocking gate response — 412 body from route.ts lines 109–119 (ESIC)
 * and 134–145 (Div 83A). Discriminated on `error` so the tile can pick
 * the correct heading (`esic_gate_blocked` → ESIC copy, `div83a_gate_blocked`
 * → Div 83A copy).
 */
export interface GateBlock {
  error: "esic_gate_blocked" | "div83a_gate_blocked";
  reason: string;
  message: string;
  url_to_fix: string;
  disclaimer: string;
}

/**
 * Discriminated union covering every branch the wizard needs to render:
 *   - "block": 412 — show the red gate-block banner + "Fix now" button
 *   - "ok":    2xx  + `ok:true` — advance the wizard, surface any warns
 *   - "error": 4xx/5xx or `ok:false` without a recognised gate error
 */
export type FundraiseGateOutcome =
  | { kind: "block"; block: GateBlock }
  | {
      kind: "ok";
      data: Record<string, unknown>;
      warns: readonly GateWarn[];
    }
  | { kind: "error"; message: string };

const KNOWN_BLOCK_ERRORS: readonly GateBlock["error"][] = [
  "esic_gate_blocked",
  "div83a_gate_blocked",
];

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function pickString(rec: Record<string, unknown>, key: string): string {
  const v = rec[key];
  return typeof v === "string" ? v : "";
}

/**
 * Coerce a raw `esic_warn` / `div83a_warn` payload into a `GateWarn`.
 * Returns `null` when the payload is missing / not an object / missing
 * the required `reason` field — the caller drops nulls before rendering.
 */
export function parseGateWarn(raw: unknown): GateWarn | null {
  if (!isRecord(raw)) return null;
  const reason = pickString(raw, "reason");
  if (!reason) return null;
  return {
    reason,
    message: pickString(raw, "message"),
    url_to_fix: pickString(raw, "url_to_fix"),
  };
}

/**
 * Coerce a 412 body into a `GateBlock`. Returns `null` unless the body
 * carries a recognised `error` value — the caller falls back to the
 * generic error banner in that case.
 */
export function parseGateBlock(raw: unknown): GateBlock | null {
  if (!isRecord(raw)) return null;
  const err = raw.error;
  if (typeof err !== "string") return null;
  if (!KNOWN_BLOCK_ERRORS.includes(err as GateBlock["error"])) return null;
  return {
    error: err as GateBlock["error"],
    reason: pickString(raw, "reason"),
    message: pickString(raw, "message"),
    url_to_fix: pickString(raw, "url_to_fix"),
    disclaimer: pickString(raw, "disclaimer"),
  };
}

/**
 * Classify a /api/fundraise POST response.
 *
 * Rules (matches fundraise-client.tsx `calculateDilution()`):
 *   - status 412 + parseable block  → { kind: "block" }
 *   - status 412 + non-block body   → { kind: "error", ... } (safety net)
 *   - status 2xx + data.ok=true     → { kind: "ok", warns: [...] }
 *   - anything else                 → { kind: "error", message }
 *
 * Guarantees:
 *   - never throws (all coercion is defensive)
 *   - warns list is deduped by reason so a route that mistakenly returns
 *     the same warn on both slots doesn't render twice
 *   - `warns` retains input order (esic_warn before div83a_warn) so the
 *     UI banner order matches the route's assembly order
 */
export function classifyFundraiseResponse(
  status: number,
  data: unknown,
): FundraiseGateOutcome {
  if (status === 412) {
    const block = parseGateBlock(data);
    if (block) return { kind: "block", block };
    // 412 without a recognised gate error — surface as a generic error
    // so the founder sees *something* instead of a silent failure.
    const message = isRecord(data)
      ? pickString(data, "error") || "Round rejected by compliance gate"
      : "Round rejected by compliance gate";
    return { kind: "error", message };
  }

  if (!isRecord(data)) {
    return { kind: "error", message: "Network error. Please try again." };
  }

  if (data.ok !== true) {
    const message = pickString(data, "error") || "Failed to calculate round";
    return { kind: "error", message };
  }

  const rawWarns: unknown[] = [data.esic_warn, data.div83a_warn];
  const seen = new Set<string>();
  const warns: GateWarn[] = [];
  for (const w of rawWarns) {
    const parsed = parseGateWarn(w);
    if (!parsed) continue;
    if (seen.has(parsed.reason)) continue;
    seen.add(parsed.reason);
    warns.push(parsed);
  }

  return { kind: "ok", data, warns };
}

/**
 * Body assembler for the /api/fundraise POST — matches the shape
 * fundraise-client.tsx currently JSON-stringifies. Extracted so the
 * `wholesaleOnly` slot is guaranteed to travel with every request.
 *
 * P9-esic-round-marketing-gate-ui — `marketedAsEsic` is an optional
 * founder-declared flag that the auto-firing ESIC gate consumes
 * directly (skipping the heuristic scan). When true, /api/fundraise
 * flips the ESIC gate into blocking mode regardless of `wholesaleOnly`
 * because a round that pitches the Div 360 offset to retail investors
 * carries the same s1041H exposure as a wholesale-only one. Only
 * emitted on the wire when true so an unticked checkbox never
 * over-declares intent (the route defaults undefined → false).
 */
export interface FundraisePostBodyInput {
  roundName: string;
  targetAmount: number;
  preMoneyValuation: number;
  instrumentType: "priced" | "safe" | "convertible_note";
  safeDiscount: number;
  safeCap: number;
  wholesaleOnly: boolean;
  marketedAsEsic?: boolean;
}

export interface FundraisePostBodyWire {
  roundName: string;
  targetAmount: number;
  preMoneyValuation: number;
  instrumentType: "priced" | "safe" | "convertible_note";
  safeDiscount?: number;
  safeCap?: number;
  wholesaleOnly: boolean;
  marketedAsEsic?: boolean;
}

export function buildFundraisePostBody(
  input: FundraisePostBodyInput,
): FundraisePostBodyWire {
  const safeFields = input.instrumentType !== "priced"
    ? { safeDiscount: input.safeDiscount, safeCap: input.safeCap }
    : {};
  const marketingFields = input.marketedAsEsic === true
    ? { marketedAsEsic: true as const }
    : {};
  return {
    roundName: input.roundName,
    targetAmount: input.targetAmount,
    preMoneyValuation: input.preMoneyValuation,
    instrumentType: input.instrumentType,
    ...safeFields,
    wholesaleOnly: input.wholesaleOnly,
    ...marketingFields,
  };
}

/**
 * Copy pack for the gate-block banner heading. Sourced from
 * fundraise-client.tsx render logic at line 437–441.
 */
export const GATE_BLOCK_HEADING: Record<GateBlock["error"], string> = {
  esic_gate_blocked: "Wholesale-only round blocked by ESIC gate",
  div83a_gate_blocked: "Wholesale-only round blocked by Div 83A ESOP gate",
};
