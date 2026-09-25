import { expect, it, vi } from "vitest";
import { mkdtemp, chmod, mkdir, readFile, writeFile, rm, symlink, link, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createResearchAttemptBudget, type ResearchBudgetContext, type ResearchBudgetAuthorization } from "./research-attempt-coordinator";
import { reserveResearchAttempt, settleResearchAttempt, type AttemptRequest } from "./research-attempt-budget";
const time=Date.parse("2026-09-22T12:00:00Z"),model="synthetic/model";
const hash=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
const payload=(n=0)=>JSON.stringify({model,messages:[{role:"user",content:`private synthetic input ${n}`}],max_tokens:20});
const context=(n=0):ResearchBudgetContext=>({accountId:"synthetic-account",jobId:"job",callId:`job/synthesis/batch-${n}`,originalMonth:"2026-09",grantId:`grant-${n}`});
const request=(c=context(),n=0):AttemptRequest=>{const payloadSha256=createHash("sha256").update(payload(n)).digest("hex");return {attemptId:createHash("sha256").update(JSON.stringify(["research-attempt-v1",c.callId,"deepinfra",model,payloadSha256])).digest("hex"),provider:"deepinfra",model,payloadSha256,promptBytes:Buffer.byteLength(payload(n)),maximumOutputTokens:20};};
function authorization(c=context(),r=request(c)):ResearchBudgetAuthorization {
 return {grant:{scope:c,approved:true,expiresAt:time+60000,pricePolicyId:"certified-test-policy",limits:{month:{costMicroUsd:4000,attempts:2},job:{costMicroUsd:4000,attempts:2},call:{costMicroUsd:4000,attempts:2}},externalUsage:{month:{costMicroUsd:0,attempts:0},job:{costMicroUsd:0,attempts:0},call:{costMicroUsd:0,attempts:0}},allowedAttempts:[{model:r.model,payloadSha256:r.payloadSha256,promptBytes:r.promptBytes,maximumOutputTokens:r.maximumOutputTokens}]},pricePolicy:{id:"certified-test-policy",approved:true,observedAt:time-1000,expiresAt:time+60000,models:[{model,inputNanoUsdPerToken:1000,outputNanoUsdPerToken:2000,contextTokens:1000,providerMaxOutputTokens:500,completeUsageAccountingCertified:true}]}};
}
const file=(dir:string)=>join(dir,"2026-09.json");
async function seed(dir:string){await writeFile(file(dir),JSON.stringify({version:1,account:hash("synthetic-account"),month:"2026-09",entries:[]}),{mode:0o600});}
async function isolated(fn:(dir:string)=>Promise<void>){const dir=await mkdtemp(join(tmpdir(),"research-ledger-test-"));try{await seed(dir);await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}}
const read=async(dir:string)=>JSON.parse(await readFile(file(dir),"utf8"));
function coordinator(dir:string,c=context(),auth=authorization(c),now=()=>time){return createResearchAttemptBudget({directory:dir,context:c,readAuthorization:async()=>auth,assertSettlementAuthorized:async()=>{},now});}
it("reserves real full ceilings through the existing hook and denies durable restart replay",()=>isolated(async dir=>{
 const clock=vi.spyOn(Date,"now").mockReturnValue(time);
 let first;try{first=await reserveResearchAttempt(coordinator(dir),model,payload(),20);}finally{clock.mockRestore();}expect(first.maximumCostMicroUsd).toBe(2000);expect(first.maximumInputTokens).toBe(1000);
 expect((await coordinator(dir).reserve(request())).dispatchAllowed).toBe(false);
 expect((await read(dir)).entries).toHaveLength(1);const serialized=await readFile(file(dir),"utf8");expect(serialized).not.toContain("private synthetic input");expect(serialized).not.toContain("synthetic-account");expect(serialized).not.toContain("job/synthesis");
}));
it.each(["month","job","call"] as const)("adds external %s baseline and enforces cumulative cost without deduction",level=>isolated(async dir=>{
 const c=context(),r=request(c),auth=authorization(c,r);auth.grant.limits[level].costMicroUsd=3000;auth.grant.externalUsage[level].costMicroUsd=1001;
 await expect(coordinator(dir,c,auth).reserve(r)).rejects.toThrow(`${level} budget exhausted`);expect((await read(dir)).entries).toHaveLength(0);
}));
it.each(["month","job","call"] as const)("enforces the %s attempt ceiling even when successful cost is small",level=>isolated(async dir=>{
 const c=context(),r=request(c),other=request(c,1),auth=authorization(c,r);auth.grant.limits[level].attempts=1;auth.grant.allowedAttempts.push({model:other.model,payloadSha256:other.payloadSha256,promptBytes:other.promptBytes,maximumOutputTokens:other.maximumOutputTokens});
 const co=coordinator(dir,c,auth),permit=await co.reserve(r);await settleResearchAttempt(co,permit,{prompt_tokens:1,completion_tokens:1});
 await expect(co.reserve(other)).rejects.toThrow(`${level} budget exhausted`);expect((await read(dir)).entries).toHaveLength(1);
}));
it("unknown or uncertified usage retains full cost; repeated or contradictory settlement cannot reduce it",()=>isolated(async dir=>{
 const co=coordinator(dir),permit=await co.reserve(request());await settleResearchAttempt(co,permit);await settleResearchAttempt(co,permit);
 expect((await read(dir)).entries[0]).toMatchObject({state:"unknown",heldCostMicroUsd:2000});
 await expect(settleResearchAttempt(co,permit,{prompt_tokens:1,completion_tokens:1})).rejects.toThrow("settlement unavailable");expect((await read(dir)).entries[0].heldCostMicroUsd).toBe(2000);
 const c=context(1),auth=authorization(c);auth.pricePolicy.id="uncertified-test";auth.grant.pricePolicyId="uncertified-test";auth.pricePolicy.models[0].completeUsageAccountingCertified=false;
 const second=coordinator(dir,c,auth),p=await second.reserve(request(c));await settleResearchAttempt(second,p,{prompt_tokens:1,completion_tokens:1});expect((await read(dir)).entries[1]).toMatchObject({state:"unknown",heldCostMicroUsd:2000});
}));
it("settles once with original certified prices after month change, not current repricing",()=>isolated(async dir=>{
 const auth=authorization(),co=coordinator(dir,context(),auth),r=request();await co.reserve(r);
 const later=createResearchAttemptBudget({directory:dir,context:context(),readAuthorization:async()=>{throw Error("do not consult changed prices");},assertSettlementAuthorized:async()=>{},now:()=>Date.parse("2026-10-01T00:00:00Z")});
 await later.settle({attemptId:r.attemptId,state:"reported_usage",inputTokens:10,outputTokens:5});await later.settle({attemptId:r.attemptId,state:"reported_usage",inputTokens:10,outputTokens:5});
 expect((await read(dir)).entries[0]).toMatchObject({state:"reported_usage",heldCostMicroUsd:20});
 await expect(later.settle({attemptId:r.attemptId,state:"reported_usage",inputTokens:1,outputTokens:1})).rejects.toThrow("settlement conflict");expect((await read(dir)).entries[0].heldCostMicroUsd).toBe(2000);
 await expect(later.reserve(r)).rejects.toThrow("original month mismatch");
}));
it("out-of-bound or zero usage retains maximum rather than granting a false refund",()=>isolated(async dir=>{
 const co=coordinator(dir),r=request();await co.reserve(r);await co.settle({attemptId:r.attemptId,state:"reported_usage",inputTokens:2000,outputTokens:1});expect((await read(dir)).entries[0]).toMatchObject({state:"unknown",heldCostMicroUsd:2000});
 const c=context(1),second=coordinator(dir,c),r2=request(c);await second.reserve(r2);await second.settle({attemptId:r2.attemptId,state:"reported_usage",inputTokens:0,outputTokens:0});expect((await read(dir)).entries[1].heldCostMicroUsd).toBe(2000);
}));
it("binds context, exact payload, stable attempt id, immutable grant and policy",()=>isolated(async dir=>{
 const auth=authorization(),r=request();await coordinator(dir,context(),auth).reserve(r);
 await expect(coordinator(dir).reserve({...r,payloadSha256:"a".repeat(64)})).rejects.toThrow("attempt identity mismatch");
 const changed=structuredClone(auth);changed.pricePolicy.models[0].inputNanoUsdPerToken=1;await expect(coordinator(dir,context(),changed).reserve(r)).rejects.toThrow("immutable authorization changed");
 const changedGrant=structuredClone(auth);changedGrant.grant.limits.call.costMicroUsd=9000;await expect(coordinator(dir,context(),changedGrant).reserve(r)).rejects.toThrow("immutable authorization changed");
 await expect(coordinator(dir,{...context(),accountId:"other"}).reserve(r)).rejects.toThrow("ledger scope mismatch");
 await expect(coordinator(dir,{...context(),jobId:"other"},auth).reserve(r)).rejects.toThrow("authorization scope");
}));
it("denies unapproved/expired/missing policy and lexical unknown fields with no ledger mutation",()=>isolated(async dir=>{
 for(const change of [(a:ResearchBudgetAuthorization)=>a.pricePolicy.approved=false,(a:ResearchBudgetAuthorization)=>a.grant.approved=false,(a:ResearchBudgetAuthorization)=>Object.assign(a.pricePolicy.models[0],{providerMaxOutputTokens:null}),(a:ResearchBudgetAuthorization)=>a.pricePolicy.expiresAt=time,(a:ResearchBudgetAuthorization)=>a.grant.allowedAttempts=[],(a:ResearchBudgetAuthorization)=>Object.assign(a.grant,{clientConsent:true})]) {
  const auth=authorization();change(auth);await expect(coordinator(dir,context(),auth).reserve(request())).rejects.toThrow();
 }
 expect((await read(dir)).entries).toHaveLength(0);
}));
it("uses BigInt rounding and rejects safe-integer cost overflow",()=>isolated(async dir=>{
 const auth=authorization();auth.pricePolicy.models[0]={model,inputNanoUsdPerToken:37,outputNanoUsdPerToken:170,contextTokens:131072,providerMaxOutputTokens:131072,completeUsageAccountingCertified:false};for(const v of Object.values(auth.grant.limits))v.costMicroUsd=1_000_000;
 expect((await coordinator(dir,context(),auth).reserve(request())).maximumCostMicroUsd).toBe(27132);
 const c={...context(1),jobId:"overflow-job"},tooBig=authorization(c);tooBig.pricePolicy.id="overflow";tooBig.grant.pricePolicyId="overflow";tooBig.pricePolicy.models[0].inputNanoUsdPerToken=Number.MAX_SAFE_INTEGER;tooBig.pricePolicy.models[0].contextTokens=Number.MAX_SAFE_INTEGER;
 await expect(coordinator(dir,c,tooBig).reserve(request(c))).rejects.toThrow("cost overflow");
}));
it("does not initialize a missing ledger or replace corrupt state",()=>isolated(async dir=>{
 await unlink(file(dir));await expect(coordinator(dir).reserve(request())).rejects.toThrow();await expect(readFile(file(dir))).rejects.toThrow();
 for(const content of ["{",JSON.stringify({version:1,account:hash("synthetic-account"),month:"2026-09",entries:[{}]})]) {await writeFile(file(dir),content,{mode:0o600});await expect(coordinator(dir).reserve(request())).rejects.toThrow();expect(await readFile(file(dir),"utf8")).toBe(content);}
}));
it("rejects symlink/hardlink/shared file or directory and never steals a crashed lock",()=>isolated(async dir=>{
 await chmod(file(dir),0o644);await expect(coordinator(dir).reserve(request())).rejects.toThrow("unsafe ledger file");await chmod(file(dir),0o600);
 const other=join(dir,"other.json");await link(file(dir),other);await expect(coordinator(dir).reserve(request())).rejects.toThrow("unsafe ledger file");await unlink(other);
 await renameForTest();
 async function renameForTest(){const raw=await readFile(file(dir));await unlink(file(dir));await writeFile(other,raw,{mode:0o600});await symlink(other,file(dir));await expect(coordinator(dir).reserve(request())).rejects.toThrow();await unlink(file(dir));await seed(dir);}
 await chmod(dir,0o755);await expect(coordinator(dir).reserve(request())).rejects.toThrow("unsafe ledger directory");await chmod(dir,0o700);
 await mkdir(join(dir,".research-attempt-lock"),{mode:0o700});await expect(coordinator(dir).reserve(request())).rejects.toThrow("lock requires recovery");
}));
it("serializes independent processes sharing the month ledger and denies restart replay",()=>isolated(async dir=>{
 const modulePath=join(process.cwd(),"src/lib/ai/research-attempt-coordinator.ts"),script=join(dir,"worker.ts"),hook=join(dir,"server-only-hook.cjs");
 await writeFile(hook,'const M=require("node:module");const load=M._load;M._load=function(id,...args){if(id==="server-only")return {};return load.call(this,id,...args)};');
 await writeFile(script,`import {createResearchAttemptBudget} from ${JSON.stringify(modulePath)};const c=JSON.parse(process.argv[2]),r=JSON.parse(process.argv[3]),a=JSON.parse(process.argv[4]);createResearchAttemptBudget({directory:process.argv[5],context:c,readAuthorization:async()=>a,assertSettlementAuthorized:async()=>{},now:()=>${time}}).reserve(r).then(p=>console.log(JSON.stringify(p))).catch(()=>console.log(JSON.stringify({dispatchAllowed:false})));`);
 const run=async(n:number)=>{const c=context(n),r=request(c);return JSON.parse((await promisify(execFile)(process.execPath,["--require",hook,join(process.cwd(),"node_modules/tsx/dist/cli.mjs"),script,JSON.stringify(c),JSON.stringify(r),JSON.stringify(authorization(c,r)),dir],{env:{...process.env,NODE_OPTIONS:`--require=${hook}`}})).stdout);};
 const results=await Promise.all(Array.from({length:6},(_,n)=>run(n)));expect(results.filter(r=>r.dispatchAllowed)).toHaveLength(2);expect((await read(dir)).entries).toHaveLength(2);expect((await run(results.findIndex(r=>r.dispatchAllowed))).dispatchAllowed).toBe(false);
}),20000);
it("losing the reserve response still leaves a counted hold and restart cannot dispatch",()=>isolated(async dir=>{
 await expect((async()=>{await coordinator(dir).reserve(request());throw Error("synthetic response lost");})()).rejects.toThrow("response lost");
 expect((await read(dir)).entries[0]).toMatchObject({state:"reserved",heldCostMicroUsd:2000});expect((await coordinator(dir).reserve(request())).dispatchAllowed).toBe(false);
}));
it("rechecks original month after slow authorization and denies unauthorized settlement",()=>isolated(async dir=>{
 let current=time;
 const crossing=createResearchAttemptBudget({directory:dir,context:context(),readAuthorization:async()=>{current=Date.parse("2026-10-01T00:00:00Z");return authorization();},assertSettlementAuthorized:async()=>{},now:()=>current});
 await expect(crossing.reserve(request())).rejects.toThrow("authorization scope or expiry mismatch");expect((await read(dir)).entries).toHaveLength(0);
 await coordinator(dir).reserve(request());const denied=createResearchAttemptBudget({directory:dir,context:context(),readAuthorization:async()=>authorization(),assertSettlementAuthorized:async()=>{throw Error("revoked accounting worker");},now:()=>time});
 await expect(denied.settle({attemptId:request().attemptId,state:"reported_usage",inputTokens:1,outputTokens:1})).rejects.toThrow();expect((await read(dir)).entries[0]).toMatchObject({state:"reserved",heldCostMicroUsd:2000});
}));

it("conflicting lower usage restores full durable hold, prevents future reduction and blocks another reservation",()=>isolated(async dir=>{
 const auth=authorization();auth.grant.limits.month.costMicroUsd=3000;
 const co=coordinator(dir,context(),auth),r=request();await co.reserve(r);
 const original={attemptId:r.attemptId,state:"reported_usage" as const,inputTokens:10,outputTokens:5};
 await co.settle(original);expect((await read(dir)).entries[0].heldCostMicroUsd).toBe(20);
 const conflict={...original,inputTokens:1,outputTokens:1};
 await expect(co.settle(conflict)).rejects.toThrow("full hold restored");
 const entry=(await read(dir)).entries[0];expect(entry).toMatchObject({state:"unknown",heldCostMicroUsd:2000,inputTokens:null,outputTokens:null,settlement:hash(original),conflictSettlement:hash(conflict)});
 for(const receipt of [original,conflict,{attemptId:r.attemptId,state:"unknown" as const}])await expect(coordinator(dir,context(),auth).settle(receipt)).rejects.toThrow("reconciliation required");
 expect((await read(dir)).entries[0].heldCostMicroUsd).toBe(2000);
 const c=context(1),next=authorization(c);next.grant.limits.month.costMicroUsd=3000;
 await expect(coordinator(dir,c,next).reserve(request(c))).rejects.toThrow("month budget exhausted");expect((await read(dir)).entries).toHaveLength(1);
}));
it("changing grants cannot widen a durable call ceiling or reuse its identity under another job",()=>isolated(async dir=>{
 await coordinator(dir).reserve(request());
 for(const change of [(c:ResearchBudgetContext,a:ResearchBudgetAuthorization)=>{a.grant.limits.call.costMicroUsd=5000;},(c:ResearchBudgetContext,a:ResearchBudgetAuthorization)=>{c.jobId="different-job";a.grant.scope.jobId=c.jobId;}]) {
  const c={...context(),grantId:"new-grant"},r=request(c,1),auth=authorization(c,r);change(c,auth);
  await expect(coordinator(dir,c,auth).reserve(r)).rejects.toThrow("immutable authorization changed");
 }
 expect((await read(dir)).entries).toHaveLength(1);
}));
it("failed restoration write preserves the recovery lock instead of admitting against a possibly low hold",()=>isolated(async dir=>{
 const co=coordinator(dir),r=request();await co.reserve(r);await co.settle({attemptId:r.attemptId,state:"reported_usage",inputTokens:10,outputTokens:5});
 // Simulate a real filesystem failure during commit after the protected read.
 // This deliberately corrupts only our synthetic temporary ledger path.
 const broken=createResearchAttemptBudget({directory:dir,context:context(),readAuthorization:async()=>authorization(),assertSettlementAuthorized:async()=>{await unlink(file(dir));await mkdir(file(dir));},now:()=>time});
 await expect(broken.settle({attemptId:r.attemptId,state:"reported_usage",inputTokens:1,outputTokens:1})).rejects.toThrow("ledger or authority unavailable");
 await expect(coordinator(dir).reserve(r)).rejects.toThrow("lock requires recovery");
}));
