// lib/pilots/conversion (G23-B) — the pilot's road to an annual Cohort plan.
// Pins: the SKU → rung map follows PILOT_SKUS.planTier; the annual price is
// the plans-v2 figure; the window is entitlement_until + 60 days (live
// pilots may convert early; refunded / converted orders never); the coupon
// is read by env NAME only and never leaks; recordPilotConversion is
// idempotent on the row and rejects non-Cohort plans / bad ids.

import { afterEach, describe, expect, it } from "vitest";
import { PLANS_V2, formatAud } from "@/lib/plans-v2";
import { PILOT_SKUS } from "@/lib/pricing/pilot-skus";
import {
  PILOT_CONVERSION_WINDOW_DAYS,
  PILOT_COUPON_ENV,
  PILOT_CREDIT_RULE,
  conversionOffer,
  conversionPlanForSku,
  conversionWindowEnd,
  createFakePilotConversionDb,
  isPilotCouponConfigured,
  readPilotCouponId,
  recordPilotConversion,
  supabasePilotConversionDb,
  type ConversionOrderLike,
} from "./conversion";

const NOW = new Date("2026-09-21T00:00:00.000Z");
const ORDER: ConversionOrderLike = { id: "3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b", user_id: "u-1", sku: "cohort_pilot_25", status: "paid", entitlement_until: "2026-12-19T00:00:00.000Z" };

afterEach(() => {
  delete process.env.STRIPE_COUPON_PILOT_CREDIT_25;
  delete process.env.STRIPE_COUPON_PILOT_CREDIT_50;
});

describe("conversionOffer", () => {
  it("maps 25 → Cohort 25 annual and 50 → Cohort 100 annual with the plans-v2 annual price and the pilot fee from PILOT_SKUS", () => {
    const starter = PLANS_V2.find((p) => p.id === "accelerator_starter")!;
    const growth = PLANS_V2.find((p) => p.id === "accelerator_growth")!;
    const a = conversionOffer(ORDER, NOW, {})!;
    expect(a.plan).toBe(conversionPlanForSku("cohort_pilot_25"));
    expect(a.plan).toBe(PILOT_SKUS.cohort_pilot_25.planTier);
    expect(a).toMatchObject({ planName: starter.name, annualAud: starter.annual_aud, annualPriceLabel: formatAud(starter.annual_aud), annualPriceLongLabel: `${formatAud(starter.annual_aud)} inc. GST`, pilotFeeCents: PILOT_SKUS.cohort_pilot_25.amountInclGstCents, couponEnv: "STRIPE_COUPON_PILOT_CREDIT_25", configured: false, eligible: true, reason: "ok", contactHref: "/contact?topic=pilot" });
    const b = conversionOffer({ ...ORDER, sku: "cohort_pilot_50" }, NOW, {})!;
    expect(b).toMatchObject({ plan: "accelerator_growth", planName: growth.name, annualAud: growth.annual_aud, pilotFeeCents: PILOT_SKUS.cohort_pilot_50.amountInclGstCents, couponEnv: "STRIPE_COUPON_PILOT_CREDIT_50" });
    expect(a.creditRule).toBe(PILOT_CREDIT_RULE);
    expect(PILOT_CREDIT_RULE).toContain(`${PILOT_CONVERSION_WINDOW_DAYS} days`);
    expect(conversionOffer({ ...ORDER, sku: "not_a_pilot" }, NOW, {})).toBeNull();
  });

  it("eligible while paid + unconverted + now ≤ entitlement_until + 60 d; closed after; never for refunded / converted", () => {
    expect(conversionWindowEnd("2026-12-19T00:00:00.000Z")).toBe("2027-02-17T00:00:00.000Z");
    expect(conversionOffer(ORDER, new Date("2027-02-17T00:00:00.000Z"), {})!.eligible).toBe(true);
    const late = conversionOffer(ORDER, new Date("2027-02-17T00:00:01.000Z"), {})!;
    expect(late).toMatchObject({ eligible: false, reason: "window_closed", windowEndsAt: "2027-02-17T00:00:00.000Z" });
    expect(conversionOffer({ ...ORDER, status: "refunded" }, NOW, {})).toMatchObject({ eligible: false, reason: "not_paid" });
    expect(conversionOffer({ ...ORDER, converted_at: "2026-10-01T00:00:00.000Z" }, NOW, {})).toMatchObject({ eligible: false, reason: "already_converted" });
  });

  it("coupon: configured is a boolean read by env NAME; the id is only returned by the server-only reader; the offer never carries the value", () => {
    expect(PILOT_COUPON_ENV).toEqual({ cohort_pilot_25: "STRIPE_COUPON_PILOT_CREDIT_25", cohort_pilot_50: "STRIPE_COUPON_PILOT_CREDIT_50" });
    expect(isPilotCouponConfigured("cohort_pilot_25", {})).toBe(false);
    expect(isPilotCouponConfigured("cohort_pilot_25", { STRIPE_COUPON_PILOT_CREDIT_25: "  " })).toBe(false);
    expect(isPilotCouponConfigured("cohort_pilot_25", { STRIPE_COUPON_PILOT_CREDIT_25: "cpn_x" })).toBe(true);
    expect(isPilotCouponConfigured("cohort_pilot_25", undefined)).toBe(false);
    expect(readPilotCouponId("cohort_pilot_50", { STRIPE_COUPON_PILOT_CREDIT_50: " cpn_y " })).toBe("cpn_y");
    expect(readPilotCouponId("cohort_pilot_50", {})).toBeNull();
    process.env.STRIPE_COUPON_PILOT_CREDIT_25 = "cpn_live";
    const offer = conversionOffer(ORDER, NOW)!;
    expect(offer.configured).toBe(true);
    expect(JSON.stringify(offer)).not.toContain("cpn_live");
  });
});

describe("recordPilotConversion", () => {
  it("stamps converted_at / converted_plan / subscription once; a redelivery reads already: true; bad input is skipped", async () => {
    const db = createFakePilotConversionDb([{ ...ORDER }]);
    const md = { pilot_order_id: ORDER.id, plan_id: "accelerator_starter", user_id: "u-1" };
    const first = await recordPilotConversion({ metadata: md, subscriptionId: "sub_1", planId: "accelerator_starter" }, db, NOW);
    expect(first).toMatchObject({ ok: true, already: false, order_id: ORDER.id, plan: "accelerator_starter", user_id: "u-1", sku: "cohort_pilot_25" });
    expect(db.rows[0]).toMatchObject({ converted_at: NOW.toISOString(), converted_plan: "accelerator_starter", converted_subscription_id: "sub_1" });
    const again = await recordPilotConversion({ metadata: md, subscriptionId: "sub_1", planId: null }, db, new Date("2026-09-22T00:00:00.000Z"));
    expect(again).toMatchObject({ ok: true, already: true });
    expect(db.rows[0]!.converted_at).toBe(NOW.toISOString());

    expect(await recordPilotConversion({ metadata: {}, subscriptionId: null, planId: "accelerator_starter" }, db)).toMatchObject({ ok: false, skipped: "not_a_conversion" });
    expect(await recordPilotConversion({ metadata: { pilot_order_id: "nope" }, subscriptionId: null, planId: "accelerator_starter" }, db)).toMatchObject({ ok: false, skipped: "bad_metadata" });
    expect(await recordPilotConversion({ metadata: { pilot_order_id: ORDER.id }, subscriptionId: null, planId: "investor_angel" }, db)).toMatchObject({ ok: false, skipped: "bad_metadata" });
    expect(await recordPilotConversion({ metadata: md, subscriptionId: null, planId: "accelerator_starter" }, null)).toMatchObject({ ok: false, skipped: "no_db" });
  });

  it("supabasePilotConversionDb issues one guarded update (converted_at IS NULL) and maps no-row → already", async () => {
    const calls: Array<{ table: string; row: Record<string, unknown>; eq: unknown[]; is: unknown[]; select: string }> = [];
    let data: unknown = { id: ORDER.id, user_id: "u-1", sku: "cohort_pilot_25" };
    const client = {
      from(table: string) {
        return {
          update(row: Record<string, unknown>) {
            const call = { table, row, eq: [] as unknown[], is: [] as unknown[], select: "" };
            calls.push(call);
            return {
              eq(col: string, v: unknown) {
                call.eq = [col, v];
                return {
                  is(col2: string, v2: null) {
                    call.is = [col2, v2];
                    return { select(cols: string) { call.select = cols; return { async maybeSingle() { return { data, error: null }; } }; } };
                  },
                };
              },
            };
          },
        };
      },
    };
    const db = supabasePilotConversionDb(client);
    const r = await db.markConverted(ORDER.id, "accelerator_growth", "sub_9", NOW.toISOString());
    expect(r).toMatchObject({ ok: true, already: false, user_id: "u-1", sku: "cohort_pilot_25" });
    expect(calls[0]).toMatchObject({ table: "pilot_orders", eq: ["id", ORDER.id], is: ["converted_at", null], select: "id, user_id, sku" });
    expect(calls[0]!.row).toMatchObject({ converted_at: NOW.toISOString(), converted_plan: "accelerator_growth", converted_subscription_id: "sub_9" });
    data = null;
    expect(await db.markConverted(ORDER.id, "accelerator_growth", null, NOW.toISOString())).toMatchObject({ ok: true, already: true });
  });
});
