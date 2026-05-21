---
name: rnd
description: "AI R&D Agent — research market trends, analyze competitors, propose features, optimize CTAs, run experiments. Use when user says 'research', 'competitor', 'feature idea', 'experiment', or 'A/B test'."
---

# R&D Agent — BlockID.au

AI-powered research and development for platform growth.

## Capabilities

### 1. Market Research (`/rnd market [topic]`)
- WebSearch for Australian startup ecosystem trends
- Analyze funding data, accelerator programs, government grants
- Identify emerging founder pain points
- Output: Structured report with data + recommendations

### 2. Competitor Analysis (`/rnd competitor [name]`)
- Research competitor features, pricing, positioning
- Compare: Carta, Pulley, Qapita, Cake Equity, AngelList
- Identify gaps BlockID can fill
- Output: Feature comparison matrix + positioning strategy

### 3. Feature Proposals (`/rnd feature`)
- Analyze current user behavior from Growth Intelligence data
- Identify most-requested capabilities
- Propose new features ranked by impact + effort
- Output: Feature proposal with user stories + acceptance criteria

### 4. CTA Optimization (`/rnd cta`)
- Analyze current CTAs across all pages
- Research best practices for SaaS conversion
- Propose A/B test variants
- Output: CTA recommendations with expected impact

### 5. Pricing Analysis (`/rnd pricing`)
- Compare BlockID pricing to Australian competitors
- Analyze willingness-to-pay signals from current data
- Propose pricing experiments
- Output: Pricing strategy recommendations

### 6. Website Tech Analysis (`/rnd tech-audit [url]`)
- Run `deepTechAudit()` from `web/src/lib/rnd-input.ts`
- Analyze security posture (SSL, headers, CSP, HSTS)
- Detect tech stack (frameworks, CDN, hosting, analytics, payments)
- Assess performance (TTFB, compression, caching)
- Evaluate product maturity (sitemap, PWA, structured data, login/dashboard)
- Auto-populate SVI evidence fields and trigger rescore
- Output: Full `TechAuditResult` with grades (A-F) and SVI signal boosts

## Execution
1. Always start by fetching current metrics from Growth Intelligence
2. Use WebSearch for external research
3. Cross-reference with internal data (Supabase)
4. Output actionable recommendations with specific numbers

## Auto-Fill & Scoring Integration
When R&D analysis discovers data that maps to SVI scoring fields, it MUST auto-populate:
- Tech audit signals → PTD, SVM, TRE, LCO dimension boosts
- Website presence → `hasWebsite`, `hasProduct` = true
- Login/dashboard detected → `hasDemo` = true
- Payment JS detected → `hasProduct` = true (NOT `hasRevenue` — revenue needs transaction proof)
- Analytics JS detected → `hasAnalytics` = true
- Testimonials/customer logos → `hasCustomers`, `hasSocialProof` = true
- GitHub link discovered → `hasSourceCode` = true, create evidence entry

### GitHub Repo Audit (Enterprise CTO Analysis)
When user connects GitHub, `auditGitHubRepo()` runs deep analysis on the most active repo:
- Architecture: language, TypeScript, frameworks, monorepo, linting, package manager
- Dependencies: notable libs (Prisma, Stripe, AI SDKs), security tools, lock file
- CI/CD: platform, build/test/lint/deploy steps, Docker, infra-as-code
- Testing: frameworks (Jest/Vitest/Playwright), E2E, coverage, maturity grade
- Documentation: README quality, API docs, changelog, license
- Security: SECURITY.md, Dependabot, CodeQL, secrets management
- Activity: commit frequency, contributors, stars, forks, maintenance status
- Creates evidence items for PTD (architecture), FTV (team quality), SVM (tech moat)
- See `.claude/goals/scoring-tech-audit.md` for full scoring rules