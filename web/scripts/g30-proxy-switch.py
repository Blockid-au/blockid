#!/usr/bin/env python3
"""Guarded Linux/nginx port switch. Dry-run by default; never stops an app.

Caller owns deploy lock, candidate readiness, public identity checks, and app drain.
nginx worker exit proves old HTTP clients finished, not background jobs completed.
Reference: https://nginx.org/en/docs/control.html (graceful HUP reload).
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time


class Refused(RuntimeError):
    pass


def parse_config(text):
    # Small fail-closed parser for this host's explicit directives; preserve spans.
    tokens = list(re.finditer(r'#[^\n]*|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|[{};]|[^\s{};#]+', text))
    tokens = [t for t in tokens if not t.group().startswith('#')]
    pos = 0

    def block(nested=False):
        nonlocal pos
        nodes = []
        while pos < len(tokens):
            if tokens[pos].group() == '}':
                if not nested:
                    raise Refused('Unexpected closing brace')
                pos += 1
                return nodes
            words = []
            while pos < len(tokens) and tokens[pos].group() not in ('{', '}', ';'):
                words.append(tokens[pos]); pos += 1
            if not words or pos == len(tokens) or tokens[pos].group() == '}':
                raise Refused('Unsupported nginx syntax')
            delimiter = tokens[pos].group(); pos += 1
            nodes.append((words, block(True) if delimiter == '{' else None))
        if nested:
            raise Refused('Unclosed nginx block')
        return nodes
    return block()


def select(nodes, words):
    return [n for n in nodes if [t.group() for t in n[0]] == words]


def one(nodes, label):
    if len(nodes) != 1:
        raise Refused(f'Expected exactly one {label}; found {len(nodes)}')
    return nodes[0]


def render_switch(text, from_port, to_port):
    allowed = lambda port: type(port) is int and (port in (4001, 4099) or 4100 <= port <= 4199)
    if not allowed(from_port) or not allowed(to_port) or from_port == to_port:
        raise Refused('Ports must differ within reserved 4001/4099/4100–4199 origins')
    nodes = parse_config(text)
    upstream = one(select(nodes, ['upstream', 'blockid_app']), 'blockid_app upstream')
    children = upstream[1] or []
    servers = [n for n in children if n[0][0].group() == 'server']
    server = one(servers, 'upstream server')
    if [t.group() for t in server[0]] != ['server', f'127.0.0.1:{from_port}']:
        raise Refused('Unexpected upstream source port/options')
    if any(n[0][0].group() not in ('server', 'keepalive') for n in children):
        raise Refused('Unexpected upstream directives')
    upload = []
    for n in select(nodes, ['server']):
        for directive in n[1] or []:
            values = [t.group() for t in directive[0]]
            if values and values[0] == 'server_name' and 'upload.blockid.au' in values[1:]:
                upload.append(n)
    upload = one(upload, 'upload server')
    location = one(select(upload[1], ['location', '/api/']), 'upload /api/ location')
    proxies = [n for n in location[1] or [] if n[0][0].group() == 'proxy_pass']
    proxy = one(proxies, 'upload proxy_pass')
    if [t.group() for t in proxy[0]] != ['proxy_pass', f'http://127.0.0.1:{from_port}']:
        raise Refused('Unexpected upload source port/options')
    changes = [(server[0][1], f'127.0.0.1:{to_port}'), (proxy[0][1], f'http://127.0.0.1:{to_port}')]
    for token, value in sorted(changes, key=lambda c: c[0].start(), reverse=True):
        text = text[:token.start()] + value + text[token.end():]
    return text


def require_lock(fd, lock_path=Path('/tmp/blockid-deploy.lock'), owner_pid=None):
    if fd is None:
        raise Refused('Apply requires an inherited exclusive deploy-lock FD')
    owner = 'self'
    if owner_pid is not None:
        if os.geteuid() != 0:
            raise Refused('Delegated lock verification requires root')
        ancestor = os.getppid()
        while ancestor > 1 and ancestor != owner_pid:
            info = process_info(ancestor)
            if not info:
                break
            ancestor = info['parent']
        if ancestor != owner_pid:
            raise Refused('Lock owner must be a live ancestor of this helper')
        owner = str(owner_pid)
    actual = Path(f'/proc/{owner}/fd/{fd}').stat()
    expected = lock_path.stat()
    if (actual.st_dev, actual.st_ino) != (expected.st_dev, expected.st_ino):
        raise Refused('FD does not reference the canonical deploy-lock inode')
    info = Path(f'/proc/{owner}/fdinfo/{fd}').read_text()
    if not re.search(r'^lock:\s+\d+: FLOCK\s+ADVISORY\s+WRITE\s', info, re.M):
        raise Refused('Inherited FD does not own an exclusive FLOCK')


def process_info(pid):
    try:
        raw = Path(f'/proc/{pid}/stat').read_text()
        fields = raw[raw.rfind(')') + 2:].split()
        cmd = Path(f'/proc/{pid}/cmdline').read_bytes().replace(b'\0', b' ').decode(errors='replace')
        return {'pid': pid, 'start': fields[19], 'parent': int(fields[1]), 'command': cmd}
    except FileNotFoundError:
        return None


def snapshot_workers(master):
    leader = process_info(master)
    if not leader or 'nginx: master process' not in leader['command']:
        raise Refused('Cannot identify nginx master')
    workers = []
    for entry in Path('/proc').iterdir():
        if entry.name.isdigit():
            item = process_info(int(entry.name))
            if item and item['parent'] == master and 'nginx: worker process' in item['command']:
                workers.append({'pid': item['pid'], 'start': item['start']})
    if not workers:
        raise Refused('Cannot identify nginx workers')
    return workers


def wait_new_workers(master, old, timeout=10):
    old_ids = {(w['pid'], w['start']) for w in old}
    deadline = time.monotonic() + timeout
    while True:
        current = snapshot_workers(master)
        if any((w['pid'], w['start']) not in old_ids for w in current):
            return
        if time.monotonic() >= deadline:
            raise Refused('Reload did not produce a new nginx worker generation')
        time.sleep(0.2)


def drain_workers(state, timeout=60):
    workers = state.get('old_workers')
    if not isinstance(workers, list) or not workers:
        raise Refused('Missing captured old-worker identities; retain old app')
    master = state.get('master_pid')
    if not isinstance(master, int) or master <= 1:
        raise Refused('Invalid nginx master identity')
    deadline = time.monotonic() + timeout
    while True:
        leader = process_info(master)
        if not leader or 'nginx: master process' not in leader['command'] or (state.get('master_start') and leader['start'] != state['master_start']):
            raise Refused('Master unavailable/changed during drain; retain old app')
        pending = []
        for worker in workers:
            if not isinstance(worker.get('pid'), int) or not str(worker.get('start', '')).isdigit():
                raise Refused('Invalid worker identity')
            item = process_info(worker['pid'])
            if item and item['start'] == str(worker['start']):
                pending.append(worker)
        if not pending:
            return {'outcome': 'drained', 'safe_to_stop_old_http_app': True}
        if time.monotonic() >= deadline:
            return {'outcome': 'drain_pending', 'safe_to_stop_old_http_app': False, 'pending_workers': pending}
        time.sleep(min(1, max(0, deadline - time.monotonic())))


def atomic_write(path, content, metadata):
    fd, name = tempfile.mkstemp(prefix=f'.{path.name}.g30-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(content)
            os.fchown(stream.fileno(), metadata.st_uid, metadata.st_gid)
            os.fchmod(stream.fileno(), stat.S_IMODE(metadata.st_mode))
            stream.flush(); os.fsync(stream.fileno())
        os.replace(name, path)
        directory = os.open(path.parent, os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def nginx(command):
    result = subprocess.run(['/usr/sbin/nginx', *command], capture_output=True, text=True, timeout=15)
    if result.returncode:
        raise Refused(f'nginx {" ".join(command)} failed: {result.stderr[-1000:]}')


def switch(config, from_port, to_port, apply=False, lock_fd=None, master_file=Path('/run/nginx.pid'), lock_owner_pid=None):
    path = config.resolve(strict=True)
    metadata = path.stat()
    original = path.read_bytes()
    candidate = render_switch(original.decode(), from_port, to_port).encode()
    result = {'outcome': 'planned', 'config': str(path), 'from_port': from_port, 'to_port': to_port,
              'before_sha256': hashlib.sha256(original).hexdigest(), 'after_sha256': hashlib.sha256(candidate).hexdigest(),
              'app_health_verified': False, 'safe_to_stop_old_http_app': False}
    if not apply:
        return result
    require_lock(lock_fd, owner_pid=lock_owner_pid)
    master = int(master_file.read_text().strip())
    old = snapshot_workers(master)
    # Verify the existing global configuration before making a recoverable edit.
    nginx(['-t'])
    backup = path.with_name(f'{path.name}.g30-backup-{time.time_ns()}')
    shutil.copy2(path, backup)
    os.chown(backup, metadata.st_uid, metadata.st_gid)
    with backup.open('rb') as stream:
        os.fsync(stream.fileno())
    result.update(backup=str(backup), master_pid=master, master_start=process_info(master)['start'], old_workers=old)
    if path.read_bytes() != original:
        raise Refused('Config changed during preflight; no switch performed')
    try:
        atomic_write(path, candidate, metadata)
        nginx(['-t'])
        nginx(['-s', 'reload'])
        wait_new_workers(master, old)
        result['outcome'] = 'switched'
    except Exception as error:
        result.update(outcome='switch_failed', error=str(error), restoration_verified=False)
        try:
            # Do not overwrite a concurrent editor's configuration.
            if path.read_bytes() not in (original, candidate):
                raise Refused('Concurrent configuration edit detected; manual recovery required')
            atomic_write(path, original, metadata)
            nginx(['-t'])
            before_restore = snapshot_workers(master)
            nginx(['-s', 'reload'])
            wait_new_workers(master, before_restore)
            result['restoration_verified'] = path.read_bytes() == original
        except Exception as restore_error:
            result['restoration_error'] = str(restore_error)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=Path('/etc/nginx/sites-enabled/blockid-live'))
    parser.add_argument('--from-port', type=int)
    parser.add_argument('--to-port', type=int)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--current-port', action='store_true', help='Read validated configured origin port without mutation')
    parser.add_argument('--lock-fd', type=int)
    parser.add_argument('--sudo', action='store_true', help='Delegate privileged operations while this process holds the deploy lock')
    parser.add_argument('--lock-owner-pid', type=int, help=argparse.SUPPRESS)
    parser.add_argument('--drain-state', type=Path)
    parser.add_argument('--drain-timeout', type=int, default=60)
    args = parser.parse_args()
    try:
        if args.current_port:
            if args.apply or args.sudo or args.drain_state:
                raise Refused('Current-port is read-only')
            text = args.config.read_text()
            upstream = one(select(parse_config(text), ['upstream', 'blockid_app']), 'upstream')
            server = one([n for n in upstream[1] if n[0][0].group() == 'server'], 'upstream server')
            port = int(server[0][1].group().split(':')[-1])
            render_switch(text, port, 4001 if port != 4001 else 4100)
            print(port); return 0
        if args.apply and args.config.resolve() != Path('/etc/nginx/sites-available/blockid-live'):
            raise Refused('Apply only supports the canonical blockid-live configuration')
        if args.sudo:
            if not args.apply or args.drain_state or args.lock_owner_pid is not None:
                raise Refused('--sudo requires --apply and direct lock ownership')
            require_lock(args.lock_fd)
            command = ['sudo', '-n', sys.executable, str(Path(__file__).resolve()),
                       '--apply', '--config', str(args.config), '--from-port', str(args.from_port),
                       '--to-port', str(args.to_port), '--lock-fd', str(args.lock_fd),
                       '--lock-owner-pid', str(os.getpid())]
            # Keep the ancestor/lock alive until the privileged child exits.
            # A wrapper timeout could orphan a config mutation after releasing it;
            # nginx commands and worker-generation waits are bounded inside.
            completed = subprocess.run(command, capture_output=True, text=True)
            if completed.stdout.strip():
                print(completed.stdout.strip())
            else:
                print(json.dumps({'outcome': 'refused', 'error': completed.stderr[-1000:], 'safe_to_stop_old_http_app': False}))
            return completed.returncode
        if args.drain_state:
            if args.apply or args.from_port or args.to_port or not 0 <= args.drain_timeout <= 600:
                raise Refused('Drain only accepts state and timeout 0–600 seconds')
            result = drain_workers(json.loads(args.drain_state.read_text()), args.drain_timeout)
        else:
            result = switch(args.config, args.from_port, args.to_port, args.apply, args.lock_fd, lock_owner_pid=args.lock_owner_pid)
        print(json.dumps(result))
        return 0 if result['outcome'] in ('planned', 'switched', 'drained') else 1
    except Exception as error:
        print(json.dumps({'outcome': 'refused', 'error': str(error), 'safe_to_stop_old_http_app': False}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
