// G32 SV2 — the scoring profile identity (SOT §9.4.5): one SHA-256 over the
// catalogue registry + rubric@v1 content. Any change to an item, anchor, check,
// tier or applicability changes the hash, so a stored score can always be
// traced to the exact profile that produced it. Server-side (node:crypto).

import { createHash } from "node:crypto";
import { SCREENING_CATALOG_VERSION, SCREENING_ITEMS } from "./registry";
import { RUBRIC_ENTRIES, RUBRIC_VERSION } from "./rubric";

/** Canonical JSON: object keys sorted so the hash depends on content only. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function scoringProfileSha256(profile: { catalogVersion: string; rubricVersion: string; items: unknown; rubric: unknown }): string {
  return createHash("sha256").update(canonical(profile)).digest("hex");
}

/** Hash of the live catalogue + rubric (`profile_sha256` on every new snapshot/revision). */
export const SCORING_PROFILE_SHA256 = scoringProfileSha256({
  catalogVersion: SCREENING_CATALOG_VERSION,
  rubricVersion: RUBRIC_VERSION,
  items: SCREENING_ITEMS,
  rubric: RUBRIC_ENTRIES,
});
