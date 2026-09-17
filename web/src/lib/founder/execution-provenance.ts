// Server-side provenance for the founder execution fields — G14-review
// (S37 P1). Pure; used by POST /api/founder-profile.
//
// `execution_source[field]` says who last wrote a field. "founder" is the
// only value a client may assert about itself; the other three are
// evidence and must be backed:
//
//   linkedin_parser  the value equals what the import attestation carries
//                    (lib/founder/linkedin-attestation.ts) — years within
//                    the same integer, employers ⊇ the attested list
//   any non-founder  OR the row already carried that stamp AND the field's
//                    value is unchanged in this save (re-saving the form
//                    keeps provenance; editing the field resets it)
//
// Anything else is downgraded to "founder" — never rejected, the save still
// lands, only the cap-lifting claim is dropped.

import type { ExecutionSource, FounderProfile } from "@/lib/founder-profile-types";
import { EXECUTION_SOURCES } from "@/lib/founder-profile-types";
import { canonicalEmployers, type LinkedInAttestationClaims } from "./linkedin-attestation";

/** The fields a provenance stamp may refer to (everything the rubric reads + what the import prefills). */
export const PROVENANCE_FIELDS = [
  "years_in_domain",
  "prev_employers",
  "prior_exits",
  "prior_raises",
  "github_url",
  "full_time_pct",
  "worked_together_before",
  "roles",
  "full_name",
  "linkedin_url",
] as const;
export type ProvenanceField = (typeof PROVENANCE_FIELDS)[number];

type Snapshot = Pick<FounderProfile, ProvenanceField>;

function isSource(v: unknown): v is ExecutionSource {
  return typeof v === "string" && (EXECUTION_SOURCES as readonly string[]).includes(v);
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function attestedBacks(field: ProvenanceField, next: Snapshot, claims: LinkedInAttestationClaims | null): boolean {
  if (!claims) return false;
  if (field === "years_in_domain") {
    return claims.years_in_domain != null && next.years_in_domain != null && Math.round(next.years_in_domain) === Math.round(claims.years_in_domain);
  }
  if (field === "prev_employers") {
    const attested = canonicalEmployers(claims.prev_employers);
    if (!attested.length) return false;
    const mine = new Set(canonicalEmployers(next.prev_employers));
    return attested.every((e) => mine.has(e));
  }
  // full_name / linkedin_url are prefilled by the import too, but they never
  // lift the cap — a valid attestation is proof enough that the import ran.
  return field === "full_name" || field === "linkedin_url";
}

export interface ResolveProvenanceArgs {
  /** What the client sent (already Zod-validated to the enum). */
  requested: Partial<Record<string, ExecutionSource>> | null | undefined;
  /** The values about to be saved. */
  next: Snapshot;
  /** The row as stored before this save (null = first save). */
  existing: Pick<FounderProfile, ProvenanceField | "execution_source"> | null;
  /** Verified import attestation claims, if the body carried a valid token. */
  attested: LinkedInAttestationClaims | null;
}

export interface ResolvedProvenance {
  execution_source: Partial<Record<string, ExecutionSource>>;
  /** Fields whose non-founder stamp was dropped (for the response / logs). */
  downgraded: string[];
}

export function resolveExecutionProvenance(args: ResolveProvenanceArgs): ResolvedProvenance {
  const out: Partial<Record<string, ExecutionSource>> = {};
  const downgraded: string[] = [];
  const requested = args.requested && typeof args.requested === "object" ? args.requested : {};
  const prior = args.existing?.execution_source ?? {};

  for (const [key, value] of Object.entries(requested)) {
    if (!isSource(value)) continue;
    if (!(PROVENANCE_FIELDS as readonly string[]).includes(key)) continue;
    const field = key as ProvenanceField;
    if (value === "founder") {
      out[field] = "founder";
      continue;
    }
    const kept = Boolean(args.existing && prior[field] === value && same(args.existing[field], args.next[field]));
    const attested = value === "linkedin_parser" && attestedBacks(field, args.next, args.attested);
    if (kept || attested) {
      out[field] = value;
    } else {
      out[field] = "founder";
      downgraded.push(field);
    }
  }
  return { execution_source: out, downgraded };
}
