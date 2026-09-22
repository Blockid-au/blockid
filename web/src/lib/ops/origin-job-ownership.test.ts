import { afterEach, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OriginActivity, trackedJobDeps } from "./origin-activity";
const dirs:string[]=[];
function registry(){const d=mkdtempSync(join(tmpdir(),"g30-jobs-"));dirs.push(d);return new OriginActivity(join(d,"registry.json"),{pid:1,startTicks:"1",releasePath:"/fixture"});}
afterEach(()=>{for(const d of dirs)rmSync(d,{recursive:true,force:true});dirs.length=0;});
it("persists unresolved claim before invoking database and retains ambiguous failure",async()=>{
 const r=registry();const deps=trackedJobDeps("report_v2_job",{claim:async(_id:string)=>{
  expect(Object.values(JSON.parse(readFileSync(r.file,"utf8")).unresolvedJobs)).toHaveLength(1);throw new Error("lost response");
 },finish:async(_id:string,_outcome:{status:string})=>true},r);
 await expect(deps.claim("private-job-id")).rejects.toThrow("lost response");r.drain();
 expect(r.snapshot().trackedWorkDrained).toBe(false);expect(readFileSync(r.file,"utf8")).not.toContain("private-job-id");
});
it("false finish acknowledgement remains unresolved; true acknowledgement clears",async()=>{
 const r=registry();let ack=false;const deps=trackedJobDeps("first_analysis_job",{claim:async(_id:string)=>({id:"row"}),finish:async(_id:string,_outcome:{status:string})=>ack},r);
 await deps.claim("job");await deps.finish("job",{status:"done"});r.drain();expect(r.snapshot().trackedWorkDrained).toBe(false);
 ack=true;await deps.finish("job",{status:"done"});expect(r.snapshot().trackedWorkDrained).toBe(true);expect(r.snapshot().retirementEligible).toBe(false);
});
it("a losing concurrent claim cannot clear another attempt's ownership",async()=>{
 const r=registry();const winner=trackedJobDeps("job",{claim:async(_id:string)=>({id:1}),finish:async(_id:string)=>true},r);
 const loser=trackedJobDeps("job",{claim:async(_id:string)=>null,finish:async(_id:string)=>true},r);
 await winner.claim("same-job");await loser.claim("same-job");expect(Object.values(r.snapshot().unresolvedJobs)).toHaveLength(1);
});
