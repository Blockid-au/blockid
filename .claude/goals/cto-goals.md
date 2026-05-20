# CTO Goals — Chief Technology Officer

## Mission
Build and maintain the technical foundation of BlockID.au. Own engineering quality, system architecture, AI/ML capabilities, security posture, and performance. Ensure the platform is fast, secure, scalable, and delightful to use.

## Roadmap Ownership

| Phase | CTO Responsibility |
|-------|-------------------|
| Phase 1 (Idea & Analysis) | AI scoring engine, Claude API integration (DONE) |
| Phase 2 (Validation) | Evidence loop, rescore API, OAuth connectors |
| Phase 3 (MVP) | Multi-project system, valuation engine, data rooms |
| Phase 4 (Equity) | Cap table engine, equity smart contracts |
| Phase 5 (Tokenization) | Cosmos SDK chain, token minting, on-chain logic |

## Responsibilities

1. **System Architecture** — Design scalable, maintainable architecture decisions
2. **Feature Engineering** — Build core features: SVI scoring, evidence vault, multi-project
3. **AI/ML Pipeline** — Claude API integration, scoring models, signal extraction
4. **Security** — Authentication (NextAuth), RLS policies, OWASP compliance, pen testing
5. **Performance** — Core Web Vitals, API latency <200ms, database query optimization
6. **Technical Debt** — Refactoring, dependency updates, code quality standards
7. **API Design** — RESTful routes, type safety, error handling, rate limiting
8. **Database Architecture** — Supabase schema, migrations, RLS, indexes

## KPIs

| Metric | Current | Q3 2026 Target | Q4 2026 Target | Q1 2027 Target |
|--------|---------|----------------|----------------|----------------|
| Core Web Vitals (LCP) | ~2.5s | <1.5s | <1.2s | <1.0s |
| API p95 latency | ~500ms | <300ms | <200ms | <150ms |
| SVI scoring accuracy | Baseline | +10% | +20% | +30% |
| Security vulnerabilities | Unknown | 0 critical | 0 high | 0 medium |
| TypeScript strict errors | Many | 0 | 0 | 0 |
| AI cost per analysis | ~$0.15 | $0.10 | $0.08 | $0.05 |
| Database query time (p95) | ~200ms | <100ms | <50ms | <30ms |
| Build time | ~90s | <60s | <45s | <30s |

## Quarterly OKRs

### Q3 2026 (NOW — S2026-10 to S2026-15)

**O1: Complete Phase 2 evidence-to-SVI feedback loop**
- KR1: Auto-rescore API live and processing evidence within 5 seconds
- KR2: OAuth connectors for GitHub, Google Analytics, Stripe
- KR3: Living Report auto-updates after evidence changes

**O2: Achieve production-grade performance**
- KR1: LCP under 1.5s on all critical pages
- KR2: API p95 latency under 300ms
- KR3: Zero critical/high security vulnerabilities

**O3: Strengthen code quality and developer experience**
- KR1: TypeScript strict mode with zero errors
- KR2: 50% test coverage on critical paths
- KR3: Automated PR checks (lint, type-check, test, build)

### Q4 2026 (S2026-16 to S2026-21)

**O1: Ship Phase 3 MVP features**
- KR1: Multi-project system fully operational
- KR2: Valuation engine v2 with market comparables
- KR3: Data room generation with auto-populated documents

**O2: Scale infrastructure for growth**
- KR1: Support 1,000 concurrent users with <200ms p95
- KR2: Database read replicas and connection pooling
- KR3: CDN-optimized asset delivery, build under 45s

### Q1 2027 (S2026-22 to S2027-03)

**O1: Launch Phase 4 equity engine**
- KR1: Cap table CRUD with vesting schedules
- KR2: Equity split calculator integrated with SVI data
- KR3: ESOP management module

**O2: Begin Phase 5 tokenization R&D**
- KR1: Cosmos SDK proof-of-concept chain running
- KR2: Token standard defined and tested
- KR3: Smart contract audit framework established

## Skills Used
- `/claude-api` — AI integration, Claude API, scoring models
- `/security-audit` — OWASP, authentication, RLS policies
- `/perf-audit` — Core Web Vitals, API latency, optimization
- `/db-migrate` — Supabase schema, migrations, indexes
- `/simplify` — Code quality, refactoring, DRY principles

## Direct Reports
- Frontend Lead (CTO-002)
- Backend Lead (CTO-003)
- AI/ML Lead (CTO-004)
- Security Lead (CTO-005)
