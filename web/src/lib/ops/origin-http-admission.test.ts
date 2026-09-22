import { expect, it } from "vitest";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OriginActivity } from "./origin-activity";
import { installOriginHttpAdmission } from "./origin-http-admission";
it("real HTTP rejects new traffic while an admitted request finishes", async () => {
 const dir=mkdtempSync(join(tmpdir(),"g30-http-"));
 const r=new OriginActivity(join(dir,"registry.json"),{pid:123,startTicks:"456",releasePath:"/fixture"});
 const restore=installOriginHttpAdmission(r);let finish!:()=>void;let entered!:()=>void;
 const enteredPromise=new Promise<void>(resolve=>{entered=resolve;});
 const gate=new Promise<void>(resolve=>{finish=resolve;});
 const server=createServer(async (req,res)=>{if(req.url==="/existing"){entered();await gate;}res.end("ok");});
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const address=server.address() as {port:number};const origin=`http://127.0.0.1:${address.port}`;
 try {
  const existing=fetch(origin+"/existing");await enteredPromise;r.drain();
  expect((await fetch(origin+"/new")).status).toBe(503);
  expect((await fetch(origin+"/api/healthz")).status).toBe(200);
  expect(r.snapshot().trackedWorkDrained).toBe(false);finish();
  expect(await (await existing).text()).toBe("ok");
  expect(r.snapshot().trackedWorkDrained).toBe(true);expect(r.snapshot().retirementEligible).toBe(false);
 } finally {finish();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));restore?.();rmSync(dir,{recursive:true,force:true});}
});
