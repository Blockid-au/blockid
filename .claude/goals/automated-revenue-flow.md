# Automated Revenue Flow — Email → Report → Credit → CTA Loop

## Mission
Create a fully automated system that nurtures users from first contact through to paid reports, with professional templates, micro-credit charges, and persistent CTAs at every touchpoint.

## Owner Matrix
| Role | Responsibility |
|------|---------------|
| **CRO** | Lead — conversion flow design, CTA optimization, A/B testing |
| **CMO** | Email copy, template design, brand voice |
| **CPO** | UX flow, section picker, report UI |
| **CTO** | API endpoints, cron automation, Stripe integration |
| **CFO** | Credit pricing, revenue tracking, unit economics |

## The Revenue Loop
```
User enters idea/URL → FREE preview (3 pages) → CTA: "Unlock full report"
  ↓
Pay 0.50 credits → Standard report (10 pages) → CTA: "Go deeper"
  ↓
Pay 1.50 credits → Deep Dive (extended) → CTA: "Get AI equity advice"
  ↓
Pay 1.00 credits → AI equity split → CTA: "Set up vesting"
  ↓
Pay 0.50 credits → AI vesting → CTA: "Review your cap table"
  ↓
Pay 1.50 credits → Full vesting review → CTA: "Deploy to blockchain"
  ↓
Pay 0.75 credits → Share structure → CTA: "Invite co-founders"
  ↓
Each co-founder → same loop (new SVI, new credits)
  ↓
Founder Plan A$49 → 100 credits → unlimited Standard + 66 Deep Dives
```

## Sub-goals

### SG-1: Professional Email Templates (CRO + CMO)
- [x] Design master email template (dark navy theme in email.ts) (header, body, CTA, footer)
- [x] Wording: friendly-professional, startup mentor tone, startup mentor tone
- [x] Every email has exactly 1 primary CTA button button
- [x] Every email mentions credit cost (transparent pricing) (transparent pricing)
- [x] Unsubscribe link in every email (email-preferences.ts)
- [x] 8 nurture emails (4 free + 4 paid)
- [x] Weekly report email with AI summary (weekly_summary cron)
- [ ] Report delivery email with upgrade CTA
- [x] Credit low alert email (sendCreditLowAlert, 7-day dedup) (< 1 credit remaining)
- [x] Credit purchased confirmation (Stripe webhook)

### SG-2: Report Templates with CTAs (CPO + CTO)
- [x] Every report page has contextual CTA (PAGE_CTAS mapping, 10 pages)
- [x] Standard report: "Upgrade to Deep Dive" (PAGE_CTAS + deep dive upsell banner) at page 3
- [x] Deep Dive: "Get AI equity split" (extended sections CTA) at competition page
- [x] R- [ ] R&D report: "Upload evidence to verify"D report: "Upload evidence to verify" (PAGE_CTAS on executive,product,traction,team,recommendations) on every finding
- [ ] PDF export includes "Visit blockid.au" watermark
- [ ] Shareable link has "Get your own score" CTA for viewers

### SG-3: Micro-Credit Automation (CFO + CTO)
- [x] Auto-deduct credits (spendCredits in all paid routes)
- [ ] Show credit balance in workspace header
- [x] Show credit cost before every paid action (section-picker + analyze-tier-modal) (confirmation modal)
- [x] Low credit warning (credit low alert email at <1.0)
- [x] Auto-suggest credit pack (credit gate modal shows packs)
- [x] Bundle discount comparison (REPORT_BUNDLES in section-picker)
- [ ] Receipt email after every credit spend > 1.0

### SG-4: Automated Cron Pipeline (CTO + COO)
- [ ] Daily nurture cron (send next email in sequence) — DONE
- [ ] Weekly snapshot + report cron — DONE
- [ ] Monthly re-analysis prompt email
- [ ] Credit expiry warning (if implementing expiry)
- [ ] Inactive user re-engagement (30-day, 60-day, 90-day)

### SG-5: CTA Optimization (CRO)
- [ ] Every touchpoint has max 1 primary + 1 secondary CTA
- [ ] CTA button colors: primary (brand-600), secondary (surface)
- [ ] A/B test CTA copy (3 variants per touchpoint)
- [ ] Track CTA click-through rates via analytics events
- [ ] Monthly CTA performance review

## Credit Flow Summary
| Touchpoint | Credits | What User Gets |
|------------|---------|---------------|
| Free preview | 0 | 3 pages |
| Standard report | 0.50 | 10 pages |
| Deep Dive | 1.50 | 10+ extended |
| Section (scan) | 0.10 | ~100 words |
| Section (expert) | 2.00 | ~2000 words |
| AI equity split | 1.00 | Suggestion + rationale |
| AI vesting | 0.50 | Schedule recommendation |
| AI share structure | 0.75 | Mode recommendation |
| AI ESOP | 0.50 | Pool sizing |
| AI vesting review | 1.50 | Full audit |
| Evidence upload | 0 | Free (SVI boost) |
| Investor score | 0 | Free |
| Tools (10) | 0 | Free |