/**
 * Deterministic JSON canonicalization for proof hashing.
 *
 * Rules:
 *   - Keys are sorted lexicographically (recursive, including nested objects)
 *   - `undefined` values are dropped (same as JSON.stringify default)
 *   - Arrays preserve insertion order (elements are recursively sorted if objects)
 *   - No trailing newline, no extra whitespace
 *
 * This ensures that the same logical score always produces the exact same byte
 * string, which is a prerequisite for a stable SHA-256 hash.
 */

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonArray;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

function sortedReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    // Return a new object with keys in sorted order
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) {
        sorted[k] = v;
      }
    }
    return sorted;
  }
  return value;
}

/**
 * Produce a deterministic canonical JSON string from any score data object.
 * The same logical data always produces the same string.
 */
export function canonicalizeScore(scoreData: object): string {
  return JSON.stringify(scoreData, sortedReplacer);
}
