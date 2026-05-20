# BlockID.au — Deployment Runbook

## Quick Deploy (normal flow)
```bash
cd /home/dovanlong/blockid.au/web

# 1. Pre-flight
npx tsc --noEmit        # must pass (0 errors)
npm run lint            # errors must be 0 (warnings OK)

# 2. Commit & push
git add <files>
git commit -m "feat/fix: description"
git push origin master   # triggers GitLab CI/CD

# 3. Monitor pipeline
TOKEN="glpat-4E9lBvYECmIbI6LgSRvX3G86MQp1OjEH.01.0w07d02zv"
curl -s --header "PRIVATE-TOKEN: $TOKEN" \
  "https://git.longcare.au/api/v4/projects/4/pipelines?per_page=1&ref=master" \
  | python3 -c "import json,sys;d=json.load(sys.stdin)[0];print(f'Pipeline #{d[\"id\"]}: {d[\"status\"]}')"

# 4. Post-deploy verify
curl -s -o /dev/null -w "%{http_code}" https://blockid.au/        # expect 200
curl -s -o /dev/null -w "%{http_code}" https://blockid.au/score    # expect 200
curl -s -o /dev/null -w "%{http_code}" https://blockid.au/admin    # expect 307

# 5. Fix AI permissions (after container recreated)
chmod 644 ~/.claude/.credentials.json

# 6. Test AI health
CRON_SECRET=$(grep 'CRON_SECRET=' .env | head -1 | cut -d= -f2)
curl -s -H "Authorization: Bearer $CRON_SECRET" https://blockid.au/api/cron/ai-health
```

## Pipeline Stages
```
lint (node:22-alpine) → build (docker build) → deploy (docker run)
```
- **lint**: `npm run lint` — allow_failure: true
- **build**: Docker build with NEXT_PUBLIC_* build args
- **deploy**: Stop old container → Run new → Health check (30 retries)

## Container Details
- **Name**: `deploy-blockid-production`
- **Port**: 127.0.0.1:4001 → 3000
- **Network**: supabase_default
- **Image**: gitlab-deploy/blockid:latest
- **Volumes**:
  - `~/.claude/.credentials.json` → `/home/node/.claude/` (Claude OAuth)
  - `~/.codex/auth.json` → `/home/node/.codex/` (Codex OAuth)
  - `web/content/` → `/app/content` (articles, writable)

## Rollback
```bash
# Option 1: Revert commit
git revert HEAD && git push origin master

# Option 2: Redeploy previous pipeline
# Go to GitLab → Pipelines → find last successful → Retry deploy job
```

## Emergency: AI Down
```bash
# 1. Check health
curl -s -H "Authorization: Bearer $CRON_SECRET" https://blockid.au/api/cron/ai-health

# 2. Refresh Claude OAuth
chmod 644 ~/.claude/.credentials.json
~/blockid.au/web/scripts/refresh-claude-oauth.sh

# 3. Or add key via admin UI (no redeploy needed)
# → https://blockid.au/admin/ai-keys

# 4. Or add key via API directly
curl -X POST https://blockid.au/api/admin/ai-keys \
  -H "Cookie: blockid_session=YOUR_SESSION" \
  -H "Content-Type: application/json" \
  -d '{"provider":"gemini","api_key":"AIza..."}'
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