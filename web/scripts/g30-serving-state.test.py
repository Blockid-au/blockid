import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch, MagicMock

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('serving', Path(__file__).with_name('g30-serving-state.py'))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

class ServingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.web = Path(self.temp.name)
        (self.web / 'content/reports').mkdir(parents=True)
        (self.web / 'releases').mkdir()
        self.entries = []
        for n, port in enumerate((4001, 4100, 4101)):
            path = self.web / 'releases' / str(n); path.mkdir(); (path / 'server.js').write_text('fixture')
            self.entries.append({'port': port, 'pid': 100 + n, 'startTicks': str(20+n), 'releasePath': str(path), 'sha': str(n)*40, 'schemaDigest': 'a'*64})
        self.data = {'version': 1, 'active': self.entries[0], 'previous': None, 'retained': [self.entries[0]], 'phase': 'stable', 'verifiedGood': [4001], 'quarantined': []}

    def tearDown(self):
        self.temp.cleanup()

    def command(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with patch.object(sys, 'argv', ['helper', '--web', str(self.web), *args]), patch.object(m.proxy, 'require_lock'), patch.object(m, 'verify_entry', side_effect=lambda entry, web=None: entry), contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            result = m.main()
        return result, out.getvalue(), err.getvalue()

    def test_dead_quarantined_capacity_preserves_pins_and_history(self):
        self.data['retained'] = list(self.entries)
        self.data['quarantined'] = [4100]
        before = copy.deepcopy(self.data)
        with patch.object(Path, 'stat', side_effect=FileNotFoundError):
            self.assertEqual(m.retained_capacity(self.data), 2)
        self.assertEqual(self.data, before)
        m.write_state(self.web, self.data)
        self.assertEqual(len(json.loads((self.web / 'content/reports/release-retention-pins.json').read_text())['paths']), 3)
        for result in (PermissionError(), MagicMock()):
            with patch.object(Path, 'stat', side_effect=result if isinstance(result, Exception) else None, return_value=result):
                self.assertEqual(m.retained_capacity(self.data), 3)
        self.data['previous'] = self.entries[1]
        with patch.object(Path, 'stat', side_effect=FileNotFoundError):
            self.assertEqual(m.retained_capacity(self.data), 3)

    def test_missing_only_bootstrap_and_malformed_failclosed(self):
        self.assertEqual(self.command('--port')[:2], (0, '4001\n'))
        m.state_path(self.web).write_text('{}')
        self.assertEqual(self.command('--port')[0], 1)
        m.state_path(self.web).write_text('invalid')
        self.assertEqual(self.command('--port')[0], 1)

    def test_switching_pauses_consumers(self):
        m.write_state(self.web, self.data)
        self.assertEqual(self.command('--begin', '--lock-fd', '200')[0], 0)
        self.assertEqual(self.command('--port')[0], 1)
        self.assertEqual(self.command('--snapshot')[0], 0)

    def test_pins_written_before_state(self):
        real = m.atomic_json; order = []
        def record(path, data):
            order.append(path.name); real(path, data)
        with patch.object(m, 'atomic_json', side_effect=record):
            m.write_state(self.web, self.data)
        self.assertEqual(order, ['release-retention-pins.json', 'g30-serving-state.json'])
        self.assertEqual(json.loads((self.web / 'content/reports/release-retention-pins.json').read_text())['paths'], [self.entries[0]['releasePath']])

    def test_candidate_only_becomes_good_after_gates(self):
        self.data['retained'].append(self.entries[1]); m.write_state(self.web, self.data)
        self.command('--begin', '--lock-fd', '200')
        self.assertEqual(self.command('--activate', '--listen-port', '4100', '--lock-fd', '200')[0], 0)
        data = m.read_state(self.web)
        self.assertEqual(data['verifiedGood'], [4001])
        self.assertEqual(data['previous']['port'], 4001)
        self.assertEqual(self.command('--init', '--lock-fd', '200')[0], 1)
        self.assertEqual(self.command('--mark-good', '--lock-fd', '200')[0], 1)
        self.assertEqual(self.command('--gates-passed', '--lock-fd', '200')[0], 0)
        self.assertEqual(self.command('--mark-good', '--lock-fd', '200')[0], 1)
        with patch.object(m.time, 'time', return_value=m.time.time() + 1801):
            self.assertEqual(self.command('--mark-good', '--lock-fd', '200')[0], 0)
        self.assertEqual(m.read_state(self.web)['verifiedGood'], [4001, 4100])

    def test_quarantine_and_rollback_cannot_pingpong(self):
        self.data['retained'].append(self.entries[1]); self.data['active'] = self.entries[1]
        m.write_state(self.web, self.data)
        self.assertEqual(json.loads(self.command('--rollback-target')[1])['port'], 4001)
        self.command('--quarantine', '--listen-port', '4100', '--lock-fd', '200')
        self.command('--begin', '--lock-fd', '200')
        self.assertEqual(self.command('--activate', '--rollback', '--listen-port', '4001', '--lock-fd', '200')[0], 0)
        self.assertIsNone(m.read_state(self.web)['previous'])
        self.assertEqual(self.command('--rollback-target')[0], 1)
        self.command('--begin', '--lock-fd', '200')
        self.assertEqual(self.command('--activate', '--listen-port', '4100', '--lock-fd', '200')[0], 1)

    def test_incompatible_schema_not_rollback_target(self):
        self.data['retained'].append(self.entries[1]); self.data['active'] = self.entries[1]
        self.entries[1]['schemaDigest'] = 'b'*64
        m.write_state(self.web, self.data)
        self.assertEqual(self.command('--rollback-target')[0], 1)

    def test_no_dead_retained_check_for_port_reader(self):
        self.data['retained'].append(self.entries[1]); m.write_state(self.web, self.data)
        with patch.object(m, 'verify_entry', side_effect=AssertionError('reader must not probe unrelated process')):
            self.assertEqual(m.read_state(self.web)['active']['port'], 4001)

    def test_duplicate_or_external_release_rejected(self):
        for mutate in (lambda d: d['retained'].append(d['active']), lambda d: d['active'].update(releasePath='/tmp')):
            data = copy.deepcopy(self.data); mutate(data)
            m.state_path(self.web).write_text(json.dumps(data))
            with self.assertRaises(ValueError):
                m.read_state(self.web)

    def test_abandoned_switch_can_recover_current_verified_good(self):
        self.data['retained'].append(self.entries[1])
        self.data['phase'] = 'switching'
        m.write_state(self.web, self.data)
        result, output, error = self.command('--rollback-target')
        self.assertEqual(result, 0, error)
        self.assertEqual(json.loads(output)['port'], 4001)

    def test_identity_guards_reject_pid_reuse_and_wrong_cwd_before_network(self):
        entry = self.entries[0]
        with patch.object(m.proxy, 'process_info', return_value={'start': '999'}), patch.object(m.urllib.request, 'urlopen') as network:
            with self.assertRaisesRegex(ValueError, 'PID reused'):
                m.verify_entry(entry, self.web)
            network.assert_not_called()
        with patch.object(m.proxy, 'process_info', return_value={'start': entry['startTicks']}), patch.object(Path, 'resolve', return_value=Path('/wrong')), patch.object(m.urllib.request, 'urlopen') as network:
            with self.assertRaisesRegex(ValueError, 'cwd'):
                m.verify_entry(entry, self.web)
            network.assert_not_called()

    def test_listener_token_and_status_proofs_are_mandatory(self):
        entry = self.entries[0]
        real_read = Path.read_text
        def proc_read(path, *args, **kwargs):
            if str(path) == '/proc/net/tcp':
                return 'header\n0: 0100007F:0FA1 00000000:0000 0A 0 0 0 1000 0 999\n'
            if str(path) == '/proc/net/tcp6':
                return 'header\n'
            return real_read(path, *args, **kwargs)
        for scenario in ('wrong_socket', 'missing_token', 'wrong_sha', 'missing_schema', 'healthy'):
            with self.subTest(scenario=scenario):
                response = MagicMock()
                response.__enter__.return_value = response
                response.status = 200
                response.read.return_value = json.dumps({'git_sha': 'wrong' if scenario == 'wrong_sha' else entry['sha'], 'schema_migrations': 'unknown' if scenario == 'missing_schema' else 'ok'}).encode()
                (self.web / '.env').write_text('OTHER_KEY=ignored\n' if scenario == 'missing_token' else 'CRON_SECRET="fixture-secret"\n')
                with patch.object(m.proxy, 'process_info', return_value={'start': entry['startTicks']}), patch.object(Path, 'resolve', return_value=Path(entry['releasePath'])), patch.object(Path, 'iterdir', return_value=iter([Path('/mock/fd/1')])), patch.object(Path, 'read_text', proc_read), patch.object(m.os, 'readlink', return_value='socket:[111]' if scenario == 'wrong_socket' else 'socket:[999]'), patch.dict(m.os.environ, {}, clear=True), patch.object(m.urllib.request, 'urlopen', return_value=response) as network:
                    if scenario == 'healthy':
                        self.assertEqual(m.verify_entry(entry, self.web), entry)
                        request = network.call_args.args[0]
                        self.assertEqual(request.get_header('Authorization'), 'Bearer fixture-secret')
                    else:
                        with self.assertRaises(ValueError):
                            m.verify_entry(entry, self.web)
                        if scenario in ('wrong_socket', 'missing_token'):
                            network.assert_not_called()

    def test_headroom_and_cap_refuse_without_process_termination(self):
        data = copy.deepcopy(self.data); data['retained'] *= 5
        with self.assertRaises(ValueError):
            m.allocate(data)
        with patch.object(Path, 'read_text', return_value='MemAvailable: 100 kB\n'), self.assertRaises(ValueError):
            m.allocate(self.data)

    def test_unknown_pinned_candidate_blocks_next_admission(self):
        (self.web / '.next-candidate').symlink_to(self.entries[1]['releasePath'])
        with self.assertRaises(ValueError):
            m.allocate(self.data, self.web)

if __name__ == '__main__':
    unittest.main()
