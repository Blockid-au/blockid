# Corporate Innovator — Role Design (NEW)

Status: GREENFIELD — no code exists. Recon confirmed 0 hits for
"innovator" / "corporate" across `web/src` and `web/supabase`. Requires:

- New segment value `innovator` added to `ACCOUNT_TYPE_VALUES` and `Segment`
  in `web/src/lib/segments.ts` + CHECK constraint extension in a new
  migration (following the `0102_user_role_permissions.sql` pattern).
- New overlay row keyed `innovator` in `web/src/lib/nav/role-menu-overlay.ts`.
- New onboarding button in `web/src/components/onboarding/step-segment.tsx`.
- New route tree under `web/src/app/innovator/*` (separate top-level like
  `/reseller`, not nested under `/workspace` — this is an enterprise console).
- Existing plan features to reuse where possible: `watchlist`,
  `investor.dealflow`, `custom_benchmark`, `diligence_pack`, `svi.feed`,
  `portfolio`, `report.premium`, `pdf_branding`, `sso`, `api.access`,
  `multi_entity`, `sla`.

Corporate seat is the highest ARPU non-reseller segment; the console must
feel like a Bloomberg terminal for AU startup scouting, not a founder tool.

---

## 1. Persona

**Priya Malhotra — VP Innovation & Ventures, ASX-listed retailer (Sydney).**
Runs a 4-person corporate-innovation team. Reports to the CIO / CFO with a
line to the exec committee. Motivated by *deal-sourced revenue* (partnerships
that hit P&L within 18 months), *option value* (equity in strategic
startups), and *narrative capital* ("we're partnering with the top-decile
AU startups in adjacent sectors"). Success is measured by (a) number of
POCs converted to commercial contracts per quarter, (b) M&A pipeline
coverage of the strategic gap-map, (c) quarterly board deck that names
specific startups moving on their leaderboard.

## 2. Top 5 goals on blockid.au

1. See a live SVI leaderboard for every sub-sector adjacent to our thesis
   and know within 60 seconds which 10 startups matter this quarter.
2. Maintain a private watchlist of 30–80 tracked startups and get a
   weekly digest of score movement, funding events, and cap-table changes.
3. Run a POC/partnership pipeline (kanban) shared across the innovation
   team, from *Discovered → Screening → POC Scoped → POC Live → Contract*.
4. Export a board-ready "Ventures Quarterly" PDF that summarises the
   pipeline, top movers, and thesis-fit new arrivals, co-branded with our
   corporate identity.
5. Request diligence packs on shortlisted acquisition targets without
   tipping the market (blind-request flow, NDA-gated).

## 3. First 7 days

| Day | Goal | Actions |
|-----|------|---------|
| 1 | Set thesis | Complete corporate profile (industry, ANZSIC codes, geo), name 3 strategic themes, invite 2 teammates |
| 2 | Frame the market | Open Industry Map, pin the 3 sectors that match the thesis, save as the default view |
| 3 | Seed watchlist | Add 20–30 startups from the leaderboard using the "Add all top-decile" bulk action |
| 4 | Configure alerts | Set weekly digest cadence, threshold rules (SVI delta > 5, new round, new patent) |
| 5 | Import existing pipeline | CSV-import current POCs and partnership discussions into the Pipeline board |
| 6 | Enable SSO + branding | Wire Okta/Azure AD SSO, upload logo + colour tokens for PDF export |
| 7 | Generate first board pack | Produce Ventures Quarterly PDF from live data, share with CIO for feedback |

## 4. Daily workflow

- Skim overnight watchlist digest email (score deltas, funding events).
- Open **Home / Overview** — glance at Industry Pulse card + Team Activity.
- Triage 3–5 new alerts: promote to Pipeline (Discovered) or dismiss.
- Move 1–2 startups across Pipeline lanes after internal meetings.
- Deep-dive one shortlisted startup — open its BlockID profile, request
  diligence pack, save analyst notes.
- Reply to teammate comments left on watchlist entries.
- Once a week: run Industry Map with new filters, prune watchlist.
- Once a month: refresh thesis themes, regenerate exec PDF.

## 5. Menu groups (ONLY these, everything else hidden)

Corporate Innovator console lives at `/innovator/*`. Menu:

1. **Home** — Overview, Weekly digest
2. **Scout** — Industry map, Startup search, Saved theses
3. **Pipeline** — Watchlist, POC pipeline, Diligence requests
4. **Account** — Reports & exports, Team seats, Settings

Hidden: Validate, Build, Fundraise, Scale & Exit, Roles (all founder /
investor / advisor / accelerator sub-groups).

## 6. Feature map

See structured JSON.

## 7. Missing features (must be built)

Listed in structured JSON `missing_features`.

## 8. Onboarding tour

6 spotlight steps anchored on `/innovator` surfaces — see JSON.

## 9. Guiding copy

See JSON `guiding_copy`.

---

## Implementation notes for the CTO agent

- Add DB migration `0106_add_innovator_segment.sql`:
  extend CHECK on `app_users.account_type` to include `'innovator'`.
- Extend `ACCOUNT_TYPE_VALUES` + `Segment` in `web/src/lib/segments.ts`.
- Add `innovator` row to `ROLE_OVERLAY_TABLE` with `hiddenGroups: ["Validate","Build","Fundraise","Scale & Exit","Roles"]`, `topNavExtras: [{href:"/innovator", label:"Innovator", badge:"Console"}]`, `sidebarOrder: ["Home","Account"]`.
- Add step-segment button ("Corporate Innovator") in `web/src/components/onboarding/step-segment.tsx`.
- New feature flags to add to entitlement catalog (bundle sold as
  `innovator_enterprise` plan): `innovator.console`,
  `innovator.pipeline`, `innovator.industry_map`,
  `innovator.diligence_request`. Reuse existing `watchlist`,
  `custom_benchmark`, `svi.feed`, `report.premium`, `pdf_branding`,
  `sso`, `multi_entity`, `api.access`, `sla`.
- Feature-gate manifest entries required for the mutation routes
  (`api/innovator/pipeline/route.ts`, `api/innovator/watchlist/route.ts`,
  `api/innovator/diligence-request/route.ts`, `api/innovator/team/route.ts`).
- Corporate seat billing MUST NOT reuse Stripe self-serve — enterprise
  contracts are invoiced (per CFO agent + reseller-style provisioning by
  admin). No pricing page CTA for this segment.
