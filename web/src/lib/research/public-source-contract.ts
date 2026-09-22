import { z } from "zod";

export type RetrievalStatus = "found" | "not_found" | "blocked" | "not_run";
export interface PublicSourceTask {
  criterion: "market";
  /** Exact question from the existing criterion taxonomy, not a new question ID. */
  question: string;
  businessScope: { name: string; projectId: string | null };
  sources: Array<{ url: string; role: "business" | "market_or_alternative" }>;
}
export interface PublicSourceRecord {
  id: string;
  url: string;
  title: string;
  role: PublicSourceTask["sources"][number]["role"];
  status: RetrievalStatus;
  reason: string;
  fetchedAt: string | null;
  publishedAt: null;
  contentSha256: string | null;
  /** Hash of the stored excerpt; absent on older snapshots. */
  excerptSha256?: string;
  excerpt: string;
  /** Reading a page does not establish competitor relevance, independence or truthful publisher claims. */
  relevance: "not_assessed";
  citable: false;
}
export interface PublicResearchResult {
  version: "public-sources-v1";
  task: Omit<PublicSourceTask, "sources">;
  status: RetrievalStatus;
  discovery: { status: "not_run"; reason: string };
  sources: PublicSourceRecord[];
  limits: { requested: number; attempted: number; maxSources: number; targetAlternatives: number; verifiedAlternatives: number };
  instruction: string;
  attributions?: import("./qualify-public-statement").QualifiedPublicStatement[];
  qualificationPending?: Array<{ sourceId: string; reason: string }>;
}

const status = z.enum(["found", "not_found", "blocked", "not_run"]);
export const publicResearchSchema = z.object({
  version: z.literal("public-sources-v1"),
  task: z.object({ criterion: z.literal("market"), question: z.string(), businessScope: z.object({ name: z.string(), projectId: z.string().nullable() }) }),
  status,
  discovery: z.object({ status: z.literal("not_run"), reason: z.string() }),
  sources: z.array(z.object({ id: z.string(), url: z.string(), title: z.string(), role: z.enum(["business", "market_or_alternative"]), status, reason: z.string(), fetchedAt: z.string().nullable(), publishedAt: z.null(), contentSha256: z.string().nullable(), excerptSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(), excerpt: z.string().max(1600), relevance: z.literal("not_assessed"), citable: z.literal(false) })).max(5),
  limits: z.object({ requested: z.number().int().nonnegative(), attempted: z.number().int().min(0).max(5), maxSources: z.literal(5), targetAlternatives: z.literal(5), verifiedAlternatives: z.literal(0) }),
  instruction: z.string(),
  attributions: z.array(z.object({
    id: z.string(), kind: z.literal("attributed_source_statement"), sourceId: z.string(), projectId: z.string(), entityName: z.string(), sourceUrl: z.string(), fetchedAt: z.string(), sourceContentSha256: z.string(), excerptSha256: z.string(), quote: z.string().max(1600), supportedClaim: z.string(), sourceSnapshotSha256: z.string(), verification: z.literal("quote_matched_only"), allowedUse: z.literal("literal_source_attribution_only"), independentConfirmation: z.literal(false),
  })).max(5).optional(),
  qualificationPending: z.array(z.object({ sourceId: z.string(), reason: z.string() })).max(5).optional(),
});
