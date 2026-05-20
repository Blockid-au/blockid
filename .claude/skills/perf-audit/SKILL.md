---
name: perf-audit
description: "Run a performance audit — response times, bundle size, caching, API latency, database queries. Use when user says 'performance', 'speed', 'slow', or 'optimize'."
---

# Performance Audit — BlockID.au

## Steps

1. **Response Times** — curl all public pages, measure TTFB
2. **API Latency** — test key endpoints (svi, score, auth, stripe)
3. **Bundle Analysis** — check `.next/` build output sizes
4. **Image Optimization** — verify next/image usage, check for unoptimized images
5. **Caching** — check Cache-Control headers, Cloudflare cache HIT rates
6. **Database** — identify N+1 queries in API routes, check index usage
7. **Docker** — check container resource usage, health check status

**Output:** Performance scorecard with specific optimization recommendations.