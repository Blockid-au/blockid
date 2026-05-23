# BlockID.au — Deployment Runbook

## Quick Deploy (normal flow)
```bash
cd /home/dovanlong/blockid.au/web

# 1. Lint
npm run lint

# 2. Commit & push
git add <files>
git commit -m "feat/fix: description"
git push origin master   # triggers GitLab CI — single stage ~90s

# 3. Post-deploy verify
curl -s -o /dev/null -w "%{http_code}" https://blockid.au/        # expect 200
curl -s -o /dev/null -w "%{http_code}" https://blockid.au/score    # expect 200
curl -s -o /dev/null -w "%{http_code}" https://blockid.au/admin    # expect 307
```

## Manual Deploy (bypass CI)
```bash
cd /home/dovanlong/blockid.au/web
bash scripts/deploy-production.sh
```

## Pipeline
```
Single stage: lint → docker compose build → deploy → health check → Cloudflare purge
Duration: ~90 seconds
```

## Container Details
- **Name**: `deploy-blockid-production`
- **Port**: 127.0.0.1:4001 → 3000
- **Network**: supabase_default
- **Image**: blockid/web:latest
- **Volumes**:
  - `~/.claude/.credentials.json` → `/home/node/.claude/` (Claude OAuth)
  - `~/.codex/auth.json` → `/home/node/.codex/` (Codex OAuth)
  - `web/content/` → `/app/content` (articles, writable)
  - `uploads/` → `/app/uploads` (user uploads)

## Rollback
```bash
# Option 1: Revert commit
git revert HEAD && git push origin master

# Option 2: Manual redeploy from previous commit
git checkout HEAD~1 -- .
bash scripts/deploy-production.sh
```

## Emergency: AI Down
```bash
# 1. Check health
CRON_SECRET=$(grep 'CRON_SECRET=' .env | head -1 | cut -d= -f2)
curl -s -H "Authorization: Bearer $CRON_SECRET" https://blockid.au/api/cron/ai-health

# 2. Refresh Claude OAuth
chmod 644 ~/.claude/.credentials.json
~/blockid.au/web/scripts/refresh-claude-oauth.sh

# 3. Or add key via admin UI (no redeploy needed)
# → https://blockid.au/admin/ai-keys
```

## Cron Schedule (Docker container: blockid-cron)
| Job | Schedule (UTC) | AEST |
|-----|---------------|------|
| svi-snapshot | Sunday 14:00 | Mon 00:00 |
| svi-notify | Daily 22:00 | 08:00 |
| growth-insights | Daily 20:00 | 06:00 |
| publish-insight | Daily 21:00 | 07:00 |
| ai-health | Every 3h | Every 3h |

## Server Cron (host, not Docker)
| Job | Schedule |
|-----|---------|
| Claude OAuth refresh | Every 3h (`0 */3 * * *`) |
