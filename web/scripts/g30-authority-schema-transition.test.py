#!/usr/bin/env python3
"""Isolated transition tests. No database, HTTP, SQL application or deploy."""
import copy
import importlib.util
import hashlib
import json
from types import SimpleNamespace
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('authority', Path(__file__).with_name('g30-authority-schema-transition.py'))
a = importlib.util.module_from_spec(spec); spec.loader.exec_module(a)


class TransitionTests(unittest.TestCase):
    def test_missing_or_unsealed_record_does_not_probe_live_database(self):
        for record in (None, {"phase": "prepared"}, {"phase": "observed"}):
            with patch.object(a, "read", return_value=record), patch.object(a, "ledger") as database:
                self.assertFalse(a.allowed(Path("/unused"), {}, {}, None))
                database.assert_not_called()

    def setUp(self):
        self.old = {'files': ['0001_baseline.sql'], 'deferred': [], 'ledger_present': True}
        self.ledger = {'0001_baseline.sql': 'a' * 64}
        self.source = self.entry(4108, self.old)
        self.warm = self.entry(4107, self.old)
        self.record = a.prepare(self.source, self.warm, self.old, self.ledger, a.REVIEWED_SQL_SHA256)
        self.target = self.entry(4109, self.record['newManifest'])
        self.record['origins'].append(self.target)
        self.record['phase'] = 'sealed'
        self.applied = {**self.ledger, a.FILE: a.REVIEWED_SQL_SHA256}

    def entry(self, port, manifest):
        return {'port': port, 'pid': port + 10000, 'startTicks': '100', 'sha': str(port)[-1] * 40,
                'releasePath': '/data/releases/' + str(port), 'schemaDigest': a.digest(manifest)}

    def test_forward_and_warm_rollback(self):
        self.assertTrue(a.edge(self.record, self.source, self.target, self.applied))
        self.assertTrue(a.edge(self.record, self.target, self.warm, self.applied))

    def test_pending_and_unobserved_deny(self):
        for phase in ['prepared', 'observed']:
            self.record['phase'] = phase
            with self.assertRaises(ValueError): a.edge(self.record, self.source, self.target, self.applied)

    def test_wrong_sql_review_denies(self):
        with self.assertRaises(ValueError): a.prepare(self.source, self.warm, self.old, self.ledger, 'b' * 64)

    def test_same_process_not_recovery(self):
        with self.assertRaises(ValueError): a.prepare(self.source, self.source, self.old, self.ledger, a.REVIEWED_SQL_SHA256)

    def test_already_applied_denies_prepare(self):
        with self.assertRaises(ValueError): a.prepare(self.source, self.warm, self.old, self.applied, a.REVIEWED_SQL_SHA256)

    def test_financial_delta_denies(self):
        for filename in ['0443_credit_operation_receipts.sql', '0446_reanalysis.sql', '9999.sql']:
            changed = {**self.applied, filename: 'b' * 64}
            with self.assertRaises(ValueError): a.edge(self.record, self.source, self.target, changed)

    def test_missing_changed_and_extra_ledger_rows_deny(self):
        for changed in [self.ledger, {**self.applied, a.FILE: 'b' * 64}, {a.FILE: a.REVIEWED_SQL_SHA256}]:
            with self.assertRaises(ValueError): a.edge(self.record, self.source, self.target, changed)

    def test_pid_sha_and_start_reuse_deny(self):
        for key, value in [('pid', 7), ('startTicks', '101'), ('sha', 'f' * 40), ('releasePath', '/data/releases/other')]:
            changed = {**self.target, key: value}
            with self.assertRaises(ValueError): a.edge(self.record, self.source, changed, self.applied)

    def test_deferral_and_manifest_broadening_deny(self):
        for new in [{**self.record['newManifest'], 'deferred': [a.FILE]},
                    {**self.record['newManifest'], 'files': self.record['newManifest']['files'] + ['0446.sql']},
                    {**self.record['newManifest'], 'files': [a.FILE]}]:
            with self.assertRaises(ValueError): a.check_delta(self.old, new)

    def test_actual_origin_verification_required(self):
        class FakeState:
            @staticmethod
            def validate_entry(*args): pass
            @staticmethod
            def verify_entry(*args): raise ValueError('dead process')
        with patch.object(a, 'read', return_value=self.record), patch.object(a, 'ledger', return_value=self.applied):
            self.assertFalse(a.allowed(Path('/unused'), self.source, self.target, FakeState))

    def test_missing_and_symlink_transition(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.assertIsNone(a.read(root))
            path = root / a.RECORD; path.parent.mkdir(parents=True)
            path.symlink_to(root / 'absent')
            with self.assertRaises(ValueError): a.read(root)

    def test_stored_digest_mutation_denies(self):
        self.record['newDigest'] = 'c' * 64
        with self.assertRaises(ValueError): a.edge(self.record, self.source, self.target, self.applied)

    def test_preflight_exact_committed_sql_and_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            web = Path(directory)
            sql_dir = web / 'supabase/migrations'; sql_dir.mkdir(parents=True)
            (sql_dir / '0001_baseline.sql').write_text('baseline')
            (sql_dir / a.FILE).write_text('reviewed fixture SQL')
            expected = hashlib.sha256(b'reviewed fixture SQL').hexdigest()
            self.record['sqlSha256'] = expected
            applied = {**self.ledger, a.FILE: expected}
            manifest_path = web / 'content/reports/schema-migrations.json'
            manifest_path.parent.mkdir(parents=True)
            manifest_path.write_text(json.dumps(self.record['newManifest']))
            def git(command, **kwargs):
                return SimpleNamespace(returncode=0, stdout='A\tweb/supabase/migrations/' + a.FILE + '\n')
            with patch.object(a, 'REVIEWED_SQL_SHA256', expected), patch.object(a, 'ledger', return_value=applied), patch.object(a.subprocess, 'run', side_effect=git):
                self.assertTrue(a.migration_preflight(web, self.record, self.source['sha']))
                (sql_dir / '0446_hidden.sql').write_text('hidden')
                with self.assertRaises(ValueError): a.migration_preflight(web, self.record, self.source['sha'])
                (sql_dir / '0446_hidden.sql').unlink()
                with patch.object(a.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout='M\tweb/supabase/migrations/' + a.FILE)):
                    with self.assertRaises(ValueError): a.migration_preflight(web, self.record, self.source['sha'])
                (sql_dir / a.FILE).write_text('tampered')
                with self.assertRaises(ValueError): a.migration_preflight(web, self.record, self.source['sha'])

    def test_source_integrations_are_narrow(self):
        root = Path(__file__).parent
        controller = (root / 'g30-serving-state.py').read_text()
        self.assertIn("schema_compatible(web, data['active'], e)", controller)
        self.assertIn("schema_compatible(web, data['active'], entry)", controller)
        self.assertIn("schema_compatible(web, data['active'], target)", controller)
        deploy = (root / 'deploy-live.sh').read_text()
        self.assertIn('g30-authority-schema-transition.py" --web "$WEB_DIR" preflight', deploy)
        self.assertIn('g30-authority-schema-transition.py" --web "$WEB_DIR" enroll', deploy)


if __name__ == '__main__': unittest.main()
