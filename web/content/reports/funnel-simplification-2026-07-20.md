# Funnel Simplification + Plan-based Workspace Unlocks — 2026-07-20

## Product direction
Keep the public UI a single-purpose funnel: idea/URL → SVI → email capture →
login → workspace. Reveal workspace features progressively by plan tier so
free users see a clean, uncluttered surface and each upgrade tier adds
visible value.

## Homepage (`web/src/app/page.tsx`)
Already collapsed to the three sections required by the direction. No
removal needed:
- `HeroSearch` — funnel entry.
- `HowItWorks` — trust.
- Trust strip (Australian owned + entity line + version) — legitimacy.

Dedicated pages (`/pricing`, `/about`, `/tools/*`) untouched.

## Hero copy delta (`hero-search.tsx`)
- Placeholder + `<label>` copy: "Enter a company name, ABN, or website"
  → "Enter a company name, website, or your idea" — accepts idea text OR URL.
- Subhead: "Type a company name and get an SVI grade …"
  → "Type a company name, website, or your idea and get an SVI grade …".
- New one-line hint below the CTA button: "Get the full report by email" —
  pre-commits the outcome before the user submits.
- No new inputs. Search field untouched.

## Progressive workspace nav (`nav-groups.ts`)
Tier map: `free` → registered, no paid plan. `starter` → Founder tier
(paid entry). `growth` → mid. `scale/enterprise` → Unlimited.

Free core (visible to everyone signed in):
- Overview: My Startups, SVI Score, New Analysis, Action Plan.
- Weekly Reports (report history) — un-gated (was starter).
- Account: My Profile, Founder Profile, Billing, Notifications, Referrals.

Founder unlocks (`minPlan: starter`):
- Build & Validate: Evaluation (13), Evidence Vault, Knowledge Base.
- Ownership & Equity: Equity Setup, Equity Split, Cap Table, Shareholders,
  ESOP Setup, Vesting.
- Fundraise: VC Valuation, CFO Advisor, Finance P&L, ESOP Manager, Team &
  Salaries, Fundraise Readiness, Data Room, Raise Capital, Documents.

Growth unlocks (`minPlan: growth`):
- Metrics.
- ESOP Manage.
- Grow & Scale: Revenue, Dividends, Exit Modeling.
- Accelerator Tracker, Accelerator Criteria.
- Advisor Portal (was scale — pulled down one tier).

Unlimited unlocks (`minPlan: scale` / `enterprise`):
- Wallet (was ungated — now scale).
- Blockchain Sync (scale).
- Growth Journal (was ungated — now scale).
- Equity Offer (scale).
- White-label (scale).
- Custom Branding, API Keys, SSO (enterprise).

Segment-gated groups (Investor / Advisor / Accelerator) untouched — those are
audience filters, not tier gates.

## Unlock pulse
Inlined `UnlockPulseCard` component in `workspace-layout.tsx`. Renders once
for `planId === "free"` (or legacy `founder_free`), dismissible, persistent
via `localStorage["blockid_unlock_pulse_dismissed"]`. Uses
`useSyncExternalStore` so SSR and CSR agree on the initial hidden state
without a `useEffect`+`setState` flip. Existing `UpgradePrompt` (low-credit
trigger) left in place — different trigger, different key, no duplication.

## Verification
- `npx tsc --noEmit`: clean.
- `npx eslint` on all touched files: clean.
- Homepage still SSR-safe, sidebar unchanged in shape.
