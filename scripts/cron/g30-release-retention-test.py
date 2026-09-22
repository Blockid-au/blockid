#!/usr/bin/env python3
"""Isolated filesystem/lock tests. Never invokes guardian or production cleanup."""
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True

SCRIPT = Path(__file__).with_name("g30-release-retention.py")
spec = importlib.util.spec_from_file_location("retention", SCRIPT)
retention = importlib.util.module_from_spec(spec)
spec.loader.exec_module(retention)


class RetentionTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="g30-retention-test-")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.web = self.base / "web"
        self.root = self.base / "data/releases"
        self.root.mkdir(parents=True)
        self.web.mkdir()
        (self.web / "releases").symlink_to(self.root)
        self.reports = self.web / "content/reports"
        self.reports.mkdir(parents=True)
        for index in range(10):
            directory = self.root / f"build-{index}"
            directory.mkdir()
            (directory / "server.js").write_text(f"release {index}")
            os.utime(directory, (index + 100, index + 100))
        self.pin("current", "build-0")
        self.pin("previous", "build-1")
        (self.reports / "last-good-build.json").write_text(json.dumps({"buildId": "build-2"}))
        self.lock = self.base / "deploy.lock"

    def pin(self, name, release):
        (self.web / f".next-{name}").symlink_to(self.root / release)

    def run_helper(self, *extra):
        return subprocess.run([sys.executable, str(SCRIPT), "--web", str(self.web), "--lock", str(self.lock), "--keep", "2", *extra], capture_output=True, text=True)

    def assert_refused_without_delete(self):
        before = sorted(p.name for p in self.root.iterdir())
        result = self.run_helper()
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertEqual(before, sorted(p.name for p in self.root.iterdir()))

    def test_old_active_previous_lkg_candidate_draining_survive(self):
        self.pin("candidate", "build-3")
        self.pin("draining", "build-4")
        result = self.run_helper()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual({"build-0", "build-1", "build-2", "build-3", "build-4", "build-8", "build-9"}, {p.name for p in self.root.iterdir()})
        self.assertEqual((self.root / "build-0/server.js").read_text(), "release 0")

    def test_extra_eligible_fallback_survives(self):
        (self.reports / "release-retention-pins.json").write_text(json.dumps({"version": 1, "paths": [str(self.root / "build-5")]}))
        self.assertEqual(self.run_helper().returncode, 0)
        self.assertTrue((self.root / "build-5").exists())

    def test_dry_run_changes_nothing(self):
        self.assertEqual(self.run_helper("--dry-run").returncode, 0)
        self.assertEqual(len(list(self.root.iterdir())), 10)

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

    def test_lock_busy_no_deletion_or_inode_replacement(self):
        with self.lock.open("a") as lock:
            inode = self.lock.stat().st_ino
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = self.run_helper()
            self.assertEqual(result.returncode, 75, result.stderr)
            self.assertEqual(len(list(self.root.iterdir())), 10)
            self.assertEqual(self.lock.stat().st_ino, inode)

    def run_inherited(self, descriptor):
        return subprocess.run([sys.executable, str(SCRIPT), "--web", str(self.web),
                               "--lock", str(self.lock), "--lock-fd", str(descriptor),
                               "--keep", "2"], pass_fds=(descriptor,), capture_output=True, text=True)

    def test_inherited_exclusive_lock_deletes_without_unlocking_parent(self):
        with self.lock.open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            result = self.run_inherited(lock.fileno())
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(len(list(self.root.iterdir())), 5)
            # Child close must not release the parent's deployment lock.
            self.assertEqual(self.run_helper().returncode, 75)

    def test_inherited_unlocked_or_shared_descriptor_refused(self):
        with self.lock.open("a") as lock:
            for mode in (None, fcntl.LOCK_SH):
                if mode is not None:
                    fcntl.flock(lock, mode)
                result = self.run_inherited(lock.fileno())
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(len(list(self.root.iterdir())), 10)

    def test_inherited_wrong_inode_refused(self):
        self.lock.touch()
        with (self.base / "wrong.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            self.assertNotEqual(self.run_inherited(lock.fileno()).returncode, 0)
            self.assertEqual(len(list(self.root.iterdir())), 10)

    def test_keep_below_safety_floor(self):
        self.assertNotEqual(self.run_helper("--keep", "0").returncode, 0)
        self.assertEqual(len(list(self.root.iterdir())), 10)

    def test_invalid_additional_pin(self):
        (self.reports / "release-retention-pins.json").write_text('{"version":1,"paths":["relative"]}')
        self.assert_refused_without_delete()


if __name__ == "__main__":
    unittest.main()
