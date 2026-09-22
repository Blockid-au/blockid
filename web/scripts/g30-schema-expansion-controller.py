#!/usr/bin/env python3
"""Explicit G300443–0445 expansion checkpoints. Never executes SQL or deploys.
All state-changing commands require inherited deployment + reconciliation locks.
Prepare/observe/seal use real local snapshot and authenticated runtime probes.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request
sys.dont_write_bytecode=True

def module(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value
core=module('g30-schema-expansion')
state=module('g30-serving-state')
attestation=module('g30-schema-attestation')

def path(web): return web/'content/reports/g30-schema-expansion.json'
def read(web):
    p=path(web)
    if p.is_symlink(): raise ValueError('transition state cannot be symlink')
    return json.loads(p.read_text()) if p.exists() else None

def sql_hashes(web): return {name:hashlib.sha256((web/'supabase/migrations'/name).read_bytes()).hexdigest() for name in core.FILES}

def status(entry):
    # Read only these credentials privately from the attested process, not shell.
    info=state.proxy.process_info(entry['pid'])
    if not info or info['start']!=entry['startTicks']: raise ValueError('PID changed')
    env=dict(x.split(b'=',1) for x in Path(f'/proc/{entry["pid"]}/environ').read_bytes().split(b'\0') if b'=' in x)
    token=env.get(b'STATUS_FULL_TOKEN') or env.get(b'CRON_SECRET')
    if not token: raise ValueError('no private status token')
    request=urllib.request.Request(f'http://127.0.0.1:{entry["port"]}/api/status',headers={'Authorization':'Bearer '+token.decode(),'Cache-Control':'no-cache'})
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request,timeout=10) as response:
        data=json.loads(response.read(1024*1024));data['http_status']=response.status
    if data.get('git_sha')!=entry['sha']: raise ValueError('endpoint SHA changed')
    return data

def endpoint(web,entry,expected='ok'):
    state.validate_entry(entry,web);state.verify_entry(entry,web,expected)
    root=Path(entry['releasePath'])
    manifests=list(root.glob('.g30-runtime/*/manifest.json'))
    if len(manifests)!=1: raise ValueError('missing independent runtime manifest')
    runtime=json.loads(manifests[0].read_text())
    runtime_hash=core.fingerprint(runtime)
    if manifests[0].parent.name!=runtime_hash: raise ValueError('runtime fingerprint mismatch')
    data=status(entry);caps=data.get('credit_receipt_capabilities',{})
    if data.get('schema_migrations')!=expected or caps.get('purchase_authority')!='web-receipt-v1': raise ValueError('incompatible status/capability')
    return {**entry,**caps,'runtime_digest':runtime_hash,'manifest':json.loads((root/'content/reports/schema-migrations.json').read_text()),
      'http_status':data['http_status'],'schema_migrations':data['schema_migrations']}

def current_database():
    sample=attestation.observe(include_ledger=True)
    return sample['ledger'],sample['digest']

def assert_paused(web,serving):
    # No live retained legacy handler may remain, including quarantined origins.
    for entry in serving['retained']:
        if state.proxy.process_info(entry['pid']) is None: continue
        observed=endpoint(web,entry)
        core.pin(observed)
        if observed.get('process_uptime_seconds',0)<120: raise ValueError('paused compatibility process has not drained')

def fixture(web,record):
    if sql_hashes(web)!=record['migrations']: raise ValueError('SQL changed since prepare')
    script=web/'scripts/db/tests/credit-checkout-fulfillment.py'
    helper=web/'scripts/db/tests/credit-operation-receipts.py'
    before={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (script,helper)}
    if before!=record['fixture_sources']: raise ValueError('fixture changed since prepare')
    result=subprocess.run([sys.executable,str(script)],cwd=web,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=90)
    if result.returncode: raise ValueError('isolated receipt fixture failed')
    if before!={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (script,helper)}: raise ValueError('fixture source changed')
    return core.fingerprint({'sql':record['migrations'],'scripts':before,'result':hashlib.sha256(result.stdout).hexdigest()})

def allowed(web,source,target,serving):
    record=read(web)
    if not record or record.get('phase')!='sealed': return False
    ledger,digest=current_database()
    a=endpoint(web,source);b=endpoint(web,target)
    if not core.CAPS.issubset(set(a.get('capabilities',[]))) or not core.CAPS.issubset(set(b.get('capabilities',[]))): return False
    # Sealed runtime identity survives subsequent enable/unpause; the receipt
    # reader contract still must be present. Actual pause is a staging invariant.
    return core.edge_allowed(record,a,b,ledger,digest,serving['quarantined'])

def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--web',type=Path,required=True)
    p.add_argument('command',choices=['prepare','next','observe','seal','enroll','fail'])
    p.add_argument('--lock-fd',type=int,required=True);p.add_argument('--cron-lock-fd',type=int,required=True)
    p.add_argument('--control-web',type=Path,help='Canonical control checkout for an isolated reviewed candidate source')
    p.add_argument('--recovery-port',type=int);p.add_argument('--candidate-port',type=int);p.add_argument('--candidate-pid',type=int);p.add_argument('--candidate-release',type=Path)
    p.add_argument('--migration',choices=core.FILES)
    p.add_argument('--allow-purchase-writes',action='store_true',help='Explicitly permit a verified successor started with purchases enabled after sealed expansion')
    args=p.parse_args(argv);web=args.web.resolve(strict=True)
    control=args.control_web.resolve(strict=True) if args.control_web else web
    if args.control_web:
        common=Path(subprocess.check_output(['git','-C',str(web),'rev-parse','--path-format=absolute','--git-common-dir'],text=True).strip()).resolve(strict=True)
        if web==control or control!=common.parent/'web': raise ValueError('isolated source/canonical control required')
    state.proxy.require_lock(args.lock_fd)
    state.proxy.require_lock(args.cron_lock_fd,Path('/tmp/blockid-cron.stripe-reconcile.lock'))
    serving=state.read_state(control);record=read(control);now=int(time.time());probe=str(time.time_ns())
    if args.command=='fail':
        if not record: raise ValueError('no transition')
        state.atomic_json(path(control),core.fail(record,'operator stopped; financial writes remain paused'));return 0
    if args.command=='prepare':
        if record: raise ValueError('transition already exists; explicit recovery required')
        assert_paused(control,serving)
        recovery=next(e for e in serving['retained'] if e['port']==args.recovery_port)
        candidate=state.make_entry(control,args.candidate_port,args.candidate_pid,args.candidate_release,'pending:3')
        a,b,c=endpoint(control,serving['active']),endpoint(control,recovery),endpoint(control,candidate,'pending:3')
        ledger,digest=current_database()
        record=core.prepare(serving,a,b,c,sql_hashes(web),ledger,digest,now,probe)
        record['fixture_sources']={name:hashlib.sha256((web/'scripts/db/tests'/name).read_bytes()).hexdigest() for name in ('credit-checkout-fulfillment.py','credit-operation-receipts.py')}
        record['transition_id']=core.fingerprint({k:v for k,v in record.items() if k!='transition_id'})
    else:
        if not record: raise ValueError('no prepared transition')
        if sql_hashes(web)!=record['migrations']: raise ValueError('reviewed SQL bytes changed')
        ledger,digest=current_database()
        if args.command=='enroll':
            if not allowed(control,serving['active'],serving['active'],serving): raise ValueError('active release outside sealed transition')
            entry=state.make_entry(control,args.candidate_port,args.candidate_pid,args.candidate_release)
            observed=endpoint(control,entry);observed['receipt_fixture_digest']=fixture(web,record)
            ledger,digest=current_database()
            record=core.enroll_successor(record,observed,ledger,digest,args.allow_purchase_writes)
        elif args.command=='next':
            print(json.dumps(core.next_migration(record,ledger)));return 0
        elif args.command=='observe':
            record=core.record_applied(record,args.migration,ledger,digest,now,probe)
        elif args.command=='seal':
            assert_paused(control,serving)
            evidence=fixture(web,record)
            for role,entry in record['releases'].items():
                observed=endpoint(control,entry);observed['receipt_fixture_digest']=evidence
                ledger,digest=current_database()
                record=core.verify_endpoint(record,role,observed,ledger,digest,int(time.time()),str(time.time_ns()))
            ledger,digest=current_database()
            record=core.seal(record,ledger,digest,int(time.time()))
    state.atomic_json(path(control),record)
    print(json.dumps({'transition_id':record['transition_id'],'phase':record['phase']}));return 0
if __name__=='__main__':
    try: raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({'ok':False,'error_kind':type(exc).__name__,'action':'refused'}));raise SystemExit(1)
