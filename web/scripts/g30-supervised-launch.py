#!/usr/bin/env python3
"""Launch retained G30 origins as system services, never executor descendants.

Default is a plan. Mutations require --apply and the existing deployment lock.
No stop/restart operation: retirement remains a separate quiescence contract.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import stat
import subprocess
import sys
import time
import uuid

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('proxy', Path(__file__).with_name('g30-proxy-switch.py'))
proxy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proxy)


def command(args):
    result = subprocess.run(['sudo', '-n', *args], capture_output=True, text=True, timeout=20, close_fds=True)
    if result.returncode:
        # Do not echo command output: EnvironmentFile parser failures may contain secrets.
        raise ValueError('Supervisor command failed; inspect the named unit privately')
    return result.stdout


def private_directory():
    # Resolve the application owner's home from the account database, never
    # inherited HOME. These files must survive temporary-file housekeeping.
    path = Path(pwd.getpwuid(os.getuid()).pw_dir) / '.local/state/blockid-runtime'
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
        raise ValueError('Runtime environment directory is not private and owner-controlled')
    return path


def environment(web, release, port):
    # Read names, not values. The caller already applied its established .env
    # loader; copying these exported values preserves that parsing contract.
    names = set()
    for line in (web / '.env').read_text().splitlines():
        match = re.match(r'^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=', line)
        if match:
            names.add(match[1])
    values = {name: os.environ[name] for name in names if name in os.environ}
    values.update(PORT=str(port), HOSTNAME='127.0.0.1', NODE_ENV='production',
                  NODE_PATH=os.environ.get('NODE_PATH', ''), PATH=os.environ.get('PATH', '/usr/bin:/bin'))
    # load_env forces these backend origins even when absent from .env.
    for name in ('NODE_OPTIONS', 'SUPABASE_URL', 'REDIS_URL'):
        if name in os.environ:
            values[name] = os.environ[name]
    snapshot = Path(values['NODE_PATH'])
    if not snapshot.is_dir() or not snapshot.resolve().is_relative_to(release):
        raise ValueError('NODE_PATH must reference the frozen release runtime')
    return values


def encode_environment(values):
    lines = []
    for key, value in sorted(values.items()):
        if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', key) or '\0' in value or '\r' in value:
            raise ValueError('Invalid environment entry')
        # systemd EnvironmentFile double quotes preserve literal newlines. This
        # is not shell syntax: no eval, expansion, or secret-bearing argv.
        quoted = value.replace('\\', '\\\\').replace('"', '\\"')
        lines.append(f'{key}="{quoted}"\n')
    return ''.join(lines)


def write_private(path, text):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as out:
        out.write(text)
        out.flush()
        os.fsync(out.fileno())


def check(unit, expected_pid=None, release=None):
    if not re.fullmatch(r'g30-(?:origin|probe)-[a-z0-9-]+\.service', unit):
        raise ValueError('Invalid G30 unit name')
    raw = command(['systemctl', 'show', unit, '--property=MainPID', '--property=ActiveState', '--property=ControlGroup'])
    info = dict(line.split('=', 1) for line in raw.splitlines() if '=' in line)
    pid = int(info.get('MainPID', '0'))
    group = info.get('ControlGroup', '')
    if info.get('ActiveState') != 'active' or pid <= 1 or (expected_pid is not None and pid != expected_pid):
        raise ValueError('Supervised process is not the expected active PID')
    if group != '/system.slice/' + unit:
        raise ValueError('Process is not in its independent system service cgroup')
    proc = Path('/proc') / str(pid)
    fields = (proc / 'stat').read_text().rsplit(')', 1)[1].split()
    if fields[0] == 'Z' or fields[1] != '1':
        raise ValueError('Main process is not owned by the system manager')
    if ('0::' + group) not in (proc / 'cgroup').read_text().splitlines():
        raise ValueError('Process cgroup does not match the supervisor')
    if release is not None and (proc / 'cwd').resolve() != release:
        raise ValueError('Supervised process has the wrong release working directory')
    return {'unit': unit, 'pid': pid, 'startTicks': fields[19], 'controlGroup': group}


def launch(web, release=None, port=None, probe=False):
    owner = pwd.getpwuid(os.getuid()).pw_name
    if os.getuid() == 0:
        raise ValueError('Launch helper must run as the application owner, not root')
    tag = uuid.uuid4().hex[:12]
    unit = f'g30-probe-{tag}.service' if probe else f'g30-origin-{port}-{hashlib.sha256(str(release).encode()).hexdigest()[:10]}-{tag}.service'
    properties = ['--property=Restart=no', '--property=ExitType=cgroup', f'--property=User={owner}']
    extras = {}
    resource_admission = None
    if probe:
        properties += ['--property=RuntimeMaxSec=15']
        executable = ['/usr/bin/sleep', '10']
    else:
        state_spec = importlib.util.spec_from_file_location('g30_resource_state', Path(__file__).with_name('g30-serving-state.py'))
        serving = importlib.util.module_from_spec(state_spec); state_spec.loader.exec_module(serving)
        data = serving.read_state(web)
        if data and serving.retained_capacity(data) >= serving.MAX_RETAINED:
            manifest = json.loads((release / '.deploy-manifest.json').read_text())
            resource_admission = serving.extra_slot_authorization(web, data, manifest.get('build_sha') or manifest.get('git_sha'), stage='launch')
            resource_spec = importlib.util.spec_from_file_location('g30_resource_limits', Path(__file__).with_name('g30-resource-admission.py'))
            resource = importlib.util.module_from_spec(resource_spec); resource_spec.loader.exec_module(resource)
            properties += resource.unit_properties()
        directory = private_directory()
        env_file = directory / (unit + '.env')
        log_file = directory / (unit + '.log')
        write_private(env_file, encode_environment(environment(web, release, port)))
        write_private(log_file, '')
        properties += ['--property=RemainAfterExit=yes', '--property=CollectMode=inactive',
                       f'--property=WorkingDirectory={release}', f'--property=EnvironmentFile={env_file}',
                       f'--property=StandardOutput=append:{log_file}', f'--property=StandardError=append:{log_file}']
        node = shutil.which('node')
        if not node:
            raise ValueError('Node executable unavailable')
        executable = [str(Path(node).resolve()), 'server.js']
        extras = {'environmentFile': str(env_file), 'log': str(log_file), 'port': port, 'releasePath': str(release)}
        if resource_admission is not None: extras['resourceAdmission'] = resource_admission
        # Persist a private unit locator BEFORE launch so interruption before
        # helper return cannot leave an unidentifiable retained service.
        metadata = directory / (unit + '.json')
        write_private(metadata, json.dumps({'unit': unit, 'phase': 'launch_requested', **extras}))
        extras['metadataFile'] = str(metadata)
    command(['systemd-run', '--quiet', *(['--collect'] if probe else []), '--service-type=exec', '--unit=' + unit, *properties, '--', *executable])
    # systemd-run (the launcher) has exited. The main process must now belong
    # to PID 1 in a separate cgroup, not the tool/deploy's process tree.
    first = check(unit, release=release)
    time.sleep(0.25)
    second = check(unit, first['pid'], release)
    if second['startTicks'] != first['startTicks']:
        raise ValueError('Main process changed during launcher survival verification')
    return {**second, **extras}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--web', required=True, type=Path)
    parser.add_argument('--release', type=Path)
    parser.add_argument('--port', type=int)
    parser.add_argument('--probe', action='store_true')
    parser.add_argument('--check', metavar='UNIT')
    parser.add_argument('--pid', type=int)
    parser.add_argument('--lock-fd', type=int)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    try:
        web = args.web.resolve(strict=True)
        release = args.release.resolve(strict=True) if args.release else None
        if not args.probe:
            if release is None or release.parent != (web / 'releases').resolve(strict=True) or not (release / 'server.js').is_file():
                raise ValueError('Expected an existing direct release')
            if not args.check and args.port not in [4099, *range(4100, 4200)]:
                raise ValueError('Expected a reserved candidate port')
        if not args.apply:
            print(json.dumps({'plan': True, 'probe': args.probe, 'releasePath': str(release) if release else None, 'port': args.port})); return 0
        proxy.require_lock(args.lock_fd)
        result = check(args.check, args.pid, release) if args.check else launch(web, release, args.port, args.probe)
        print(json.dumps(result)); return 0
    except Exception as exc:
        # Never print arbitrary provider/subprocess/env exception strings.
        print(json.dumps({'ok': False, 'error': 'supervised_launch_refused', 'kind': type(exc).__name__}), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
