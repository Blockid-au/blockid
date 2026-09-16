// evidence-ids — deterministic evidence ids shared by W1–W3 catalogues,
// the W4 evidence rows and the S-R3 GATHER rows (report-pipeline/gather.ts).
//
// The pipeline's evidence (description, per-criterion text, files, links,
// gather results) has no uuid of its own, so we mint a deterministic one per
// item: a SHA-256 of the item's identity, shaped as an RFC-4122 v4 uuid.
// Deterministic means the same evidence yields the same id on a re-run, so
// citations stay stable across runs and across the appendix register.
// Pure: node `crypto` only.

import { createHash } from "crypto";

export function evidenceIdFor(seed: string): string {
  const h = createHash("sha256").update(seed).digest("hex");
  const timeHiAndVersion = `4${h.slice(13, 16)}`;
  const clockSeq = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20);
  return [h.slice(0, 8), h.slice(8, 12), timeHiAndVersion, clockSeq, h.slice(20, 32)].join("-");
}
