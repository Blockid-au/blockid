# Postgres Restore Runbook

Owner: CTO (primary), CISO (secondary). Severity: **P0** — production data loss or
corruption. Applies to the self-hosted Supabase Postgres in docker container
`supabase-db` (supabase/postgres 15.8, database `postgres`) that serves blockid.au.

Shipped in release QA-3 P0-4 (2026-09-12). Pipeline:

| Step | Script | Schedule (UTC) | Output |
|---|---|---|---|
| Dump | `scripts/db-backup.sh` | daily 02:20 | `/data/backups/db-<ts>.dump.gz` + `.sha256`; Sundays hard-linked to `/data/backups/weekly/` |
| Off-site | `scripts/db-backup-offsite.mjs` | daily 02:40 | Google Drive `BlockID Evidence Vault/blockid-db-backups/` (30-day retention) |
| Drill | `scripts/db-restore-test.sh` | Sun 03:00 | scratch DB `blockid_restore_test`, row-count sanity, dropped |
| Signal | `/api/status` → `backups` | live | `ok` (dump < 26 h and drill < 8 d) / `stale` / `missing` |

Every run appends one JSON line to `web/content/reports/backup-health.jsonl`
(`job: db-backup | offsite | restore_test`) and a `cron-health.jsonl` row, and
posts to Telegram on failure (`scripts/lib/ops-alert.sh`, token from `web/.env`).
Retention: 14 daily + 8 weekly on `/data` (295 GB volume), 30 days in Drive.

Measured on 2026-09-12: DB 85 MB on disk → dump **16.9 MB** in **4.4 s**;
full restore of that dump into a fresh DB in the same cluster **12 s**.
Expect roughly linear scaling; a 1 GB database is still a sub-10-minute restore.

---

## 0. Decide what you are restoring

| Situation | Do |
|---|---|
| A table / rows were deleted or corrupted, rest of DB is fine | **§3 partial restore** — restore the backup into a scratch DB and copy the rows back. Never overwrite prod for a single-table problem. |
| Whole database is unusable (bad migration, disk corruption, ransomware) | **§4 full restore** into a *new* database, then swap. |
| Container/volume is gone (host rebuild) | **§5 cold start** — bring up Supabase from `/opt/supabase/docker`, then §4. |

Before anything else:

```bash
# 1. Freeze writes: stop the app + crons so nothing mutates during the restore.
crontab -r                                   # re-install later: crontab web/scripts/crontab.production
pkill -f 'node .*server.js'                  # watchdog (*/2 min cron) is off, so it stays down
# 2. Take an emergency dump of the CURRENT state, even if broken — you may need rows from it.
FORCE_WEEKLY=1 /home/dovanlong/blockid.au/scripts/db-backup.sh || docker exec supabase-db pg_dump -U postgres -Fc postgres | gzip > /data/backups/pre-restore-$(date -u +%Y%m%dT%H%M%SZ).dump.gz
```

Declare the incident in Telegram (S1) and start the `docs/runbooks/privacy-act-72h-clock.md`
clock if the cause could be a breach.

## 1. Pick and verify the backup

```bash
ls -lt /data/backups/*.dump.gz /data/backups/weekly/*.dump.gz | head
F=/data/backups/db-20260912T112631Z.dump.gz          # newest good one
(cd "$(dirname "$F")" && sha256sum -c "$(basename "$F").sha256")   # must print OK
gunzip -c "$F" | docker exec -i supabase-db pg_restore -l | head   # TOC readable
```

No local copy? Pull from Drive (`blockid-db-backups/`, file name is the same) and
verify the sidecar the same way. The `backup-health.jsonl` row for the dump
carries `sha256` and `drive_file_id`.

## 2. Roles, RLS and what a dump does / does not contain

* The dump is `pg_dump -Fc --no-owner --no-privileges` of database `postgres`
  taken as role `postgres`. It contains **all schemas** (`public`, `auth`,
  `storage`, `vault`, `realtime`, `extensions`, `graphql*`, `net`,
  `supabase_functions`), all data, all **RLS policies**, functions, triggers
  and grants-as-DDL for objects — but **not**:
  * cluster **roles** and their passwords (`anon`, `authenticated`,
    `service_role`, `supabase_admin`, `supabase_auth_admin`, …). They live in
    the cluster, not the database. Same-cluster restores keep them; a cold start
    recreates them from `/opt/supabase/docker` init scripts (§5).
  * `ALTER DATABASE … SET` parameters. On this cluster the `postgres` DB carries
    `app.settings.jwt_secret` and `app.settings.jwt_exp` (GoTrue/PostgREST JWT
    verification) — re-apply them after a full restore (§4). `ALTER ROLE … SET`
    values (`search_path`, `statement_timeout`, …) are cluster-level and survive
    a same-cluster restore. Check with `\drds`.
  * Storage **objects' bytes** (`supabase-storage` volume) — only their metadata.
  * The JWT secret / `app.settings.*` GUCs (come from `/opt/supabase/docker/.env`).
* `--no-owner` means every object is owned by the restoring role. **Restore as
  `supabase_admin`** (SUPERUSER, owner of Supabase-managed tables). Restoring as
  `postgres` (not a superuser here) works but logs two errors
  (`vault.secrets` COPY, `SET log_min_messages`) and leaves `supabase_admin`-
  owned tables owned by `postgres`, which later breaks migrations
  (`must be owner`).
* Because RLS policies are restored with the tables, **RLS is enforced exactly
  as before** once the roles exist. Verify in §6.
* `vault.secrets` rows are encrypted with the cluster's vault key; a same-host
  restore reads them fine. A different host cannot decrypt them — re-create
  the secrets (they are only used by pg_net/webhook helpers).

## 3. Partial restore (rows / one table)

```bash
S=blockid_restore_scratch
docker exec supabase-db psql -U postgres -c "CREATE DATABASE $S;"
gunzip -c "$F" | docker exec -i supabase-db pg_restore -U supabase_admin -d "$S" --no-owner --no-privileges --no-comments
# Copy what you need back with a dblink/COPY round-trip, e.g. one table:
docker exec supabase-db psql -U supabase_admin -d "$S" -c "\copy (SELECT * FROM public.projects WHERE id IN ('…')) TO '/tmp/rows.csv' CSV HEADER"
docker exec supabase-db psql -U supabase_admin -d postgres -c "\copy public.projects FROM '/tmp/rows.csv' CSV HEADER"
docker exec supabase-db psql -U postgres -c "DROP DATABASE $S WITH (FORCE);"
```

Or restore a single table's schema+data straight into prod (only when the table
is empty/dropped): add `-t public.projects` to `pg_restore` and target `-d postgres`.

## 4. Full restore (same cluster)

Restore into a **new** database and swap names — never `--clean` on the live
`postgres` DB with clients attached.

```bash
NEW=blockid_restore_$(date -u +%Y%m%dT%H%M)
docker exec supabase-db psql -U postgres -c "CREATE DATABASE $NEW;"

# ~12 s for a 17 MB dump. -j 4 parallel jobs are safe on the 8-core box.
gunzip -c "$F" > /tmp/restore.dump
docker cp /tmp/restore.dump supabase-db:/tmp/restore.dump
docker exec supabase-db pg_restore -U supabase_admin -d "$NEW" \
    --no-owner --no-privileges --no-comments -j 4 /tmp/restore.dump
# Exit 0 expected as supabase_admin. Any "error:" lines → stop and read them.
docker exec supabase-db rm /tmp/restore.dump; rm /tmp/restore.dump

# Sanity BEFORE swapping (compare with the numbers in backup-health.jsonl restore_test rows)
docker exec supabase-db psql -U postgres -d "$NEW" -Atc \
  "SELECT 'app_users',count(*) FROM public.app_users UNION ALL SELECT 'projects',count(*) FROM public.projects UNION ALL SELECT 'plans',count(*) FROM public.plans;"

# Swap: kick every session, rename live → _broken, new → postgres.
docker exec supabase-db psql -U supabase_admin -d template1 <<'SQL'
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='postgres' AND pid<>pg_backend_pid();
ALTER DATABASE postgres RENAME TO postgres_broken_$(date +%Y%m%d);
ALTER DATABASE "$NEW" RENAME TO postgres;
SQL
# Restore DB-level settings the dump does not carry (values from /opt/supabase/docker/.env):
JWT=$(grep ^JWT_SECRET= /opt/supabase/docker/.env | cut -d= -f2-)
docker exec supabase-db psql -U supabase_admin -d postgres \
  -c "ALTER DATABASE postgres SET \"app.settings.jwt_secret\" TO '$JWT';" \
  -c "ALTER DATABASE postgres SET \"app.settings.jwt_exp\" TO '3600';"
docker exec supabase-db psql -U postgres -Atc "\drds postgres"   # both rows present
```

Then restart the Supabase services that cache connections/schema and reload PostgREST:

```bash
cd /opt/supabase/docker && docker compose restart rest auth storage realtime pooler
docker exec supabase-db psql -U postgres -d postgres -c "NOTIFY pgrst, 'reload schema';"
docker exec supabase-db psql -U postgres -d postgres -c "NOTIFY pgrst, 'reload config';"
```

Bring the app and crons back:

```bash
bash /home/dovanlong/blockid.au/web/scripts/watchdog.sh     # restarts the current release from web/current
crontab /home/dovanlong/blockid.au/web/scripts/crontab.production && crontab -l | grep -c db-backup   # 1
```

Keep `postgres_broken_*` for 7 days, then `DROP DATABASE … WITH (FORCE)`.

## 5. Cold start (new host / lost volume)

1. `cd /opt/supabase/docker && docker compose up -d db` — the init scripts
   recreate all roles (`anon`, `authenticated`, `service_role`, `supabase_admin`, …)
   with the passwords from `/opt/supabase/docker/.env` (`POSTGRES_PASSWORD`).
   Keep that `.env` in the same vault as `web/.env` (`~/.blockid-vault/`).
2. Wait for `docker exec supabase-db pg_isready`. Then §4 with `NEW=postgres`
   directly (the fresh `postgres` DB is empty — restore into it, skip the rename).
3. `docker compose up -d` for the rest; restore the storage volume from its own
   backup (out of scope here — evidence files also live in Drive per data room).
4. Re-apply the DB-level GUCs (`app.settings.jwt_secret`, `app.settings.jwt_exp`)
   and reload PostgREST as in §4.

## 6. Verify (all must pass before closing the incident)

```bash
# PostgREST sees the schema and RLS still bites:
SRK=$(grep ^SUPABASE_SERVICE_ROLE_KEY= /home/dovanlong/blockid.au/web/.env | cut -d= -f2-)
ANON=$(grep ^ANON_KEY= /opt/supabase/docker/.env | cut -d= -f2-)   # the app itself is service-role only
curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: $SRK" -H "Authorization: Bearer $SRK" http://127.0.0.1:8000/rest/v1/projects?select=id\&limit=1   # 200
curl -s -H "apikey: $ANON" -H "Authorization: Bearer $ANON" http://127.0.0.1:8000/rest/v1/projects?select=id\&limit=1   # [] (RLS) not rows
# App + status board
curl -s http://127.0.0.1:4001/api/healthz | python3 -m json.tool | grep -A2 '"db"'
curl -s http://127.0.0.1:4001/api/status  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['ok'], d['backups'])"
# Drill the restored DB immediately so the next weekly run is not the first proof:
/home/dovanlong/blockid.au/scripts/db-restore-test.sh
```

Log the outcome (who/when/which dump/row counts) in the incident PIR and add
a `restore` note to `backup-health.jsonl` if you restored manually:

```bash
echo "{\"ts\":\"$(date -u +%FT%TZ)\",\"job\":\"restore_prod\",\"status\":\"ok\",\"file\":\"$F\",\"by\":\"<name>\"}" >> /home/dovanlong/blockid.au/web/content/reports/backup-health.jsonl
```

## 7. Off-site (Google Drive) — current state and founder action

`scripts/db-backup-offsite.mjs` uploads the newest dump + sidecar into
`BlockID Evidence Vault/blockid-db-backups/` (folder id
`1WoH7a2xytmdLf8QnKDS13Aj6PwJTMdIw`), prunes copies older than 30 days and
re-lists to compare Drive's `md5Checksum` with the local file.

**Blocked on 2026-09-12:** the Drive service account
(`blockid-drive@…iam.gserviceaccount.com`) owns whatever it uploads and Google
gives service accounts **zero storage quota** — the upload is rejected with
`Service Accounts do not have storage quota`. Folders still work (that is how
the sub-folder got created). The same limit means the data-room
`uploadToGoogleDrive()` in `web/src/lib/google-drive.ts` cannot upload files
either. Pick ONE (founder, admin@blockid.au):

| Option | Effort | Then |
|---|---|---|
| **A. Founder OAuth token (recommended)** — `node --env-file=web/.env scripts/db-backup-offsite-auth.mjs`, sign in as admin@blockid.au, paste the redirected URL, add the printed `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN=` to `web/.env` | 3 min, no Workspace admin | files are owned by admin@blockid.au and use that account's quota |
| B. Shared Drive — create one in Workspace, add the service account as *Content manager*, set `GOOGLE_DRIVE_SHARED_DRIVE_ID=<driveId>` (or move the vault folder there) | Workspace Business Standard+ | no quota issue for the SA |
| C. Domain-wide delegation — Admin console → Security → API controls → add the SA client id with scope `https://www.googleapis.com/auth/drive`, set `GOOGLE_DRIVE_IMPERSONATE=admin@blockid.au` | Workspace super-admin | SA acts as the founder |

Until one is done the 02:40 cron fails loudly every day (Telegram + `offsite`
fail rows) — that is intentional; do not silence it. Verify afterwards with
`node --env-file=web/.env scripts/db-backup-offsite.mjs` (prints the Drive
listing with file ids) and check `/api/status`.

## 8. Known gaps

* The `backups` field on `/api/status` reads the `content/reports` copy inside
  the running release, which is refreshed on every deploy (several per day),
  not live — same as `ga4_events` and `crons`.
* Storage bucket bytes (`supabase-storage` volume) are not covered by this
  pipeline.
* The pre-QA-3 legacy dump `/data/backups/db-20260720T214508Z.sql.gz` is
  plain-SQL format; restore it with `gunzip -c … | psql -U supabase_admin -d <db>`
  if ever needed, then delete it.
