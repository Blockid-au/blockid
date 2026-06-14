// GET /api/platform-config — public read of safe config fields for client components.
// Does NOT expose admin-only keys. Cached at CDN level.

import { NextResponse } from "next/server";
import { getPlatformConfig } from "@/lib/platform-config";

export const revalidate = 60; // ISR: revalidate every 60s

export async function GET() {
  const cfg = await getPlatformConfig();

  // Only expose fields safe for public consumption
  const publicConfig = {
    founding_plan_name: cfg.founding_plan_name,
    founding_spots_total: cfg.founding_spots_total,
    founding_price_cents: cfg.founding_price_cents,
    founding_credits: cfg.founding_credits,
    founding_plan_active: cfg.founding_plan_active,
    waitlist_mode: cfg.waitlist_mode,
    free_credits_on_signup: cfg.free_credits_on_signup,
    growth_price_monthly_cents: cfg.growth_price_monthly_cents,
    growth_price_yearly_cents: cfg.growth_price_yearly_cents,
    promo_code: cfg.promo_code,
    promo_label: cfg.promo_label,
    early_bird_deadline: cfg.early_bird_deadline,
  };

  return NextResponse.json(publicConfig, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
  });
}
