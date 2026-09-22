#!/usr/bin/env python3
import importlib.util
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('guard', Path(__file__).with_name('g30-disk-pressure-guard.py'))
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class GuardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.log = self.root / 'blockid-build-fixture.log'
        self.log.write_text('safe build log')
        self.now = time.time() + 20 * 86400

    def tearDown(self):
        self.temp.cleanup()

    def clean(self, **kwargs):
        params = dict(root=self.root, owner=os.getuid(), pressure_devices=set(),
                      maintenance=True, apply=True, deadline=time.monotonic() + 20)
        params.update(kwargs)
        with patch.object(guard.time, 'time', return_value=self.now):
            return guard.clean_logs(**params)

    def test_dry_run_preserves_file(self):
        with patch.object(guard, 'open_inodes', return_value=set()):
            records, _, _ = self.clean(apply=False)
        self.assertEqual(len(records), 1)
        self.assertTrue(self.log.exists())

    def test_apply_only_old_allowlisted_unlinked_owner_files(self):
        for name in ('report.json', 'business.log', 'blockid-deploy-current.log'):
            (self.root / name).write_text('preserve')
        alias = self.root / 'blockid-build-alias.log'
        alias.symlink_to(self.root / 'business.log')
        linked = self.root / 'blockid-build-hard.log'
        os.link(self.root / 'business.log', linked)
        directory = self.root / 'blockid-build-dir.log'
        directory.mkdir()
        with patch.object(guard, 'open_inodes', return_value=set()):
            records, _, status = self.clean()
        self.assertEqual([r['name'] for r in records], [self.log.name])
        self.assertEqual(status, 'complete')
        self.assertFalse(self.log.exists())
        self.assertTrue(alias.is_symlink())
        self.assertTrue(linked.exists())
        self.assertTrue(directory.is_dir())

    def test_open_file_preserved(self):
        s = self.log.stat()
        with patch.object(guard, 'open_inodes', return_value={(s.st_dev, s.st_ino)}):
            records, skipped, _ = self.clean()
        self.assertEqual(records, [])
        self.assertEqual(skipped, 1)
        self.assertTrue(self.log.exists())

    def test_proc_permission_denied_refuses(self):
        with patch.object(guard, 'open_inodes', side_effect=PermissionError):
            with self.assertRaises(PermissionError):
                self.clean()
        self.assertTrue(self.log.exists())

    def test_wrong_owner_fresh_file_and_other_mount_preserved(self):
        with patch.object(guard, 'open_inodes') as scan:
            self.assertEqual(self.clean(owner=os.getuid() + 1)[0], [])
            self.assertEqual(self.clean(maintenance=False)[0], [])
            self.now = time.time()
            self.assertEqual(self.clean()[0], [])
            scan.assert_not_called()
        self.assertTrue(self.log.exists())

    def test_changed_file_preserved(self):
        def change(_):
            self.log.write_text('changed during scan')
            return set()
        with patch.object(guard, 'open_inodes', side_effect=change):
            records, skipped, _ = self.clean()
        self.assertEqual(records, [])
        self.assertEqual(skipped, 1)
        self.assertTrue(self.log.exists())

    def test_byte_limit_and_deadline(self):
        with patch.object(guard, 'open_inodes') as scan:
            self.assertEqual(self.clean(max_bytes=1)[0], [])
            self.assertEqual(self.clean(deadline=0)[2], 'budget_exhausted')
            scan.assert_not_called()

    def test_usage_uses_unprivileged_available_not_free(self):
        class FS:
            f_blocks = 100
            f_bfree = 25
            f_bavail = 15
            f_frsize = 4096
        with patch.object(guard.os, 'statvfs', return_value=FS()):
            result = guard.usage(self.root)
        self.assertEqual(result['used_percent'], 84)
        self.assertEqual(result['available_bytes'], 15 * 4096)

    def test_atomic_summary_replaces_symlink_without_touching_target(self):
        destination = self.root / 'latest.json'
        destination.symlink_to(self.log)
        guard.save_summary(destination, {'status': 'observed'})
        self.assertFalse(destination.is_symlink())
        self.assertEqual(self.log.read_text(), 'safe build log')
        self.assertEqual(destination.stat().st_mode & 0o777, 0o600)

    def test_real_process_descriptor_detected(self):
        # Scan self only through a private proc fixture; no privileged visibility needed.
        proc = self.root / 'proc'
        proc.mkdir()
        (proc / str(os.getpid())).symlink_to(Path('/proc') / str(os.getpid()))
        with self.log.open() as stream:
            s = os.fstat(stream.fileno())
            self.assertIn((s.st_dev, s.st_ino), guard.open_inodes(time.monotonic() + 5, proc))


if __name__ == '__main__':
    unittest.main()
