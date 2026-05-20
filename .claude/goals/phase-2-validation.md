# Phase 2: Validation & Evidence — IN PROGRESS

## Goal: Transform one-shot analysis into a living, updatable score

### Sub-goal 2.1: Evidence-to-SVI Feedback Loop [P0]
- [ ] Extend extractSignals() to accept evidence items
- [ ] Auto-rescore API: POST /api/svi/rescore-from-evidence
- [ ] Post-evidence-upload trigger (auto-rescore after upload)
- [ ] Evidence Vault SVI impact display (toast: "SVI +X points")
- [ ] Living Report auto-update after evidence changes
- **Acceptance:** Adding evidence visibly changes SVI score within 5 seconds
- **Skill:** /simplify, /qa

### Sub-goal 2.2: OAuth Evidence Connectors [P3]
- [ ] GitHub connector (repo stats -> hasSourceCode, commit frequency)
- [ ] Google Analytics connector (MAU/DAU -> hasAnalytics)
- [ ] Stripe connector (MRR/ARR -> hasRevenue, revenueBand)
- [ ] Connector status dashboard in Evidence Vault
- **Acceptance:** Connected source raises confidence from 20% to 75%
- **Skill:** /claude-api

### Sub-goal 2.3: Milestone Badges [P1]
- [ ] Define 15 badges (first_analysis, evidence_uploaded, svi_100, etc.)
- [ ] Badge award engine (checkAndAwardBadges after each rescore)
- [ ] Badge display UI (BadgeShelf component)
- [ ] Badge notification (in-app toast + email)
- **Acceptance:** User earns visible badge after completing first evidence upload
- **Skill:** /simplify

### Sub-goal 2.4: Enhanced Weekly Reports [P2]
- [ ] Week-over-week dimension comparison
- [ ] AI-generated weekly summary
- [ ] Email delivery with SVI chart
- [ ] Historical SVI line chart in workspace/reports
- **Acceptance:** User receives weekly email with actionable insights
- **Skill:** /cmo