# BlockID.au — Agent-Skill Delegation Map

## C-Level Agent → Skill Assignments

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CEO (Human)                                   │
│        Strategic direction, investor relations, final decisions       │
├─────────┬──────────┬──────────┬──────────┬──────────┬───────────────┤
│   CTO   │   CPO    │   CMO    │   CFO    │   COO    │     CRO       │
│ Tech    │ Product  │ Growth   │ Finance  │ Ops      │ Revenue       │
├─────────┼──────────┼──────────┼──────────┼──────────┼───────────────┤
│Skills:  │Skills:   │Skills:   │Skills:   │Skills:   │Skills:        │
│nextjs-* │ui-ux-pro │seo-audit │stripe-t  │deploy    │analytics      │
│ts-pro   │analytics │publish   │analytics │qa        │cmo (content)  │
│react-ex │rnd       │cmo       │perf-aud  │qa-lead   │ui-ux-pro      │
│api-dsgn │qa        │analytics │db-migr   │devops    │stripe-test    │
│arch-dsgn│nextjs-*  │rnd       │postgres  │code-rev  │rnd            │
│postgres │prompt-eng│media     │          │test-mast │               │
│db-migr  │          │investor  │          │fullstack │               │
│secure-* │          │          │          │security  │               │
│secure-* │          │          │          │          │               │
│debug-wiz│          │          │          │          │               │
│devops   │          │          │          │          │               │
│fullstack│          │          │          │          │               │
│code-rev │          │          │          │          │               │
│test-mast│          │          │          │          │               │
│deploy   │          │          │          │          │               │
│perf-aud │          │          │          │          │               │
│sec-audit│          │          │          │          │               │
└─────────┴──────────┴──────────┴──────────┴──────────┴───────────────┘
```

## Goal Hierarchy

```
Company Goal: Transform BlockID.au into the #1 startup valuation platform in Australia
│
├── CTO Goal: Ship reliable, secure, performant platform across 8 phases
│   ├── Sub: Zero-downtime deploys, <100ms p95, WCAG AAA compliance
│   └── KPIs: Deploy frequency, bug escape rate, uptime %, API latency
│
├── CPO Goal: Maximize user value through evidence-backed product decisions
│   ├── Sub: Feature adoption >60%, onboarding completion >70%, NPS >50
│   └── KPIs: Feature adoption, activation rate, time-to-value, NPS
│
├── CMO Goal: Drive 1000+ SVI analyses/month through organic + content
│   ├── Sub: SEO traffic +50%/month, 30+ articles, GSC indexed, GA4 tracking
│   └── KPIs: Organic traffic, SVI completions, lead capture, content velocity
│
├── CFO Goal: Achieve A$10K MRR with sustainable unit economics
│   ├── Sub: CAC < A$50, LTV:CAC > 3:1, AI cost < 5% revenue
│   └── KPIs: MRR, ARR, CAC, LTV, burn rate, runway, AI cost per analysis
│
├── COO Goal: Ship every sprint on-time with 95% quality
│   ├── Sub: Sprint velocity stable, zero critical bugs in prod, CI/CD green
│   └── KPIs: Sprint completion %, deploy success rate, MTTR, velocity
│
└── CRO Goal: 10% free-to-paid conversion, <5% monthly churn
    ├── Sub: Funnel optimization, email nurture, retention loops
    └── KPIs: Conversion rate, churn, expansion revenue, NRR, activation
```