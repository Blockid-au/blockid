#!/usr/bin/env python3
"""Isolated filesystem/lock tests. Never invokes guardian or production cleanup.

Run: python3 scripts/cron/g30-release-retention.test.py
Liveness uses the real procfs: "live" fixtures are this test process or a
sleeping child; "dead" fixtures are reaped children (PID gone).
"""
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True

SCRIPT = Path(__file__).with_name("g30-release-retention.py")
spec = importlib.util.spec_from_file_location("retention", SCRIPT)
retention = importlib.util.module_from_spec(spec)
spec.loader.exec_module(retention)
SS = retention.load_serving_state_module()


def start_ticks(pid):
    raw = Path(f"/proc/{pid}/stat").read_text()
    return raw[raw.rindex(")") + 2:].split()[19]


def dead_pids(count):
    pids = set()
    while len(pids) < count:
        child = subprocess.Popen([sys.executable, "-c", ""])
        child.wait()
        pids.add(child.pid)
    return sorted(pids)


class RetentionTest(unittest.TestCase):
    """Fixture: build-0 (oldest) .. build-9 (newest), one retained origin each.

    build-9 active (live = this process), build-8 previous (dead), build-2 LKG
    (dead); every other origin is dead + verified + quarantined, i.e. retired.
    """

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="g30-retention-test-")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name).resolve()
        self.web = self.base / "web"
        self.root = self.base / "data/releases"
        self.root.mkdir(parents=True)
        self.web.mkdir()
        (self.web / "releases").symlink_to(self.root)
        self.reports = self.web / "content/reports"
        self.reports.mkdir(parents=True)
        dead = dead_pids(9)
        self.entries = []
        for index in range(10):
            directory = self.root / f"build-{index}"
            directory.mkdir()
            (directory / "server.js").write_text(f"release {index}")
            manifest = directory / ".deploy-manifest.json"
            manifest.write_text("{}")
            os.utime(manifest, (index + 100, index + 100))
            os.utime(directory, (index + 100, index + 100))
            pid = os.getpid() if index == 9 else dead[index]
            self.entries.append({
                "port": 4100 + index, "pid": pid,
                "startTicks": start_ticks(pid) if index == 9 else "12345",
                "releasePath": str(directory), "sha": hashlib.sha1(str(index).encode()).hexdigest(),
                "schemaDigest": "a" * 64})
        self.state = {
            "version": 1, "phase": "stable", "active": self.entries[9], "previous": self.entries[8],
            "retained": list(self.entries), "verifiedGood": [e["port"] for e in self.entries],
            "quarantined": [e["port"] for e in self.entries[:8]],
            "gatesPassedAt": {str(e["port"]): 1 for e in self.entries}}
        self.write_state()
        (self.reports / "release-retention-pins.json").write_text(
            json.dumps({"version": 1, "paths": [e["releasePath"] for e in self.entries]}))
        self.pin("current", "build-9")
        self.pin("previous", "build-8")
        (self.reports / "last-good-build.json").write_text(json.dumps({"buildId": "build-2"}))
        self.lock = self.base / "deploy.lock"

    def write_state(self):
        (self.reports / "g30-serving-state.json").write_text(json.dumps(self.state))

    def read_state(self):
        return json.loads((self.reports / "g30-serving-state.json").read_text())

    def pin(self, name, release):
        (self.web / f".next-{name}").symlink_to(self.root / release)

    def names(self):
        return {p.name for p in self.root.iterdir()}

    def snapshot(self):
        files = {}
        for directory, _, names in os.walk(self.base):
            for name in names:
                path = Path(directory) / name
                if not path.is_symlink() and path != self.lock:
                    files[str(path)] = path.read_bytes()
        return files

    def run_helper(self, *extra):
        return subprocess.run([sys.executable, str(SCRIPT), "--web", str(self.web), "--lock", str(self.lock),
                               "--keep", "2", *extra], capture_output=True, text=True)

    def assert_refused_without_delete(self, *extra):
        before = self.snapshot()
        for mode in ((), ("--apply",)):
            result = self.run_helper(*mode, *extra)
            self.assertNotEqual(result.returncode, 0, result.stdout)
            self.assertEqual(before, self.snapshot())

    # -- requested coverage -------------------------------------------------

    def test_dead_pid_retained_entry_not_kept(self):
        result = self.run_helper("--apply")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual({"build-2", "build-8", "build-9"}, self.names())
        state = self.read_state()
        self.assertEqual([4108, 4109], sorted(e["port"] for e in state["retained"]))
        self.assertEqual([4108, 4109], sorted(state["verifiedGood"]))
        self.assertEqual([], state["quarantined"])  # 4108 was never quarantined
        self.assertEqual({"4108", "4109"}, set(state["gatesPassedAt"]))
        pins = json.loads((self.reports / "release-retention-pins.json").read_text())["paths"]
        self.assertEqual(sorted(str(self.root / n) for n in ("build-2", "build-8", "build-9")), pins)
        ledger = json.loads((self.reports / "release-retention-ledger.json").read_text())["releases"]
        self.assertEqual(8, len(ledger))
        self.assertTrue(all(v["verified"] for v in ledger.values()))
        log = [json.loads(line) for line in (self.reports / "release-retention.jsonl").read_text().splitlines()]
        self.assertEqual(7, sum(r["event"] == "removed" for r in log))
        # Port pool is released: the next allocation may reuse a dropped port.
        self.assertNotIn(4100, {e["port"] for e in state["retained"]})

    def test_live_retained_origin_kept(self):
        sleeper = subprocess.Popen(["sleep", "60"])
        self.addCleanup(sleeper.wait)
        self.addCleanup(sleeper.kill)
        self.entries[3]["pid"], self.entries[3]["startTicks"] = sleeper.pid, start_ticks(sleeper.pid)
        self.write_state()
        result = self.run_helper("--apply")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("build-3", self.names())
        self.assertIn(4103, {e["port"] for e in self.read_state()["retained"]})

    def test_reused_pid_counts_as_dead(self):
        # Live PID, wrong start ticks => procfs proves reuse => not live.
        self.entries[3]["pid"] = os.getppid()
        self.entries[3]["startTicks"] = "1"
        self.write_state()
        self.assertEqual(self.run_helper("--apply").returncode, 0)
        self.assertNotIn("build-3", self.names())

    def test_active_previous_lkg_always_kept(self):
        # Make them the OLDEST releases and give them dead PIDs.
        self.state["active"], self.state["previous"] = self.entries[0], self.entries[1]
        (self.reports / "last-good-build.json").write_text(json.dumps({"buildId": "build-3"}))
        (self.web / ".next-current").unlink(); self.pin("current", "build-0")
        (self.web / ".next-previous").unlink(); self.pin("previous", "build-1")
        self.write_state()
        result = self.run_helper("--apply", "--json")
        self.assertEqual(result.returncode, 0, result.stderr)
        # + newest 2 verified-good (8, 9); build-9 is no longer active but its
        # process is live (this test), so it is kept as a live origin too.
        self.assertEqual({"build-0", "build-1", "build-3", "build-8", "build-9"}, self.names())
        ports = {e["port"] for e in self.read_state()["retained"]}
        self.assertTrue({4100, 4101} <= ports)
        self.assertIn("active origin :4100", json.loads(result.stdout)["warnings"][0])

    def test_runtime_dir_kept_while_referenced(self):
        store = self.root / ".g30-runtime"
        for digest in ("a" * 64, "b" * 64):
            (store / digest / "node_modules/pkg").mkdir(parents=True)
        (self.root / "build-9/node_modules").mkdir()
        (self.root / "build-9/node_modules/pkg").symlink_to(store / ("a" * 64) / "node_modules/pkg")
        # Kept release also links into an otherwise-removable release.
        (self.root / "build-8/shared").symlink_to(self.root / "build-4/server.js")
        result = self.run_helper("--apply")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((store / ("a" * 64)).is_dir())
        self.assertFalse((store / ("b" * 64)).exists())
        self.assertIn("build-4", self.names())
        self.assertTrue((self.root / "build-9/node_modules/pkg").resolve().is_dir())

    def test_refuses_during_switching_phase(self):
        self.state["phase"] = "switching"
        self.write_state()
        self.assert_refused_without_delete()
        self.assertIn("switching", self.run_helper().stderr)

    def test_dry_run_deletes_and_writes_nothing(self):
        before = self.snapshot()
        for extra in ((), ("--dry-run",), ("--json", "--sizes")):
            result = self.run_helper(*extra)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(before, self.snapshot())
            self.assertEqual(10, len(self.names()))
        self.assertIn("would remove release", self.run_helper().stdout)
        self.assertFalse(self.lock.exists(), "dry-run must not touch the deploy lock")
        plan = json.loads(self.run_helper("--json", "--sizes").stdout)
        self.assertEqual(7, len(plan["remove"]))
        self.assertGreater(plan["bytes_freed"], 0)

    def test_dry_run_ignores_held_deploy_lock(self):
        with self.lock.open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assertEqual(self.run_helper().returncode, 0)

    # -- keep-window / pin semantics ---------------------------------------

    def test_ledger_preserves_verified_window_after_compaction(self):
        (self.web / ".next-previous").unlink()
        self.state["previous"] = None
        self.write_state()
        self.assertEqual(self.run_helper("--apply", "--keep", "3").returncode, 0)
        self.assertEqual({"build-2", "build-7", "build-8", "build-9"}, self.names())
        # build-7/8 are no longer in serving state; the ledger keeps them verified.
        self.assertEqual([4109], [e["port"] for e in self.read_state()["retained"]])
        self.assertEqual(self.run_helper("--apply", "--keep", "3").returncode, 0)
        self.assertEqual({"build-2", "build-7", "build-8", "build-9"}, self.names())
        self.assertEqual(self.run_helper("--apply", "--keep", "2").returncode, 0)
        self.assertEqual({"build-2", "build-8", "build-9"}, self.names())

    def test_unverified_newer_release_is_removable(self):
        extra = self.root / "build-10"
        extra.mkdir(); (extra / "server.js").write_text("unverified")
        self.assertEqual(self.run_helper("--apply").returncode, 0)
        self.assertNotIn("build-10", self.names())

    def test_foreign_directory_untouched(self):
        (self.root / "web/content/reports").mkdir(parents=True)
        result = self.run_helper("--apply")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("web", self.names())
        self.assertIn("untouched (not a release)", result.stdout)

    def test_unowned_explicit_pin_survives(self):
        staged = self.root / "staged"
        staged.mkdir(); (staged / "server.js").write_text("receipt candidate")
        pins = json.loads((self.reports / "release-retention-pins.json").read_text())
        pins["paths"].append(str(staged))
        (self.reports / "release-retention-pins.json").write_text(json.dumps(pins))
        self.assertEqual(self.run_helper("--apply").returncode, 0)
        self.assertIn("staged", self.names())
        self.assertIn(str(staged), json.loads((self.reports / "release-retention-pins.json").read_text())["paths"])

    def test_unfinished_transition_keeps_origin(self):
        (self.reports / "g30-receipt-candidate.json").write_text(json.dumps(
            {"phase": "inspected", "candidate": {"port": 4105}}))
        self.assertEqual(self.run_helper("--apply").returncode, 0)
        self.assertIn("build-5", self.names())
        self.assertIn(4105, {e["port"] for e in self.read_state()["retained"]})

    def test_unfinished_retirement_journal_keeps_origin(self):
        self.state["originRetirements"] = {
            "f1": {"entry": self.entries[4], "status": "signal_requested"},
            "f2": {"entry": self.entries[5], "status": "stopped"}}
        self.write_state()
        self.assertEqual(self.run_helper("--apply").returncode, 0)
        self.assertIn("build-4", self.names())
        self.assertNotIn("build-5", self.names())
        self.assertIn("f2", self.read_state()["originRetirements"])

    def test_unknown_liveness_is_kept(self):
        with patch.object(retention, "liveness", return_value="unknown"):
            plan = retention.retention_plan(self.web, 2, SS)
        self.assertEqual([], plan.remove)
        self.assertEqual([], plan.drop_entries)

    def test_candidate_and_draining_links_survive(self):
        self.pin("candidate", "build-3")
        self.pin("draining", "build-4")
        self.assertEqual(self.run_helper("--apply").returncode, 0)
        self.assertEqual({"build-2", "build-3", "build-4", "build-8", "build-9"}, self.names())

    # -- fail-closed inputs (kept from the original suite) ------------------

    def test_missing_serving_state(self):
        (self.reports / "g30-serving-state.json").unlink()
        self.assert_refused_without_delete()

    def test_missing_lkg(self):
        (self.reports / "last-good-build.json").unlink()
        self.assert_refused_without_delete()

    def test_invalid_lkg(self):
        for value in ("not-json", "[]", '{"buildId":"../outside"}', '{"buildId":"missing"}'):
            with self.subTest(value=value):
                (self.reports / "last-good-build.json").write_text(value)
                self.assert_refused_without_delete()

    def test_missing_current(self):
        (self.web / ".next-current").unlink()
        self.assert_refused_without_delete()

    def test_dangling_candidate(self):
        self.pin("candidate", "missing")
        self.assert_refused_without_delete()

    def test_outside_pin(self):
        (self.web / ".next-draining").symlink_to(self.base)
        self.assert_refused_without_delete()

    def test_release_alias(self):
        (self.root / "alias").symlink_to(self.root / "build-0")
        self.assert_refused_without_delete()

    def test_invalid_additional_pin(self):
        (self.reports / "release-retention-pins.json").write_text('{"version":1,"paths":["relative"]}')
        self.assert_refused_without_delete()

    def test_invalid_ledger(self):
        (self.reports / "release-retention-ledger.json").write_text('{"version":1,"releases":[]}')
        self.assert_refused_without_delete()

    def test_keep_below_safety_floor(self):
        self.assert_refused_without_delete("--keep", "1")

    def test_apply_and_dry_run_conflict(self):
        self.assertNotEqual(self.run_helper("--apply", "--dry-run").returncode, 0)
        self.assertEqual(10, len(self.names()))

    # -- deployment lock ----------------------------------------------------

    def test_lock_busy_no_deletion_or_inode_replacement(self):
        with self.lock.open("a") as lock:
            inode = self.lock.stat().st_ino
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = self.run_helper("--apply")
            self.assertEqual(result.returncode, 75, result.stderr)
            self.assertEqual(len(self.names()), 10)
            self.assertEqual(self.lock.stat().st_ino, inode)

    def run_inherited(self, descriptor):
        return subprocess.run([sys.executable, str(SCRIPT), "--web", str(self.web),
                               "--lock", str(self.lock), "--lock-fd", str(descriptor),
                               "--keep", "2", "--apply"], pass_fds=(descriptor,), capture_output=True, text=True)

    def test_inherited_exclusive_lock_deletes_without_unlocking_parent(self):
        with self.lock.open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            result = self.run_inherited(lock.fileno())
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(len(self.names()), 3)
            # Child close must not release the parent's deployment lock.
            self.assertEqual(self.run_helper("--apply").returncode, 75)

    def test_inherited_unlocked_or_shared_descriptor_refused(self):
        with self.lock.open("a") as lock:
            for mode in (None, fcntl.LOCK_SH):
                if mode is not None:
                    fcntl.flock(lock, mode)
                result = self.run_inherited(lock.fileno())
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(len(self.names()), 10)

    def test_inherited_wrong_inode_refused(self):
        self.lock.touch()
        with (self.base / "wrong.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            self.assertNotEqual(self.run_inherited(lock.fileno()).returncode, 0)
            self.assertEqual(len(self.names()), 10)


if __name__ == "__main__":
    unittest.main()
