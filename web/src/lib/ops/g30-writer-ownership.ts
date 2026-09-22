import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type G30OwnershipDecision = "active" | "released" | "invalid";

/** Same explicit handoff contract as the scheduled shell writer guards. */
export function parseG30Ownership(raw: string): G30OwnershipDecision {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      && value.version === 1 && value.owner === "g30"
      && value.source_of_truth === "docs/plans/SOURCE-OF-TRUTH.md"
      && (value.status === "active" || value.status === "released")
      ? value.status : "invalid";
  } catch { return "invalid"; }
}

export function g30WriterDeferred(): Response | null {
  const web = process.env.BLOCKID_WEB_DIR ?? "/home/dovanlong/blockid.au/web";
  let decision: G30OwnershipDecision = "invalid";
  try { decision = parseG30Ownership(readFileSync(resolve(web, "../docs/plans/g30-execution-control.json"), "utf8")); } catch { /* Fail closed, including missing control. */ }
  if (decision === "released") return null;
  return Response.json({ ok: false, deferred: true, reason: "g30_implementation_owned", ownership: decision }, { status: 503 });
}
