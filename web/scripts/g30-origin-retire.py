#!/usr/bin/env python3
"""Plan or explicitly retire ONE registered origin; never invoked by deploy.

Artifacts stay pinned. Unknown work requires an explicit scoped acknowledgement.
No forced kill, resource permit, routing change, or automatic victim selection.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time
import urllib.request

sys.dont_write_bytecode = True


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


state = module('retire_state', 'g30-serving-state.py')
supervisor = module('retire_supervisor', 'g30-supervised-launch.py')


def fingerprint(entry, unit):
    return hashlib.sha256(json.dumps({'entry': entry, 'unit': unit}, sort_keys=True).encode()).hexdigest()


def bind_unit(entry, unit):
    digest = hashlib.sha256(entry['releasePath'].encode()).hexdigest()[:10]
    if not unit.startswith(f'g30-origin-{entry["port"]}-{digest}-'):
        raise ValueError('Unit is not bound to the target port/release')


def select(web, port):
    data = state.read_state(web)
    if not data or data['phase'] != 'stable':
        raise ValueError('Stable serving state required')
    entries = [e for e in data['retained'] if e['port'] == port]
    if len(entries) != 1:
        raise ValueError('Exactly one registered origin required')
    protected = [data['active'], data.get('previous')]
    if any(e and e['port'] == port for e in protected):
        raise ValueError('Active and previous origins are protected')
    # A staged financial candidate and schema-transition participants require
    # their own explicit disposition before retirement, even if quarantined.
    for name in ('g30-receipt-candidate.json', 'g30-schema-expansion.json', 'g30-authority-schema-transition.json'):
        path = web / 'content/reports' / name
        if path.exists() or path.is_symlink():
            record = json.loads(path.read_text())
            if not isinstance(record, dict):
                raise ValueError('Invalid transition record')
            if record.get('phase') not in ('sealed', 'disposed') and references_port(record, port):
                raise ValueError('Origin is referenced by an unfinished transition/stage')
    return data, entries[0]


def references_port(value, port):
    if isinstance(value, dict):
        return value.get('port') == port or any(references_port(v, port) for v in value.values())
    return isinstance(value, list) and any(references_port(v, port) for v in value)


def verify_protected(web, data):
    active, warm = data['active'], data.get('previous')
    if (not warm or warm['pid'] == active['pid'] or warm['port'] not in data['verifiedGood']
            or warm['port'] in data['quarantined']):
        raise ValueError('A distinct verified warm rollback is required')
    if active['port'] in data['quarantined'] or not state.schema_compatible(web, active, warm):
        raise ValueError('Healthy compatible current/warm origins required')
    for entry in (active, warm):
        state.verify_entry(entry, web)
    config = Path('/etc/nginx/sites-enabled/blockid-live').read_text()
    # Validate both web and upload routing without writing/reloading nginx.
    state.proxy.render_switch(config, active['port'], warm['port'])


def unit_name(unit):
    if not re.fullmatch(r'g30-origin-[0-9]+-[a-f0-9]{10}-[a-f0-9]{12}\.service', unit):
        raise ValueError('Explicit supervised origin unit required')


def members(unit):
    group = Path('/sys/fs/cgroup/system.slice') / unit
    if not group.exists():
        return set()
    files = [group / 'cgroup.procs', *group.glob('**/cgroup.procs')]
    return {int(pid) for path in files for pid in path.read_text().split()}


def verify_target(entry, unit):
    manifest = json.loads((Path(entry['releasePath']) / '.deploy-manifest.json').read_text())
    if (manifest.get('build_sha') or manifest.get('git_sha')) != entry['sha']:
        raise ValueError('Target release manifest identity mismatch')
    found = supervisor.check(unit, entry['pid'], Path(entry['releasePath']))
    if found['startTicks'] != entry['startTicks'] or members(unit) != {entry['pid']}:
        raise ValueError('Target changed or service has descendant processes')
    # Socket ownership also matters: an authenticated response alone does not
    # establish that the retained process owns this port.
    sockets = set()
    for fd in Path(f'/proc/{entry["pid"]}/fd').iterdir():
        try:
            target = os.readlink(fd)
        except FileNotFoundError:
            continue
        if target.startswith('socket:['):
            sockets.add(target[8:-1])
    listeners = []
    for name in ('tcp', 'tcp6'):
        for row in Path('/proc/net/' + name).read_text().splitlines()[1:]:
            parts = row.split()
            if parts[3] == '0A' and int(parts[1].split(':')[1], 16) == entry['port']:
                listeners.append(parts[9])
    if not listeners or not all(inode in sockets for inode in listeners):
        raise ValueError('Target does not own listening socket')


def registry(entry, action=None):
    env = dict(x.split(b'=', 1) for x in Path(f'/proc/{entry["pid"]}/environ').read_bytes().split(b'\0') if b'=' in x)
    token = env.get(b'CRON_SECRET')
    if not token:
        raise ValueError('Target registry credential unavailable')
    request = urllib.request.Request(
        f'http://127.0.0.1:{entry["port"]}/api/ops/origin-drain',
        data=json.dumps({'action': action}).encode() if action else None,
        headers={'Authorization': 'Bearer ' + token.decode(), 'Content-Type': 'application/json'})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(request, timeout=5) as response:
        if response.status != 200:
            raise ValueError('Registry unavailable')
        value = json.loads(response.read(262145))
    if any(value.get(k) != entry[k] for k in ('pid', 'startTicks', 'releasePath')):
        raise ValueError('Registry identity mismatch')
    if value.get('version') != 1 or value.get('persistenceFailed') is not False:
        raise ValueError('Registry is not reliable')
    if not isinstance(value.get('activities'), dict) or not isinstance(value.get('unresolvedJobs'), dict):
        raise ValueError('Incomplete registry evidence')
    return value


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError('Registry redirect refused')


def drained(value):
    return (value.get('draining') is True and value.get('trackedWorkDrained') is True
            and not value['activities'] and not value['unresolvedJobs'])


def inspect(web, port, unit):
    unit_name(unit)
    data, entry = select(web, port)
    bind_unit(entry, unit)
    verify_protected(web, data)
    missing = state.proxy.process_info(entry['pid']) is None
    if missing:
        if members(unit):
            raise ValueError('Missing main process still has service descendants')
        value = {'activities': {}, 'unresolvedJobs': {}, 'remainingCoverage': ['process_missing_job_state_unknown']}
    else:
        verify_target(entry, unit)
        value = registry(entry)
    return {'plan': True, 'entry': entry, 'unit': unit, 'expect': fingerprint(entry, unit),
            'trackedActivities': len(value['activities']), 'unresolvedJobs': len(value['unresolvedJobs']),
            'processMissing': missing, 'retirementEligible': value.get('retirementEligible') is True,
            'remainingCoverage': value.get('remainingCoverage'), 'artifactsPreserved': True,
            'requiresUntrackedWorkAcknowledgement': value.get('retirementEligible') is not True}


def unit_status(unit):
    result = subprocess.run(['sudo', '-n', 'systemctl', 'show', unit,
                             '--property=MainPID', '--property=ActiveState', '--property=LoadState'],
                            capture_output=True, text=True, timeout=20, close_fds=True)
    info = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
    absent = info.get('LoadState') == 'not-found' and info.get('ActiveState') == 'inactive' and info.get('MainPID') == '0'
    if (result.returncode and not absent) or not {'MainPID', 'ActiveState', 'LoadState'} <= info.keys():
        raise ValueError('Unable to verify supervisor state')
    return info


def finish_unit(entry, unit):
    # Never systemctl stop a populated group: its default timeout can escalate
    # to SIGKILL. Only dispose the empty, uniquely named transient service.
    if state.proxy.process_info(entry['pid']) is not None or members(unit):
        raise ValueError('Process/group still present; no forced kill attempted')
    info = unit_status(unit)
    if info['MainPID'] != '0':
        raise ValueError('Supervisor has a different main process')
    if info['LoadState'] != 'not-found':
        supervisor.command(['systemctl', 'stop', unit])
        info = unit_status(unit)
    if info.get('MainPID') != '0' or info.get('ActiveState') not in ('inactive', 'failed') or members(unit):
        raise ValueError('Supervisor did not confirm stopped origin')


def retire(web, port, unit, expected, lock_fd, acknowledge=False, reason='', timeout=60):
    state.proxy.require_lock(lock_fd)
    unit_name(unit)
    if not 1 <= timeout <= 300 or not reason.strip() or len(reason) > 500:
        raise ValueError('Bounded timeout and nonempty reason (max 500 chars) required')
    data, entry = select(web, port)
    bind_unit(entry, unit)
    if expected != fingerprint(entry, unit):
        raise ValueError('Target differs from explicit identity fingerprint')
    verify_protected(web, data)
    records = data.setdefault('originRetirements', {})
    prior = records.get(expected)
    if prior and (prior.get('entry') != entry or prior.get('unit') != unit):
        raise ValueError('Retirement journal identity mismatch')
    if prior and prior.get('status') in ('signal_requested', 'stopped') and state.proxy.process_info(entry['pid']) is None:
        if port not in data['quarantined']:
            raise ValueError('Recovery requires quarantine')
        finish_unit(entry, unit)
        prior.update(status='stopped', completedAt=int(time.time()))
        state.write_state(web, data)
        return prior
    if state.proxy.process_info(entry['pid']) is None:
        if not acknowledge:
            raise ValueError('Missing process has unknown job state; explicit acknowledgement required')
        finish_unit(entry, unit)
        record = {'entry': entry, 'unit': unit, 'status': 'stopped', 'completedAt': int(time.time()),
                  'reason': reason, 'untrackedWorkAcknowledged': True, 'quiescenceProven': False,
                  'remainingCoverage': ['process_missing_job_state_unknown'], 'artifactsPreserved': True}
        records[expected] = record
        if port not in data['quarantined']:
            data['quarantined'].append(port)
        state.write_state(web, data)
        return record
    verify_target(entry, unit)
    value = registry(entry)
    if value.get('retirementEligible') is not True and not acknowledge:
        raise ValueError('Untracked work is not proven; explicit acknowledgement required')
    record = {'entry': entry, 'unit': unit, 'status': 'draining', 'startedAt': int(time.time()),
              'reason': reason, 'untrackedWorkAcknowledged': acknowledge,
              'quiescenceProven': value.get('retirementEligible') is True,
              'remainingCoverage': value.get('remainingCoverage'), 'artifactsPreserved': True}
    records[expected] = record
    if port not in data['quarantined']:
        data['quarantined'].append(port)
    # Quarantine and journal are durable BEFORE admission changes/signals.
    state.write_state(web, data)
    try:
        deadline = time.monotonic() + timeout
        value = registry(entry, 'drain')
        while not drained(value):
            if time.monotonic() >= deadline:
                raise ValueError('Drain timeout; target remains quarantined, no signal sent')
            time.sleep(0.5)
            verify_target(entry, unit)
            value = registry(entry)
        # Re-read canonical state and routing immediately before the signal.
        current, same = select(web, port)
        if current != data or same != entry:
            raise ValueError('Serving state changed during retirement')
        verify_protected(web, current)
        fd = os.pidfd_open(entry['pid'])
        try:
            verify_target(entry, unit)
            value = registry(entry)
            if not drained(value) or (value.get('retirementEligible') is not True and not acknowledge):
                raise ValueError('Drain evidence changed before signal')
            record.update(status='signal_requested', quiescenceProven=value.get('retirementEligible') is True)
            state.write_state(web, data)
            signal.pidfd_send_signal(fd, signal.SIGTERM)
        finally:
            os.close(fd)
        deadline = time.monotonic() + timeout
        while state.proxy.process_info(entry['pid']) is not None or members(unit):
            if time.monotonic() >= deadline:
                raise ValueError('Exit timeout; no forced kill attempted')
            time.sleep(0.5)
        finish_unit(entry, unit)
        verify_protected(web, data)
        record.update(status='stopped', completedAt=int(time.time()))
        state.write_state(web, data)
        return record
    except Exception:
        # The last durable draining/signal_requested checkpoint is recoverable.
        # Never overwrite concurrent state when revalidation has just failed.
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--web', required=True, type=Path)
    parser.add_argument('--port', required=True, type=int)
    parser.add_argument('--unit', required=True)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--expect')
    parser.add_argument('--lock-fd', type=int)
    parser.add_argument('--acknowledge-untracked-work', action='store_true')
    parser.add_argument('--reason', default='')
    parser.add_argument('--timeout', type=int, default=60)
    args = parser.parse_args()
    try:
        web = args.web.resolve(strict=True)
        result = (retire(web, args.port, args.unit, args.expect, args.lock_fd,
                         args.acknowledge_untracked_work, args.reason, args.timeout)
                  if args.apply else inspect(web, args.port, args.unit))
        print(json.dumps(result, indent=2))
        return 0
    except Exception as exc:
        # Network/supervisor exception strings can contain private context.
        print(json.dumps({'outcome': 'refused_or_incomplete', 'errorKind': type(exc).__name__,
                          'reason': str(exc) if type(exc) is ValueError else 'Inspect private runtime evidence; retry exact intent'}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
