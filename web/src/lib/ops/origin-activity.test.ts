import { afterEach, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OriginActivity } from "./origin-activity";
const dirs: string[] = [];
function registry() { const dir = mkdtempSync(join(tmpdir(), "g30-origin-")); dirs.push(dir); return new OriginActivity(join(dir,"activity.json"), { pid: 123, startTicks: "456", releasePath: "/synthetic/release" }); }
afterEach(() => { dirs.forEach(dir => rmSync(dir,{recursive:true,force:true})); dirs.length=0; });
it("persists admission before work and keeps detached work through parent completion", async () => {
 const r=registry(); let finish!:()=>void;
 const gate=new Promise<void>(resolve=>{finish=resolve;}); let detached!:Promise<void>;
 await r.run("report_pipeline",async()=>{ detached=r.run("report_email",()=>gate); });
 r.drain(); expect(Object.values(r.snapshot().activities).map(x=>x.kind)).toEqual(["report_email"]);
 expect(r.snapshot().trackedWorkDrained).toBe(false);
 finish();await detached;expect(r.snapshot().trackedWorkDrained).toBe(true);
 expect(r.snapshot().retirementEligible).toBe(false);
});
it("drain rejects new admissions but lets already admitted work complete", async () => {
 const r=registry();let finish!:()=>void;const gate=new Promise<void>(resolve=>{finish=resolve;});
 const running=r.run("report_pipeline",async()=>{await gate; await r.run("ai_call",async()=>{});});
 r.drain();await expect(r.run("report_pipeline",async()=>{})).rejects.toThrow("draining");
 finish();await running;expect(r.snapshot().trackedWorkDrained).toBe(true);
});
it("a stale process registry cannot be reused",()=>{
 const r=registry();expect(()=>new OriginActivity(r.file,r.identity)).toThrow("already_exists");
});
it("registry records no request inputs and requires explicit resume",()=>{
 const r=registry();const done=r.admit("http");done();r.drain();
 const stored=JSON.parse(readFileSync(r.file,"utf8"));expect(stored.draining).toBe(true);expect(stored.activities).toEqual({});
 r.resume();expect(r.snapshot().draining).toBe(false);
});
