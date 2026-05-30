---
name: No Docker/CI deploy
description: Never deploy via Docker, GitLab CI, or GitHub Actions. Always build from src and deploy standalone with zero-downtime swap.
type: feedback
---

Never deploy via Docker, GitLab CI, or GitHub Actions — these have caused repeated failures (env vars missing, supabase-kong hostname unresolvable, CSP not applied, PEM key corruption).

**Why:** Docker build loses .env context, CI pipeline is slow (10+ min), container networking breaks Supabase connection. Multiple hours wasted debugging these issues across many sessions.

**How to apply:** Always use `bash scripts/deploy-live.sh` which:
1. Builds from source (`npm run build`)
2. Copies standalone + static + public
3. Starts new process on temp port
4. Health checks the new process
5. Swaps ports (zero-downtime)
6. Keeps previous build as backup for instant rollback

Production runs as standalone Node.js process on port 4001, proxied by Nginx.
