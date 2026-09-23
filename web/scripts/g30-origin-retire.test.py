import copy
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('retire', Path(__file__).with_name('g30-origin-retire.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class RetirementTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.web = Path(self.temp.name)
        (self.web / 'content/reports').mkdir(parents=True)
        (self.web / 'releases').mkdir()
        self.entries = []
        for i in range(3):
            release = self.web / 'releases' / str(i)
            release.mkdir()
            (release / 'server.js').write_text('fixture')
            (release / '.deploy-manifest.json').write_text(json.dumps({'build_sha': str(i)*40}))
            self.entries.append({'port': 4100+i, 'pid': 100+i, 'startTicks': str(30+i),
                                 'releasePath': str(release), 'sha': str(i)*40, 'schemaDigest': 'a'*64})
        self.entry = self.entries[2]
        self.data = {'version': 1, 'phase': 'stable', 'active': self.entries[0], 'previous': self.entries[1],
                     'retained': self.entries, 'verifiedGood': [4100, 4101], 'quarantined': []}
        m.state.write_state(self.web, self.data)
        digest = m.hashlib.sha256(self.entry['releasePath'].encode()).hexdigest()[:10]
        self.unit = 'g30-origin-4102-' + digest + '-' + 'b'*12 + '.service'
        self.expected = m.fingerprint(self.entry, self.unit)
        self.value = {**self.entry, 'version': 1, 'persistenceFailed': False, 'draining': True,
                      'trackedWorkDrained': True, 'activities': {}, 'unresolvedJobs': {},
                      'retirementEligible': False, 'remainingCoverage': ['other_detached_tasks']}
        self.protected = self.mock(m, 'verify_protected')
        self.target = self.mock(m, 'verify_target')
        self.registry = self.mock(m, 'registry', return_value=self.value)
        self.lock = self.mock(m.state.proxy, 'require_lock')
        self.info = self.mock(m.state.proxy, 'process_info', return_value={'start': '32'})
        self.members = self.mock(m, 'members', return_value=set())
        self.finish = self.mock(m, 'finish_unit')
        self.pidfd = self.mock(m.os, 'pidfd_open', return_value=42)
        self.close = self.mock(m.os, 'close', wraps=m.os.close)
        # Only fake pidfd close; atomic state writes must still close real FDs.
        real_close = self.close._mock_wraps
        self.close.side_effect = lambda fd: None if fd == 42 else real_close(fd)
        self.send = self.mock(m.signal, 'pidfd_send_signal')
        self.send.side_effect = lambda *args: setattr(self.info, 'return_value', None)
        self.mock(m.time, 'sleep')

    def mock(self, obj, name, **kwargs):
        p = patch.object(obj, name, **kwargs)
        self.addCleanup(p.stop)
        return p.start()

    def apply(self, **kwargs):
        options = dict(expected=self.expected, lock_fd=200, acknowledge=True, reason='Reviewed exact origin')
        options.update(kwargs)
        return m.retire(self.web, 4102, self.unit, **options)

    def test_plan_has_no_writes_or_mutation(self):
        before = m.state.state_path(self.web).read_bytes()
        plan = m.inspect(self.web, 4102, self.unit)
        self.assertEqual(plan['expect'], self.expected)
        self.assertTrue(plan['requiresUntrackedWorkAcknowledgement'])
        self.assertEqual(m.state.state_path(self.web).read_bytes(), before)
        self.registry.assert_called_once_with(self.entry)
        self.send.assert_not_called()
        self.lock.assert_not_called()

    def test_success_journals_before_signal_and_preserves_artifacts(self):
        def signal_check(*args):
            data = m.state.read_state(self.web)
            self.assertIn(4102, data['quarantined'])
            self.assertEqual(data['originRetirements'][self.expected]['status'], 'signal_requested')
            self.info.return_value = None
        self.send.side_effect = signal_check
        result = self.apply()
        self.assertEqual(result['status'], 'stopped')
        self.assertFalse(result['quiescenceProven'])
        self.send.assert_called_once_with(42, m.signal.SIGTERM)
        data = m.state.read_state(self.web)
        self.assertEqual(data['retained'], self.entries)
        self.assertEqual(data['active'], self.data['active'])
        self.assertEqual(data['previous'], self.data['previous'])
        pins = json.loads((self.web / 'content/reports/release-retention-pins.json').read_text())
        self.assertIn(self.entry['releasePath'], pins['paths'])
        self.assertTrue((Path(self.entry['releasePath']) / 'server.js').exists())

    def test_acknowledgement_not_inferred_from_empty_registry(self):
        with self.assertRaisesRegex(ValueError, 'acknowledgement'):
            self.apply(acknowledge=False)
        self.send.assert_not_called()
        self.assertEqual(m.state.read_state(self.web)['quarantined'], [])

    def test_proven_registry_can_retire_without_unknown_work_override(self):
        self.value['retirementEligible'] = True
        self.assertTrue(self.apply(acknowledge=False)['quiescenceProven'])

    def test_active_previous_and_switching_refused(self):
        for port in (4100, 4101):
            with self.assertRaisesRegex(ValueError, 'protected'):
                m.inspect(self.web, port, self.unit)
        self.data['phase'] = 'switching'
        m.state.write_state(self.web, self.data)
        with self.assertRaisesRegex(ValueError, 'Stable'):
            self.apply()
        self.send.assert_not_called()

    def test_unfinished_transition_reference_protected(self):
        for filename in ('g30-receipt-candidate.json', 'g30-schema-expansion.json', 'g30-authority-schema-transition.json'):
            path = self.web / 'content/reports' / filename
            path.write_text(json.dumps({'phase': 'preflight', 'candidate': self.entry}))
            with self.assertRaisesRegex(ValueError, 'unfinished'):
                self.apply()
            path.unlink()
        self.send.assert_not_called()

    def test_wrong_fingerprint_refused_before_drain(self):
        with self.assertRaisesRegex(ValueError, 'fingerprint'):
            self.apply(expected='0'*64)
        self.registry.assert_not_called()

    def test_missing_lock_refused(self):
        self.lock.side_effect = ValueError('missing lock')
        with self.assertRaisesRegex(ValueError, 'missing lock'):
            self.apply()
        self.target.assert_not_called()

    def test_bad_unit_refused(self):
        with self.assertRaisesRegex(ValueError, 'unit'):
            m.inspect(self.web, 4102, '../../other.service')

    def test_identity_change_refused_before_signal(self):
        self.target.side_effect = [None, ValueError('PID reused')]
        with self.assertRaisesRegex(ValueError, 'PID reused'):
            self.apply()
        self.send.assert_not_called()

    def test_unresolved_jobs_block_even_if_drained_boolean_is_true(self):
        self.value['unresolvedJobs'] = {'one': {'state': 'finish_unconfirmed'}}
        self.mock(m.time, 'monotonic', side_effect=[0, 61])
        with self.assertRaisesRegex(ValueError, 'Drain timeout'):
            self.apply()
        self.send.assert_not_called()
        self.assertIn(4102, m.state.read_state(self.web)['quarantined'])

    def test_registry_failure_never_sends_signal(self):
        self.registry.side_effect = [self.value, ValueError('persistence failure')]
        with self.assertRaises(ValueError):
            self.apply()
        self.send.assert_not_called()

    def test_final_probe_requires_still_drained(self):
        busy = {**self.value, 'activities': {'http': {}}}
        self.registry.side_effect = [self.value, self.value, busy]
        with self.assertRaisesRegex(ValueError, 'evidence changed'):
            self.apply()
        self.send.assert_not_called()

    def test_exit_timeout_never_force_stops_unit(self):
        self.info.return_value = {'start': '32'}
        self.send.side_effect = None
        self.mock(m.time, 'monotonic', side_effect=[0, 0, 61])
        with self.assertRaisesRegex(ValueError, 'Exit timeout'):
            self.apply()
        self.finish.assert_not_called()
        self.assertEqual(m.state.read_state(self.web)['originRetirements'][self.expected]['status'], 'signal_requested')

    def test_resume_after_signal_and_idempotent_completion(self):
        self.finish.side_effect = [ValueError('interrupted'), None, None]
        with self.assertRaises(ValueError):
            self.apply()
        self.send.reset_mock()
        self.registry.reset_mock()
        self.assertEqual(self.apply()['status'], 'stopped')
        self.assertEqual(self.apply()['status'], 'stopped')
        self.send.assert_not_called()
        self.registry.assert_not_called()

    def test_changed_state_is_not_overwritten_on_refusal(self):
        def registry_call(entry, action=None):
            if action == 'drain':
                data = m.state.read_state(self.web)
                data['reviewDeferred'] = 'concurrent update'
                m.state.write_state(self.web, data)
            return self.value
        self.registry.side_effect = registry_call
        with self.assertRaisesRegex(ValueError, 'changed during'):
            self.apply()
        self.assertEqual(m.state.read_state(self.web)['reviewDeferred'], 'concurrent update')
        self.send.assert_not_called()

    def test_timeout_and_reason_bounds(self):
        for options in ({'timeout': 0}, {'timeout': 301}, {'reason': ''}, {'reason': 'x'*501}):
            with self.assertRaises(ValueError):
                self.apply(**options)
        self.send.assert_not_called()

    def test_dead_failed_origin_quarantined_without_claiming_job_quiescence(self):
        self.info.return_value = None
        self.assertTrue(m.inspect(self.web, 4102, self.unit)['processMissing'])
        with self.assertRaisesRegex(ValueError, 'unknown job state'):
            self.apply(acknowledge=False)
        result = self.apply()
        self.assertEqual(result['status'], 'stopped')
        self.assertFalse(result['quiescenceProven'])
        self.assertIn(4102, m.state.read_state(self.web)['quarantined'])
        self.send.assert_not_called()

    def test_unit_bound_to_release(self):
        with self.assertRaisesRegex(ValueError, 'bound'):
            m.inspect(self.web, 4102, self.unit.replace('4102', '4103'))


class PrimitiveTests(unittest.TestCase):
    def test_warm_rollback_required(self):
        active = {'pid': 1, 'port': 4100}
        data = {'active': active, 'previous': None, 'verifiedGood': [], 'quarantined': []}
        for warm in (None, active, {'pid': 2, 'port': 4101}):
            data['previous'] = warm
            with self.assertRaisesRegex(ValueError, 'warm rollback'):
                m.verify_protected(Path('/unused'), data)

    def test_unit_not_found_requires_complete_confirmed_status(self):
        result = SimpleNamespace(returncode=1, stdout='MainPID=0\nActiveState=inactive\nLoadState=not-found\n')
        with patch.object(m.subprocess, 'run', return_value=result):
            self.assertEqual(m.unit_status('unit')['LoadState'], 'not-found')
            result.stdout = ''
            with self.assertRaises(ValueError):
                m.unit_status('unit')

    def test_registry_validates_identity_persistence_and_shape(self):
        entry = {'pid': 20, 'startTicks': '100', 'releasePath': '/release', 'port': 4102}
        good = {**entry, 'version': 1, 'persistenceFailed': False, 'activities': {}, 'unresolvedJobs': {}}
        from unittest.mock import MagicMock
        response = MagicMock()
        response.__enter__.return_value = response
        response.status = 200
        opener = MagicMock()
        opener.open.return_value = response
        with patch.object(Path, 'read_bytes', return_value=b'CRON_SECRET=fixture\0'), patch.object(m.urllib.request, 'build_opener', return_value=opener):
            for change in ({'pid': 21}, {'startTicks': '101'}, {'releasePath': '/wrong'}, {'persistenceFailed': True}, {'activities': None}, {'unresolvedJobs': None}, {'version': 2}):
                response.read.return_value = json.dumps({**good, **change}).encode()
                with self.assertRaises(ValueError):
                    m.registry(entry)
            response.read.return_value = json.dumps(good).encode()
            self.assertEqual(m.registry(entry), good)

    def test_finish_refuses_populated_group_without_stop(self):
        with patch.object(m.state.proxy, 'process_info', return_value=None), patch.object(m, 'members', return_value={22}), patch.object(m.supervisor, 'command') as command:
            with self.assertRaisesRegex(ValueError, 'still present'):
                m.finish_unit({'pid': 11}, 'unit')
            command.assert_not_called()

    def test_finish_requires_supervisor_confirmation(self):
        with patch.object(m.state.proxy, 'process_info', return_value=None), patch.object(m, 'members', return_value=set()), patch.object(m.supervisor, 'command'), patch.object(m, 'unit_status', side_effect=[{'MainPID': '0', 'ActiveState': 'active', 'LoadState': 'loaded'}, {'MainPID': '11', 'ActiveState': 'active', 'LoadState': 'loaded'}]):
            with self.assertRaisesRegex(ValueError, 'confirm'):
                m.finish_unit({'pid': 11}, 'unit')

    def test_collected_transient_unit_does_not_require_stop(self):
        with patch.object(m.state.proxy, 'process_info', return_value=None), patch.object(m, 'members', return_value=set()), patch.object(m.supervisor, 'command') as command, patch.object(m, 'unit_status', return_value={'MainPID': '0', 'ActiveState': 'inactive', 'LoadState': 'not-found'}):
            m.finish_unit({'pid': 11}, 'unit')
            command.assert_not_called()

    def test_redirect_refused(self):
        with self.assertRaises(ValueError):
            m.NoRedirect().redirect_request(None, None, None, None, None, None)


if __name__ == '__main__':
    unittest.main()
