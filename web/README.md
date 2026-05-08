# BlockID — `blockid.au`

Persistent identity & trust infrastructure for private capital markets. Self-hosted Next.js app behind Caddy, deployed via Docker Compose.

- **Live target:** https://blockid.au (canonical), https://www.blockid.au → 308 redirect
- **Stack:** Next.js (App Router) · Tailwind v4 · Lucide · TypeScript · Caddy 2 · Docker Compose
- **Design system:** `design-system/blockid/MASTER.md` (read before changing UI)
- **Source docs:** `../blockid_master_project_blueprint_v1.md`, `../blockid_gtm_sales_first_v1.md`, `../blockid_upgrade_solution_plan_v2.md`

---

## Project layout

```
web/
  src/
    app/                 # App Router pages
      page.tsx           # Landing (11 sections)
      score/             # /score — Investor-Ready Score v2 intake + share link
      tools/dilution/    # /tools/dilution — public Founder Dilution Calculator (SEO)
      tools/data-room/   # /tools/data-room — Fundraising Data Room Checklist
      api/lead/          # POST /api/lead — lead capture (logs to console; TODO Supabase/Resend)
      sitemap.ts         # /sitemap.xml
      robots.ts          # /robots.txt
    components/
      site/              # navbar, footer
      landing/           # hero, logo-cloud, bento, comps-wall, compliance, pricing, faq, cta-strip, investor-pack
      score/             # score-card (used on / and /score result)
      brand/             # logo
      ui/                # shadcn-style primitives (button, input, label, card, badge, accordion, tabs)
    lib/
      score.ts           # deterministic Score v2: 0–100 score, confidence, actions, benchmark
      utils.ts           # cn() helper
  design-system/blockid/MASTER.md
  Dockerfile             # multi-stage, standalone Next output, non-root, healthcheck
  docker-compose.yml     # services: web (internal) + caddy (host 80/443)
  infra/
    Caddyfile            # TLS, HSTS, CSP, gzip+zstd, /healthz, CORS for /api/*
    deploy.sh            # git pull → compose pull/build/up → ps
  .env.example           # NODE_ENV, PORT, future RESEND/SUPABASE keys
  .dockerignore
```

---

## Local development

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # production build (verifies before deploy)
npm run lint
```

---

## Production deploy (single VPS)

### 1. DNS

Point both records at the server's public IP (A/AAAA):

```
blockid.au.        A     <SERVER_IP>
www.blockid.au.    A     <SERVER_IP>
```

Wait for propagation (`dig blockid.au @1.1.1.1 +short`) **before** starting the stack — Caddy provisions Let's Encrypt certs via HTTP-01, which requires DNS to resolve and ports 80/443 to be open.

### 2. Server prerequisites

- Linux host (Ubuntu 22.04+/Debian 12+ tested), 1 vCPU / 1 GB RAM minimum, 2 GB recommended.
- Docker Engine 24+ and the Compose v2 plugin (`docker compose version`).
- Firewall: allow inbound 80/tcp and 443/tcp + 443/udp (HTTP/3). Block direct access to 3000.

```bash
# Quick install on Ubuntu
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER" && newgrp docker
sudo ufw allow 80,443/tcp && sudo ufw allow 443/udp
```

### 3. Configure environment

```bash
cd /home/dovanlong/BlockID.au/web
cp .env.example .env
# Edit .env if/when you wire up Resend or Supabase. Defaults are fine for first deploy.
```

### 4. Bring up the stack

```bash
docker compose build web
docker compose up -d
docker compose ps
docker compose logs -f caddy   # watch ACME cert issuance — should see "certificate obtained"
```

First run takes ~30–60s for Caddy to fetch the LE cert. Once `caddy` is healthy, hit:

- `https://blockid.au` → landing
- `https://www.blockid.au` → 308 redirect to apex
- `https://blockid.au/healthz` → 200 from Caddy directly (does not hit the app)
- `https://blockid.au/score`, `https://blockid.au/tools/dilution`

### 5. Updating

```bash
cd /home/dovanlong/BlockID.au/web
./infra/deploy.sh
```

The script runs `git pull --ff-only`, rebuilds the `web` image, and restarts both services with zero-downtime semantics where possible.

---

## What the deploy hardens

| Concern | How |
|---|---|
| TLS | Caddy auto-provisions LE certs for both apex and www. HSTS `max-age=63072000; includeSubDomains; preload`. |
| Redirect | `www.blockid.au` → `https://blockid.au` (308). |
| Compression | gzip + zstd via Caddy. |
| Security headers | `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(), microphone=(), camera=()`, server banner stripped. |
| CSP | `default-src 'self'`; allow Google Fonts (`fonts.googleapis.com`/`fonts.gstatic.com`); `connect-src 'self'`; `frame-ancestors 'none'`; `object-src 'none'`. |
| CORS | `Access-Control-Allow-Origin: https://blockid.au` is set **only on `/api/*`**. Static assets and pages do not emit CORS headers. Preflight `OPTIONS /api/*` short-circuits with 204. |
| Container | Non-root `node` user, alpine base, `output: 'standalone'`, `wget` healthcheck, internal-only `web` service. |
| Restart policy | `restart: unless-stopped`. |
| Healthcheck | `/healthz` on Caddy + Docker `HEALTHCHECK` on web. |

---

## Allowing access from `https://blockid.au`

The `Access-Control-Allow-Origin` header is intentionally strict:

- **Same-origin browser requests** to `/api/lead` (the form posts) work without CORS at all.
- **Cross-origin requests** are accepted **only** from `https://blockid.au`. Subdomains are not allowed by default. To allow another origin (e.g. a future `app.blockid.au`), edit `infra/Caddyfile` and add it to the `@apiOrigin` matcher and the `Access-Control-Allow-Origin` header value (use `Vary: Origin` already set), then `docker compose up -d caddy` to reload.

---

## Smoke test checklist after deploy

```bash
curl -sI https://blockid.au | head
curl -sI https://www.blockid.au | head            # expect 308
curl -s  https://blockid.au/healthz               # expect "ok"
curl -sI -X OPTIONS https://blockid.au/api/lead \
  -H "Origin: https://blockid.au" \
  -H "Access-Control-Request-Method: POST"        # expect 204 + ACA-Origin
curl -s  https://blockid.au/sitemap.xml | head
curl -s  https://blockid.au/robots.txt
```

Lighthouse: aim for ≥95 on Performance / Accessibility / Best Practices / SEO. Open https://www.ssllabs.com/ssltest/analyze.html?d=blockid.au — should grade A+ (HSTS preload eligible).

---

## Phase 1.5 — Backend wiring (now shipped)

The wedge is end-to-end: lead capture, score persistence, shareable Investor View Link, and PDF artifact.

- `/api/lead` → persists to Supabase `leads` (graceful console fallback if not configured).
- `/api/score` → computes Score v2, writes `scores` row, returns slug, confidence, missing inputs, action plan and benchmark, fires score-ready email (Resend) async.
- `/s/[slug]` → public Investor View Link page, server-records each view in `score_views` (IPs hashed with daily salt), renders score confidence, benchmark and founder actions.
- `/s/[slug]/activity` → founder-facing activity view with total opens, unique daily hashed viewers, latest open, source/referrer and device summary.
- `/s/[slug]/pdf` → `application/pdf` rendered via `@react-pdf/renderer` (no headless browser needed), now includes Score v2 confidence, benchmark and recommended actions.
- `/tools/data-room` → interactive AU fundraising data room checklist with readiness score, high-impact gaps, owner labels, summary copy and lead capture.
- Demo mode: any slug starting with `demo-` (or any slug when Supabase isn't configured) renders a sample score so the UI flow works without secrets.

### Database schema

`supabase/migrations/0001_init.sql` creates three tables (`leads`, `scores`, `score_views`) with indexes and RLS enabled. `supabase/migrations/0002_score_v2.sql` adds Score v2 explainability fields (`score_version`, `confidence_score`, `missing_inputs`, `action_plan`, `benchmark`). Run both migrations against your Supabase project (SQL editor or `psql`):

```bash
psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql
psql "$DATABASE_URL" -f supabase/migrations/0002_score_v2.sql
```

RLS is enabled with no policies — the Next.js server uses the **service-role key** server-side, which bypasses RLS. Do not expose that key to the browser.

### Required services

| Service | Why | Setup |
|---|---|---|
| Supabase project | Persistence | https://supabase.com → new project (Sydney region for AU residency). Copy `Project URL` + `service_role` key into `.env`. Run the migration above. |
| Resend account | Transactional email | https://resend.com → API key. Verify the `blockid.au` sending domain (DKIM/SPF/DMARC records — Resend gives you the DNS lines). Set `RESEND_FROM_EMAIL=BlockID <noreply@blockid.au>`. |

If neither is configured, the app still runs — every persistence call logs `[blockid:*] not configured — logging only` and the UI degrades to demo slugs.

---

## Phase 2 — Term Sheet AI (now shipped v1)

`/tools/term-sheet` — founders paste a term sheet, get back a plain-English summary, severity-ranked redline, AU-market comparison, and (optionally) a dilution simulation against their cap table. Saves AUD $3k–$10k in lawyer fees per round.

The route is built on Claude Sonnet 4.6 via `client.messages.parse()` with a Zod-validated structured output schema. The bulky AU market reference (~3–4k tokens of typical SAFE caps, Series A norms, ESIC eligibility rules, founder-friendly vs investor-friendly patterns) is wrapped in a 1-hour `cache_control: ephemeral` breakpoint, so subsequent analyses pay ~0.1× input cost on the prefix instead of the full 1× rate. Cache writes cost ~2× for the 1h TTL, so the break-even is three analyses per cache window — easy to clear in production. Container logs emit a single `[blockid:termsheet] cache_read=… cache_create=… input=… output=…` line per request so the operator can verify the cache hit rate. If `ANTHROPIC_API_KEY` is missing the route returns a fully-populated demo analysis so the UX flow works without secrets.

### Required services (additional)

| Service | Why | Setup |
|---|---|---|
| Anthropic API key | Powers Term Sheet AI analysis (Claude Sonnet 4.6) | https://console.anthropic.com → create a key. Set `ANTHROPIC_API_KEY` in `.env`. Without it, `/api/term-sheet` returns a deterministic demo analysis so the UX still works. |

---

## Roadmap

- **Phase 1 (shipped):** marketing site + Investor-Ready Score MVP + Dilution Calculator (SEO).
- **Phase 1.5 (shipped):** Supabase persistence, Resend transactional email, PDF generator, public Investor View Link with view tracking.
- **Phase 1.6 (shipped):** Score v2 explainability: confidence, missing inputs, benchmark intake, founder actions, Score v2 PDF/share rendering.
- **Phase 2 (shipped v1):** Cap Table Diff (visual before/after), Term Sheet AI with AU market reference and optional dilution simulation.
- **Phase 2.5 (in progress):** Investor analytics v2 light is shipped at `/s/[slug]/activity`; Data Room Checklist is shipped at `/tools/data-room`; next: per-investor links and Term Sheet AI v2 persistence/export.
- **Phase 3:** Cap Table OS, One-Click Data Room, Comparable Companies real data, Stripe/Xero OAuth.
- **Phase 4:** Governance workflows, blockchain audit anchors (Cosmos SDK), private listings.
- **Phase 5+:** Sovereign enterprise chains, marketplace, secondary liquidity. **Deferred until 100 paying customers.**

---

## Go-Live in 30 minutes (operator checklist)

Everything below assumes a fresh Linux VPS with Docker installed and ports 80/443 open.

1. **DNS** — point `A`/`AAAA` for `blockid.au` and `www.blockid.au` at the VPS public IP. Wait until `dig blockid.au @1.1.1.1 +short` returns the IP.
2. **Supabase** — create a Sydney-region project, run `supabase/migrations/0001_init.sql` and `supabase/migrations/0002_score_v2.sql`, copy `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
3. **Resend** — create account, verify `blockid.au` sender domain (add the DKIM/SPF/DMARC records to DNS), copy `RESEND_API_KEY`.
4. **Clone + env** —
   ```bash
   git clone <this-repo> /opt/blockid && cd /opt/blockid/web
   cp .env.example .env
   nano .env   # fill SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
               # RESEND_FROM_EMAIL, IP_HASH_SALT (any 32+ random chars),
               # NEXT_PUBLIC_SITE_URL=https://blockid.au
   ```
5. **Bring up** —
   ```bash
   docker compose build web
   docker compose up -d
   docker compose logs -f caddy   # wait for "certificate obtained for blockid.au"
   ```
6. **Smoke test** — run the cURL block in the section above; everything should be `200 OK` or `204`. Generate a test score from `https://blockid.au/score`, confirm the Resend email arrives, open the share link, verify the PDF downloads.
7. **Updates** — `cd /opt/blockid/web && ./infra/deploy.sh`.

If you skip steps 2 or 3, the site still runs and looks correct, but lead/score persistence and emails will be no-ops (logged to `docker compose logs web`). Wire them as soon as you start paid acquisition.

---

## Notes

- `AGENTS.md` / `CLAUDE.md` in this directory are runtime hints for AI coding agents — they note that `next` here is a newer major than common training data; consult `node_modules/next/dist/docs/` for current APIs before refactoring.
- `design-system/blockid/MASTER.md` is the single source of truth for colour, type, components and anti-patterns. UI changes that contradict it should update MASTER.md first.
- ABN, AU data residency claims, and accelerator logos in the footer/logo cloud are **placeholders / aspirational** until partnerships are signed. Replace before paid acquisition.
