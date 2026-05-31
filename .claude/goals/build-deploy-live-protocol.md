# Build & Deploy Live Protocol — Single Source of Truth

## Golden Rule

Server `/home/dovanlong/blockid.au` IS production. Build here, deploy here, run here.
NEVER Docker, GitLab CI, GitHub Actions, or any external CI/CD.

---

## Build + Deploy Steps (EXACT, DO NOT SKIP ANY)

```bash
cd /home/dovanlong/blockid.au/web

# Step 1: Build
rm -rf .next
npm run build

# Step 2: Sync ALL output into standalone (THIS IS CRITICAL)
STANDALONE=".next/standalone"
cp -r .next/static  "$STANDALONE/.next/static"   # Client JS/CSS bundles
cp -r .next/server  "$STANDALONE/.next/server"    # ALL server routes + manifests
cp -r public        "$STANDALONE/public"           # Static assets (images, favicon)
cp ai-worker.mjs    "$STANDALONE/ai-worker.mjs"    # AI subprocess worker

# Step 3: Copy serverExternalPackages (not traced by standalone)
for pkg in pptxgenjs gaxios gcp-metadata; do
  [ -d "node_modules/$pkg" ] && [ ! -d "$STANDALONE/node_modules/$pkg" ] && \
    cp -r "node_modules/$pkg" "$STANDALONE/node_modules/$pkg"
done

# Step 4: Start with env overrides
export PORT=4001 HOSTNAME=0.0.0.0 NODE_ENV=production
export SUPABASE_URL=http://127.0.0.1:8000   # NOT supabase-kong:8000
export REDIS_URL=redis://127.0.0.1:6379      # NOT blockid-redis:6379
cd "$STANDALONE" && node server.js
```

Or simply: `bash scripts/deploy-live.sh`

---

## Why `.next/server` Must Be Copied

Next.js standalone tracer creates `standalone/` with ONLY files reachable from `server.js` imports. It MISSES:

- `page_client-reference-manifest.js` — required for every page route
- `page/app-paths-manifest.json` — route resolution
- `page/build-manifest.json` — chunk mapping
- `page/react-loadable-manifest.json` — code splitting
- Dynamic route segments and their manifests

Without these → `InvariantError: client reference manifest does not exist` → 500 error on every page.

**FIX**: `cp -r .next/server standalone/.next/server` after every build. This copies ~50MB but ensures ALL routes work.

---

## Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `client reference manifest does not exist` | `.next/server` not copied to standalone | `cp -r .next/server standalone/.next/server` |
| `ai-worker.mjs not found` | Worker not copied to standalone | `cp ai-worker.mjs standalone/` |
| `Cannot find package 'bcryptjs'` | serverExternalPackages missing | Copy from node_modules |
| `ENOTFOUND supabase-kong` | Wrong SUPABASE_URL (Docker hostname) | Override to `http://127.0.0.1:8000` |
| `ENOTFOUND blockid-redis` | Wrong REDIS_URL | Override to `redis://127.0.0.1:6379` |
| `EADDRINUSE 4001` | Old process holding port | `fuser -k -9 4001/tcp` |
| `PEM error DECODER unsupported` | .env quotes not stripped | Deploy script strips quotes |
| `Functions cannot be passed to Client Components` | Server→client serialization | Pass plain data, map icons in client |

---

## Automation

| Tool | Purpose | Schedule |
|------|---------|----------|
| `deploy-live.sh` | Full 9-gate CI/CD pipeline | Manual or agent webhook |
| `watchdog.sh` | Auto-restart if dead | Cron every 2 min |
| Nginx microcache | Serve stale if Node.js down | Always active |
| Cloudflare purge | Clear CDN after deploy | Auto in deploy script |
| Agent webhook | Claude Cloud agents deploy | POST /api/cron/agent-deploy |
