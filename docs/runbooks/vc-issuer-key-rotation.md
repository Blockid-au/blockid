# Runbook — VC issuer key rotation

Master Upgrade Plan §5.6 / §11.1. Ed25519 (JWS alg `EdDSA`), PKCS#8 PEM, held
as a file on disk at the path in env `BID_VC_ISSUER_PRIVATE_KEY_PATH`
(default `/data/vault/blockid-vc-issuer/ed25519.pem`, mode `0600`, dir `0700`,
deploy-user-owned). The matching public JWK is derived at runtime and served
at `https://blockid.au/.well-known/did.json` for did:web resolution.

**Never** commit, print, echo, upload, or CLI-argument the private key.
It leaves the host only as a Vault sealed backup.

Two flows below: **routine rotation** (annual, planned) and **compromise
revocation** (immediate). Overlap window: 30 days — matches the JWT TTL of
90 days minus the 60-day reuse window, so every previously-issued credential
can still be verified while it's out in the wild.

## 1. Routine rotation (annual, planned)

Prereq: on-call has `sudo` on the app host and shell as the deploy user
(`dovanlong`). No live incident.

```bash
# 1. Generate the successor key next to the current one. NEVER on your laptop.
umask 0177
KEY_ID_NEXT="issuer-key-$(date -u +%Y%m%d)"
NEW_PATH="/data/vault/blockid-vc-issuer/${KEY_ID_NEXT}.pem"
openssl genpkey -algorithm ed25519 -out "$NEW_PATH"
chmod 0600 "$NEW_PATH"
ls -la "$NEW_PATH"    # -rw------- dovanlong dovanlong

# 2. Export the public JWK for the DID document (safe to print — it is public).
node -e '
  const { createPublicKey, createPrivateKey } = require("crypto");
  const fs = require("fs");
  const priv = createPrivateKey({ key: fs.readFileSync(process.argv[1], "utf8"), format: "pem" });
  const jwk = createPublicKey(priv).export({ format: "jwk" });
  console.log(JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x }, null, 2));
' "$NEW_PATH"
```

Land the successor key in the DID document **before** switching signing:

1. In `web/src/app/.well-known/did.json/route.ts`, add a second entry to
   `verificationMethod[]` with `id = ${DID_ISSUER}#${KEY_ID_NEXT}`, the JWK
   from step 2, and add `${DID_ISSUER}#${KEY_ID_NEXT}` to `assertionMethod`
   and `authentication` (leaving the current `issuer-key-1` in place).
2. Commit, push, `bash scripts/deploy-live.sh` from `web/`. Wait for the 11
   gates to pass. Verify:
   ```bash
   curl -s https://blockid.au/.well-known/did.json | jq '.verificationMethod[].id'
   # both #issuer-key-1 and #<new-id> should appear
   ```
3. Wait at least one CDN TTL (`max-age=3600`, `s-maxage=86400`) so external
   verifiers refresh their cached DID document. **24 hours minimum.**

Then flip the signer to the new key:

4. Update `web/src/lib/vc/issuer-keypair.ts`: set `DID_KEY_ID` to
   `${DID_ISSUER}#${KEY_ID_NEXT}`. Commit, push.
5. Update `web/.env` on the host:
   ```bash
   sudo sed -i "s|^BID_VC_ISSUER_PRIVATE_KEY_PATH=.*|BID_VC_ISSUER_PRIVATE_KEY_PATH=${NEW_PATH}|" /home/dovanlong/blockid.au/web/.env
   ```
6. `bash scripts/deploy-live.sh` — Next standalone re-reads `.env` on boot,
   so the deploy is the restart. Verify a fresh issuance signs under the new
   `kid`:
   ```bash
   curl -s https://blockid.au/api/v1/id/sprocketbay-demo/vc | jq -r .jwt \
     | cut -d. -f1 | base64 -d 2>/dev/null | jq .kid
   ```

Hold the overlap for 30 days — old credentials still verify because the DID
document still lists `issuer-key-1`. After 30 days:

7. Remove the retired verificationMethod entry from `did.json/route.ts`;
   commit, deploy. Then wipe the retired key from disk:
   ```bash
   shred -u /data/vault/blockid-vc-issuer/ed25519.pem   # old file
   ```

## 2. Compromise revocation (immediate)

Trigger: the key file, or any copy of it, is known or suspected to be
outside your control (leaked backup, host breach, an operator ran
`cat ed25519.pem` in a terminal that streams to a SIEM, etc.).

**Do not rotate first — revoke first.** A rotate-first sequence keeps the
compromised key valid for the 30-day overlap; every credential it signed
in that window is a live vector.

```bash
# 1. Immediately revoke every credential signed by the compromised key.
#    vc_issued.revocation_id → revocations row; the /.well-known/revocations
#    feed is authoritative for the RevocationList2020 service in did.json.
sudo docker exec -i supabase-db psql -U postgres -d postgres <<'SQL'
BEGIN;
INSERT INTO revocations (revocation_kind, revoked_ref, revoked_by_user_id, reason)
SELECT 'verifiable_credential', jti, NULL,
       'issuer-key-compromise ' || to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
FROM vc_issued
WHERE revocation_id IS NULL
  AND issued_at >= now() - interval '365 days'
ON CONFLICT (revocation_kind, revoked_ref) DO NOTHING;

UPDATE vc_issued v
SET    revocation_id = r.id
FROM   revocations r
WHERE  r.revocation_kind = 'verifiable_credential'
  AND  r.revoked_ref = v.jti
  AND  v.revocation_id IS NULL;
COMMIT;
SQL
```

2. Generate the successor key exactly as in §1 step 1, then update
   `did.json/route.ts` to include ONLY the new key (do NOT keep the
   compromised key in `verificationMethod`). Update `DID_KEY_ID`. Commit.

3. Update `web/.env` to point at the new file. Deploy.

4. Purge the compromised material:
   ```bash
   shred -u /data/vault/blockid-vc-issuer/ed25519.pem
   ```
   If a backup exists in Vault / GCS / S3, delete every version — a
   "versioned" bucket keeps the compromised bytes reachable otherwise.

5. Post-incident: verify no `vc_issued` row where `issued_at` is under the
   compromised key still has `revocation_id IS NULL`. File the incident in
   `docs/runbooks/secret-leak.md`'s incident log.

## Gotchas

- `loadPrivateKey()` refuses to read a file with any group/other bit set
  (`mode & 0o077 == 0` required). If a `chmod` accident opens the perms,
  the boot fails fast rather than silently exposing the key — treat it as
  a security event, not a config bug.
- The env variable holds the **path**, never the PEM bytes. Anything in
  env leaks via `ps auxe`, `/proc/<pid>/environ`, `docker inspect`, crash
  frames, and heap snapshots. A path avoids all of that. If a future PR
  tries to add `BID_VC_ISSUER_PRIVATE_KEY_PEM=<bytes>` back, reject it.
- The DID document cache is aggressive (`s-maxage=86400`). External
  verifiers may pin the old key for up to 24h after a rotation — the
  overlap window MUST outlast the CDN TTL.
- Anvil anchor rows (`vc_issued.anchor_tx`) are transparency, not proof of
  validity — a revoked credential stays anchored. Do not "un-anchor" on
  rotation.
