import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('controller',Path(__file__).with_name('g30-schema-expansion-controller.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
class Controller(unittest.TestCase):
 def test_missing_inherited_lock_refuses_before_database_or_state_write(self):
  with tempfile.TemporaryDirectory() as root, patch.object(c.state.proxy,'require_lock',side_effect=ValueError('missing lock')), patch.object(c,'current_database') as db, patch.object(c.state,'atomic_json') as save:
   with self.assertRaises(ValueError):c.main(['--web',root,'next','--lock-fd','200','--cron-lock-fd','201'])
   db.assert_not_called();save.assert_not_called()
 def test_isolated_control_rejects_noncanonical_root_before_database(self):
  with tempfile.TemporaryDirectory() as root:
   source=Path(root)/'source';control=Path(root)/'wrong';common=Path(root)/'.git'
   source.mkdir();control.mkdir();common.mkdir()
   with patch.object(c.subprocess,'check_output',return_value=str(common)),patch.object(c,'current_database') as db:
    with self.assertRaises(ValueError):c.main(['--web',str(source),'--control-web',str(control),'next','--lock-fd','200','--cron-lock-fd','201'])
    db.assert_not_called()
 def test_failed_or_partial_record_refuses_before_probe(self):
  for phase in ('prepared','applying','failed'):
   with patch.object(c,'read',return_value={'phase':phase}),patch.object(c,'current_database') as db:
    self.assertFalse(c.allowed(Path('/unused'),{}, {},{}));db.assert_not_called()
 def test_normal_controller_equality_unchanged_without_transition(self):
  with tempfile.TemporaryDirectory() as root:
   self.assertTrue(c.state.schema_compatible(Path(root), {'schemaDigest':'a'},{'schemaDigest':'a'}))
   self.assertFalse(c.state.schema_compatible(Path(root), {'schemaDigest':'a'},{'schemaDigest':'b'}))
 def test_corrupt_transition_never_falls_back_to_equal_digest(self):
  with tempfile.TemporaryDirectory() as root:
   p=c.path(Path(root));p.parent.mkdir(parents=True);p.write_text('{')
   self.assertFalse(c.state.schema_compatible(Path(root), {'schemaDigest':'a'},{'schemaDigest':'a'}))
 def test_prepared_financial_state_overrides_equal_digest_and_authority_record(self):
  with tempfile.TemporaryDirectory() as root:
   web=Path(root);p=c.path(web);p.parent.mkdir(parents=True)
   p.write_text(json.dumps({'phase':'prepared'}))
   (p.parent/'g30-authority-schema-transition.json').write_text(json.dumps({'phase':'sealed'}))
   with patch.object(c.state,'read_state',return_value={'quarantined':[]}):
    self.assertFalse(c.state.schema_compatible(web,{'schemaDigest':'a'},{'schemaDigest':'a'}))
 def test_staging_status_allowlist_rejects_unrelated_pending_schema(self):
  with self.assertRaisesRegex(ValueError,'Unsupported staging'):
   c.state.verify_entry({},None,'pending:7')
 def test_state_symlink_rejected(self):
  with tempfile.TemporaryDirectory() as root:
   p=c.path(Path(root));p.parent.mkdir(parents=True);target=Path(root)/'outside';target.write_text('{}');p.symlink_to(target)
   with self.assertRaises(ValueError):c.read(Path(root))
if __name__=='__main__':unittest.main()
