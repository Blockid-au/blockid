# Goal: CEO Daily Summary Email + User Metrics Chart

## Vision
Every day at 9AM AEST, admin@blockid.au receives a comprehensive email summarizing:
- All C-Level agent activities
- New user signups
- Revenue metrics
- System health
- User growth chart (increasing trend)

## Email Structure

### Subject: "BlockID Daily: {new_users} new users | {analyses} analyses | {status}"

### Content
1. **Executive Summary** (3 bullets)
   - Platform status: GREEN/YELLOW/RED
   - New users today: X (total: Y)
   - Revenue today: A$X (MRR: A$Y)

2. **Agent Activity Table**
   | Agent | Tasks | Key Finding | Action |
   |-------|-------|-------------|--------|
   | COO | 5 checks | UX issue on mobile | PR opened |
   | CTO | 3 checks | Build clean | No issues |
   | CFO | 4 checks | Conversion 12% | Proposed CTA change |
   | RnD | 2 fixes | Competitor shipped X | Feature proposal |

3. **User Growth Chart** (inline HTML)
   - Bar chart showing daily new users (last 14 days)
   - Line showing cumulative total
   - Highlight today's bar in brand color

4. **User Feedback Summary**
   - New feedback count
   - Credits awarded
   - Top feedback quote

5. **Alerts** (if any)
   - Model quota warnings
   - Security issues
   - Failed deployments

## Implementation
- Cron endpoint: POST /api/cron/daily-ceo-summary
- Reads from: user_actions, credit_transactions, app_users, user_feedback
- Generates inline HTML chart (no external dependencies)
- Sends via existing email system (SMTP + Resend fallback)

## Dashboard User Metrics Widget
- New component: UserGrowthChart
- Shows daily new users (bar) + cumulative (line) for last 14 days
- Placed on admin dashboard (/admin)
- Auto-refresh every 5 minutes
- Click any bar → see that day's signups

## Agent Assignments
- CTO: build cron endpoint + email template + chart component
- COO: ensure all agent reports are saved to web/content/reports/
- CDO: ensure user_actions tracks all signups with timestamps
- CMO: use daily email data for marketing decisions