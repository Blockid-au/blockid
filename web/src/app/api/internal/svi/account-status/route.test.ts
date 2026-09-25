import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ row: null as Record<string, unknown> | null, error: null as unknown, configured: true, reads: 0 }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => state.configured ? { from: (table: string) => {
  expect(table).toBe("app_users"); state.reads++;
  const chain = { select: (fields: string) => { expect(fields).toBe("id, deleted_at, erased_at"); return chain; }, eq: (col: string, uid: string) => { expect(col).toBe("id"); expect(uid).toBe(UID); return chain; }, abortSignal: () => chain, maybeSingle: async () => ({data:state.row,error:state.error}) }; return chain;
} } : null }));
import { POST } from "./route";
import { ACCOUNT_STATUS_PATH, accountStatusMac, REQUEST_DOMAIN, RESPONSE_DOMAIN, readAccountStatusBody, verifyAccountStatusRequest } from "@/lib/security/svi-account-status";
const UID="12345678-1234-1234-1234-123456789abc", KEY="test-only-key-".repeat(4);
const body=()=>({v:1,uid:UID,iat:Math.floor(Date.now()/1000),nonce:"a".repeat(32)});
function request(value:unknown=body(), signature?:string, path=ACCOUNT_STATUS_PATH) { const raw=typeof value==="string"?value:JSON.stringify(value); return new Request(`https://blockid.au${path}`, {method:"POST",headers:{"content-type":"application/json","x-svi-signature":signature??accountStatusMac(KEY,REQUEST_DOMAIN,raw)},body:raw}); }
beforeEach(()=>{vi.stubEnv("SVI_HANDOFF_SECRET",KEY);state.row={id:UID,deleted_at:null,erased_at:null};state.error=null;state.configured=true;state.reads=0;});
describe("SVI account authority",()=>{
 it("bounds chunked streams without trusting Content-Length",async()=>{
   const stream = new ReadableStream<Uint8Array>({start(c){c.enqueue(new Uint8Array(300));c.enqueue(new Uint8Array(300));c.close();}});
   const req=new Request("https://blockid.au",{method:"POST",body:stream,duplex:"half"} as RequestInit);
   await expect(readAccountStatusBody(req)).rejects.toThrow("invalid_body");
 });
 it("cancels stalled body reads within two seconds",async()=>{
   vi.useFakeTimers();let cancelled=false;
   try { const stream=new ReadableStream<Uint8Array>({cancel(){cancelled=true;}});const req=new Request("https://blockid.au",{method:"POST",body:stream,duplex:"half"} as RequestInit);
     const result=expect(readAccountStatusBody(req)).rejects.toThrow("body_timeout");await vi.advanceTimersByTimeAsync(2001);await result;expect(cancelled).toBe(true);
   } finally {vi.useRealTimers();}
 });
 it("enforces the signed timestamp boundary without normalization",()=>{
   const value=body();const raw=JSON.stringify(value);const sig=accountStatusMac(KEY,REQUEST_DOMAIN,raw);
   expect(verifyAccountStatusRequest(raw,sig,KEY,value.iat+30)).not.toBeNull();
   expect(verifyAccountStatusRequest(raw,sig,KEY,value.iat+31)).toBeNull();
   expect(verifyAccountStatusRequest(raw+" ",sig,KEY,value.iat)).toBeNull();
 });

 it("returns minimal nonce-bound signed active result",async()=>{const res=await POST(request());const raw=await res.text();expect(res.status).toBe(200);expect(res.headers.get("cache-control")).toBe("private, no-store");expect(res.headers.get("x-svi-response-signature")).toBe(accountStatusMac(KEY,RESPONSE_DOMAIN,raw));expect(JSON.parse(raw)).toEqual({v:1,uid:UID,nonce:"a".repeat(32),observedAt:expect.any(Number),active:true});});
 it.each([null,{id:UID,deleted_at:"2026-01-01",erased_at:null},{id:UID,deleted_at:null,erased_at:"2026-01-01"}])("denies missing or closed rows",async(row)=>{state.row=row;expect((await (await POST(request())).json()).active).toBe(false);});
 it("permits grace period and PII-only anonymization",async()=>{state.row={...state.row,deletion_requested_at:"2026-01-01",anonymized_at:"2026-01-01"};expect((await (await POST(request())).json()).active).toBe(true);});
 it.each([{uid:"bad"},{iat:0},{iat:Math.floor(Date.now()/1000)+60},{nonce:"b"},{v:2},{extra:true}])("rejects signed invalid shape before DB",async(patch)=>{expect((await POST(request({...body(),...patch}))).status).toBe(401);expect(state.reads).toBe(0);});
 it("rejects tampering, wrong domain, invalid JSON and oversized bodies",async()=>{for(const req of [request(body(),"0".repeat(64)),request(body(),accountStatusMac(KEY,RESPONSE_DOMAIN,JSON.stringify(body()))),request("{"),request("x".repeat(513)),request(body(),undefined,ACCOUNT_STATUS_PATH+"?uid=x")])expect((await POST(req)).status).toBe(401);expect(state.reads).toBe(0);});
 it("fails closed on unavailable DB and incomplete rows",async()=>{state.error={message:"secret database detail"};const res=await POST(request());expect(res.status).toBe(503);expect(await res.text()).not.toContain("secret");state.error=null;state.row={id:UID};expect((await POST(request())).status).toBe(503);state.configured=false;expect((await POST(request())).status).toBe(503);});
 it("fails closed with missing key",async()=>{vi.stubEnv("SVI_HANDOFF_SECRET","");expect((await POST(request())).status).toBe(503);expect(state.reads).toBe(0);});
 it("read-only replay refreshes authority rather than granting durable access",async()=>{const value=body();expect((await(await POST(request(value))).json()).active).toBe(true);state.row=null;expect((await(await POST(request(value))).json()).active).toBe(false);expect(state.reads).toBe(2);});
});
