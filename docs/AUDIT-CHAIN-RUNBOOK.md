# Audit Chain Integrity Runbook

Owner: CISO (primary), CLO (secondary). On-call: platform on-call rotation.
Severity of a chain break: **P0 — regulatory / legal integrity event.**

Related surface area:
- `web/src/lib/audit.ts` — `appendAudit()` writer, HMAC signer.
- `web/scripts/verify-audit-chain.ts` — nightly + on-demand verifier.
- `web/supabase/migrations/0076_compliance_and_equity.sql` — `audit_events`
  table, `audit_events_hash_chain()` trigger, append-only guard triggers.
- `web/scripts/crontab.production` line 328 — nightly cron at 01:00 UTC.

---

## 1. What the audit chain guards

The `audit_events` table is the **append-only cryptographic ledger** for every
legally-sensitive state change on the platform. It exists to give BlockID.au a
mathematical guarantee that no record listed below was tampered with,
back-dated, or silently deleted after the fact.

Records covered:

| Resource            | Why it must be in the chain                                   |
|---------------------|---------------------------------------------------------------|
| `equity_requests`   | Founder-offered equity intake is a regulated act under the AU  |
|                     | Corporations Act 2001; ASIC and counsel must be able to prove  |
|                     | when a request was submitted, reviewed, and outcome-marked.    |
| `consent_events`    | Privacy Act 1988 (Cth) requires we can produce the exact       |
|                     | disclaimer text and timestamp the user consented to.           |
| Admin actions       | Every service-role write that changes billing state, plan      |
|                     | assignment, or user status is logged with the actor + reason.  |
| Disclaimer registry | Version-bump events are chained so we can prove which          |
|                     | disclaimer body the user saw at any moment in the past.        |

The corresponding rows in `equity_requests`, `consent_events`, and
`disclaimer_registry` may themselves be updated in place under RLS, but every
mutation MUST also emit an `audit_events` row via `appendAudit()`. The chain is
the tamper-evident twin of those tables.

---

## 2. How the chain works

### 2.1 In-database chaining (per row)

Migration `0076_compliance_and_equity.sql` installs the
`audit_events_hash_chain()` `BEFORE INSERT` trigger. On every insert:

1. Read the `curr_hash` of the row with the highest `id` — this becomes
   `new.prev_hash`. For the very first row the value is the empty string `''`.
2. Build a canonical payload string with pipe-delimited fields, in this exact
   order:
   ```
   prev_hash | ts_epoch | user_id | actor | action |
   resource_type | resource_id | detail::text
   ```
   Nulls are coalesced to empty strings and `detail` defaults to `'{}'`.
3. Compute `new.curr_hash = sha256(payload)` and store the hex digest.

Two additional triggers (`audit_events_no_update_trg`,
`audit_events_no_delete_trg`) raise an exception on any `UPDATE` or `DELETE`,
enforcing append-only at the database layer even for the service role.

### 2.2 Application-layer HMAC (per row)

The DB-side hash proves the chain is internally consistent but is computable by
anyone with `SELECT` on the table. To bind each row to the running application
and prevent a database-only attacker from silently rewriting the chain, the
writer in `web/src/lib/audit.ts` also computes:

```
hmac_signature = HMAC-SHA256(AUDIT_HMAC_SECRET, curr_hash_hex)
```

where `AUDIT_HMAC_SECRET` is a >= 16-character secret held only in the app
process's environment. The writer refuses to insert a row if the secret is
absent — legacy pre-secret rows have `hmac_signature IS NULL` and the verifier
tolerates that (see section 3).

> Note: the environment variable is named `AUDIT_HMAC_SECRET`, not
> `AUDIT_HMAC_SALT`. Any earlier reference to `AUDIT_HMAC_SALT` in specs is a
> mislabel; the code (both writer and verifier) reads `AUDIT_HMAC_SECRET`.

### 2.3 Trust boundary

- A **database compromise** can add rows but cannot forge a valid HMAC without
  the app secret — so a downstream verifier will catch tampering.
- An **application compromise** can forge HMACs but cannot rewrite the past DB
  chain without violating the append-only guard and creating chain-break
  evidence (a `prev_hash` mismatch).
- A **joint compromise** (DB + secret + write access) can rewrite silently.
  Mitigation: the weekly PGP attestation (section 6) is stored off-box.

---

## 3. Running the verifier

### 3.1 Nightly (production)

Configured in `web/scripts/crontab.production`:

```
0 1 * * * node /home/dovanlong/blockid.au/web/scripts/verify-audit-chain.ts \
  >> /tmp/blockid-audit-verify.log 2>&1
```

The verifier walks `audit_events ORDER BY id ASC` in batches of 1000 rows and
checks three invariants per row:

1. `prev_hash` equals the previous row's `curr_hash` (or `''` for id = 1).
2. `curr_hash` equals `sha256(canonical_payload)` recomputed from the row.
3. If `hmac_signature IS NOT NULL`, it equals
   `HMAC-SHA256(AUDIT_HMAC_SECRET, curr_hash)`.

Exit codes:
- `0` — chain intact; last log line is
  `OK: verified <N> audit rows; hmac_signature missing on <M>`.
- `1` — chain break; the failing row id + reason are written to stderr.

### 3.2 On-demand (ops)

```
cd /home/dovanlong/blockid.au/web

AUDIT_HMAC_SECRET='...' \
SUPABASE_URL='https://<project>.supabase.co' \
SUPABASE_SERVICE_ROLE_KEY='...' \
  npx tsx scripts/verify-audit-chain.ts
```

Never paste the HMAC secret into a shared terminal; source it from the vault
into the shell (`op read`, `pass`, or the platform's chosen secret manager).

---

## 4. Detecting and responding to a break

### 4.1 What a break looks like

The verifier prints a single `FAIL:` line to stderr and exits 1. Recognise the
three failure classes by prefix:

- Chain continuity break:
  ```
  FAIL: chain break at id=<N>: prev_hash='<x>' expected='<y>'
  ```
- Payload mismatch (row content was altered):
  ```
  FAIL: curr_hash mismatch at id=<N>: db='<x>' recomputed='<y>'
  ```
- HMAC mismatch (row was written without the app's signing key):
  ```
  FAIL: hmac_signature mismatch at id=<N>: db='<x>' expected='<y>'
  ```
- Configuration failure (not a break, but alert-worthy):
  ```
  FAIL: AUDIT_HMAC_SECRET missing or too short (< 16 chars)
  FAIL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required
  ```

The cron wrapper appends `FAIL:` lines to `/tmp/blockid-audit-verify.log`. The
CISO alerting job tails this file and fires on any occurrence of `^FAIL:`.

### 4.2 Immediate response (first 15 minutes)

Treat any of the first three failure classes as a **P0 legal-integrity event**.

1. Page CISO and CLO through the Telegram `#security-critical` channel.
   Escalation policy: if there is no ack within 5 minutes, the alerter falls
   through to SMS the CISO's registered mobile.
2. **Do NOT update, delete, or re-insert any row in `audit_events`.** The
   append-only triggers already forbid this, but the operator MUST NOT attempt
   to work around them, disable the triggers, or drop the table. Any such
   attempt destroys the very evidence needed to explain the break.
3. Snapshot the primary database:
   ```
   pg_dump --format=custom --file=/secure-backup/audit-chain-break-$(date -u +%Y%m%dT%H%M%SZ).dump postgres
   sha256sum /secure-backup/audit-chain-break-*.dump | tee -a /secure-backup/CHECKSUMS.txt
   ```
   Store the dump on the offline vault volume, not on the app server.
4. Freeze new writes to `audit_events` at the app layer by tripping the
   `AUDIT_WRITE_DISABLED` kill-switch (this returns 503 on any new
   `appendAudit()` call). The verifier still runs; the ledger remains readable.
5. Notify legal counsel by email + phone. The message template lives at
   `docs/legal/templates/audit-break-notice.md` and includes:
   - the failing row id
   - the failure class (chain / payload / HMAC)
   - the offline dump SHA-256
   - the time the kill-switch was engaged
6. Open a `SEV-1` incident record in the incident tracker with title
   `audit-chain-break-<id>` and link the dump checksum.

### 4.3 Investigation (next 24 hours)

- Compare the last known-good weekly attestation
  (`content/reports/audit-chain-attestations.jsonl`) against the current chain
  head; the divergence point bounds the compromise window.
- Cross-reference DB WAL and Supabase audit logs against the divergence window
  to identify the mutation actor.
- If HMAC mismatch: rotate `AUDIT_HMAC_SECRET`, invalidate all app tokens, and
  force reissue of service-role keys. Assume the old secret is compromised.
- Do not resume normal writes until counsel signs off and a fresh attestation
  has been published with a "chain restored" note.

---

## 5. Weekly attestation

Run every Monday 08:00 AEST by the CISO (or delegate).

1. Snapshot the last N = 10,000 rows of the chain:
   ```
   psql -c "\\copy (
     select id, ts, prev_hash, curr_hash, hmac_signature
     from audit_events
     order by id desc
     limit 10000
   ) to '/tmp/audit-tail.csv' csv header"
   ```
2. Checksum the snapshot:
   ```
   sha256sum /tmp/audit-tail.csv > /tmp/audit-tail.sha256
   ```
3. Also capture the chain head (the single most-recent `curr_hash`) as the
   compact attestation value:
   ```
   psql -Atc "select id || ':' || curr_hash from audit_events order by id desc limit 1" \
     > /tmp/audit-head.txt
   ```
4. Sign the head with the maintainer PGP key (fingerprint on file with counsel):
   ```
   gpg --detach-sign --armor --output /tmp/audit-head.asc /tmp/audit-head.txt
   ```
5. Append a JSONL record to `web/content/reports/audit-chain-attestations.jsonl`
   with the shape:
   ```
   {"kind":"weekly","ts":"2026-07-20T22:00:00Z","head_id":123456,
    "head_hash":"<hex>","tail_sha256":"<hex>","signer":"<fpr>",
    "signature_ref":"attestations/2026-W29-head.asc"}
   ```
6. Publish the detached signature under `content/reports/attestations/` with a
   filename matching `signature_ref`. Commit and push.

---

## 6. Monthly attestation

On the first business day of each month, run the weekly steps above **plus**:

1. Verify the entire chain end-to-end (not just the tail) with
   `verify-audit-chain.ts`; attach the exit code + `OK:` summary line to the
   JSONL record under key `full_verify`.
2. Countersign the JSONL record with a second maintainer PGP key held by CLO
   (dual-control). Append `countersigner` + `countersignature_ref` fields.
3. Export a PDF summary (row counts by resource, first + last timestamps,
   head hash) and lodge it in the corporate data room under
   `compliance/audit-attestations/<YYYY-MM>.pdf`.
4. Rotate the `AUDIT_HMAC_SECRET` on the next quarterly boundary (Jan / Apr /
   Jul / Oct). Rotation writes a new "hmac_secret_rotated" row into
   `audit_events`; the old secret must be retained in the vault, marked
   `historical`, for retro-verification of pre-rotation rows.

---

## 7. Legal significance

Australian regulators (ASIC, OAIC) and any court hearing an equity dispute or a
Privacy Act complaint may demand proof that a specific record — an
`equity_requests` row, a `consent_events` grant, an admin state change — was
not manufactured or altered after the fact.

The combination of:

- database-level append-only triggers,
- a SHA-256 hash chain over the canonical row payload,
- an application-layer HMAC binding each row to the runtime secret, and
- weekly + monthly PGP attestations published off-box,

lets us produce a chain of custody from any row back to a signed attestation
that predates the dispute. That is the property that turns the `audit_events`
table from an internal log into an evidentiary artefact suitable for regulatory
disclosure and litigation.

If any invariant in this document is silently disabled, the evidentiary value
collapses. Every operator who touches this system is expected to treat the
integrity of the chain as non-negotiable.
