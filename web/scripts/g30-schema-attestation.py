#!/usr/bin/env python3
"""Read-only local schema fingerprint. Never print DDL, ledger rows or stderr.

Does not approve compatibility or start/restore any service. Uses one exported
read-only DB snapshot for schema-only pg_dump and migration ledger checksums.
"""
import argparse
import hashlib
import json
import os
import re
import selectors
import subprocess
import sys
import time


def normalize_dump(raw):
    # Strip ONLY pg_dump's outer session framing. Never strip comments/whitespace
    # inside functions, SQL literals or COMMENT statements (they are evidence).
    lines = raw.splitlines(keepends=True)
    first_sql = next((i for i, line in enumerate(lines)
                      if line.strip() and not line.startswith('--') and not line.startswith('\\restrict ')), len(lines))
    last_sql = next((i for i in range(len(lines)-1, -1, -1)
                     if lines[i].strip() and not lines[i].startswith('--') and not lines[i].startswith('\\unrestrict ')), -1)
    out = []
    for i, line in enumerate(lines):
        outer = i < first_sql or i > last_sql
        if outer and (re.fullmatch(r'\\(?:un)?restrict [A-Za-z0-9]+\n?', line)
                      or re.fullmatch(r'-- (?:Started|Completed) on .*\n?', line)):
            continue
        out.append(line)
    return ''.join(out)


def fingerprint(raw, ledger):
    if not raw or 'CREATE ' not in raw:
        raise ValueError('Missing schema dump')
    if not isinstance(ledger, list) or not ledger:
        raise ValueError('Missing migration checksum ledger')
    rows = []
    for row in ledger:
        if not isinstance(row, dict) or set(row) != {'filename', 'checksum'}:
            raise ValueError('Invalid ledger shape')
        name, checksum = row['filename'], row['checksum']
        if not isinstance(name, str) or not name.endswith('.sql') or not isinstance(checksum, str) or not re.fullmatch('[a-f0-9]{64}', checksum):
            raise ValueError('Incomplete migration checksum evidence')
        rows.append((name, checksum))
    if len({r[0] for r in rows}) != len(rows):
        raise ValueError('Duplicate migration filename')
    ddl = hashlib.sha256(normalize_dump(raw).encode()).hexdigest()
    led = hashlib.sha256(json.dumps(sorted(rows), separators=(',', ':')).encode()).hexdigest()
    digest = hashlib.sha256(json.dumps({'version': 1, 'ddl': ddl, 'ledger': led}, sort_keys=True).encode()).hexdigest()
    return {'version': 1, 'status': 'observed', 'schemaSha256': ddl,
            'ledgerSha256': led, 'digest': digest, 'ledgerCount': len(rows)}


class ByteLines:
    """Bounded nonblocking pipe reader; partial lines never enter readline()."""
    def __init__(self, stream):
        self.fd = stream.fileno()
        os.set_blocking(self.fd, False)
        self.pending = bytearray()

    def line(self, timeout=20, max_bytes=4 * 1024 * 1024):
        deadline = time.monotonic() + timeout
        with selectors.DefaultSelector() as selector:
            selector.register(self.fd, selectors.EVENT_READ)
            while True:
                newline = self.pending.find(b'\n')
                if newline >= 0:
                    if newline > max_bytes:
                        raise ValueError('Read-only response too large')
                    value = bytes(self.pending[:newline])
                    del self.pending[:newline + 1]
                    return value.decode('utf-8').strip()
                if len(self.pending) > max_bytes:
                    raise ValueError('Read-only response too large')
                remaining = deadline - time.monotonic()
                if remaining <= 0 or not selector.select(remaining):
                    raise ValueError('Read-only snapshot timed out')
                try:
                    chunk = os.read(self.fd, 65536)
                except BlockingIOError:
                    continue
                if not chunk:
                    raise ValueError('Read-only snapshot ended before complete line')
                self.pending.extend(chunk)


# All values are operational limits, not credentials. The in-container timeout
# survives loss of the host docker client. PostgreSQL limits independently bound
# psql statements/locks and abandoned transactions. pg_dump resets its own
# statement_timeout; its wall-clock bound is the in-container timeout, plus
# --lock-wait-timeout. It also resets idle-in-transaction timeout. Periodic
# connection checks help the server notice its dead client, but are not a
# hard deadline for uninterruptible backend work. Do not claim PGOPTIONS
# alone bounds every pg_dump query.
PG_LIMITS = ('-c statement_timeout=20000 -c lock_timeout=5000 '
             '-c idle_in_transaction_session_timeout=120000 '
             '-c idle_session_timeout=120000 -c client_connection_check_interval=1000 '
             '-c default_transaction_read_only=on')


def observe(container='supabase-db', include_ledger=False):
    # No shell interpolation, application tables, credentials or external hosts.
    base = ['docker', 'exec', '-i', '-e', 'PGOPTIONS=' + PG_LIMITS, container]
    p = subprocess.Popen(base + ['timeout', '--signal=TERM', '--kill-after=5s', '150s', 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'],
                         stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    try:
        reader = ByteLines(p.stdout)
        p.stdin.write(b'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT pg_export_snapshot();\n'); p.stdin.flush()
        snapshot = reader.line()
        if not re.fullmatch('[0-9A-Fa-f-]+', snapshot):
            raise ValueError('Invalid exported snapshot')
        result = subprocess.run(base + ['timeout', '--signal=TERM', '--kill-after=5s', '85s', 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema-only', '--lock-wait-timeout=5000', '--snapshot=' + snapshot],
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, timeout=90)
        if result.returncode:
            raise ValueError('Schema-only read failed')
        p.stdin.write(b"SELECT COALESCE(jsonb_agg(x ORDER BY filename), '[]'::jsonb) FROM (SELECT filename, checksum FROM public.schema_migrations) x;\n"); p.stdin.flush()
        ledger = json.loads(reader.line())
        evidence = fingerprint(result.stdout, ledger)
        p.stdin.write(b'ROLLBACK;\n\\q\n'); p.stdin.flush()
        if p.wait(timeout=10):
            raise ValueError('Read-only transaction did not close successfully')
        if include_ledger: evidence["ledger"] = {row["filename"]: row["checksum"] for row in ledger}
        return evidence
    finally:
        # Best effort local-client cleanup only, never DB/service termination.
        # In-container wall-clock and PostgreSQL session limits remain in force
        # even if killing docker exec does not kill its remote command.
        if p.poll() is None:
            p.terminate()
            try: p.wait(timeout=5)
            except subprocess.TimeoutExpired: p.kill(); p.wait(timeout=5)
        for stream in (p.stdin, p.stdout):
            if stream: stream.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--read-local', action='store_true', help='Perform bounded read-only local schema capture')
    args = parser.parse_args()
    if not args.read_local:
        print(json.dumps({'status': 'plan', 'mutations': False, 'requires': 'explicit --read-local; no compatibility approval'})); return 0
    try:
        print(json.dumps(observe())); return 0
    except Exception as exc:
        print(json.dumps({'status': 'unavailable', 'errorKind': type(exc).__name__, 'compatible': False})); return 1

if __name__ == '__main__': sys.exit(main())
