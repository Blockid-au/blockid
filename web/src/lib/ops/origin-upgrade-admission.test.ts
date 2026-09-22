import { expect, it } from "vitest";
import { createServer, request } from "node:http";
import type { Socket } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OriginActivity } from "./origin-activity";
import { installOriginHttpAdmission } from "./origin-http-admission";
for (const event of ["upgrade","connect"] as const) it(`tracks ${event} until socket close and rejects new handshake during drain`,async()=>{
 const directory=mkdtempSync(join(tmpdir(),"g30-upgrade-"));const r=new OriginActivity(join(directory,"registry.json"),{pid:1,startTicks:"1",releasePath:"/fixture"});
 const restore=installOriginHttpAdmission(r);const server=createServer();let serverSocket:Socket|undefined;let closed!:()=>void;
 const closedPromise=new Promise<void>(resolve=>{closed=resolve;});
 server.on(event,(_req,socket)=>{serverSocket=socket as Socket;socket.once("close",closed);socket.write(event==="upgrade"?"HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: fixture\r\n\r\n":"HTTP/1.1 200 Connection Established\r\n\r\n");});
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const port=(server.address() as {port:number}).port;
 function handshake(){return new Promise<{status:number;socket?:Socket}>((resolve,reject)=>{
  const req=request({host:"127.0.0.1",port,path:"/fixture",method:event==="connect"?"CONNECT":"GET",headers:event==="upgrade"?{Connection:"Upgrade",Upgrade:"fixture"}:{} });
  req.on(event,(res,socket)=>resolve({status:res.statusCode??0,socket:socket as Socket}));
  req.on("response",res=>{res.resume();resolve({status:res.statusCode??0});});req.on("error",reject);req.end();
 });}
 let first:{status:number;socket?:Socket}|undefined;
 try {first=await handshake();expect(first.status).toBe(event==="upgrade"?101:200);r.drain();expect(r.snapshot().trackedWorkDrained).toBe(false);
  const next=await handshake();expect(next.status).toBe(503);next.socket?.destroy();
  first.socket?.destroy();serverSocket?.destroy();await closedPromise;expect(r.snapshot().trackedWorkDrained).toBe(true);expect(r.snapshot().retirementEligible).toBe(false);
 } finally {first?.socket?.destroy();serverSocket?.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));restore?.();rmSync(directory,{recursive:true,force:true});}
});
