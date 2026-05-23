// Coupon routes — validate and redeem coupon codes.
//
// POST /coupon/validate → check if a coupon code is valid
// POST /coupon/redeem   → redeem a coupon (apply discount)

import type { FastifyInstance } from "fastify";
import { getSupabase } from "../lib/supabase.js";
import { grantCredits } from "../lib/credits.js";

export async function couponRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /coupon/validate ────────────────────────────────────────────
  app.post<{
    Body: { code?: string; userId?: string };
  }>("/validate", async (request, reply) => {
    const { code, userId } = request.body ?? {};

    if (!code || typeof code !== "string") {
      return reply.code(400).send({ ok: false, reason: "code is required" });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return reply.code(503).send({ ok: false, reason: "Database not configured" });
    }

    const normalizedCode = code.trim().toUpperCase();

    // Look up the coupon.
    const { data: coupon, error } = await supabase
      .from("coupons")
      .select("id, code, discount_pct, max_uses, current_uses, credits_grant, expires_at")
      .eq("code", normalizedCode)
      .maybeSingle();

    if (error || !coupon) {
      return reply.code(404).send({ ok: false, reason: "Invalid coupon code" });
    }

    // Check expiry.
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return reply.code(410).send({ ok: false, reason: "Coupon has expired" });
    }

    // Check max uses.
    if (coupon.max_uses && (coupon.current_uses ?? 0) >= coupon.max_uses) {
      return reply.code(410).send({ ok: false, reason: "Coupon has reached maximum uses" });
    }

    // Check if user already redeemed.
    if (userId) {
      const { data: existing } = await supabase
        .from("coupon_redemptions")
        .select("id")
        .eq("coupon_id", coupon.id)
        .eq("user_id", userId)
        .maybeSingle();

      if (existing) {
        return reply.code(409).send({ ok: false, reason: "You have already redeemed this coupon" });
      }
    }

    return {
      ok: true,
      coupon: {
        code: coupon.code,
        discount_pct: coupon.discount_pct ?? 0,
        credits_grant: coupon.credits_grant ?? 0,
        expires_at: coupon.expires_at,
      },
    };
  });

  // ── POST /coupon/redeem ──────────────────────────────────────────────
  app.post<{
    Body: { code?: string; userId?: string };
  }>("/redeem", async (request, reply) => {
    const { code, userId } = request.body ?? {};

    if (!code || !userId) {
      return reply.code(400).send({ ok: false, reason: "code and userId are required" });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return reply.code(503).send({ ok: false, reason: "Database not configured" });
    }

    const normalizedCode = code.trim().toUpperCase();

    // Look up the coupon.
    const { data: coupon, error } = await supabase
      .from("coupons")
      .select("id, code, discount_pct, max_uses, current_uses, credits_grant, expires_at")
      .eq("code", normalizedCode)
      .maybeSingle();

    if (error || !coupon) {
      return reply.code(404).send({ ok: false, reason: "Invalid coupon code" });
    }

    // Check expiry.
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return reply.code(410).send({ ok: false, reason: "Coupon has expired" });
    }

    // Check max uses.
    if (coupon.max_uses && (coupon.current_uses ?? 0) >= coupon.max_uses) {
      return reply.code(410).send({ ok: false, reason: "Coupon has reached maximum uses" });
    }

    // Check if user already redeemed.
    const { data: existing } = await supabase
      .from("coupon_redemptions")
      .select("id")
      .eq("coupon_id", coupon.id)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      return reply.code(409).send({ ok: false, reason: "You have already redeemed this coupon" });
    }

    // Record the redemption.
    const { error: redemptionErr } = await supabase
      .from("coupon_redemptions")
      .insert({
        coupon_id: coupon.id,
        user_id: userId,
        redeemed_at: new Date().toISOString(),
      });

    if (redemptionErr) {
      app.log.error(redemptionErr, "Failed to record coupon redemption");
      return reply.code(500).send({ ok: false, reason: "Failed to redeem coupon" });
    }

    // Increment usage count.
    await supabase
      .from("coupons")
      .update({ current_uses: (coupon.current_uses ?? 0) + 1 })
      .eq("id", coupon.id);

    // Grant credits if the coupon provides a credit bonus.
    let creditsGranted = 0;
    if (coupon.credits_grant && coupon.credits_grant > 0) {
      const grantResult = await grantCredits(
        userId,
        coupon.credits_grant,
        "coupon_redemption",
        {
          coupon_code: coupon.code,
          coupon_id: coupon.id,
        },
      );
      if (grantResult.ok) {
        creditsGranted = coupon.credits_grant;
      }
    }

    app.log.info({
      msg: "Coupon redeemed",
      userId,
      couponCode: coupon.code,
      discountPct: coupon.discount_pct,
      creditsGranted,
    });

    return {
      ok: true,
      discount_pct: coupon.discount_pct ?? 0,
      credits_granted: creditsGranted,
    };
  });
}
