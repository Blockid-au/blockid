#!/usr/bin/env python3
import copy
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import Mock,patch
spec=importlib.util.spec_from_file_location('disposition',Path(__file__).with_name('g30-receipt-disposition.py'));d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
class Disposition(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name);self.control=self.root/'web';self.marker=self.control/'content/reports/g30-receipt-candidate.json';self.marker.parent.mkdir(parents=True)
  self.private=self.root/'private';self.private.mkdir(mode=0o700)
  self.active={'sha':'a'*40,'port':4114,'pid':14,'startTicks':'140','releasePath':'/data/releases/new','schemaDigest':'a'*64};self.warm={**self.active,'port':4113,'pid':13,'startTicks':'130','releasePath':'/data/releases/warm','schemaDigest':'b'*64}
  self.record={'phase':'inspected','candidate':self.active,'sourceSha':'a'*40,'controlWeb':str(self.control)}
  self.raw=json.dumps(self.record).encode();self.marker.write_bytes(self.raw);self.expected=d.sha(self.raw)
  self.serving={'phase':'stable','active':self.active,'previous':self.warm,'retained':[self.active,self.warm],'verifiedGood':[4114,4113],'quarantined':[]}
  self.transition={'phase':'sealed','releases':{'candidate':self.active}}
  self.state=SimpleNamespace(proxy=SimpleNamespace(require_lock=Mock()),validate_entry=Mock(),verify_entry=Mock(),read_state=Mock(side_effect=lambda _:self.serving))
  self.expansion=SimpleNamespace(read=Mock(side_effect=lambda _:self.transition),allowed=Mock(return_value=True))
  self.root_patch=patch.object(d,'archive_root',return_value=self.private);self.root_patch.start();self.addCleanup(self.root_patch.stop)
 def dispose(self,expected=None):return d.dispose(self.control,expected or self.expected,self.state,self.expansion,3)
 def test_success_preserves_exact_archive_and_transition_then_replay(self):
  transition=copy.deepcopy(self.transition);serving=copy.deepcopy(self.serving)
  result=self.dispose();self.assertFalse(self.marker.exists());self.assertEqual(Path(result['archivePath']).read_bytes(),self.raw)
  self.assertEqual(os.stat(result['archivePath']).st_mode&0o777,0o600)
  self.assertEqual(self.transition,transition);self.assertEqual(self.serving,serving)
  self.assertEqual(self.dispose(),result);self.state.proxy.require_lock.assert_called_with(3)
 def test_no_explicit_hash_or_lock_refuses(self):
  for bad in [None,'','a'*40,'Z'*64]:
   with self.assertRaises(ValueError):d.dispose(self.control,bad,self.state,self.expansion,3)
  self.state.proxy.require_lock.side_effect=ValueError('lock absent')
  with self.assertRaises(ValueError):self.dispose()
  self.assertTrue(self.marker.exists())
 def test_changed_stage_and_missing_without_prior_audit_refused(self):
  self.marker.write_bytes(self.raw+b' ')
  with self.assertRaises(ValueError):self.dispose()
  self.marker.unlink()
  with self.assertRaises(ValueError):self.dispose()
 def test_symlink_marker_and_alias_parent_refused(self):
  target=self.root/'other';target.write_bytes(self.raw);self.marker.unlink();self.marker.symlink_to(target)
  with self.assertRaises(ValueError):self.dispose()
  self.assertEqual(target.read_bytes(),self.raw)
 def test_unsealed_or_uninspected_refused(self):
  for phase in ['preflight','frozen','failed']:
   self.record['phase']=phase;self.marker.write_text(json.dumps(self.record));self.expected=d.sha(self.marker.read_bytes())
   with self.assertRaises(ValueError):self.dispose()
  self.record['phase']='inspected';self.marker.write_text(json.dumps(self.record));self.expected=d.sha(self.marker.read_bytes())
  for phase in ['prepared','failed','applying']:
   self.transition['phase']=phase
   with self.assertRaises(ValueError):self.dispose()
 def test_changed_pid_not_good_quarantined_or_no_warm_refused(self):
  original=copy.deepcopy(self.serving)
  variants=[]
  changed=copy.deepcopy(original);changed['active']['pid']=99;variants.append(changed)
  changed=copy.deepcopy(original);changed['verifiedGood']=[4114];variants.append(changed)
  changed=copy.deepcopy(original);changed['verifiedGood']=[4113];variants.append(changed)
  changed=copy.deepcopy(original);changed['quarantined']=[4113];variants.append(changed)
  changed=copy.deepcopy(original);changed['previous']=None;variants.append(changed)
  changed=copy.deepcopy(original);changed['retained']=[changed['active']];variants.append(changed)
  for value in variants:
   self.serving=value
   with self.subTest(value=value),self.assertRaises(ValueError):self.dispose()
  self.assertTrue(self.marker.exists())
 def test_health_failure_and_actual_edge_refusal_preserve_marker(self):
  self.state.verify_entry.side_effect=ValueError('unhealthy')
  with self.assertRaises(ValueError):self.dispose()
  self.state.verify_entry.side_effect=None;self.expansion.allowed.return_value=False
  with self.assertRaises(ValueError):self.dispose()
  self.expansion.allowed.side_effect=[True,False]
  with self.assertRaises(ValueError):self.dispose()
  self.assertTrue(self.marker.exists())
 def test_crash_after_archive_before_unlink_recovers_same_hash(self):
  actual=d.live_proof;calls=0
  def crash(*args):
   nonlocal calls
   calls+=1
   if calls==2:raise RuntimeError('simulated crash before unlink')
   return actual(*args)
  with patch.object(d,'live_proof',side_effect=crash),self.assertRaises(RuntimeError):self.dispose()
  self.assertTrue(self.marker.exists());self.assertEqual((self.private/self.expected/'stage.json').read_bytes(),self.raw)
  self.dispose();self.assertFalse(self.marker.exists())
 def test_crash_after_unlink_before_completion_recovers_with_prior_audit(self):
  original=d.publish_new
  def crash(path,raw):
   if path.name=='completed.json':raise RuntimeError('crash after unlink')
   return original(path,raw)
  with patch.object(d,'publish_new',side_effect=crash),self.assertRaises(RuntimeError):self.dispose()
  self.assertFalse(self.marker.exists());self.assertTrue((self.private/self.expected/'audit.json').exists())
  self.assertEqual(self.dispose()['state'],'disposed')
 def test_stage_changed_after_archive_is_not_removed(self):
  actual=d.live_proof;calls=0
  def changed(*args):
   nonlocal calls
   result=actual(*args);calls+=1
   if calls==2:self.marker.write_bytes(self.raw+b' ')
   return result
  with patch.object(d,'live_proof',side_effect=changed),self.assertRaises(ValueError):self.dispose()
  self.assertEqual(self.marker.read_bytes(),self.raw+b' ')
 def test_recreated_same_bytes_inode_not_removed(self):
  actual=d.live_proof;calls=0
  def changed(*args):
   nonlocal calls
   result=actual(*args);calls+=1
   if calls==2:
    replacement=self.marker.with_name('replacement');replacement.write_bytes(self.raw);replacement.replace(self.marker)
   return result
  with patch.object(d,'live_proof',side_effect=changed),self.assertRaises(ValueError):self.dispose()
  self.assertTrue(self.marker.exists())
 def test_conflicting_private_archive_or_audit_refuses(self):
  folder=d.private_dir(self.private/self.expected)
  d.publish_new(folder/'stage.json',b'wrong')
  with self.assertRaises(ValueError):self.dispose()
  self.assertTrue(self.marker.exists())
 def test_archive_publication_crash_before_audit_recovers(self):
  original=d.publish_new
  def crash(path,raw):
   if path.name=='audit.json':raise RuntimeError('crash after archive publication')
   return original(path,raw)
  with patch.object(d,'publish_new',side_effect=crash),self.assertRaises(RuntimeError):self.dispose()
  self.assertTrue(self.marker.exists());self.assertEqual((self.private/self.expected/'stage.json').stat().st_nlink,1)
  self.dispose();self.assertFalse(self.marker.exists())
 def test_conflicting_completion_cannot_remove_recreated_stage(self):
  result=self.dispose();self.marker.write_bytes(self.raw)
  completed=self.private/self.expected/'completed.json';value=json.loads(completed.read_text());value['state']='unrelated';completed.write_text(json.dumps(value))
  with self.assertRaises(ValueError):self.dispose()
  self.assertTrue(self.marker.exists())
 def test_archive_symlink_is_never_followed(self):
  folder=d.private_dir(self.private/self.expected);target=self.root/'other';target.write_bytes(self.raw);(folder/'stage.json').symlink_to(target)
  with self.assertRaises(OSError):self.dispose()
  self.assertTrue(self.marker.exists());self.assertEqual(target.read_bytes(),self.raw)
if __name__=='__main__':unittest.main(verbosity=2)
