#!/usr/bin/env python3
"""L1-4 boot path tests. Every host effect is mocked: no systemd, nginx,
network, deploy lock or production state is touched.

Run: python3 web/scripts/g30-boot-serve.test.py
"""
import contextlib
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('boot', HERE / 'g30-boot-serve.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


class Host:
    """Scripted fake host: serving state, process table, nginx, helper CLI."""

    def __init__(self, test, data, gone=(), nginx=None, healthy=(), launch_fail=(), helper_fail=None):
        self.test, self.data = test, copy.deepcopy(data)
        self.gone = set(gone)            # ports whose RECORDED process is gone
        self.nginx = nginx if nginx is not None else data['active']['port']
        self.healthy = set(healthy)      # ports a cold-started origin answers on
        self.launch_fail = set(launch_fail)
        self.helper_fail = helper_fail or {}
        self.calls = []
        self.next_pid = 9000

    def entry(self, port):
        return next(e for e in self.data['retained'] if e['port'] == port)

    # patched functions
    def read_state(self, web):
        return copy.deepcopy(self.data)

    def recorded_process_gone(self, entry):
        return entry['port'] in self.gone

    def verify_entry(self, entry, web=None):
        if entry['port'] in self.gone:
            raise ValueError('dead')
        return entry

    def configured_port(self):
        return self.nginx

    def state_helper(self, web, fd, *args):
        self.calls.append(('state',) + args)
        name = args[0]
        remaining = self.helper_fail.get(name, 0)
        if remaining:
            self.helper_fail[name] = remaining - 1
            raise m.Refused(f'{name} refused (scripted)')
        if name == '--quarantine':
            self.data['quarantined'].append(int(args[2]))
        elif name == '--begin':
            self.data['phase'] = 'switching'
        elif name == '--activate':
            self.data['phase'] = 'stable'
        elif name == '--rebind':
            self.gone.discard(int(args[2]))
        return '{}'

    def launch(self, web, entry, fd):
        self.calls.append(('launch', entry['port']))
        if entry['port'] in self.launch_fail:
            raise m.Refused('launch refused (scripted)')
        self.next_pid += 1
        return {'pid': self.next_pid, 'unit': f"g30-origin-{entry['port']}-x.service"}

    def http_ok(self, port):
        return port in self.healthy

    def proxy_switch(self, src, dst, fd):
        self.calls.append(('proxy', src, dst))
        self.nginx = dst

    @contextlib.contextmanager
    def patched(self):
        with contextlib.ExitStack() as stack:
            for target, name in ((m.serving, 'read_state'), (m.serving, 'recorded_process_gone'), (m.serving, 'verify_entry'),
                                 (m, 'configured_port'), (m, 'state_helper'), (m, 'launch'), (m, 'http_ok'), (m, 'proxy_switch')):
                stack.enter_context(patch.object(target, name, side_effect=getattr(self, name)))
            stack.enter_context(patch.object(m.serving, 'schema_compatible', return_value=True))
            stack.enter_context(patch.object(m.proxy, 'require_lock'))
            stack.enter_context(patch.object(m, 'process_alive', return_value=True))
            stack.enter_context(patch.object(m, 'wait_dependencies', return_value=True))
            stack.enter_context(patch.object(m, 'public_sha', return_value=self.data['active']['sha']))
            stack.enter_context(patch.object(m, 'PID_FILE', Path(self.test.temp.name) / 'pid'))
            stack.enter_context(patch.object(m.time, 'sleep'))
            yield self

    def names(self):
        return [c[0] if c[0] != 'state' else c[1] for c in self.calls]


class BootServeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.web = Path(self.temp.name)
        (self.web / 'releases').mkdir()
        self.entries = []
        for n, port in enumerate((4100, 4101, 4102, 4103)):
            release = self.web / 'releases' / f'r{n}'
            release.mkdir(); (release / 'server.js').write_text('fixture')
            self.entries.append({'port': port, 'pid': 100 + n, 'startTicks': str(10 + n), 'releasePath': str(release),
                                 'sha': str(n) * 40, 'schemaDigest': 'a' * 64})
        # active 4103, previous 4102, two older verified-good origins.
        self.data = {'version': 1, 'phase': 'stable', 'active': self.entries[3], 'previous': self.entries[2],
                     'retained': list(self.entries), 'verifiedGood': [4100, 4101, 4102, 4103], 'quarantined': []}

    def tearDown(self):
        self.temp.cleanup()

    def apply(self, host):
        with host.patched():
            return m.apply(self.web, 200, health_timeout=30, deps_timeout=1)

    def test_healthy_routed_active_is_a_noop(self):
        host = Host(self, self.data)
        result = self.apply(host)
        self.assertEqual(result['outcome'], 'noop')
        self.assertEqual(host.calls, [])

    def test_live_but_unverified_active_is_never_duplicated(self):
        host = Host(self, self.data)
        with host.patched(), patch.object(m.serving, 'verify_entry', side_effect=ValueError('status 500')):
            with self.assertRaisesRegex(m.Refused, 'watchdog'):
                m.apply(self.web, 200, 30, 1)
        self.assertEqual(host.calls, [])

    def test_live_active_with_routing_mismatch_is_left_to_watchdog(self):
        host = Host(self, self.data, nginx=4102)
        with host.patched():
            with self.assertRaisesRegex(m.Refused, 'routing'):
                m.apply(self.web, 200, 30, 1)
        self.assertEqual(host.calls, [])

    def test_reboot_quarantines_ghosts_then_cold_starts_and_rebinds_active(self):
        host = Host(self, self.data, gone={4100, 4101, 4102, 4103}, healthy={4103})
        result = self.apply(host)
        self.assertEqual(result['outcome'], 'started')
        self.assertEqual(result['public'], 'verified')
        # previous (4102) is the fallback and stays eligible; older ghosts quarantined first.
        self.assertEqual(host.calls[:3], [('state', '--quarantine', '--listen-port', '4100'),
                                          ('state', '--quarantine', '--listen-port', '4101'), ('launch', 4103)])
        rebind = [c for c in host.calls if c[:2] == ('state', '--rebind')]
        self.assertEqual(rebind, [('state', '--rebind', '--listen-port', '4103', '--pid', str(result['pid']))])
        self.assertNotIn('proxy', host.names())
        self.assertEqual((Path(self.temp.name) / 'pid').read_text().strip(), str(result['pid']))

    def test_rebind_retries_while_schema_warms_up(self):
        host = Host(self, self.data, gone={4103}, healthy={4103}, helper_fail={'--rebind': 2})
        result = self.apply(host)
        self.assertEqual(result['outcome'], 'started')
        self.assertEqual(sum(1 for c in host.calls if c[:2] == ('state', '--rebind')), 3)

    def test_reboot_with_nginx_elsewhere_switches_back_under_lock(self):
        host = Host(self, self.data, gone={4100, 4101, 4102, 4103}, healthy={4103}, nginx=4102)
        result = self.apply(host)
        self.assertEqual(result['outcome'], 'started')
        names = host.names()
        self.assertLess(names.index('--rebind'), names.index('--begin'))
        self.assertLess(names.index('--begin'), names.index('proxy'))
        self.assertLess(names.index('proxy'), names.index('--activate'))
        self.assertIn(('proxy', 4102, 4103), host.calls)
        self.assertEqual(host.nginx, 4103)

    def test_interrupted_switch_is_closed_with_activate(self):
        self.data['phase'] = 'switching'
        host = Host(self, self.data, gone={4103, 4102}, healthy={4103})
        self.assertEqual(self.apply(host)['outcome'], 'started')
        self.assertNotIn('--begin', host.names())
        self.assertIn(('state', '--activate', '--listen-port', '4103'), host.calls)

    def test_failed_active_hands_off_to_warm_rollback_with_cold_started_previous(self):
        host = Host(self, self.data, gone={4100, 4101, 4102, 4103}, healthy={4102}, launch_fail={4103})
        result = self.apply(host)
        self.assertEqual(result, {'outcome': 'handoff', 'expectedActive': 4103, 'target': 4102, 'exit': m.EXIT_HANDOFF})
        self.assertIn(('launch', 4102), host.calls)
        self.assertIn(('state', '--rebind', '--listen-port', '4102', '--pid', '9001'), host.calls)
        self.assertNotIn('proxy', host.names())  # deploy-live --rollback owns the switch

    def test_unhealthy_active_times_out_then_falls_back(self):
        host = Host(self, self.data, gone={4102, 4103}, healthy={4102})
        clock = iter(range(0, 10_000, 5))
        with host.patched(), patch.object(m.time, 'monotonic', side_effect=lambda: next(clock)):
            result = m.apply(self.web, 200, health_timeout=30, deps_timeout=1)
        self.assertEqual(result['target'], 4102)

    def test_no_fallback_fails_closed(self):
        self.data['previous'] = None
        self.data['verifiedGood'] = [4103]
        host = Host(self, self.data, gone={4100, 4101, 4102, 4103}, launch_fail={4103})
        with host.patched():
            with self.assertRaisesRegex(m.Refused, 'no eligible fallback'):
                m.apply(self.web, 200, 30, 1)

    def test_origin_exit_during_boot_fails_fast(self):
        host = Host(self, self.data, gone={4103}, healthy={4103})
        with host.patched(), patch.object(m, 'process_alive', return_value=False):
            with self.assertRaisesRegex(m.Refused, 'exited during boot'):
                m.start_and_rebind(self.web, self.entries[3], 200, 30)

    def test_quarantined_previous_is_not_a_fallback(self):
        self.data['quarantined'] = [4102]
        host = Host(self, self.data)
        with host.patched():
            self.assertEqual(m.fallback_target(self.web, self.data)['port'], 4101)

    def test_main_exit_codes_and_dry_run_never_mutates(self):
        host = Host(self, self.data, gone={4100, 4101, 4102, 4103}, healthy={4102}, launch_fail={4103})
        out, err = io.StringIO(), io.StringIO()
        with host.patched(), contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            self.assertEqual(m.main(['--web', str(self.web), '--apply', '--lock-fd', '200', '--health-timeout', '5']), 10)
        self.assertEqual(json.loads(out.getvalue())['target'], 4102)
        host = Host(self, self.data, gone={4100, 4101, 4103})
        out = io.StringIO()
        with host.patched(), contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(m.main(['--web', str(self.web)]), 0)
        plan = json.loads(out.getvalue())
        self.assertEqual((plan['action'], plan['fallbackPort'], plan['quarantineGhosts']), ('cold-start-active', 4102, [4100, 4101]))
        self.assertEqual(host.calls, [])

    def test_apply_requires_the_deploy_lock(self):
        with patch.object(m.serving, 'read_state', return_value=self.data):
            out, err = io.StringIO(), io.StringIO()
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                self.assertEqual(m.main(['--web', str(self.web), '--apply']), 1)
            self.assertIn('boot_serve_refused', err.getvalue())

    def test_frozen_snapshot_must_be_unique(self):
        release = Path(self.entries[3]['releasePath'])
        with self.assertRaises(m.Refused):
            m.frozen_node_path(release)
        (release / '.g30-runtime/aa/node_modules').mkdir(parents=True)
        self.assertEqual(m.frozen_node_path(release), release / '.g30-runtime/aa/node_modules')
        (release / '.g30-runtime/bb/node_modules').mkdir(parents=True)
        with self.assertRaises(m.Refused):
            m.frozen_node_path(release)

    def test_pinned_policy_uses_newest_unit_of_same_release(self):
        directory = Path(self.temp.name) / 'runtime'; directory.mkdir()
        entry = self.entries[3]
        tag = m.hashlib.sha256(entry['releasePath'].encode()).hexdigest()[:10]
        older = directory / f'g30-origin-4103-{tag}-old.service.json'
        newer = directory / f'g30-origin-4103-{tag}-new.service.json'
        older.write_text(json.dumps({'releasePath': entry['releasePath'], 'runtimePolicy': {'G30_CREDIT_RECEIPTS': '1'}}))
        newer.write_text(json.dumps({'releasePath': entry['releasePath'], 'runtimePolicy': {'G30_CREDIT_RECEIPTS': '0'}}))
        os.utime(older, (1, 1)); os.utime(newer, (2, 2))
        (directory / 'g30-origin-4103-0000000000-x.service.json').write_text(json.dumps({'releasePath': '/other', 'runtimePolicy': {'X': '1'}}))
        self.assertEqual(m.pinned_policy(entry, directory), {'G30_CREDIT_RECEIPTS': '0'})
        self.assertIsNone(m.pinned_policy(self.entries[0], directory))

    def test_launch_reuses_supervised_launcher_with_frozen_runtime_and_lock(self):
        entry = self.entries[3]
        snapshot = Path(entry['releasePath']) / '.g30-runtime/fp/node_modules'; snapshot.mkdir(parents=True)
        completed = subprocess.CompletedProcess([], 0, stdout=json.dumps({'pid': 4242, 'unit': 'g30-origin-4103-x.service'}), stderr='')
        with patch.object(m, 'run', return_value=completed) as run, patch.object(m, 'pinned_policy', return_value={'G30_CREDIT_PURCHASES_PAUSED': '1'}), \
             contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(m.launch(self.web, entry, 200)['pid'], 4242)
        argv, kwargs = run.call_args.args[0], run.call_args.kwargs
        self.assertTrue(argv[1].endswith('g30-supervised-launch.py'))
        self.assertEqual(argv[2:], ['--web', str(self.web), '--release', entry['releasePath'], '--port', '4103', '--apply', '--lock-fd', '200'])
        self.assertEqual(kwargs['lock_fd'], 200)
        self.assertEqual(kwargs['cwd'], entry['releasePath'])
        env = kwargs['env']
        self.assertEqual((env['NODE_PATH'], env['PORT'], env['HOSTNAME'], env['G30_CREDIT_PURCHASES_PAUSED']),
                         (str(snapshot), '4103', '127.0.0.1', '1'))

    def test_never_signals_processes(self):
        source = (HERE / 'g30-boot-serve.py').read_text() + (HERE / 'g30-boot-serve.sh').read_text()
        for word in ('os.kill', 'killpg', 'fuser', 'systemctl stop', 'systemctl restart', 'pkill'):
            self.assertNotIn(word, source)


class LoadEnvParityTest(unittest.TestCase):
    def test_shared_loader_matches_deploy_contract(self):
        if not shutil.which('node'):
            self.skipTest('node unavailable')
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, '.env').write_text('# comment\nPLAIN=value\nQUOTED="with space"\nSINGLE=\'x=y\'\nSUPABASE_URL=http://supabase-kong:8000\n')
            script = f'set -u; WEB_DIR={tmp}; source {HERE}/lib/load-env.sh; load_env; ' \
                     'printf "%s|%s|%s|%s|%s|%s" "$PLAIN" "$QUOTED" "$SINGLE" "$SUPABASE_URL" "$REDIS_URL" "$NODE_ENV"'
            result = subprocess.run(['bash', '-c', script], capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, 'value|with space|x=y|http://127.0.0.1:8000|redis://127.0.0.1:6379|production')

    def test_deploy_live_sources_the_shared_loader(self):
        source = (HERE / 'deploy-live.sh').read_text()
        self.assertIn('source "$SCRIPT_DIR/lib/load-env.sh"', source)
        self.assertNotIn('load_env() {', source)
        self.assertLess(source.index('lib/load-env.sh'), source.index('\nload_env\n'))


class WrapperTest(unittest.TestCase):
    """Runs the real wrapper against fake helpers in an isolated directory."""

    def run_wrapper(self, controller_exit, controller_out, rollback_exit=0):
        tmp = tempfile.TemporaryDirectory(); self.addCleanup(tmp.cleanup)
        root = Path(tmp.name); scripts = root / 'web/scripts'; (scripts / 'lib').mkdir(parents=True)
        shutil.copy(HERE / 'g30-boot-serve.sh', scripts)
        (scripts / 'lib/load-env.sh').write_text('load_env() { export LOADED=1; }\n')
        record = root / 'record'
        (scripts / 'g30-boot-serve.py').write_text(
            f'import os,sys\nopen({str(record)!r},"a").write("controller "+" ".join(sys.argv[1:])+" loaded="+os.environ.get("LOADED","0")+"\\n")\n'
            f'print({controller_out!r}); sys.exit({controller_exit})\n')
        (scripts / 'deploy-live.sh').write_text(
            f'echo "rollback $* warm=$G30_REQUIRE_WARM_ROLLBACK expected=$G30_RECOVERY_EXPECTED_PORT" >> {record}\nexit {rollback_exit}\n')
        (scripts / 'g30-serving-state.py').write_text('import sys\nprint(4102 if "--port" in sys.argv else "{}")\n')
        (scripts / 'g30-proxy-switch.py').write_text('print(4102)\n')
        env = {**os.environ, 'BOOT_SERVE_LOCK': str(root / 'lock'), 'BOOT_SERVE_LOG': str(root / 'boot.log')}
        result = subprocess.run(['bash', str(scripts / 'g30-boot-serve.sh')], capture_output=True, text=True, env=env, timeout=60)
        return result, record.read_text() if record.exists() else ''

    def test_handoff_runs_canonical_warm_rollback_after_releasing_lock(self):
        result, record = self.run_wrapper(10, '{"outcome":"handoff","expectedActive":4103,"target":4102,"exit":10}')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('controller --web', record)
        self.assertIn('--apply --lock-fd 200 loaded=1', record)
        self.assertIn('rollback --rollback --wait warm=1 expected=4103', record)

    def test_noop_skips_rollback_and_failure_escalates(self):
        result, record = self.run_wrapper(0, '{"outcome":"noop","port":4102}')
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertNotIn('rollback', record)
        result, record = self.run_wrapper(1, '')
        self.assertEqual(result.returncode, 1)
        self.assertIn('ESCALATE', result.stdout)
        result, _ = self.run_wrapper(10, '{"expectedActive":4103}', rollback_exit=1)
        self.assertEqual(result.returncode, 1)


if __name__ == '__main__':
    unittest.main()
