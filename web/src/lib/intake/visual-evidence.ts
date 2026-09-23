import { createHash } from "node:crypto";
import { z } from "zod";

const id = z.string().trim().min(1).max(200);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const dimension = z.number().int().positive();

/** Coordinates always refer to the upright, full-page derivative, before crop. */
export const visualRegionSchema = z.object({
  id,
  kind: z.enum(["text", "table", "chart", "diagram", "screenshot", "decorative", "unknown"]),
  bbox: z.object({ x: z.number().nonnegative(), y: z.number().nonnegative(), width: z.number().positive(), height: z.number().positive() }).strict(),
  state: z.enum(["pending", "extracted", "partial", "unreadable", "skipped_decorative", "budget_blocked", "unsupported", "failed"]),
  reason: z.string().trim().min(1).max(500).nullable(),
  evidenceIds: z.array(id).max(200),
}).strict().superRefine((region, ctx) => {
  if (region.state === "skipped_decorative" && region.kind !== "decorative") ctx.addIssue({ code: "custom", message: "Only decorative regions may be skipped as decorative" });
  if (!["pending", "extracted"].includes(region.state) && !region.reason) ctx.addIssue({ code: "custom", message: "Incomplete regions require a reason" });
  if (region.state === "extracted" && !region.evidenceIds.length) ctx.addIssue({ code: "custom", message: "Extracted region requires evidence" });
  if (!["extracted", "partial"].includes(region.state) && region.evidenceIds.length) ctx.addIssue({ code: "custom", message: "Unavailable regions cannot supply evidence" });
});

export const visualSourceSchema = z.object({
  id,
  fileSha256: hash,
  kind: z.enum(["image", "page", "slide"]),
  // Page/slide numbering is one-based; direct images have no page index.
  index: z.number().int().positive().nullable(),
  derivativeSha256: hash,
  width: dimension,
  height: dimension,
  transformVersion: id,
  regions: z.array(visualRegionSchema).min(1).max(500),
}).strict().superRefine((source, ctx) => {
  if ((source.kind === "image") !== (source.index === null)) ctx.addIssue({ code: "custom", message: "Source kind and page index disagree" });
  const seen = new Set<string>();
  for (const region of source.regions) {
    if (seen.has(region.id)) ctx.addIssue({ code: "custom", message: "Duplicate region ID" });
    seen.add(region.id);
    const b = region.bbox;
    if (b.x + b.width > source.width || b.y + b.height > source.height) ctx.addIssue({ code: "custom", message: "Region outside source dimensions" });
  }
});

const manifestSchema = z.object({
  version: z.literal("visual-evidence-v1"),
  site: z.enum(["blockid.au", "startupvalueindex.com"]),
  tenantId: id,
  businessId: id,
  inputSnapshotId: id,
  revisionId: id,
  extractorVersion: id,
  coordinateSpace: z.literal("upright-full-source-pixels"),
  sources: z.array(visualSourceSchema).min(1).max(500),
}).strict().superRefine((manifest, ctx) => {
  if (new Set(manifest.sources.map(source => source.id)).size !== manifest.sources.length) ctx.addIssue({ code: "custom", message: "Duplicate visual source ID" });
});

export type VisualSource = z.infer<typeof visualSourceSchema>;
export type VisualManifestInput = z.input<typeof manifestSchema>;
export type VisualEvidenceManifest = z.infer<typeof manifestSchema> & { digestSha256: string };
export const visualHash = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

/** Metadata only. This neither grants storage/access nor certifies claim support. */
export function createVisualEvidenceManifest(input: VisualManifestInput): VisualEvidenceManifest {
  const parsed = manifestSchema.parse(input);
  return { ...parsed, digestSha256: visualHash(JSON.stringify(parsed)) };
}

/** A scoped cache key is an isolation boundary, never an authorization check. */
export function visualCacheKey(manifest: VisualEvidenceManifest, policy: {
  provider: "deepinfra"; model: string; promptVersion: string; permissionScopeId: string;
}): string {
  const parsed = manifestSchema.parse({
    version: manifest.version, site: manifest.site, tenantId: manifest.tenantId,
    businessId: manifest.businessId, inputSnapshotId: manifest.inputSnapshotId,
    revisionId: manifest.revisionId, extractorVersion: manifest.extractorVersion,
    coordinateSpace: manifest.coordinateSpace, sources: manifest.sources,
  });
  if (visualHash(JSON.stringify(parsed)) !== manifest.digestSha256) throw new Error("visual_manifest_digest_mismatch");
  const qualifiedPolicy = z.object({ provider: z.literal("deepinfra"), model: id, promptVersion: id, permissionScopeId: id }).strict().parse(policy);
  return visualHash(JSON.stringify({ manifest: manifest.digestSha256, ...qualifiedPolicy }));
}
