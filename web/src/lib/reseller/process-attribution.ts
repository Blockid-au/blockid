// Mirror of processReferral() for reseller attribution.
//
// Called whenever a new app_users row is created (magic-link verify,
// google oauth first login, password signup) AND a reseller code is
// present in the signup context (pending payload OR cookie header).
//
// Writes the cache column app_users.attribution_reseller_id if the code
// resolves to an active reseller. Does NOT create a reseller_attributions
// row — that requires a projects.id (per U.6 canonical per-workspace
// attribution) and is deferred to createProject() so the attribution
// only lands when the founder actually starts a startup.
//
// Failure is non-fatal: signup succeeds even if attribution cannot be
// stored. Log + move on.

import { getSupabaseAdmin } from "@/lib/supabase";
import { normaliseResellerCode } from "./attribution";

export async function processAttribution(userId: string, rawCode: string | null | undefined): Promise<void> {
  const code = normaliseResellerCode(rawCode);
  if (!code) return;

  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  try {
    // Resolve code → active reseller
    const { data: promo } = await supabase
      .from("reseller_promotion_codes")
      .select("id, reseller_id, active")
      .eq("code", code)
      .maybeSingle();

    if (!promo || !promo.active) return;

    const { data: reseller } = await supabase
      .from("resellers")
      .select("id, status")
      .eq("id", promo.reseller_id)
      .maybeSingle();

    if (!reseller || reseller.status !== "active") return;

    // Cache attribution on app_users (canonical attribution lives per-project
    // and is written by createProject; this cache lets the console + welcome
    // flow surface the reseller badge even before the founder's first project).
    await supabase
      .from("app_users")
      .update({ attribution_reseller_id: reseller.id })
      .eq("id", userId);
  } catch (err) {
    console.error("[reseller] processAttribution failed:", err);
  }
}
