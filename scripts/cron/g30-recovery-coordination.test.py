#!/usr/bin/env python3
"""Isolated recovery control tests; never executes production restart/cleanup."""
import fcntl
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
WATCHDOG = ROOT / 'web/scripts/watchdog.sh'
WATCHER = ROOT / 'web/scripts/uptime-watcher.sh'


class RecoveryCoordination(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='g30-recovery-test-')
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)

    def prefix(self, replies, pid=True, strike=False, lock_hook=''):
        # Execute only the admission/locking prefix. No restart code is loaded.
        source = WATCHDOG.read_text().split('# Dead or unhealthy — force kill')[0]
        source = source.replace('/tmp/blockid-production.pid', str(self.base / 'pid'))
        source = source.replace('/tmp/blockid-watchdog.log', str(self.base / 'log'))
        source = source.replace('/tmp/blockid-watchdog.strike', str(self.base / 'strike'))
        source = source.replace('/tmp/blockid-deploy.lock', str(self.base / 'lock'))
        if pid:
            (self.base / 'pid').write_text(str(os.getpid()))
        if strike:
            (self.base / 'strike').write_text('1')
        (self.base / 'replies').write_text('\n'.join(replies) + '\n')
        preamble = '''curl() {
 local value
 value=$(head -1 "$TEST_BASE/replies")
 tail -n +2 "$TEST_BASE/replies" > "$TEST_BASE/replies.next"
 mv "$TEST_BASE/replies.next" "$TEST_BASE/replies"
 printf '%s' "$value"
}
'''
        source = source.replace('exec 201>', lock_hook + '\nexec 201>')
        return subprocess.run(['bash', '-c', preamble + source + '\necho ADMITTED'],
                              env={**os.environ, 'TEST_BASE': str(self.base)},
                              capture_output=True, text=True, timeout=5)

    def test_healthy_origin_does_not_admit_restart(self):
        r = self.prefix(['200'])
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertNotIn('ADMITTED', r.stdout)
        self.assertFalse((self.base / 'strike').exists())

    def test_dead_pid_does_not_restart_while_deployment_holds_lock(self):
        with (self.base / 'lock').open('w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            r = self.prefix([], pid=False)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertNotIn('ADMITTED', r.stdout)
        self.assertIn('recovery deferred', (self.base / 'log').read_text())

    def test_reprobe_after_lock_suppresses_obsolete_failure(self):
        r = self.prefix(['503', '200'], strike=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertNotIn('ADMITTED', r.stdout)
        self.assertFalse((self.base / 'strike').exists())
        with (self.base / 'lock').open('w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)

    def test_failed_reprobe_admits_recovery(self):
        r = self.prefix(['503', '503'], strike=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('ADMITTED', r.stdout)

    def test_external_outage_local_healthy_suppresses_rollback(self):
        source = WATCHER.read_text()
        start = source.index('elif [ "$FAILS" -ge 5 ]')
        end = source.index('# Throttle Telegram', start)
        branch = source[start:end].replace('elif ', 'if ', 1)
        preamble = '''FAILS=5; LAST_ACTION=none; DEPLOY_DIR=/nonexistent
log() { :; }
curl() { printf 200; }
nohup() { echo UNSAFE_DISPATCH; }
'''
        r = subprocess.run(['bash', '-c', preamble + branch + '\necho "$ACTION"'],
                           capture_output=True, text=True, timeout=5)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertNotIn('UNSAFE_DISPATCH', r.stdout)
        self.assertIn('external_failure_origin_healthy', r.stdout)

    def test_background_recovery_children_close_lock(self):
        # Check the actual launch redirections; no server or notification is run.
        source = WATCHDOG.read_text()
        server_line = next(line for line in source.splitlines() if line.startswith('nohup node server.js'))
        self.assertIn('201>&-', server_line)
        alert_tail = source[source.index('ops_alert "'):].splitlines()[0]
        self.assertIn('201>&-', alert_tail)

    def test_general_cleanup_does_not_delete_builds(self):
        source = (ROOT / 'web/scripts/server-cleanup.sh').read_text()
        function = source.split('next_build_prune() {', 1)[1].split('\n}', 1)[0]
        self.assertNotIn('rm -rf', function)
        self.assertNotIn('-delete', function)


if __name__ == '__main__':
    unittest.main()
