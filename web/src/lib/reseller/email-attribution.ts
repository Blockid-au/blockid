// Reseller email attribution lookup — resolves an email address to the
// display name of the reseller that introduced the founder, if any.
//
// Consumers: web/src/lib/email.ts (sendWelcomeWithReport, sendPaymentReceipt)
// wire the returned display_name into resellerFooterHtml/Text so co-branded
// mail carries the "Introduced by <reseller>" line documented in plan §C.3
// + §P5.
//
// Contract:
//   - Returns the trimmed display_name string when the user has an active
//     attribution to an active reseller.
//   - Returns null in every other case, including: missing email, missing
//     supabase admin, user not found, no attribution_reseller_id, reseller
//     not found, reseller status !== 'active', or any transient DB error.
//   - Never throws. Fail-closed matches the pattern used by
//     /api/reseller/me/route.ts so email delivery is never blocked by a
//     transient reseller-side lookup failure.

import type { SupabaseClient } from "@supabase/supabase-js";

export type AppUserAttribution = {
  attribution_reseller_id?: string | null;
} | null;

export type ResellerDisplayRow = {
  display_name?: string | null;
  status?: string | null;
} | null;

/**
 * Pure decision layer: given a user row + reseller row already fetched,
 * decide whether to expose the display_name.
 */
export function pickActiveResellerDisplayName(
  userRow: AppUserAttribution,
  resellerRow: ResellerDisplayRow,
): string | null {
  if (!userRow?.attribution_reseller_id) return null;
  if (!resellerRow) return null;
  if (resellerRow.status !== "active") return null;
  const name = (resellerRow.display_name ?? "").trim();
  return name.length > 0 ? name : null;
}

/**
 * DB adapter: look up the display_name of the reseller attributed to the
 * account matching `email`. Returns null on any failure.
 *
 * Case-insensitive email match via `ilike` — mirrors how app_users emails
 * are stored (lowercased on insert) but tolerates receipts triggered by a
 * webhook that carries the original casing from Stripe.
 */
export async function resolveResellerDisplayNameByEmail(
  email: string | null | undefined,
  supabase: SupabaseClient | null | undefined,
): Promise<string | null> {
  const clean = (email ?? "").trim();
  if (!clean) return null;
  if (!supabase) return null;

  try {
    const { data: userRow } = await supabase
      .from("app_users")
      .select("attribution_reseller_id")
      .ilike("email", clean)
      .maybeSingle();

    const resellerId =
      (userRow as { attribution_reseller_id?: string | null } | null)
        ?.attribution_reseller_id ?? null;
    if (!resellerId) return null;

    const { data: reseller } = await supabase
      .from("resellers")
      .select("display_name, status")
      .eq("id", resellerId)
      .maybeSingle();

    return pickActiveResellerDisplayName(
      userRow as AppUserAttribution,
      reseller as ResellerDisplayRow,
    );
  } catch {
    return null;
  }
}
