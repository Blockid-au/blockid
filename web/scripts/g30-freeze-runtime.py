#!/usr/bin/env python3
"""Freeze a NEW release's external node_modules references. Read-only by default.

Apply requires the inherited exclusive deployment flock. This never follows
arbitrary external symlinks or modifies current/previous/LKG release artifacts.
Full source/copy/source evidence rejects dependency writes during the snapshot;
package installation must also be serialized with the deployment lock.
"""
import argparse
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile


class FreezeError(RuntimeError):
    pass


def digest_bytes(value):
    return hashlib.sha256(value).hexdigest()


def stable_file(path):
    # Refuse a symlink swapped in between enumeration and opening.
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as stream:
        before = os.fstat(stream.fileno())
        digest = hashlib.sha256()
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
        after = os.fstat(stream.fileno())
    if signature(before) != signature(after) or signature(after) != signature(path.lstat()):
        raise FreezeError(f"source changed while reading: {path}")
    if not stat.S_ISREG(before.st_mode):
        raise FreezeError(f"unsupported runtime file: {path}")
    return digest.hexdigest(), after


def signature(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_size,
            info.st_mtime_ns, info.st_ctime_ns)


def inventory(root):
    records, stability = {}, {}
    for directory, dirs, files in os.walk(root, followlinks=False):
        dirs.sort()
        files.sort()
        for path in [Path(directory)] + [Path(directory) / name for name in dirs + files]:
            key = path.relative_to(root).as_posix()
            info = path.lstat()
            stability[key] = signature(info)
            mode = stat.S_IMODE(info.st_mode)
            if stat.S_ISLNK(info.st_mode):
                target = path.resolve(strict=True)
                if not target.is_relative_to(root):
                    raise FreezeError(f"dependency symlink escapes source root: {path}")
                records[key] = ["link", target.relative_to(root).as_posix()]
                stability[key] += (os.readlink(path),)
            elif stat.S_ISDIR(info.st_mode):
                records[key] = ["dir", mode]
            elif stat.S_ISREG(info.st_mode):
                content, after = stable_file(path)
                if signature(info) != signature(after):
                    raise FreezeError(f"source changed during inventory: {path}")
                records[key] = ["file", mode, info.st_size, content]
            else:
                raise FreezeError(f"unsupported dependency entry: {path}")
    canonical = json.dumps(records, sort_keys=True, separators=(",", ":")).encode()
    return digest_bytes(canonical), records, stability


def runtime_evidence(node):
    executable = Path(shutil.which(node) or node).resolve(strict=True)
    executable_hash, _ = stable_file(executable)
    result = subprocess.run([str(executable), "-p", "JSON.stringify({versions:process.versions,platform:process.platform,arch:process.arch})"],
                            check=True, capture_output=True, text=True, timeout=15)
    return {"executable_sha256": executable_hash, **json.loads(result.stdout)}


@contextmanager
def deployment_lock(fd, lock_path):
    if fd is None:
        raise FreezeError("--apply requires inherited --lock-fd")
    expected, actual = lock_path.stat(), os.fstat(fd)
    if (expected.st_dev, expected.st_ino) != (actual.st_dev, actual.st_ino):
        raise FreezeError("inherited FD does not match deployment lock")
    lines = Path(f"/proc/self/fdinfo/{fd}").read_text().splitlines()
    if not any(line.startswith("lock:") and "FLOCK" in line.split()
               and "WRITE" in line.split() for line in lines):
        raise FreezeError("inherited FD must already hold exclusive deployment flock")
    # Hold a duplicate reference for the complete transaction, never unlock it.
    with os.fdopen(os.dup(fd), "a"):
        yield


def validate_candidate(web, release):
    root = (web / "releases").resolve(strict=True)
    if release.parent != root or not release.is_dir() or release == root:
        raise FreezeError("candidate must be a direct release directory")
    for name in ("current", "previous", "last-good", "draining"):
        pin = web / f".next-{name}"
        if pin.exists() or pin.is_symlink():
            if not pin.is_symlink():
                raise FreezeError(f"ambiguous release pin: {pin}")
            if pin.resolve(strict=True) == release:
                raise FreezeError(f"refusing to change protected {name} release")
        elif name == "current":
            raise FreezeError("current release pin is missing")
    lkg = json.loads((web / "content/reports/last-good-build.json").read_text())
    build_id = lkg.get("buildId") if isinstance(lkg, dict) else None
    if not isinstance(build_id, str) or not build_id or Path(build_id).name != build_id or build_id in (".", ".."):
        raise FreezeError("LKG metadata missing valid buildId")
    lkg_path = (root / build_id).resolve(strict=True)
    if lkg_path.parent != root or lkg_path == release:
        raise FreezeError("candidate is LKG or LKG is outside release root")
    if lkg.get("releasePath") and Path(lkg["releasePath"]).resolve(strict=True) == release:
        raise FreezeError("candidate is explicit LKG releasePath")
    extra = web / "content/reports/release-retention-pins.json"
    if extra.exists() or extra.is_symlink():
        data = json.loads(extra.read_text())
        if not isinstance(data, dict) or data.get("version") != 1 or not isinstance(data.get("paths"), list):
            raise FreezeError("invalid extra release pins")
        for value in data["paths"]:
            if not isinstance(value, str) or not Path(value).is_absolute():
                raise FreezeError("invalid extra release pin path")
            pinned = Path(value).resolve(strict=True)
            if pinned.parent != root or pinned == release:
                raise FreezeError("candidate pinned or extra pin outside release root")


def link_plan(release, dependencies):
    links = []
    for directory, dirs, files in os.walk(release, followlinks=False):
        for name in sorted(dirs + files):
            path = Path(directory) / name
            if not path.is_symlink():
                continue
            target = path.resolve(strict=True)
            if target.is_relative_to(release):
                # Normalize absolute internal links so cold archives remain movable.
                if Path(os.readlink(path)).is_absolute():
                    links.append((path, "release", target.relative_to(release)))
            elif target.is_relative_to(dependencies):
                links.append((path, "dependency", target.relative_to(dependencies)))
            else:
                raise FreezeError(f"unexpected external artifact symlink: {path}")
    return links


def freeze(web, release, node="node", apply=False):
    web, release = web.resolve(strict=True), release.resolve(strict=True)
    validate_candidate(web, release)
    dependencies = (web / "node_modules").resolve(strict=True)
    if not dependencies.is_dir() or dependencies.is_relative_to(release) or release.is_relative_to(dependencies):
        raise FreezeError("invalid dependency source")
    destination_root = release / ".g30-runtime"
    if destination_root.exists() or destination_root.is_symlink():
        raise FreezeError("candidate already contains a runtime snapshot; never overwrite it")
    links = link_plan(release, dependencies)
    lockfile = web / "package-lock.json"
    lock_hash, lock_stat = stable_file(lockfile)
    runtime = runtime_evidence(node)
    tree_hash, records, stability = inventory(dependencies)
    evidence = {"version": 1, "lockfile_sha256": lock_hash,
                "runtime": runtime, "dependencies_sha256": tree_hash}
    fingerprint = digest_bytes(json.dumps(evidence, sort_keys=True, separators=(",", ":")).encode())
    result = {**evidence, "fingerprint": fingerprint, "release": str(release),
              "external_refs": sum(kind == "dependency" for _, kind, _ in links),
              "dependency_files": sum(record[0] == "file" for record in records.values()),
              "dependency_bytes": sum(record[2] for record in records.values() if record[0] == "file"),
              "apply": apply}
    if not apply:
        return result
    required_bytes = int(result["dependency_bytes"] * 1.1) + 64 * 1024 * 1024
    if shutil.disk_usage(release).free < required_bytes:
        raise FreezeError("insufficient disk headroom for independent dependency snapshot")
    stage = Path(tempfile.mkdtemp(prefix=".g30-runtime-staging-", dir=release))
    published = False
    try:
        snapshot = stage / fingerprint / "node_modules"
        # Full copy: no hardlinks to mutable source. symlinks=True avoids cycles
        # and repeated copies of packages reachable through internal links.
        shutil.copytree(dependencies, snapshot, symlinks=True)
        for relative, record in records.items():
            if record[0] == "link":
                target = snapshot / relative
                target.unlink()
                target.symlink_to(os.path.relpath(snapshot / record[1], target.parent))
        copied_hash, _, _ = inventory(snapshot)
        after_hash, _, after_stability = inventory(dependencies)
        after_lock_hash, after_lock_stat = stable_file(lockfile)
        if ((web / "node_modules").resolve(strict=True) != dependencies
                or tree_hash != copied_hash or tree_hash != after_hash or stability != after_stability
                or lock_hash != after_lock_hash or signature(lock_stat) != signature(after_lock_stat)
                or runtime != runtime_evidence(node)):
            raise FreezeError("dependency/lock/runtime changed during freeze or copy differs")
        # Final pin check under the shared deployment lock, before publication.
        validate_candidate(web, release)
        (stage / fingerprint / "manifest.json").write_text(json.dumps(evidence, sort_keys=True, indent=2) + "\n")
        stage.rename(destination_root)
        published = True
        snapshot = destination_root / fingerprint / "node_modules"
        for path, kind, relative in links:
            target = snapshot / relative if kind == "dependency" else release / relative
            temporary = path.with_name(path.name + ".g30-freeze-link")
            if temporary.exists() or temporary.is_symlink():
                raise FreezeError(f"temporary link path already exists: {temporary}")
            temporary.symlink_to(os.path.relpath(target, path.parent))
            temporary.replace(path)
        # No external references, including nested dependencies, may survive.
        for directory, dirs, files in os.walk(release, followlinks=False):
            for name in dirs + files:
                path = Path(directory) / name
                if path.is_symlink() and not path.resolve(strict=True).is_relative_to(release):
                    raise FreezeError(f"external symlink remains after freeze: {path}")
        result["snapshot"] = str(snapshot.relative_to(release))
        return result
    finally:
        if not published:
            shutil.rmtree(stage)
        # Once published, retain candidate evidence on error. Caller must reject
        # and discard this NEW candidate; it must never attempt promotion.


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--web", type=Path, required=True)
    parser.add_argument("--release", type=Path, required=True)
    parser.add_argument("--node", default="node")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--lock-fd", type=int)
    parser.add_argument("--lock", type=Path, default=Path("/tmp/blockid-deploy.lock"))
    args = parser.parse_args(argv)
    try:
        if args.apply:
            with deployment_lock(args.lock_fd, args.lock):
                result = freeze(args.web, args.release, args.node, apply=True)
        else:
            result = freeze(args.web, args.release, args.node)
        print(json.dumps(result, sort_keys=True))
        return 0
    except (FreezeError, OSError, ValueError, TypeError, RuntimeError, subprocess.SubprocessError) as error:
        print(f"runtime freeze refused: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
