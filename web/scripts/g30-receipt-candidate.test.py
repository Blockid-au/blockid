#!/usr/bin/env python3
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('candidate',Path(__file__).with_name('g30-receipt-candidate.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
class Candidate(unittest.TestCase):
 def setUp(self):
  self.base={'files':['0001_init.sql','0447_reanalysis_authority.sql'],'deferred':[]}
  self.candidate={'files':self.base['files']+list(c.FILES),'total_files':5,'deferred':[],'pending_at_generation':list(c.FILES)}
  self.ledger={x:'a'*64 for x in self.base['files']}
 def validate(self,base=None,candidate=None,sql=None,changed=None,ledger=None):
  return c.validate_manifest(base or self.base,candidate or self.candidate,sql or c.FILES,changed or list(c.FILES),ledger or self.ledger)
 def test_dirty_source_refuses(self):
  with patch.object(c,'git',return_value=' M web/src/changed.ts'),self.assertRaises(ValueError):c.require_clean_source(Path('/isolated/web'))
 def test_canonical_source_and_symlink_output_refused(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);control=root/'web';control.mkdir();common=root/'.git';common.mkdir();source=root/'isolated/web';source.mkdir(parents=True)
   with patch.object(c,'git',return_value=str(common)):
    with self.assertRaises(ValueError):c.roots(control,control)
    (source/'.next').symlink_to(control)
    with self.assertRaises(ValueError):c.roots(source,control)
 def test_changed_fixture_after_preflight_refuses(self):
  with tempfile.TemporaryDirectory() as folder:
   source=Path(folder);fixtures=source/'scripts/db/tests';fixtures.mkdir(parents=True)
   for name in ['credit-operation-receipts.py','credit-checkout-fulfillment.py']:(fixtures/name).write_bytes(b'original')
   with patch.object(c.subprocess,'check_output',return_value=b'original'):
    record={'fixtureSources':c.reviewed_fixture_hashes(source)}
    c.verify_staged_fixtures(record,source)
    (fixtures/'credit-checkout-fulfillment.py').write_bytes(b'changed after preflight')
    with self.assertRaises(ValueError):c.verify_staged_fixtures(record,source)
 def test_exact_baseline_and_three_pending_accepted(self):self.validate()
 def test_changed_sql_refused(self):
  values=dict(c.FILES);values[next(iter(values))]='0'*64
  with self.assertRaises(ValueError):self.validate(sql=values)
 def test_extra_or_missing_migration_refused(self):
  for changed in [list(c.FILES)+['0446_scoped_reanalysis_jobs.sql'],list(c.FILES)[:-1],list(c.FILES)+['nested/0443_credit_operation_receipts.sql']]:
   with self.assertRaises(ValueError):self.validate(changed=changed)
 def test_baseline_without0447_refused(self):
  with self.assertRaises(ValueError):self.validate(base={'files':['0001_init.sql'],'deferred':[]})
 def test_deferred_mutation_refused(self):
  candidate={**self.candidate,'deferred':['0001_init.sql']}
  with self.assertRaises(ValueError):self.validate(candidate=candidate)
 def test_partial_ledger_refused(self):
  with self.assertRaises(ValueError):self.validate(ledger={**self.ledger,next(iter(c.FILES)):'a'*64})
 def test_misleading_pending_count_refused(self):
  with self.assertRaises(ValueError):self.validate(candidate={**self.candidate,'pending_at_generation':[]})
 def test_extra_manifest_file_refused(self):
  with self.assertRaises(ValueError):self.validate(candidate={**self.candidate,'files':self.candidate['files']+['0448.sql'],'total_files':6})
 def test_preflight_refuses_existing_stage_record(self):
  with tempfile.TemporaryDirectory() as folder:
   control=Path(folder);record=c.record_path(control);record.parent.mkdir(parents=True);record.write_text('{}')
   serving={'phase':'stable','active':{'port':4111},'verifiedGood':[4111]}
   with patch.object(c,'require_installed_tooling'),patch.object(c.state,'read_state',return_value=serving),patch.object(c.state,'verify_entry',return_value=serving['active']),self.assertRaises(ValueError):c.preflight(Path('/isolated'),control)
 def test_unsealed_command_plan_refused(self):
  with self.assertRaises(ValueError):c.next_commands({'phase':'preflight'},Path('/source'),Path('/control'))
 def test_commands_are_manual_only(self):
  with patch.object(c,'verify_staged_fixtures'):
   plan=c.next_commands({'phase':'inspected','pausedBaselines':[{'port':4113},{'port':4114}],'candidate':{'port':4112,'pid':123,'releasePath':'/data/releases/private'}},Path('/source/web'),Path('/control/web'))
  self.assertFalse(plan['automaticExecution'])
  self.assertEqual(len([k for k in plan['commands'] if k.startswith('manual_apply_')]),3)
  self.assertNotIn('promote',plan['commands'])
 def test_runtime_flags_capabilities_manifest_and_status_are_required(self):
  manifest={**self.candidate,'ledger_present':True}
  record={'manifest':manifest,'sourceSha':'a'*40}
  observed={'manifest':manifest,'sha':'a'*40,'runtime_digest':'b'*64,'port':4112,'pid':123,'startTicks':'1234','releasePath':'/data/releases/test','schemaDigest':c.expansion.core.manifest_digest(manifest),'capabilities':list(c.expansion.core.CAPS),'creation_enabled':False,'purchases_paused':True,'schema_migrations':'pending:3','http_status':200}
  c.validate_runtime(record,observed)
  for field,value in [('creation_enabled',True),('purchases_paused',False),('capabilities',[]),('runtime_digest',None),('schema_migrations','ok'),('schema_migrations','pending:4'),('http_status',503),('sha','c'*40)]:
   with self.subTest(field=field,value=value),self.assertRaises((ValueError,c.expansion.core.Refused)):
    c.validate_runtime(record,{**observed,field:value})
 def test_promotion_plan_refuses_unsealed_or_changed_candidate(self):
  candidate={'sha':'a'*40,'port':4112,'pid':123,'startTicks':'456','releasePath':'/data/releases/test','schemaDigest':'b'*64}
  record={'phase':'inspected','candidate':candidate};transition={'phase':'sealed','releases':{'candidate':candidate}}
  for bad in [None,{'phase':'prepared'},{'phase':'sealed','releases':{'candidate':{**candidate,'pid':999}}}]:
   with self.assertRaises(ValueError):c.promotion_commands(record,bad,{'port':4111},Path('/source/web'),Path('/control/web'))
  plan=c.promotion_commands(record,transition,{'port':4111},Path('/source/web'),Path('/control/web'))
  self.assertFalse(plan['automaticExecution'])
  self.assertTrue(any('--register' in command for command in plan['commands']))
 def test_precreated_clones_need_retention_pause_and_uptime_not_verified_good(self):
  manifest={**self.base,'ledger_present':True}
  common={'sha':'a'*40,'runtime_digest':'b'*64,'startTicks':'123','releasePath':'/data/releases/baseline','manifest':manifest,'schemaDigest':c.expansion.core.manifest_digest(manifest),'capabilities':list(c.expansion.core.CAPS),'creation_enabled':False,'purchases_paused':True,'process_uptime_seconds':120}
  entries=[{**common,'port':4112,'pid':123},{**common,'port':4113,'pid':124}]
  serving={'active':{**common,'port':4111,'pid':122},'retained':entries,'quarantined':[],'verifiedGood':[4111]}
  with patch.object(c.expansion,'endpoint',side_effect=lambda control,entry:entry):
   self.assertEqual(c.paused_baselines(Path('/control'),serving,[4112,4113],manifest),entries)
   for ports in [[],[4112],[4111,4112],[4112,4112],[4112,4114]]:
    with self.assertRaises(ValueError):c.paused_baselines(Path('/control'),serving,ports,manifest)
   entries[1]['process_uptime_seconds']=119
   with self.assertRaises(ValueError):c.paused_baselines(Path('/control'),serving,[4112,4113],manifest)
 def test_stale_canonical_tooling_refuses(self):
  with patch.object(c,'digest',side_effect=lambda path:'old' if '/control/' in str(path) else 'new'),self.assertRaises(ValueError):
   c.require_installed_tooling(Path('/source'),Path('/control'))
 def test_source_stage_stops_before_promotion_and_preserves_gates(self):
  shell=Path(__file__).with_name('deploy-live.sh').read_text()
  stage_exit=shell.index('echo "Receipt candidate staged privately;')
  for marker in ['g30_state --register','g30_state --begin','g30_proxy_switch "$PROD_PORT" "$TEMP_PORT"','g30_state --activate --listen-port "$TEMP_PORT"']:
   self.assertLess(stage_exit,shell.index(marker,shell.index('# G30 initial admission:')))
  self.assertIn('if [ "$G30_RECEIPT_STAGE" != "1" ] && ! git',shell)
  for marker in ['Exact receipt staging preflight refused','Receipt staging resource admission refused','Independent supervisor lifetime probe failed','Independent candidate runtime freeze failed','Candidate did not survive its launcher']:
   self.assertIn(marker,shell)
  self.assertIn('export G30_CREDIT_RECEIPTS=0 G30_CREDIT_PURCHASES_PAUSED=1',shell)
  self.assertIn('if [ \"$G30_RECEIPT_STAGE\" = \"1\" ]; then BACKUP_DIR=\"$WEB_DIR/.next-receipt-stage-backup\"; fi',shell)
 def test_allocate_blocks_other_deploy_while_stage_exists(self):
  with tempfile.TemporaryDirectory() as folder:
   web=Path(folder);p=c.record_path(web);p.parent.mkdir(parents=True);p.write_text(json.dumps({'phase':'frozen','sourceSha':'a'*40}))
   with self.assertRaises(ValueError):c.state.allocate(None,web)
   with self.assertRaises(ValueError):c.state.allocate(None,web,candidate_sha='a'*40)
if __name__=='__main__':unittest.main(verbosity=2)
