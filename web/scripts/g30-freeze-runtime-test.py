#!/usr/bin/env python3
"""Freeze tests use temporary fixture releases only, never production artifacts."""
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
SCRIPT = Path(__file__).with_name("g30-freeze-runtime.py")
spec = importlib.util.spec_from_file_location("freeze_runtime", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class FreezeRuntimeTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="g30-freeze-test-")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.web = self.base / "web"
        self.root = self.base / "releases"
        self.root.mkdir()
        self.web.mkdir()
        (self.web / "releases").symlink_to(self.root)
        self.current = self.root / "live"
        self.current.mkdir()
        (self.web / ".next-current").symlink_to(self.current)
        self.reports = self.web / "content/reports"
        self.reports.mkdir(parents=True)
        (self.reports / "last-good-build.json").write_text('{"buildId":"live"}')
        (self.web / "package-lock.json").write_text('{"lockfileVersion":3}')
        self.deps = self.base / "external-node_modules"
        self.deps.mkdir()
        (self.web / "node_modules").symlink_to(self.deps)
        package = self.deps / "next"
        package.mkdir()
        (package / "index.js").write_text("module.exports = 123;")
        (package / "package.json").write_text('{"version":"16.0.0"}')
        bins = self.deps / ".bin"
        bins.mkdir()
        (bins / "next").symlink_to("../next/index.js")
        (self.deps / "next-alias").symlink_to(package)
        self.candidate = self.root / "new"
        self.candidate.mkdir()
        candidate_deps = self.candidate / "node_modules"
        candidate_deps.mkdir()
        (candidate_deps / "next").symlink_to(package)
        (self.candidate / "server.js").write_text("require('next')")
        self.runtime_patch = patch.object(module, "runtime_evidence", return_value={"versions": {"node": "test"}, "executable_sha256": "fixture"})
        self.runtime_patch.start()
        self.addCleanup(self.runtime_patch.stop)

    def freeze(self, apply=False):
        return module.freeze(self.web, self.candidate, apply=apply)

    def test_default_read_only_deterministic_plan(self):
        first, second = self.freeze(), self.freeze()
        self.assertEqual(first, second)
        self.assertEqual(first["external_refs"], 1)
        self.assertEqual(first["dependency_files"], 2)
        self.assertFalse((self.candidate / ".g30-runtime").exists())
        self.assertEqual((self.candidate / "node_modules/next").resolve(), self.deps / "next")

    def test_apply_self_contained_and_source_mutation_cannot_change_release(self):
        result = self.freeze(apply=True)
        frozen = self.candidate / result["snapshot"]
        link = self.candidate / "node_modules/next"
        self.assertFalse(Path(os.readlink(link)).is_absolute())
        self.assertTrue(link.resolve().is_relative_to(self.candidate))
        self.assertEqual((frozen / "next-alias").resolve(), frozen / "next")
        self.assertEqual((frozen / ".bin/next").read_text(), "module.exports = 123;")
        self.assertNotEqual((frozen / "next/index.js").stat().st_ino, (self.deps / "next/index.js").stat().st_ino)
        (self.deps / "next/index.js").write_text("BROKEN MUTABLE SOURCE")
        self.assertEqual((link / "index.js").read_text(), "module.exports = 123;")
        moved = self.base / "restored-archive"
        self.candidate.rename(moved)
        self.assertEqual((moved / "node_modules/next/index.js").read_text(), "module.exports = 123;")

    def test_internal_absolute_release_link_becomes_portable(self):
        (self.candidate / "entry.js").symlink_to(self.candidate / "server.js")
        self.freeze(apply=True)
        self.assertEqual(os.readlink(self.candidate / "entry.js"), "server.js")

    def test_current_and_previous_and_lkg_refused(self):
        original = self.candidate
        self.candidate = self.current
        with self.assertRaises(module.FreezeError):
            self.freeze(apply=True)
        self.candidate = original
        (self.web / ".next-previous").symlink_to(self.candidate)
        with self.assertRaises(module.FreezeError):
            self.freeze(apply=True)
        (self.web / ".next-previous").unlink()
        (self.reports / "last-good-build.json").write_text('{"buildId":"new"}')
        with self.assertRaises(module.FreezeError):
            self.freeze(apply=True)

    def test_missing_lkg_refused(self):
        (self.reports / "last-good-build.json").unlink()
        with self.assertRaises(OSError):
            self.freeze(apply=True)

    def test_unexpected_external_artifact_link_refused(self):
        (self.candidate / ".next-current").symlink_to(self.current)
        with self.assertRaisesRegex(module.FreezeError, "unexpected external"):
            self.freeze(apply=True)
        self.assertFalse((self.candidate / ".g30-runtime").exists())

    def test_external_dependency_symlink_refused(self):
        (self.deps / "secret").symlink_to(self.web / "package-lock.json")
        with self.assertRaisesRegex(module.FreezeError, "escapes source root"):
            self.freeze(apply=True)

    def test_dependency_cycle_refused(self):
        (self.deps / "cycle-a").symlink_to("cycle-b")
        (self.deps / "cycle-b").symlink_to("cycle-a")
        with self.assertRaises((RuntimeError, OSError)):
            self.freeze(apply=True)

    def test_source_changes_during_copy_refused_without_rewriting_candidate(self):
        original = module.shutil.copytree
        def changed_copy(source, destination, *args, **kwargs):
            result = original(source, destination, *args, **kwargs)
            if source == self.deps:
                (self.deps / "next/index.js").write_text("concurrent install")
            return result
        with patch.object(module.shutil, "copytree", side_effect=changed_copy):
            with self.assertRaisesRegex(module.FreezeError, "changed during freeze"):
                self.freeze(apply=True)
        self.assertEqual((self.candidate / "node_modules/next").resolve(), self.deps / "next")
        self.assertFalse((self.candidate / ".g30-runtime").exists())
        self.assertFalse(list(self.candidate.glob(".g30-runtime-staging-*")))

    def test_fingerprint_changes_with_content_lockfile_and_runtime(self):
        first = self.freeze()["fingerprint"]
        (self.deps / "next/index.js").write_text("changed content")
        second = self.freeze()["fingerprint"]
        self.assertNotEqual(first, second)
        (self.web / "package-lock.json").write_text('{"lockfileVersion":4}')
        third = self.freeze()["fingerprint"]
        self.assertNotEqual(second, third)
        with patch.object(module, "runtime_evidence", return_value={"versions": {"node": "different"}}):
            self.assertNotEqual(third, self.freeze()["fingerprint"])

    def test_insufficient_disk_refuses_before_copy(self):
        from collections import namedtuple
        usage = namedtuple("usage", "total used free")(100, 99, 1)
        with patch.object(module.shutil, "disk_usage", return_value=usage):
            with self.assertRaisesRegex(module.FreezeError, "disk headroom"):
                self.freeze(apply=True)
        self.assertFalse((self.candidate / ".g30-runtime").exists())

    def test_never_overwrite_existing_snapshot(self):
        self.freeze(apply=True)
        with self.assertRaisesRegex(module.FreezeError, "never overwrite"):
            self.freeze(apply=True)

    def test_apply_requires_existing_exclusive_same_inode_lock(self):
        lockpath = self.base / "deploy.lock"
        with lockpath.open("a") as handle:
            with self.assertRaises(module.FreezeError):
                with module.deployment_lock(None, lockpath):
                    pass
            with self.assertRaises(module.FreezeError):
                with module.deployment_lock(handle.fileno(), lockpath):
                    pass
            fcntl.flock(handle, fcntl.LOCK_SH)
            with self.assertRaises(module.FreezeError):
                with module.deployment_lock(handle.fileno(), lockpath):
                    pass
            fcntl.flock(handle, fcntl.LOCK_EX)
            with module.deployment_lock(handle.fileno(), lockpath):
                pass
            with lockpath.open("a") as other:
                with self.assertRaises(BlockingIOError):
                    fcntl.flock(other, fcntl.LOCK_EX | fcntl.LOCK_NB)
            wrong = self.base / "wrong.lock"
            wrong.touch()
            with self.assertRaises(module.FreezeError):
                with module.deployment_lock(handle.fileno(), wrong):
                    pass


if __name__ == "__main__":
    unittest.main()
