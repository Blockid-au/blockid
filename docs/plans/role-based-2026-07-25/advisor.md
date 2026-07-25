# Advisor — Role Design (Independent Advisor)

**Role key:** `advisor` (segment + account_type)
**Distinguish from:** Mentor (informal, programme-tied). Advisor has a *formal, ongoing engagement* — typically paid retainer or advisory equity — with 3-10 startups.

---

## 1. Persona

An ex-founder or domain expert (SaaS, fintech, biotech, gov-sales) who advises 3-10 Australian startups under formal advisory agreements — usually 0.25%-1% advisory equity or a monthly retainer. They rarely execute; they diagnose. Motivated by portfolio prestige, downstream carry, and long-arc relationships that convert into board seats or angel cheques. Success = **client SVI moves up quarter-over-quarter**, clients close funding rounds they warm-introed, and their equity in the roster compounds. They live in dashboards, hate data entry, and want to walk into every Zoom knowing what changed since last time.

## 2. Top 5 Goals

1. Keep a **live portfolio view** of every client's SVI trend, stage, and last-touch date — one screen, no scrolling.
2. Log **engagement notes** after every session so the next quarterly review writes itself.
3. Spot **which client needs help this week** (SVI dip, missed check-in, fundraise stalled) before the client asks.
4. Track their **advisory equity / vesting position** across the whole roster (Corporations Act 200 shares, ESIC eligibility).
5. Warm-intro clients to **investors on BlockID** and get credit / carry visibility when a round closes.

## 3. First 7 Days

| Day | Goal | Actions |
|-----|------|---------|
| 1 | Onboard as advisor | Complete onboarding wizard picking "Advisor" segment; land on `/dashboard/advisor`; take the 5-step feature tour |
| 2 | Invite first 3 clients | Send `/api/advisor/invite` for each founder; pin the 3 pending invites at top of roster |
| 3 | See first roster row light up | First client accepts → SVI + stage populate; open their profile from the roster |
| 4 | Log first engagement note | On `/workspace/advisor-notes?client=<id>`, add a "Kickoff call" note with next-check-in date |
| 5 | Turn on weekly digest | `/workspace/weekly-digest` — opt into Monday 8am AEST digest of SVI deltas |
| 6 | Record advisory equity terms | (missing today) Log advisory equity %, vesting cliff, ESIC status per client |
| 7 | First warm intro | From client roster, forward client's `/dashboard/investor-links` sharable link to a warm investor contact |

## 4. Daily Workflow (typical morning)

- Open `/dashboard/advisor` — glance at the 3-tile summary (Total clients, Avg SVI, Analysed this month).
- Scan client table sorted by **SVI delta desc** (missing: sort control) — flag red bars.
- Click into 1-2 clients with the largest movement to read their latest SVI report.
- Add a 30-second engagement note per client touched (`/workspace/advisor-notes`).
- Check `weekly-digest` inbox summary if it's Monday; forward interesting deltas to the founder.
- Review pending advisor invites, resend any stuck > 7 days.
- If a client is fundraising: open their `/dashboard/investor-links` and forward to 2 warm investors.
- Log the day's total client-hours (missing today — needed for advisory-agreement invoicing).

## 5. Menu Groups (exactly what the advisor should see)

Per `role-menu-overlay.ts:advisor` — hide `Validate`, `Scale & Exit`; keep `Home`, `Roles`, `Build`, `Fundraise`, `Account`. Trim `Build` and `Fundraise` to the read-only slices an advisor actually consults on behalf of clients.

**Group 1 — Home**
- Advisor Portal → `/dashboard/advisor` (feature: `advisor_portal`)
- Feed → `/dashboard/feed`

**Group 2 — Advisor (Roles.advisor)**
- Client Roster → `/workspace/client-roster` (feature: `advisor_portal`)
- Engagement Notes → `/workspace/advisor-notes` (feature: `advisor_portal`)
- Weekly Digest → `/workspace/weekly-digest` (feature: `weekly_delta`)
- Advisory Equity → `/workspace/advisor/equity` **(MISSING)** (feature: `advisory_equity`)

**Group 3 — Client Insights (Read-only helper slice of Build + Fundraise)**
- Client SVI Trends → `/workspace/advisor/trends` **(MISSING)** (feature: `advisor_portal`)
- Client Data Rooms (read) → `/dashboard/data-room?client=<id>` (feature: `data_room.read`)
- Client Investor Links → `/dashboard/investor-links?client=<id>` (feature: `investor_links`)

**Group 4 — Account**
- Billing → `/workspace/billing`
- Profile → `/workspace/profile`
- Advisor Firm Branding → `/workspace/branding` (feature: `pdf_branding`, gated)

**Hidden entirely:** Validate (Idea, SVI runner for own startup), Build (Cap table, Vesting, ESOP write, Tokenisation), Scale & Exit (Exit Benchmark, Founder-facing dashboards), Reseller, Mentor.

## 6. Feature Map

| Feature | Surface (path/href) | Status | Notes |
|---|---|---|---|
| Client roster | `/dashboard/advisor` + `/workspace/client-roster` | exists | two overlapping views — should consolidate |
| Invite founder | `POST /api/advisor/invite` (modal on `/dashboard/advisor`) | exists | needs resend + cancel controls |
| Engagement notes | `/workspace/advisor-notes` + `/api/advisor/notes` | exists | no per-client timeline sort/filter |
| Weekly digest | `/workspace/weekly-digest` | partial | opt-in exists; cron sender not verified |
| Portfolio SVI trend chart | (none) | missing | needed for QoQ delta reporting |
| Advisory equity tracker | `/workspace/advisor/equity` | missing | `advisory_equity` feature slug reserved, no UI |
| Warm-intro to investor | `/dashboard/investor-links` (founder-owned) | partial | advisor can view but no "forward to my investor rolodex" button |
| Client fundraise status | `/dashboard/fundraise` (founder view) | partial | no advisor-scoped read-only cut |
| Client data room read-only | `/dashboard/data-room` | partial | founder-owned; needs advisor RLS scope |
| Client check-in scheduler | (none — mentor has `/api/mentor/check-ins`) | missing | reuse mentor pattern for advisor cohort |
| Time / hours logging | (none) | missing | needed for retainer invoicing |
| Advisor firm branding on client PDFs | `/workspace/branding` | partial | `pdf_branding` gate exists, no per-firm logo per client |
| Client health alert (SVI dip, stalled fundraise) | (none) | missing | notification pipeline required |
| Advisor onboarding wizard step | `web/src/components/onboarding/step-segment.tsx` | exists | Advisor is one of the 5 offered segments |
| Feature tour | `product-tour/feature-tours.ts` — reseller/dashboard-nav | missing | no `advisor` tour slug |
| Advisor sidebar overlay | `role-menu-overlay.ts:advisor` | exists | already tuned (hides Validate, Scale & Exit) |
| Advisor API scope (RLS) | `advisor_clients` + `advisor_invites` migration 0058 | exists | `service_role` policy only — needs authenticated RLS |
| Portfolio export (CSV/PDF for LP/board) | (none) | missing | for advisors who bill quarterly-review docs |

## 7. Missing Features (concrete)

1. **Portfolio SVI trend chart** — one page graphing SVI over time for every roster client on a single small-multiples grid, with QoQ deltas as chips.
2. **Advisory equity tracker** — table of {client, equity %, vest start, cliff, ESIC status, current implied value from client SVI valuation}, backed by an `advisory_equity_grants` table.
3. **Client check-in scheduler** — mirror `/api/mentor/check-ins` for advisors so the roster shows "next check-in" per client and auto-nudges the advisor 24 h before.
4. **Client health alerts** — SVI drop > 10 pts, no analysis in 30 days, fundraise round stalled — pushed to advisor via in-app + email.
5. **Warm-intro workflow** — advisor forwards a client's investor pack to a chosen investor with attribution; if the round closes, the advisor sees "referral: closed" in the roster.
6. **Time / hours log per client** — micro-form on the notes screen; monthly summary exportable as an invoice PDF.
7. **Firm branding per client PDF** — advisor uploads their firm logo once; client SVI reports rendered while under this advisor's engagement carry a "Advised by <firm>" footer.
8. **Roster CSV / quarterly board-pack export** — one-click bundle: portfolio SVI table + per-client 1-pager PDF, for advisor to hand to their own LP or fund GP.
9. **Advisor product tour slug** — add `"advisor"` to `FeatureTourSlug`, wire spotlight steps on `/dashboard/advisor`.
10. **Authenticated RLS on `advisor_clients` + `engagement_notes`** — currently `service_role`-only; every advisor read must round-trip through server route handlers, which blocks any future client-side realtime.

## 8. Onboarding Tour (6 steps)

Targeted at first-visit `/dashboard/advisor`. Anchor selectors correspond to elements already in `advisor-client.tsx`.

1. **Welcome** — anchor `h1:contains('Advisor Portal')` — "This is your advisor cockpit. Every startup you advise lives here."
2. **Summary tiles** — anchor `.grid.grid-cols-3` (summary bar) — "Portfolio size, average SVI, and how many you've reviewed this month. Green tile = healthy portfolio."
3. **Invite first client** — anchor `button:contains('Add client')` — "Send a founder an invite. Once they accept, their SVI + stage flow into your roster automatically." → CTA to open modal.
4. **Roster table** — anchor `table` — "Sortable by SVI, stage, or last analysis. Click any row to open that client's full profile."
5. **Log a note** — anchor `a[href^='/workspace/advisor-notes']` (or add data-tour attr) — "After every session, log a 30-second engagement note. Quarterly reviews write themselves."
6. **Weekly digest** — anchor `a[href='/workspace/weekly-digest']` — "Turn on the Monday 8am digest — SVI deltas across your whole roster, one email."

## 9. Guiding Copy

- **Landing hero:** *"Your advisory portfolio, one screen. Track every client's SVI trend, log the session, spot who needs you this week."*
- **Empty state (no clients yet):** *"No clients on your roster yet. Invite your first founder — once they accept, their SVI, stage, and fundraise status appear here automatically."*
- **Next-step recommender:** *"Client `{name}`'s SVI dropped `{delta}` points this week — {suggested action: schedule check-in / review data-room / forward to warm investor}."*
