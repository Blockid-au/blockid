#!/usr/bin/env python3
"""Exact receipt candidate staging. Never applies SQL, changes nginx or promotes.
Compilation/launch remain in deploy-live.sh; this helper pins and inspects only.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import time
sys.dont_write_bytecode=True

def module(name):
 spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
 result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result);return result
state=module('g30-serving-state')
expansion=module('g30-schema-expansion-controller')
FILES={
 '0443_credit_operation_receipts.sql':'002a1b403b4539c9120098413f90ef8bed90330d44d5c5841785a7dbc5a92ad7',
 '0444_credit_checkout_fulfillment.sql':'e830e6202f7b45738c345a01f3efed5d0f8dcaef4c4f7f06ff8acff5f74e7d12',
 '0445_erasure_credit_purchase_receipts.sql':'52217836c9c8f01abeb42b89adaf2ab7ae0e26c564150640faf0e4e30261ef55',
}
DRAFT='4776ac3392b0adcfb61539875b2c011de10c1805'
def git(web,*args):return subprocess.check_output(['git','-C',str(web),*args],text=True).strip()
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def record_path(control):return control/'content/reports/g30-receipt-candidate.json'
def roots(source,control):
 source=source.resolve(strict=True);control=control.resolve(strict=True)
 common=Path(git(source,'rev-parse','--path-format=absolute','--git-common-dir')).resolve(strict=True)
 if source==control or control!=common.parent/'web':raise ValueError('requires isolated source and canonical control-web')
 if any((source/p).is_symlink() for p in ['.next','.deploy-manifest.json','.next-receipt-stage-backup','content/reports']):raise ValueError('build output must remain isolated')
 return source,control

TOOLING=['deploy-live.sh','g30-receipt-candidate.py','g30-receipt-disposition.py','g30-serving-state.py','g30-schema-expansion-controller.py','g30-schema-expansion.py','g30-supervised-launch.py','g30-freeze-runtime.py','g30-resource-admission.py']
def require_installed_tooling(source,control):
 if any(digest(source/'scripts'/name)!=digest(control/'scripts'/name) for name in TOOLING):raise ValueError('install reviewed canonical tooling prerequisite before staging')

def paused_baselines(control,serving,ports,baseline):
 if len(ports)!=2 or len(set(ports))!=2 or serving['active']['port'] in ports:raise ValueError('two precreated private paused baseline clones required')
 entries=[]
 for port in ports:
  choices=[e for e in serving['retained'] if e['port']==port]
  if len(choices)!=1 or port in serving['quarantined']:raise ValueError('baseline clone must already be registered and not quarantined')
  observed=expansion.endpoint(control,choices[0])
  expansion.core.pin(observed)
  if type(observed.get('process_uptime_seconds')) is not int or observed['process_uptime_seconds']<120:raise ValueError('paused clone needs observed120-second uptime')
  if observed['manifest']!=baseline or observed['schemaDigest']!=serving['active']['schemaDigest']:raise ValueError('baseline clone manifest differs')
  entries.append(choices[0])
 if len({e['pid'] for e in entries})!=2:raise ValueError('baseline clones must be distinct processes')
 return entries

def validate_manifest(base,candidate,sql,changed,ledger):
 if sql!=FILES:raise ValueError('reviewed SQL hash mismatch')
 if set(changed)!=set(FILES):raise ValueError('not exact three-migration diff')
 if '0447_reanalysis_authority.sql' not in base['files']:raise ValueError('authority0447 baseline required')
 if set(candidate['files'])!=set(base['files'])|set(FILES) or set(FILES)&set(base['files']):raise ValueError('not exact additive receipt manifest')
 if base.get('deferred',[])!=candidate.get('deferred',[]) or set(FILES)&set(candidate.get('deferred',[])):raise ValueError('deferred list changed')
 if candidate.get('total_files')!=len(candidate['files']) or len(set(candidate['files']))!=len(candidate['files']):raise ValueError('manifest count mismatch')
 if set(candidate.get('pending_at_generation',[]))!=set(FILES):raise ValueError('candidate must declare exactly three pending migrations')
 if set(FILES)&set(ledger):raise ValueError('partial/already applied financial schema requires recovery')
 if not set(base['files'])-set(base.get('deferred',[]))<=set(ledger):raise ValueError('baseline ledger missing migrations')

def require_clean_source(source):
 if git(source,'status','--porcelain','--untracked-files=all'):raise ValueError('dirty source cannot stage')

def reviewed_fixture_hashes(source):
 result={}
 for name in ['credit-operation-receipts.py','credit-checkout-fulfillment.py']:
  expected=subprocess.check_output(['git','-C',str(source),'show',DRAFT+':web/scripts/db/tests/'+name])
  actual=(source/'scripts/db/tests'/name).read_bytes()
  if actual!=expected:raise ValueError('reviewed fixture changed')
  result[name]=hashlib.sha256(actual).hexdigest()
 return result

def verify_staged_fixtures(record,source):
 if record.get('fixtureSources')!=reviewed_fixture_hashes(source):raise ValueError('fixture bytes changed since staging preflight')

def check_source(source,baseline_sha,base_manifest,ledger):
 current=git(source,'rev-parse','HEAD')
 changed=git(source,'diff','--name-only',baseline_sha,'HEAD','--','supabase/migrations').splitlines()
 # Git paths are relative to the repository root even with -C web.
 changed=[p.removeprefix('web/supabase/migrations/') for p in changed]
 actual={name:digest(source/'supabase/migrations'/name) for name in FILES}
 candidate=json.loads((source/'content/reports/schema-migrations.json').read_text())
 validate_manifest(base_manifest,candidate,actual,changed,ledger)
 for name in FILES:
  committed=subprocess.check_output(['git','-C',str(source),'show',current+':web/supabase/migrations/'+name])
  if hashlib.sha256(committed).hexdigest()!=FILES[name]:raise ValueError('uncommitted SQL')
 reviewed_fixture_hashes(source)
 # Require clean committed source. Runtime evidence stays outside this worktree.
 require_clean_source(source)
 return current,candidate

def preflight(source,control,baseline_ports=()):
 require_installed_tooling(source,control)
 serving=state.read_state(control)
 if not serving or serving['phase']!='stable' or serving['active']['port'] not in serving['verifiedGood']:raise ValueError('stable verified active required')
 active=state.verify_entry(serving['active'],control)
 existing=record_path(control)
 if existing.exists() or existing.is_symlink():raise ValueError('prior staged candidate needs explicit disposition')
 baseline=json.loads((Path(active['releasePath'])/'content/reports/schema-migrations.json').read_text())
 clones=paused_baselines(control,serving,baseline_ports,baseline)
 ledger,catalogue=expansion.current_database()
 sha,manifest=check_source(source,active['sha'],baseline,ledger)
 return {'version':1,'phase':'preflight','sourceWeb':str(source),'controlWeb':str(control),'sourceSha':sha,
   'active':active,'fixtureSources':reviewed_fixture_hashes(source),'pausedBaselines':clones,'manifest':manifest,'baselineManifest':baseline,'baselineLedger':ledger,'baselineCatalogueDigest':catalogue,
   'sql':FILES,'createdAt':int(time.time()),'inspectionOnly':True,'promotionAuthorized':False}

def inspect(source,control,record,port,pid,release):
 verify_staged_fixtures(record,source)
 if record.get('phase')!='frozen' or record.get('releasePath')!=str(release):raise ValueError('candidate not frozen and pinned')
 if record['sourceWeb']!=str(source) or record['controlWeb']!=str(control):raise ValueError('staging roots changed')
 if git(source,'rev-parse','HEAD')!=record['sourceSha']:raise ValueError('candidate source changed')
 changed=git(source,'diff','--name-only','HEAD','--','src','scripts','supabase','next.config.ts','package.json','package-lock.json','content/reports/schema-migrations.json')
 if changed:raise ValueError('source changed during build')
 if {name:digest(source/'supabase/migrations'/name) for name in FILES}!=FILES:raise ValueError('SQL changed during build')
 for name in FILES:
  if digest(release/'supabase/migrations'/name)!=FILES[name]:raise ValueError('artifact SQL differs from reviewed bytes')
 ledger,catalogue=expansion.current_database()
 if ledger!=record['baselineLedger'] or catalogue!=record['baselineCatalogueDigest']:raise ValueError('database changed during build')
 serving=state.read_state(control)
 if serving['phase']!='stable' or serving['active']!=record['active']:raise ValueError('active changed during build')
 clones=paused_baselines(control,serving,[e['port'] for e in record['pausedBaselines']],record['baselineManifest'])
 if clones!=record['pausedBaselines']:raise ValueError('paused baseline identity changed during build')
 entry=state.make_entry(control,port,pid,release,'pending:3')
 if entry['sha']!=record['sourceSha']:raise ValueError('candidate SHA mismatch')
 if any(e['port']==port or e['pid']==pid for e in serving['retained']):raise ValueError('staged candidate must remain unregistered')
 observed=expansion.endpoint(control,entry,'pending:3')
 validate_runtime(record,observed)
 if not (release/'.g30-runtime').is_dir():raise ValueError('runtime freeze missing')
 return {**record,'phase':'inspected','candidate':entry,'runtimeDigest':observed['runtime_digest'],'inspectedAt':int(time.time())}

def validate_runtime(record,observed):
 if observed.get('manifest')!=record['manifest']:raise ValueError('compiled manifest mismatch')
 if observed.get('schema_migrations')!='pending:3' or observed.get('http_status')!=200:raise ValueError('only exact local pending:3 inspection is allowed')
 if observed.get('sha')!=record['sourceSha']:raise ValueError('compiled SHA mismatch')
 expansion.core.pin(observed)
 if observed.get('creation_enabled') is not False or observed.get('purchases_paused') is not True:raise ValueError('candidate must be paused with creation off')

def pin_release(source,control,record,release):
 if record['phase']!='preflight' or record['sourceSha']!=git(source,'rev-parse','HEAD'):raise ValueError('exact preflight required')
 if release.parent!=(control/'releases').resolve(strict=True):raise ValueError('release outside canonical artifact root')
 build=json.loads((release/'.deploy-manifest.json').read_text())
 if (build.get('build_sha') or build.get('git_sha'))!=record['sourceSha']:raise ValueError('frozen build identity mismatch')
 manifests=list(release.glob('.g30-runtime/*/manifest.json'))
 if len(manifests)!=1 or expansion.core.fingerprint(json.loads(manifests[0].read_text()))!=manifests[0].parent.name:raise ValueError('verified freeze required before pin')
 pins_path=control/'content/reports/release-retention-pins.json'
 pins=json.loads(pins_path.read_text())
 if pins.get('version')!=1 or not isinstance(pins.get('paths'),list):raise ValueError('invalid retention pins')
 pins['paths']=sorted(set(pins['paths'])|{str(release)})
 state.atomic_json(pins_path,pins)
 return {**record,'phase':'frozen','releasePath':str(release)}

def next_commands(record,source,control):
 import shlex
 candidate=record.get('candidate')
 if record.get('phase')!='inspected' or not candidate:raise ValueError('inspect candidate before migration planning')
 verify_staged_fixtures(record,source)
 prefix=[sys.executable,str(source/'scripts/g30-schema-expansion-controller.py'),'--web',str(source),'--control-web',str(control)]
 commands={'prepare':prefix+['prepare','--candidate-port',str(candidate['port']),'--candidate-pid',str(candidate['pid']),'--candidate-release',candidate['releasePath'],'--recovery-port',str(record['pausedBaselines'][1]['port']),'--lock-fd','200','--cron-lock-fd','201']}
 commands['next']=prefix+['next','--lock-fd','200','--cron-lock-fd','201']
 commands['seal']=prefix+['seal','--lock-fd','200','--cron-lock-fd','201']
 for filename in FILES:
  commands['manual_apply_'+filename]=['bash',str(source/'scripts/db/apply-migration.sh'),str(source/'supabase/migrations'/filename)]
  commands['observe_'+filename]=prefix+['observe','--migration',filename,'--lock-fd','200','--cron-lock-fd','201']
 return {'commands':{k:shlex.join(v) for k,v in commands.items()},'automaticExecution':False,'promotion':'Only after sealed transition and fresh resource/endpoint checks; use reviewed serving/proxy controller sequence in runbook.'}

def promotion_commands(record,transition,active,source,control):
 import shlex
 if record.get('phase')!='inspected' or not transition or transition.get('phase')!='sealed':raise ValueError('sealed expansion required before promotion plan')
 candidate=record['candidate']
 if transition.get('releases',{}).get('candidate') is None or any(transition['releases']['candidate'].get(k)!=candidate.get(k) for k in ['sha','pid','port','startTicks','releasePath','schemaDigest']):raise ValueError('sealed candidate identity differs')
 helper=[sys.executable,str(source/'scripts/g30-serving-state.py'),'--web',str(control),'--lock-fd','200']
 commands=[helper+['--register','--pid',str(candidate['pid']),'--listen-port',str(candidate['port']),'--release',candidate['releasePath']],helper+['--begin'],
  [sys.executable,str(source/'scripts/g30-proxy-switch.py'),'--apply','--sudo','--lock-fd','200','--from-port',str(active['port']),'--to-port',str(candidate['port'])],
  helper+['--activate','--listen-port',str(candidate['port'])],helper+['--gates-passed']]
 return {'automaticExecution':False,'candidateSha':candidate['sha'],'commands':[shlex.join(x) for x in commands],
  'mandatoryInterlocks':['Verify supervisor identity and resource permit before register','Verify public exact SHA after proxy switch BEFORE activate','On any switch/public/activation failure execute verified warm rollback before proceeding','Perform actual rollback/forward drill and soak before mark-good','Keep purchase pause on and receipt creation off; unpause is a separate reviewed phase']}

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('command',choices=['preflight','allocate','pin','inspect','commands','promotion-plan','dispose'])
 parser.add_argument('--source-web',type=Path,required=True);parser.add_argument('--control-web',type=Path,required=True)
 parser.add_argument('--expected-stage-sha256',help='Exact inspected stage bytes SHA256; required only for explicit dispose')
 parser.add_argument('--baseline-port',type=int,action='append',default=[])
 parser.add_argument('--lock-fd',type=int,required=True);parser.add_argument('--port',type=int);parser.add_argument('--pid',type=int);parser.add_argument('--release',type=Path)
 args=parser.parse_args();source,control=roots(args.source_web,args.control_web);state.proxy.require_lock(args.lock_fd)
 location=record_path(control)
 if args.command=='dispose':
  require_installed_tooling(source,control)
  result=module('g30-receipt-disposition').dispose(control,args.expected_stage_sha256,state,expansion,args.lock_fd)
  print(json.dumps(result));return
 if args.expected_stage_sha256 is not None:raise ValueError('stage hash argument only applies to dispose')
 if args.command=='preflight':
  record=preflight(source,control,args.baseline_port)
  state.atomic_json(location,record)
 elif args.command=='allocate':
  record=json.loads(location.read_text())
  if record['phase']!='preflight' or record['sourceSha']!=git(source,'rev-parse','HEAD'):raise ValueError('missing exact preflight')
  print(state.allocate(state.read_state(control),control,candidate_sha=record['sourceSha']));return
 elif args.command=='pin':
  record=pin_release(source,control,json.loads(location.read_text()),args.release.resolve(strict=True))
  state.atomic_json(location,record)
 elif args.command=='inspect':
  record=inspect(source,control,json.loads(location.read_text()),args.port,args.pid,args.release.resolve(strict=True))
  state.atomic_json(location,record)
 elif args.command=='promotion-plan':
  record=json.loads(location.read_text());serving=state.read_state(control);transition=expansion.read(control)
  plan=promotion_commands(record,transition,serving['active'],source,control)
  if not expansion.allowed(control,serving['active'],record['candidate'],serving):raise ValueError('live sealed edge refused')
  print(json.dumps(plan));return
 else:
  print(json.dumps(next_commands(json.loads(location.read_text()),source,control)));return
 print(json.dumps({'phase':record['phase'],'inspectionOnly':True,'sourceSha':record['sourceSha']}))
if __name__=='__main__':
 try:main()
 except Exception as exc:
  print(json.dumps({'ok':False,'action':'refused','error_kind':type(exc).__name__}));raise SystemExit(1)
