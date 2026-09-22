#!/usr/bin/env python3
"""Only admission fixtures execute: no cron, network, git, AI or deploy calls."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ('self-upgrade-agent.sh', 'git-sync-deploy.sh')
CONTROL = {'version': 1, 'owner': 'g30', 'status': 'active',
           'source_of_truth': 'docs/plans/SOURCE-OF-TRUTH.md'}


class OwnershipTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='g30-owner-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'web/scripts').mkdir(parents=True)
        (self.root / 'docs/plans').mkdir(parents=True)
        self.control = self.root / 'docs/plans/g30-execution-control.json'

    def fixture(self, name, full=False):
        source = (ROOT / 'web/scripts' / name).read_text()
        if not full:
            source = source.split('# END G30 admission guard')[0] + '\necho ADMITTED\n'
        path = self.root / 'web/scripts' / name
        path.write_text(source)
        return path

    def run_fixture(self, name, full=False):
        return subprocess.run(['bash', str(self.fixture(name, full))],
                              capture_output=True, text=True, timeout=5)

    def test_active_full_wrappers_exit_before_all_side_effects(self):
        self.control.write_text(json.dumps(CONTROL))
        for name in SCRIPTS:
            with self.subTest(name=name):
                result = self.run_fixture(name, full=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stdout, '')
                self.assertIn('legacy writer deferred', result.stderr)

    def test_missing_control_fails_closed(self):
        for name in SCRIPTS:
            result = self.run_fixture(name, full=True)
            self.assertEqual(result.returncode, 1, result.stderr)
            self.assertIn('refused', result.stderr)

    def test_invalid_controls_fail_closed(self):
        bad = ['not-json', '[]', '{}', 'null',
               json.dumps({**CONTROL, 'owner': 'legacy'}),
               json.dumps({**CONTROL, 'status': 'paused'}),
               json.dumps({**CONTROL, 'version': True}),
               json.dumps({**CONTROL, 'source_of_truth': 'old-plan.md'})]
        for raw in bad:
            self.control.write_text(raw)
            for name in SCRIPTS:
                with self.subTest(raw=raw, name=name):
                    r = self.run_fixture(name)
                    self.assertEqual(r.returncode, 1)
                    self.assertNotIn('ADMITTED', r.stdout)

    def test_released_handoff_admits_only_guard_fixture(self):
        self.control.write_text(json.dumps({**CONTROL, 'status': 'released'}))
        for name in SCRIPTS:
            r = self.run_fixture(name)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertIn('ADMITTED', r.stdout)

    def test_recheck_observes_control_activated_midrun(self):
        self.control.write_text(json.dumps({**CONTROL, 'status': 'released'}))
        for name in SCRIPTS:
            self.control.write_text(json.dumps({**CONTROL, 'status': 'released'}))
            path = self.fixture(name)
            text = path.read_text().replace('echo ADMITTED',
                'printf \'%s\\n\' \'%s\' > "$G30_CONTROL"\ng30_writer_guard\necho UNSAFE' %
                ('%s', json.dumps(CONTROL)))
            path.write_text(text)
            r = subprocess.run(['bash', str(path)], capture_output=True, text=True, timeout=5)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertNotIn('UNSAFE', r.stdout)

    def test_mutation_and_agent_calls_have_adjacent_recheck(self):
        prefixes = ('git fetch ', 'git merge ', 'git reset --hard ', 'git push ',
                    'if git push ', 'if ! git merge ', 'timeout "$TIMEOUT_S" claude ',
                    'DEPLOY_NOTE=')
        for name in SCRIPTS:
            lines = (ROOT / 'web/scripts' / name).read_text().splitlines()
            for index, line in enumerate(lines):
                if line.lstrip().startswith(prefixes):
                    self.assertEqual(lines[index - 1].strip(), 'g30_writer_guard', (name, line))


if __name__ == '__main__':
    unittest.main()
