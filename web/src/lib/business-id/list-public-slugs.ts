/**
 * Directory reader — public Business ID slugs for the sitemap.
 *
 * Master Upgrade Plan §11.1 states only Level ≥ 2 (evidence-checked)
 * profiles should surface publicly — L1 is self-declared and not
 * sufficient for indexing. §14bis D3 layers `public_index=true` on top
 * so owner opt-outs also drop from the sitemap.
 *
 * Whitelist SELECT: only the columns the sitemap actually renders
 * (`public_slug`, `verification_level`, `last_verified_at`). No PII
 * ever loads.
 *
 * Returns an empty array when Supabase is unconfigured so the
 * marketing site build works without secrets.
 */

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";

export interface PublicSlugEntry {
  slug: string;
  verificationLevel: number;
  lastVerifiedAt: Date;
}

const MIN_VERIFICATION_LEVEL_FOR_SITEMAP = 2;

export async function listPublicSlugsForSitemap(
  limit = 5000,
): Promise<PublicSlugEntry[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];

  const { data, error } = await admin
    .from("projects")
    .select("public_slug, verification_level, last_verified_at")
    .eq("public_index", true)
    .gte("verification_level", MIN_VERIFICATION_LEVEL_FOR_SITEMAP)
    .not("public_slug", "is", null)
    .order("last_verified_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error || !data) return [];

  const out: PublicSlugEntry[] = [];
  for (const row of data as Array<Record<string, unknown>>) {
    const slug = typeof row.public_slug === "string" ? row.public_slug : null;
    if (!slug) continue;
    const level =
      typeof row.verification_level === "number" ? row.verification_level : 0;
    if (level < MIN_VERIFICATION_LEVEL_FOR_SITEMAP) continue;
    const iso =
      typeof row.last_verified_at === "string" ? row.last_verified_at : null;
    out.push({
      slug,
      verificationLevel: level,
      lastVerifiedAt: iso ? new Date(iso) : new Date(),
    });
  }
  return out;
}
