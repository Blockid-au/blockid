# Goal: Multi-Startup Token Permissions

## Problem Statement
BlockID supports multiple startups per user (via the `projects` table), but there is no permission model for which users can create tokens for their startups. Token creation (minting SVT shares on the private chain) is a privileged action that should be gated by user role, plan tier, and admin approval.

## Design

### User Roles & Token Access

| Role | Example | Token Creation Rights |
|------|---------|----------------------|
| Admin | admin@blockid.au | Full access to all features, all startups, all tokens. No restrictions. |
| Pilot User | ceo@longcare.au | Token creation rights granted. Can create tokens for any of their startups without additional approval. |
| Paid User (Growth) | Any user on Growth plan ($499/mo) | Unlimited tokens, auto-approved. No admin approval needed. |
| Paid User (Founder) | Any user on Founder plan ($99/mo) | 1 token per startup. Requires admin approval before token is minted. |
| Free User | Any user on free plan | No token creation. SVI analysis only. Must upgrade to create tokens. |

### Pricing Tiers for Token Creation

| Tier | Price (AUD) | Token Rights | Approval |
|------|------------|--------------|----------|
| Free | $0 | No tokens (SVI analysis only) | N/A |
| Founder | $99/mo | 1 token per startup | Admin approval required |
| Growth | $499/mo | Unlimited tokens per startup | Auto-approved |
| Enterprise | Custom | Custom token configuration | Dedicated support |

### Per-Startup Token Lifecycle

```
User creates startup (project)
    |
    v
User requests token for startup
    |
    v
System checks: plan tier + role
    |
    +-- Free plan --> Reject: "Upgrade to Founder ($99/mo) to create tokens"
    |
    +-- Founder plan --> Queue for admin approval
    |       |
    |       v
    |   Admin reviews (admin@blockid.au)
    |       |
    |       +-- Approve --> Mint token (1 per startup limit)
    |       +-- Reject --> Notify user with reason
    |
    +-- Growth plan --> Auto-approve --> Mint token
    |
    +-- Admin / Pilot --> Auto-approve --> Mint token (no limits)
```

### Data Model

#### New table: `token_requests`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK to app_users |
| project_id | uuid | FK to projects |
| token_name | text | Requested token name (e.g., "TechCo Shares") |
| token_symbol | text | Requested symbol (e.g., "TECHCO") |
| total_supply | bigint | Requested total supply |
| status | text | pending / approved / rejected / minted |
| reviewed_by | text | Admin email who reviewed |
| reviewed_at | timestamptz | When review happened |
| rejection_reason | text | If rejected, why |
| created_at | timestamptz | Request timestamp |

#### Changes to existing tables

- `app_users`: Add `token_role` column (enum: 'standard' | 'pilot' | 'admin'), default 'standard'
- `projects`: Add `token_id` column (nullable uuid, FK to token_requests once minted)
- `projects`: Add `token_status` column (nullable text: 'none' | 'pending' | 'approved' | 'minted')

### Permission Check Function

```typescript
// lib/token-permissions.ts

interface TokenPermission {
  canCreate: boolean;
  requiresApproval: boolean;
  reason: string;
  maxTokensPerStartup: number;
}

function checkTokenPermission(user: {
  email: string;
  plan: string;
  tokenRole: string;
}): TokenPermission {
  // Admin: full access
  if (user.email === 'admin@blockid.au' || user.tokenRole === 'admin') {
    return { canCreate: true, requiresApproval: false, reason: 'admin', maxTokensPerStartup: Infinity };
  }

  // Pilot users: full access
  if (user.tokenRole === 'pilot') {
    return { canCreate: true, requiresApproval: false, reason: 'pilot', maxTokensPerStartup: Infinity };
  }

  // Growth plan: unlimited, auto-approved
  if (user.plan === 'growth') {
    return { canCreate: true, requiresApproval: false, reason: 'growth_plan', maxTokensPerStartup: Infinity };
  }

  // Founder plan: 1 token per startup, requires approval
  if (user.plan === 'founder' || user.plan === 'founding50') {
    return { canCreate: true, requiresApproval: true, reason: 'founder_plan', maxTokensPerStartup: 1 };
  }

  // Free plan: no tokens
  return { canCreate: false, requiresApproval: false, reason: 'free_plan', maxTokensPerStartup: 0 };
}
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/tokens/request` | Submit token creation request for a startup |
| GET | `/api/tokens/requests` | List user's token requests (all startups) |
| POST | `/api/admin/tokens/review` | Admin: approve or reject a token request |
| GET | `/api/admin/tokens/pending` | Admin: list all pending token requests |

### Admin Review UI

- Admin panel page: `/admin/tokens`
- Table of pending requests with startup name, user email, plan, token details
- Approve / Reject buttons with optional rejection reason
- Auto-notification email to user on approval or rejection

### Email Notifications

| Event | Recipient | Template |
|-------|-----------|----------|
| Token request submitted | Admin (admin@blockid.au) | New token request from {user} for {startup} |
| Token approved | User | Your token {symbol} for {startup} has been approved |
| Token rejected | User | Token request for {startup} was not approved: {reason} |
| Token minted | User | {symbol} is now live on BlockID Chain |

## Sub-Goals

| # | Sub-Goal | Priority | Week |
|---|----------|----------|------|
| SG-1 | DB migration: `token_requests` table + user/project columns | P0 | 1 |
| SG-2 | `lib/token-permissions.ts` permission check function | P0 | 1 |
| SG-3 | API: POST `/api/tokens/request` with plan/role validation | P0 | 1 |
| SG-4 | API: GET/POST admin token review endpoints | P0 | 1 |
| SG-5 | Admin UI: `/admin/tokens` pending review page | P1 | 2 |
| SG-6 | Workspace UI: token request button on startup/project page | P1 | 2 |
| SG-7 | Email notifications for token lifecycle events | P1 | 2 |
| SG-8 | Seed pilot user role for ceo@longcare.au | P0 | 1 |
| SG-9 | Integration with TokenFactory (mint on approval) | P2 | 3 |
| SG-10 | Pricing page update to show token creation tiers | P2 | 3 |

## Success Metrics

- 100% of admin/pilot users can create tokens without friction
- Token request-to-approval time < 24 hours (admin SLA)
- Zero unauthorized token minting (permission checks enforced server-side)
- 20% of Founder plan users request token creation within 30 days
- Growth plan token auto-approval success rate: 100%

## Security Considerations

- All permission checks enforced server-side (never trust client-side plan/role)
- Token request rate limiting: max 5 requests per user per day
- Admin email verified before granting admin role
- Pilot role only assigned manually by admin via DB or admin panel
- Token symbols validated for uniqueness across all projects
- Audit log for all token lifecycle events (request, review, mint, burn)
