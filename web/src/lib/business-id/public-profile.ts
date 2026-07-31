/**
 * Public Business Profile reader.
 *
 * Master Upgrade Plan §11.1 + §14bis user-locked decision D3
 * (`/id/[slug]` is public-by-default indexable with owner opt-out via
 * `share_settings.public_index=false`; source-of-truth column is the
 * top-level `public_index` on `projects` — see migration 0273).
 *
 * WHITELIST NON-NEGOTIABLE. The public view MUST expose ONLY:
 *   - slug (URL handle)
 *   - legal name (public display name)
 *   - verification level (0..5 ladder)
 *   - trust score (single composite derived from capability_scores)
 *   - last verified timestamp
 *   - badge list (derived, non-sensitive)
 *   - capability scores (12 numeric values only)
 *   - attestation summaries (attester display name + type + issued_at
 *     — NEVER raw evidence/documents)
 *   - jurisdiction (country/state)
 *   - canonical public URL
 *
 * Fields that MUST NEVER surface in this whitelist:
 *   - owner user_id / email / contact details
 *   - raw evidence uploads or their storage paths
 *   - financial figures (MRR/ARR/valuation)
 *   - internal notes, cap-table, ESOP data
 *
 * Reads go through the service-role admin client (RLS bypass) but the
 * query itself narrows by `public_index=true` so a mis-set flag can
 * never leak. The unpacker discards every column except the whitelist.
 */

import "server-only";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";

// ─── Public schema ──────────────────────────────────────────────────

/**
 * Attestation summary — the ONLY shape the public profile is allowed
 * to serialise per attestation. Raw documents, storage refs, private
 * notes, and full attester identities never appear here.
 */
export const AttestationSummarySchema = z.object({
  attester: z.string().min(1).max(120),
  type: z.enum([
    "auditor",
    "customer",
    "investor",
    "regulator",
    "partner",
    "other",
  ]),
  issuedAt: z.string().datetime(),
});
export type AttestationSummary = z.infer<typeof AttestationSummarySchema>;

/**
 * The full public projection. Any field not on this schema is a leak.
 */
export const PublicBusinessProfileSchema = z.object({
  slug: z.string().min(1).max(120),
  legalName: z.string().min(1).max(200),
  verificationLevel: z.number().int().min(0).max(5),
  trustScore: z.number().min(0).max(100),
  lastVerifiedAt: z.string().datetime().nullable(),
  badges: z.array(z.string()).max(30),
  capabilityScores: z.record(z.string(), z.number()),
  attestations: z.array(AttestationSummarySchema).max(50),
  jurisdiction: z.string().max(60),
  publicUrl: z.string().url(),
});
export type PublicBusinessProfile = z.infer<typeof PublicBusinessProfileSchema>;

// ─── Constants ──────────────────────────────────────────────────────

export const PUBLIC_PROFILE_BASE_URL = "https://blockid.au";

/**
 * Columns SELECTed from `projects`. Anything not listed here cannot
 * possibly reach the client. Explicit list — never `select("*")`.
 */
const PUBLIC_COLUMNS = [
  "public_slug",
  "name",
  "verification_level",
  "capability_scores",
  "last_verified_at",
  "attestations",
  "industry",
  "public_index",
].join(", ");

// ─── Derivation helpers ─────────────────────────────────────────────

/**
 * Trust score = average of the 12 numeric capability scores, clamped
 * to [0, 100]. Non-numeric entries are ignored. Empty → 0.
 * Public value only — same input the founder sees; no private multiplier.
 */
export function deriveTrustScore(
  capabilityScores: Record<string, unknown>,
): number {
  const nums: number[] = [];
  for (const v of Object.values(capabilityScores)) {
    if (typeof v === "number" && Number.isFinite(v)) nums.push(v);
  }
  if (nums.length === 0) return 0;
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  return Math.max(0, Math.min(100, Math.round(avg * 10) / 10));
}

/**
 * Derive the public badge list. Non-sensitive — anyone visiting the
 * page could infer these from the verification level + trust score.
 */
export function deriveBadges(
  verificationLevel: number,
  trustScore: number,
): string[] {
  const badges: string[] = [];
  if (verificationLevel >= 1) badges.push("identity-verified");
  if (verificationLevel >= 2) badges.push("evidence-checked");
  if (verificationLevel >= 3) badges.push("trust-tier");
  if (verificationLevel >= 4) badges.push("attested");
  if (verificationLevel >= 5) badges.push("continuously-monitored");
  if (trustScore >= 80) badges.push("high-performer");
  else if (trustScore >= 60) badges.push("investor-ready");
  return badges;
}

/**
 * Normalise a timestamp to STRICT ISO-8601 with a `Z` suffix.
 *
 * Why this exists: PostgREST serialises `timestamptz` with a numeric
 * offset (`2026-07-15T00:00:00+00:00`), but Zod's `.datetime()` only
 * accepts the `Z` form. Feeding the raw PostgREST string straight into
 * `PublicBusinessProfileSchema` made the WHOLE profile fail validation,
 * which surfaced as a 404 on `/id/[slug]` for every profile that had
 * ever been verified. Normalise once, here, so the schema stays strict.
 *
 * Returns null for anything that is not a parseable instant.
 */
export function toIsoZ(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

/**
 * Whitelist-only unpacker. Given a raw row, returns ONLY the fields
 * the schema permits. Nothing else can leak.
 */
export function projectRowToPublicProfile(
  row: Record<string, unknown>,
): PublicBusinessProfile | null {
  const slug = typeof row.public_slug === "string" ? row.public_slug : null;
  if (!slug) return null;

  const legalName =
    typeof row.name === "string" && row.name.length > 0 ? row.name : slug;

  const verificationLevel =
    typeof row.verification_level === "number"
      ? Math.max(0, Math.min(5, Math.floor(row.verification_level)))
      : 0;

  const capabilityScoresRaw =
    row.capability_scores && typeof row.capability_scores === "object"
      ? (row.capability_scores as Record<string, unknown>)
      : {};

  const capabilityScores: Record<string, number> = {};
  for (const [k, v] of Object.entries(capabilityScoresRaw)) {
    if (typeof v === "number" && Number.isFinite(v)) {
      capabilityScores[k] = Math.max(0, Math.min(100, v));
    }
  }

  const trustScore = deriveTrustScore(capabilityScoresRaw);
  const badges = deriveBadges(verificationLevel, trustScore);

  const lastVerifiedAt = toIsoZ(row.last_verified_at);

  const attestationsRaw = Array.isArray(row.attestations) ? row.attestations : [];
  const attestations: AttestationSummary[] = [];
  for (const entry of attestationsRaw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    // issuedAt is normalised the same way as last_verified_at — an
    // attestation authored with a `+10:00` offset must not silently
    // drop out of the list.
    const issuedAt = toIsoZ(e.issuedAt) ?? toIsoZ(e.issued_at);
    const parsed = AttestationSummarySchema.safeParse({
      attester: typeof e.attester === "string" ? e.attester : undefined,
      type: typeof e.type === "string" ? e.type : undefined,
      issuedAt: issuedAt ?? undefined,
    });
    if (parsed.success) attestations.push(parsed.data);
  }

  const jurisdiction =
    typeof row.industry === "string" && row.industry.length > 0
      ? "AU" // scaffold: no jurisdiction column yet on projects; default AU
      : "AU";

  const publicUrl = `${PUBLIC_PROFILE_BASE_URL}/id/${slug}`;

  const candidate: PublicBusinessProfile = {
    slug,
    legalName,
    verificationLevel,
    trustScore,
    lastVerifiedAt,
    badges,
    capabilityScores,
    attestations,
    jurisdiction,
    publicUrl,
  };

  const parsed = PublicBusinessProfileSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

// ─── Reader ─────────────────────────────────────────────────────────

/**
 * Load a public profile by its URL slug.
 *
 * Returns `null` if:
 *   - slug is empty/malformed
 *   - Supabase is not configured (marketing-site dev mode)
 *   - no row matches slug
 *   - the row has `public_index=false` (owner opt-out per §14bis D3)
 *
 * Never throws for "not found" — callers should call `notFound()` on
 * null so Next.js renders the 404 boundary.
 */
export async function readPublicProfile(
  slug: string,
): Promise<PublicBusinessProfile | null> {
  const trimmed = typeof slug === "string" ? slug.trim() : "";
  if (!trimmed || trimmed.length > 120) return null;

  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin
    .from("projects")
    .select(PUBLIC_COLUMNS)
    .eq("public_slug", trimmed)
    .eq("public_index", true)
    .maybeSingle();

  if (error || !data) return null;

  return projectRowToPublicProfile(data as unknown as Record<string, unknown>);
}
