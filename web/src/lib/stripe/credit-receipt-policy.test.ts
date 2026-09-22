import { afterEach, expect, it, vi } from "vitest";
import { creditReceiptCapabilities, creditReceiptsEnabled, creditPurchasesPaused } from "./credit-receipt-policy";
afterEach(()=>vi.unstubAllEnvs());
it("defaults keep creation and pause off and do not invent database/atomic erasure proof",()=>{
 vi.stubEnv("G30_CREDIT_RECEIPTS",undefined);vi.stubEnv("G30_CREDIT_PURCHASES_PAUSED",undefined);
 expect(creditReceiptsEnabled()).toBe(false);expect(creditPurchasesPaused()).toBe(false);
 const status=creditReceiptCapabilities();expect(status.creation_enabled).toBe(false);expect(status.purchases_paused).toBe(false);
 expect(status.capabilities).toContain("marked_purchase_receipt_when_creation_off");
 expect(status.capabilities).not.toContain("erased_account_no_new_grant");
 expect(status.database_activation_verified).toBe(false);
});
it("pause independently proves no new purchase grant without pretending SQL is installed",()=>{
 vi.stubEnv("G30_CREDIT_RECEIPTS","0");vi.stubEnv("G30_CREDIT_PURCHASES_PAUSED","1");
 expect(creditReceiptCapabilities()).toMatchObject({creation_enabled:false,purchases_paused:true,database_activation_verified:false,erased_account_refusal:{verified:true,mechanism:"all_purchase_paths_paused"}});
 expect(creditReceiptCapabilities().capabilities).toContain("erased_account_no_new_grant");
});
it("creation enabled is not proof of schema or atomic erased-account closure",()=>{
 vi.stubEnv("G30_CREDIT_RECEIPTS","1");vi.stubEnv("G30_CREDIT_PURCHASES_PAUSED","false");
 expect(creditReceiptCapabilities()).toMatchObject({creation_enabled:true,purchases_paused:false,erased_account_refusal:{verified:false}});
 expect(creditReceiptCapabilities().process_uptime_seconds).toBeGreaterThanOrEqual(0);
});
