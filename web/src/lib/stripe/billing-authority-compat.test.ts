import { afterEach, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({db:vi.fn(()=>({from:vi.fn(()=>{throw Error("unexpected DB mutation");})})),event:{id:"evt_purchase",type:"checkout.session.completed",data:{object:{metadata:{type:"credit_purchase"}}}}}));
vi.mock("../../../../services/billing/src/lib/supabase.js",()=>({getSupabase:state.db}));
vi.mock("../../../../services/billing/src/lib/stripe.js",()=>({getStripe:()=>({webhooks:{constructEvent:()=>state.event}}),isStripeConfigured:()=>true,STRIPE_PRICE_MAP:{}}));
import { grantCredits } from "../../../../services/billing/src/lib/credits";
import { webhookRoutes } from "../../../../services/billing/src/routes/webhook";
afterEach(()=>vi.unstubAllEnvs());
it("remote billing refuses credit-pack grants before touching the database",async()=>{
 state.db.mockClear();await expect(grantCredits("user",25,"credit_pack_purchase")).rejects.toThrow("web_authority");expect(state.db).not.toHaveBeenCalled();
});
it("remote billing refuses repeated purchase webhooks before event-cache ACK",async()=>{
 vi.stubEnv("STRIPE_WEBHOOK_SECRET","fixture");
 let handler:(request:unknown,reply:unknown)=>Promise<unknown>;
 await webhookRoutes({addContentTypeParser:vi.fn(),post:(_path:string,fn:typeof handler)=>{handler=fn;},log:{error:vi.fn(),info:vi.fn()}} as never);
 for(let n=0;n<2;n++){
  const reply={code:vi.fn(),send:vi.fn()};reply.code.mockReturnValue(reply);
  await handler!({headers:{"stripe-signature":"fixture"},rawBody:Buffer.from("{}")},reply);
  expect(reply.code).toHaveBeenCalledWith(503);expect(reply.send).toHaveBeenCalledWith({error:"credit_purchase_requires_web_authority"});
 }
});
