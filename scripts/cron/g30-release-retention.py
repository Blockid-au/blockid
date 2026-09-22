#!/usr/bin/env python3
"""Fail-closed release retention, serialized with deploy-live.sh's flock.

Pins are resolved before any deletion. Keep count is a minimum recent window,
never a cap on protected releases. No production defaults: callers supply web.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import shutil
import sys


class UnsafeRetention(RuntimeError):
    pass


def retention_plan(web: Path, keep: int):
    if keep < 2:
        raise UnsafeRetention("at least two recent releases must be retained")
    root = (web / "releases").resolve(strict=True)
    if not root.is_dir() or root == Path(root.anchor):
        raise UnsafeRetention("invalid release root")
    entries = list(root.iterdir())
    # Do not follow release aliases during deletion or silently guess their owner.
    if any(p.is_symlink() for p in entries):
        raise UnsafeRetention("release directory contains ambiguous symlink entries")
    releases = [p for p in entries if p.is_dir()]
    pins = set()

    def pin(path):
        resolved = path.resolve(strict=True)
        if resolved.parent != root or not resolved.is_dir():
            raise UnsafeRetention(f"pin outside direct release directory: {path}")
        pins.add(resolved)

    for name in ("current", "previous", "candidate", "draining", "last-good"):
        path = web / f".next-{name}"
        if path.is_symlink() or path.exists():
            if not path.is_symlink():
                raise UnsafeRetention(f"release pin must be a symlink: {path}")
            pin(path)
        elif name == "current":
            raise UnsafeRetention("current release pin is missing")
    metadata = json.loads((web / "content/reports/last-good-build.json").read_text())
    if not isinstance(metadata, dict):
        raise UnsafeRetention("last-good-build must be an object")
    build_id = metadata.get("buildId")
    if not isinstance(build_id, str) or not build_id or Path(build_id).name != build_id or build_id in (".", ".."):
        raise UnsafeRetention("last-good-build has no valid buildId")
    pin(root / build_id)
    if metadata.get("releasePath"):
        pin(Path(metadata["releasePath"]))
    # Explicit optional pins for multiple simultaneously draining/eligible releases.
    extra = web / "content/reports/release-retention-pins.json"
    if extra.exists() or extra.is_symlink():
        data = json.loads(extra.read_text())
        if not isinstance(data, dict) or data.get("version") != 1 or not isinstance(data.get("paths"), list):
            raise UnsafeRetention("invalid release-retention-pins schema")
        for value in data["paths"]:
            if not isinstance(value, str) or not Path(value).is_absolute():
                raise UnsafeRetention("extra pin must be an absolute release path")
            pin(Path(value))
    recent = sorted(releases, key=lambda p: (p.stat().st_mtime_ns, p.name), reverse=True)[:keep]
    pins.update(recent)
    return root, sorted(p for p in releases if p not in pins), pins


def open_lock(path: Path, inherited_fd):
    if inherited_fd is None:
        return path.open("a")
    expected = path.stat()
    actual = os.fstat(inherited_fd)
    if (expected.st_dev, expected.st_ino) != (actual.st_dev, actual.st_ino):
        raise UnsafeRetention("inherited lock descriptor does not match deployment lock inode")
    # Linux fdinfo ties the lock to this exact open file description; checking
    # only whether another descriptor is busy would also accept a shared lock.
    info = Path(f"/proc/self/fdinfo/{inherited_fd}").read_text()
    if not any(line.startswith("lock:") and "FLOCK" in line.split()
               and "WRITE" in line.split() for line in info.splitlines()):
        raise UnsafeRetention("inherited descriptor must already hold an exclusive flock")
    return os.fdopen(os.dup(inherited_fd), "a")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--web", type=Path, required=True)
    parser.add_argument("--keep", type=int, default=6)
    parser.add_argument("--lock", type=Path, default=Path("/tmp/blockid-deploy.lock"))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--lock-fd", type=int, help="already exclusively locked inherited deployment FD (Linux)")
    args = parser.parse_args(argv)
    try:
        # Never unlink/truncate this lock: deploy and cleanup must share its inode.
        with open_lock(args.lock, args.lock_fd) as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                print("retention skipped: deployment/recovery lock held", file=sys.stderr)
                return 75
            root, removals, pins = retention_plan(args.web.resolve(strict=True), args.keep)
            print(f"retention root={root} protected={len(pins)} removable={len(removals)} dry_run={args.dry_run}")
            for release in removals:
                # Recheck immediately before deletion. Cooperating deploys hold same lock.
                if release.is_symlink() or release.resolve(strict=True).parent != root:
                    raise UnsafeRetention(f"release changed during retention: {release}")
                print(f"{'would remove' if args.dry_run else 'remove'} {release}")
                if not args.dry_run:
                    shutil.rmtree(release)
        return 0
    except (OSError, ValueError, TypeError, UnsafeRetention) as error:
        print(f"retention refused: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
