// Server side of the comparables repo: registers the Supabase loader for the
// verified view and re-exports `primeComparables`. Server callers import THIS
// module; client-safe code imports `./comparables-repo` (pure + sync readers).
import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { COMPARABLES_VERIFIED_VIEW, primeComparables, registerComparablesLoader, type ComparableRaiseRow } from "./comparables-repo";

registerComparablesLoader(async () => {
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb.from(COMPARABLES_VERIFIED_VIEW).select("*").order("round_date", { ascending: false }).limit(5000);
  if (error) {
    console.warn("[comparables-repo] load failed:", error.message);
    return null;
  }
  return (data ?? []) as ComparableRaiseRow[];
});

export { primeComparables };
export * from "./comparables-repo";
