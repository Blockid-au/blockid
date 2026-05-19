# BlockID.au Deployment Guide

> Complete deployment, operations, and rollback documentation.
> Last updated: 2026-05-19

---

## Prerequisites

| Requirement          | Current Value                          |
| -------------------- | -------------------------------------- |
| GCP VM               | n1-highmem-8                           |
| Docker               | Docker + Docker Compose                |
| CI runner            | GitLab CI self-hosted runner (`deploy`) |
| Domain               | blockid.au (Cloudflare DNS)            |
| Reverse proxy        | Nginx (shared `bookedai-proxy-1`)      |
| Container network    | `supabase_default`                     |
| Node.js base image   | `node:22-alpine`                       |

---

## Environment Variables

All variables are stored as **GitLab CI/CD Variables** (Settings > CI/CD > Variables).

### Application

| Variable                          | Description                                                  |
| --------------------------------- | ------------------------------------------------------------ |
| `NODE_ENV`                        | `production` for staging/production, `development` for dev   |
| `NEXT_PUBLIC_SITE_URL`            | Public URL of the app (e.g. `https://blockid.au`)            |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID`    | Google OAuth client ID (build-time, inlined by Next.js)      |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (build-time, inlined by Next.js)   |
| `IP_HASH_SALT`                    | Salt for anonymizing IP addresses in analytics               |
| `CRON_SECRET`                     | Bearer token to authenticate cron job API calls              |

### Supabase

| Variable                     | Description                                      |
| ---------------------------- | ------------------------------------------------ |
| `SUPABASE_URL`               | Internal Supabase REST API URL                   |
| `SUPABASE_SERVICE_ROLE_KEY`  | Service role key (full access, server-side only)  |

### AI

| Variable            | Description                         |
| ------------------- | ----------------------------------- |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key for SVI AI |

### Email (SMTP)

| Variable           | Description                                    |
| ------------------ | ---------------------------------------------- |
| `SMTP_HOST`        | SMTP server hostname (e.g. `smtp.gmail.com`)   |
| `SMTP_PORT`        | SMTP port (e.g. `587`)                         |
| `SMTP_USER`        | SMTP username / email                          |
| `SMTP_PASS`        | SMTP password / app password                   |
| `SMTP_FROM_EMAIL`  | Sender address (e.g. `BlockID <noreply@blockid.au>`) |

### Google Drive (Evidence Vault)

| Variable                              | Description                                    |
| ------------------------------------- | ---------------------------------------------- |
| `GOOGLE_CLIENT_ID`                    | Google OAuth client ID (server-side)            |
| `GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL`  | Service account email for Drive API             |
| `GOOGLE_DRIVE_PRIVATE_KEY`            | PEM private key for the service account         |
| `GOOGLE_DRIVE_FOLDER_ID`             | Root Drive folder ID for evidence uploads        |

### Stripe (Payments)

| Variable                        | Description                                    |
| ------------------------------- | ---------------------------------------------- |
| `STRIPE_SECRET_KEY`             | Stripe secret key (server-side)                |
| `STRIPE_WEBHOOK_SECRET`         | Webhook endpoint signing secret                |
| `STRIPE_PRICE_FOUNDING50`      | Price ID for Founding 50 tier ($49)            |
| `STRIPE_PRICE_FOUNDER`         | Price ID for Founder tier                      |
| `STRIPE_PRICE_GROWTH`          | Price ID for Growth tier                       |
| `STRIPE_PRICE_PILOT`           | Price ID for Pilot tier                        |
| `STRIPE_PRICE_ACCELERATOR`     | Price ID for Accelerator tier                  |
| `STRIPE_PRICE_SVI_ANALYSIS`    | Price ID for single SVI analysis credit pack   |
| `STRIPE_PRICE_SVI_ANALYSIS_25` | Price ID for 25-pack SVI analysis credits      |

---

## Docker Image

The application uses a multi-stage Docker build (`web/Dockerfile`):

1. **deps** -- installs Node.js dependencies (npm ci)
2. **builder** -- runs `next build` with `NEXT_PUBLIC_*` args inlined
3. **runner** -- minimal Alpine image with standalone Next.js output

The final image exposes port `3000` and runs `node server.js`.

Health check: `wget --spider http://127.0.0.1:3000/` every 30s (20s start period, 3 retries).

---

## Manual Deployment

When GitLab CI is unavailable, deploy manually from the server:

```bash
# 1. Build the image
cd /home/dovanlong/blockid.au/web

docker build \
  --build-arg NEXT_PUBLIC_GOOGLE_CLIENT_ID="your-google-client-id" \
  --build-arg NEXT_PUBLIC_SITE_URL="https://blockid.au" \
  --build-arg NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_..." \
  -t gitlab-deploy/blockid:latest .

# 2. Stop and remove the existing container
docker stop deploy-blockid-production 2>/dev/null || true
docker rm deploy-blockid-production 2>/dev/null || true

# 3. Run the new container
docker run -d \
  --name deploy-blockid-production \
  --restart unless-stopped \
  --network supabase_default \
  -p 127.0.0.1:4001:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e HOSTNAME=0.0.0.0 \
  -e SUPABASE_URL="$SUPABASE_URL" \
  -e SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  -e NEXT_PUBLIC_SITE_URL="https://blockid.au" \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  -e IP_HASH_SALT="$IP_HASH_SALT" \
  -e SMTP_HOST="$SMTP_HOST" \
  -e SMTP_PORT="$SMTP_PORT" \
  -e SMTP_USER="$SMTP_USER" \
  -e SMTP_PASS="$SMTP_PASS" \
  -e SMTP_FROM_EMAIL="BlockID <noreply@blockid.au>" \
  -e GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
  -e GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL="$GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL" \
  -e GOOGLE_DRIVE_PRIVATE_KEY="$GOOGLE_DRIVE_PRIVATE_KEY" \
  -e GOOGLE_DRIVE_FOLDER_ID="$GOOGLE_DRIVE_FOLDER_ID" \
  -e CRON_SECRET="$CRON_SECRET" \
  -e STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY" \
  -e STRIPE_WEBHOOK_SECRET="$STRIPE_WEBHOOK_SECRET" \
  -e STRIPE_PRICE_FOUNDING50="$STRIPE_PRICE_FOUNDING50" \
  -e STRIPE_PRICE_FOUNDER="$STRIPE_PRICE_FOUNDER" \
  -e STRIPE_PRICE_GROWTH="$STRIPE_PRICE_GROWTH" \
  -e STRIPE_PRICE_PILOT="$STRIPE_PRICE_PILOT" \
  -e STRIPE_PRICE_ACCELERATOR="$STRIPE_PRICE_ACCELERATOR" \
  -e STRIPE_PRICE_SVI_ANALYSIS="$STRIPE_PRICE_SVI_ANALYSIS" \
  -e STRIPE_PRICE_SVI_ANALYSIS_25="$STRIPE_PRICE_SVI_ANALYSIS_25" \
  gitlab-deploy/blockid:latest

# 4. Verify
docker ps | grep deploy-blockid-production
curl -sf http://127.0.0.1:4001/ && echo "Health check passed!"
```

---

## GitLab CI Auto-Deploy

The pipeline is defined in `.gitlab-ci.yml` with **3 stages** and **3 environments**.

### Pipeline Stages

```
lint  -->  build  -->  deploy
```

1. **lint** -- Runs `npm run lint` in the `web/` directory (allowed to fail).
2. **build** -- Builds the Docker image with `NEXT_PUBLIC_*` build args. Tags the image as `gitlab-deploy/blockid:{env-tag}`.
3. **deploy** -- Stops old container, starts new one with all env vars, waits up to 60s for health check, runs a final curl verification.

### Environments

| Branch    | Environment | Container Name               | Port | URL                       |
| --------- | ----------- | ---------------------------- | ---- | ------------------------- |
| `dev`     | dev         | `deploy-blockid-dev`         | 4003 | https://dev.blockid.au    |
| `staging` | staging     | `deploy-blockid-staging`     | 4002 | https://staging.blockid.au |
| `master`  | production  | `deploy-blockid-production`  | 4001 | https://blockid.au        |

### Deployment Flow

1. Push to `dev`, `staging`, or `master` branch.
2. GitLab CI picks up the commit and runs the pipeline.
3. The `deploy` tag ensures the job runs on the self-hosted runner on the GCP VM.
4. The runner builds the image locally, stops/removes the old container, and starts a new one.
5. The container joins the `supabase_default` network, giving it access to Supabase services.
6. Nginx (external proxy) routes `blockid.au` traffic to `127.0.0.1:4001`.

---

## Database Migrations

Migrations are located in `web/supabase/migrations/` and numbered sequentially:

```
0001_init.sql
0002_score_v2.sql
0003_investor_links.sql
0004_cofounder_match.sql
0005_idea_phase.sql
0006_google_auth_coupons.sql
0007_svi_analyses.sql
0008_svi_tracking.sql
0009_stripe_customer.sql
0010_user_actions.sql
0011_analysis_gate.sql
0012_growth_insights.sql
0013_credits_usage.sql
```

### Running a Migration

```bash
# Apply a single migration
docker exec -i supabase-db psql -U postgres -d postgres < web/supabase/migrations/0013_credits_usage.sql

# Apply all migrations in order (use with caution)
for f in web/supabase/migrations/*.sql; do
  echo "Applying $f ..."
  docker exec -i supabase-db psql -U postgres -d postgres < "$f"
done
```

### Safety Notes

- Always back up before running migrations: `docker exec supabase-db pg_dump -U postgres postgres > backup_$(date +%Y%m%d).sql`
- Migrations are **not** idempotent by default. Check for `IF NOT EXISTS` guards before re-running.
- Test on dev/staging before applying to production.

---

## Cron Jobs

A dedicated cron container (`web/infra/Dockerfile.cron`) runs scheduled tasks by calling Next.js API endpoints via `wget`. The `CRON_SECRET` env var authenticates requests.

| Job               | Schedule                | Endpoint                          | Description                              |
| ----------------- | ----------------------- | --------------------------------- | ---------------------------------------- |
| SVI Snapshot       | Sunday 14:00 UTC        | `/api/cron/svi-snapshot`          | Weekly SVI score snapshot for trends     |
| Notifications      | Daily 22:00 UTC         | `/api/cron/svi-notify`            | Score change notifications (8am AEST)    |
| Growth Insights    | Daily 20:00 UTC         | `/api/cron/growth-insights`       | Regenerate growth intelligence (6am AEST)|

### Cron Container Management

```bash
# View cron logs
docker logs blockid-cron

# Manually trigger a cron job
docker exec blockid-cron wget -qO- \
  --header="Authorization: Bearer $CRON_SECRET" \
  http://web:3000/api/cron/svi-snapshot

# Restart cron container
docker restart blockid-cron
```

---

## Monitoring

### Container Health

```bash
# Check container status and health
docker ps | grep deploy-blockid

# Inspect health check details
docker inspect --format='{{json .State.Health}}' deploy-blockid-production | python3 -m json.tool

# Quick HTTP health check
curl -sf http://127.0.0.1:4001/ && echo "OK" || echo "DOWN"
```

### Application Logs

```bash
# Stream production logs
docker logs -f deploy-blockid-production

# Last 100 lines
docker logs --tail 100 deploy-blockid-production

# Logs since a specific time
docker logs --since "2026-05-19T00:00:00" deploy-blockid-production
```

### Email Delivery

- SMTP is sent via Gmail (app password).
- Check the **Gmail Sent folder** of the SMTP_USER account to verify delivery.
- Template rendering issues will appear in application logs.

### Stripe

- Dashboard: [dashboard.stripe.com](https://dashboard.stripe.com)
- Webhook logs: Stripe Dashboard > Developers > Webhooks > Select endpoint > Recent deliveries
- Failed payments and subscription changes are logged in the webhook delivery history.

### Database

```bash
# Connect to the database
docker exec -it supabase-db psql -U postgres -d postgres

# Check table sizes
docker exec supabase-db psql -U postgres -d postgres -c "
  SELECT schemaname, tablename,
         pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
"
```

---

## Rollback

### Quick Rollback (Previous Image)

If a deployment fails or introduces a bug, rollback to the previous image:

```bash
# 1. Stop the broken container
docker stop deploy-blockid-production
docker rm deploy-blockid-production

# 2. List available images to find the previous tag
docker images | grep gitlab-deploy/blockid

# 3. Redeploy with the previous image tag
docker run -d \
  --name deploy-blockid-production \
  --restart unless-stopped \
  --network supabase_default \
  -p 127.0.0.1:4001:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e HOSTNAME=0.0.0.0 \
  -e SUPABASE_URL="$SUPABASE_URL" \
  -e SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  -e NEXT_PUBLIC_SITE_URL="https://blockid.au" \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  -e IP_HASH_SALT="$IP_HASH_SALT" \
  -e SMTP_HOST="$SMTP_HOST" \
  -e SMTP_PORT="$SMTP_PORT" \
  -e SMTP_USER="$SMTP_USER" \
  -e SMTP_PASS="$SMTP_PASS" \
  -e SMTP_FROM_EMAIL="BlockID <noreply@blockid.au>" \
  -e GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
  -e GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL="$GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL" \
  -e GOOGLE_DRIVE_PRIVATE_KEY="$GOOGLE_DRIVE_PRIVATE_KEY" \
  -e GOOGLE_DRIVE_FOLDER_ID="$GOOGLE_DRIVE_FOLDER_ID" \
  -e CRON_SECRET="$CRON_SECRET" \
  -e STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY" \
  -e STRIPE_WEBHOOK_SECRET="$STRIPE_WEBHOOK_SECRET" \
  -e STRIPE_PRICE_FOUNDING50="$STRIPE_PRICE_FOUNDING50" \
  -e STRIPE_PRICE_FOUNDER="$STRIPE_PRICE_FOUNDER" \
  -e STRIPE_PRICE_GROWTH="$STRIPE_PRICE_GROWTH" \
  -e STRIPE_PRICE_PILOT="$STRIPE_PRICE_PILOT" \
  -e STRIPE_PRICE_ACCELERATOR="$STRIPE_PRICE_ACCELERATOR" \
  -e STRIPE_PRICE_SVI_ANALYSIS="$STRIPE_PRICE_SVI_ANALYSIS" \
  -e STRIPE_PRICE_SVI_ANALYSIS_25="$STRIPE_PRICE_SVI_ANALYSIS_25" \
  gitlab-deploy/blockid:previous-tag  # <-- replace with actual tag

# 4. Verify
docker ps | grep deploy-blockid-production
curl -sf http://127.0.0.1:4001/ && echo "Rollback successful!"
```

### GitLab CI Rollback

Alternatively, revert the commit on the `master` branch and push -- GitLab CI will automatically rebuild and deploy the previous code:

```bash
git revert HEAD
git push origin master
```

### Database Rollback

If a migration needs to be reversed, write and apply a manual rollback script:

```bash
# Example: drop a table added by a migration
docker exec -i supabase-db psql -U postgres -d postgres <<'SQL'
  -- Reverse migration 0013
  DROP TABLE IF EXISTS public.credit_transactions;
SQL
```

---

## Architecture Overview

```
                     Cloudflare DNS
                          |
                      blockid.au
                          |
                   Nginx Reverse Proxy
                   (bookedai-proxy-1)
                          |
              +-----------+-----------+
              |                       |
     deploy-blockid-production   supabase-db
     (Next.js on :4001)          (PostgreSQL)
              |                       |
       blockid-cron              supabase-*
       (scheduled jobs)          (auth, storage, etc.)
```

All containers communicate over the `supabase_default` Docker network.
