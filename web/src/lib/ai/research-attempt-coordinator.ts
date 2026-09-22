import "server-only";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rename, rmdir, unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { z } from "zod";
import { ResearchAttemptBudgetError, type AttemptRequest, type AttemptPermit, type ResearchAttemptBudget } from "./research-attempt-budget";

const digest=z.string().regex(/^[a-f0-9]{64}$/);
const integer=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positive=integer.min(1);
const label=z.string().min(1).max(256);
const month=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const scopeSchema=z.object({accountId:label,jobId:label,callId:label,originalMonth:month,grantId:label}).strict();
const limitSchema=z.object({costMicroUsd:positive,attempts:positive}).strict();
const usageSchema=z.object({costMicroUsd:integer,attempts:integer}).strict();
const bindingSchema=z.object({model:label,payloadSha256:digest,promptBytes:positive,maximumOutputTokens:positive}).strict();
const modelSchema=z.object({model:label,inputNanoUsdPerToken:positive,outputNanoUsdPerToken:positive,contextTokens:positive,providerMaxOutputTokens:positive,completeUsageAccountingCertified:z.boolean()}).strict().refine(m=>m.providerMaxOutputTokens<=m.contextTokens);
const policySchema=z.object({id:label,approved:z.literal(true),observedAt:integer,expiresAt:positive,models:z.array(modelSchema).min(1).max(16)}).strict().refine(p=>new Set(p.models.map(m=>m.model)).size===p.models.length);
const grantSchema=z.object({scope:scopeSchema,approved:z.literal(true),expiresAt:positive,pricePolicyId:label,limits:z.object({month:limitSchema,job:limitSchema,call:limitSchema}).strict(),externalUsage:z.object({month:usageSchema,job:usageSchema,call:usageSchema}).strict(),allowedAttempts:z.array(bindingSchema).min(1).max(16)}).strict();
export type ResearchBudgetContext=z.infer<typeof scopeSchema>;
export type ResearchPricePolicy=z.infer<typeof policySchema>;
export type ResearchBudgetGrant=z.infer<typeof grantSchema>;
export interface ResearchBudgetAuthorization {grant:ResearchBudgetGrant;pricePolicy:ResearchPricePolicy}
const requestSchema=bindingSchema.extend({attemptId:digest,provider:z.literal("deepinfra")}).strict();
const settlementSchema=z.discriminatedUnion("state",[
  z.object({attemptId:digest,state:z.literal("unknown")}).strict(),
  z.object({attemptId:digest,state:z.literal("reported_usage"),inputTokens:integer,outputTokens:integer}).strict(),
]);
const entrySchema=z.object({
  id:digest,binding:digest,job:digest,call:digest,grant:digest,grantBinding:digest,jobLimitsBinding:digest,
  model:label,payloadSha256:digest,policy:digest,policyBinding:digest,price:modelSchema,
  promptBytes:positive,requestedOutputTokens:positive,maximumCostMicroUsd:positive,
  heldCostMicroUsd:integer,state:z.enum(["reserved","unknown","reported_usage"]),
  settlement:digest.nullable(),inputTokens:integer.nullable(),outputTokens:integer.nullable(),
}).strict();
const ledgerSchema=z.object({version:z.literal(1),account:digest,month,entries:z.array(entrySchema).max(5000)}).strict();
type Entry=z.infer<typeof entrySchema>;
type Ledger=z.infer<typeof ledgerSchema>;
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const reject=(reason:string):never=>{throw new ResearchAttemptBudgetError(reason);};
function cost(price:z.infer<typeof modelSchema>,input:number,output:number) {
  const amount=(BigInt(input)*BigInt(price.inputNanoUsdPerToken)+BigInt(output)*BigInt(price.outputNanoUsdPerToken)+999n)/1000n;
  if(amount>BigInt(Number.MAX_SAFE_INTEGER))return reject("cost overflow");
  return Number(amount);
}
function maximumCost(price:z.infer<typeof modelSchema>) {return cost(price,price.contextTokens,price.providerMaxOutputTokens);}
function validateLedger(value:unknown,context:ResearchBudgetContext):Ledger {
  const parsed=ledgerSchema.safeParse(value);
  if(!parsed.success)return reject("ledger unavailable");
  const ledger=parsed.data;
  if(ledger.account!==hash(context.accountId)||ledger.month!==context.originalMonth)return reject("ledger scope mismatch");
  if(new Set(ledger.entries.map(e=>e.id)).size!==ledger.entries.length)return reject("ledger unavailable");
  for(const e of ledger.entries) {
    if(e.model!==e.price.model||e.maximumCostMicroUsd!==maximumCost(e.price)||e.heldCostMicroUsd>e.maximumCostMicroUsd||e.requestedOutputTokens>e.price.providerMaxOutputTokens)return reject("ledger unavailable");
    if(e.state!=="reported_usage") {
      if(e.heldCostMicroUsd!==e.maximumCostMicroUsd||e.inputTokens!==null||e.outputTokens!==null||(e.state==="reserved"&&e.settlement!==null)||(e.state==="unknown"&&e.settlement===null))return reject("ledger unavailable");
    } else if(e.inputTokens===null||e.outputTokens===null||!e.settlement||e.inputTokens>e.price.contextTokens||e.outputTokens>e.requestedOutputTokens||(e.inputTokens===0&&e.outputTokens===0)||BigInt(e.inputTokens)+BigInt(e.outputTokens)>BigInt(e.price.contextTokens)||!e.price.completeUsageAccountingCertified||e.heldCostMicroUsd!==cost(e.price,e.inputTokens,e.outputTokens))return reject("ledger unavailable");
  }
  return ledger;
}
/** Concrete private file coordinator, NOT a policy issuer or provisioning tool.
 * One pre-provisioned 0700 directory per provider account shared by releases;
 * existing 0600 month ledger is mandatory. No missing-state reset or stale lock
 * takeover. Trusted callbacks must verify durable job/consent/current identity;
 * never populate these policies/grants from a request body or inactive draft.
 */
export function createResearchAttemptBudget(options:{
  directory:string;context:ResearchBudgetContext;
  readAuthorization(request:AttemptRequest):Promise<ResearchBudgetAuthorization>;
  /** Trusted accounting authority for this original context; no current price
   * lookup is used. Reconciliation remains possible after original month ends. */
  assertSettlementAuthorized(context:ResearchBudgetContext):Promise<void>;
  now?:()=>number;
}):ResearchAttemptBudget {
  const context=scopeSchema.parse(structuredClone(options.context));
  const directory=options.directory,now=options.now??Date.now;
  const lock=join(directory,".research-attempt-lock"),filePath=join(directory,`${context.originalMonth}.json`);
  const job=hash(context.jobId),call=hash(context.callId),grant=hash(context.grantId);
  const clock=()=>{const n=now();if(!Number.isSafeInteger(n)||n<0||!Number.isFinite(new Date(n).getTime()))return reject("invalid clock");return n;};
  async function transaction<T>(fn:(ledger:Ledger)=>Promise<{result:T;write:boolean}>):Promise<T> {
    let locked=false;
    try {
      if(resolve(directory)!==directory||await realpath(directory)!==directory)return reject("unsafe ledger directory");
      const dir=await lstat(directory);
      if(!dir.isDirectory()||dir.uid!==process.getuid?.()||(dir.mode&0o777)!==0o700)return reject("unsafe ledger directory");
      const deadline=Date.now()+1500;
      for(;;) {
        try {await mkdir(lock,{mode:0o700});locked=true;break;}
        catch(error){if((error as NodeJS.ErrnoException).code!=="EEXIST")throw error;if(Date.now()>=deadline)return reject("ledger lock requires recovery");await new Promise(r=>setTimeout(r,20));}
      }
      const syncDirectory=async()=>{const handle=await open(directory,constants.O_RDONLY|constants.O_DIRECTORY);try{await handle.sync();}finally{await handle.close();}};
      await syncDirectory();
      // Missing is an error even on the first call. An operator must create the
      // account/month baseline separately using authoritative prior accounting.
      const handle=await open(filePath,constants.O_RDONLY|constants.O_NOFOLLOW);
      let raw:string;
      try {const stat=await handle.stat();if(!stat.isFile()||stat.nlink!==1||stat.uid!==dir.uid||(stat.mode&0o777)!==0o600||stat.size>4_000_000)return reject("unsafe ledger file");raw=await handle.readFile("utf8");}finally{await handle.close();}
      const ledger=validateLedger(JSON.parse(raw),context);
      const {result,write}=await fn(ledger);
      if(write) {
        validateLedger(ledger,context);
        const bytes=JSON.stringify(ledger);if(Buffer.byteLength(bytes)>4_000_000)return reject("ledger capacity reached");
        const temp=join(directory,`.attempt-${randomUUID()}.tmp`);
        try {
          const out=await open(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
          try{await out.writeFile(bytes);await out.sync();}finally{await out.close();}
          await rename(temp,filePath);await syncDirectory();
        } finally {await unlink(temp).catch(()=>undefined);}
      }
      return result;
    } catch(error) {if(error instanceof ResearchAttemptBudgetError)throw error;return reject("ledger or authority unavailable; reservation may be retained");}
    finally {if(locked)await rmdir(lock).catch(()=>undefined);}
  }
  return {
    callId:context.callId,
    async reserve(requestInput) {
      const parsed=requestSchema.safeParse(structuredClone(requestInput));if(!parsed.success)return reject("invalid attempt");const request=parsed.data;
      const expected=createHash("sha256").update(JSON.stringify(["research-attempt-v1",context.callId,"deepinfra",request.model,request.payloadSha256])).digest("hex");
      if(expected!==request.attemptId)return reject("attempt identity mismatch");
      return transaction(async ledger=>{
        const instant=clock();if(new Date(instant).toISOString().slice(0,7)!==context.originalMonth)return reject("original month mismatch");
        const auth=await options.readAuthorization(structuredClone(request));
        const g=grantSchema.safeParse(auth?.grant),p=policySchema.safeParse(auth?.pricePolicy);
        if(!g.success||!p.success)return reject("approved authorization required");
        const t=clock(),a=g.data,policy=p.data;
        if(new Date(t).toISOString().slice(0,7)!==context.originalMonth||hash(a.scope)!==hash(context)||a.expiresAt<=t||policy.expiresAt<=t||policy.observedAt>t||policy.expiresAt<=policy.observedAt||a.pricePolicyId!==policy.id)return reject("authorization scope or expiry mismatch");
        const binding=a.allowedAttempts.find(b=>b.model===request.model&&b.payloadSha256===request.payloadSha256&&b.promptBytes===request.promptBytes&&b.maximumOutputTokens===request.maximumOutputTokens);
        const price=policy.models.find(m=>m.model===request.model);
        if(!binding||!price||request.maximumOutputTokens>price.providerMaxOutputTokens)return reject("attempt not admitted");
        const policyId=hash(policy.id),policyBinding=hash(policy);
        // Baseline usage can increase independently. Immutable grant ceilings,
        // exact payload set and expiry cannot change under the same grant ID.
        const {externalUsage,...immutableGrant}=a;
        const grantBinding=hash(immutableGrant),jobLimitsBinding=hash(a.limits.job);
        if(ledger.entries.some(e=>(e.policy===policyId&&e.policyBinding!==policyBinding)||(e.grant===grant&&e.grantBinding!==grantBinding)||(e.job===job&&e.jobLimitsBinding!==jobLimitsBinding)))return reject("immutable authorization changed");
        const maximum=maximumCost(price),permit:AttemptPermit={dispatchAllowed:true,attemptId:request.attemptId,payloadSha256:request.payloadSha256,model:request.model,maximumPromptBytes:binding.promptBytes,maximumInputTokens:price.contextTokens,maximumOutputTokens:request.maximumOutputTokens,maximumCostMicroUsd:maximum,pricePolicyId:policy.id,expiresAt:Math.min(a.expiresAt,policy.expiresAt)};
        const fullBinding=hash({request,context,grantBinding,policyBinding});
        const previous=ledger.entries.find(e=>e.id===request.attemptId);
        if(previous) {if(previous.binding!==fullBinding)return reject("attempt binding mismatch");return {result:{...permit,dispatchAllowed:false},write:false};}
        for(const level of ["month","job","call"] as const) {
          const entries=ledger.entries.filter(e=>level==="month"||level==="job"&&e.job===job||level==="call"&&e.call===call);
          const total=entries.reduce((sum,e)=>sum+BigInt(e.heldCostMicroUsd),BigInt(externalUsage[level].costMicroUsd));
          if(total+BigInt(maximum)>BigInt(a.limits[level].costMicroUsd)||BigInt(entries.length)+BigInt(externalUsage[level].attempts)+1n>BigInt(a.limits[level].attempts))return reject(`${level} budget exhausted`);
        }
        ledger.entries.push({id:request.attemptId,binding:fullBinding,job,call,grant,grantBinding,jobLimitsBinding,model:request.model,payloadSha256:request.payloadSha256,policy:policyId,policyBinding,price, promptBytes:request.promptBytes,requestedOutputTokens:request.maximumOutputTokens,maximumCostMicroUsd:maximum,heldCostMicroUsd:maximum,state:"reserved",settlement:null,inputTokens:null,outputTokens:null});
        return {result:permit,write:true};
      });
    },
    async settle(input) {
      const parsed=settlementSchema.safeParse(structuredClone(input));if(!parsed.success)return reject("invalid settlement");const receipt=parsed.data;
      await transaction(async ledger=>{
        await options.assertSettlementAuthorized(structuredClone(context));
        const entry=ledger.entries.find(e=>e.id===receipt.attemptId&&e.job===job&&e.call===call&&e.grant===grant);
        if(!entry)return reject("settlement scope mismatch");
        const receiptHash=hash(receipt);
        if(entry.settlement) {if(entry.settlement!==receiptHash)return reject("settlement conflict; prior hold retained");return {result:undefined,write:false};}
        entry.settlement=receiptHash;
        const complete=receipt.state==="reported_usage"&&entry.price.completeUsageAccountingCertified&&receipt.inputTokens<=entry.price.contextTokens&&receipt.outputTokens<=entry.requestedOutputTokens&&(receipt.inputTokens>0||receipt.outputTokens>0)&&BigInt(receipt.inputTokens)+BigInt(receipt.outputTokens)<=BigInt(entry.price.contextTokens);
        if(complete&&receipt.state==="reported_usage") {
          entry.state="reported_usage";entry.inputTokens=receipt.inputTokens;entry.outputTokens=receipt.outputTokens;
          entry.heldCostMicroUsd=cost(entry.price,receipt.inputTokens,receipt.outputTokens);
        } else {entry.state="unknown";} // Sticky full ceiling; no automatic later refund.
        return {result:undefined,write:true};
      });
    },
  };
}
