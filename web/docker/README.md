# Docker Build Configuration

## Current: Single Container (Monolith)
```bash
# Build everything
docker build -t blockid-production .

# Deploy
bash scripts/deploy-production.sh
```

## Future: Multi-Container (Phase 2)

### Service Dockerfiles (to be created when splitting)
```
docker/
├── Dockerfile.web      — Next.js pages + auth + billing (~50MB)
├── Dockerfile.ai       — AI routes: SVI, R&D, evidence (~100MB)
├── Dockerfile.equity   — Cap table, vesting, equity (~5MB)
├── Dockerfile.cron     — Background workers, nurture (~50MB)
└── docker-compose.yml  — Multi-service orchestration
```

### Quick Reference
| Service | Port | Replicas | Memory | Key Dependencies |
|---------|------|----------|--------|------------------|
| web | 3000 | 2-5 | 512MB-1GB | Next.js, Stripe, bcrypt |
| ai | 3001 | 3-10 | 2GB-4GB | Claude, OpenAI, Gemini, PDF |
| equity | 3002 | 1-3 | 256MB | Supabase only |
| cron | 3003 | 1 | 512MB | All libs (cross-cutting) |

### Migration Order
1. Extract cron (easiest — no user traffic)
2. Extract equity (minimal deps, pure DB)
3. Extract AI (largest, most impactful for scaling)
4. Web remains as Next.js with auth + billing

### Nginx Routing (when split)
```nginx
location /api/rnd     { proxy_pass http://ai:3001; }
location /api/svi     { proxy_pass http://ai:3001; }
location /api/evidence { proxy_pass http://ai:3001; }
location /api/cap-table { proxy_pass http://equity:3002; }
location /api/equity    { proxy_pass http://equity:3002; }
location /api/vesting   { proxy_pass http://equity:3002; }
location /api/cron      { proxy_pass http://cron:3003; }
location /              { proxy_pass http://web:3000; }
```
