#!/usr/bin/env python3
import importlib.util
import os
from pathlib import Path
import tempfile
import sys
sys.dont_write_bytecode = True
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('launch', Path(__file__).with_name('g30-supervised-launch.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class SupervisedLaunchTests(unittest.TestCase):
    def test_environment_serialization_preserves_literal_values(self):
        text = m.encode_environment({'KEY': 'a"b\\c\nline $VALUE `literal`'})
        self.assertEqual(text, 'KEY="a\\"b\\\\c\nline $VALUE `literal`"\n')
        for values in [{'BAD-KEY': 'x'}, {'KEY': 'x\0y'}, {'KEY': 'x\ry'}]:
            with self.assertRaises(ValueError): m.encode_environment(values)

    def test_private_directory_uses_account_home_and_rejects_unsafe_permissions(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(m.pwd, 'getpwuid') as user, patch.dict(os.environ, {'HOME': '/untrusted-home'}):
                user.return_value.pw_dir = tmp
                target = m.private_directory()
                self.assertEqual(target, Path(tmp) / '.local/state/blockid-runtime')
                self.assertEqual(target.stat().st_mode & 0o777, 0o700)
                target.chmod(0o755)
                with self.assertRaises(ValueError): m.private_directory()

    def test_private_file_exclusive_permissions(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / 'env'
            m.write_private(target, 'secret')
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError): m.write_private(target, 'replacement')
            self.assertEqual(target.read_text(), 'secret')

    def test_environment_copies_only_trusted_key_names_and_runtime_overrides(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); release = root / 'release'; runtime = release / '.g30-runtime'
            runtime.mkdir(parents=True)
            (root / '.env').write_text('API_KEY=old\nexport OTHER=old\n')
            with patch.dict(os.environ, {'API_KEY': 'current-secret', 'OTHER': 'current', 'SUPABASE_URL': 'http://forced-db', 'REDIS_URL': 'redis://forced-cache', 'UNRELATED_SECRET': 'not-for-app', 'NODE_PATH': str(runtime)}, clear=True):
                result = m.environment(root, release, 4100)
                self.assertEqual(result['API_KEY'], 'current-secret')
                self.assertNotIn('UNRELATED_SECRET', result)
                self.assertEqual(result['SUPABASE_URL'], 'http://forced-db')
                self.assertEqual(result['REDIS_URL'], 'redis://forced-cache')
                self.assertEqual(result['PORT'], '4100')
                self.assertEqual(result['HOSTNAME'], '127.0.0.1')
                self.assertEqual(result['NODE_ENV'], 'production')
                os.environ['NODE_PATH'] = tmp
                with self.assertRaises(ValueError): m.environment(root, release, 4100)

    def test_launch_uses_system_manager_and_no_secret_arguments(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            checks = {'pid': 123, 'startTicks': '99', 'unit': 'fixture'}
            with patch.object(m.os, 'getuid', return_value=1001), patch.object(m.pwd, 'getpwuid') as user, patch.object(m, 'private_directory', return_value=directory), patch.object(m, 'environment', return_value={'API_KEY': 'SENSITIVE_VALUE'}), patch.object(m, 'command') as cmd, patch.object(m, 'check', return_value=checks) as check, patch.object(m.shutil, 'which', return_value='/usr/bin/node'), patch.object(m.time, 'sleep'):
                user.return_value.pw_name = 'app-user'
                result = m.launch(directory, directory, 4100)
                argv = cmd.call_args.args[0]
                self.assertEqual(argv[0], 'systemd-run')
                for prop in ['--service-type=exec', '--property=Restart=no', '--property=ExitType=cgroup', '--property=User=app-user']:
                    self.assertIn(prop, argv)
                self.assertNotIn('--user', argv)
                self.assertNotIn('--collect', argv)
                self.assertIn('--property=RemainAfterExit=yes', argv)
                self.assertIn('--property=CollectMode=inactive', argv)
                self.assertTrue(Path(result['metadataFile']).is_file())
                self.assertNotIn('SENSITIVE_VALUE', Path(result['metadataFile']).read_text())
                self.assertNotIn('SENSITIVE_VALUE', ' '.join(argv))
                self.assertNotIn('SENSITIVE_VALUE', str(result))
                self.assertEqual(check.call_count, 2)
                self.assertEqual(Path(result['environmentFile']).stat().st_mode & 0o777, 0o600)
                self.assertIn('SENSITIVE_VALUE', Path(result['environmentFile']).read_text())

    def test_failed_post_launch_identity_is_not_success(self):
        with patch.object(m.os, 'getuid', return_value=1001), patch.object(m.pwd, 'getpwuid'), patch.object(m, 'command'), patch.object(m, 'check', side_effect=ValueError('dead')):
            with self.assertRaises(ValueError): m.launch(Path('/tmp'), probe=True)

    def test_check_rejects_inactive_or_changed_pid_or_wrong_cgroup(self):
        unit = 'g30-origin-4100-abc.service'
        for raw in ['MainPID=0\nActiveState=inactive\nControlGroup=/system.slice/'+unit,
                    'MainPID=99\nActiveState=active\nControlGroup=/system.slice/'+unit,
                    'MainPID=123\nActiveState=active\nControlGroup=/user.slice/bad']:
            with patch.object(m, 'command', return_value=raw):
                with self.assertRaises(ValueError): m.check(unit, 123)

    def test_command_closes_inherited_fds_and_hides_error_output(self):
        with patch.object(m.subprocess, 'run') as run:
            run.return_value.returncode = 1
            run.return_value.stderr = 'SENSITIVE_VALUE'
            with self.assertRaisesRegex(ValueError, '^Supervisor command failed') as err:
                m.command(['systemctl', 'show', 'fixture'])
            self.assertNotIn('SENSITIVE_VALUE', str(err.exception))
            self.assertTrue(run.call_args.kwargs['close_fds'])
            self.assertEqual(run.call_args.args[0][:2], ['sudo', '-n'])

    def test_check_requires_pid1_and_matching_proc_cgroup_and_cwd(self):
        unit = 'g30-origin-4100-abc.service'
        group = '/system.slice/' + unit
        release = Path('/release')
        for parent, procgroup, cwd, allowed in [
            ('1', group, release, True),
            ('555', group, release, False),
            ('1', '/user.slice/executor', release, False),
            ('1', group, Path('/wrong'), False),
        ]:
            fields = ['S', parent] + ['0'] * 17 + ['99']
            def read(path):
                return '123 (node) ' + ' '.join(fields) if path.name == 'stat' else '0::' + procgroup + '\n'
            with patch.object(m, 'command', return_value=f'MainPID=123\nActiveState=active\nControlGroup={group}'), patch.object(Path, 'read_text', read), patch.object(Path, 'resolve', return_value=cwd):
                if allowed:
                    self.assertEqual(m.check(unit, 123, release)['startTicks'], '99')
                else:
                    with self.assertRaises(ValueError): m.check(unit, 123, release)

    def test_apply_requires_deployment_lock_before_launch(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(m.sys, 'argv', ['helper', '--web', tmp, '--probe', '--apply']), patch.object(m.proxy, 'require_lock', side_effect=ValueError('no lease')), patch.object(m, 'launch') as launch, patch.object(m.sys, 'stderr'):
                self.assertEqual(m.main(), 1)
                launch.assert_not_called()


if __name__ == '__main__': unittest.main()
