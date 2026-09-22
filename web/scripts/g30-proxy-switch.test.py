import importlib.util
import fcntl
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('proxy', Path(__file__).with_name('g30-proxy-switch.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
FIXTURE = '''# server 127.0.0.1:4001; commented text stays unchanged
upstream blockid_app { server 127.0.0.1:4001; keepalive 64; }
server { server_name blockid.au; location / { proxy_pass http://blockid_app; } }
server { server_name upload.blockid.au; location /api/ { proxy_pass http://127.0.0.1:4001; } location / { root /uploads; } }
server { server_name staging.blockid.au; location / { proxy_pass http://127.0.0.1:4002; } }
server { server_name dev.blockid.au; location / { proxy_pass http://127.0.0.1:4003; } }
'''

class ProxyTests(unittest.TestCase):
    def test_exact_reversible_switch(self):
        new = m.render_switch(FIXTURE, 4001, 4099)
        self.assertEqual(new.count(':4099'), 2)
        self.assertIn('# server 127.0.0.1:4001;', new)
        self.assertIn(':4002', new)
        self.assertIn(':4003', new)
        self.assertEqual(m.render_switch(new, 4099, 4001), FIXTURE)

    def test_ambiguous_unsupported_or_stale_configs_refused(self):
        for text in [FIXTURE + 'upstream blockid_app { server 127.0.0.1:4001; }',
                     FIXTURE.replace('keepalive 64;', 'server 127.0.0.1:5000;'),
                     FIXTURE.replace('127.0.0.1:4001;', '127.0.0.1:4099;', 1),
                     FIXTURE.replace('location /api/', 'location /other/'),
                     FIXTURE.replace('keepalive 64;', 'include other.conf;'), FIXTURE + '{']:
            # First occurrence of :4001 in fixture is a comment: replace active too.
            if text == FIXTURE.replace('127.0.0.1:4001;', '127.0.0.1:4099;', 1):
                text = text.replace('server 127.0.0.1:4001;', 'server 127.0.0.1:4099;')
            with self.subTest(text=text), self.assertRaises(m.Refused):
                m.render_switch(text, 4001, 4099)
        with self.assertRaises(m.Refused):
            m.render_switch(FIXTURE, 4001, 4002)

    def test_actual_exclusive_lock_proof_and_wrong_inode(self):
        with tempfile.TemporaryDirectory() as directory:
            lock = Path(directory) / 'lock'
            lock.write_text('')
            with lock.open('r+') as stream:
                with self.assertRaises(m.Refused):
                    m.require_lock(stream.fileno(), lock)
                fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
                m.require_lock(stream.fileno(), lock)
                other = Path(directory) / 'other'; other.write_text('')
                with self.assertRaises(m.Refused):
                    m.require_lock(stream.fileno(), other)

    def test_delegated_lock_rejects_nonancestor(self):
        with patch.object(m.os, 'geteuid', return_value=0), patch.object(m.os, 'getppid', return_value=1):
            with self.assertRaises(m.Refused):
                m.require_lock(200, owner_pid=987654)

    def run_switch(self, failure=None):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'site'; path.write_text(FIXTURE); path.chmod(0o640)
            link = Path(directory) / 'enabled'; link.symlink_to(path)
            pidfile = Path(directory) / 'master'; pidfile.write_text('123')
            calls = []
            def nginx(args):
                calls.append(args)
                if failure == len(calls) or (failure == 'restore_failure' and len(calls) in (3, 4)):
                    raise m.Refused('mock nginx failure')
            with patch.object(m, 'process_info', return_value={'start': '1'}), patch.object(m, 'require_lock'), patch.object(m, 'snapshot_workers', return_value=[{'pid': 456, 'start': '100'}]), patch.object(m, 'nginx', side_effect=nginx), patch.object(m, 'wait_new_workers', side_effect=[m.Refused('missing generation'), None] if failure == 'generation' else None) as wait:
                result = m.switch(link, 4001, 4099, True, 200, pidfile)
            self.assertTrue(link.is_symlink())
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o640)
            self.assertEqual(Path(result['backup']).read_text(), FIXTURE)
            return result, path.read_text(), calls, wait.call_count

    def test_apply_uses_backup_test_reload_and_generation_proof(self):
        result, text, calls, waits = self.run_switch()
        self.assertEqual(result['outcome'], 'switched')
        self.assertEqual(text, m.render_switch(FIXTURE, 4001, 4099))
        self.assertEqual(calls, [['-t'], ['-t'], ['-s', 'reload']])
        self.assertEqual(waits, 1)
        self.assertFalse(result['safe_to_stop_old_http_app'])

    def test_test_and_reload_failure_restore_and_verify(self):
        for fail in (2, 3):
            with self.subTest(fail=fail):
                result, text, calls, waits = self.run_switch(fail)
                self.assertEqual(result['outcome'], 'switch_failed')
                self.assertTrue(result['restoration_verified'])
                self.assertEqual(text, FIXTURE)
                self.assertEqual(calls[-2:], [['-t'], ['-s', 'reload']])
                self.assertEqual(waits, 1)

    def test_worker_generation_failure_restores_without_false_success(self):
        result, text, calls, waits = self.run_switch('generation')
        self.assertEqual(result['outcome'], 'switch_failed')
        self.assertTrue(result['restoration_verified'])
        self.assertEqual(text, FIXTURE)
        self.assertEqual(waits, 2)

    def test_failed_restore_is_explicit_and_never_allows_app_stop(self):
        result, text, calls, waits = self.run_switch('restore_failure')
        self.assertEqual(result['outcome'], 'switch_failed')
        self.assertFalse(result['restoration_verified'])
        self.assertIn('restoration_error', result)
        self.assertFalse(result['safe_to_stop_old_http_app'])

    def test_dryrun_has_no_mutations_or_commands(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'site'; path.write_text(FIXTURE)
            with patch.object(m, 'nginx') as command, patch.object(m, 'atomic_write') as write:
                self.assertEqual(m.switch(path, 4001, 4099)['outcome'], 'planned')
                command.assert_not_called(); write.assert_not_called()
            self.assertEqual(list(Path(directory).iterdir()), [path])

    def test_drain_retains_app_for_pending_worker_and_accepts_pid_reuse(self):
        state = {'master_pid': 123, 'old_workers': [{'pid': 456, 'start': '100'}]}
        leader = {'command': 'nginx: master process', 'start': '1'}
        for start, expected in [('100', 'drain_pending'), ('101', 'drained')]:
            with patch.object(m, 'process_info', side_effect=lambda pid: leader if pid == 123 else {'start': start}):
                result = m.drain_workers(state, 0)
                self.assertEqual(result['outcome'], expected)
                self.assertEqual(result['safe_to_stop_old_http_app'], expected == 'drained')
        with patch.object(m, 'process_info', return_value=None), self.assertRaises(m.Refused):
            m.drain_workers(state, 0)

    def test_unknown_worker_state_never_claims_drained(self):
        with self.assertRaises(m.Refused):
            m.drain_workers({}, 0)

if __name__ == '__main__':
    unittest.main()
