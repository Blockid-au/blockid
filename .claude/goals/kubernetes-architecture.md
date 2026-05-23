# BlockID.au — Kubernetes-Ready Architecture

## Current State: Monolith
- 1 Next.js app, 128 API routes, ~15K lines core libs
- Full rebuild: 90-120s Docker build
- Single container: blockid-production on port 4001

## Target State: 4 Microservices

```
                    ┌─────────────────────────┐
                    │   Cloudflare CDN/WAF     │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │   Nginx / K8s Ingress    │
                    │   Route by URL prefix    │
                    └──┬────┬────┬────┬────────┘
                       │    │    │    │
           ┌───────────▼┐┌──▼───┐┌───▼────┐┌───▼────┐
           │ blockid-web││ b-ai ││b-equity││ b-cron │
           │            ││      ││        ││        │
           │ Pages, Auth││ SVI  ││Cap Tab ││ Jobs   │
           │ Billing    ││ R&D  ││Vesting ││ Nurture│
           │ OAuth      ││ Evid ││Equity  ││ Agent  │
           │ Admin      ││ AI   ││Blockchain│ Upgrade│
           │            ││ PDF  ││        ││        │
           │ 2-5 pods   ││3-10  ││ 1-3    ││ 1 pod  │
           └─────┬──────┘└──┬───┘└───┬────┘└───┬────┘
                 │          │        │         │
           ┌─────▼──────────▼────────▼─────────▼────┐
           │            Supabase (PostgreSQL)        │
           │         55 tables, shared DB             │
           └────────────────┬───────────────────────┘
                            │
           ┌────────────────▼───────────────────────┐
           │              Redis                      │
           │    Rate limiting, cache, sessions       │
           └────────────────────────────────────────┘
           │
           ┌────────────────▼───────────────────────┐
           │         S3 / GCS (File Storage)         │
           │    Uploads, PDFs, Drive sync            │
           └────────────────────────────────────────┘
```

## Service Definitions

### Service 1: blockid-web (Next.js)
**Routes**: `/`, `/auth/*`, `/dashboard`, `/workspace/*`, `/tools/*`, `/pricing`, `/api/auth/*`, `/api/oauth/*`, `/api/stripe/*`, `/api/credits/*`, `/api/admin/*`, `/api/projects/*`
**Port**: 3000
**Replicas**: 2-5 (HPA on CPU 70%)
**Image**: ~50MB (no AI SDKs, no puppeteer)
**Memory**: 512MB-1GB
**Dependencies**: Supabase, Redis, Stripe, SMTP

### Service 2: blockid-ai (Express/Hono)
**Routes**: `/api/rnd/*`, `/api/svi/*`, `/api/evidence/*`, `/api/website-tech-audit`, `/api/score`, `/api/ai/*`
**Port**: 3001
**Replicas**: 3-10 (HPA on response latency)
**Image**: ~100MB (all AI SDKs + PDF + puppeteer)
**Memory**: 2GB-4GB (AI processing)
**Dependencies**: Supabase, Claude API, OpenAI, Gemini, Google Drive

### Service 3: blockid-equity (Express/Hono)
**Routes**: `/api/cap-table/*`, `/api/equity/*`, `/api/vesting/*`, `/api/share-structure`, `/api/dividends`, `/api/blockchain/*`, `/api/tokenization`
**Port**: 3002
**Replicas**: 1-3 (light load)
**Image**: ~5MB (minimal deps)
**Memory**: 256MB-512MB
**Dependencies**: Supabase only

### Service 4: blockid-cron (Node.js worker)
**Routes**: `/api/cron/*` (internal only)
**Port**: 3003
**Replicas**: 1 (singleton — leader election via DB lock)
**Image**: ~50MB
**Memory**: 512MB-1GB
**Dependencies**: Supabase, AI APIs (for agent-upgrade), SMTP
**Schedule**: CronJob objects in K8s OR internal setInterval

## Phase 1: Preparation (Current VM — No K8s Yet)

### 1.1 Replace in-memory state with Redis
- Rate limiter: `Map` → Redis with TTL
- AI key cache: Already uses DB fallback (OK)
- Session validation: Already in Supabase (OK)

### 1.2 Move file uploads to object storage
- `/public/uploads/` → S3-compatible (MinIO on VM, S3 in cloud)
- Signed URLs for download
- Upload API writes to S3 instead of filesystem

### 1.3 Create per-service Dockerfiles
```
docker/
├── Dockerfile.web      — Next.js pages + auth + billing
├── Dockerfile.ai       — AI routes (Express/Hono)
├── Dockerfile.equity   — Equity engine (Express/Hono)
└── Dockerfile.cron     — Background workers
```

### 1.4 Extract non-Next.js routes to standalone Express
- Create `services/ai-service/` with Express
- Move lib/ai-client, lib/svi-analysis, lib/rnd-analysis, lib/rnd-input
- SSE streaming works in Express (res.write())
- Auth via API key or JWT token (not cookies)

## Phase 2: Multi-Container on VM (Docker Compose)

```yaml
# docker-compose.production.yml
services:
  web:
    build: { dockerfile: docker/Dockerfile.web }
    ports: ["4001:3000"]
    env_file: .env
    depends_on: [redis]
    
  ai:
    build: { dockerfile: docker/Dockerfile.ai }
    ports: ["4004:3001"]
    env_file: .env
    deploy: { replicas: 2 }
    depends_on: [redis]
    
  equity:
    build: { dockerfile: docker/Dockerfile.equity }
    ports: ["4005:3002"]
    env_file: .env
    
  cron:
    build: { dockerfile: docker/Dockerfile.cron }
    env_file: .env
    
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes: ["redis-data:/data"]

volumes:
  redis-data:
```

### Nginx routing:
```nginx
location /api/rnd    { proxy_pass http://ai:3001; }
location /api/svi    { proxy_pass http://ai:3001; }
location /api/evidence { proxy_pass http://ai:3001; }
location /api/cap-table { proxy_pass http://equity:3002; }
location /api/equity   { proxy_pass http://equity:3002; }
location /api/vesting  { proxy_pass http://equity:3002; }
location /api/cron     { proxy_pass http://cron:3003; }
location /             { proxy_pass http://web:3000; }
```

## Phase 3: Kubernetes Migration

### K8s Manifests (created per service)
```
k8s/
├── namespace.yaml
├── secrets.yaml           — All env vars as K8s Secrets
├── web/
│   ├── deployment.yaml    — 2-5 replicas, HPA
│   ├── service.yaml       — ClusterIP
│   └── hpa.yaml           — CPU 70% target
├── ai/
│   ├── deployment.yaml    — 3-10 replicas, HPA on latency
│   ├── service.yaml
│   └── hpa.yaml           — Custom metric: avg response time
├── equity/
│   ├── deployment.yaml    — 1-3 replicas
│   └── service.yaml
├── cron/
│   ├── deployment.yaml    — 1 replica (singleton)
│   └── cronjob.yaml       — K8s CronJob definitions
├── redis/
│   ├── deployment.yaml
│   ├── service.yaml
│   └── pvc.yaml
├── ingress.yaml           — Nginx Ingress routing
└── configmap.yaml         — Non-secret config
```

## Implementation Timeline

### Week 1-2: Phase 1 (Preparation on VM)
- [x] Install Redis on VM (blockid-redis container running) (`docker run redis:7-alpine`)
- [x] Replace rate-limit Map with Redis (ioredis + sync fallback)
- [ ] Set up MinIO for file uploads (S3-compatible)
- [x] Create shared lib package structure (lib/shared/index.ts)
- [ ] Document all inter-service API contracts

### Week 3-4: Phase 2 (Multi-Container)
- [ ] Create Dockerfile.ai (Express service for AI routes)
- [ ] Create Dockerfile.equity (Express service for equity)
- [ ] Create docker-compose.production.yml
- [ ] Update nginx to route by URL prefix
- [ ] Test: change AI model without rebuilding web

### Week 5-6: Phase 2 Testing
- [ ] Load test each service independently
- [ ] Verify SSE streaming works through nginx proxy
- [ ] Test failover (kill one service, others continue)
- [ ] Verify credit deduction works cross-service

### Month 2: Phase 3 (K8s Migration)
- [ ] Create K8s manifests
- [ ] Set up K8s cluster (GKE or self-managed)
- [ ] Migrate services one by one
- [ ] Set up HPA autoscaling
- [ ] Set up monitoring (Prometheus + Grafana)

## Agent Assignments

| Agent | Phase | Task |
|-------|-------|------|
| CTO | 1 | Redis integration, shared lib extraction |
| CTO | 2 | Dockerfile creation, Express service setup |
| COO | 2 | Docker Compose, nginx routing |
| CISO | 2 | Inter-service auth (API keys vs mTLS) |
| CDO | 3 | Data flow documentation, monitoring setup |
| COO | 3 | K8s manifests, HPA tuning |

## Critical Issues to Fix Before Split

| Issue | Priority | Solution |
|-------|----------|----------|
| In-memory rate limiter | P0 | Redis (Week 1) |
| File uploads on local disk | P0 | S3/MinIO (Week 1) |
| 20 routes use cookies() | P1 | Keep in web service, proxy to AI via internal API |
| SSE streaming through proxy | P1 | nginx `proxy_buffering off` (already set) |
| Cron duplicate prevention | P2 | DB row lock or K8s CronJob (singleton) |
| No health check endpoints | P2 | Add /healthz to each service |