#!/usr/bin/env python3
"""Exercise only local health-log rendering, without cron HTTP or alerts."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
ROOT = Path(__file__).resolve().parents[2]

class HealthLogTests(unittest.TestCase):
    def run_log(self, status, deploying, noop='0'):
        source = (ROOT / 'web/scripts/cron-runner.sh').read_text()
        block = source[source.index('# Detect deploy in flight'):source.index('# Post-hook:')]
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            setup = 'flock() { return ' + ('1' if deploying else '0') + '; }\n'
            env = dict(os.environ, STATUS=status, DETAIL='fixture connection refused', ENDPOINT='fixture-job', TS='2026-09-22T00:00:00Z', TS_SHORT='09-22 00:00', DURATION_MS='17', LOG=str(folder/'text.log'), HEALTH_LOG=str(folder/'health.jsonl'), NOOP=noop)
            result = subprocess.run(['bash', '-eu', '-c', setup + block], env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            log = folder/'health.jsonl'
            return [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []

    def test_failures_remain_failures_while_deploying(self):
        for status in ['fail', 'error']:
            for deploying in [True, False]:
                with self.subTest(status=status, deploying=deploying):
                    rows = self.run_log(status, deploying)
                    self.assertEqual(len(rows), 1)
                    self.assertEqual(rows[0]['status'], status)
                    self.assertEqual(rows[0]['deploy_active'], deploying)
                    self.assertEqual(rows[0]['detail'], 'fixture connection refused')

    def test_noop_stays_excluded(self):
        self.assertEqual(self.run_log('ok', True, '1'), [])

if __name__ == '__main__': unittest.main()
