# BlockID.au Organizational Chart

## Mission
Build and scale BlockID.au as Australia's leading agentic AI valuation platform — from Day 0 idea to exit — with a lean, AI-augmented org structure where each C-level role is agent-assisted.

## Hierarchy

```
Founder & CEO: Do Van Long
├── COO — Chief Operating Officer
│   ├── Sprint Master (sprint planning, velocity tracking)
│   ├── DevOps Lead (CI/CD, infra, monitoring)
│   └── QA Lead (testing, regression, acceptance)
│
├── CTO — Chief Technology Officer
│   ├── Frontend Lead (Next.js, React, UI components)
│   ├── Backend Lead (API routes, Supabase, integrations)
│   ├── AI/ML Lead (Claude API, scoring models, NLP)
│   └── Security Lead (auth, OWASP, pen testing)
│
├── CMO — Chief Marketing Officer
│   ├── SEO Specialist (technical SEO, content optimization)
│   ├── Content Lead (blog, insights, thought leadership)
│   ├── Social & Community Lead (LinkedIn, founder communities)
│   └── Growth Analyst (GA4, funnel metrics, A/B tests)
│
├── CFO — Chief Financial Officer
│   ├── Revenue Analyst (Stripe metrics, MRR/ARR tracking)
│   ├── Cost Controller (AI spend, infra costs, burn rate)
│   └── Compliance Lead (ASIC, tax, ESIC, financial reporting)
│
├── CPO — Chief Product Officer
│   ├── UX Researcher (user interviews, usability testing)
│   ├── Product Designer (design system, prototyping)
│   ├── Data Analyst (product analytics, cohort analysis)
│   └── Feature PM (roadmap prioritization, specs)
│
└── CRO — Chief Revenue Officer
    ├── Conversion Specialist (funnel optimization, CRO experiments)
    ├── Retention Lead (churn prevention, engagement loops)
    ├── Partnerships Lead (accelerators, VCs, ecosystem)
    └── Sales Ops (pricing, upsell, enterprise pipeline)
```

## Role Registry

| ID | Role | Reports To | Status | Phase Ownership | Mapped Skills |
|----|------|-----------|--------|----------------|---------------|
| CEO-001 | Founder & CEO | — | Active | All phases | Strategic direction, vision, fundraising |
| COO-001 | Chief Operating Officer | CEO | Active | All phases (execution) | `/coo` — sprint planning, coordination |
| COO-002 | Sprint Master | COO | Active | All phases | Sprint velocity, backlog grooming |
| COO-003 | DevOps Lead | COO | Active | Phase 2-5 | `/deploy` — CI/CD, Docker, GCP |
| COO-004 | QA Lead | COO | Active | All phases | `/qa` — testing, regression |
| CTO-001 | Chief Technology Officer | CEO | Active | Phase 1-5 | Engineering, architecture, security |
| CTO-002 | Frontend Lead | CTO | Active | Phase 2-4 | Next.js, React, Tailwind |
| CTO-003 | Backend Lead | CTO | Active | Phase 2-5 | Supabase, API routes, Edge Functions |
| CTO-004 | AI/ML Lead | CTO | Active | Phase 1-3 | `/claude-api` — Claude, scoring models |
| CTO-005 | Security Lead | CTO | Active | Phase 3-6 | `/security-audit` — OWASP, auth, RLS |
| CMO-001 | Chief Marketing Officer | CEO | Active | Phase 2-6 | `/cmo` — SEO, content, campaigns |
| CMO-002 | SEO Specialist | CMO | Active | Phase 2-4 | `/seo-audit` — technical SEO |
| CMO-003 | Content Lead | CMO | Active | Phase 2-6 | Blog, insights, visual content |
| CMO-004 | Social & Community Lead | CMO | Planned | Phase 3-6 | LinkedIn, community management |
| CMO-005 | Growth Analyst | CMO | Active | Phase 2-6 | `/analytics` — GA4, funnel analysis |
| CFO-001 | Chief Financial Officer | CEO | Active | Phase 3-7 | `/cfo` — revenue, pricing, costs |
| CFO-002 | Revenue Analyst | CFO | Active | Phase 3-7 | Stripe metrics, MRR/ARR |
| CFO-003 | Cost Controller | CFO | Active | Phase 2-7 | AI spend, infra costs, burn rate |
| CFO-004 | Compliance Lead | CFO | Planned | Phase 4-7 | ASIC, tax, ESIC compliance |
| CPO-001 | Chief Product Officer | CEO | Active | Phase 1-6 | Product strategy, UX, research |
| CPO-002 | UX Researcher | CPO | Active | Phase 2-4 | User interviews, usability testing |
| CPO-003 | Product Designer | CPO | Active | Phase 2-5 | `/ui-ux-pro-max` — design system |
| CPO-004 | Data Analyst | CPO | Active | Phase 2-6 | `/analytics` — cohort, retention |
| CPO-005 | Feature PM | CPO | Active | Phase 2-5 | Roadmap, specs, prioritization |
| CRO-001 | Chief Revenue Officer | CEO | Active | Phase 3-7 | `/cro` — conversion, retention |
| CRO-002 | Conversion Specialist | CRO | Active | Phase 3-6 | Funnel optimization, A/B tests |
| CRO-003 | Retention Lead | CRO | Planned | Phase 4-7 | Churn prevention, engagement |
| CRO-004 | Partnerships Lead | CRO | Planned | Phase 5-7 | Accelerators, VCs, ecosystem |
| CRO-005 | Sales Ops | CRO | Planned | Phase 6-7 | Enterprise pipeline, upsell |

## Communication Protocol

- **CEO <-> C-levels**: Weekly sync (Monday), async via goal files
- **C-level <-> Reports**: Daily standup (automated), sprint reviews
- **Cross-team**: Sprint planning (bi-weekly), retrospectives
- **Escalation path**: Report -> C-level -> CEO (within 24h for blockers)

## Decision Authority

| Decision Type | Authority | Escalation |
|--------------|-----------|------------|
| Sprint task prioritization | COO | CEO if cross-team conflict |
| Technical architecture | CTO | CEO if budget impact >$500 |
| Content publishing | CMO | CEO if brand-sensitive |
| Pricing changes | CFO + CRO | CEO always |
| Feature ship/kill | CPO | CEO if revenue impact |
| Partnership deals | CRO | CEO if >$5K commitment |
