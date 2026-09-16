// Client-safe enums for the AU comparables review UI (S-R5). Kept apart
// from comparables-admin.ts / comparables-repo.ts so the "use client"
// review page never pulls the lazy Supabase import into its bundle.

import type { AUStage } from "@/lib/data/au-comparables";

export const AU_STAGE_VALUES: readonly AUStage[] = ["pre-seed", "seed", "series-a", "series-b", "series-c", "growth", "unicorn"];
export const SECTOR_VALUES: readonly string[] = ["SaaS", "FinTech", "HealthTech", "PropTech", "AgriTech", "EdTech", "MarketPlace", "DeepTech", "CleanTech", "eCommerce", "Unclassified"];
