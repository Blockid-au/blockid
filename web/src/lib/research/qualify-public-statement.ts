/** Exact, reproducible source attribution. This does not validate the publisher's claim as true. */
import { createHash } from "node:crypto";
import type { PublicResearchResult, PublicSourceRecord } from "./public-source-contract";

export interface PublicStatementRequest {
  kind: "attributed_source_statement";
  sourceId: string;
  projectId: string;
  entityName: string;
  sourceUrl: string;
  excerptSha256: string;
  quote: string;
}
export interface QualifiedPublicStatement {
  id: string;
  kind: "attributed_source_statement";
  sourceId: string;
  projectId: string;
  entityName: string;
  sourceUrl: string;
  fetchedAt: string;
  sourceContentSha256: string;
  excerptSha256: string;
  quote: string;
  /** This exact attribution is the only supported claim. Never use its numbers alone. */
  supportedClaim: string;
  sourceSnapshotSha256: string;
  verification: "quote_matched_only";
  allowedUse: "literal_source_attribution_only";
  independentConfirmation: false;
}
export type PublicStatementQualification = { status: "qualified_attribution"; evidence: QualifiedPublicStatement } | { status: "pending"; reason: string };
export const excerptDigest = (value: string): string => createHash("sha256").update(value).digest("hex");
const hash = (value: unknown) => excerptDigest(JSON.stringify(value));

function entityMentioned(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").test(text);
}
function safeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

/**
 * Caller must supply the server-owned retrieval snapshot, never request-body source records.
 * An exact whole-excerpt match preserves surrounding negation and comparisons; this phase
 * deliberately does not support paraphrases, translation, inferred numbers or shorter snippets.
 */
export function qualifyPublicStatement(research: PublicResearchResult, request: PublicStatementRequest): PublicStatementQualification {
  const pending = (reason: string): PublicStatementQualification => ({ status: "pending", reason });
  if (request.kind !== "attributed_source_statement") return pending("unsupported_claim_type");
  if (!request.projectId || request.projectId !== research.task.businessScope.projectId) return pending("business_scope_mismatch");
  if (request.entityName !== research.task.businessScope.name || request.entityName.trim().length < 3) return pending("entity_mismatch");
  const matches = research.sources.filter(source => source.id === request.sourceId);
  if (matches.length !== 1) return pending("source_not_unique");
  const source = matches[0];
  if (source.status !== "found" || source.reason !== "page_read_claim_support_not_assessed") return pending("source_not_read");
  if (source.role !== "business") return pending("alternative_entity_not_resolved");
  if (!safeUrl(source.url) || request.sourceUrl !== source.url) return pending("source_url_mismatch");
  if (!source.fetchedAt || !Number.isFinite(Date.parse(source.fetchedAt)) || !source.contentSha256 || !/^[a-f0-9]{64}$/.test(source.contentSha256)) return pending("snapshot_metadata_missing");
  // Stored excerpt digest must originate in retrieval. An old snapshot is not silently upgraded.
  if (!source.excerptSha256 || source.excerptSha256 !== excerptDigest(source.excerpt) || request.excerptSha256 !== source.excerptSha256) return pending("excerpt_snapshot_mismatch");
  if (request.quote !== source.excerpt || request.quote.trim().length < 40) return pending("quote_not_complete_excerpt");
  if (!entityMentioned(request.quote, request.entityName)) return pending("entity_not_in_quote");
  const sourceSnapshotSha256 = hash([research.task.businessScope, source.id, source.url, source.fetchedAt, source.contentSha256, source.excerptSha256]);
  return { status: "qualified_attribution", evidence: {
    id: `public-attribution-${hash([sourceSnapshotSha256, request.kind, request.quote]).slice(0, 32)}`,
    kind: request.kind, sourceId: source.id, projectId: request.projectId, entityName: request.entityName, sourceUrl: source.url,
    fetchedAt: source.fetchedAt, sourceContentSha256: source.contentSha256, excerptSha256: source.excerptSha256, quote: request.quote,
    supportedClaim: `The page at ${source.url} states: ${JSON.stringify(request.quote)}`,
    sourceSnapshotSha256, verification: "quote_matched_only", allowedUse: "literal_source_attribution_only", independentConfirmation: false,
  } };
}

/** Only exact attributed text can consume this evidence. It is excluded from numeric auto-citation. */
export function supportsPublicAttribution(evidence: QualifiedPublicStatement, claim: string): boolean {
  return claim === evidence.supportedClaim;
}

/** Deterministic proposals from an existing server-owned snapshot; zero new network or model calls. */
export function qualifyRetrievedBusinessStatements(research: PublicResearchResult): Array<{ sourceId: string; result: PublicStatementQualification }> {
  return research.sources.map((source: PublicSourceRecord) => ({ sourceId: source.id, result: qualifyPublicStatement(research, {
    kind: "attributed_source_statement", sourceId: source.id, projectId: research.task.businessScope.projectId ?? "",
    entityName: research.task.businessScope.name, sourceUrl: source.url, excerptSha256: source.excerptSha256 ?? "", quote: source.excerpt,
  }) }));
}
