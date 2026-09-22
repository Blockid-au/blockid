import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('bridge',Path(__file__).with_name('blockid-robots-bridge.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class RobotsBridge(unittest.TestCase):
 def test_pinned_body_and_private_demo_boundaries(self):
  body=m.BODY.read_bytes();self.assertEqual(len(m.validate_body(body)),642)
  for changed in [body.replace(b'Allow: /tbr/demo$',b'Allow: /tbr/'),body.replace(b'Disallow: /vi/workspace/\n',b''),body.replace(b'https://blockid.au/sitemap.xml',b'https://startupvalueindex.com/sitemap.xml')]:
   with self.assertRaises(ValueError):m.validate_body(changed)
 def test_actual_config_transform_scopes_single_blockid_exact_route(self):
  original=m.CONFIG.read_text();changed=m.transform(original)
  needle='\nserver {\n    listen 80;\n    listen 443 ssl;\n    server_name staging.blockid.au;'
  self.assertEqual(original[original.index(needle):],changed[changed.index(needle):])
  self.assertEqual(original.split('\nserver {',1)[0],changed.split('\nserver {',1)[0])
  self.assertEqual(changed.count('location = /robots.txt'),1)
  self.assertIn('alias '+str(m.DEST)+';',changed)
  with self.assertRaises(ValueError):m.transform(changed)
  with self.assertRaises(ValueError):m.transform(original.replace('server_name blockid.au www.blockid.au;','server_name unexpected.au;'))
 def test_failed_verification_restores_only_own_config(self):
  live=['before'];writes=[]
  def apply(value):writes.append(value);live[0]=value
  def fail():raise ValueError('delivery failed')
  with self.assertRaises(ValueError):m.transition('before','after',lambda:live[0],apply,fail)
  self.assertEqual(writes,['after','before']);self.assertEqual(live[0],'before')
  def external():live[0]='external';raise ValueError('delivery failed')
  writes.clear()
  with self.assertRaisesRegex(RuntimeError,'external config edit'):m.transition('before','after',lambda:live[0],apply,external)
  self.assertEqual(writes,['after']);self.assertEqual(live[0],'external')
if __name__=='__main__':unittest.main()
