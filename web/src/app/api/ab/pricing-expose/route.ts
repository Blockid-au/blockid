// POST /api/ab/pricing-expose — log an exposure event for the founding-price A/B test.
//
// Called from /founding-50 page (client-side) on first paint. Server-side
// resolves the variant via getFoundingPriceVariant() so the same anon_id
// always gets the same variant.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { FOUNDING_PRICE_EXPERIMENT, getFoundingPriceVariant, logAbEvent } from "@/lib/ab-pricing";

export const dynamic = "force-dynamic";

const ANON_COOKIE = "blockid_anonid";

export async function POST() {
  const store = await cookies();
  let anonId = store.get(ANON_COOKIE)?.value;
  let cookieSet = false;
  if (!anonId) {
    anonId = `anon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    store.set(ANON_COOKIE, anonId, {
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      httpOnly: false,
      path: "/",
    });
    cookieSet = true;
  }

  const variant = await getFoundingPriceVariant({ identityOverride: anonId });
  const identityHash = createHash("sha256").update(`${ANON_COOKIE}:${anonId}`).digest("hex").slice(0, 24);

  // Fire-and-forget; never block the request on Supabase
  void logAbEvent({
    experimentId: FOUNDING_PRICE_EXPERIMENT.id,
    variantId: variant.id,
    eventType: "exposure",
    identityHash,
  });

  return NextResponse.json({
    ok: true,
    variant: {
      id: variant.id,
      priceAud: variant.priceAud,
      priceCents: variant.priceCents,
      label: variant.label,
    },
    cookieSet,
  });
}
