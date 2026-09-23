import { createHash } from "node:crypto";

export const BUSINESS_INPUT_SNAPSHOT_VERSION = "business-input-v1" as const;

export type SnapshotInputKind = "pitch_deck" | "website" | "idea_text" | "existing_company_text";
export type SnapshotUnitKind = "page" | "slide" | "text";
export type SnapshotUnitStatus = "available" | "blocked" | "timeout" | "not_found" | "unsupported" | "stale" | "failed";

export interface SnapshotSourceInput {
  id: string;
  kind: SnapshotUnitKind;
  locator: string;
  text?: string | null;
  status: SnapshotUnitStatus;
  observedAt?: string | null;
  publishedAt?: string | null;
}

export interface BusinessInputSnapshot {
  version: typeof BUSINESS_INPUT_SNAPSHOT_VERSION;
  inputKind: SnapshotInputKind;
  actorId: string | null;
  businessId: string | null;
  createdAt: string;
  retention: {
    authorized: boolean;
    grantId: string | null;
  };
  sourceUnits: Array<{
    id: string;
    kind: SnapshotUnitKind;
    locator: string;
    status: SnapshotUnitStatus;
    observedAt: string | null;
    publishedAt: string | null;
    textSha256: string | null;
    chars: number;
  }>;
  contentSha256: string;
  digestSha256: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Builds provenance metadata only. Raw source text is hashed but deliberately
 * absent from the returned object; durable content storage requires a
 * separately authorised retention writer.
 */
export function createBusinessInputSnapshot(input: {
  inputKind: SnapshotInputKind;
  actorId?: string | null;
  businessId?: string | null;
  createdAt: string;
  retention?: { authorized: boolean; grantId?: string | null };
  sources: SnapshotSourceInput[];
}): BusinessInputSnapshot {
  const seen = new Set<string>();
  const sourceUnits = input.sources.map((source) => {
    if (!source.id.trim() || seen.has(source.id)) throw new Error("business_input_source_id_invalid");
    seen.add(source.id);
    const text = source.text ?? "";
    const available = source.status === "available";
    if (available && !text.trim()) throw new Error("business_input_available_source_empty");
    if (!available && text) throw new Error("business_input_unavailable_source_has_text");
    return {
      id: source.id,
      kind: source.kind,
      locator: source.locator,
      status: source.status,
      observedAt: source.observedAt ?? null,
      publishedAt: source.publishedAt ?? null,
      textSha256: available ? sha256(text) : null,
      chars: available ? text.length : 0,
    };
  });
  if (sourceUnits.length === 0) throw new Error("business_input_sources_required");

  const retention = {
    authorized: input.retention?.authorized === true,
    grantId: input.retention?.authorized === true ? (input.retention.grantId ?? null) : null,
  };
  if (retention.authorized && !retention.grantId) throw new Error("business_input_retention_grant_required");

  const contentSha256 = sha256(sourceUnits.map((source) => `${source.id}:${source.textSha256 ?? source.status}`).join("\n"));
  const withoutDigest = {
    version: BUSINESS_INPUT_SNAPSHOT_VERSION,
    inputKind: input.inputKind,
    actorId: input.actorId ?? null,
    businessId: input.businessId ?? null,
    createdAt: input.createdAt,
    retention,
    sourceUnits,
    contentSha256,
  };
  return { ...withoutDigest, digestSha256: sha256(JSON.stringify(withoutDigest)) };
}
