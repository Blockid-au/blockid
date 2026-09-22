import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('expansion',Path(__file__).with_name('g30-schema-expansion.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Expansion(unittest.TestCase):
 def setUp(self):
  old={'files':['baseline.sql'],'deferred':[],'ledger_present':True}
  new={**old,'files':old['files']+list(m.FILES)}
  def release(n,manifest):
   return {'sha':str(n)*40,'runtime_digest':str(n)*64,'port':4100+n,'pid':100+n,'startTicks':str(10+n),'releasePath':'/isolated/release'+str(n),
    'manifest':manifest,'schemaDigest':m.manifest_digest(manifest),'capabilities':list(m.CAPS),'creation_enabled':False,'purchases_paused':True}
  self.a,self.b,self.c=release(1,old),release(2,old),release(3,new)
  self.ledger={'baseline.sql':'b'*64};self.hashes={x:'c'*64 for x in m.FILES}
  state={'phase':'stable','active':self.a,'retained':[self.a,self.b],'verifiedGood':[4101,4102],'quarantined':[]}
  self.record=m.prepare(state,self.a,self.b,self.c,self.hashes,self.ledger,'d'*64,100,'baseline-probe')
 def expand(self):
  r=self.record;ledger=dict(self.ledger)
  for i,name in enumerate(m.FILES):
   self.assertEqual(m.next_migration(r,ledger)['filename'],name)
   ledger[name]=self.hashes[name]
   r=m.record_applied(r,name,ledger,'e'*64,101+i,'migration-'+str(i))
  return r,ledger
 def sealed(self):
  r,ledger=self.expand()
  for i,(role,release) in enumerate(zip(('active','recovery','candidate'),(self.a,self.b,self.c))):
   observed={**release,'schema_migrations':'ok','http_status':200,'receipt_fixture_digest':'f'*64}
   r=m.verify_endpoint(r,role,observed,ledger,'e'*64,110+i,'endpoint-'+role)
  return m.seal(r,ledger,'e'*64,115),ledger
 def test_partial_and_failed_transitions_never_admit_or_rollback(self):
  ledger={**self.ledger,m.FILES[0]:self.hashes[m.FILES[0]]}
  r=m.record_applied(self.record,m.FILES[0],ledger,'e'*64,101,'first')
  self.assertFalse(m.edge_allowed(r,self.a,self.b,ledger,'e'*64))
  self.assertFalse(m.edge_allowed(m.fail(r,'SQL failure'),self.a,self.c,ledger,'e'*64))
  with self.assertRaises(m.Refused):m.next_migration(m.fail(r,'failure'),ledger)
 def test_wrong_checksum_or_unplanned_migration_stops_progress(self):
  wrong={**self.ledger,m.FILES[0]:'0'*64}
  with self.assertRaises(m.Refused):m.record_applied(self.record,m.FILES[0],wrong,'e'*64,101,'new')
  with self.assertRaises(m.Refused):m.next_migration(self.record,{**self.ledger,'unplanned.sql':'0'*64})
 def test_unverified_old_reader_and_restarted_pid_cannot_be_rollback(self):
  r,ledger=self.sealed()
  self.assertTrue(m.edge_allowed(r,self.c,self.b,ledger,'e'*64))
  for bad in ({**self.b,'sha':'0'*40},{**self.b,'pid':9999},{**self.b,'schemaDigest':'0'*64}):
   self.assertFalse(m.edge_allowed(r,self.c,bad,ledger,'e'*64))
  self.assertFalse(m.edge_allowed(r,self.c,self.b,ledger,'e'*64,[self.b['port']]))
 def test_no_seal_until_recovery_endpoint_verified(self):
  r,ledger=self.expand()
  observed={**self.c,'schema_migrations':'ok','http_status':200,'receipt_fixture_digest':'f'*64}
  r=m.verify_endpoint(r,'candidate',observed,ledger,'e'*64,110,'candidate')
  with self.assertRaises(m.Refused):m.seal(r,ledger,'e'*64,115)
 def test_schema_drift_invalidates_even_sealed_edge(self):
  r,ledger=self.sealed()
  self.assertFalse(m.edge_allowed(r,self.c,self.a,ledger,'0'*64))
  self.assertFalse(m.edge_allowed(r,self.c,self.a,{**ledger,'rogue.sql':'a'*64},'e'*64))
 def test_same_schema_without_current_report_reader_is_not_admitted(self):
  r,ledger=self.sealed()
  successor={**self.c,'pid':555,'startTicks':'555','port':4110,'schema_migrations':'ok','http_status':200,'receipt_fixture_digest':'f'*64,
    'capabilities':[x for x in m.CAPS if x!='report_final_projection_and_unavailable_valuation_v1']}
  with self.assertRaises(m.Refused):m.enroll_successor(r,successor,ledger,'e'*64)
 def test_enabled_restart_requires_explicit_successor_admission(self):
  r,ledger=self.sealed()
  successor={**self.c,'pid':555,'startTicks':'555','port':4110,'creation_enabled':True,'purchases_paused':False,
   'schema_migrations':'ok','http_status':200,'receipt_fixture_digest':'f'*64}
  self.assertFalse(m.edge_allowed(r,self.c,successor,ledger,'e'*64))
  with self.assertRaises(m.Refused):m.enroll_successor(r,successor,ledger,'e'*64)
  admitted=m.enroll_successor(r,successor,ledger,'e'*64,True)
  self.assertTrue(m.edge_allowed(admitted,self.c,successor,ledger,'e'*64))
  with self.assertRaises(m.Refused):m.enroll_successor(r,{**successor,'schemaDigest':self.a['schemaDigest']},ledger,'e'*64,True)
if __name__=='__main__':unittest.main()
