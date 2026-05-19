# BlockID.au -- System Architecture

> Version: 2.0 | Last updated: 2026-05-19
> Stack: Next.js (App Router, standalone output) + Supabase + Stripe + Claude/OpenAI/Gemini + Google Drive + Gmail SMTP

---

## System Architecture Diagram

```
                                 +---------------------------+
                                 |       End Users           |
                                 |  (Founders / Investors)   |
                                 +------------+--------------+
                                              |
                                      HTTPS (TLS 1.3)
                                              |
                                 +------------v--------------+
                                 |        Nginx / Caddy      |
                                 |    Reverse Proxy + HSTS   |
                                 |  X-Forwarded-For headers  |
                                 +------------+--------------+
                                              |
                                    localhost:3000
                                              |
                          +-------------------v--------------------+
                          |                                        |
                          |         Next.js  (App Router)          |
                          |         output: "standalone"           |
                          |                                        |
                          |  +----------------------------------+  |
                          |  |    Server Components / Pages     |  |
                          |  |  (SSR, auth-gated via cookies)   |  |
                          |  +----------------------------------+  |
                          |                                        |
                          |  +----------------------------------+  |
                          |  |    API Route Handlers (38 total) |  |
                          |  |  /api/svi, /api/auth, /api/stripe|  |
                          |  |  /api/credits, /api/evidence ... |  |
                          |  +--+----------+----------+---------+  |
                          |     |          |          |             |
                          +-----+----------+----------+------------+
                                |          |          |
               +----------------+    +-----+-----+   +----------------+
               |                     |           |                     |
    +----------v---------+  +-------v-------+  +-v-----------------+  |
    |     Supabase       |  |    Stripe     |  |  AI Providers     |  |
    |  (PostgreSQL RLS)  |  |  Payments +   |  |                   |  |
    |                    |  |  Webhooks     |  |  1. Claude OAuth   |  |
    |  Tables:           |  |              |  |  2. ANTHROPIC_KEY  |  |
    |  - app_users       |  |  Events:     |  |  3. OpenAI         |  |
    |  - sessions        |  |  - checkout  |  |  4. Gemini         |  |
    |  - magic_links     |  |  - invoice   |  |  (auto-fallback)   |  |
    |  - svi_analyses    |  |  - sub.del   |  +-------------------+  |
    |  - svi_accounts    |  |  - sub.upd   |                         |
    |  - svi_evidence    |  +--------------+  +-------------------+  |
    |  - svi_snapshots   |                    |  Google Drive      |  |
    |  - svi_notifs      |                    |  (Service Account) |  |
    |  - scores          |                    |  Evidence uploads   |  |
    |  - leads           |                    +-------------------+  |
    |  - credit_balances |                                           |
    |  - credit_txns     |                    +-------------------+  |
    |  - usage_logs      |                    |  Gmail SMTP        |  |
    |  - user_actions    |                    |  (Nodemailer)      |  |
    |  - coupons         |                    |  admin@blockid.au  |  |
    |  - coupon_redeem   |                    +-------------------+  |
    |  - growth_insights |                                           |
    |  - cofounder_profs |  +-------------------+                    |
    |  - score_views     |  |  Vercel Cron /    |                    |
    |  - investor_links  |  |  External Cron    |--------------------+
    +--------------------+  |  (CRON_SECRET)    |
                            +-------------------+
```

---

## Component Architecture

### Frontend

#### Pages (App Router)

```
web/src/app/
  page.tsx                    -- Marketing landing page (hero, pricing, SVI form, tools)
  score/page.tsx              -- Legacy Investor-Ready Score wizard
  founding-50/page.tsx        -- Founding 50 lead capture + checkout
  investors/page.tsx          -- Investor-facing information
  about/page.tsx              -- About page
  contact/page.tsx            -- Contact page
  terms/page.tsx              -- Terms of service
  privacy/page.tsx            -- Privacy policy
  insights/page.tsx           -- SEO content hub (articles from manifest.json)
  insights/[slug]/page.tsx    -- Individual insight article
  auth/login/page.tsx         -- Login page (Google + Magic Link)
  auth/error/page.tsx         -- Auth error page
  checkout/success/page.tsx   -- Post-checkout success page
  dashboard/
    page.tsx                  -- Main user dashboard
    svi/page.tsx              -- SVI dashboard (scores, history, benchmarks)
  workspace/
    evidence/page.tsx         -- Evidence Vault (upload + manage evidence)
    roadmap/page.tsx          -- Guided roadmap (action items)
    reports/page.tsx          -- Weekly reports
    billing/page.tsx          -- Billing + subscription management
    profile/page.tsx          -- User profile
  admin/
    page.tsx                  -- Admin dashboard (metrics, users)
    users/page.tsx            -- Admin user management
    documents/page.tsx        -- Admin document review
    growth/page.tsx           -- Growth insights dashboard
  tools/
    idea-valuation/page.tsx   -- Free idea valuation estimator
    equity-split/page.tsx     -- Free equity split calculator
    term-sheet/page.tsx       -- Term Sheet AI (paid, 3 credits)
    funding-plan/page.tsx     -- Free funding plan builder
    cap-table/page.tsx        -- Free cap table modeller
    dilution/page.tsx         -- Free dilution calculator
    data-room/page.tsx        -- Data room checklist
    cofounder-match/page.tsx  -- Co-founder matching directory
  s/
    [slug]/page.tsx           -- Public SVI report share page
    [slug]/activity/page.tsx  -- Score activity/views page
    p/[slug]/page.tsx         -- Public founder pack share page
    i/[token]/page.tsx        -- Per-investor share link page
```

#### Key Components

```
web/src/components/
  svi/
    svi-entrance.tsx          -- SVI form + credit gate + email capture
    svi-results-panel.tsx     -- Full SVI results display (8 dimensions)
    svi-dashboard.tsx         -- Dashboard SVI overview card
    evidence-wizard.tsx       -- Step-by-step evidence upload wizard
    evidence-vault-client.tsx -- Evidence list + management
    research-panel.tsx        -- Competitive research results
  score/
    score-card.tsx            -- Legacy Investor-Ready Score card
  landing/
    hero.tsx                  -- Landing page hero section
    pricing.tsx               -- Pricing tiers display
    pricing-coupon.tsx        -- Coupon input on pricing
    bento.tsx                 -- Feature bento grid
    faq.tsx                   -- FAQ accordion
    cta-strip.tsx             -- Call-to-action strip
    idea-tools.tsx            -- Free tools showcase
    investor-pack.tsx         -- Investor pack section
    compliance.tsx            -- AU compliance section
    comps-wall.tsx            -- Social proof wall
    logo-cloud.tsx            -- Partner logo cloud
    ownership-visibility.tsx  -- Ownership feature section
  workspace/
    workspace-layout.tsx      -- Workspace shell (sidebar + auth gate)
    roadmap-steps.tsx         -- Guided roadmap step cards
    weekly-report-card.tsx    -- Weekly SVI report card
    profile-progress.tsx      -- Profile completion progress
  ui/
    button.tsx                -- Design system button
    card.tsx                  -- Design system card
    input.tsx                 -- Design system input
    badge.tsx                 -- Design system badge
    tabs.tsx                  -- Design system tabs
    label.tsx                 -- Design system label
    accordion.tsx             -- Design system accordion
    credit-balance.tsx        -- Credit balance display widget
    credit-gate.tsx           -- Credit gate modal (buy credits CTA)
    language-toggle.tsx       -- EN/ZH language toggle
  site/
    navbar.tsx                -- Site navigation bar
    footer.tsx                -- Site footer
  brand/
    logo.tsx                  -- BlockID logo component
  analytics/
    google-analytics.tsx      -- GA4 tracking component
```

#### Design System

- Navy/brand-blue palette (#0B1220 background, #3B7DD8 brand blue, #F8FAFC foreground)
- Inter font family, IBM Plex Mono for data/numbers
- Tailwind CSS with custom theme tokens
- Component library in `components/ui/`

### Backend: API Routes Grouped by Domain

```
/api/auth/         -- Authentication (magic link, Google OAuth, session)
/api/svi/          -- Startup Value Index (analysis, AI score, report, research, share)
/api/stripe/       -- Payments (checkout, webhook, portal, cancel, reactivate, change-plan, analysis)
/api/credits/      -- Credit system (balance, check, purchase packs)
/api/evidence/     -- Evidence Vault (list, add, upload to Drive)
/api/score         -- Legacy Investor-Ready Score
/api/term-sheet    -- Term Sheet AI analysis
/api/idea-estimate -- Idea value estimator
/api/cofounder-match -- Co-founder profile submission
/api/investor-link -- Per-investor share link creation
/api/svi-accounts  -- SVI account creation/upsert
/api/actions       -- User action tracking
/api/lead          -- Lead capture + Founding 50 checkout
/api/coupon/       -- Coupon validation + redemption
/api/admin/        -- Admin-only operations (Drive upload)
/api/cron/         -- Cron jobs (SVI notify, snapshot, growth insights)
```

### Server-Side Libraries

```
web/src/lib/
  supabase.ts           -- Supabase admin client (service-role, server-only)
  auth.ts               -- Magic link + Google OAuth + session management
  credits.ts            -- Credit system (balance, spend, grant, initialize)
  email.ts              -- Gmail SMTP wrapper (Nodemailer, 12+ email templates)
  stripe.ts             -- Stripe server client + price map
  stripe-client.ts      -- Stripe client-side loader
  ai-client.ts          -- Unified AI client (Claude > OpenAI > Gemini fallback)
  svi-analysis.ts       -- SVI v2 computation (8 dimensions, signals, stage detection)
  score.ts              -- Legacy Investor-Ready Score computation
  google-drive.ts       -- Google Drive upload + share (service account)
  plans.ts              -- Plan definitions + pricing helpers
  credits.ts            -- Feature costs, plan grants, credit packs
  insights.ts           -- Insight article manifest loader
  slug.ts               -- Slug/ID generation (nanoid)
  iphash.ts             -- Privacy-safe IP hashing (SHA-256, daily salt)
  analytics.ts          -- Analytics helpers
  i18n.ts               -- Internationalisation (EN/ZH)
  utils.ts              -- General utilities
  cofounder-match.ts    -- Co-founder profile schema (Zod)
  cofounder-match.server.ts -- Co-founder DB operations
  investor-links.ts     -- Investor link creation/lookup
  equity-split.ts       -- Equity split calculator logic
  funding-plan.ts       -- Funding plan builder logic
  cap-table.ts          -- Cap table modelling + dilution computation
  idea-valuation.ts     -- Idea valuation logic
  term-sheet/
    schema.ts           -- Term sheet Zod schema
    analyze.ts          -- Claude-powered term sheet analysis
    au-market-data.ts   -- Australian market benchmarks
    demo.ts             -- Demo/fallback data
  idea-phase/
    session-state.ts    -- Idea phase session state management
    persist.ts          -- Idea phase data persistence
```

---

## Database: Table Relationships

```
+------------------+       +-------------------+       +--------------------+
|   app_users      |       |    sessions       |       |    magic_links     |
+------------------+       +-------------------+       +--------------------+
| id (uuid PK)    |<------+| user_id (FK)      |       | token (PK)         |
| email (unique)  |       || token (PK)        |       | email              |
| display_name    |       || expires_at        |       | intent             |
| google_id       |       || ip_hash           |       | pending_payload    |
| avatar_url      |       || user_agent        |       | expires_at         |
| role            |       || last_used_at      |       | consumed_at        |
| plan            |       |+-------------------+       | ip_hash            |
| plan_started_at |                                    +--------------------+
| stripe_cust_id  |
| coupon_code     |       +-------------------+       +--------------------+
| discount_pct    |       | credit_balances   |       | credit_transactions|
| cancel_reason   |       +-------------------+       +--------------------+
| cancel_at       |       | user_id (FK, uniq)|       | user_id (FK)       |
| created_at      |<------| balance           |       | amount (+/-)       |
| last_login_at   |       | lifetime_earned   |       | balance_after      |
+--------+--------+       | lifetime_spent    |       | reason             |
         |                 | updated_at        |       | metadata (jsonb)   |
         |                 +-------------------+       | created_at         |
         |                                             +--------------------+
         |
         |                 +-------------------+
         +<----------------| usage_logs        |
                           +-------------------+
                           | user_id (FK)      |
                           | feature           |
                           | credits_used      |
                           | metadata (jsonb)  |
                           | created_at        |
                           +-------------------+

+------------------+       +-------------------+       +--------------------+
|  svi_accounts    |       |  svi_analyses     |       |   svi_evidence     |
+------------------+       +-------------------+       +--------------------+
| id (uuid PK)    |       | id (slug PK)      |       | id (uuid PK)       |
| email (unique)  |       | email             |       | account_id (FK)    |
| name            |       | raw_input         |       | evidence_type      |
| startup_name    |       | file_name         |       | label              |
| plan            |       | total_svi         |       | value_or_url       |
| current_svi     |       | net_adjustment    |       | confidence_level   |
| current_stage   |       | confidence_mult   |       | dimension          |
| svi_analysis_cr |       | analysis_json     |       | svi_impact         |
| enrolled_at     |       | svi_version       |       | created_at         |
| last_active_at  |       | created_at        |       +--------------------+
+--------+---------+       +-------------------+
         |
         |                 +-------------------+       +--------------------+
         +<----------------| svi_snapshots     |       | svi_notifications  |
                           +-------------------+       +--------------------+
                           | account_id (FK)   |       | account_id (FK)    |
                           | svi_total         |       | notification_type  |
                           | stage             |       | subject            |
                           | analysis_json     |       | payload (jsonb)    |
                           | snapshot_date     |       | created_at         |
                           | delta             |       +--------------------+
                           +-------------------+
                           (unique: account_id + snapshot_date)

+------------------+       +-------------------+       +--------------------+
|     leads        |       |    scores         |       |   score_views      |
+------------------+       +-------------------+       +--------------------+
| id (uuid PK)    |       | id (slug PK)      |       | id (uuid PK)       |
| email           |       | email             |       | score_id (FK)      |
| source          |       | company_name      |       | ip_hash            |
| payload (jsonb) |       | total_score       |       | viewed_at          |
| created_at      |       | sub_scores        |       +--------------------+
+------------------+       | inputs (jsonb)    |
                           | score_version     |       +--------------------+
                           | confidence_score  |       |   investor_links   |
                           | missing_inputs    |       +--------------------+
                           | action_plan       |       | token (PK)         |
                           | benchmark         |       | score_id (FK)      |
                           | created_at        |       | investor_email     |
                           +-------------------+       | investor_name      |
                                                       | fund_name          |
+------------------+       +-------------------+       | note               |
|    coupons       |       |coupon_redemptions |       | created_by_email   |
+------------------+       +-------------------+       | created_at         |
| code (PK)       |<------| coupon_code (FK)  |       +--------------------+
| discount_pct    |       | user_id (FK)      |
| description     |       | plan              |       +--------------------+
| active          |       | original_price    |       |   user_actions     |
| valid_until     |       | discounted_price  |       +--------------------+
| max_uses        |       | created_at        |       | id (uuid PK)       |
| current_uses    |       +-------------------+       | account_id (FK)    |
+------------------+                                   | email              |
                                                       | action_type        |
+------------------+       +-------------------+       | action_label       |
| cofounder_profs  |       | growth_insights   |       | dimension          |
+------------------+       +-------------------+       | source_gap         |
| id (uuid PK)    |       | insight_date (PK) |       | tool_slug          |
| email           |       | visitors_total    |       | metadata (jsonb)   |
| full_name       |       | svi_started       |       | svi_impact_est     |
| location        |       | signups           |       | created_at         |
| i_am            |       | leads_captured    |       +--------------------+
| looking_for     |       | paying_users      |
| stage           |       | revenue_aud       |       +--------------------+
| time_commitment |       | signup_rate       |       | svi_analysis_usage |
| visibility      |       | payment_rate      |       +--------------------+
| linkedin_url    |       | recommendations   |       | email (PK)         |
| skills          |       | plan_distribution |       | free_used          |
| idea_pitch      |       | biggest_drop_off  |       | credits_remaining  |
| ip_hash         |       | drop_off_rate     |       | total_analyses     |
| created_at      |       | created_at        |       +--------------------+
+------------------+       +-------------------+
```

### External Services

| Service | Purpose | Auth Method |
|---------|---------|-------------|
| **Supabase** | PostgreSQL database (RLS enabled, service-role access) | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` |
| **Stripe** | Payments, subscriptions, customer portal, webhooks | `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` |
| **Claude (Anthropic)** | AI scoring, SVI reports, term sheet analysis, research, growth recommendations | Claude CLI OAuth or `ANTHROPIC_API_KEY` |
| **OpenAI** | Fallback AI provider (GPT-4o-mini) | `OPENAI_API_KEY` or Codex CLI |
| **Google Gemini** | Free-tier AI fallback (gemini-2.0-flash) | `GOOGLE_GEMINI_API_KEY` |
| **Google Drive** | Evidence document storage, admin sharing | Service Account (`GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_DRIVE_PRIVATE_KEY`) |
| **Gmail SMTP** | Transactional email (magic links, reports, notifications, payment confirmations) | `SMTP_USER` + `SMTP_PASS` via Nodemailer |
| **Google OAuth** | Sign In With Google (ID token verification) | `GOOGLE_CLIENT_ID` |

---

## Data Flow Diagrams

### 1. SVI Analysis Flow

```
+----------+     +----------+     +-----------------+     +---------------+
|  User    |     | POST     |     | extractSignals()|     | computeSVI()  |
|  submits +--->+| /api/svi +--->+| Parse raw text  +--->+| 8 dimensions  |
|  text    |     |          |     | into 30+ bool   |     | + stage detect |
+----------+     +----+-----+     | signals          |     | + risk penalty |
                      |           +-----------------+     +-------+-------+
                      |                                           |
                      v                                           v
              +-------+--------+                     +------------+--------+
              | Credit Gate    |                     | Save to             |
              | canAfford() ? |                     | svi_analyses table  |
              | Auth user:     |                     | (slug, email,       |
              |   check balance|                     |  total_svi,         |
              | Anon user:     |                     |  analysis_json)     |
              |   1 free only  |                     +----------+----------+
              +----------------+                                |
                                                                |
                      +------------------+         +------------v----------+
                      | spendCredits()   |<--------+ Send SVI Report Email |
                      | Deduct 1 credit  |         | (fire-and-forget)     |
                      | Log to usage_logs|         +-----------+-----------+
                      +------------------+                     |
                                                               v
                                                   +-----------+-----------+
                                                   | Auto Magic Link       |
                                                   | (if new anon user,    |
                                                   |  send signup link)    |
                                                   +-----------------------+
                                                               |
                                                               v
                                                   +-----------+-----------+
                                                   | Return JSON           |
                                                   | { slug, totalSVI,     |
                                                   |   analysis, balance } |
                                                   +-----------------------+
```

### 2. Payment Flow

```
+------------------+     +-----------+     +------------------+
| Founding 50 Form |     | POST      |     | Save to `leads`  |
| (name, email,    +--->+| /api/lead +--->+| table            |
|  company)        |     |           |     +--------+---------+
+------------------+     +-----+-----+              |
                               |                    v
                               |          +---------+----------+
                               |          | Create Stripe      |
                               |          | Checkout Session   |
                               |          | (mode: payment)    |
                               |          +---------+----------+
                               |                    |
                               v                    v
                    +----------+--------+  +--------+---------+
                    | Send Payment Link |  | Redirect user to |
                    | Email (fire+forget)|  | Stripe Checkout  |
                    +-------------------+  +--------+---------+
                                                    |
                                           User pays on Stripe
                                                    |
                                                    v
                    +-------------------+  +--------+---------+
                    | POST              |  | Stripe fires     |
                    | /api/stripe/      |<-+ checkout.session  |
                    | webhook           |  | .completed event |
                    +--------+----------+  +------------------+
                             |
                   +---------v-----------+
                   | Verify webhook sig  |
                   | (STRIPE_WEBHOOK_    |
                   |  SECRET)            |
                   +---------+-----------+
                             |
              +--------------v--------------+
              | Activate plan on app_users  |
              | Update svi_accounts         |
              | grantCredits() for plan     |
              | Send payment confirmation   |
              +-----------------------------+
                             |
                             v
              +--------------+--------------+
              | Redirect: /checkout/success |
              +-----------------------------+
```

### 3. Authentication Flow

```
=== Google Sign-In ===

+-------------------+     +----------------+     +---------------------+
| User clicks       |     | POST           |     | Verify ID token     |
| "Sign in with     +--->+| /api/auth/     +--->+| via Google          |
|  Google" button   |     | google         |     | tokeninfo endpoint  |
+-------------------+     +-------+--------+     +---------+-----------+
                                  |                         |
                                  |                         v
                                  |               +---------+-----------+
                                  |               | Validate audience   |
                                  |               | matches CLIENT_ID   |
                                  |               +---------+-----------+
                                  |                         |
                                  v                         v
                       +----------+---------+    +----------+----------+
                       | loginWithGoogle()   |    | Upsert app_user     |
                       | - Find by google_id|    | (by google_id or    |
                       | - Or find by email |    |  email fallback)    |
                       | - Or create new    |    +-----------+----------+
                       +----------+---------+               |
                                  |                         v
                                  |              +----------+----------+
                                  |              | createSessionRow()  |
                                  |              | 32-char nanoid      |
                                  |              | 90-day expiry       |
                                  |              +----------+----------+
                                  |                         |
                                  v                         v
                       +----------+---------+    +----------+----------+
                       | setSessionCookie() |    | initializeCredits() |
                       | HttpOnly, SameSite |    | Grant 1 free credit |
                       | =Lax, 90-day       |    | (new users only)    |
                       +--------------------+    +---------------------+


=== Magic Link ===

+-------------------+     +----------------+     +---------------------+
| User enters       |     | POST           |     | requestMagicLink()  |
| email on login    +--->+| /api/auth/     +--->+| Generate 24-char    |
| page              |     | request        |     | token, 15-min exp   |
+-------------------+     +-------+--------+     | Save to magic_links |
                                  |               +---------+-----------+
                                  v                         |
                       +----------+---------+               v
                       | sendMagicLink()    |    +----------+----------+
                       | Email with verify  |    | User clicks link    |
                       | URL                |    | /auth/verify?token= |
                       +--------------------+    +----------+----------+
                                                            |
                                                            v
                                                 +----------+----------+
                                                 | consumeMagicLink()  |
                                                 | - Validate token    |
                                                 | - Check expiry      |
                                                 | - Flip consumed_at  |
                                                 | - Upsert app_user   |
                                                 | - Create session    |
                                                 | - Set cookie        |
                                                 | - 302 /dashboard    |
                                                 +---------------------+
```

### 4. Credit System Flow

```
+-------------------+     +---------------------+     +------------------+
| New User          |     | initializeCredits() |     | credit_balances  |
| (Google or Magic  +--->+| Grant 1 free credit +--->+| user_id: X       |
|  Link signup)     |     | reason: plan_grant  |     | balance: 1       |
+-------------------+     +---------------------+     +------------------+
                                                              |
         User uses a paid feature (e.g. SVI Analysis)        |
                                                              v
+-------------------+     +---------------------+     +------+----------+
| canAfford()       |<----+ Check: balance >= 1? |<----+ balance: 1     |
| Pre-flight check  |     | cost of feature     |     | cost: 1         |
+--------+----------+     +---------------------+     +-----------------+
         |
    +----v----+
    | allowed |
    | = true  |
    +----+----+
         |
         v
+--------+---------+     +---------------------+     +------------------+
| spendCredits()   |     | Update balance      |     | credit_balances  |
| Deduct cost      +--->+| balance = 0         +--->+| balance: 0       |
| Log transaction  |     | lifetime_spent += 1 |     +------------------+
+--------+---------+     +---------------------+
         |                                             +------------------+
         +-------------------------------------------->| credit_txns      |
         |                                             | amount: -1       |
         +-------------------------------------------->| usage_logs       |
                                                       | feature: svi_... |
                                                       +------------------+

=== Insufficient Credits ===

+-------------------+     +---------------------+
| canAfford()       |     | CreditGate          |
| allowed: false    +--->+| UI modal shows      |
| balance: 0        |     | "Buy Credit Pack"   |
| cost: 1           |     +----------+----------+
+-------------------+                |
                                     v
                          +----------+----------+
                          | POST /api/credits   |
                          | { amount: 5 }       |
                          +----------+----------+
                                     |
                                     v
                          +----------+----------+
                          | Stripe Checkout     |
                          | or direct grant     |
                          +----------+----------+
                                     |
                                     v
                          +----------+----------+
                          | Webhook:            |
                          | grantCredits()      |
                          | balance += 5        |
                          +---------------------+
```

### 5. Evidence Upload Flow

```
+-------------------+     +---------------------+     +------------------+
| EvidenceWizard    |     | POST /api/evidence  |     | Find or create   |
| User picks type:  +--->+| /upload             +--->+| svi_accounts     |
| text, url, doc    |     | (multipart/form)    |     | row for email    |
+-------------------+     +----------+----------+     +--------+---------+
                                     |                          |
                                     v                          |
                          +----------+----------+               |
                          | Validate file:      |               |
                          | - Type (PDF, DOCX,  |               |
                          |   XLSX, PNG, JPG,   |               |
                          |   CSV)              |               |
                          | - Size (max 10MB)   |               |
                          +----------+----------+               |
                                     |                          |
                                     v                          |
                          +----------+----------+               |
                          | uploadAndShare      |               |
                          | WithAdmin()         |               |
                          | - Upload to Drive   |               |
                          | - Prefix with email |               |
                          | - Share writer      |               |
                          |   access with       |               |
                          |   admin@blockid.au  |               |
                          +----------+----------+               |
                                     |                          |
                                     v                          v
                          +----------+----------+    +----------+----------+
                          | Save to             |    | Update roadmap      |
                          | svi_evidence table  |    | completion (client  |
                          | confidence_level,   |    | recalculates based  |
                          | svi_impact,         |    | on evidence count)  |
                          | webViewLink         |    +---------------------+
                          +---------------------+
```

### 6. Email Notification Flow

```
+---------------------+     +-------------------------+
| External Cron       |     | GET /api/cron/svi-notify|
| (daily, 22:00 UTC)  +--->+| Authorization: Bearer  |
|                     |     | CRON_SECRET             |
+---------------------+     +------------+------------+
                                          |
                                          v
                             +------------+------------+
                             | Load all svi_accounts   |
                             | Check enrollment dates  |
                             +------------+------------+
                                          |
                    +---------------------+--------------------+
                    |                                          |
                    v                                          v
         +----------+----------+                   +-----------+-----------+
         | Day 1 since enroll? |                   | Day 7/14/21/28...?   |
         | AND "welcome" not   |                   | AND weekly_report_wN |
         | in svi_notifications|                   | not sent yet?        |
         +----------+----------+                   +-----------+-----------+
                    |                                          |
                    v                                          v
         +----------+----------+                   +-----------+-----------+
         | sendSVIWelcome()    |                   | Fetch latest snapshot|
         | via Gmail SMTP     |                   | (svi_total, delta)   |
         | - SVI score         |                   +-----------+-----------+
         | - Stage label       |                               |
         | - Dashboard link    |                               v
         +----------+----------+                   +-----------+-----------+
                    |                               | sendSVIWeeklyReport()|
                    v                               | via Gmail SMTP      |
         +----------+----------+                   | - SVI score          |
         | Insert into         |                   | - Delta (+/-)        |
         | svi_notifications   |                   | - Week number        |
         | type: "welcome"     |                   | - Dashboard link     |
         +---------------------+                   +-----------+-----------+
                                                               |
                                                               v
                                                   +-----------+-----------+
                                                   | Insert into           |
                                                   | svi_notifications     |
                                                   | type: weekly_report_wN|
                                                   +-----------------------+


=== Growth Report (Daily Cron) ===

+---------------------+     +-----------------------------+
| External Cron       |     | GET /api/cron/growth-       |
| (daily)             +--->+| insights                    |
+---------------------+     | Authorization: CRON_SECRET  |
                             +-------------+---------------+
                                           |
                                           v
                             +-------------+---------------+
                             | Query 14 Supabase tables    |
                             | in parallel (users, leads,  |
                             | analyses, snapshots, etc.)  |
                             +-------------+---------------+
                                           |
                                           v
                             +-------------+---------------+
                             | Compute metrics:            |
                             | - signupRate, paymentRate   |
                             | - funnel drop-off           |
                             | - avgSVI, avgDelta          |
                             | - plan distribution         |
                             +-------------+---------------+
                                           |
                                           v
                             +-------------+---------------+
                             | callAI() for growth         |
                             | recommendations (3-5 items) |
                             | with fallback to rule-based |
                             +-------------+---------------+
                                           |
                       +-------------------+-------------------+
                       |                                       |
                       v                                       v
            +----------+----------+              +-------------+-----------+
            | Upsert into         |              | sendGrowthReport()      |
            | growth_insights     |              | Email to admin@blockid  |
            | table               |              | with full metrics +     |
            +---------------------+              | AI recommendations     |
                                                 +-------------------------+
```

---

## Module Dependency Map

```
+------------------+     depends on
|                  +----->  supabase.ts
|    auth.ts       +----->  credits.ts (initializeCredits)
|                  |
+--------+---------+
         ^
         |  used by
         |
+--------+---------+     +-------------------+     +-------------------+
| /api/auth/*      |     | /api/svi/*        |     | /api/stripe/*     |
| /api/svi/*       |     |                   |     |                   |
| /api/credits/*   |     | depends on:       |     | depends on:       |
| /api/evidence/*  |     |  auth.ts          |     |  auth.ts          |
| /api/term-sheet  |     |  svi-analysis.ts  |     |  stripe.ts        |
| /api/idea-est.   |     |  ai-client.ts     |     |  supabase.ts      |
| /api/svi-accts   |     |  credits.ts       |     |  credits.ts       |
| /api/stripe/*    |     |  email.ts         |     |  email.ts         |
| /api/coupon/*    |     |  slug.ts          |     |  plans.ts         |
| /api/cofounder   |     |  supabase.ts      |     +-------------------+
+------------------+     +-------------------+

+------------------+     +-------------------+     +-------------------+
| ai-client.ts     |     |  email.ts         |     | google-drive.ts   |
|                  |     |                   |     |                   |
| depends on:      |     | depends on:       |     | depends on:       |
|  @anthropic-ai   |     |  nodemailer       |     |  googleapis       |
|  openai          |     |  SMTP env vars    |     |  GOOGLE_DRIVE_*   |
|  @google/gen-ai  |     +-------------------+     |  env vars         |
|  fs (budget)     |                               +-------------------+
+------------------+     +-------------------+
                         | credits.ts        |     +-------------------+
+------------------+     |                   |     |  plans.ts         |
| svi-analysis.ts  |     | depends on:       |     |                   |
|                  |     |  supabase.ts      |     | depends on:       |
| depends on:      |     +-------------------+     |  (pure, no deps)  |
|  (pure, no deps) |                               +-------------------+
+------------------+     +-------------------+
                         |  iphash.ts        |     +-------------------+
                         |                   |     | slug.ts           |
                         | depends on:       |     |                   |
                         |  node:crypto      |     | depends on:       |
                         +-------------------+     |  nanoid           |
                                                   +-------------------+
```

---

## Security Model

### Authentication

- **No Supabase Auth** -- the platform uses a custom auth layer to avoid shipping the `anon` key to the browser
- **Server-only Supabase client** -- `import "server-only"` enforced; uses `SUPABASE_SERVICE_ROLE_KEY` which bypasses RLS
- **Google OAuth** -- ID token verified against `https://oauth2.googleapis.com/tokeninfo`; audience validated against `GOOGLE_CLIENT_ID`
- **Magic Links** -- 24-char nanoid tokens (~144 bits entropy), 15-minute expiry, single-use (`consumed_at` flag), stored in `magic_links` table

### Sessions

- **32-char nanoid tokens** (~192 bits entropy)
- **90-day fixed expiry** -- no sliding window (forces re-auth to prevent indefinite stale cookies)
- **HttpOnly cookie** -- `blockid_session`, not accessible from JavaScript
- **SameSite=Lax** -- prevents CSRF on cross-origin POST
- **Secure flag** -- enabled when served over HTTPS (detected from `NEXT_PUBLIC_SITE_URL`)
- **Session rows in DB** -- allows server-side invalidation; `last_used_at` bumped on each request (fire-and-forget)

### Transport Security

- **HSTS** -- enforced at reverse proxy level (Nginx/Caddy)
- **TLS 1.3** -- terminated at reverse proxy
- **CSP headers** -- configured at proxy level
- **CORS** -- handled by Next.js default behaviour (same-origin API routes)

### Payment Security

- **Stripe webhook signature verification** -- `stripe.webhooks.constructEvent()` with `STRIPE_WEBHOOK_SECRET`
- **Price IDs from env vars** -- never passed from client; server maps plan ID to Stripe price ID
- **Customer email from session** -- checkout uses the authenticated user's email, not client-provided

### Cron / Admin Security

- **CRON_SECRET bearer token** -- all `/api/cron/*` routes verify `Authorization: Bearer $CRON_SECRET`
- **Admin role check** -- `/api/admin/*` routes verify `user.role === "admin"` or `user.email === "admin@blockid.au"`

### Data Privacy

- **No raw IP storage** -- IPs are SHA-256 hashed with a daily-rotating salt (`iphash.ts`); same IP on different days produces different hashes
- **Email normalisation** -- all emails are trimmed and lowercased before storage to prevent duplicate accounts
- **Graceful degradation** -- if Supabase/Stripe/SMTP are not configured, the system logs warnings and falls back to demo mode rather than exposing errors

### Credit System Integrity

- **Atomic balance updates** -- credit operations use upsert with `onConflict: "user_id"` constraint
- **Pre-flight checks** -- `canAfford()` checks balance before any operation; `spendCredits()` re-verifies
- **Audit trail** -- every credit mutation is logged in both `credit_transactions` (amount, reason, balance_after) and `usage_logs` (feature, credits_used)
- **Idempotent initialization** -- `initializeCredits()` skips if the user already has a `credit_balances` row

### AI Budget Control

- **$100/month cap** -- tracked in `/tmp/blockid-ai-budget.json`; all AI calls are refused once budget is exceeded
- **Cost estimation** -- rough token-based cost tracking per model
- **Auto-fallback chain** -- Claude > OpenAI > Gemini; if primary fails, next provider is tried automatically
