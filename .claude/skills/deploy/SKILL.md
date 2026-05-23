---
name: deploy
description: Build, test, and deploy BlockID to staging or production via GitLab CI/CD pipeline. Use when the user says "deploy", "push to production", or "deploy staging".
arguments: [environment]
---

# Deploy BlockID

Deploy the BlockID.au web application to the specified environment.

**Argument:** `$0` — target environment: `staging` or `production` (default: `staging`)

## Steps

1. **Pre-flight checks**
   - Run `npm run lint` and check for errors (warnings OK)
   - If any check fails, STOP and report the issue

2. **Commit if needed**
   - Run `git status` to check for uncommitted changes
   - If there are changes, stage relevant files and commit with a descriptive message
   - Do NOT commit .env files or anything in .gitignore

3. **Push and deploy**
   - For `staging`: push to the `staging` branch
   - For `production`: push to `master` branch
   - GitLab CI auto-triggers: single-stage pipeline (lint → build → deploy, ~90s)

4. **Post-deploy verification**
   - Health check the deployed URL:
     - staging: `https://staging.blockid.au/`
     - production: `https://blockid.au/`
   - Test key endpoints return expected status codes:
     - `GET /` → 200
     - `GET /api/auth/me` → 200
   - Report results
