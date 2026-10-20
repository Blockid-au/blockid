#!/usr/bin/env python3
"""L1-4 boot path: start the recorded G30 serving origin after a host reboot.

Origins are transient `g30-origin-*` system units (Restart=no) that do not
survive a reboot, and the watchdog only performs WARM rollback. This controller
closes that gap. It reads g30-serving-state.json and, only when the recorded
active process provably no longer exists:

  1. waits for Supabase (kong :8000) and Redis (:6379) to accept connections;
  2. quarantines dead retained origins that are neither active, previous nor
     the fallback target, so the launcher's capacity admission is not blocked by
     pre-reboot ghosts (documented G30 dead-slot rule; pins and history kept);
  3. starts the ACTIVE release on its recorded port through the same launcher a
     deploy uses (g30-supervised-launch.py), with the release's frozen
     dependency snapshot as NODE_PATH and the runtime policy flags the previous
     unit was launched with;
  4. re-attaches the new PID/startTicks to the recorded entry with
     `g30-serving-state.py --rebind` (full identity + /api/status verification);
  5. verifies nginx routes to that port (switching back to it under the lock
     when the persisted config disagrees, and closing an interrupted switching
     phase with `--activate`), then checks public identity (non-fatal).

If the active release cannot be made healthy, the previous release (or the
newest eligible verified-good origin) is cold-started and rebound instead, and
the controller exits 10 with a JSON hand-off; the wrapper then releases the lock
and runs the canonical warm rollback (`deploy-live.sh --rollback`), which
quarantines the failed origin, switches nginx and syncs the aliases.

Idempotent: a healthy, routed active origin is a no-op. A recorded active
process that is still alive but unhealthy is never duplicated — that is the
watchdog's warm-recovery case and this controller refuses (exit 1).

Dry-run (plan only) by default. --apply requires the inherited exclusive
deployment lock (--lock-fd 200); the wrapper g30-boot-serve.sh takes it.
Never stops or signals any process.
"""
import argparse
import glob
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.request

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent


def _load(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


serving = _load('g30_boot_serving', 'g30-serving-state.py')
proxy = serving.proxy

EXIT_HANDOFF = 10
DEPENDENCIES = (('supabase-kong', 8000), ('redis', 6379))
PID_FILE = Path('/tmp/blockid-production.pid')
PUBLIC_STATUS = 'https://blockid.au/api/status'


def log(event, **fields):
    print(json.dumps({'ts': int(time.time()), 'event': event, **fields}), file=sys.stderr, flush=True)


class Refused(RuntimeError):
    pass


# ── host probes (patched in tests) ───────────────────────────────────────────
def tcp_open(port, host='127.0.0.1'):
    try:
        with socket.create_connection((host, port), timeout=2):
            return True
    except OSError:
        return False


def http_ok(port):
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/', timeout=5) as response:
            return response.status == 200
    except Exception:
        return False


def process_alive(pid):
    return proxy.process_info(pid) is not None


def run(args, lock_fd=None, env=None, cwd=None, timeout=120):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout, env=env, cwd=cwd,
                          pass_fds=(lock_fd,) if lock_fd is not None else (), close_fds=True)


def state_helper(web, lock_fd, *args):
    result = run([sys.executable, str(HERE / 'g30-serving-state.py'), '--web', str(web), *args,
                  '--lock-fd', str(lock_fd)], lock_fd=lock_fd)
    if result.returncode:
        raise Refused(f'serving-state {args[0]} refused: {result.stderr.strip()[-300:]}')
    return result.stdout


def configured_port():
    result = run([sys.executable, str(HERE / 'g30-proxy-switch.py'), '--current-port'], timeout=30)
    if result.returncode:
        raise Refused('Cannot read configured nginx origin port')
    return int(result.stdout.strip())


def proxy_switch(from_port, to_port, lock_fd):
    result = run([sys.executable, str(HERE / 'g30-proxy-switch.py'), '--apply', '--sudo', '--lock-fd', str(lock_fd),
                  '--from-port', str(from_port), '--to-port', str(to_port)], lock_fd=lock_fd, timeout=180)
    if result.returncode:
        raise Refused(f'nginx switch {from_port} -> {to_port} refused')


def public_sha():
    request = urllib.request.Request(f'{PUBLIC_STATUS}?boot={int(time.time())}',
                                     headers={'Cache-Control': 'no-cache', 'User-Agent': 'BlockID-Boot-Serve/1'})
    with urllib.request.urlopen(request, timeout=8) as response:
        return json.loads(response.read(1024 * 1024)).get('git_sha', '')


# ── decisions ────────────────────────────────────────────────────────────────
def eligible(web, data, entry):
    return (entry['port'] not in data['quarantined'] and entry['port'] in data['verifiedGood']
            and Path(entry['releasePath'], 'server.js').is_file()
            and serving.schema_compatible(web, data['active'], entry))


def fallback_target(web, data):
    """Previous release first, else the newest eligible verified-good origin.

    Mirrors --rollback-target's order so the warm-rollback hand-off picks the
    origin this controller just cold-started.
    """
    active = data['active']['port']
    previous = data.get('previous')
    if previous and previous['port'] != active and eligible(web, data, previous):
        return previous
    for port in reversed(data['verifiedGood']):
        for entry in data['retained']:
            if entry['port'] == port and port != active and eligible(web, data, entry):
                return entry
    return None


def ghost_ports(data, protected):
    """Dead retained origins that still consume a capacity slot."""
    return [e['port'] for e in data['retained']
            if e['port'] not in protected and e['port'] not in data['quarantined']
            and serving.recorded_process_gone(e)]


def plan(web):
    data = serving.read_state(web)
    if not data:
        raise Refused('No G30 serving state; legacy bootstrap origin is out of scope')
    active = data['active']
    if active['port'] == 4001:
        raise Refused('Bootstrap port 4001 cannot be launched by the supervised launcher')
    gone = serving.recorded_process_gone(active)
    fallback = fallback_target(web, data)
    protected = {active['port'], (data.get('previous') or {}).get('port'), (fallback or {}).get('port')}
    return {
        'phase': data['phase'], 'activePort': active['port'], 'activeRelease': active['releasePath'],
        'activeSha': active['sha'], 'activeProcessGone': gone,
        'action': 'cold-start-active' if gone else 'verify-only',
        'fallbackPort': (fallback or {}).get('port'),
        'quarantineGhosts': ghost_ports(data, protected) if gone else [],
        'nginxPort': configured_port(),
    }


# ── launch ───────────────────────────────────────────────────────────────────
def frozen_node_path(release):
    store = Path(release) / '.g30-runtime'
    snapshots = [p / 'node_modules' for p in sorted(store.iterdir()) if (p / 'node_modules').is_dir()] if store.is_dir() else []
    if len(snapshots) != 1:
        raise Refused(f'Expected exactly one frozen runtime snapshot in {store}, found {len(snapshots)}')
    return snapshots[0]


def runtime_directory():
    import pwd
    return Path(pwd.getpwuid(os.getuid()).pw_dir) / '.local/state/blockid-runtime'


def pinned_policy(entry, directory=None):
    """Runtime policy flags the newest unit for this port+release ran with."""
    directory = directory or runtime_directory()
    tag = hashlib.sha256(entry['releasePath'].encode()).hexdigest()[:10]
    newest = None
    for path in sorted(glob.glob(str(directory / f"g30-origin-{entry['port']}-{tag}-*.service.json")), key=os.path.getmtime):
        try:
            record = json.loads(Path(path).read_text())
        except (OSError, ValueError):
            continue
        if record.get('releasePath') == entry['releasePath'] and isinstance(record.get('runtimePolicy'), dict):
            newest = record['runtimePolicy']
    return newest


def launch(web, entry, lock_fd):
    release = Path(entry['releasePath'])
    env = dict(os.environ)
    env.update(NODE_PATH=str(frozen_node_path(release)), PORT=str(entry['port']), HOSTNAME='127.0.0.1')
    policy = pinned_policy(entry)
    if policy:
        env.update({k: str(v) for k, v in policy.items()})
    result = run([sys.executable, str(HERE / 'g30-supervised-launch.py'), '--web', str(web), '--release', str(release),
                  '--port', str(entry['port']), '--apply', '--lock-fd', str(lock_fd)],
                 lock_fd=lock_fd, env=env, cwd=str(release), timeout=90)
    if result.returncode:
        raise Refused(f"supervised launch refused for :{entry['port']}")
    launched = json.loads(result.stdout)
    log('launched', port=entry['port'], unit=launched.get('unit'), pid=launched.get('pid'))
    return launched


def start_and_rebind(web, entry, lock_fd, timeout, clock=None, sleep=None):
    clock, sleep = clock or time.monotonic, sleep or time.sleep
    launched = launch(web, entry, lock_fd)
    pid = int(launched['pid'])
    deadline = clock() + timeout
    last = 'not answering'
    while clock() < deadline:
        if not process_alive(pid):
            raise Refused(f"origin :{entry['port']} exited during boot (unit {launched.get('unit')})")
        if http_ok(entry['port']):
            try:
                state_helper(web, lock_fd, '--rebind', '--listen-port', str(entry['port']), '--pid', str(pid))
                log('rebound', port=entry['port'], pid=pid)
                return pid
            except Refused as error:
                last = str(error)  # e.g. schema_migrations not yet ok while PostgREST warms
        sleep(3)
    raise Refused(f"origin :{entry['port']} not verified within {timeout}s: {last}")


def wait_dependencies(timeout, clock=None, sleep=None):
    clock, sleep = clock or time.monotonic, sleep or time.sleep
    deadline = clock() + timeout
    pending = list(DEPENDENCIES)
    while pending and clock() < deadline:
        pending = [(name, port) for name, port in pending if not tcp_open(port)]
        if pending:
            sleep(5)
    if pending:
        log('dependencies-not-ready', missing=[name for name, _ in pending])  # health wait decides
    return not pending


def ensure_routing(web, data, lock_fd):
    """nginx must point at the active port; close an interrupted switch."""
    port = data['active']['port']
    current = configured_port()
    if current != port:
        log('nginx-reconcile', configured=current, active=port)
        if data['phase'] != 'switching':
            state_helper(web, lock_fd, '--begin')
        proxy_switch(current, port, lock_fd)
        data = serving.read_state(web)
    if data['phase'] == 'switching':
        state_helper(web, lock_fd, '--activate', '--listen-port', str(port))
    if configured_port() != port:
        raise Refused('nginx does not route to the active origin after reconcile')


def verify_public(sha, attempts=5, sleep=None):
    sleep = sleep or time.sleep
    for attempt in range(attempts):
        try:
            if public_sha() == sha:
                return True
        except Exception:
            pass
        if attempt + 1 < attempts:
            sleep(2)
    return False


def apply(web, lock_fd, health_timeout, deps_timeout):
    proxy.require_lock(lock_fd)
    data = serving.read_state(web)
    if not data:
        raise Refused('No G30 serving state; legacy bootstrap origin is out of scope')
    active = data['active']
    if not serving.recorded_process_gone(active):
        try:
            serving.verify_entry(active, web)
        except Exception as error:
            raise Refused(f'Active origin process is alive but unverified ({type(error).__name__}); '
                          'warm recovery belongs to the watchdog, never a second copy')
        # A live, verified origin is not a boot case: observe routing only.
        # Reconciling a live switch belongs to the watchdog's warm controller.
        if data['phase'] != 'stable' or configured_port() != active['port']:
            raise Refused('Active origin is live but routing/phase disagrees; warm reconciliation belongs to '
                          'the watchdog (deploy-live.sh --rollback), not the boot path')
        log('noop', port=active['port'])
        return {'outcome': 'noop', 'port': active['port']}
    if active['port'] == 4001:
        raise Refused('Bootstrap port 4001 cannot be launched by the supervised launcher')

    wait_dependencies(deps_timeout)
    fallback = fallback_target(web, data)
    protected = {active['port'], (data.get('previous') or {}).get('port'), (fallback or {}).get('port')}
    for port in ghost_ports(data, protected):
        state_helper(web, lock_fd, '--quarantine', '--listen-port', str(port))
        log('quarantined-dead-origin', port=port)

    try:
        pid = start_and_rebind(web, active, lock_fd, health_timeout)
    except Refused as error:
        log('active-cold-start-failed', port=active['port'], reason=str(error))
        if not fallback:
            raise Refused(f'Active origin failed and no eligible fallback origin: {error}')
        if serving.recorded_process_gone(fallback):
            start_and_rebind(web, fallback, lock_fd, health_timeout)
        else:
            serving.verify_entry(fallback, web)
        return {'outcome': 'handoff', 'expectedActive': active['port'], 'target': fallback['port'], 'exit': EXIT_HANDOFF}

    data = serving.read_state(web)
    ensure_routing(web, data, lock_fd)
    try:
        PID_FILE.write_text(f'{pid}\n')
    except OSError:
        pass
    public = verify_public(active['sha'])
    log('serving', port=active['port'], pid=pid, public='verified' if public else 'external_unverified')
    return {'outcome': 'started', 'port': active['port'], 'pid': pid, 'public': 'verified' if public else 'external_unverified'}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--web', type=Path, required=True)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--lock-fd', type=int)
    parser.add_argument('--health-timeout', type=int, default=240, help='seconds per origin to answer and verify')
    parser.add_argument('--deps-timeout', type=int, default=600, help='seconds to wait for Supabase/Redis ports')
    args = parser.parse_args(argv)
    try:
        web = args.web.resolve(strict=True)
        if not args.apply:
            print(json.dumps({'plan': True, **plan(web)})); return 0
        result = apply(web, args.lock_fd, args.health_timeout, args.deps_timeout)
        print(json.dumps(result))
        return result.get('exit', 0)
    except Exception as error:
        print(json.dumps({'ok': False, 'error': 'boot_serve_refused', 'kind': type(error).__name__, 'detail': str(error)[:400]}), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
