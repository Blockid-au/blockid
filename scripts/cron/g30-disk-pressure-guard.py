#!/usr/bin/env python3
"""Bounded disk guard. Default dry-run; --apply only removes old owned log files.

No release, repository, worktree, cache, business-data or journal pruning. An
80% threshold means used / (used + space available to an unprivileged process),
as df does. Monitor each requested mount even if several share a filesystem.
Run with full /proc visibility (normally root) for cleanup; otherwise fail closed.
"""
import argparse
import fcntl
import fnmatch
import json
import math
import os
from pathlib import Path
import stat
import sys
import tempfile
import time

PATTERNS = ('blockid-build-*.log', 'blockid-deploy-*.log', 'weekly-disk-cleanup-*.log')
EXCLUDED = {'blockid-deploy-current.log', 'blockid-deploy-link-check.log'}
LOCK = Path('/tmp/blockid-deploy.lock')


def usage(path):
    v = os.statvfs(path)
    used = v.f_blocks - v.f_bfree
    denominator = used + v.f_bavail
    return {'path': str(path), 'device': os.stat(path).st_dev,
            'used_percent': math.ceil(100 * used / denominator) if denominator else 100,
            'available_bytes': v.f_bavail * v.f_frsize}


def eligible(path, owner, now, min_age):
    s = path.lstat()
    return (stat.S_ISREG(s.st_mode) and s.st_nlink == 1 and s.st_uid == owner
            and path.name not in EXCLUDED
            and any(fnmatch.fnmatchcase(path.name, pattern) for pattern in PATTERNS)
            and now - max(s.st_mtime, s.st_ctime) >= min_age)


def identity(s):
    return (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)


def open_inodes(deadline, proc=Path('/proc')):
    """Protect open descriptors AND mmap references; unreadable processes abort."""
    result = set()
    for process in proc.iterdir():
        if not process.name.isdigit():
            continue
        if time.monotonic() >= deadline:
            raise TimeoutError('process inspection exceeded time budget')
        try:
            for fd in (process / 'fd').iterdir():
                try:
                    s = fd.stat()
                    result.add((s.st_dev, s.st_ino))
                except FileNotFoundError:
                    pass  # A descriptor closed or a process exited.
            for line in (process / 'maps').read_text().splitlines():
                fields = line.split(None, 5)
                if len(fields) >= 5 and fields[4] != '0':
                    major, minor = fields[3].split(':')
                    result.add((os.makedev(int(major, 16), int(minor, 16)), int(fields[4])))
        except (FileNotFoundError, ProcessLookupError):
            continue
    return result


def clean_logs(root, owner, pressure_devices, maintenance, apply, deadline,
               max_files=50, max_bytes=256 * 1024 * 1024, min_age=14 * 86400):
    removed = []
    skipped = 0
    total = 0
    # No recursion; never follows directory aliases. Bound enumeration too.
    if root.is_symlink() or root.resolve() != root:
        raise ValueError('log directory must be a canonical directory')
    with os.scandir(root) as entries:
        for index, entry in enumerate(entries):
            if index >= 20000 or time.monotonic() >= deadline:
                return removed, skipped, 'budget_exhausted'
            path = Path(entry.path)
            try:
                if not eligible(path, owner, time.time(), min_age):
                    continue
                before = path.lstat()
                if not maintenance and before.st_dev not in pressure_devices:
                    continue
                if len(removed) >= max_files or total + before.st_size > max_bytes:
                    skipped += 1
                    continue
                # Full visibility is mandatory even for a dry-run deletion proposal.
                if (before.st_dev, before.st_ino) in open_inodes(deadline):
                    skipped += 1
                    continue
                if identity(path.lstat()) != identity(before) or not eligible(path, owner, time.time(), min_age):
                    skipped += 1
                    continue
                if apply:
                    path.unlink()
                total += before.st_size
                removed.append({'name': path.name, 'bytes': before.st_size})
            except FileNotFoundError:
                skipped += 1
    return removed, skipped, 'complete'


def save_summary(path, summary):
    # One bounded latest snapshot, never an indefinitely growing log. Private dir.
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if path.parent.is_symlink() or path.parent.resolve() != path.parent:
        raise ValueError('summary parent must be canonical')
    mode = path.parent.stat()
    if mode.st_uid != os.getuid() or mode.st_mode & 0o022:
        raise ValueError('summary parent must be owned and not group/world writable')
    fd, name = tempfile.mkstemp(prefix='.disk-guard-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(summary, stream, sort_keys=True)
            stream.write('\n')
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def performance():
    memory = {}
    for line in Path('/proc/meminfo').read_text().splitlines():
        key, value = line.split(':', 1)
        if key in ('MemTotal', 'MemAvailable', 'SwapTotal', 'SwapFree'):
            memory[key + '_bytes'] = int(value.split()[0]) * 1024
    return {'load_average': list(os.getloadavg()), 'cpu_count': os.cpu_count(), **memory}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--apply', action='store_true')
    modes.add_argument('--dry-run', action='store_true')
    parser.add_argument('--maintenance', action='store_true', help='allowlisted old logs only, even below threshold')
    parser.add_argument('--threshold', type=int, default=80)
    parser.add_argument('--log-owner-uid', type=int, default=os.getuid())
    parser.add_argument('--summary', type=Path, help='optional atomic latest local snapshot (apply only)')
    args = parser.parse_args(argv)
    if not 50 <= args.threshold <= 99 or args.log_owner_uid < 0:
        parser.error('threshold must be 50..99; owner UID must be nonnegative')
    os.nice(10)
    summary = {'version': 1, 'at': int(time.time()), 'apply': args.apply,
               'threshold': args.threshold, 'maintenance': args.maintenance,
               'removed': [], 'status': 'observed'}
    code = 0
    try:
        summary['performance'] = performance()
        summary['before'] = [usage(path) for path in ('/', '/data', '/tmp')]
        pressure = {v['device'] for v in summary['before'] if v['used_percent'] >= args.threshold}
        if pressure or args.maintenance:
            if os.geteuid() != 0:
                raise PermissionError('cleanup inspection requires root process visibility')
            fd = os.open(LOCK, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o666)
            with os.fdopen(fd, 'a') as lock:
                if not stat.S_ISREG(os.fstat(lock.fileno()).st_mode):
                    raise ValueError('deployment lock is not a regular file')
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                summary['removed'], summary['skipped'], summary['status'] = clean_logs(
                    Path('/tmp'), args.log_owner_uid, pressure, args.maintenance,
                    args.apply, time.monotonic() + 20)
        summary['after'] = [usage(path) for path in ('/', '/data', '/tmp')]
        summary['residual_pressure'] = [v['path'] for v in summary['after'] if v['used_percent'] >= args.threshold]
        if summary['residual_pressure']:
            summary['action_needed'] = 'Manual capacity/retention review; no destructive escalation.'
            code = 2
    except BlockingIOError:
        summary['status'] = 'skipped_deployment_lock_busy'
        code = 75
    except (OSError, ValueError) as error:
        summary['status'] = 'refused'
        summary['reason'] = type(error).__name__
        summary['action_needed'] = 'Inspect mount availability or process visibility; cleanup failed closed.'
        code = 1
    if args.summary and args.apply:
        try:
            save_summary(args.summary, summary)
        except (OSError, ValueError):
            summary['summary_write_failed'] = True
            code = 1
    print(json.dumps(summary, sort_keys=True))
    return code


if __name__ == '__main__':
    sys.exit(main())
