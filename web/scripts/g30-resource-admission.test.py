import importlib.util
from pathlib import Path
import unittest
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
if __name__=='__main__':unittest.main()
