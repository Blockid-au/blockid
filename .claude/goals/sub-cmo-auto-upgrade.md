# Sub-Goal: CMO Auto-Upgrade — Continuous Market Dominance

Parent: `goals/ai-agent-ecosystem.md`

## Mandate
The CMO agent MUST continuously benchmark BlockID's market presence, SEO authority, content quality, and brand positioning against competitors and automatically create/optimize content and marketing strategies.

## Standing Orders

### 1. SEO Dominance Engine (weekly)
- `/cmo` + `/seo-audit` → Audit blockid.au technical SEO
- Track keyword rankings for 150 target keywords
- Identify content gaps vs competitors (Carta blog, Pulley resources)
- Auto-generate SEO-optimized article briefs for top opportunities
- Monitor Core Web Vitals impact on rankings

### 2. Competitive Content Intelligence (bi-weekly)
- `/rnd competitor` → Analyze competitor content strategies
- Track: What topics Carta/Pulley/AngelList publish about
- Identify thought leadership gaps BlockID can fill
- Monitor competitor social media engagement patterns
- Propose content calendar updates based on competitive gaps

### 3. Brand Positioning Audit (monthly)
- Compare BlockID messaging vs competitors:
  - Carta: "Equity management for growing companies"
  - Pulley: "Cap table management made easy"
  - BlockID: "AI-first startup valuation for Australian founders"
- Test messaging variants via A/B landing pages
- Track brand mention sentiment across social media
- Propose positioning adjustments based on market feedback

### 4. Content Quality Escalation (ongoing)
- Every blog post must meet minimum quality bar:
  - 2000+ words, 5+ internal links, structured data, original research
  - SEO score > 80 (keyword density, readability, meta optimization)
- Auto-audit existing content for staleness (>90 days without update)
- Propose content refresh cycles based on traffic decay patterns

### 5. Customer Report Contribution
When generating customer reports, the CMO skill contributes:
- **Page 2 (Market & Problem)**: Market size research, timing analysis, validation
- **Page 5 (Competition & Moat)**: Named competitor profiles with URLs, strengths/weaknesses
- **Page 6 (Traction & Growth)**: SEO keywords, social strategy, growth tactics
- **Deep Dive extended sections**: Detailed competitor intelligence with funding data
- **Evidence Analysis**: Market research documents, pitch deck content analysis

## Auto-Upgrade Triggers

| Trigger | Action | Agent Chain |
|---------|--------|-------------|
| Keyword ranking drop (>5 positions) | Content refresh + technical SEO fix | /cmo + /seo-audit + /cto |
| Competitor publishes on our topic | Counter-content within 48h | /cmo + /rnd |
| Traffic below weekly target | Emergency content push + social amplification | /cmo + /publish |
| New feature launched | Feature announcement blog + social campaign | /cmo + /cpo + /media-studio |
| Organic traffic milestone hit | Case study + PR outreach | /cmo + /investor-relations |
| Email open rate < 25% | Subject line A/B test, re-segment list | /cmo + /cro |

## Implementation Tasks
- [x] Weekly content performance tracking (cmo-content-performance task) (Google Search Console API)
- [x] Competitor research (rnd-competitor-research weekly cron)
- [x] Brand monitoring: included in rnd-competitor-research weekly (mentions Carta/Pulley)
- [x] /api/admin/marketing-health endpoint (users, analyses, articles, emails) (traffic, rankings, content pipeline)
- [x] /api/admin/marketing-health implemented endpoint
- [x] Feed CMO research into R- [ ] Integration: Feed CMO research into R&D report Pages 2, 5, 6D report (competitive research auto-injected in buildContext)
- [x] Content briefs: cmo-content-performance tracks pipeline + AI suggests topics from keyword gap analysis
- [x] Auto-publish: publish-insight cron publishes scheduled articles from `/publish` skill on schedule

## Skills Used
`/cmo` `/seo-audit` `/rnd` `/publish` `/analytics` `/media-studio` `/prompt-engineer`