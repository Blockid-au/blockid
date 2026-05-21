# Platform Listing & Investor Outreach Strategy

## Mission
Research, select, and create profiles on high-impact startup directories, investor
networks, accelerator platforms, and fundraising marketplaces. Automate profile
updates and leverage these channels to attract investors, mentors, and strategic
partners to BlockID.au.

## Owner Matrix

| Role | Responsibility | Priority |
|------|---------------|----------|
| **CMO** | Platform research, listing creation, content optimization, SEO backlinks | Lead |
| **IR (Investor Relations)** | Investor network profiles, accelerator applications, fundraise listings | Co-lead |
| **CRO** | Conversion tracking from listings, referral attribution, funnel analysis | Support |
| **CTO** | API integrations, auto-update webhooks, profile sync automation | Support |
| **CEO** | Final approval on profiles, personal founder profiles, introductions | Approve |

---

## Sub-Goal 1: Platform Research & Selection
**Owner:** CMO + IR | **Deadline:** 2026-06-07 (2 weeks)

### Tier 1 — Must-Have (High Authority, High ROI)
| Platform | Type | Cost | Est. Impact | Status |
|----------|------|------|-------------|--------|
| [Product Hunt](https://www.producthunt.com) | Product launch | Free | High traffic spike, backlinks, credibility | TODO |
| [AngelList / Wellfound](https://wellfound.com) | Investor + hiring | Free | Investor discovery, talent pipeline | TODO |
| [Crunchbase](https://www.crunchbase.com) | Company profile | Free (basic) | Investor research, media mentions | TODO |
| [LinkedIn Company Page](https://linkedin.com) | Professional network | Free | Founder credibility, B2B reach | IN PROGRESS |
| [Startmate Directory](https://www.startmate.com.au) | AU accelerator | Apply | Top AU accelerator, $120K for 7.5% | PLANNED |
| [Antler](https://www.antler.co) | Global accelerator | Apply | Pre-seed, co-founder matching | PLANNED |

### Tier 2 — High Value (Strategic Networks)
| Platform | Type | Cost | Est. Impact | Status |
|----------|------|------|-------------|--------|
| [F6S](https://www.f6s.com) | Startup profile + grants | Free | Grant/accelerator discovery | TODO |
| [Gust](https://gust.com) | Investor matching | Free | Angel investor network | TODO |
| [Startup Grind](https://www.startupgrind.com) | Community + directory | Free/Paid | Events, mentorship | TODO |
| [BetaList](https://betalist.com) | Beta launch | Free (queue) | Early adopter traffic | TODO |
| [G2](https://www.g2.com) | SaaS reviews | Free listing | Enterprise credibility | TODO |
| [Capterra](https://www.capterra.com.au) | SaaS directory | Free listing | AU enterprise discovery | TODO |

### Tier 3 — Australia-Specific
| Platform | Type | Cost | Est. Impact | Status |
|----------|------|------|-------------|--------|
| [StartupAUS](https://startupaus.org) | AU ecosystem | Free | Policy, community | TODO |
| [Stone & Chalk](https://www.stoneandchalk.com.au) | Fintech hub | Membership | Fintech credibility, Sydney events | TODO |
| [LaunchVic](https://launchvic.org) | VIC grants | Apply | Government funding | TODO |
| [NSW Innovation](https://www.investment.nsw.gov.au) | NSW grants | Apply | Government funding, MVP to Scale | TODO |
| [ACS Incubator](https://www.acs.org.au) | Tech community | Membership | Tech credibility, AU network | TODO |
| [Fishburners](https://fishburners.org) | Co-working + community | Membership | Sydney startup community | TODO |

### Tier 4 — Investor-Specific Platforms
| Platform | Type | Cost | Est. Impact | Status |
|----------|------|------|-------------|--------|
| [PitchBook](https://pitchbook.com) | Investor research | Paid | VC discovery, due diligence | TODO |
| [Deal Room](https://www.dealroom.co) | EU/AU investor | Free profile | European VC exposure | TODO |
| [Microryza / Experiment](https://experiment.com) | Crowdfunding | Free | Research-driven funding | EVALUATE |
| [Republic](https://republic.com) | Equity crowdfunding | Apply | Community fundraising | EVALUATE |
| [Birchal](https://www.birchal.com) | AU equity crowdfund | Apply | AU crowd equity (ASIC regulated) | EVALUATE |

---

## Sub-Goal 2: Profile Creation & Optimization
**Owner:** CMO | **Deadline:** 2026-06-21 (4 weeks)

### Standard Profile Template
Every listing must include:
- **Company name:** BlockID.au (Auschain PTY LTD)
- **Tagline:** "The agentic AI valuation platform for business growth from day one"
- **Description:** 150/300/1000 word versions (short/medium/long)
- **Logo:** Logo icon (transparent) + full logo
- **Founded:** 2023
- **Location:** Sydney, NSW, Australia
- **Industry:** SaaS, AI/ML, FinTech, Startup Tools
- **Stage:** Pre-seed / Validation
- **Team size:** 1 founder + AI agent team
- **Website:** https://blockid.au
- **Key metrics:** 50+ founders, 200+ analyses, $2M+ valuations tracked
- **Social links:** LinkedIn, GitHub
- **Founder:** Do Van Long — CEO & Founder

### Profile Quality Checklist
- [ ] All mandatory fields completed
- [ ] High-res logo uploaded (PNG, min 500x500)
- [ ] Video embed linked (YouTube demo)
- [ ] 3+ screenshots of product
- [ ] Metrics up-to-date (pull from GA4 + Supabase)
- [ ] SEO keywords in description
- [ ] Backlink to blockid.au active

---

## Sub-Goal 3: Auto-Update & Sync System
**Owner:** CTO | **Deadline:** 2026-07-15 (8 weeks)

### Phase 1 — Manual Updates (Week 1-2)
- CMO manually creates/updates profiles monthly
- Track all credentials in 1Password/Bitwarden vault
- Spreadsheet tracking: platform, URL, last updated, metrics

### Phase 2 — Semi-Automated (Week 3-4)
- Create `/api/platform-stats` endpoint returning live metrics:
  ```json
  {
    "founders": 50,
    "analyses": 200,
    "valuationsTracked": "$2M+",
    "tools": 10,
    "articles": 31,
    "monthlyVisitors": 500
  }
  ```
- CMO uses this to quickly update platforms monthly

### Phase 3 — Full Automation (Week 5-8)
- Crunchbase API integration (auto-update funding, metrics)
- AngelList/Wellfound API (auto-sync jobs, company info)
- LinkedIn API (auto-post updates, metrics)
- Product Hunt API (upcoming launch scheduling)
- Build internal dashboard at `/workspace/listings` showing all profiles + freshness

---

## Sub-Goal 4: Accelerator & Grant Applications
**Owner:** IR + CEO | **Deadline:** Rolling

### Application Calendar

| Program | Deadline | Investment | Equity | Priority |
|---------|----------|-----------|--------|----------|
| Startmate Accelerator | Rolling / Aug 2026 | A$120K | 7.5% | HIGH |
| Antler Australia | Jul 2026 cohort | A$100K | ~10% | HIGH |
| Google for Startups AU | Varies | Benefits only | 0% | MEDIUM |
| Techstars (any track) | Rolling | $120K USD | 6% | MEDIUM |
| Y Combinator | Batch deadline | $500K USD | 7% | LOW (stage too early) |
| NSW MVP to Scale | Quarterly | A$25K-$100K grant | 0% | HIGH |
| ATO R&D Tax Incentive | Annual (Apr) | 43.5% refund | 0% | HIGH |
| Export Market Dev Grant | Biannual | Up to A$150K | 0% | MEDIUM |

### Application Readiness Tracker
| Requirement | Status | Owner |
|-------------|--------|-------|
| Pitch deck v1 (12 slides) | IN PROGRESS | IR |
| 2-min product demo video | DONE (YouTube) | Media Studio |
| Financial model (3-year) | TODO | CFO |
| Data room (6 sections) | IN PROGRESS | IR |
| Metrics dashboard (live) | PARTIAL | CTO |
| Founder bio + LinkedIn | IN PROGRESS | CEO |
| Customer testimonials (3+) | TODO | CRO |
| Company registration (ASIC) | DONE | CLO |

---

## Sub-Goal 5: Investor Network Building
**Owner:** IR + CEO | **Deadline:** Rolling

### Target Investor Categories
1. **Angel investors** — AU-based, fintech/SaaS focus, $25K-$100K tickets
2. **Micro VCs** — AU seed funds ($500K-$2M), e.g. Blackbird Ventures, Airtree
3. **Accelerator funds** — Startmate, Antler, Techstars associated
4. **Strategic investors** — Accounting firms, legal tech, equity management platforms
5. **International** — Singapore (SEA exposure), US (scale capital)

### Outreach Timeline

| Week | Action | Owner | Target |
|------|--------|-------|--------|
| W1 (Jun 2-8) | Research top 50 AU angel investors | IR | List created |
| W2 (Jun 9-15) | Create AngelList + Crunchbase profiles | CMO | Profiles live |
| W3 (Jun 16-22) | Product Hunt launch prep (teaser page) | CMO + CTO | Teaser live |
| W4 (Jun 23-29) | Submit Startmate application | IR + CEO | Submitted |
| W5 (Jul 1-7) | LinkedIn outreach (20 investors) | CEO | 20 messages sent |
| W6 (Jul 8-14) | Submit Antler application | IR + CEO | Submitted |
| W7 (Jul 15-21) | Product Hunt launch day | CMO + all | Launched |
| W8 (Jul 22-28) | Follow-up warm intros from PH | CEO | 10+ conversations |
| W9 (Aug 1-7) | NSW Innovation grant application | IR + CFO | Submitted |
| W10 (Aug 8-14) | First investor update email | IR | Sent to 50+ contacts |
| W11 (Aug 15-21) | Pitch practice + feedback rounds | CEO + IR | 5 practice pitches |
| W12 (Aug 22-31) | R&D Tax Incentive prep (for Apr 2027) | CFO + CLO | Docs started |

### Warm Intro Strategy
1. **LinkedIn 2nd-degree connections** — Map CEO's network for VC connections
2. **Startmate alumni network** — If accepted, leverage 400+ founder network
3. **Fishburners/Stone & Chalk events** — Monthly pitch nights
4. **Founder communities** — Startup Daily, Blackbird Giants, StartupAUS Slack

---

## Sub-Goal 6: Content & PR for Platform Visibility
**Owner:** CMO | **Deadline:** Ongoing

### PR Target Publications
| Publication | Type | Approach |
|-------------|------|----------|
| Startup Daily | AU startup media | Press release + demo |
| SmartCompany | AU business | Founder story angle |
| Startup Grind (local chapter) | Community | Speaker application |
| Hacker News | Tech community | Show HN post |
| r/startups, r/SaaS | Reddit | Community post |
| Indie Hackers | Bootstrapper community | Building in public |
| Twitter/X (#buildinpublic) | Social | Weekly build updates |

### Content Calendar for Listings
| Week | Content Piece | Distribution | Owner |
|------|--------------|-------------|-------|
| W1 | "Why we built BlockID" founder story | LinkedIn, Medium | CEO |
| W2 | Product demo video post | LinkedIn, Twitter | CMO |
| W3 | "SVI explained" educational post | Blog, LinkedIn | CMO |
| W4 | Accelerator application announcement | LinkedIn | CEO |
| W5 | Customer case study #1 | Blog, Product Hunt | CRO |
| W6 | "Building with AI agents" technical post | Hacker News, Dev.to | CTO |
| W7 | Product Hunt launch post | All channels | ALL |
| W8 | Launch results retrospective | LinkedIn, Blog | CMO |

---

## Success Metrics

| Metric | Current | Month 1 | Month 2 | Month 3 |
|--------|---------|---------|---------|---------|
| Profiles created | 1 (LinkedIn) | 6 | 10 | 15+ |
| Backlinks from listings | 0 | 5 | 12 | 20+ |
| Investor conversations | 0 | 3 | 10 | 20+ |
| Accelerator apps submitted | 0 | 1 | 3 | 4 |
| Referral traffic from listings | 0% | 5% | 10% | 15% |
| Product Hunt upvotes | — | — | Launch: 100+ | — |
| Warm intros received | 0 | 2 | 5 | 10+ |

---

## Dependencies
- Pitch deck v1 (see `pitch-deck-v1.md`)
- Demo video (see `video-production-plan.md`)
- Data room (see `data-room-structure.md`)
- Financial model (see `cfo-goals.md`)
- Accelerator applications (see `accelerator-applications.md`)

## Skills Used
- `/cmo` — Platform research, SEO, content
- `/investor-relations` — Investor profiles, accelerator apps
- `/cro` — Conversion tracking from listings
- `/cto` — API integrations, auto-sync
- `/rnd` — Competitor platform analysis