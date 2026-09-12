// Server half of the NDA click-wrap (S21-A): the clause hash and the
// "is this room's owner entitled to the gate?" lookup. Kept apart from
// ./nda.ts so the client gate component never pulls node:crypto or Supabase.

import "server-only";
import { createHash } from "node:crypto";
import { getEntitlements } from "@/lib/entitlements";
import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveNdaText } from "./nda";

/** Stable hash of the clause actually shown — stored on the acceptance row. */
export function ndaTextHash(text: string | null | undefined): string {
  return createHash("sha256").update(resolveNdaText(text)).digest("hex");
}

/** The plan flag that unlocks NDA + watermark (founder_starter+, migration 0131). */
export const TRUST_FEATURE = "investor_links.premium" as const;

/**
 * Does the ROOM OWNER's plan include the trust features? Read straight from
 * `getEntitlements()` rather than `can()` — `can()` fires a CRO
 * feature_gate_hit for the user it is asked about, and this is asked on an
 * anonymous investor page render, not by the owner.
 */
export async function ownerTrustEntitled(
  ownerUserId: string | null | undefined,
): Promise<boolean> {
  if (!ownerUserId) return false;
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  try {
    const { data } = await supabase
      .from("app_users")
      .select("plan")
      .eq("id", ownerUserId)
      .maybeSingle();
    const plan = (data as { plan?: string | null } | null)?.plan ?? "free";
    const flags = await getEntitlements(plan, ownerUserId);
    return flags.includes(TRUST_FEATURE);
  } catch {
    return false;
  }
}
