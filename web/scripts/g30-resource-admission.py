#!/usr/bin/env python3
"""Optional single sixth-origin admission. No policy means the existing cap wins.
Read-only checks; only the release owner can create the pinned permit. No kills,
retirement decisions, production writes, or unbounded retained-origin expansion.
"""
import argparse
import hashlib
import json
import os
import pwd
import stat
from pathlib import Path
import re
import shutil
import subprocess
import time
import urllib.request

GIB=1024**3
CANDIDATE_BYTES=6*GIB
OPERATING_RESERVE=8*GIB
BUILD_RESERVE=10*GIB
CAP=6
MAX_TTL=7200

def retained_digest(state):
    value={'active':state['active'],'retained':state['retained'],'quarantined':sorted(state['quarantined'])}
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def policy_path(_web=None):
    # Same account-database home and directory as supervisor.private_directory;
    # never inherited HOME, and no directory creation during read-only checks.
    return Path(pwd.getpwuid(os.getuid()).pw_dir)/'.local/state/blockid-runtime/g30-resource-admission.json'

def read_policy(path):
    directory=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:
        info=os.fstat(directory)
        if info.st_uid!=os.getuid() or stat.S_IMODE(info.st_mode)!=0o700:
            raise ValueError('resource permit directory must be owner-private0700')
        fd=os.open(path.name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=directory)
        try:
            info=os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.getuid() or stat.S_IMODE(info.st_mode)!=0o600 or info.st_nlink!=1:
                raise ValueError('resource permit must be owner-private0600 regular file')
            raw=os.read(fd,65537)
            if len(raw)>65536: raise ValueError('resource permit too large')
            return json.loads(raw)
        finally: os.close(fd)
    finally: os.close(directory)

def pressure(path):
    raw=Path(path).read_text()
    match=re.search(r'^some avg10=([0-9.]+)',raw,re.M)
    if not match: raise ValueError('pressure unavailable')
    return float(match[1])

def resources(web):
    available=int(re.search(r'^MemAvailable:\s+(\d+)',Path('/proc/meminfo').read_text(),re.M).group(1))*1024
    cpus=len(os.sched_getaffinity(0))
    # Supervisor creates system units under system.slice, not the caller's user
    # session. Account for every finite parent memory/CPU bound at that location.
    for directory in (Path('/sys/fs/cgroup/system.slice'),Path('/sys/fs/cgroup')):
        limit=directory/'memory.max';current=directory/'memory.current';quota=directory/'cpu.max'
        if limit.exists() and limit.read_text().strip()!='max':
            available=min(available,max(0,int(limit.read_text())-int(current.read_text())))
        if quota.exists():
            value,period=quota.read_text().split()
            if value!='max': cpus=min(cpus,int(value)/int(period))
    return {'available_bytes':available,'effective_cpus':cpus,'load5':os.getloadavg()[1],
      'memory_psi10':pressure('/proc/pressure/memory'),'cpu_psi10':pressure('/proc/pressure/cpu'),
      'release_free_bytes':shutil.disk_usage(web/'releases').free,'tmp_free_bytes':shutil.disk_usage('/tmp').free}

def validate(policy,state,candidate_sha,sample,now,count,stage="allocate"):
    if count!=5: raise ValueError('permit only admits one sixth origin')
    if policy.get('version')!=1 or policy.get('enabled') is not True or policy.get('max_live_origins')!=CAP:
        raise ValueError('resource permit absent or disabled')
    start,end=policy.get('issued_at'),policy.get('expires_at')
    if type(start) is not int or type(end) is not int or not start<=now<end or not 0<end-start<=MAX_TTL:
        raise ValueError('resource permit expired or invalid')
    if not re.fullmatch('[a-f0-9]{40}',candidate_sha) or policy.get('candidate_sha')!=candidate_sha:
        raise ValueError('permit not bound to this candidate')
    if policy.get('retained_digest')!=retained_digest(state) or state.get('phase')!='stable':
        raise ValueError('retained set/active changed since approval')
    if stage not in ('allocate','launch','register'): raise ValueError('unknown admission stage')
    # deploy-live awaits the compiler before freezing/launching the candidate.
    # Existing origins are already charged in MemAvailable. Keep the operating
    # reserve throughout; compiler and the NEW candidate are sequential costs.
    # Launch/register independently resample after build, never reuse allocation.
    reserve=OPERATING_RESERVE+(max(BUILD_RESERVE,CANDIDATE_BYTES) if stage=='allocate' else CANDIDATE_BYTES)
    if sample['available_bytes']<reserve:
        raise ValueError('insufficient stage-specific memory reserve')
    if sample['effective_cpus']<4 or sample['load5']>sample['effective_cpus']/2 or sample['cpu_psi10']>10 or sample['memory_psi10']>.1:
        raise ValueError('CPU/memory contention outside admission budget')
    if sample['release_free_bytes']<16*GIB or sample['tmp_free_bytes']<6*GIB:
        raise ValueError('insufficient artifact/build disk reserve')
    return {'decision_authority':'release_owner_resource_permit','policy_sha256':hashlib.sha256(json.dumps(policy,sort_keys=True).encode()).hexdigest(),
      'observed_at':now,'stage':stage,'required_available_bytes':reserve,'candidate_sha':candidate_sha,'max_live_origins':CAP,'limits':{'memory_max_bytes':CANDIDATE_BYTES,'cpu_cores':2},'sample':sample,
      'legacy_retirement_proven':False}

def authorize(web,state,count,candidate_sha=None,stage="allocate"):
    path=policy_path(web)
    policy=read_policy(path)
    if candidate_sha is None:
        candidate_sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=web,text=True,timeout=5).strip()
    return validate(policy,state,candidate_sha,resources(web),int(time.time()),count,stage)

def unit_properties():
    return ['--property=MemoryHigh=4G','--property=MemoryMax=6G','--property=MemorySwapMax=0','--property=CPUQuota=200%','--property=TasksMax=128']

def verify_candidate(entry):
    # Real effective cgroup limits, not a launch argument or metadata claim.
    cgroup=Path(f'/proc/{entry["pid"]}/cgroup').read_text().strip().splitlines()
    unified=[x[3:] for x in cgroup if x.startswith('0::/')]
    if len(unified)!=1: raise ValueError('candidate cgroup unavailable')
    directory=Path('/sys/fs/cgroup')/unified[0].lstrip('/')
    if not directory.resolve().is_relative_to(Path('/sys/fs/cgroup/system.slice')): raise ValueError('candidate is not a supervised system unit')
    memory=(directory/'memory.max').read_text().strip();quota,period=(directory/'cpu.max').read_text().split()
    if memory=='max' or int(memory)>CANDIDATE_BYTES or quota=='max' or int(quota)/int(period)>2:
        raise ValueError('candidate resource enforcement missing')
    env=dict(x.split(b'=',1) for x in Path(f'/proc/{entry["pid"]}/environ').read_bytes().split(b'\0') if b'=' in x)
    token=env.get(b'STATUS_FULL_TOKEN') or env.get(b'CRON_SECRET')
    if not token: raise ValueError('private status token unavailable')
    request=urllib.request.Request(f'http://127.0.0.1:{entry["port"]}/api/status',headers={'Authorization':'Bearer '+token.decode(),'Cache-Control':'no-cache'})
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request,timeout=8) as response:
        body=json.loads(response.read(1024*1024))
    if body.get('git_sha')!=entry['sha'] or body.get('origin_activity_version')!=1 or body.get('origin_activity_healthy') is not True or body.get('origin_draining') is not False:
        raise ValueError('sixth candidate lacks runtime drain registry')

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--web',type=Path,required=True)
    args=parser.parse_args();web=args.web.resolve(strict=True)
    print(json.dumps({'read_only':True,'sample':resources(web),'required_available_bytes':CANDIDATE_BYTES+OPERATING_RESERVE+BUILD_RESERVE,'permit_present':policy_path(web).exists(),'authorization_granted':False},indent=2))
if __name__=='__main__':main()
