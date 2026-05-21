# Goal: BlockID.au Full Self-Analysis (Case 3 — admin@blockid.au)

## Objective
Create the most comprehensive SVI analysis possible for BlockID.au itself — using ALL available data from the codebase, git history, database, documentation, and live production metrics. This serves as both the ultimate dog-fooding test AND a real investor-ready report.

## Why This Matters
1. Proves the platform works on a REAL, complex project
2. Creates a showcase report for investors/partners
3. Identifies actual gaps in BlockID's own business
4. Generates the definitive self-assessment visible at /admin/self-analysis

## Sub-Goals

### SG-1: Gather ALL evidence from the codebase [P0]
- Count exact: TS files, pages, API routes, DB tables, migrations, tests
- Read git log for commit history, contributors, velocity
- Read package.json for dependencies count
- Read PRD for business metrics
- Calculate AI cost from ai-client budget tracking
- Extract Stripe price IDs as revenue evidence

### SG-2: Upload evidence to Evidence Vault [P0]
- Website URL: https://blockid.au (public_url, 35%)
- Git repository: https://git.longcare.au (connected_source, 75%)
- PRD document summary (document, 50%)
- Architecture doc summary (document, 50%)
- API reference summary (document, 50%)
- Stripe Live configuration (transaction_data, 90%)
- ABN/ASIC registration (document, 50%)
- Production deployment proof (connected_source, 75%)
- 62 unit tests passing (connected_source, 75%)
- 5 cron jobs active (connected_source, 75%)

### SG-3: Run comprehensive SVI with maximum detail [P0]
- Include ALL signals: revenue model, team, market, product, legal, vision
- Reference specific numbers from the codebase
- Include competitive landscape
- Include business model details

### SG-4: Generate full 10-page AI report [P0]
- Trigger /api/svi/report with the comprehensive analysis
- Save to DB for display in dashboard

### SG-5: Create SVI account + snapshots [P0]
- Ensure svi_account exists with correct stage + SVI
- Create initial snapshot for weekly tracking
- Set up milestone badges earned

### SG-6: Update /admin/self-analysis with live data [P1]
- Pull from actual DB data, not hardcoded
- Show real evidence items
- Show real SVI dimensions
- Show real risk penalties + actions

### SG-7: Share report via email + Drive [P1]
- Email full report to admin@blockid.au
- Upload report to Google Drive
- Create shareable link /s/{slug}

## Success Criteria
- SVI score reflects actual project state (not inflated)
- All 8 dimensions scored with real evidence
- Evidence vault has 10+ items with mixed confidence levels
- AI report is genuinely useful for the founder
- Share link works for external viewing
- Admin self-analysis page shows all data correctly