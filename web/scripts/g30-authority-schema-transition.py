#!/usr/bin/env python3
"""Exact additive 0447 authority transition. Never applies SQL or changes routing.

prepare pins reviewed SQL and two healthy old origins before application;
observe verifies the exact ledger delta; enroll pins a built healthy candidate.
All mutations require the existing deployment lock. Old artifact manifests are
immutable. This does not authorize financial migrations 0443--0446.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
import time

sys.dont_write_bytecode = True
FILE = '0447_reanalysis_authority.sql'
REVIEWED_SQL_SHA256 = 'a3245226d63da02457b53605dc1d6eb678c9e164442a6da70a259e97d2758e13'
RECORD = 'content/reports/g30-authority-schema-transition.json'
IDENTITY = ('sha', 'port', 'pid', 'startTicks', 'releasePath', 'schemaDigest')


def require(value, reason):
    if not value:
        raise ValueError(reason)


def digest(manifest):
    files = manifest.get('files')
    deferred = manifest.get('deferred', [])
    require(manifest.get('ledger_present') is True, 'manifest ledger unavailable')
    require(isinstance(files, list) and all(isinstance(x, str) for x in files)
            and len(files) == len(set(files)), 'invalid manifest files')
    require(isinstance(deferred, list) and all(isinstance(x, str) for x in deferred), 'invalid deferrals')
    return hashlib.sha256(json.dumps({'files': sorted(files), 'deferred': deferred}, sort_keys=True).encode()).hexdigest()


def identity(entry):
    return {key: entry[key] for key in IDENTITY}


def read(web):
    path = web / RECORD
    require(not path.is_symlink(), 'transition symlink rejected')
    if not path.exists():
        return None
    data = json.loads(path.read_text())
    require(data.get('version') == 1 and data.get('filename') == FILE, 'invalid transition record')
    require(data.get('phase') in ('prepared', 'observed', 'sealed'), 'invalid transition phase')
    return data


def ledger():
    # Read schema metadata only; never read a customer row or print credentials.
    sql = "SELECT coalesce(json_object_agg(filename,checksum),'{}'::json)::text FROM public.schema_migrations;"
    result = subprocess.run(['docker', 'exec', '-i', 'supabase-db', 'psql', '-U', 'postgres',
                             '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'],
                            input=sql, text=True, capture_output=True, timeout=15)
    require(result.returncode == 0, 'ledger read unavailable')
    data = json.loads(result.stdout)
    require(isinstance(data, dict) and bool(data) and all(isinstance(k, str) and
            isinstance(v, str) and re.fullmatch('[a-f0-9]{64}', v) for k, v in data.items()), 'invalid ledger checksums')
    return data


def check_ledger(record, current, applied):
    expected = dict(record['baselineLedger'])
    if applied:
        expected[FILE] = record['sqlSha256']
    require(current == expected, 'unexpected migration ledger delta')


def check_delta(old, new):
    digest(old); digest(new)
    require(FILE not in old['files'], '0447 already in baseline')
    require(set(new['files']) == set(old['files']) | {FILE}, 'not exact 0447 expansion')
    require(new.get('deferred', []) == old.get('deferred', []) and FILE not in new.get('deferred', []), 'deferrals changed')


def manifest(entry):
    return json.loads((Path(entry['releasePath']) / 'content/reports/schema-migrations.json').read_text())


def pin(state, web, entry):
    state.validate_entry(entry, web)
    state.verify_entry(entry, web)
    require(digest(manifest(entry)) == entry['schemaDigest'], 'artifact digest changed')
    return identity(entry)


def prepare(old, recovery, old_manifest, current, sql_sha):
    require(old['port'] != recovery['port'] and old['pid'] != recovery['pid'], 'distinct warm recovery required')
    require(old['schemaDigest'] == recovery['schemaDigest'] == digest(old_manifest), 'baseline digest mismatch')
    require(FILE not in current and FILE not in old_manifest['files'], '0447 already applied or declared')
    require(set(old_manifest['files']) - set(old_manifest.get('deferred', [])) <= set(current), 'baseline ledger incomplete')
    require(sql_sha == REVIEWED_SQL_SHA256, 'exact reviewed SQL hash required')
    new_manifest = {**old_manifest, 'files': sorted(old_manifest['files'] + [FILE])}
    check_delta(old_manifest, new_manifest)
    return {'version': 1, 'filename': FILE, 'phase': 'prepared', 'sqlSha256': sql_sha,
            'baselineLedger': current, 'oldManifest': old_manifest, 'newManifest': new_manifest,
            'oldDigest': digest(old_manifest), 'newDigest': digest(new_manifest),
            'origins': [identity(old), identity(recovery)], 'preparedAt': int(time.time())}


def edge(record, source, target, current):
    require(record is not None and record['phase'] == 'sealed', 'transition not sealed')
    check_delta(record['oldManifest'], record['newManifest'])
    require(record['sqlSha256'] == REVIEWED_SQL_SHA256, 'unreviewed SQL')
    require(record['oldDigest'] == digest(record['oldManifest']) and
            record['newDigest'] == digest(record['newManifest']), 'transition digest mismatch')
    check_ledger(record, current, True)
    require(identity(source) in record['origins'] and identity(target) in record['origins'], 'origin not enrolled')
    require({source['schemaDigest'], target['schemaDigest']} <= {record['oldDigest'], record['newDigest']}, 'unapproved digest')
    return True


def allowed(web, source, target, state):
    try:
        record = read(web)
        edge(record, source, target, ledger())
        pin(state, web, source); pin(state, web, target)
        return True
    except Exception:
        return False


def migration_preflight(web, record, active_sha):
    require(record is not None and record['phase'] in ('observed', 'sealed'), '0447 not observed')
    require(record['sqlSha256'] == REVIEWED_SQL_SHA256, 'unreviewed SQL')
    check_ledger(record, ledger(), True)
    sql = web / 'supabase/migrations' / FILE
    require(sql.is_file() and not sql.is_symlink() and hashlib.sha256(sql.read_bytes()).hexdigest() == record['sqlSha256'], 'reviewed SQL changed')
    changes = subprocess.run(['git', '-C', str(web), 'diff', '--name-status', active_sha, 'HEAD', '--',
                              'supabase/migrations'], capture_output=True, text=True, timeout=10)
    require(changes.returncode == 0, 'migration diff unavailable')
    # With -C web, git paths still include the repo-relative web/ prefix.
    require(changes.stdout.strip() == 'A\tweb/supabase/migrations/' + FILE, 'migration diff is not exact added0447')
    clean = subprocess.run(['git', '-C', str(web), 'diff', '--quiet', 'HEAD', '--',
                            'supabase/migrations', 'content/reports/schema-migrations.json'], timeout=10)
    require(clean.returncode == 0, 'uncommitted migration/manifest changes')
    current = json.loads((web / 'content/reports/schema-migrations.json').read_text())
    require(digest(current) == record['newDigest'], 'source manifest does not include exact expansion')
    require({p.name for p in (web / 'supabase/migrations').glob('*.sql')} == set(current['files']), 'manifest hides SQL files')
    return True


def load_state():
    spec = importlib.util.spec_from_file_location('g30_authority_state', Path(__file__).with_name('g30-serving-state.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--web', type=Path, required=True)
    parser.add_argument('command', choices=('prepare', 'observe', 'enroll', 'preflight'))
    parser.add_argument('--lock-fd', type=int, required=True)
    parser.add_argument('--sql', type=Path)
    parser.add_argument('--expected-sha256')
    parser.add_argument('--recovery-port', type=int)
    parser.add_argument('--candidate-port', type=int)
    parser.add_argument('--candidate-pid', type=int)
    parser.add_argument('--candidate-release', type=Path)
    parser.add_argument('--active-sha')
    args = parser.parse_args(); web = args.web.resolve(strict=True); state = load_state()
    state.proxy.require_lock(args.lock_fd)
    serving = state.read_state(web)
    require(serving and serving['phase'] == 'stable', 'stable serving state required')
    record = read(web)
    if args.command == 'prepare':
        require(record is None, 'transition already exists; explicit recovery required')
        require(args.sql and args.sql.name == FILE and not args.sql.is_symlink(), 'exact reviewed SQL path required')
        require(hashlib.sha256(args.sql.read_bytes()).hexdigest() == args.expected_sha256, 'reviewed SQL hash mismatch')
        require(serving['active']['port'] in serving['verifiedGood'] and serving['active']['port'] not in serving['quarantined'], 'active not verified')
        recovery = next(e for e in serving['retained'] if e['port'] == args.recovery_port)
        require(recovery['port'] in serving['verifiedGood'] and recovery['port'] not in serving['quarantined'], 'recovery not eligible')
        old = pin(state, web, serving['active']); warm = pin(state, web, recovery)
        require(digest(manifest(recovery)) == old['schemaDigest'], 'warm manifest differs')
        record = prepare(old, warm, manifest(old), ledger(), args.expected_sha256)
    elif args.command == 'observe':
        require(record and record['phase'] == 'prepared', 'prepare before applying SQL')
        check_ledger(record, ledger(), True)
        require(identity(serving['active']) in record['origins'], 'active changed during expansion')
        for origin in record['origins']:
            require(origin in [identity(e) for e in serving['retained']] and origin['port'] not in serving['quarantined'], 'baseline origin no longer retained')
            pin(state, web, origin)
        record.update(phase='observed', observedAt=int(time.time()))
    elif args.command == 'enroll':
        require(record and record['phase'] in ('observed', 'sealed'), 'observe exact applied expansion first')
        check_ledger(record, ledger(), True)
        require(identity(serving['active']) in record['origins'], 'active origin outside transition')
        entry = state.make_entry(web, args.candidate_port, args.candidate_pid, args.candidate_release)
        require(entry['schemaDigest'] == record['newDigest'], 'candidate schema outside0447')
        require(entry['port'] not in serving['quarantined'], 'candidate quarantined')
        for origin in record['origins']:
            pin(state, web, origin)
        new = pin(state, web, entry)
        require(not any(e['port'] == new['port'] or e['pid'] == new['pid'] for e in record['origins']), 'duplicate enrollment')
        record['origins'].append(new); record.update(phase='sealed', sealedAt=int(time.time()))
    else:
        require(args.active_sha == serving['active']['sha'], 'active SHA mismatch')
        require(identity(serving['active']) in (record or {}).get('origins', []), 'active outside transition')
        migration_preflight(web, record, args.active_sha)
        print(json.dumps({'ok': True, 'scope': FILE})); return
    state.atomic_json(web / RECORD, record)
    print(json.dumps({'ok': True, 'phase': record['phase'], 'scope': FILE}))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(json.dumps({'ok': False, 'errorKind': type(exc).__name__, 'action': 'refused'}), file=sys.stderr)
        raise SystemExit(1)
