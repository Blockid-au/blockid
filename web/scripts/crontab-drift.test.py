#!/usr/bin/env python3
"""L1-7/L1-8 crontab tests: drift checker + invariants of crontab.production.

Run: python3 web/scripts/crontab-drift.test.py  (never reads or installs the host crontab)
"""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import re
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('drift', HERE / 'crontab-drift.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
CRONTAB = (HERE / 'crontab.production').read_text()
ACTIVE = m.active_lines(CRONTAB)

# Jobs that load the origin, the database or the disk for more than a moment.
HEAVY = ('daily-admin-report', 'traffic-report', 'security-posture', 'link-check.mjs', 'page-sweep.mjs',
         'audit-chain-verify', 'account-erasure', 'traction-snapshot', 'outcome-signals', 'svi-snapshot',
         'bq-export', 'credit-reset', 'db-backup.sh', 'restore-drill.sh', 'backtest/run.ts', 'calibration/run.ts',
         'weekly-disk-cleanup.sh', 'verify-models', 'discover-models', 'ai-model-discovery', 'refresh-funding-sources',
         'run-self-analysis.mjs', 'nightly-clevel-review', 'unicorn-nightly-progress', 'external-signals',
         'qa-live.sh', 'weekly-metrics', 'weekly-revenue-report', 'connector-resync', 'evaluation-batch-runner',
         # g30-release-retention.py is not listed: dry-run, nice 19 / ionice idle, no tree walk
         # (schedule fixed by the W1 brief at Sun 03:20 beside account-erasure).
         'cleanup-merged-worktrees.sh', 'prompt-eval-nightly', 'growth-insights',
         'agent-research', 'agent-upgrade', 'ceo-daily-summary', 'clevel-daily-reports')


def schedule(line):
    fields = line.split()
    return fields[:5], ' '.join(fields[5:])


def overlap(a, b):
    return a == '*' or b == '*' or bool(set(a.split(',')) & set(b.split(',')))


class DriftTests(unittest.TestCase):
    def test_comments_and_whitespace_are_ignored(self):
        repo = '# header\nRUN=/x\n\n0 1 * * *   bash $RUN a\n# 0 2 * * * bash $RUN b\n'
        live = 'RUN=/x\n0  1 * * * bash $RUN a\n# Replaced by timer\n'
        self.assertTrue(m.diff(repo, live)['in_sync'])

    def test_reports_both_directions_and_duplicates(self):
        report = m.diff('0 1 * * * a\n0 1 * * * a\n5 1 * * * b\n', '0 1 * * * a\n9 9 * * * c\n')
        self.assertFalse(report['in_sync'])
        self.assertEqual(report['missing_from_live'], ['0 1 * * * a', '5 1 * * * b'])
        self.assertEqual(report['extra_in_live'], ['9 9 * * * c'])

    def test_cli_exit_codes(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo, live = Path(tmp, 'repo'), Path(tmp, 'live')
            repo.write_text('0 1 * * * a\n'); live.write_text('# c\n0 1 * * * a\n')
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(m.main(['--repo-file', str(repo), '--live-file', str(live)]), 0)
            live.write_text('0 2 * * * a\n')
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(m.main(['--repo-file', str(repo), '--live-file', str(live), '--json']), 1)
            self.assertEqual(json.loads(out.getvalue())['extra_in_live'], ['0 2 * * * a'])
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(m.main(['--repo-file', str(repo), '--live-file', str(Path(tmp, 'missing'))]), 2)


class CrontabInvariants(unittest.TestCase):
    def test_g30_deferred_noops_and_replaced_cleanup_are_not_active(self):
        for job in ('agent-guardian', 'agent-orchestrator', 'agent-healthcheck', 'agent-auto-improve',
                    'publish-insight', 'git-sync-deploy.sh', 'self-upgrade-agent.sh', 'clean-disk.sh', 'server-cleanup.sh'):
            self.assertFalse([l for l in ACTIVE if job in l], job)
        self.assertEqual(len(re.findall(r'^# G30-DEFERRED 20/10/2026 .*: (\S+ ){5}', CRONTAB, re.M)), 12)

    def test_no_two_heavy_jobs_share_a_minute(self):
        heavy = []
        for line in ACTIVE:
            if re.match(r'^[A-Za-z_]+=', line):
                continue
            fields, command = schedule(line)
            name = next((h for h in HEAVY if h in command), None)
            if name and fields[0].isdigit() and fields[1].isdigit():
                heavy.append((fields, name))
        clashes = []
        for i, (a, na) in enumerate(heavy):
            for b, nb in heavy[i + 1:]:
                if a[:2] == b[:2] and overlap(a[2], b[2]) and overlap(a[4], b[4]) and na != nb:
                    clashes.append(f'{a[1]}:{a[0]} {na} + {nb}')
        self.assertEqual(clashes, [])

    def test_l1_8_evening_reports_are_ten_minutes_apart(self):
        minutes = {}
        for line in ACTIVE:
            fields, command = schedule(line)
            for job in ('daily-admin-report', 'traffic-report', 'security-posture'):
                if f'$RUN {job} ' in command + ' ':
                    minutes[job] = int(fields[1]) * 60 + int(fields[0])
        self.assertEqual(len(minutes), 3)
        values = sorted(minutes.values())
        self.assertTrue(all(b - a >= 10 for a, b in zip(values, values[1:])), minutes)
        self.assertEqual(minutes['daily-admin-report'], 22 * 60 + 30)  # business time kept

    def test_new_weekly_retention_and_worktree_jobs(self):
        retention = [l for l in ACTIVE if 'g30-release-retention.py' in l]
        self.assertEqual(len(retention), 1)
        self.assertTrue(retention[0].startswith('20 3 * * 0 '))
        self.assertIn('nice -n 19 ionice -c3', retention[0])
        self.assertNotIn('--apply', retention[0])
        self.assertIn('content/reports/logs/', retention[0])  # pruned by the 07:50 Sunday row
        worktree = [l for l in ACTIVE if 'cleanup-merged-worktrees.sh' in l]
        self.assertEqual(len(worktree), 1)
        self.assertIn('--apply', worktree[0])
        self.assertIn('content/reports/logs/', worktree[0])
        self.assertTrue(any("find /home/dovanlong/blockid.au/web/content/reports/logs -maxdepth 1 -name '*.log'" in l for l in ACTIVE))

    def test_percent_signs_are_escaped(self):
        for line in ACTIVE:
            self.assertNotRegex(line, r'(?<!\\)%', line)


if __name__ == '__main__':
    unittest.main()
