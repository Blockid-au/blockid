#!/usr/bin/env python3
"""G30 source-only additive expansion admission primitive.

No CLI and no IO: the release controller owns locks, atomic persistence, actual
ledger/schema probes, process verification and SQL execution. Callers must pass
fresh results from those probes, not operator booleans. Failure returns no edge;
no code here rewrites artifact manifests or changes normal register semantics.
"""
from copy import deepcopy
import hashlib
import json
import re

FILES = ('0443_credit_operation_receipts.sql','0444_credit_checkout_fulfillment.sql','0445_erasure_credit_purchase_receipts.sql')
CAPS = frozenset({'marked_purchase_receipt_when_creation_off','legacy_pack_guard','pause_before_event_claim','erased_account_no_new_grant','report_final_projection_and_unavailable_valuation_v1'})
class Refused(ValueError): pass

def require(ok, message):
    if not ok: raise Refused(message)

def sha(value, length=64):
    return isinstance(value,str) and re.fullmatch('[a-f0-9]{'+str(length)+'}',value) is not None

def fingerprint(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def manifest_digest(manifest):
    files=manifest.get('files'); deferred=manifest.get('deferred',[])
    require(isinstance(files,list) and len(files)==len(set(files)) and all(isinstance(x,str) for x in files),'invalid manifest')
    require(isinstance(deferred,list) and all(isinstance(x,str) for x in deferred),'invalid deferrals')
    require(manifest.get('ledger_present') is True,'ledger not present')
    # Exactly the existing serving-state algorithm; immutable artifact property.
    return hashlib.sha256(json.dumps({'files':sorted(files),'deferred':deferred},sort_keys=True).encode()).hexdigest()

def pin(release, require_paused=True):
    require(sha(release.get('sha'),40) and sha(release.get('runtime_digest')),'missing immutable release identity')
    require(type(release.get('port')) is int and type(release.get('pid')) is int and isinstance(release.get('startTicks'),str) and release['startTicks'].isdigit(),'missing live process identity')
    require(release['port']>0 and release['pid']>0 and int(release['startTicks'])>0,'invalid process identity')
    require(isinstance(release.get('releasePath'),str) and release['releasePath'].startswith('/'),'immutable release path required')
    require(CAPS.issubset(set(release.get('capabilities',[]))),'unsafe financial reader')
    require(type(release.get('creation_enabled')) is bool and type(release.get('purchases_paused')) is bool,'runtime flags missing')
    if require_paused:
        require(release['creation_enabled'] is False and release['purchases_paused'] is True,'financial writes not paused')
    require(release.get('schemaDigest')==manifest_digest(release['manifest']),'artifact schema digest mismatch')
    return deepcopy(release)

def ledger_valid(ledger):
    require(isinstance(ledger,dict) and all(isinstance(k,str) and sha(v) for k,v in ledger.items()),'invalid exact ledger')

def prepare(state, active, recovery, candidate, migrations, live_ledger, schema_digest, now, probe_id):
    """Called under controller lock after immutable/runtime/writer-drain probes.
    Candidate can already run unregistered/read-only against baseline schema;
    its pending M1 status is NOT admitted by this method.
    """
    require(state.get('phase')=='stable','serving state not stable')
    a,b,c=map(pin,(active,recovery,candidate))
    identity=('sha','port','pid','startTicks','releasePath','schemaDigest')
    require(all(state.get('active',{}).get(k)==a[k] for k in identity),'active identity changed')
    verified=set(state.get('verifiedGood',[])); quarantined=set(state.get('quarantined',[]))
    require(a['port'] in verified and b['port'] in verified and not {a['port'],b['port'],c['port']}&quarantined,'missing good recovery or quarantined endpoint')
    require(len({a['port'],b['port'],c['port']})==3 and len({a['pid'],b['pid'],c['pid']})==3,'endpoints must be distinct live processes')
    retained={tuple(x.get(k) for k in identity) for x in state.get('retained',[])}
    require(tuple(a[k] for k in identity) in retained and tuple(b[k] for k in identity) in retained,'recovery identity not retained')
    require(a['schemaDigest']==b['schemaDigest'],'baseline rollback manifest mismatch')
    require(set(c['manifest']['files'])-set(a['manifest']['files'])==set(FILES) and not set(a['manifest']['files'])-set(c['manifest']['files']),'not exact additive manifest')
    require(a['manifest'].get('deferred',[])==c['manifest'].get('deferred',[]) and not set(FILES)&set(c['manifest'].get('deferred',[])),'waiver mutation or hidden dependency')
    require(set(migrations)==set(FILES) and all(sha(x) for x in migrations.values()),'exact reviewed SQL hashes required')
    ledger_valid(live_ledger)
    require(not set(FILES)&set(live_ledger),'expansion already partially applied: dedicated recovery required')
    require(set(a['manifest']['files'])-set(a['manifest'].get('deferred',[]))<=set(live_ledger),'baseline ledger missing files')
    require(sha(schema_digest) and isinstance(probe_id,str) and probe_id and type(now) is int,'baseline attestation required')
    record={'version':1,'phase':'prepared','prepared_at':now,'last_probe':probe_id,'baseline_ledger':deepcopy(live_ledger),
      'baseline_schema_digest':schema_digest,'migrations':dict(migrations),'applied':[],
      'releases':{'active':a,'recovery':b,'candidate':c},'verified_endpoints':{},'failure':None}
    record['transition_id']=fingerprint({k:v for k,v in record.items() if k!='verified_endpoints'})
    return record

def next_migration(record, live_ledger):
    require(record['phase'] in ('prepared','applying'),'transition not applying')
    _check_ledger(record,live_ledger,record['applied'])
    require(len(record['applied'])<len(FILES),'no remaining migration')
    name=FILES[len(record['applied'])]
    return {'filename':name,'sha256':record['migrations'][name],'transition_id':record['transition_id']}

def _check_ledger(record, ledger, applied):
    ledger_valid(ledger)
    expected={**record['baseline_ledger'],**{x:record['migrations'][x] for x in applied}}
    require(ledger==expected,'live ledger changed, partial or wrong-checksum expansion')

def record_applied(record, name, live_ledger, schema_digest, now, probe_id):
    require(record['phase'] in ('prepared','applying'),'transition not applying')
    require(len(record['applied'])<len(FILES) and name==FILES[len(record['applied'])],'out-of-order migration')
    applied=record['applied']+[name]; _check_ledger(record,live_ledger,applied)
    require(sha(schema_digest) and type(now) is int and now>=record['prepared_at'] and isinstance(probe_id,str) and bool(probe_id) and probe_id!=record['last_probe'],'fresh schema attestation required')
    updated=deepcopy(record); updated.update(applied=applied,phase='expanded' if len(applied)==len(FILES) else 'applying',
      live_schema_digest=schema_digest,last_probe=probe_id,last_observed_at=now)
    return updated

def verify_endpoint(record, role, observed, live_ledger, schema_digest, now, probe_id):
    require(record['phase'] in ('expanded','validating'),'incomplete expansion cannot verify financial rollback')
    _check_ledger(record,live_ledger,list(FILES))
    require(schema_digest==record['live_schema_digest'],'post-expansion schema drift')
    expected=record['releases'].get(role); require(expected is not None,'unapproved endpoint role')
    for key in ('sha','runtime_digest','port','pid','startTicks','releasePath','schemaDigest'):
        require(observed.get(key)==expected[key],'runtime/artifact identity changed: '+key)
    require(observed.get('schema_migrations')=='ok' and observed.get('http_status')==200,'endpoint not healthy after expansion')
    require(observed.get('creation_enabled') is False and observed.get('purchases_paused') is True,'endpoint has financial writes enabled')
    require(CAPS.issubset(set(observed.get('capabilities',[]))),'runtime financial capabilities missing')
    require(sha(observed.get('receipt_fixture_digest')),'missing receipt/replay/erasure fixture evidence digest')
    require(type(now) is int and now>=record['last_observed_at'] and isinstance(probe_id,str) and bool(probe_id) and probe_id!=record['last_probe'],'fresh endpoint attestation required')
    updated=deepcopy(record); updated['phase']='validating'; updated['verified_endpoints'][role]={'at':now,'probe_id':probe_id,'evidence_digest':fingerprint(observed)}
    updated.update(last_probe=probe_id,last_observed_at=now)
    return updated

def seal(record, live_ledger, schema_digest, now):
    require(record['phase']=='validating' and set(record['verified_endpoints'])=={'active','recovery','candidate'},'all pinned endpoints must pass post-expansion checks')
    _check_ledger(record,live_ledger,list(FILES))
    require(schema_digest==record['live_schema_digest'],'schema drift before seal')
    require(type(now) is int and 0<=now-record['last_observed_at']<=60,'stale seal')
    require(all(0<=now-v['at']<=300 for v in record['verified_endpoints'].values()),'endpoint verification stale')
    updated=deepcopy(record);updated.update(phase='sealed',sealed_at=now);return updated

def fail(record, reason):
    updated=deepcopy(record);updated.update(phase='failed',failure=reason,verified_endpoints={});return updated

def edge_allowed(record, source, target, live_ledger, schema_digest, quarantined=()):
    """Narrow edge only; caller STILL invokes existing runtime/status verifier.
    Intended controller admission/rollback predicate; not wired into live CLI.
    """
    try:
        require(record['phase']=='sealed','unsealed/failed transition')
        _check_ledger(record,live_ledger,list(FILES))
        require(schema_digest==record['live_schema_digest'],'schema drift')
        for endpoint in (source,target):
            require(CAPS.issubset(set(endpoint.get('capabilities',[]))),'semantic reader capability missing')
            require(endpoint.get('port') not in quarantined,'quarantined endpoint')
            require(any(all(endpoint.get(k)==r[k] for k in ('sha','runtime_digest','port','pid','startTicks','releasePath','schemaDigest')) for r in list(record['releases'].values())+list(record.get('successors',{}).values())),'unapproved financial endpoint')
        return True
    except (Refused,KeyError,TypeError): return False


def enroll_successor(record, release, live_ledger, schema_digest, allow_purchase_writes=False):
    """Explicit post-expansion admission, including restart with enabled flags.
    Never broadens the schema pair or permits pre-compatible rollback readers.
    """
    require(record['phase']=='sealed','transition not sealed')
    _check_ledger(record,live_ledger,list(FILES))
    require(schema_digest==record['live_schema_digest'],'schema drift')
    candidate=pin(release,require_paused=not allow_purchase_writes)
    require(candidate['schemaDigest']==record['releases']['candidate']['schemaDigest'],'successor must declare full expanded schema')
    require(candidate.get('schema_migrations')=='ok' and candidate.get('http_status')==200 and sha(candidate.get('receipt_fixture_digest')),'successor verification incomplete')
    updated=deepcopy(record);updated.setdefault('successors',{})[candidate['sha']+':'+str(candidate['pid'])]=candidate
    return updated
