#!/usr/bin/env python3
"""Fail-closed release retention, serialized with deploy-live.sh's flock.

DRY-RUN BY DEFAULT. Nothing is written or deleted without --apply.

Why this exists (L1-1, 2026-10-20): the old helper protected every path in
release-retention-pins.json, and g30-serving-state.write_state() unions every
`retained` releasePath into that file. Retired origins (g30-origin-retire.py)
stop the process but stay in `retained` forever, so every release ever
registered stayed pinned and /data/releases grew without bound (65 releases,
~165 GB). The port pool (4100-4199) is also consumed by those dead entries.

Keep set (each with a recorded reason):
  * the .next-{current,previous,candidate,draining,last-good} symlink targets;
  * last-good-build.json (buildId + releasePath);
  * serving-state active and previous (even if their PID is dead);
  * every retained origin whose PID is live, or whose liveness is unprovable;
  * any origin/release referenced by an unfinished transition record;
  * explicit pins that are not provably stale (stale = owned by a dead,
    unprotected retained entry, or by an entry this tool already dropped);
  * the newest --keep verified-good releases (state verifiedGood + ledger);
  * any release whose files a kept release symlinks into (runtime refs).
Everything else that looks like a release (direct child dir with server.js)
is removable. Unknown directories are never touched. A root-level
.g30-runtime/<hash> store entry is removed only when no kept release links
into it.

--apply, under the exclusive deployment lock, in crash-safe order:
  1. ledger  (content/reports/release-retention-ledger.json) gains the dropped
     entries, so verified history survives state compaction;
  2. pins    regenerated to exactly the keep set;
  3. state   dead, unprotected retained entries removed (and their ports from
     verifiedGood / quarantined / gatesPassedAt / reviewDeferred), then the
     state is re-read with the serving-state validator;
  4. delete  each removable directory, one jsonl line per removal.
Dry-run never takes the lock (deploy-live.sh uses `flock -n`; holding the lock
would abort a deploy) and never writes anything.
"""
import argparse
import datetime
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
import time

sys.dont_write_bytecode = True

PIN_LINKS = ("current", "previous", "candidate", "draining", "last-good")
TRANSITION_RECORDS = ("g30-receipt-candidate.json", "g30-schema-expansion.json",
                      "g30-authority-schema-transition.json")
FINISHED_PHASES = ("sealed", "disposed")
RUNTIME_STORE = ".g30-runtime"
SERVING_STATE_SCRIPT = Path(__file__).resolve().parents[2] / "web/scripts/g30-serving-state.py"


class UnsafeRetention(RuntimeError):
    pass


def load_serving_state_module(path=SERVING_STATE_SCRIPT):
    spec = importlib.util.spec_from_file_location("g30_serving_state_for_retention", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def reports(web):
    return web / "content/reports"


def liveness(ss, entry):
    """'dead' only when procfs PROVES the recorded process is gone.

    Dead = /proc/<pid> missing, or the PID now belongs to another task (thread
    id or different start ticks; serving-state's _pid_proven_reused). 'live'
    needs a matching start time. Anything unreadable is 'unknown' and is kept.
    """
    try:
        os.stat(f"/proc/{entry['pid']}")
    except FileNotFoundError:
        return "dead"
    except OSError:
        return "unknown"
    if ss._pid_proven_reused(entry):
        return "dead"
    info = ss.proxy.process_info(entry["pid"])
    if info and info["start"] == entry["startTicks"]:
        return "live"
    return "unknown"


def references_port(value, port):
    if isinstance(value, dict):
        return value.get("port") == port or any(references_port(v, port) for v in value.values())
    return isinstance(value, list) and any(references_port(v, port) for v in value)


def string_values(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from string_values(item)
    elif isinstance(value, list):
        for item in value:
            yield from string_values(item)


def open_transitions(web):
    records = []
    for name in TRANSITION_RECORDS:
        path = reports(web) / name
        if path.exists() or path.is_symlink():
            record = json.loads(path.read_text())
            if not isinstance(record, dict):
                raise UnsafeRetention(f"invalid transition record {name}")
            if record.get("phase") not in FINISHED_PHASES:
                records.append((name, record))
    return records


def read_ledger(web):
    path = reports(web) / "release-retention-ledger.json"
    if not (path.exists() or path.is_symlink()):
        return {"version": 1, "releases": {}}
    data = json.loads(path.read_text())
    if (not isinstance(data, dict) or data.get("version") != 1 or not isinstance(data.get("releases"), dict)
            or not all(isinstance(k, str) and Path(k).is_absolute() and isinstance(v, dict)
                       for k, v in data["releases"].items())):
        raise UnsafeRetention("invalid release-retention-ledger schema")
    return data


def read_pins(web):
    path = reports(web) / "release-retention-pins.json"
    if not (path.exists() or path.is_symlink()):
        return []
    data = json.loads(path.read_text())
    if not isinstance(data, dict) or data.get("version") != 1 or not isinstance(data.get("paths"), list):
        raise UnsafeRetention("invalid release-retention-pins schema")
    for value in data["paths"]:
        if not isinstance(value, str) or not Path(value).is_absolute():
            raise UnsafeRetention("extra pin must be an absolute release path")
    return data["paths"]


def release_order(path):
    """Deploy time: the manifest is written once at publication; the dir mtime
    moves when the runtime freeze adds .g30-runtime."""
    manifest = path / ".deploy-manifest.json"
    try:
        return (manifest.stat().st_mtime_ns, path.name)
    except FileNotFoundError:
        return (path.stat().st_mtime_ns, path.name)


def symlink_targets(release):
    """Every symlink target under a release, resolved (no link following)."""
    for directory, dirs, files in os.walk(release, followlinks=False):
        for name in dirs + files:
            path = Path(directory) / name
            if path.is_symlink():
                try:
                    yield path, Path(os.path.realpath(path))
                except OSError:
                    continue


class Plan:
    def __init__(self, root):
        self.root = root
        self.keep = {}          # Path -> [reasons]
        self.remove = []        # [(Path, kind)]
        self.foreign = []       # dirs that are not releases; never touched
        self.runtime_keep = {}  # root store hash dir -> [reasons]
        self.drop_entries = []  # retained entries removed from serving state
        self.state = None
        self.pins_before = []
        self.pins_after = []
        self.ledger = None
        self.warnings = []

    def add(self, path, reason):
        self.keep.setdefault(path, [])
        if reason not in self.keep[path]:
            self.keep[path].append(reason)

    def as_json(self, sizes=None):
        return {
            "root": str(self.root),
            "phase": self.state["phase"],
            "keep": [{"path": str(p), "reasons": r} for p, r in sorted(self.keep.items(), key=lambda kv: release_order(kv[0]), reverse=True)],
            "remove": [{"path": str(p), "kind": k, **({"bytes": sizes.get(p)} if sizes else {})} for p, k in self.remove],
            "runtime_store_keep": [{"path": str(p), "reasons": r} for p, r in sorted(self.runtime_keep.items())],
            "foreign_untouched": [str(p) for p in self.foreign],
            "drop_state_entries": [{"port": e["port"], "pid": e["pid"], "releasePath": e["releasePath"]} for e in self.drop_entries],
            "pins_before": len(self.pins_before), "pins_after": len(self.pins_after),
            "warnings": self.warnings,
        }


def retention_plan(web: Path, keep: int, ss=None):
    if keep < 2:
        raise UnsafeRetention("at least two recent releases must be retained")
    ss = ss or load_serving_state_module()
    root = (web / "releases").resolve(strict=True)
    if not root.is_dir() or root == Path(root.anchor):
        raise UnsafeRetention("invalid release root")
    plan = Plan(root)
    entries = list(root.iterdir())
    # Do not follow release aliases during deletion or silently guess their owner.
    if any(p.is_symlink() for p in entries):
        raise UnsafeRetention("release directory contains ambiguous symlink entries")
    releases = []
    for p in sorted(entries):
        if not p.is_dir():
            continue
        if p.name == RUNTIME_STORE:
            continue
        if p.name.startswith(".") or not (p / "server.js").is_file():
            plan.foreign.append(p)
            continue
        releases.append(p)
    release_set = set(releases)

    def pin(path, reason):
        resolved = Path(path).resolve(strict=True)
        if resolved.parent != root or not resolved.is_dir():
            raise UnsafeRetention(f"pin outside direct release directory: {path}")
        plan.add(resolved, reason)
        return resolved

    # 1. Serving state: required, validated, stable.
    state = ss.read_state(web)
    if state is None:
        raise UnsafeRetention("serving state missing; retention needs a known-good G30 state")
    if state["phase"] != "stable":
        raise UnsafeRetention(f"serving state phase is {state['phase']!r}; retention only runs when stable")
    plan.state = state

    # 2. Symlink pins and LKG (unchanged contract).
    for name in PIN_LINKS:
        path = web / f".next-{name}"
        if path.is_symlink() or path.exists():
            if not path.is_symlink():
                raise UnsafeRetention(f"release pin must be a symlink: {path}")
            pin(path, f"symlink .next-{name}")
        elif name == "current":
            raise UnsafeRetention("current release pin is missing")
    metadata = json.loads((reports(web) / "last-good-build.json").read_text())
    if not isinstance(metadata, dict):
        raise UnsafeRetention("last-good-build must be an object")
    build_id = metadata.get("buildId")
    if not isinstance(build_id, str) or not build_id or Path(build_id).name != build_id or build_id in (".", ".."):
        raise UnsafeRetention("last-good-build has no valid buildId")
    pin(root / build_id, "last-good-build buildId")
    if metadata.get("releasePath"):
        pin(Path(metadata["releasePath"]), "last-good-build releasePath")

    # 3. Retained origins: protected / live / transition-referenced survive.
    transitions = open_transitions(web)
    for name, record in transitions:
        for value in string_values(record):
            candidate = Path(value)
            if candidate.is_absolute() and candidate.parent == root and candidate.is_dir():
                pin(candidate, f"unfinished transition {name}")
    active_port = state["active"]["port"]
    previous_port = (state.get("previous") or {}).get("port")
    keep_entries = []
    for entry in state["retained"]:
        status = liveness(ss, entry)
        port = entry["port"]
        reasons = []
        if port == active_port:
            reasons.append("serving active")
            if status == "dead":
                plan.warnings.append(f"active origin :{port} pid {entry['pid']} is dead")
        if port == previous_port:
            reasons.append("serving previous (warm rollback)")
        if status == "live":
            reasons.append(f"live origin :{port} pid {entry['pid']}")
        elif status == "unknown":
            reasons.append(f"liveness unprovable :{port} pid {entry['pid']}")
        for name, record in transitions:
            if references_port(record, port):
                reasons.append(f"unfinished transition {name} :{port}")
        if reasons:
            keep_entries.append(entry)
            for reason in reasons:
                pin(Path(entry["releasePath"]), reason)
        else:
            plan.drop_entries.append(entry)

    # 4. Explicit pins: honoured unless provably stale.
    ledger = read_ledger(web)
    plan.ledger = ledger
    stale = {e["releasePath"] for e in plan.drop_entries} | set(ledger["releases"])
    stale -= {e["releasePath"] for e in keep_entries}
    plan.pins_before = read_pins(web)
    for value in plan.pins_before:
        if value in stale:
            continue
        pin(Path(value), "explicit pin (not owned by a dead origin)")

    # 5. Newest N verified-good releases (state verifiedGood + ledger history).
    verified = {Path(e["releasePath"]) for e in state["retained"] if e["port"] in state["verifiedGood"]}
    verified |= {Path(p) for p, info in ledger["releases"].items() if info.get("verified")}
    verified = sorted((p for p in verified if p in release_set), key=release_order, reverse=True)
    for path in verified[:keep]:
        plan.add(path, f"newest {keep} verified-good")

    # 6. Runtime references: a kept release may never lose a symlink target.
    queue = [p for p in plan.keep if p in release_set]
    scanned = set()
    while queue:
        release = queue.pop()
        if release in scanned:
            continue
        scanned.add(release)
        for link, target in symlink_targets(release):
            if not target.is_relative_to(root) or target.is_relative_to(release):
                continue
            first = root / target.relative_to(root).parts[0]
            if first.name == RUNTIME_STORE:
                parts = target.relative_to(root).parts
                if len(parts) >= 2:
                    store = root / RUNTIME_STORE / parts[1]
                    plan.runtime_keep.setdefault(store, [])
                    reason = f"referenced by {release.name}"
                    if reason not in plan.runtime_keep[store]:
                        plan.runtime_keep[store].append(reason)
            elif first in release_set:
                if first not in plan.keep:
                    queue.append(first)
                plan.add(first, f"runtime referenced by {release.name}")
            # Links into foreign (non-release) directories need no protection:
            # this tool never removes those.

    # 7. Removals.
    for release in releases:
        if release not in plan.keep:
            plan.remove.append((release, "release"))
    store = root / RUNTIME_STORE
    if store.is_dir() and not store.is_symlink():
        for child in sorted(store.iterdir()):
            if child.is_symlink():
                raise UnsafeRetention(f"runtime store contains a symlink: {child}")
            if child not in plan.runtime_keep:
                plan.remove.append((child, "runtime-store"))
    plan.pins_after = sorted(str(p) for p in plan.keep)
    return plan


def compact_state(state, drop_entries):
    ports = {e["port"] for e in drop_entries}
    keys = {json.dumps(e, sort_keys=True) for e in drop_entries}
    data = json.loads(json.dumps(state))
    data["retained"] = [e for e in data["retained"] if json.dumps(e, sort_keys=True) not in keys]
    for key in ("verifiedGood", "quarantined"):
        data[key] = [p for p in data[key] if p not in ports]
    for key in ("gatesPassedAt", "reviewDeferred"):
        if isinstance(data.get(key), dict):
            data[key] = {k: v for k, v in data[key].items() if k not in {str(p) for p in ports}}
    if data["active"]["port"] in ports or ((data.get("previous") or {}).get("port") in ports):
        raise UnsafeRetention("refusing to drop active/previous origin")
    return data


def tree_bytes(paths):
    """Allocated bytes that disappear when all `paths` are removed (hardlink aware)."""
    seen = {}
    per_path = {}
    for top in paths:
        per_path[top] = 0
        candidates = [str(top)]
        for directory, dirs, files in os.walk(top, followlinks=False):
            candidates.extend(os.path.join(directory, name) for name in dirs + files)
        for path in candidates:
            try:
                st = os.lstat(path)
            except FileNotFoundError:
                continue
            key = (st.st_dev, st.st_ino)
            if key in seen:
                seen[key][1] += 1
            else:
                seen[key] = [st.st_blocks * 512, 1, st.st_nlink, top]
    for size, count, nlink, top in seen.values():
        if count >= nlink:
            per_path[top] += size
    return per_path


def log_line(path, record):
    record = {"ts": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"), **record}
    with open(path, "a") as out:
        out.write(json.dumps(record, sort_keys=True) + "\n")
        out.flush()
        os.fsync(out.fileno())


def apply_plan(web, plan, ss, log_path):
    root = plan.root
    reports_dir = reports(web)
    now = int(time.time())
    # 1. Ledger first: verified history must outlive the state entries.
    ledger = plan.ledger
    for entry in plan.drop_entries:
        ledger["releases"].setdefault(entry["releasePath"], {
            "sha": entry["sha"], "port": entry["port"], "pid": entry["pid"],
            "verified": entry["port"] in plan.state["verifiedGood"], "droppedAt": now})
    ss.atomic_json(reports_dir / "release-retention-ledger.json", ledger)
    # 2. Pins shrink to the keep set (nothing is deleted yet).
    ss.atomic_json(reports_dir / "release-retention-pins.json", {"version": 1, "paths": plan.pins_after})
    # 3. State compaction, then re-validate with the canonical reader.
    if plan.drop_entries:
        if ss.read_state(web) != plan.state:
            raise UnsafeRetention("serving state changed while planning")
        ss.write_state(web, compact_state(plan.state, plan.drop_entries))
        reread = ss.read_state(web)
        if reread is None or reread["phase"] != "stable":
            raise UnsafeRetention("compacted serving state failed validation")
    log_line(log_path, {"event": "plan-applied", "keep": len(plan.keep), "remove": len(plan.remove),
                        "dropped_entries": [e["port"] for e in plan.drop_entries], "pins_after": len(plan.pins_after)})
    # 4. Deletions, rechecked one by one.
    keep = set(plan.keep) | set(plan.runtime_keep)
    removed = 0
    for path, kind in plan.remove:
        if path.is_symlink() or path in keep:
            raise UnsafeRetention(f"release changed during retention: {path}")
        parent = root if kind == "release" else root / RUNTIME_STORE
        if path.resolve(strict=True).parent != parent:
            raise UnsafeRetention(f"release changed during retention: {path}")
        shutil.rmtree(path)
        removed += 1
        log_line(log_path, {"event": "removed", "path": str(path), "kind": kind})
        print(f"removed {path}", file=sys.stderr)
    log_line(log_path, {"event": "done", "removed": removed})
    return removed


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


def report(plan, sizes, as_json, apply):
    if as_json:
        out = plan.as_json(sizes)
        if sizes:
            out["bytes_freed"] = sum(sizes.values())
        out["apply"] = apply
        print(json.dumps(out, indent=2))
        return
    print(f"retention root={plan.root} keep={len(plan.keep)} removable={len(plan.remove)} "
          f"drop_state_entries={len(plan.drop_entries)} pins {len(plan.pins_before)}->{len(plan.pins_after)} "
          f"dry_run={not apply}")
    for path, reasons in sorted(plan.keep.items(), key=lambda kv: release_order(kv[0]), reverse=True):
        print(f"keep {path.name}: {'; '.join(reasons)}")
    for path in plan.foreign:
        print(f"untouched (not a release) {path}")
    for path, kind in plan.remove:
        size = f" {sizes[path] / 1e9:.2f} GB" if sizes else ""
        print(f"{'remove' if apply else 'would remove'} {kind} {path}{size}")
    if sizes:
        print(f"total {'freed' if apply else 'freeable'}: {sum(sizes.values()) / 1e9:.2f} GB")
    for warning in plan.warnings:
        print(f"WARNING {warning}", file=sys.stderr)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--web", type=Path, required=True)
    parser.add_argument("--keep", type=int, default=6, help="newest verified-good releases to keep (min 2)")
    parser.add_argument("--lock", type=Path, default=Path("/tmp/blockid-deploy.lock"))
    parser.add_argument("--apply", action="store_true", help="actually compact state and delete (default: dry-run)")
    parser.add_argument("--dry-run", action="store_true", help="accepted for compatibility; dry-run is the default")
    parser.add_argument("--lock-fd", type=int, help="already exclusively locked inherited deployment FD (Linux)")
    parser.add_argument("--log", type=Path, help="jsonl removal log (default content/reports/release-retention.jsonl)")
    parser.add_argument("--sizes", action="store_true", help="measure bytes each removal frees (walks removable trees)")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    if args.apply and args.dry_run:
        parser.error("--apply and --dry-run are mutually exclusive")
    try:
        web = args.web.resolve(strict=True)
        ss = load_serving_state_module()
        if not args.apply:
            # Read-only: no lock (deploy-live uses flock -n), no writes.
            plan = retention_plan(web, args.keep, ss)
            sizes = tree_bytes([p for p, _ in plan.remove]) if args.sizes else None
            report(plan, sizes, args.json, apply=False)
            return 0
        # Never unlink/truncate this lock: deploy and cleanup must share its inode.
        with open_lock(args.lock, args.lock_fd) as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                print("retention skipped: deployment/recovery lock held", file=sys.stderr)
                return 75
            plan = retention_plan(web, args.keep, ss)
            sizes = tree_bytes([p for p, _ in plan.remove]) if args.sizes else None
            report(plan, sizes, args.json, apply=True)
            apply_plan(web, plan, ss, args.log or reports(web) / "release-retention.jsonl")
        return 0
    except (OSError, ValueError, TypeError, KeyError, UnsafeRetention) as error:
        print(f"retention refused: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
