# OAuth connector tokens — sealing at rest (S23-A)

Third-party OAuth credentials (GitHub, LinkedIn, Stripe Connect, Xero, GA4)
are stored AES-256-GCM sealed (`gcm:<iv>:<tag>:<ct>`) under
`OAUTH_TOKEN_ENCRYPTION_KEY`. Without the key the code wrote a base64
`obf:` wrapper (plaintext-equivalent), and the legacy table wrote raw
plaintext. Production had **no key** before S23-A, so every live row is
unsealed until this runbook has been run.

Code: `src/lib/oauth-token-seal.ts` (seal / open / reseal),
`src/lib/oauth-connectors.ts` (v2 vault), `scripts/reseal-oauth-tokens.mjs`
(migration), `src/lib/security/oauth-token-health.ts` (status signal).

## What is covered

| table | columns | writers | readers |
| --- | --- | --- | --- |
| `oauth_connections_v2` | `access_token_encrypted`, `refresh_token_encrypted` | `lib/oauth-connectors.ts saveConnection` ← `/api/integrations/{github,stripe,ga4}/callback` | `getConnection` / `listConnections` ← `/api/integrations/*`, `/api/integrations/[provider]/sync`, workspace evidence + integrations pages |
| `oauth_connections` (legacy, 0027) | `access_token`, `refresh_token` | `/api/oauth/{github,linkedin,stripe,xero,ga4}/callback` | `/api/cron/linkedin-post` (the only token reader; `agent-upgrade` and admin usage read metadata / counts only) |

Not covered on purpose: `webhook_endpoints.secret_enc` (S20-B, own key
`WEBHOOK_SECRET_KEY` with `OAUTH_TOKEN_ENCRYPTION_KEY` fallback — recreate the
endpoint, no reseal), and every `*_token` column that is a random
capability / share / invite token rather than a third-party credential.

## Behaviour matrix

| stored form | no key | key set, `OAUTH_TOKEN_MIGRATION=1` | key set, flag unset |
| --- | --- | --- | --- |
| `gcm:` (current key) | null (cannot open) | opens | opens |
| `gcm:` (previous key) | null | opens via `_PREVIOUS` | opens via `_PREVIOUS` |
| `obf:` / raw | opens (dev) | opens | **refused** → logged once, connector shows `needsReconnect` |
| write (`sealToken`) | dev: `obf:`; **production: throws** `OAuthSealKeyMissingError` (callback 500s) | `gcm:` | `gcm:` |

## Runbook — first seal (production today)

Run every step from `web/` on the production host. Do not paste the key into
chat, tickets or the repo; `.env` is git-ignored and `audit-secrets.mjs` will
flag it anywhere else.

1. **Mint the key** (64 hex chars = raw AES-256 key; a passphrase also works
   but is sha256'd, so prefer hex):
   ```sh
   node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))'
   ```
2. **Set env** in `web/.env` (operator only — never committed):
   ```
   OAUTH_TOKEN_ENCRYPTION_KEY=<64 hex>
   OAUTH_TOKEN_MIGRATION=1
   ```
   `OAUTH_TOKEN_MIGRATION=1` keeps the live GitHub / LinkedIn connectors
   working between the deploy and the reseal (otherwise `obf:`/raw rows are
   refused the moment the key exists).
3. **Deploy** (`scripts/deploy-live.sh`, off-peak per the deploy policy) so
   new connects write `gcm:` and reads accept both during the transition.
   `/api/status` → `oauth_tokens_sealed: "obf_rows_present"`.
4. **Dry-run** the migration and read the per-provider counts:
   ```sh
   node scripts/reseal-oauth-tokens.mjs --dry-run
   ```
   Expect `resealed=N (raw=…/obf=…)` per provider and `written=0`. Any
   `unreadable` row is a `gcm:` payload no configured key opens — leave it;
   that founder reconnects.
5. **Write**:
   ```sh
   node scripts/reseal-oauth-tokens.mjs --write
   ```
   Re-run `--dry-run`: it must now report `resealed=0` (idempotent).
6. **Close the transition**: remove `OAUTH_TOKEN_MIGRATION` from `web/.env`
   (or set it to `0`), then deploy again. From here an `obf:`/raw row is
   refused and surfaces as `needsReconnect` on `/api/integrations`.
7. **Verify**: `curl -s https://blockid.au/api/status | jq .oauth_tokens_sealed`
   → `"ok"` (10-minute server cache; the security-posture cron dimension
   `oauth_tokens_sealed` scores 10 the next morning).

## Runbook — key rotation

1. Mint a new key (step 1 above).
2. In `web/.env`: move the old value to `OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS`,
   put the new one in `OAUTH_TOKEN_ENCRYPTION_KEY`. Deploy — reads try
   current then previous; writes use current.
3. `node scripts/reseal-oauth-tokens.mjs --dry-run` → expect
   `resealed=N (gcm_previous=N)`; then `--write`; then `--dry-run` again →
   `resealed=0`.
4. Remove `OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS`, deploy. The old key is now
   dead — shred it from any password manager entry.

`OAUTH_TOKEN_MIGRATION` is **not** needed for a rotation (nothing is
plaintext-equivalent); keep it unset.

## Signals

- `/api/status` (public) → `oauth_tokens_sealed`: `ok` | `obf_rows_present`
  | `no_key` | `unknown`. Counts only prefixes; never token bytes.
- `POST /api/cron/security-posture` → dimension `oauth_tokens_sealed`
  (0 = no key, 3 = unsealed rows remain, 10 = all `gcm:`).
- Server log `[blockid:oauth-seal] refusing obf|raw …` — once per process
  per form; the fix is this runbook, not silencing the log.
- `/api/integrations` → `needsReconnect: true` per provider whose stored
  token could not be opened; `/api/cron/linkedin-post` skips such users
  with `reason: "token_unreadable"`.

## Failure modes

| symptom | cause | fix |
| --- | --- | --- |
| GitHub / Stripe / Xero connect returns 500 in production | `sealToken` threw `OAuthSealKeyMissingError` — key missing from the running env | set the key, restart the service |
| connector shows "reconnect" right after deploy | key set, `OAUTH_TOKEN_MIGRATION` unset, reseal not yet run | set the flag OR run `--write` |
| `--dry-run` reports `unreadable` | `gcm:` row sealed with a key that is neither current nor previous | founder reconnects; the script never nulls a row |
| `oauth_tokens_sealed: "unknown"` | Supabase unreachable from the app, or a count query failed (see server log) | check DB; the value is cached 10 min |
