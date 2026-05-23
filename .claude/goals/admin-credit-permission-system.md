# Goal: Admin Credit Management & User Permission System

## Mission
Build a comprehensive admin panel for credit management, user permissions, and platform governance. Admin can grant/revoke credits, manage user plans, and monitor platform health — all from the admin dashboard.

## Current State
- Admin role: `user` vs `admin` (hardcoded email + DB field)
- Credit functions exist: `grantCredits()`, `spendCredits()`, `getBalance()`
- No admin UI for credit management
- No bulk operations
- No user plan management from admin

## Phase 1: Admin Credit Management API

### Endpoints to Build
```
POST /api/admin/credits/grant    — Grant credits to user
POST /api/admin/credits/revoke   — Revoke credits from user  
GET  /api/admin/credits/balances — List all user balances
POST /api/admin/users/plan       — Change user's plan
POST /api/admin/users/role       — Change user's role
GET  /api/admin/users/export     — Export user list as CSV
```

## Phase 2: Admin Dashboard UI

### Credit Management Page (/admin/credits)
- Search user by email
- View balance, lifetime earned/spent
- Grant credits with reason
- Revoke credits with reason
- Bulk grant to cohort/plan tier

### User Management Page (/admin/users — enhance existing)
- Filter by plan, role, signup date
- Inline actions: change plan, grant credits, set role
- User detail: full history (analyses, credits, evidence)

## Success Criteria
- [x] POST /api/admin/credits (grant/revoke by email) by email
- [x] POST /api/admin/users/manage (change plan, auto-grant credits) (free → founding50 → growth)
- [x] POST /api/admin/users/manage (change role user↔admin) (user → admin)
- [x] All actions logged in credit_transactions with admin metadata in credit_transactions
- [x] Bulk grant via admin credits page (per-user + accelerator cohort API) cohorts