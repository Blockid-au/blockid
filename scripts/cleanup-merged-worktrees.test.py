#!/usr/bin/env python3
"""L1-9 worktree cleanup guards, against a throwaway repository only.

Run: python3 scripts/cleanup-merged-worktrees.test.py
"""
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest

SCRIPT = Path(__file__).resolve().with_name('cleanup-merged-worktrees.sh')
OLD = time.time() - 72 * 3600


def git(cwd, *args):
    env = {**os.environ, 'GIT_AUTHOR_NAME': 't', 'GIT_AUTHOR_EMAIL': 't@t', 'GIT_COMMITTER_NAME': 't', 'GIT_COMMITTER_EMAIL': 't@t'}
    return subprocess.run(['git', '-C', str(cwd), *args], check=True, capture_output=True, text=True, env=env).stdout


class WorktreeCleanupTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.repo = root / 'repo'; self.repo.mkdir()
        git(self.repo, 'init', '-q', '-b', 'master')
        git(self.repo, 'config', 'core.logAllRefUpdates', 'true')
        (self.repo / 'f').write_text('0'); git(self.repo, 'add', 'f'); git(self.repo, 'commit', '-qm', 'base')
        self.lock = root / 'deploy.lock'
        self.wt = {}
        for name in ('merged', 'zero', 'locked', 'unmerged', 'dirty', 'recent', 'busy'):
            path = root / name
            git(self.repo, 'worktree', 'add', '-q', '-b', name, str(path), 'master')
            self.wt[name] = path
            if name != 'zero':
                (path / f'{name}.txt').write_text(name); git(path, 'add', '.'); git(path, 'commit', '-qm', name)
        for name in ('merged', 'locked', 'dirty', 'recent', 'busy'):
            git(self.repo, 'merge', '-q', '--no-ff', '-m', f'merge {name}', name)
        git(self.repo, 'worktree', 'lock', '--reason', 'claude agent agent-x (pid 1)', str(self.wt['locked']))
        (self.wt['dirty'] / 'untracked.txt').write_text('wip')
        for name, path in self.wt.items():
            if name == 'recent':
                continue
            gitdir = Path(git(path, 'rev-parse', '--absolute-git-dir').strip())
            for f in ('index', 'HEAD', 'logs/HEAD'):
                if (gitdir / f).exists():
                    os.utime(gitdir / f, (OLD, OLD))
        self.sleeper = subprocess.Popen(['sleep', '60'], cwd=self.wt['busy'])

    def tearDown(self):
        self.sleeper.kill(); self.sleeper.wait()
        self.tmp.cleanup()

    def run_script(self, *args):
        result = subprocess.run(['bash', str(SCRIPT), '--repo', str(self.repo), '--base', 'master', '--lock', str(self.lock), *args],
                                capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout

    def line(self, out, name):
        return next(l for l in out.splitlines() if l.rstrip().split(' (')[0].endswith('/' + name))

    def test_report_mode_changes_nothing_and_explains_every_keep(self):
        out = self.run_script()
        self.assertIn('WOULD', self.line(out, 'merged'))
        expected = {'zero': 'zero own commits', 'locked': 'locked', 'unmerged': 'not merged', 'dirty': 'dirty',
                    'recent': 'active within', 'busy': 'process running inside'}
        for name, reason in expected.items():
            self.assertIn('KEEP', self.line(out, name)); self.assertIn(reason, self.line(out, name))
        self.assertTrue(all(p.is_dir() for p in self.wt.values()))

    def test_apply_removes_only_the_safe_worktree_and_keeps_its_branch(self):
        out = self.run_script('--apply')
        self.assertIn('REMOVED', self.line(out, 'merged'))
        self.assertFalse(self.wt['merged'].exists())
        self.assertTrue(all(p.is_dir() for n, p in self.wt.items() if n != 'merged'))
        self.assertIn('merged', git(self.repo, 'branch', '--list', 'merged'))
        self.assertIn('summary: removed=1', out)

    def test_apply_defers_while_deploy_lock_is_held(self):
        holder = subprocess.Popen(['flock', str(self.lock), 'sleep', '30'])
        try:
            for _ in range(50):
                if subprocess.run(['flock', '-n', str(self.lock), 'true']).returncode:
                    break
                time.sleep(0.1)
            out = self.run_script('--apply')
        finally:
            holder.kill(); holder.wait()
        self.assertIn('deploy lock held', out)
        self.assertTrue(self.wt['merged'].is_dir())

    def test_rejects_unknown_arguments(self):
        result = subprocess.run(['bash', str(SCRIPT), '--force'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertNotIn('--force', SCRIPT.read_text().split('set -uo pipefail', 1)[1].replace('"--force"', ''))


if __name__ == '__main__':
    unittest.main()
