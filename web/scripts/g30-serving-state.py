#!/usr/bin/env python3
"""G30 non-stopping release state v1. Readers fail closed during switching.

No process termination or release retirement. All retained processes stay pinned
until a separate O08 quiescence contract can prove retirement safe.
"""
import argparse
import importlib.util
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import sys
import tempfile
import time
from datetime import datetime, timezone
import urllib.request

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('g30_proxy', Path(__file__).with_name('g30-proxy-switch.py'))
proxy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proxy)
MAX_RETAINED = 5
MIN_AVAILABLE_KIB = 1024 * 1024


def allowed_port(port):
    return type(port) is int and (port in (4001, 4099) or 4100 <= port <= 4199)


def validate_entry(entry, web):
    if not isinstance(entry, dict) or not allowed_port(entry.get('port')):
        raise ValueError('Invalid serving entry/port')
    if type(entry.get('pid')) is not int or entry['pid'] <= 1:
        raise ValueError('Invalid PID')
    if not isinstance(entry.get('startTicks'), str) or not entry['startTicks'].isdigit():
        raise ValueError('Invalid process startTicks')
    if not re.fullmatch(r'[a-f0-9]{40}', entry.get('sha', '')):
        raise ValueError('Invalid release SHA')
    if not re.fullmatch(r'[a-f0-9]{64}', entry.get('schemaDigest', '')):
        raise ValueError('Missing migration compatibility fingerprint')
    path = Path(entry.get('releasePath', ''))
    root = (web / 'releases').resolve(strict=True)
    if not path.is_absolute() or path.resolve(strict=True) != path or path.parent != root or not (path / 'server.js').is_file():
        raise ValueError('Entry must reference an existing direct immutable release')
    return entry


def state_path(web):
    return web / 'content/reports/g30-serving-state.json'


def read_state(web):
    path = state_path(web)
    if not path.exists() and not path.is_symlink():
        return None
    data = json.loads(path.read_text())
    if not isinstance(data, dict) or data.get('version') != 1 or data.get('phase') not in ('stable', 'switching'):
        raise ValueError('Invalid serving-state schema')
    retained = data.get('retained')
    if not isinstance(retained, list) or not retained:
        raise ValueError('Missing retained processes')
    for entry in retained:
        validate_entry(entry, web)
    if len({e['port'] for e in retained}) != len(retained) or len({e['pid'] for e in retained}) != len(retained):
        raise ValueError('Duplicate retained process/port')
    for key in ('verifiedGood', 'quarantined'):
        if not isinstance(data.get(key), list) or any(not allowed_port(p) or p not in [e['port'] for e in retained] for p in data[key]):
            raise ValueError(f'Invalid {key} eligibility')
    for key in ('active', 'previous'):
        if key == 'previous' and data.get(key) is None:
            continue
        validate_entry(data.get(key), web)
        if data[key] not in retained:
            raise ValueError(f'{key} is not retained')
    return data


def verify_entry(entry, web=None):
    info = proxy.process_info(entry['pid'])
    if not info or info['start'] != entry['startTicks']:
        raise ValueError('Process missing or PID reused')
    if Path(f'/proc/{entry["pid"]}/cwd').resolve(strict=True) != Path(entry['releasePath']):
        raise ValueError('Process cwd does not match release')
    # Require the exact process to own this listening socket, not merely a
    # different server answering on the expected port.
    sockets = set()
    for fd in Path(f'/proc/{entry["pid"]}/fd').iterdir():
        try:
            target = os.readlink(fd)
            if target.startswith('socket:['):
                sockets.add(target[8:-1])
        except FileNotFoundError:
            pass
    listeners = []
    for name in ('tcp', 'tcp6'):
        for line in Path(f'/proc/net/{name}').read_text().splitlines()[1:]:
            fields = line.split()
            if fields[3] == '0A' and int(fields[1].split(':')[1], 16) == entry['port']:
                listeners.append(fields[9])
    if not listeners or not all(inode in sockets for inode in listeners):
        raise ValueError('Retained PID does not own the expected listening port')
    token = os.environ.get('STATUS_FULL_TOKEN') or os.environ.get('CRON_SECRET')
    if not token and web is not None:
        values = {}
        for line in (web / '.env').read_text().splitlines():
            key, sep, value = line.strip().partition('=')
            if sep and key in ('STATUS_FULL_TOKEN', 'CRON_SECRET'):
                value = value.strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in (chr(34), chr(39)):
                    value = value[1:-1]
                values[key] = value
        token = values.get('STATUS_FULL_TOKEN') or values.get('CRON_SECRET')
    if not token:
        raise ValueError('Trusted status token required for schema verification')
    req = urllib.request.Request(f'http://127.0.0.1:{entry["port"]}/api/status', headers={'Cache-Control': 'no-cache', 'User-Agent': 'BlockID-Release-Controller/1', 'Authorization': f'Bearer {token}'})
    with urllib.request.urlopen(req, timeout=8) as response:
        payload = json.loads(response.read(1024 * 1024))
        if response.status != 200 or payload.get('git_sha') != entry['sha'] or payload.get('schema_migrations') != 'ok':
            raise ValueError('Origin release identity/health mismatch')
    return entry


def make_entry(web, port, pid, release):
    path = release.resolve(strict=True)
    manifest = json.loads((path / '.deploy-manifest.json').read_text())
    info = proxy.process_info(pid)
    if not info:
        raise ValueError('Process is not alive')
    migration = json.loads((path / 'content/reports/schema-migrations.json').read_text())
    if not isinstance(migration.get('files'), list) or not migration.get('ledger_present'):
        raise ValueError('Missing migration manifest/ledger')
    digest = hashlib.sha256(json.dumps({'files': sorted(migration['files']), 'deferred': migration.get('deferred', [])}, sort_keys=True).encode()).hexdigest()
    entry = {'schemaDigest': digest, 'port': port, 'pid': pid, 'startTicks': info['start'], 'releasePath': str(path),
             'sha': manifest.get('build_sha') or manifest.get('git_sha')}
    validate_entry(entry, web)
    return verify_entry(entry, web)


def atomic_json(path, data):
    fd, name = tempfile.mkstemp(prefix=f'.{path.name}.', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as out:
            json.dump(data, out); out.write('\n'); out.flush(); os.fsync(out.fileno())
        os.replace(name, path)
        directory = os.open(path.parent, os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def write_state(web, data):
    pins_path = web / 'content/reports/release-retention-pins.json'
    pins = {'version': 1, 'paths': []}
    if pins_path.exists() or pins_path.is_symlink():
        pins = json.loads(pins_path.read_text())
        if not isinstance(pins, dict) or pins.get('version') != 1 or not isinstance(pins.get('paths'), list):
            raise ValueError('Malformed retention pins')
        if not all(isinstance(p, str) and Path(p).is_absolute() for p in pins['paths']):
            raise ValueError('Invalid retention pin paths')
    pins['paths'] = sorted(set(pins['paths']) | {e['releasePath'] for e in data['retained']})
    # Write protection before serving state: failure leaves extra protection,
    # never an active/retained process whose release cleanup may delete.
    atomic_json(pins_path, pins)
    atomic_json(state_path(web), data)


def allocate(data, web=None):
    if web is not None:
        pin = web / ".next-candidate"
        if pin.exists() or pin.is_symlink():
            retained_paths = {e["releasePath"] for e in (data or {}).get("retained", [])}
            if str(pin.resolve(strict=True)) not in retained_paths:
                raise ValueError("Unregistered candidate remains pinned; inspect before another admission")
    if data and (data['phase'] != 'stable' or len(data['retained']) >= MAX_RETAINED):
        raise ValueError('Promotion blocked: switching or retained-process cap (5); never kill to free capacity')
    available = int(re.search(r'^MemAvailable:\s+(\d+)', Path('/proc/meminfo').read_text(), re.M).group(1))
    if available < MIN_AVAILABLE_KIB:
        raise ValueError('Less than 1 GiB available memory; promotion deferred')
    used = {e['port'] for e in data['retained']} if data else {4001}
    for port in range(4100, 4200):
        if port in used:
            continue
        with socket.socket() as probe:
            try:
                probe.bind(('127.0.0.1', port))
            except OSError:
                continue
            return port
    raise ValueError('No free reserved candidate port')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--web', type=Path, required=True)
    command = parser.add_mutually_exclusive_group(required=True)
    for name in ('port', 'snapshot', 'verify-active', 'verify-port', 'rollback-target', 'gates-passed', 'mark-good', 'quarantine', 'init', 'allocate', 'register', 'begin', 'activate', 'stable'):
        command.add_argument('--' + name, action='store_true')
    parser.add_argument('--lock-fd', type=int)
    parser.add_argument('--listen-port', type=int)
    parser.add_argument('--pid', type=int)
    parser.add_argument('--release', type=Path)
    parser.add_argument('--rollback', action='store_true', help='Activation clears previous; never offer failed candidate as rollback target')
    parser.add_argument('--review-deferred', action='store_true', help='Founder-authorized accelerated mark-good: 60-second operational soak; extended review remains pending')
    args = parser.parse_args()
    if args.review_deferred and not args.mark_good:
        parser.error('--review-deferred is only valid with --mark-good')
    try:
        web = args.web.resolve(strict=True)
        data = read_state(web)
        if args.port:
            if data and data['phase'] != 'stable':
                raise ValueError('Origin switching; pause mutation/recovery callers')
            print(data['active']['port'] if data else 4001); return 0
        if args.snapshot:
            if not data:
                raise ValueError('No serving state (bootstrap)')
            print(json.dumps(data)); return 0
        if args.rollback_target:
            if not data:
                raise ValueError('No G30 warm rollback state')
            for port in reversed(data['verifiedGood']):
                matches = [e for e in data['retained'] if e['port'] == port and (port != data['active']['port'] or data['phase'] == 'switching') and port not in data['quarantined'] and e['schemaDigest'] == data['active']['schemaDigest']]
                if matches:
                    try:
                        print(json.dumps(verify_entry(matches[0], web))); return 0
                    except Exception:
                        continue
            raise ValueError('No compatible verified warm rollback target')
        if args.verify_port:
            targets = [e for e in (data or {}).get('retained', []) if e['port'] == args.listen_port]
            if len(targets) != 1:
                raise ValueError('No retained origin at requested port')
            print(json.dumps(verify_entry(targets[0], web))); return 0
        if args.verify_active:
            if not data or data['phase'] != 'stable':
                raise ValueError('No stable origin to verify')
            print(json.dumps(verify_entry(data['active'], web))); return 0
        proxy.require_lock(args.lock_fd)
        if args.allocate:
            print(allocate(data, web)); return 0
        if args.init:
            if data:
                if data['phase'] != 'stable':
                    raise ValueError('Existing state is switching; explicit recovery required')
                if data['active']['port'] not in data['verifiedGood'] or data['active']['port'] in data['quarantined']:
                    raise ValueError('Active origin has not cleared release gates; recover/finish prior promotion first')
                verify_entry(data['active'], web)
            else:
                if args.listen_port != 4001:
                    raise ValueError('Bootstrap must be the existing port 4001')
                entry = make_entry(web, args.listen_port, args.pid, args.release)
                data = {'version': 1, 'active': entry, 'previous': None, 'retained': [entry], 'phase': 'stable', 'verifiedGood': [entry['port']], 'quarantined': []}
        else:
            if not data:
                raise ValueError('Initialize known-good serving state first')
            if args.register:
                if data['phase'] != 'stable' or len(data['retained']) >= MAX_RETAINED:
                    raise ValueError('Candidate registration deferred: phase/cap')
                entry = make_entry(web, args.listen_port, args.pid, args.release)
                if any(e['port'] == entry['port'] or e['pid'] == entry['pid'] for e in data['retained']):
                    raise ValueError('Candidate PID/port already retained')
                if entry['schemaDigest'] != data['active']['schemaDigest']:
                    raise ValueError('Schema change requires expanded compatibility/recovery plan')
                data['retained'].append(entry)
            elif args.gates_passed:
                if data['phase'] != 'stable' or data['active']['port'] in data['quarantined']:
                    raise ValueError('Cannot start soak for unstable/quarantined origin')
                verify_entry(data['active'], web)
                data.setdefault('gatesPassedAt', {})[str(data['active']['port'])] = int(time.time())
            elif args.mark_good:
                if data['phase'] != 'stable' or data['active']['port'] in data['quarantined']:
                    raise ValueError('Cannot verify an unstable/quarantined origin')
                since = data.get('gatesPassedAt', {}).get(str(data['active']['port']))
                required_soak = 60 if args.review_deferred else 1800
                if type(since) is not int or not required_soak <= time.time() - since:
                    raise ValueError(f'Stable baseline requires at least {required_soak} seconds after release gates')
                if args.review_deferred:
                    data.setdefault('reviewDeferred', {})[str(data['active']['port'])] = {'policy': 'founder-accelerated-2026-09-22', 'minimumSoakSeconds': 60, 'recordedAt': int(time.time())}
                verify_entry(data['active'], web)
                if data['active']['port'] not in data['verifiedGood']:
                    data['verifiedGood'].append(data['active']['port'])
            elif args.quarantine:
                if args.listen_port not in [e['port'] for e in data['retained']]:
                    raise ValueError('Quarantine requires retained target')
                if args.listen_port not in data['quarantined']:
                    data['quarantined'].append(args.listen_port)
            elif args.begin:
                if data['phase'] != 'stable':
                    raise ValueError('Already switching; explicit recovery required')
                data['phase'] = 'switching'
            elif args.activate:
                if data['phase'] != 'switching':
                    raise ValueError('Activation requires switching phase')
                targets = [e for e in data['retained'] if e['port'] == args.listen_port]
                if len(targets) != 1:
                    raise ValueError('Target must be retained')
                if args.listen_port in data['quarantined'] or (args.rollback and args.listen_port not in data['verifiedGood']):
                    raise ValueError('Target is quarantined or rollback is not verified-good')
                target = verify_entry(targets[0], web)
                if target != data['active']:
                    data['previous'] = None if args.rollback else data['active']; data['active'] = target
                data['phase'] = 'stable'
            elif args.stable:
                verify_entry(data['active'], web); data['phase'] = 'stable'
        write_state(web, data)
        if args.mark_good:
            entry = data['active']
            atomic_json(web / 'content/reports/last-good-build.json', {
                'ts': datetime.now(timezone.utc).isoformat(), 'epoch': int(time.time()),
                'sha': entry['sha'], 'buildId': Path(entry['releasePath']).name,
                'releasePath': entry['releasePath'], 'pid': str(entry['pid']), 'port': entry['port'],
                'gates': 'Operational gates + 60-second soak; extended review deferred by founder' if args.review_deferred else 'G30 release gates + 30-minute soak', 'review_deferred': args.review_deferred, 'note': 'Verified immutable origin after operational soak; prior releases remain pinned'})
        print(json.dumps(data)); return 0
    except Exception as error:
        print(f'serving-state refused: {error}', file=sys.stderr); return 1


if __name__ == '__main__':
    raise SystemExit(main())
