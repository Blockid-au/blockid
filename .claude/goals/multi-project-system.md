# Goal: Multi-Project / Multi-Startup per User

## Problem Statement
Currently BlockID.au assumes 1 user = 1 startup. The `svi_accounts` table has UNIQUE(email) constraint, `credit_balances` has UNIQUE(user_id), and `svi_analyses` are keyed by email without project context. Founders who have multiple ideas or run multiple startups cannot manage them independently in one account.

## Goal
Enable any user to create and manage multiple startup projects within a single BlockID account, each with independent SVI scoring, evidence, credits, and investor-ready reports.

## Design Decisions

### Credits Model: Shared Wallet + Per-Project Usage Tracking
- Credits remain at USER level (one wallet per account)
- Usage tracking records which PROJECT consumed the credit
- Rationale: simpler UX, one balance to manage, but full audit trail per project

### Pricing for Multiple Projects
- **Free plan**: 1 project (default)
- **Founding 50 / Founder plan**: Up to 3 projects included
- **Growth plan**: Up to 10 projects included
- **Additional projects**: A$10/month per extra project beyond plan limit
- Rationale: monetize power users without penalizing solo founders

### Project vs Workspace Naming
- Internal: `projects` table
- UI: "Startups" or "My Startups" (founder-friendly language)
- URL: `/projects/:slug/dashboard` or simpler `/dashboard?project=slug`

---

## Sub-Goals

### SG-1: Database Schema Migration [P0]

Create `/web/supabase/migrations/0014_multi_project.sql`:

```sql
-- 1. Projects table
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  industry text,
  stage integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, slug)
);

CREATE INDEX idx_projects_user ON public.projects(user_id);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- 2. Add project_id to existing tables (nullable for backward compat)
ALTER TABLE public.svi_accounts ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.svi_analyses ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.credit_transactions ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.usage_logs ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.idea_evaluations ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.equity_splits ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.funding_plans ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.founder_packs ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

-- 3. Relax svi_accounts UNIQUE constraint (allow multiple per email)
ALTER TABLE public.svi_accounts DROP CONSTRAINT IF EXISTS svi_accounts_email_key;
-- Add unique on project_id instead
CREATE UNIQUE INDEX IF NOT EXISTS idx_svi_accounts_project ON public.svi_accounts(project_id) WHERE project_id IS NOT NULL;

-- 4. Data migration: Create default project for every existing user
INSERT INTO public.projects (user_id, name, slug, is_default)
SELECT u.id, COALESCE(a.startup_name, 'My Startup'), 'default', true
FROM public.app_users u
LEFT JOIN public.svi_accounts a ON a.email = u.email
ON CONFLICT DO NOTHING;

-- 5. Backfill project_id on existing data
UPDATE public.svi_accounts sa SET project_id = (
  SELECT p.id FROM public.projects p
  JOIN public.app_users u ON p.user_id = u.id
  WHERE u.email = sa.email AND p.is_default = true LIMIT 1
) WHERE sa.project_id IS NULL;

UPDATE public.svi_analyses sa SET project_id = (
  SELECT p.id FROM public.projects p
  JOIN public.app_users u ON p.user_id = u.id
  WHERE u.email = sa.email AND p.is_default = true LIMIT 1
) WHERE sa.project_id IS NULL;
```

### SG-2: Project Management Library [P0]

Create `/web/src/lib/projects.ts`:
- `getUserProjects(userId)` → list all projects
- `getActiveProject(userId)` → get default or cookie-selected project
- `createProject(userId, name, description?)` → create + check plan limits
- `switchProject(userId, projectSlug)` → set active project cookie
- `deleteProject(projectId)` → soft delete (archive)
- `getProjectLimit(plan)` → return max projects for plan
- `canCreateProject(userId)` → check if under limit or needs upgrade

### SG-3: Project Switcher UI [P1]

Create `/web/src/components/ui/project-switcher.tsx`:
- Dropdown in workspace topbar showing current project name
- List all user's projects with radio selection
- "Create New Startup" button at bottom
- Badge showing project count (e.g., "2/3")
- Active project highlighted

### SG-4: Project Management Page [P1]

Create `/web/src/app/workspace/projects/page.tsx`:
- Grid of project cards (name, stage, SVI score, created date)
- "Create New Startup" CTA
- Edit project name/description
- Archive project
- Plan limit indicator ("2 of 3 startups used")
- "Need more? Upgrade your plan" CTA

### SG-5: API Updates [P0]

Update these routes to accept/use project context:
- `POST /api/svi` → accept `projectId` in body
- `GET /api/credits` → filter transactions by project
- `POST /api/credits/check` → context-aware
- `POST /api/evidence` + `POST /api/evidence/upload` → project-scoped
- `GET /api/svi/[slug]` → project-aware

New routes:
- `GET /api/projects` → list user's projects
- `POST /api/projects` → create project (check plan limit)
- `PATCH /api/projects/[id]` → update name/description
- `DELETE /api/projects/[id]` → archive (soft delete)
- `POST /api/projects/[id]/switch` → set active project

### SG-6: Dashboard Context [P1]

Update workspace pages to load data for active project:
- SVI Dashboard → load by project_id
- Evidence Vault → filter by project_id
- Reports → filter snapshots by project_id
- Roadmap → completion per project
- Billing → show per-project usage breakdown

### SG-7: Project Onboarding Flow [P2]

When user creates a new project:
1. Name your startup
2. Select industry (SaaS, fintech, marketplace, etc.)
3. Select stage (0-7)
4. Optional: describe in 1-2 sentences
5. → Create project → redirect to SVI analysis with project context

### SG-8: Pricing Enforcement [P1]

- Check `getProjectLimit(user.plan)` before allowing new project
- Free: 1 project
- Founding 50 / Founder: 3 projects
- Growth: 10 projects
- Beyond limit: show upgrade CTA or A$10/mo add-on
- Admin override for unlimited

---

## Implementation Order

1. **Week 1**: SG-1 (migration) + SG-2 (library) — foundation
2. **Week 2**: SG-5 (APIs) + SG-3 (switcher) — wiring
3. **Week 3**: SG-4 (management page) + SG-6 (dashboard) — UX
4. **Week 4**: SG-7 (onboarding) + SG-8 (pricing) — monetization

## Success Metrics
- 30% of paid users create 2+ projects within 60 days
- Additional revenue from multi-project add-on: A$500/month by Month 3
- No regression in single-project user experience

## Dependencies
- Phase 2 (Monetization) must be complete ✅
- Credit system must be functional ✅
- Stripe subscription management must work ✅

## Risk Mitigation
- Backward compatibility: all project_id columns are nullable
- Default project auto-created for existing users
- Old email-based queries still work as fallback
- Migration is additive (no destructive changes)
