/** Real installed Next startup fixture; localhost only, no production credentials/DB calls. */
import { mkdtemp, mkdir, writeFile, copyFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const web = resolve(import.meta.dirname, '../..');
const fixture = await mkdtemp(join(tmpdir(), 'g30-next-drain-fixture-'));
let server;
const log = join(fixture, 'fixture.log');
const emit = async (path, content) => { await mkdir(join(fixture, path, '..'), { recursive: true }); await writeFile(join(fixture, path), content); };
const env = { PATH: process.env.PATH, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', NODE_OPTIONS: '--max-old-space-size=2048' };
async function command(args) {
 const child = spawn(process.execPath, [join(web,'node_modules/next/dist/bin/next'), ...args], { cwd: fixture, env, stdio: ['ignore','pipe','pipe'] });
 let output=''; child.stdout.on('data', c=>output+=c); child.stderr.on('data', c=>output+=c);
 const code=await new Promise((res,rej)=>{child.once('error',rej);child.once('exit',res);});
 await writeFile(log, output); if(code!==0) throw Error(`Fixture build failed; ${log}\n${output.slice(-2500)}`);
}
try {
 await symlink(join(web,'node_modules'),join(fixture,'node_modules'),'dir');
 await emit('package.json', JSON.stringify({private:true,scripts:{},dependencies:{next:'16.3.5',react:'19', 'react-dom':'19'}}));
 await emit('next.config.mjs', 'export default { experimental: { cpus: 1 }, poweredByHeader: false };');
 await emit('tsconfig.json', JSON.stringify({compilerOptions:{target:'ES2022',lib:['dom','esnext'],strict:true,noEmit:true,module:'esnext',moduleResolution:'bundler',jsx:'react-jsx',esModuleInterop:true,skipLibCheck:true,plugins:[{name:'next'}]},include:['**/*.ts','**/*.tsx','.next/types/**/*.ts']}));
 await emit('src/app/layout.tsx', 'export default function Layout({children}:{children:React.ReactNode}) { return <html><body>{children}</body></html>; }');
 await emit('src/app/page.tsx', 'export default function Page(){return <h1>Origin drain fixture</h1>}');
 await emit('src/instrumentation.ts', `export async function register(){ if(process.env.NEXT_RUNTIME==='nodejs'){ const {installOriginHttpAdmission}=await import('./lib/ops/origin-http-admission'); installOriginHttpAdmission(); } }`);
 await mkdir(join(fixture,'src/lib/ops'),{recursive:true});
 for(const name of ['origin-activity.ts','origin-http-admission.ts']) await copyFile(join(web,'src/lib/ops',name),join(fixture,'src/lib/ops',name));
 await emit('src/app/api/fixture/work/route.ts', `import {trackOriginWork} from '../../../../lib/ops/origin-activity';
export const dynamic='force-dynamic';
export async function GET(){void trackOriginWork('report_email',()=>new Promise<void>(resolve=>{(globalThis as any).__g30FixtureRelease=resolve}));return Response.json({accepted:true})}`);
 await emit('src/app/api/ops/origin-drain/route.ts', `import {originActivity} from '../../../../lib/ops/origin-activity';
export const dynamic='force-dynamic';
export function GET(){return Response.json(originActivity()?.snapshot()??{missing:true})}
export async function POST(req:Request){const {action}=await req.json();const r=originActivity();if(!r)return Response.json({missing:true},{status:503});if(action==='release'){(globalThis as any).__g30FixtureRelease?.();return Response.json({released:true})}return Response.json(action==='resume'?r.resume():r.drain())}`);
 await command(['build','--webpack']);
 const port=await new Promise((res,rej)=>{const probe=createServer();probe.once('error',rej);probe.listen(0,'127.0.0.1',()=>{const p=probe.address().port;probe.close(()=>res(p))})});
 server=spawn(process.execPath,[join(web,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{cwd:fixture,env,stdio:['ignore','pipe','pipe']});
 let startup='';server.stdout.on('data',c=>startup+=c);server.stderr.on('data',c=>startup+=c);
 const base=`http://127.0.0.1:${port}`;
 const get=path=>fetch(base+path,{signal:AbortSignal.timeout(3000)});
 const post=action=>fetch(base+'/api/ops/origin-drain',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action}),signal:AbortSignal.timeout(3000)});
 let ready=false;
 for(let i=0;i<100;i++){try{if((await get('/')).ok){ready=true;break}}catch{} await new Promise(r=>setTimeout(r,100));}
 assert.ok(ready,`Next fixture did not become ready: ${startup}`);
 const first=await (await get('/api/ops/origin-drain')).json();assert.equal(first.pid,server.pid);assert.equal(first.draining,false);
 assert.equal((await get('/api/fixture/work')).status,200);
 await new Promise(r=>setTimeout(r,50));
 const drained=await (await post('drain')).json();assert.equal(drained.draining,true);assert.ok(Object.values(drained.activities).some(a=>a.kind==='report_email'));
 assert.equal((await get('/')).status,503);assert.equal((await get('/api/fixture/work')).status,503);
 await post('release');await new Promise(r=>setTimeout(r,50));
 const final=await (await get('/api/ops/origin-drain')).json();assert.equal(final.trackedWorkDrained,true);assert.equal(final.retirementEligible,false);
 await post('resume');assert.equal((await get('/')).status,200);
 const latencies=[];const started=performance.now();let sequence=0;
 await Promise.all(Array.from({length:4},async()=>{while(sequence++<60){const t=performance.now();const response=await get('/');assert.equal(response.status,200);await response.arrayBuffer();latencies.push(performance.now()-t)}}));
 latencies.sort((a,b)=>a-b);
 console.log(JSON.stringify({ok:true,realNextStartup:true,detachedWorkPreserved:true,drainRejectsNew:true,resumeRestores:true,retirementEligible:false,fixturePid:server.pid,htmlSample:{requests:latencies.length,concurrency:4,totalMs:Math.round(performance.now()-started),p95Ms:Math.round(latencies[Math.ceil(latencies.length*.95)-1])}}));
} finally {
 if(server && server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}
 // Registry evidence uses this unique fixture cwd; leave its small audit record.
 await rm(fixture,{recursive:true,force:true});
}
