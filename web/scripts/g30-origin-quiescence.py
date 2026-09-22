#!/usr/bin/env python3
"""Read-only retained-origin evidence. Does not stop processes or approve retirement.
Sockets, elapsed time and an empty AI queue alone cannot prove no detached jobs.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import urllib.request
import sys
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('state',Path(__file__).with_name('g30-serving-state.py'))
state=importlib.util.module_from_spec(spec);spec.loader.exec_module(state)

def observe(web,port):
    serving=state.read_state(web)
    entries=[x for x in serving['retained'] if x['port']==port]
    if len(entries)!=1: raise ValueError('unknown retained origin')
    e=entries[0]; info=state.proxy.process_info(e['pid'])
    report={'version':1,'port':port,'pid':e['pid'],'retirementEligible':False,'writes_performed':False,
      'active':port==serving['active']['port'],'process_present':info is not None}
    if not info:
        report['reason']='process_missing; capacity rules are separate; jobs/artifacts not declared retired';return report
    if info['start']!=e['startTicks'] or str(Path(f'/proc/{e["pid"]}/cwd').resolve())!=e['releasePath']:
        raise ValueError('retained process identity mismatch')
    network={}
    for name in ('tcp','tcp6'):
        for row in Path('/proc/net/'+name).read_text().splitlines()[1:]:
            parts=row.split();network[parts[9]]=(parts[3],int(parts[2].split(':')[1],16))
    counts={};peers={}
    for fd in Path(f'/proc/{e["pid"]}/fd').iterdir():
        try: target=os.readlink(fd)
        except FileNotFoundError: continue
        if target.startswith('socket:['):
            status,peer=network.get(target[8:-1],('non_tcp',0));counts[status]=counts.get(status,0)+1
            if status=='01':
                kind={6379:'redis',5432:'postgres',443:'https',80:'http'}.get(peer,'other_port')
                peers[kind]=peers.get(kind,0)+1
    report.update(socket_states=counts,established_peer_port_classes=peers)
    env=dict(x.split(b'=',1) for x in Path(f'/proc/{e["pid"]}/environ').read_bytes().split(b'\0') if b'=' in x)
    token=env.get(b'CRON_SECRET'); registry=None
    if token:
        try:
            request=urllib.request.Request(f'http://127.0.0.1:{port}/api/ops/origin-drain',headers={'Authorization':'Bearer '+token.decode()})
            opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
            with opener.open(request,timeout=5) as response: registry=json.loads(response.read(256*1024))
            if registry.get('pid')!=e['pid'] or registry.get('startTicks')!=e['startTicks'] or registry.get('releasePath')!=e['releasePath']:
                raise ValueError('registry identity mismatch')
            report['registry']={k:registry.get(k) for k in ('version','draining','persistenceFailed','trackedWorkDrained','coverage','remainingCoverage')}
            report['tracked_activity_count']=len(registry.get('activities',{}))
        except Exception: report['registry_status']='unavailable_or_unverified'
    else: report['registry_status']='credential_unavailable'
    # Revalidate identity after all observations. Never label PID reuse idle.
    after=state.proxy.process_info(e['pid'])
    if not after or after['start']!=e['startTicks']: raise ValueError('origin changed during observation')
    report['reason']='scope-limited evidence; complete background/job ownership not proven'
    report['legacy_unknowns']=['unregistered detached promises','provider child-process descendants','database jobs without origin ownership','ambiguous external side effects']
    return report

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--web',type=Path,required=True);parser.add_argument('--port',type=int,required=True)
    args=parser.parse_args();print(json.dumps(observe(args.web.resolve(strict=True),args.port),indent=2))
if __name__=='__main__':
    try:main()
    except Exception as exc:print(json.dumps({'retirementEligible':False,'error_kind':type(exc).__name__}));raise SystemExit(1)
