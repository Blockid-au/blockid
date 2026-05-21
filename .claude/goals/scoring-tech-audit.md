# Scoring Agent Goal — Deep Website Technology Audit

## Mission
When a user provides a website URL during startup analysis, perform a comprehensive technical audit that feeds directly into the SVI scoring engine. The audit extracts deep tech signals — security posture, performance, infrastructure quality, framework maturity, SSL/TLS, and operational readiness — and auto-populates evidence fields + scores the PTD (Product & Technical Depth) and SVM (Strategic Vision & Moat) dimensions.

## Trigger
- User submits a URL as input to `/api/rnd` or `/api/evidence/connect-url`
- Input type detected as `"url"` by `detectInputType()`

## Deep Tech Analysis Dimensions

### 1. Security Posture (→ PTD + LCO scoring)
- **HTTP Security Headers**: CSP, HSTS, X-Frame-Options, X-Content-Type, Referrer-Policy, Permissions-Policy
- **SSL/TLS**: Certificate validity, issuer, expiry, protocol version (TLS 1.2/1.3)
- **Cookie security**: HttpOnly, Secure, SameSite flags
- **Mixed content**: HTTP resources loaded on HTTPS pages

### 2. Technology Stack Detection (→ PTD scoring)
- **Frontend frameworks**: React, Vue, Angular, Svelte, Next.js, Nuxt, Gatsby, Remix
- **CSS frameworks**: Tailwind, Bootstrap, Material UI, Chakra
- **Backend signals**: Server headers (X-Powered-By, Server), API patterns
- **CMS/Platforms**: WordPress, Shopify, Webflow, Wix, Squarespace
- **CDN**: Cloudflare, AWS CloudFront, Vercel, Fastly, Akamai
- **Analytics/Tracking**: GA4, GTM, Segment, Mixpanel, Amplitude, Hotjar, FullStory
- **Payment**: Stripe, PayPal, Square, Braintree
- **Customer tools**: Intercom, Crisp, Zendesk, Freshdesk, HubSpot
- **CI/CD indicators**: Vercel deployment, Netlify, Railway, Render

### 3. Performance Signals (→ PTD scoring)
- **Response time**: Server TTFB (Time to First Byte)
- **Page weight**: Total HTML size, compressed vs uncompressed
- **Asset optimization**: Minified JS/CSS, image optimization hints
- **Caching**: Cache-Control headers, ETag presence
- **Compression**: gzip/brotli encoding

### 4. Infrastructure Maturity (→ PTD + SVM scoring)
- **DNS**: Proper configuration, DNSSEC hints
- **Hosting provider**: AWS, GCP, Azure, Vercel, Netlify, DigitalOcean
- **High availability signals**: Multiple IPs, load balancer headers
- **API sophistication**: REST endpoints, GraphQL, WebSocket indicators

### 5. Product Maturity Signals (→ PTD + TRE scoring)
- **Sitemap.xml**: Presence and page count
- **robots.txt**: Proper configuration
- **Structured data**: JSON-LD, OpenGraph, Twitter Cards
- **PWA indicators**: manifest.json, service worker
- **Mobile readiness**: Viewport meta tag, responsive hints
- **i18n**: Multiple language support indicators

## Scoring Integration

### Auto-Evidence Creation
For each verified signal, automatically create `svi_evidence` entries:
- `evidence_type`: "tech_audit"
- `confidence_level`: "connected_source" (75%) — machine-verified, not self-declared
- `dimension`: "ptd" (primary) or "svm"/"tre"/"lco" depending on signal type
- `svi_impact`: Calculated based on signal strength

### PTD Score Boost Rules
| Signal | PTD Raw Boost | Condition |
|--------|--------------|-----------|
| Modern framework detected | +5 | React/Vue/Angular/Svelte/Next.js |
| SSL/TLS valid | +3 | Valid certificate, TLS 1.2+ |
| Security headers (3+) | +5 | CSP + HSTS + at least 1 more |
| Fast TTFB (<500ms) | +3 | Server response under 500ms |
| CDN detected | +3 | Cloudflare/CloudFront/Vercel/etc |
| Analytics present | +2 | GA4/GTM/Mixpanel/etc |
| Payment integration | +5 | Stripe/PayPal detected |
| PWA ready | +3 | manifest.json + service worker |
| Sitemap present | +2 | Valid sitemap.xml |
| Mobile-responsive | +2 | Viewport meta present |

### SVM Score Boost Rules
| Signal | SVM Raw Boost | Condition |
|--------|--------------|-----------|
| Custom tech stack (not WordPress/Wix) | +5 | No generic CMS detected |
| API sophistication | +5 | GraphQL or versioned REST |
| Data infrastructure | +3 | Analytics + tracking maturity |

### Risk Signals (Penalties)
| Signal | Penalty | Condition |
|--------|---------|-----------|
| No SSL | -8 PTD | HTTP only or expired cert |
| Generic CMS (Wix/Squarespace) | -3 SVM | Template-based, low technical moat |
| No security headers | -5 PTD | Zero security headers detected |
| Slow TTFB (>2s) | -3 PTD | Poor server performance |

## Auto-Fill Rules

### When tech audit data exceeds minimum requirements, auto-populate:
1. **hasWebsite** → `true` (URL is reachable)
2. **hasProduct** → `true` (if sitemap has 5+ pages or app-like structure detected)
3. **hasDemo** → `true` (if interactive elements detected — forms, dashboards, logins)
4. **hasApp** → `true` (if PWA or app store links detected)
5. **hasAnalytics** → `true` (if GA4/GTM/Mixpanel detected)
6. **hasSourceCode** → check if GitHub/GitLab links found in page
7. **hasSocialProof** → `true` (if social media links + testimonial sections detected)
8. **hasCustomers** → `true` (if customer logos, testimonials, or "trusted by" sections found)
9. **hasRevenue** → infer from payment integration (Stripe detected = at least "early")

### Auto-populate evidence fields:
- Tech stack → evidence label: "Tech: [React, Next.js, Tailwind, ...]"
- Security grade → evidence label: "Security: [A/B/C/D/F]"
- Performance grade → evidence label: "Performance: TTFB [Xms], Page size [Xkb]"
- Infrastructure → evidence label: "Infra: [Vercel/AWS/etc] + CDN: [Cloudflare/etc]"

## Agent Delegation

### Primary Agent: CTO (`/cto`)
- Owns the technical audit implementation
- Delegates to sub-agents:

### Sub-Agent Delegation Chain:
```
/cto → spawns tech audit
  ├── /security-audit    → HTTP headers, SSL, cookie analysis
  ├── /perf-audit        → TTFB, page weight, caching
  ├── /rnd               → Competitor tech comparison
  └── /code-reviewer     → Code quality signals from page source
```

### Cross-Agent Data Flow:
```
URL Input
  ↓
scrapeUrl() [enhanced with deep tech audit]
  ↓
Tech Audit Results (TechAuditResult type)
  ↓
├── extractSignals() ← auto-boost signals from audit
├── computeSVI() ← enhanced PTD/SVM/TRE scores
├── Auto-create svi_evidence entries
└── generateRndReport() ← Page 3 (Product & Technology) enriched with audit data
```

## Implementation Files

| File | Change |
|------|--------|
| `web/src/lib/rnd-input.ts` | `deepTechAudit()` — security, performance, stack, maturity analysis |
| `web/src/lib/github-repo-audit.ts` | `auditGitHubRepo()` — enterprise CTO-level codebase analysis |
| `web/src/lib/svi-analysis.ts` | `extractSignals()` + `computeSVI()` accept tech audit & repo audit data |
| `web/src/app/api/rnd/route.ts` | Wire tech audit into SSE pipeline (parallel with scrape) |
| `web/src/app/api/website-tech-audit/route.ts` | Standalone endpoint for on-demand URL audits |
| `web/src/app/api/oauth/github/callback/route.ts` | Deep repo audit on GitHub connect, creates 4 evidence items |

---

## GitHub Repository Deep Analysis (Enterprise CTO-Level)

### Trigger
- User connects GitHub via OAuth
- `auditGitHubRepo()` runs on the most recently-pushed repo

### Analysis Dimensions

#### 1. Architecture Quality (→ PTD scoring)
- **Language & TypeScript**: Primary language, TypeScript usage, strict mode
- **Framework detection**: Next.js, React, Vue, Express, Django, Rails, Go, Rust, etc.
- **Architecture pattern**: Monorepo (nx/turbo/lerna), microservices, fullstack, monolith
- **Code quality tools**: ESLint, Prettier, Biome, formatting config
- **Package manager**: npm, yarn, pnpm, bun, pip, cargo, go modules

#### 2. Dependency Analysis (→ PTD + SVM scoring)
- **Lock file**: Presence indicates reproducible builds
- **Notable libraries**: Prisma, Supabase, Stripe, Sentry, GraphQL, tRPC, Zod, AI SDKs
- **Security tooling**: Dependabot, Renovate, Snyk
- **Total dependency count**: Production vs dev dependencies

#### 3. CI/CD Maturity (→ PTD scoring)
- **CI platform**: GitHub Actions, GitLab CI, CircleCI, Travis, Jenkins
- **Pipeline completeness**: Build, test, lint, deploy steps
- **Docker**: Dockerfile, docker-compose presence
- **Infrastructure-as-code**: Terraform, Pulumi, CDK, Kubernetes manifests

#### 4. Testing Quality (→ PTD + FTV scoring)
- **Test frameworks**: Jest, Vitest, pytest, Mocha, RSpec
- **E2E testing**: Playwright, Cypress, Selenium
- **Coverage config**: Coverage reporting setup
- **Maturity levels**: none → basic → moderate → comprehensive

#### 5. Documentation (→ PTD scoring)
- **README**: Presence and length (>1000 chars = detailed)
- **API docs**: docs/, openapi, swagger
- **Contributing guide, changelog, license**

#### 6. Security Posture (→ PTD + LCO scoring)
- **SECURITY.md**: Vulnerability disclosure policy
- **Dependabot/CodeQL**: Automated security scanning
- **Secrets management**: .env in .gitignore, .env.example present

#### 7. Activity & Team (→ FTV + TRE scoring)
- **Commit frequency**: intense (20+/week), strong (10+), moderate (5+), light (1+), inactive
- **Contributors**: Team size signal (2+ = co-founder, 3+ = team depth)
- **Stars, forks, watchers**: Community traction
- **Active maintenance**: Pushed within 30 days

### Scoring Rules

#### PTD (Product & Technical Depth) Boost
| Signal | Boost | Condition |
|--------|-------|-----------|
| TypeScript | +3 | tsconfig.json or .ts files |
| Modern framework | +5 | Next.js, React, Vue, etc. |
| Linting + formatting | +3 | ESLint + Prettier/Biome |
| CI/CD pipeline | +5 | GitHub Actions or equivalent |
| Auto-deploy (CD) | +3 | Deploy workflow detected |
| Docker | +2 | Dockerfile present |
| Comprehensive tests | +8 | E2E + unit + coverage |
| Moderate tests | +5 | Unit tests + config |
| Good README | +2 | >1000 chars |
| API docs | +3 | docs/ or openapi spec |
| Monorepo | +3 | nx/turbo/lerna/workspaces |
| Lock file | +1 | Reproducible builds |
| **Penalties** | | |
| No CI/CD | -5 | No automation |
| No tests | -3 | No test framework |
| No README | -2 | No documentation |
| No lock file | -2 | Unreproducible builds |

#### SVM (Strategic Vision & Moat) Boost
| Signal | Boost | Condition |
|--------|-------|-----------|
| Multi-framework stack | +3 | 2+ frameworks |
| Notable enterprise libs | +3 | 3+ notable deps |
| Infra-as-code | +3 | Terraform/Pulumi/K8s |
| Monorepo + frameworks | +2 | Complex architecture |
| AI/ML libraries | +3 | OpenAI, Anthropic, TensorFlow, LangChain |

#### FTV (Founder & Team Value) Boost
| Signal | Boost | Condition |
|--------|-------|-----------|
| TypeScript + linting + CI | +5 | Engineering discipline |
| 3+ contributors | +3 | Team size |
| Comprehensive testing | +3 | Test maturity |
| Security scanning | +2 | Dependabot/CodeQL |
| Contributing guide | +1 | Team collaboration |
| **Penalties** | | |
| Inactive repo | -3 | No recent activity |
| JS without TS | -1 | Technical debt signal |

#### TRE (Traction & Revenue Evidence) Boost
| Signal | Boost | Condition |
|--------|-------|-----------|
| Intense commits (20+/week) | +5 | Very active development |
| Strong commits (10+/week) | +3 | Active development |
| 100+ stars | +3 | Community traction |
| 10+ forks | +2 | Adoption signal |
| Actively maintained | +2 | Pushed within 30 days |

### Overall Grade (A-F)
Weighted composite of: Architecture (25pts) + CI/CD (20pts) + Testing (15pts) + Documentation (10pts) + Security (10pts) + Activity (20pts)
- **A** (70+): Enterprise-grade engineering
- **B** (50-69): Professional engineering
- **C** (35-49): Developing engineering
- **D** (20-34): Early-stage engineering
- **F** (<20): Pre-engineering

### Evidence Items Created (per GitHub connect)
1. **PTD**: `github_repo_audit` — architecture, CI/CD, testing score
2. **FTV**: `github_repo_audit` — engineering team quality (if boost > 0)
3. **SVM**: `github_repo_audit` — tech moat (if boost > 0)
4. **TRE**: `github` — commit activity traction (existing, from basic OAuth)

---

## Success Criteria
- [x] Website URL → deep tech analysis in <8 seconds
- [x] Auto-populates 5+ SVI signals from tech audit
- [x] Creates evidence entries with "connected_source" confidence
- [x] PTD score reflects actual technical maturity
- [x] SVM score penalizes generic CMS, rewards custom tech
- [ ] R&D report Page 3 shows detailed tech audit data
- [x] No false positives on payment/revenue detection (Stripe on page ≠ confirmed revenue)
- [x] GitHub connect → enterprise CTO-level repo analysis
- [x] Repo audit creates up to 3 additional evidence items (PTD, FTV, SVM)
- [x] Architecture, CI/CD, testing, dependencies, security all scored
- [x] `extractSignals()` and `computeSVI()` consume repo audit boosts
- [ ] R&D report reflects repo audit data in Page 3 and Page 7
