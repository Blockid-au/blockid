import importlib.util
from pathlib import Path
import unittest
import json
import os
import tempfile
from types import SimpleNamespace
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('resource',Path(__file__).with_name('g30-resource-admission.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Admission(unittest.TestCase):
 def setUp(self):
  self.state={'phase':'stable','active':{'pid':1},'retained':[{'pid':i} for i in range(1,6)],'quarantined':[1,2]}
  self.sha='a'*40
  self.policy={'version':1,'enabled':True,'max_live_origins':6,'issued_at':100,'expires_at':200,'candidate_sha':self.sha,'retained_digest':m.retained_digest(self.state)}
  self.sample={'available_bytes':25*m.GIB,'effective_cpus':8,'load5':1,'cpu_psi10':0,'memory_psi10':0,'release_free_bytes':100*m.GIB,'tmp_free_bytes':10*m.GIB}
 def valid(self,**changes):return m.validate(self.policy,self.state,self.sha,{**self.sample,**changes},150,5)
 def test_valid_budget_preserves_legacy_count(self):
  self.assertEqual(self.valid()['max_live_origins'],6);self.assertFalse(self.valid()['legacy_retirement_proven'])
 def test_disabled_expired_wrong_sha_changed_retained_refused(self):
  for patch in ({'enabled':False},{'expires_at':149},{'candidate_sha':'b'*40},{'retained_digest':'0'*64}):
   with self.assertRaises(ValueError):m.validate({**self.policy,**patch},self.state,self.sha,self.sample,150,5)
 def test_seventh_origin_cannot_use_permit(self):
  with self.assertRaises(ValueError):m.validate(self.policy,self.state,self.sha,self.sample,150,6)
 def test_memory_build_reserve_and_pressure_fail_closed(self):
  for patch in ({'available_bytes':23*m.GIB},{'memory_psi10':1},{'cpu_psi10':20},{'load5':5},{'release_free_bytes':15*m.GIB}):
   with self.assertRaises(ValueError):self.valid(**patch)
 def test_post_build_rechecks_candidate_plus_operating_reserve(self):
  sample={**self.sample,'available_bytes':15*m.GIB}
  self.assertEqual(m.validate(self.policy,self.state,self.sha,sample,150,5,'launch')['required_available_bytes'],14*m.GIB)
  with self.assertRaises(ValueError):m.validate(self.policy,self.state,self.sha,{**sample,'available_bytes':13*m.GIB},150,5,'register')
 def test_unit_properties_include_real_memory_cpu_caps(self):
  self.assertIn('--property=MemoryMax=6G',m.unit_properties());self.assertIn('--property=CPUQuota=200%',m.unit_properties())
class PrivatePermit(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.directory=Path(self.tmp.name)/'runtime';self.directory.mkdir(mode=0o700)
  self.file=self.directory/'g30-resource-admission.json';self.file.write_text(json.dumps({'version':1}));self.file.chmod(0o600)
 def tearDown(self):self.tmp.cleanup()
 def test_path_is_account_private_runtime_outside_repo(self):
  with patch.object(m.pwd,'getpwuid',return_value=SimpleNamespace(pw_dir='/fixture/application-owner')):
   self.assertEqual(m.policy_path(Path('/any/repository/web')),Path('/fixture/application-owner/.local/state/blockid-runtime/g30-resource-admission.json'))
 def test_owner_private_regular_file_read(self):
  self.assertEqual(m.read_policy(self.file),{'version':1})
 def test_insecure_file_or_directory_refused(self):
  self.file.chmod(0o644)
  with self.assertRaises(ValueError):m.read_policy(self.file)
  self.file.chmod(0o600);self.directory.chmod(0o755)
  with self.assertRaises(ValueError):m.read_policy(self.file)
 def test_foreign_owner_refused(self):
  with patch.object(m.os,'getuid',return_value=os.getuid()+1):
   with self.assertRaises(ValueError):m.read_policy(self.file)
 def test_symlink_file_or_directory_refused(self):
  alias=self.directory/'alias';alias.symlink_to(self.file)
  with self.assertRaises(OSError):m.read_policy(alias)
  linked=Path(self.tmp.name)/'linked';linked.symlink_to(self.directory,target_is_directory=True)
  with self.assertRaises(OSError):m.read_policy(linked/self.file.name)
 def test_hardlinked_permit_refused(self):
  os.link(self.file,self.directory/'second-link')
  with self.assertRaises(ValueError):m.read_policy(self.file)
if __name__=='__main__':unittest.main()
