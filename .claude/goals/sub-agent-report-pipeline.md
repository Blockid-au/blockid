# Sub-Goal: Agent-Powered Customer Report Generation

Parent: `goals/ai-agent-ecosystem.md`

## Mission
Synchronize all BlockID AI agent skills with the customer-facing report generation pipeline so that every report purchased by a user benefits from the full enterprise intelligence stack — the same agents that build BlockID also serve its customers.

## Current State
- Reports use 1 AI call per batch (3 batches for 10 pages)
- Tech audit (`deepTechAudit`) and GitHub audit (`auditGitHubRepo`) feed into SVI scoring
- System prompts are static, not enriched by real-time competitive intelligence
- No per-dimension expert analysis from C-Level agents

## Target State
- Each report page is enriched by the relevant C-Level agent's expertise
- Real-time competitive data feeds into Pages 2, 5 (market + competition)
- Financial modeling from CFO feeds into Pages 4, 8 (business + financials)
- SEO/growth intelligence from CMO feeds into Page 6 (traction)
- Tech audit from CTO feeds into Page 3 (product & technology)
- All auto-discovered data populates SVI fields (never leave fields empty)

## Page → Agent Mapping

| R&D Page | Primary Agent | Skills Used | Data Sources |
|----------|--------------|-------------|--------------|
| 1. Executive Summary | COO | `/coo` | All dimension scores, risk penalties |
| 2. Market & Problem | CMO | `/cmo` `/rnd` | Web search, competitor DB, market data |
| 3. Product & Technology | CTO | `/cto` `/security-audit` `/perf-audit` | Tech audit, GitHub audit, code analysis |
| 4. Business Model | CFO | `/cfo` | Pricing benchmark, unit economics model |
| 5. Competition & Moat | CMO + RnD | `/cmo` `/rnd` | Named competitors, feature matrix, threat level |
| 6. Traction & Growth | CRO + CMO | `/cro` `/cmo` `/seo-audit` | Analytics, SEO keywords, funnel data |
| 7. Team & Execution | CPO | `/cpo` | Founder signals, team assessment, domain fit |
| 8. Financial Projections | CFO | `/cfo` | 3-scenario model, funding timeline, unit economics |
| 9. Risk Assessment | CTO + CFO | `/security-audit` `/cfo` | Technical risks, financial risks, market risks |
| 10. Recommendations | All | All skills | Prioritized actions from each C-Level perspective |

## System Prompt Enhancement Strategy

### Current Prompt Structure
```
SYSTEM: You are a startup analyst...
USER: [SVI data] + [scraped data] + [tech hints]
```

### Target Prompt Structure
```
SYSTEM: You are a startup analyst with access to enterprise intelligence...
USER: [SVI data] + [scraped data] + [deep tech audit] + [GitHub repo audit]
      + [competitive intelligence from CMO]
      + [financial benchmarks from CFO]
      + [product maturity signals from CTO]
      + [growth signals from CRO]
```

## Implementation Phases

### Phase 1: Enrich Report Context (Current Sprint)
- [x] Tech audit data feeds into Page 3 context (`deepTechAudit`)
- [x] GitHub audit data feeds into scoring (`auditGitHubRepo`)
- [x] Auto-fill SVI signals from all discovered data
- [x] Pass tech audit + GitHub audit results as context to `generateRndReport()` (buildContext includes techAudit)
- [x] Update system prompts with audit data sections (MENTORING_TONE + AU_COMPLIANCE_NOTE in all 3 prompts)

### Phase 2: Agent-Enriched Pages (Next Sprint)
- [x] Page 2: CMO web search for market data (auto-runs for paid tiers via /api/svi/research) (use Claude `web_search` tool)
- [x] Page 5: CMO competitor profiles (research data injected into buildContext)
- [ ] Page 4: CFO pricing benchmarks from competitor data
- [ ] Page 8: CFO 3-scenario financial model (templated + AI-customized)
- [ ] Page 6: CRO growth recommendations based on SEO/analytics signals

### Phase 3: Full Agent Orchestration (Q4 2026)
- [ ] Each report page has a dedicated agent prompt (10 specialized prompts)
- [ ] Parallel agent execution: 10 agent calls instead of 3 batch calls
- [ ] Real-time competitive intelligence cache (refreshed weekly by CMO cron)
- [ ] Financial model templates pre-computed by CFO (refreshed weekly)
- [x] Customer report quality scoring (coo-report-quality-sample in agent-upgrade cron) (automated QA after generation)

### Phase 4: Premium Agent Reports (Q1 2027)
- [ ] Full Report Premium uses all C-Level agents
- [ ] Interactive report: user can "ask deeper" on any section (costs extra credits)
- [ ] Investor-specific version: tailored for VC/angel audience
- [ ] Benchmark against Carta's similar reports for quality parity

## Report Quality Feedback Loop

```
Customer receives report
  ↓
User rates report (1-5 stars) or provides feedback
  ↓
Feedback stored in report_feedback table
  ↓
Weekly aggregation by /coo
  ↓
Low-rated pages identified
  ↓
Responsible C-Level agent upgrades their prompt/data
  ↓
Next report benefits from improvement
```

## Credit Model Integration

| Report Type | Credits | Agents Used | Avg Cost to BlockID |
|-------------|---------|-------------|---------------------|
| Preview | 0 | None (SVI only) | $0.01 |
| Standard | 1.0 | CTO (tech audit) | $0.08 |
| Deep Dive | 1.5 | CTO + CMO (competitors) | $0.12 |
| Full Standard | 2.0 | CTO + CFO + CMO | $0.18 |
| Full Premium | 5.0 | All C-Levels | $0.30 |
| Evidence Deep Dive | 1.5 | Dimension-specific agent | $0.10 |

**Target gross margin per report: 75%+** (price A$1-5, cost A$0.05-0.30)

## Files to Modify

| File | What Changes |
|------|-------------|
| `web/src/lib/rnd-analysis.ts` | System prompts enriched with agent data context |
| `web/src/app/api/rnd/route.ts` | Pass tech audit + repo audit to `generateRndReport()` |
| `web/src/app/api/svi/full-report/route.ts` | Multi-agent orchestration for premium reports |
| `web/src/lib/ai-client.ts` | Agent-specific model selection (heavier model for premium) |
| `web/src/lib/credits.ts` | Verify credit costs align with agent usage costs |

## Skills Used
All: `/cto` `/cfo` `/cmo` `/cpo` `/cro` `/coo` `/rnd` `/security-audit` `/perf-audit` `/seo-audit` `/analytics` `/prompt-engineer` `/code-reviewer`