# Secret Rotation Log

Owner: CISO. Update this table **every time** a value in `web/.env`,
`web/.env.runtime` or `/opt/supabase/docker/.env` changes, and at every
quarterly Essential Eight review. Companion runbooks:
`secret-leak.md` (what to do when one leaks), `vc-issuer-key-rotation.md`,
`db-restore.md` (which secrets a DB dump does *not* carry).

Sources for the dates below: `~/.blockid-vault/.env.bak-*` snapshots
(2026-09-08 pricing → 2026-09-12 package), `docs/plans/SOURCE-OF-TRUTH.md`
release notes, and the 2026-09-10 public-repo history rewrite. "never rotated"
means the value is unchanged in every snapshot we hold (since at least
2026-09-08) and no rotation is recorded anywhere — treat as **created once,
never rotated**.

Policy (SOC2-lite / ACSC E8 ML2): production write-capable secrets rotate at
least **every 12 months** or immediately on exposure; anything that was ever
public rotates **now**. Never paste a value into this file.

| Secret | Last rotated | Status | Where used | Rotation procedure |
|---|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | never (public in git history for months; stripped from history 2026-09-10) | **REVOKE PENDING (founder)** | `web/src/lib/telegram.ts`, 14 cron routes/scripts, `web/scripts/cron-runner.sh`, `scripts/lib/ops-alert.sh` | BotFather → `/revoke` → new token into `web/.env` + `.env.runtime` → `bash web/scripts/cron-runner.sh agent-guardian` proves alerts still post |
| GitLab PAT (`glpat-…`, old `git.longcare.au` mirror) | never (public in git history; stripped 2026-09-10) | **REVOKE PENDING (founder)** | **still present in plain text in `.git/config` as remote `gitlab-old`** on this host; `.env` no longer references it | GitLab → User settings → Access tokens → revoke; then `git remote remove gitlab-old` |
| `STRIPE_WEBHOOK_SECRET` | **never rotated** | overdue for a scheduled rotation | `web/src/lib/stripe/verify.ts` (signature check on `/api/stripe/webhook`) | Stripe Dashboard → Developers → Webhooks → endpoint → *Roll secret* (24 h overlap) → update `.env` + `.env.runtime` → replay a test event |
| `SUPABASE_SERVICE_ROLE_KEY` (+ `SERVICE_ROLE_KEY` / `ANON_KEY` / `JWT_SECRET` in `/opt/supabase/docker/.env`) | **never rotated** | overdue; rotating = re-minting all three JWTs from a new `JWT_SECRET` + restarting the Supabase stack | `web/src/lib/supabase.ts` (29 call sites — every server-side DB access), storage, cron routes | Generate new `JWT_SECRET`, re-issue anon/service_role JWTs, update both `.env` files, `docker compose up -d` in `/opt/supabase/docker`, `ALTER DATABASE postgres SET "app.settings.jwt_secret"` (see `db-restore.md` §4), redeploy app |
| `STRIPE_SECRET_KEY` (live) | never rotated | 12-month clock unknown — ask Stripe dashboard for key age | `web/src/lib/stripe.ts` + 16 other modules | Stripe → API keys → *Roll key* (with expiry window) → `.env` → redeploy |
| `CRON_SECRET` | **2026-09-09** (after public-history exposure) | ok — `web/scripts/qa/post-deploy-checks.sh` asserts the old value is rejected | 92 files: every `/api/cron/*` route, `cron-runner.sh`, `/api/status` full-payload fallback | `openssl rand -hex 32` → `.env` + `.env.runtime` → redeploy → `crontab -l` runner picks it up from `.env` |
| `IP_HASH_SALT` | 2026-09-09 | ok | `web/src/lib/iphash.ts` | rotate with `CRON_SECRET`; historic hashes become unlinkable (intended) |
| `HISTORY_INGEST_KEY` | 2026-09-09 | ok | `web/src/app/api/history/ingest/route.ts` | as above |
| `WEBHOOK_SECRET_KEY` | **created 2026-09-12** (S20-B outbound webhooks; not in the 05:10 snapshot, present at 06:10 go-live) | ok | `web/src/lib/webhooks/sign.ts` — seals per-endpoint signing secrets at rest | rotation requires re-sealing every `webhook_endpoints.secret` — add a `reseal-webhook-secrets` script before first rotation |
| `OAUTH_TOKEN_ENCRYPTION_KEY` | **created 2026-09-12 ~09:55** (S23-A token sealing) | ok — `/api/status` `oauth_tokens_sealed` must read `ok` | `web/src/lib/oauth-token-seal.ts`, `webhooks/sign.ts` | rotate via `web/scripts/reseal-oauth-tokens.mjs` (old key in `OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS` during migration) |
| `AUDIT_IP_SALT` | created 2026-09-12 (between the 09-11 22:50 and 09-12 05:10 snapshots) | ok | `web/src/lib/audit/redact.ts` | free to rotate; only affects future audit rows |
| `AUDIT_HMAC_SECRET` | never rotated | P0 if leaked (breaks/forges the hash chain) | `web/src/lib/audit.ts`, `web/scripts/verify-audit-chain.ts` | rotation must checkpoint the chain — see `web/src/lib/audit/chain-verify.ts` header before touching |
| `GOOGLE_DRIVE_PRIVATE_KEY` / service account `blockid-drive@longcare-495115` | never rotated (key created with the project) | ok — but the SA cannot upload files to My Drive (no quota); see `db-restore.md` §7 | `web/src/lib/google-drive.ts`, `google-analytics.ts`, GA4 admin/audit, `scripts/db-backup-offsite.mjs` | GCP → IAM → Service accounts → Keys → add key, swap `.env`, delete old key |
| `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN` | **not yet created** — founder runs `scripts/db-backup-offsite-auth.mjs` | pending | `scripts/db-backup-offsite.mjs` auth mode A | revoke at myaccount.google.com/permissions and re-run the helper |
| `GOOGLE_CLIENT_SECRET` / `GITHUB_CLIENT_SECRET` / `LINKEDIN_CLIENT_SECRET` | never rotated | ok | OAuth sign-in + GA4/GitHub/LinkedIn connectors (`web/src/app/api/integrations/*`, `api/oauth/*`) | provider console → new secret → `.env` → redeploy (old secret valid until deleted) |
| `CLOUDFLARE_API_TOKEN` | never rotated | ok (scoped: DNS edit + cache purge) | `web/scripts/purge-cloudflare-cache.sh`, `/usr/local/bin/cloudflare-ddns-update.sh`, `web/src/lib/ai/health-check.ts` | CF → API tokens → roll → update `.env` and the DDNS script config (`secret-leak.md` references a `dns/rotate-cf-token.sh` helper that does not exist yet) |
| `RESEND_API_KEY`, `SMTP_PASS` | never rotated | ok | `web/src/lib/email.ts`, cofounder-match | provider console |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `GOOGLE_GEMINI_API_KEY`, `CEREBRAS_API_KEY`, `DEEPINFRA_API_KEY`, `SAMBANOVA_API_KEY` | never rotated (Claude OAuth refreshed every 30 min by `ai-token-guardian.sh`) | ok — spend-capped at provider | `web/src/lib/ai-client.ts`, `ai-image-client.ts`, `ai/health-check.ts` | provider console; `ai-token-guardian` re-validates on the next tick |
| `AI_GATEWAY_SECRET`, `BILLING_SECRET` | never rotated | ok (internal service-to-service) | `ai-client.ts`, `credits.ts` | rotate both ends together |
| `BLOCKID_DEPLOYER_KEY` (EVM deployer, private Anvil chain 420) | never rotated | low risk — private chain, no real funds | `web/src/lib/evm-deploy.ts` | regenerate + redeploy TokenFactory (`TOKEN_FACTORY_ADDRESS` changes) |
| VC issuer key `/data/vault/blockid-vc-issuer/ed25519.pem` | created 2026-07-31 | ok — annual rotation due **2027-07-31** | `web/src/lib/vc/issuer-keypair.ts`, `/.well-known/did.json` | `vc-issuer-key-rotation.md` |
| `STATUS_FULL_TOKEN` | not set (falls back to `CRON_SECRET`) | set a dedicated token so `/api/status` full payload does not share the cron secret | `web/src/app/api/status/route.ts` | `openssl rand -hex 32` → `.env` |
| `POSTGRES_PASSWORD` (`/opt/supabase/docker/.env`) | never rotated | ok (container-network only) | `supabase-db` superuser login for all Supabase services | `ALTER USER postgres/supabase_admin PASSWORD`, update docker `.env`, `docker compose up -d` |

## Founder action queue (cannot be done from the server)

1. **Telegram bot token** — BotFather `/revoke` → paste new token into
   `web/.env` and `web/.env.runtime` (both are gitignored) → run
   `bash web/scripts/cron-runner.sh agent-guardian` and confirm the message arrives.
2. **GitLab PAT** — revoke in GitLab, then on the server
   `git -C /home/dovanlong/blockid.au remote remove gitlab-old`.
3. **Drive off-site backups** — run `node --env-file=web/.env scripts/db-backup-offsite-auth.mjs`
   once (3 minutes), add the printed `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN` line to
   `web/.env`, then `node --env-file=web/.env scripts/db-backup-offsite.mjs`.
4. Schedule the first **`STRIPE_WEBHOOK_SECRET`** and **Supabase JWT** rotations
   (both "never rotated") in an off-peak window with the CTO — the Supabase one
   needs a stack restart (~1 min API downtime).
5. Off-box **backup monitor**: the only thing watching backups today is this
   server's own cron + Telegram. Add an external heartbeat (e.g. a free
   healthchecks.io / Cronitor check pinged at the end of `scripts/db-backup.sh`)
   so a dead server still raises an alarm — needs an account owned by the founder.

## Change log

| Date | Change | By |
|---|---|---|
| 2026-09-09 | `CRON_SECRET`, `IP_HASH_SALT`, `HISTORY_INGEST_KEY` rotated after public-repo exposure | CTO agent |
| 2026-09-10 | Git history rewritten (3 secrets stripped, 0 gitleaks findings); `.gitleaks.toml` gained a keyword-free Telegram rule | CTO agent |
| 2026-09-12 | `WEBHOOK_SECRET_KEY`, `OAUTH_TOKEN_ENCRYPTION_KEY`, `AUDIT_IP_SALT` created | CTO agent |
| 2026-09-12 | This log created; backup pipeline (QA-3 P0-4) shipped; Drive SA quota limitation found | CISO agent |
