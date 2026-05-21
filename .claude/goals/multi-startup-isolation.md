# CRITICAL: Multi-Startup Data Isolation

## Problem
When a user switches to a different startup project, the system OVERWRITES existing data instead of creating NEW records. This means:
- SVI analyses from Startup A get replaced when analyzing Startup B
- Cap table, evidence, metrics all bleed between startups
- User loses historical data for previous startups

## Root Cause
`project_id` column exists on tables but is NEVER set during insert operations.

## Affected Tables (need project_id scoping)

| Table | Has project_id? | Currently Scoped? | Fix Needed |
|-------|----------------|-------------------|-----------|
| svi_analyses | ✅ Yes | ❌ NOT SET on insert | Set from cookie |
| svi_accounts | ✅ Yes | ❌ NOT SET | Set on creation |
| svi_evidence | ❌ No | ❌ | Add column + scope |
| svi_snapshots | ❌ No | ❌ | Add column + scope |
| shareholders | ❌ No | ❌ | Add column + scope |
| share_classes | ❌ No | ❌ | Add column + scope |
| share_transactions | ❌ No | ❌ | Add column + scope |
| esop_pool | ❌ No | ❌ | Add column + scope |
| startup_metrics | ❌ No | ❌ | Add column + scope |
| growth_journal | ❌ No | ❌ | Add column + scope |
| fundraise_rounds | ❌ No | ❌ | Add column + scope |
| data_rooms | ❌ No | ❌ | Add column + scope |
| user_source_folders | ❌ No | ❌ | Add column + scope |
| dataroom_files | ❌ No | ❌ | Add column + scope |

## Fix Strategy

### Phase 1: API-level project scoping (P0)
Every API that creates/reads data must:
1. Read `blockid_project` cookie from request
2. Resolve to `project_id` via `getActiveProject()`
3. INSERT with `project_id`
4. SELECT with `WHERE project_id = ?`

### Phase 2: Database migration
Add `project_id` to all tables missing it.

### Phase 3: Sub-goal checks

| Sub-goal | Check | Owner |
|----------|-------|-------|
| SG-1 | SVI analysis inserts with project_id | CTO |
| SG-2 | SVI accounts scoped to project | CTO |
| SG-3 | Evidence vault scoped to project | CTO |
| SG-4 | Cap table (shareholders, classes, ESOP) scoped | CTO |
| SG-5 | Metrics scoped to project | CTO |
| SG-6 | Journal scoped to project | CTO |
| SG-7 | Fundraise rounds scoped to project | CTO |
| SG-8 | Data room scoped to project | CTO |
| SG-9 | Dashboard queries filter by project_id | CPO |
| SG-10 | Project switcher triggers full data reload | CPO |

## Acceptance Criteria
- Creating analysis for Startup B does NOT modify Startup A data
- Switching project shows ONLY that project's data
- Historical data preserved for all projects
- New project starts with clean slate