import { createHash } from "node:crypto";

/**
 * sha256 of a report document as sorted-key JSON. Postgres jsonb does not keep
 * object key order, so a digest over insertion-order JSON.stringify would not
 * match once the row is read back; this one survives the round trip.
 */
export function reportRevisionHash(document: unknown): string {
  return createHash("sha256").update(JSON.stringify(sortKeys(document)), "utf8").digest("hex");
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = sortKeys(v);
    }
    return out;
  }
  return value;
}
