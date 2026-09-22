#!/usr/bin/env python3
"""Origin consumers exercised only in temp trees with inert command fixtures."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class OriginConsumersTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="g30-consumers-test-")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.web = self.base / "web"
        self.scripts = self.web / "scripts"
        self.scripts.mkdir(parents=True)
        (self.web / "content/reports").mkdir(parents=True)
        (self.web / "content/reports/g30-serving-state.json").write_text('{}')
        self.bin = self.base / "bin"
        self.bin.mkdir()
        self.logs = self.base / "tmp"
        self.logs.mkdir()
        for name in ("watchdog.sh", "cron-runner.sh"):
            text = (ROOT / "web/scripts" / name).read_text()
            # Every script-owned file goes to the temporary fixture, including
            # cron's legacy absolute health log and per-job lockfile paths.
            text = text.replace('/tmp/', str(self.logs) + '/')
            text = text.replace('/home/dovanlong/blockid.au/web/', str(self.web) + '/')
            (self.scripts / name).write_text(text)
        (self.scripts / "deploy-live.sh").write_text('exit 97\n')
        (self.scripts / "g30-serving-state.py").write_text('''import json,os,sys
from pathlib import Path
switching = os.getenv("TEST_SWITCHING")=="1" and not Path(os.environ["TEST_SWITCH_RECOVERED"]).exists()
if "--port" in sys.argv and switching: sys.exit(1)
if os.getenv("TEST_STATE_ERROR")=="1": sys.exit(1)
if "--verify-active" in sys.argv: sys.exit(int(os.getenv("TEST_VERIFY_EXIT","0")))
if "--snapshot" in sys.argv:
 print(json.dumps({"phase":"switching" if switching else "stable","active":{"port":int(os.getenv("TEST_PORT","4137")),"releasePath":os.environ["TEST_RELEASE"]}}))
else: print(os.getenv("TEST_PORT","4137"))
''')
        self.command("curl", '''#!/bin/bash
printf '%s\\n' "$*" >> "$TEST_CALLS"
if [ "${TEST_CURL_EXIT:-0}" != "0" ]; then exit "$TEST_CURL_EXIT"; fi
if [ "${TEST_CRON:-0}" = "1" ]; then printf '{"ok":true,"noop":true}'; else printf '%s' "${TEST_HTTP:-200}"; fi
''')
        self.command("flock", '#!/bin/bash\nexit "${TEST_FLOCK_EXIT:-0}"\n')
        self.command("timeout", '''#!/bin/bash
printf 'controller warm=%s expected=%s args=%s\\n' "$G30_REQUIRE_WARM_ROLLBACK" "$G30_RECOVERY_EXPECTED_PORT" "$*" >> "$TEST_CONTROLLER"
if [ "${TEST_CONTROLLER_EXIT:-0}" = "0" ]; then touch "$TEST_SWITCH_RECOVERED"; fi
exit "${TEST_CONTROLLER_EXIT:-0}"
''')
        # A cron watchdog timer must never wait/kill any real process in tests.
        self.command("sleep", '#!/bin/bash\nexit 1\n')
        self.env = {**os.environ, "PATH": str(self.bin) + ':' + os.environ['PATH'],
                    "TEST_CALLS": str(self.base / "calls"), "TEST_CONTROLLER": str(self.base / "controller"),
                    "TEST_SWITCH_RECOVERED": str(self.base / "switch-recovered"),
                    "TEST_RELEASE": str(self.base / "fixture-release"), "CRON_SECRET": "fixture-only",
                    "TELEGRAM_BOT_TOKEN": "", "TELEGRAM_CHAT_ID": ""}
        self.strike = self.logs / "blockid-watchdog.strike"

    def command(self, name, text):
        path = self.bin / name
        path.write_text(text)
        path.chmod(0o755)

    def run_script(self, script, *args, **env):
        return subprocess.run(['bash', str(self.scripts / script), *args], env={**self.env, **env}, capture_output=True, text=True, timeout=5)

    def calls(self):
        path = self.base / 'calls'
        return path.read_text() if path.exists() else ''

    def controller(self):
        path = self.base / 'controller'
        return path.read_text() if path.exists() else ''

    def test_watchdog_probes_dynamic_origin_without_recovery_when_healthy(self):
        result = self.run_script('watchdog.sh')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('http://127.0.0.1:4137/', self.calls())
        self.assertNotIn(':4001/', self.calls())
        self.assertEqual(self.controller(), '')

    def test_invalid_state_does_not_probe_or_recover(self):
        result = self.run_script('watchdog.sh', TEST_STATE_ERROR='1')
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.calls(), '')
        self.assertEqual(self.controller(), '')

    def test_abandoned_switch_requests_locked_reconciliation(self):
        result = self.run_script('watchdog.sh', TEST_SWITCHING='1')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('warm=1 expected=4137', self.controller())
        self.assertEqual(self.calls(), '')

    def test_switch_owned_by_live_deployment_defers(self):
        result = self.run_script('watchdog.sh', TEST_SWITCHING='1', TEST_FLOCK_EXIT='1')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.controller(), '')
        self.assertEqual(self.calls(), '')

    def test_first_unhealthy_strike_preserves_instance(self):
        result = self.run_script('watchdog.sh', TEST_HTTP='503')
        self.assertEqual(result.returncode, 0)
        self.assertEqual(self.strike.read_text().strip(), '4137')
        self.assertEqual(self.controller(), '')

    def test_persistent_failure_requests_expected_port_warm_only_controller(self):
        self.strike.write_text('4137')
        result = self.run_script('watchdog.sh', TEST_HTTP='503')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('warm=1 expected=4137', self.controller())
        self.assertIn('--rollback', self.controller())
        self.assertFalse(self.strike.exists())

    def test_lock_held_defers_persistent_failure(self):
        self.strike.write_text('4137')
        result = self.run_script('watchdog.sh', TEST_HTTP='503', TEST_FLOCK_EXIT='1')
        self.assertEqual(result.returncode, 0)
        self.assertEqual(self.controller(), '')

    def test_controller_failure_not_claimed_recovered(self):
        self.strike.write_text('4137')
        result = self.run_script('watchdog.sh', TEST_HTTP='503', TEST_CONTROLLER_EXIT='1')
        self.assertEqual(result.returncode, 1)
        self.assertTrue(self.strike.exists())
        self.assertNotIn('warm recovery verified', (self.logs / 'blockid-watchdog.log').read_text())

    def test_origin_change_resets_old_strike(self):
        self.strike.write_text('4120')
        self.run_script('watchdog.sh', TEST_HTTP='503')
        self.assertEqual(self.controller(), '')
        self.assertEqual(self.strike.read_text().strip(), '4137')

    def test_cron_defers_invalid_state_before_post(self):
        result = self.run_script('cron-runner.sh', 'fixture-job', TEST_STATE_ERROR='1')
        self.assertEqual(result.returncode, 0)
        self.assertEqual(self.calls(), '')

    def test_cron_posts_once_to_active_origin_and_preserves_timeout(self):
        result = self.run_script('cron-runner.sh', 'fixture-job', '--timeout', '300', TEST_CRON='1')
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.calls().splitlines()
        self.assertEqual(len(calls), 1)
        self.assertIn('http://127.0.0.1:4137/api/cron/fixture-job', calls[0])
        self.assertIn('--max-time 300', calls[0])
        self.assertTrue((self.logs / 'blockid-cron.fixture-job.lock').exists())

    def test_uncertain_cron_post_is_not_replayed(self):
        result = self.run_script('cron-runner.sh', 'fixture-job', TEST_CRON='1', TEST_CURL_EXIT='28')
        self.assertEqual(result.returncode, 0, result.stderr)
        posts = [line for line in self.calls().splitlines() if '-X POST' in line]
        self.assertEqual(len(posts), 1)
        self.assertIn(':4137/api/cron/fixture-job', posts[0])

    def test_http200_wrong_identity_cannot_be_claimed_healthy(self):
        self.strike.write_text('4137')
        result = self.run_script('watchdog.sh', TEST_HTTP='200', TEST_VERIFY_EXIT='1')
        self.assertEqual(result.returncode, 1)
        self.assertIn('warm=1 expected=4137', self.controller())
        self.assertTrue(self.strike.exists())

    def test_external_outage_local_healthy_suppresses_recovery(self):
        source = (ROOT / 'web/scripts/uptime-watcher.sh').read_text()
        start = source.index('elif [ "$FAILS" -ge 5 ]')
        branch = source[start:source.index('# Throttle Telegram', start)].replace('elif ', 'if ', 1)
        preamble = '''FAILS=5; LAST_ACTION=none; DEPLOY_DIR=/nonexistent; LOG=/dev/null
log() { :; }
python3() { printf 4137; }
curl() { printf 200; }
timeout() { echo UNSAFE_DISPATCH; }
'''
        result = subprocess.run(['bash', '-c', preamble + branch + '\necho "$ACTION"'], capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('UNSAFE_DISPATCH', result.stdout)
        self.assertIn('external_failure_origin_healthy', result.stdout)

    def test_guardian_invalid_state_does_not_dispatch_recovery(self):
        source = (ROOT / 'scripts/cron/uptime-24x7-guardian.sh').read_text()
        start = source.index('if [ "$STATE_VALID" != "1" ]; then')
        branch = source[start:source.index('\n# ─', start)]
        preamble = '''STATE_VALID=0; FAIL_COUNT=9; TS=test; LOG=/dev/null; WEB=/nonexistent
 timeout() { echo UNSAFE_DISPATCH; }
'''
        result = subprocess.run(['bash', '-c', preamble + branch + '\necho "$ROLLBACK_ACTION"'], capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('UNSAFE_DISPATCH', result.stdout)
        self.assertIn('deferred_state', result.stdout)

    def test_general_cleanup_does_not_delete_builds(self):
        source = (ROOT / 'web/scripts/server-cleanup.sh').read_text()
        function = source.split('next_build_prune() {', 1)[1].split('\n}', 1)[0]
        self.assertNotIn('rm -rf', function)
        self.assertNotIn('-delete', function)

    def test_watchdog_contains_no_process_kill_or_launch(self):
        source = (ROOT / 'web/scripts/watchdog.sh').read_text()
        self.assertNotIn('kill -', source)
        self.assertNotIn('fuser ', source)
        self.assertNotIn('nohup node', source)


if __name__ == '__main__':
    unittest.main()
