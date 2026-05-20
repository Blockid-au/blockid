# Phase 4: Equity & Cap Table — PLANNED (Q1 2027)

## Goal: Persistent cap table with vesting and ESOP management

### Sub-goal 4.1: Unified Cap Table Engine
- [ ] Persistent cap_tables table (versioned, audit trail)
- [ ] Workspace cap table page (/workspace/cap-table)
- [ ] Tool-to-Workspace bridge ("Save to Workspace" on all tools)
- [ ] Dilution scenario modeling
- [ ] Cap table to SVI feed (auto-set hasCapTable, hasVesting signals)
- **Acceptance:** Cap table persists across sessions, feeds SVI

### Sub-goal 4.2: Vesting Schedule Manager
- [ ] Vesting parameters in shareholder data (cliff, total, start)
- [ ] Vesting timeline visualization
- [ ] Cliff alerts and milestone notifications
- **Acceptance:** User can see each stakeholder's vesting progress

### Sub-goal 4.3: ESOP Management
- [ ] ESOP pool configuration (total, granted, unallocated)
- [ ] Individual grant tracking (esop_grants table)
- [ ] ESOP dilution preview before granting
- **Acceptance:** Full ESOP lifecycle managed in workspace