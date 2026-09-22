/** Small, validated projection of the canonical report; never estimates from SVI. */
export type StreamValuationStatus = "pending" | "available" | "unavailable";
export interface StreamValuation {
  currency: "AUD";
  consensus: { lowAud: number; midAud: number; highAud: number; confidence: number };
  scenarios: { bear: number; base: number; bull: number };
}
export function readStreamValuation(value: unknown): StreamValuation | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if ((v.status !== undefined && v.status !== "available") || v.currency !== "AUD") return null;
  const c = v.consensus as StreamValuation["consensus"] | undefined;
  const s = v.scenarios as StreamValuation["scenarios"] | undefined;
  if (!c || !s || ![c.lowAud, c.midAud, c.highAud, c.confidence, s.bear, s.base, s.bull].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0)) return null;
  if (c.lowAud > c.midAud || c.midAud > c.highAud || c.confidence > 1) return null;
  return { currency: "AUD", consensus: { lowAud: c.lowAud, midAud: c.midAud, highAud: c.highAud, confidence: c.confidence }, scenarios: { bear: s.bear, base: s.base, bull: s.bull } };
}
/** A retry of selected dimensions does not recalculate the full report valuation. */
export function valuationForRun(previous: StreamValuation | null, partial: boolean): StreamValuation | null {
  return partial ? previous : null;
}
