# Goal 5B — Investor Pack v2 (one-click generation)

**Owner:** CPO (primary) + CTO + CFO (co-owners)
**Status:** Planned — Q1 2027 target
**Baseline:** v2.0.0-beta.7 (git sha `1e747b4`)
**Source:** `docs/IMPLEMENTATION-PLAN-v3.1-amended.md` §4 Goal 5B
**Task ID range:** `T-1201` .. `T-1212`
**Size:** 5 weeks (was 3 weeks in v3.1 — extended to include share-link + view-tracker + investor-response funnel)

---

## 1. Rationale

Investor Pack v1 (v3 Phase C task T-0715) ships a `<InvestorPackBuilder>` component that requires the founder to hand-compose sections. Investor Pack v2 removes that friction: one click, one PDF, five seconds. It is the artefact that justifies the Growth/Scale tier upsell.

### 1.1 The composition step is where founders drop off

The v3 Phase C builder assumes the founder will:
1. navigate to `/workspace/investor-pack`,
2. pick a template,
3. drag sections in a preferred order,
4. edit each section,
5. preview,
6. export.

Six steps between intent and artefact. Startup founders in an active fundraise cycle do not have the calendar space for six-step artefact generation — they have a partner meeting in 90 minutes and need a PDF now. The one-click flow collapses steps 2-5 into a single server-side render, retaining preview + edit as OPTIONAL after generation.

### 1.2 All the ingredients already live in workspace state

By v2.1 close (per v3.1 plan), the workspace contains:

- **SVI score** (v3 T-0511, 13-criteria multi-agent scoring) — canonical source: `svi_reports` table joined with `svi_report_evidence`.
- **Cap table** (v3 T-0606, cap-table CRUD + waterfall) — canonical source: `cap_table_shares` + `cap_table_options`.
- **Traction chart** (T-1009 wires `svi_score_computed`, `criterion_score_updated` events into a time series) — canonical source: `analytics_events` table filtered by `user_id`.
- **Team + founder profile** — canonical source: `founder_profiles`, `team_members` tables.
- **Financials** (v3 T-0605 valuation history, T-1007 real MRR view) — canonical source: `valuation_snapshots`, `v_mrr_active`.
- **Disclaimer footer** — canonical source: `disclaimer_registry` table (per beta.4 legal work), stamped by `web/src/lib/pdf/disclaimer-footer.ts`.

Every ingredient is queryable by `user_id` or `project_id`. The one-click endpoint composes them, renders, and returns a PDF binary.

### 1.3 The investor-pack event is the first measurable post-checkout conversion

Per CDO review §4 event #5 (T-1009), `investor_pack_generated` is one of the 6 net-new analytics events. It is the first measurable engagement moment beyond `checkout_completed`:

```
checkout_completed → [???] → activation-worthy event
```

Currently the arrow is empty. `investor_pack_generated` fills it. Every Growth/Scale subscriber who generates a pack in the first 30 days has crossed a real activation threshold, and every subscriber who does NOT is a churn candidate the CRO cron can target.

### 1.4 Share links = viral distribution

A generated pack ships with an optional share link. The link opens a hosted preview at `/pack/<share_id>` with `robots: noindex` (private), view tracking, and a light-touch upsell strip at the bottom ("Built with BlockID.au — get your own investor pack in 2 minutes"). Every investor who receives the pack becomes an inbound funnel touchpoint at zero CAC.

---

## 2. User journey

### 2.1 Entry point — workspace CTA

Founder is on `/workspace` after checkout. A new tile appears in the workspace dashboard: "Investor Pack ready to generate — 1 click, 5 seconds". The tile is emphasised (brand-tinted border, "New" chip) for the first 30 days of the subscription and moves into the standard tile grid afterward.

### 2.2 Preview + Generate

Clicking the CTA opens `/workspace/investor-pack`:

```
┌────────────────────────────────────────────────────────────┐
│  Investor Pack                                             │
│  ────────────────────────────────────────────────────────  │
│                                                            │
│  Ready to generate. Preview below.                         │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ [Cover page thumbnail]                               │  │
│  │ [SVI page thumbnail]                                 │  │
│  │ [Cap table thumbnail]                                │  │
│  │ [Traction thumbnail]                                 │  │
│  │ [One-page teaser thumbnail]                          │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  Contents: Cover • SVI Score • Cap Table • Traction • ...  │
│                                                            │
│  [ Generate PDF ]   [ Customise sections ]                 │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

Clicking "Generate PDF" fires `POST /api/investor-pack/one-click`, streams the PDF back, and downloads it. Target render time < 5 seconds for a 15-page pack.

Clicking "Customise sections" opens the v3 Phase C `<InvestorPackBuilder>` — the manual flow is preserved as an escape hatch, not the default.

### 2.3 Post-generate — share link creation

After the download completes, the page updates to show:

```
┌────────────────────────────────────────────────────────────┐
│  Pack generated. What next?                                │
│                                                            │
│  [ Download again ]  [ Create share link ]  [ Email to VC ]│
│                                                            │
│  Share link: https://blockid.au/pack/abc123def456          │
│  Expires: 30 days • Views: 0 • [ Copy ]  [ Revoke ]        │
└────────────────────────────────────────────────────────────┘
```

The share link is a hashed opaque ID mapped to a stored PDF blob in Supabase storage. Each open of the link records a view event with IP-derived country + UA-derived device + referrer.

### 2.4 Investor view

Investor clicks the share link:

- `/pack/<share_id>` renders a hosted PDF viewer (browser-native `<iframe>` on the storage-signed URL).
- Robots blocked (`noindex, nofollow`).
- Footer strip: "Built on BlockID.au. Get your own investor pack in 2 minutes → [ Try free ]".
- View event fires with `share_link_view` (T-1009).

Founder gets a notification: "Your pack was viewed by IP xx.xx.xx.xx from Sydney AU 4 hours ago" via existing notification system (`web/src/app/workspace/notifications/*`).

### 2.5 Investor response conversion

The share-link viewer strip includes a subtle CTA visible only to non-logged-in users: "Reply to founder →". Clicking opens a lightweight `/pack/<share_id>/reply` form (name + email + message) that:

- Sends the founder an email via `web/src/lib/email.ts`.
- Fires `investor_response_captured` event (net-new, added to T-1009 scope).
- Creates a lead row in `investor_leads` table for the founder's CRM.

This closes the loop: founder generates → investor views → investor responds → founder sees response in workspace.

---

## 3. Architecture

### 3.1 Component map

```
                            /workspace/investor-pack
                                     │
                                     ▼
                             preview API GET
                        (`/api/investor-pack/preview`)
                                     │
                                     ▼
                       assemble sections from workspace state
                                     │
                                     ▼
                     return preview thumbnails + section metadata
                                     │
                                     ▼
                     [Founder clicks "Generate PDF"]
                                     │
                                     ▼
                             POST /api/investor-pack/one-click
                                     │
                                     ▼
        web/src/lib/pdf/investor-pack.tsx (@react-pdf/renderer)
                                     │
                          renders 15-page PDF
                                     │
                     ┌───────────────┼───────────────┐
                     ▼               ▼               ▼
              Supabase storage    Return PDF     Fire event
              (private bucket)    binary         `investor_pack_generated`
                     │
              share_link creation
                     │
                     ▼
              investor_pack_shares
              (share_id, pdf_url, expires_at)
```

### 3.2 File layout

```
web/src/lib/pdf/
  investor-pack.tsx                (top-level React-PDF component)
  investor-pack/
    cover.tsx                      (cover page)
    svi-page.tsx                   (SVI score + 13 criteria)
    cap-table-page.tsx             (cap table + waterfall)
    traction-page.tsx              (Recharts SSR → PNG → embed)
    team-page.tsx                  (founder + team)
    financials-page.tsx            (MRR/ARR/burn/runway)
    one-page-teaser.tsx            (single-page condensed version)
    disclaimer-footer.tsx          (reuses lib/pdf/disclaimer-footer.ts)
    types.ts                       (InvestorPackData interface)
    assemble.ts                    (workspace state → InvestorPackData)

web/src/app/api/investor-pack/
  one-click/route.ts               (POST: assemble + render + return PDF)
  preview/route.ts                 (GET: thumbnails + section metadata)
  share/route.ts                   (POST: create share link)
  share/[shareId]/route.ts         (GET: return signed URL to PDF blob)
  share/[shareId]/reply/route.ts   (POST: capture investor response)

web/src/app/pack/[shareId]/
  page.tsx                         (hosted viewer for shared pack)
  reply/page.tsx                   (investor response form)

web/src/app/workspace/investor-pack/
  page.tsx                         (already exists v3 Phase C; extend with one-click CTA)

web/supabase/migrations/
  0090_investor_pack_shares.sql    (share_link + view tracking)
  0091_investor_leads.sql          (investor response CRM)
```

### 3.3 The `investor-pack.tsx` template

Top-level PDF component built on `@react-pdf/renderer` (already in deploy `serverExternalPackages` list per CTO review §1). Structure:

```
<Document>
  <Cover data={data.cover} />
  <SVIPage data={data.svi} />
  <CapTablePage data={data.capTable} />
  <TractionPage data={data.traction} />
  <TeamPage data={data.team} />
  <FinancialsPage data={data.financials} />
  <OnePageTeaser data={data.teaser} />  {/* rendered last for detachability */}
  <DisclaimerFooter registry={data.disclaimers} />  {/* stamped on every page */}
</Document>
```

Total: 7 section components, 1 disclaimer footer, 1 assemble helper. Each section renders standalone in ≤ 3 pages so page count stays under 15.

### 3.4 Server-side rendering path

`POST /api/investor-pack/one-click` handler:

```
1. auth check (Supabase server client)
2. entitlement gate (assert plan in [founder_growth, founder_scale, agency, enterprise])
3. rate limit (10 packs / day per user)
4. call assemble(userId, projectId) → InvestorPackData
5. render pack via renderToBuffer(<InvestorPack data={...} />)
6. write to Supabase storage bucket `investor-packs` with path `<user_id>/<project_id>/<timestamp>.pdf`
7. record analytics event `investor_pack_generated` (T-1009 event)
8. return PDF binary with Content-Disposition: attachment
```

Blocking wall time target: < 5s at p95. Bottleneck expected in step 5 (React-PDF render). Mitigate with:

- Recharts chart pre-rendered to PNG in step 4 (not step 5).
- Font loading via `fontkit` (already in `serverExternalPackages`).
- No network calls in step 5 (all embed data pre-loaded).

### 3.5 Traction chart pipeline

Traction chart is the highest-risk section for render time. Approach:

1. Query `analytics_events` for `svi_score_computed` events over last 90 days.
2. Bucket by day; produce a 90-point time series.
3. Render Recharts `<LineChart>` server-side via `@react-pdf/renderer` `<Chart>` + `svg2img` OR pre-generated PNG.
4. Fall back to native `<Path>` if Recharts SSR misbehaves.

Alternate approach if Recharts SSR proves flaky: hand-drawn PDF path via `@react-pdf/renderer` `<Svg>` + `<Polyline>`. Zero external dep, fully deterministic.

### 3.6 Share link model

```
investor_pack_shares (
  share_id text primary key,           -- opaque random 24-char
  user_id uuid not null,
  pdf_storage_path text not null,      -- e.g. investor-packs/<uid>/<pid>/<ts>.pdf
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,     -- default now() + 30 days
  revoked_at timestamptz,
  view_count integer not null default 0
);

investor_pack_share_views (
  view_id uuid primary key default gen_random_uuid(),
  share_id text not null references investor_pack_shares(share_id),
  viewed_at timestamptz not null default now(),
  ip_country text,                     -- from Cloudflare CF-IPCountry
  ua_device text,                      -- from UA parser
  referrer text
);
```

Note: raw IP is NOT stored per Privacy Act minimisation. Only country-level. UA is parsed to device class (desktop/mobile/tablet) not full string.

### 3.7 Investor response model

```
investor_leads (
  lead_id uuid primary key default gen_random_uuid(),
  user_id uuid not null,               -- founder receiving the response
  share_id text not null references investor_pack_shares(share_id),
  name text not null,
  email citext not null,
  message text,
  captured_at timestamptz not null default now(),
  contacted_at timestamptz,
  outcome text                         -- future: won/lost/no-reply/scheduled
);
```

Reply form is protected by Turnstile (Cloudflare CAPTCHA) to prevent bot spam. Rate limit 3 replies per share_id per IP per day.

### 3.8 Preview endpoint

`GET /api/investor-pack/preview?project_id=<pid>` returns:

```
{
  sections: [
    { key: "cover",       label: "Cover",         page_range: [1, 1] },
    { key: "svi",         label: "SVI Score",     page_range: [2, 3] },
    { key: "cap_table",   label: "Cap Table",     page_range: [4, 5] },
    { key: "traction",    label: "Traction",      page_range: [6, 7] },
    { key: "team",        label: "Team",          page_range: [8, 9] },
    { key: "financials",  label: "Financials",    page_range: [10, 12] },
    { key: "teaser",      label: "One-pager",     page_range: [13, 13] }
  ],
  thumbnails: [
    { key: "cover",       png_data_url: "data:image/png;base64,..." },
    ...
  ],
  data_completeness: {
    svi_ready: true,
    cap_table_ready: true,
    traction_ready: false,       // e.g. < 7 days of data
    team_ready: true,
    financials_ready: true
  }
}
```

Thumbnails are pre-rendered at generation time from a template with placeholder data; they update when the founder generates a real pack. This keeps preview instant (< 200ms) at the cost of a slight lag between real-data refresh and thumbnail refresh.

### 3.9 Entitlement gate

Investor Pack v2 is a Growth+ feature. Plans allowed: `founder_growth`, `founder_scale`, `agency`, `enterprise`. Not available on `founder_starter` or `founder_trial`.

Trial users see the CTA but clicking it opens the `<UpgradeModal>` (per T-1001 wiring). The `feature_gate_hit` trigger fires with `trigger_id: "investor_pack_v2"`.

### 3.10 Interaction with existing PDF infra

Existing PDFs in `web/src/lib/pdf/`:
- `founder-pack-pdf.tsx` (founder-facing playbook)
- `fundraising-report-pdf.tsx` (fundraise-status report)
- `pitch-deck-pdf.tsx` (pitch deck)
- `score-pdf.tsx` (SVI score export)
- `svi-report-pdf.tsx` (multi-agent SVI report)
- `valuation-report-pdf.tsx` (valuation output)

`investor-pack-pdf.tsx` (v3 Phase C T-0715) is the v1. Goal 5B introduces `investor-pack.tsx` as the v2 replacement — same directory, new file. v1 remains callable for the "Customise sections" escape-hatch flow.

Font handling, disclaimer footer, and page geometry are shared with the other 6 PDFs — nothing new to build there.

---

## 4. Task list T-12xx

Effort: S=1 (≤4h), M=2 (≤1d), L=3 (≤3d). WSJF = (bv+tc+rr)/effort.

| id | task | effort | bv | tc | rr | wsjf | dependencies |
|----|------|--------|----|----|----|------|--------------|
| T-1201 | `web/src/lib/pdf/investor-pack.tsx` top-level Document + section stubs (cover, SVI, cap-table, traction, team, financials, teaser) | L | 5 | 4 | 3 | 4.0 | v3 T-0715 InvestorPackBuilder scaffolding present |
| T-1202 | `web/src/lib/pdf/investor-pack/assemble.ts` — workspace state → `InvestorPackData` composer | M | 5 | 4 | 3 | 6.0 | T-1201, v3 T-0606 (cap table), v3 T-0511 (SVI 13-criteria), T-1007 (v_mrr_active) |
| T-1203 | `POST /api/investor-pack/one-click` route handler + entitlement gate + rate limiter + storage write | M | 5 | 5 | 3 | 6.5 | T-1201, T-1202 |
| T-1204 | `GET /api/investor-pack/preview` route + thumbnail cache + `data_completeness` shape | M | 4 | 3 | 2 | 4.5 | T-1201 |
| T-1205 | Migration `0090_investor_pack_shares.sql` (shares + views tables) + RLS | S | 4 | 4 | 4 | 12.0 | none |
| T-1206 | `POST /api/investor-pack/share` — create share link, opaque ID, 30-day default expiry | S | 5 | 4 | 3 | 12.0 | T-1205 |
| T-1207 | `GET /pack/[shareId]/page.tsx` — hosted viewer (iframe over signed storage URL) + noindex + view tracking | M | 5 | 4 | 3 | 6.0 | T-1206 |
| T-1208 | `POST /pack/[shareId]/reply` — investor response form + Turnstile + `investor_leads` write | M | 4 | 3 | 3 | 5.0 | T-1205, migration `0091_investor_leads.sql` |
| T-1209 | Wire 3 net-new analytics events (`investor_pack_generated`, `share_link_view`, `investor_response_captured`) into the T-1003 registry (per T-1009 pattern) | S | 4 | 4 | 4 | 12.0 | T-1003 registry live |
| T-1210 | Workspace tile + CTA on `/workspace` (30-day-emphasis + notification wiring for view events) | M | 4 | 3 | 2 | 4.5 | T-1203, T-1207 |
| T-1211 | Traction chart SSR pipeline: Recharts LineChart → SVG → embed OR fallback native React-PDF `<Polyline>` | M | 4 | 3 | 3 | 5.0 | T-1201 |
| T-1212 | Playwright regression `investor-pack.spec.ts` — one-click generate under 5s, share link creates, view event fires, reply captures | M | 3 | 3 | 4 | 5.0 | T-1203, T-1206, T-1207, T-1208 |

12 tasks. WSJF-ordered priority: T-1205 / T-1206 / T-1209 (12.0), T-1203 (6.5), T-1202 / T-1207 (6.0), T-1208 / T-1211 / T-1212 (5.0), T-1204 / T-1210 (4.5), T-1201 (4.0).

T-1201 has low WSJF but is a hard blocker for 5 downstream tasks; sequence first.

---

## 5. Success metrics

### 5.1 Packs generated per week

- **Target:** ≥ 20% of `founder_growth`/`founder_scale` subscribers generate ≥ 1 pack within first 30 days (per v3.1 amendment).
- **Measurement:** `count(distinct user_id) filter (where event = 'investor_pack_generated' AND ts within 30d of subscription_start) / count(distinct user_id) filter (where plan in ('founder_growth','founder_scale') AND created_at within 30d)`. Requires T-1009 event wired.
- **Baseline:** UNKNOWN. No user has generated a v2 pack today. Measure weekly after ship.
- **Instrumentation:** analytics dashboard `Growth/Investor Pack Adoption` powered by BQ export (T-1010).

### 5.2 Share links created per pack

- **Target:** ≥ 40% of generated packs get at least one share link created.
- **Measurement:** `count(distinct pack_id) with share / count(distinct pack_id)` over 30-day window.
- **Baseline:** UNKNOWN. Baseline is 0 until launch. Measure weekly.
- **Instrumentation:** `investor_pack_shares` table.

### 5.3 Share-link opens per share

- **Target:** ≥ 2 opens per share (indicating founder actually distributes the link — 1 open would be the founder testing the link).
- **Measurement:** `avg(view_count) from investor_pack_shares where created_at within 30d`.
- **Baseline:** UNKNOWN.
- **Instrumentation:** `investor_pack_share_views` table.

### 5.4 Investor-view → founder-response conversion

- **Target:** ≥ 5% of share-link opens produce an `investor_response_captured` event.
- **Measurement:** `count(investor_leads) / count(share_link_view)` over 30-day window.
- **Baseline:** UNKNOWN. Best-case cold-outbound SaaS response rate benchmark is 3-8%; investor packs are warm-inbound so 5% is a realistic floor.
- **Instrumentation:** `investor_leads` table joined with `investor_pack_share_views`.

### 5.5 Generation wall time

- **Target:** p95 < 5s for a 15-page pack.
- **Measurement:** `web/content/reports/api-perf.jsonl` populated by API middleware timing.
- **Baseline:** UNKNOWN. First pack in staging will set the ceiling.
- **Instrumentation:** `Server-Timing` header on `/api/investor-pack/one-click` responses.

### 5.6 Reply → founder-outreach conversion

- **Target:** ≥ 60% of `investor_leads` rows have `contacted_at` populated within 48h.
- **Measurement:** `avg(case when contacted_at is not null AND contacted_at < captured_at + interval '48h' then 1 else 0 end)`.
- **Baseline:** UNKNOWN. This is a founder-behaviour metric not a product metric; may need a workspace nudge if it falls below 40%.

### 5.7 Pack → checkout uplift

- **Target:** users who generate ≥ 1 pack in first 30 days retain at 1.5× the rate of users who do not.
- **Measurement:** cohort retention join between `analytics_events` (pack_generated) and `subscriptions` (still active at day 90).
- **Baseline:** UNKNOWN. Requires 90 days of post-launch data.

---

## 6. Five-week rollout

### Week 1 — PDF template + assembler

- Ship T-1201 (top-level Document + 7 section stubs with placeholder content).
- Ship T-1202 (assemble.ts pulling from workspace tables).
- Ship T-1205 (migration `0090_investor_pack_shares.sql`).
- Ship T-1209 (analytics event wiring — depends on T-1003 registry from Phase A).
- Manual test: render for a seed founder account, verify 15-page PDF outputs correctly.

Exit criteria for Week 1: PDF renders in < 8s for a seed account with all workspace data present. Storage bucket + RLS validated.

### Week 2 — One-click endpoint + storage

- Ship T-1203 (POST /api/investor-pack/one-click).
- Ship T-1206 (share link creation).
- Ship T-1204 (preview endpoint + thumbnail cache).
- Ship T-1211 (traction chart SSR).
- Beta cohort: enable feature flag `INVESTOR_PACK_V2_BETA` for internal accounts + 3 friendly founders.

Exit criteria for Week 2: 5 internal-generated packs pass QA readback; wall time < 6s.

### Week 3 — Share viewer + investor path

- Ship T-1207 (`/pack/[shareId]`).
- Ship T-1208 (investor reply form).
- Migration `0091_investor_leads.sql`.
- Turnstile integration on reply form.
- Extend beta cohort to 15 accounts.

Exit criteria for Week 3: 3 share links viewed by external users; 1 investor response captured end-to-end.

### Week 4 — Workspace surface + notifications

- Ship T-1210 (workspace tile + CTA + notification wiring).
- Ship T-1212 (Playwright regression).
- Wire T-1001 upgrade modal on trial-user click of the CTA.
- Fine-tune data-completeness thresholds (what does "traction not ready" mean — < 7 days data? < 30 days?).

Exit criteria for Week 4: Playwright green; all beta users can generate + share + view + reply.

### Week 5 — GA + measurement

- Retire feature flag; enable for all Growth+ subscribers.
- Ship a CRO trigger `investor_pack_generated` (T-1009) that fires the day-3 activation modal (per T-1020) for users who have NOT generated within 3 days.
- Land the analytics dashboard `Growth/Investor Pack Adoption`.
- Publish the `/features/investor-pack` marketing page.

Exit criteria for Week 5: 20% adoption target measurable; 30-day observation window opens.

---

## 7. Dependencies

### 7.1 Upstream (this goal depends on)

- **v3 T-0715** — Phase C `<InvestorPackBuilder>` component (v1 PDF template). MUST land before Goal 5B Week 1.
- **v3 T-0511** — SVI 13-criteria scoring. Blocks T-1202 for SVI page.
- **v3 T-0606** — Cap table + waterfall. Blocks T-1202 for cap table page.
- **T-1007** — `v_mrr_active` view. Blocks T-1202 for financials page.
- **T-1003** — Analytics registry unification. Blocks T-1209.
- **T-1009** — 6 new analytics events. Blocks T-1209.
- **T-1010** — BQ export pipeline. Blocks measurement infrastructure (§5.1 and 5.7).
- **T-1001** — Upgrade modal wiring. Blocks entitlement gate flow.
- **Goal 5A** — Nightly quality gate. Not a hard blocker but strongly recommended so PDF template regressions surface within 24h.

### 7.2 Downstream (goals blocked on this)

- **Goal 5C (public index)** — the `/listings/[ticker]` public detail page may embed a "download investor pack" CTA that funnels to the one-click generator for the listing's owner. Deferred to post-Goal-5C launch.
- **Goal 5D (VI cohort)** — VI-language investor pack templates require this goal's assembler to be i18n-safe.

### 7.3 Parallel work OK

- Goals 5C and 5D can develop in parallel; no direct blocker between 5B and either.

---

## 8. Non-goals

Explicitly OUT of scope for Goal 5B:

- **Live-collab editing.** No multi-user real-time editing of the pack. Founders customise solo.
- **In-place edit of generated PDF.** Once rendered, the PDF is immutable. Edits require regeneration.
- **VC data-room import.** No sync to Carta, DocSend, Foundersuite, etc. Deferred to v2.2 integrations backlog.
- **Signed / notarised packs.** No blockchain proof of pack authenticity. Nice-to-have; deferred.
- **Custom PDF templates.** Founders cannot upload their own template. Reserved for Enterprise tier post-launch.
- **Non-English packs.** Goal 5D covers VI; other locales are v3.x.

---

## 9. Risks

### 9.1 Render time exceeds 5s target

- **Probability:** Medium (3/5). Recharts SSR is the main variable.
- **Impact:** Medium (3/5). Users tolerate 5-10s with a spinner; > 10s starts to feel broken.
- **EMV:** 3 × 3 × 1.2 = 10.8 — Mitigate.
- **Mitigation:** T-1211 explicitly has a fallback path to native React-PDF primitives; also cache assembled `InvestorPackData` for 60s so a rapid regenerate doesn't re-query workspace state.

### 9.2 Share-link abuse (public pack indexed / scraped)

- **Probability:** Medium (3/5).
- **Impact:** High (4/5). Investor packs contain sensitive cap-table detail; leak is a trust issue.
- **EMV:** 3 × 4 × 1.4 (Financial weight for legal risk) = 16.8 — Mitigate.
- **Mitigation:** signed-URL default 5-minute TTL on the storage blob (viewer re-signs on each iframe load); noindex + nofollow; expire share_id after 30 days; owner-only revoke; Turnstile on reply form.

### 9.3 Assembler produces incomplete pack when workspace state is thin

- **Probability:** High (4/5). Early-stage founders have thin data — no MRR, no cap-table history, no team beyond one row.
- **Impact:** Medium (3/5). Empty pages read as bugs.
- **EMV:** 4 × 3 × 1.2 = 14.4 — Mitigate.
- **Mitigation:** `data_completeness` field (§3.8) drives conditional section rendering. Empty sections replaced with an "Add your <X>" nudge that links back to the workspace CRUD surface.

### 9.4 PDF library dependency drift

- **Probability:** Medium (3/5). `@react-pdf/renderer` has a history of transitive-dep churn (per CTO review §2.4).
- **Impact:** High (4/5). Every 40+ transitive package needs the deploy-live symlink.
- **EMV:** 3 × 4 × 1.2 = 14.4 — Mitigate.
- **Mitigation:** CTO Fix #2 already shipped (full node_modules symlink); pin `@react-pdf/renderer` version in `package.json`; nightly review (Goal 5A) will catch drift.

### 9.5 Founder generates too many packs (cost blowout)

- **Probability:** Low (2/5). Generation is cheap (no LLM call).
- **Impact:** Low (2/5). Storage cost is < $0.001 per pack.
- **EMV:** 2 × 2 × 1.4 = 5.6 — Accept.
- **Mitigation:** 10 packs / user / day rate limit in T-1203.

### 9.6 Reply form spam

- **Probability:** Medium (3/5). Public-URL forms attract bots.
- **Impact:** Low (2/5). Turnstile filters bulk; some slip through.
- **EMV:** 3 × 2 × 1.1 = 6.6 — Mitigate.
- **Mitigation:** Turnstile + rate limit (3/IP/share/day) + `investor_leads.contacted_at` review workflow for founder.

---

## 10. Open questions

- Should the one-click endpoint stream the PDF back progressively (chunked transfer) or hold the request open until fully rendered? Current plan: hold open (simpler); revisit if p95 > 5s.
- Should share links support password protection? Not in v1 — deferred to v2.2 if requested by ≥ 5 users.
- Should the reply form allow file attachments (e.g. investor sends a term sheet)? Not in v1 — spam vector; deferred.
- Should we watermark shared packs with the viewer's IP-country? Considered privacy-borderline; deferred pending CLO review.
- Do we email the founder immediately on `share_link_view`, or batch daily? Current plan: real-time notification + daily digest email.

---

## 11. Cross-references

- v3.1 amendment: `docs/IMPLEMENTATION-PLAN-v3.1-amended.md` §4 Goal 5B
- Related task: v3 T-0715 InvestorPackBuilder (v1)
- Related task: T-1007 real MRR view
- Related task: T-1009 6 new analytics events (adds 3 more from this goal)
- Related task: T-1010 BQ export (measurement path)
- Related PDF infra: `web/src/lib/pdf/*` and `web/src/lib/pdf/disclaimer-footer.ts`
- Related workspace pages: `/workspace`, `/workspace/investor-pack`, `/workspace/notifications`
- Related tables (new): `investor_pack_shares`, `investor_pack_share_views`, `investor_leads`
- Orchestrator meta-doc: `docs/orchestrator-goal-tracking.md`

---

*End of Goal 5B. Owned by CPO + CTO + CFO. Next review: after Week 3 beta cohort feedback.*
