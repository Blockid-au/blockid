import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ retrieve: vi.fn(), list: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/stripe", () => ({ getStripe: () => ({ checkout: { sessions: { retrieve: m.retrieve, listLineItems: m.list } } }) }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ rpc: m.rpc }) }));
import { fulfillCreditCheckout, guardLegacyCreditPackGrant, recordCreditCheckout } from "./credit-fulfillment";
const session = () => ({ id: "cs_fixture", livemode: false, mode: "payment", status: "complete", payment_status: "paid", currency: "aud", metadata: { type: "credit_purchase", credit_receipt_version: "1", blockid_user_id: "user", blockid_credits: "5" }, amount_subtotal: 500, amount_total: 500, total_details: { amount_tax: 45, amount_discount: 0, amount_shipping: 0 }, automatic_tax: { status: "complete" }, customer_details: { address: { country: "AU" } }, payment_intent: "pi_fixture" });
beforeEach(() => {
 vi.stubEnv("G30_CREDIT_RECEIPTS", "");
 vi.stubEnv("G30_CREDIT_PURCHASES_PAUSED", "");
 vi.clearAllMocks(); m.retrieve.mockResolvedValue(session());
 m.list.mockResolvedValue({ has_more: false, data: [{ quantity: 1, amount_subtotal: 500, price: { id: "price_fixture", type: "one_time", currency: "aud", unit_amount: 500 } }] });
 m.rpc.mockResolvedValue({ data: { outcome: "completed", operation_id: "receipt", ledger_id: "ledger", balance_after: 5 }, error: null });
});
it("uses stable session, authoritative money and recorded-order RPC", async () => {
 await fulfillCreditCheckout("cs_fixture");
 expect(m.rpc).toHaveBeenCalledWith("fulfill_credit_checkout", expect.objectContaining({ p_session: "cs_fixture", p_gross: 500, p_tax: 45, p_price: "price_fixture" }));
});
it("unpaid completion cannot grant", async () => {
 m.retrieve.mockResolvedValue({ ...session(), payment_status: "unpaid" });
 expect(await fulfillCreditCheckout("cs_fixture")).toEqual({ outcome: "awaiting_payment" }); expect(m.rpc).not.toHaveBeenCalled();
});
it("historical session requires review, never inferred missing grant", async () => {
 m.retrieve.mockResolvedValue({ ...session(), metadata: { type: "credit_purchase" } });
 await expect(fulfillCreditCheckout("cs_fixture")).rejects.toThrow("legacy_checkout"); expect(m.rpc).not.toHaveBeenCalled();
});
it("ambiguous RPC outcome throws without fallback; retry retains identity", async () => {
 m.rpc.mockResolvedValueOnce({ error: { message: "timeout" }, data: null });
 await expect(fulfillCreditCheckout("cs_fixture")).rejects.toThrow("not_committed");
 await fulfillCreditCheckout("cs_fixture"); expect(m.rpc.mock.calls[0]).toEqual(m.rpc.mock.calls[1]);
});
it("rejects extra line items", async () => {
 m.list.mockResolvedValue({ has_more: true, data: [] });
 await expect(fulfillCreditCheckout("cs_fixture")).rejects.toThrow("economics"); expect(m.rpc).not.toHaveBeenCalled();
});

it("marked purchase bypasses legacy grant even with creation OFF", async () => {
 expect(await guardLegacyCreditPackGrant("user", 5, "cs_fixture")).toEqual({ ok: true, balance: 5 });
 expect(m.rpc).toHaveBeenCalledTimes(1);
});
it("ambiguous marked purchase cannot authorize legacy mutation", async () => {
 m.rpc.mockResolvedValue({ error: { message: "lost response" }, data: null });
 await expect(guardLegacyCreditPackGrant("user", 5, "cs_fixture")).rejects.toThrow("not_committed");
});
it("other account cannot redirect the receipt through a legacy caller", async () => {
 await expect(guardLegacyCreditPackGrant("other", 5, "cs_fixture")).rejects.toThrow("identity");
 expect(m.rpc).not.toHaveBeenCalled();
});
it("legacy historical purchase cannot use unkeyed grant after cutover", async () => {
 vi.stubEnv("G30_CREDIT_RECEIPTS", "1");
 const s=session(); delete (s.metadata as Record<string,string>).credit_receipt_version;
 m.retrieve.mockResolvedValue(s);
 await expect(guardLegacyCreditPackGrant("user", 5, "cs_fixture")).rejects.toThrow("legacy_checkout");
 expect(m.rpc).not.toHaveBeenCalled();
});

it("staged purchase pause makes no Stripe or database calls", async () => {
 vi.stubEnv("G30_CREDIT_PURCHASES_PAUSED", "1");
 await expect(guardLegacyCreditPackGrant("user",5,"cs_fixture")).rejects.toThrow("paused");
 await expect(fulfillCreditCheckout("cs_fixture")).rejects.toThrow("paused");
 await expect(recordCreditCheckout(session() as never,"user","price_fixture",5,500)).rejects.toThrow("paused");
 expect(m.retrieve).not.toHaveBeenCalled(); expect(m.rpc).not.toHaveBeenCalled();
});

it("checkout recording uses the exact receipt RPC and refuses unmarked sessions",async()=>{
 await recordCreditCheckout(session() as never,"user","price_fixture",5,500);
 expect(m.rpc).toHaveBeenCalledWith("record_credit_checkout",expect.objectContaining({p_session:"cs_fixture",p_user:"user",p_price:"price_fixture",p_credits:5,p_subtotal:500}));
 m.rpc.mockClear();const legacy=session();delete (legacy.metadata as Record<string,string>).credit_receipt_version;
 await expect(recordCreditCheckout(legacy as never,"user","price_fixture",5,500)).rejects.toThrow("legacy_checkout");expect(m.rpc).not.toHaveBeenCalled();
});
