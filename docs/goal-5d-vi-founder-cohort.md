# Goal 5D — Vietnamese-Australian Founder Cohort

**Owner:** CMO (primary) + CPO + CTO (co-owners)
**Status:** Planned — Q2 2027 target
**Baseline:** v2.0.0-beta.7 (git sha `1e747b4`)
**Source:** `docs/IMPLEMENTATION-PLAN-v3.1-amended.md` §4 Goal 5D
**Task ID range:** `T-1401` .. `T-1412`
**Size:** 6 weeks (unchanged from v3.1)

---

## 1. Market rationale

### 1.1 The Vietnamese-Australian founder pipeline is real and underserved

Per Australian Bureau of Statistics 2021 census, ~294,000 Australian residents identify Vietnamese ancestry. The community concentrates in Melbourne (Richmond, Springvale, Sunshine), Sydney (Cabramatta, Bankstown, Marrickville), and Adelaide. Median age is ~35, tilting the demographic firmly into founder territory. The community over-indexes on small-business ownership relative to the AU average (per ABS Business Register data).

No existing founder tooling platform serves this cohort in Vietnamese language with AU regulatory context. The competitors targeting Vietnamese founders (e.g. VIISA, Vietnam Silicon Valley, VVA Sydney chapter) are event-first / accelerator-first with weak self-serve product. The AU-native founder platforms (Cake Equity, Stake, Prosaic) are English-only and US-centric on cap-table norms.

The wedge: BlockID.au is already AU-native regulatory-context (ASIC, ACL, Privacy Act, ESIC/ESVCLP). Adding a Vietnamese-language surface converts an existing AU-regulatory moat into a bilingual-diaspora moat.

Note: exact ABS figures and community counts are correct at the time of Goal 5D scoping (see ABS 2021 Census "Cultural diversity data" release); source-of-truth check should be re-run at implementation start. All aggregate numbers in §1.1 are demographic context, NOT BlockID.au traction claims.

### 1.2 Zalo is the dominant distribution channel

Zalo (developed by VNG Corp) is the dominant messaging platform among Vietnamese-language users globally, including in Australia. Any diaspora-focused founder outreach that skips Zalo is ignoring the primary channel.

BlockID.au already has Telegram + webhook infra pattern (per `web/src/lib/telegram.ts` and multiple cron routes writing to Telegram channels). Adding a Zalo Official Account with the same webhook-post pattern is a mechanical extension — same shape as Telegram, different API.

Zalo Official Accounts support:
- Broadcast messages to subscribers (with rate limits per Zalo policy).
- Inbound queries (chatbot-style; not in v1 scope).
- Deep links to web pages (opens in Zalo in-app browser).
- Simple message templates (text + up to 8 buttons).

Cost: Zalo OA is free at low volume; paid tier for high broadcast volume. Estimated cost at launch: $0. Estimated at 1000 subscribers: ~$50/month.

### 1.3 Accelerator partnerships are addressable

Vietnamese-Australian accelerator ecosystem:
- **Startmate VN cohort** — Australian accelerator with an active Vietnamese founder pipeline.
- **VVA (Vietnamese Venture Association) Sydney chapter** — community-driven, event-focused.
- **VIISA (Vietnam Innovative Startup Accelerator)** — Vietnam-based but AU-diaspora-friendly.
- **Startup Victoria's diverse founder programs** — includes VN-AU founders.
- **Beach Australia Vietnamese chapter** — informal but reaches 500+ founders.

None of these has a preferred tooling partner today. Goal 5D includes 1 signed partnership as a success metric (per v3.1 amendment). Partnership model: BlockID.au provides free Growth-tier access to cohort members; cohort provides co-marketing.

### 1.4 Language-first UX is a retention lever

Vietnamese founders who bounce off English-language SVI onboarding cost the platform 1 signup + 1 word-of-mouth referral. Vietnamese-language onboarding + workspace + emails increases both signup completion and referral rates. Retention benefit is compound: a VI-language user who onboards refers other VI-language users at higher rate than an EN-language user refers cross-language.

Note: the retention-lever hypothesis is validated in published SaaS localisation studies (e.g. CSA Research; Common Sense Advisory 2020 "Can't Read, Won't Buy"); baseline lift for AU-VN diaspora is UNKNOWN and must be measured post-launch.

---

## 2. Architecture

### 2.1 Locale routing (Next 16 i18n)

Next 16 supports i18n via directory-based routing. Structure:

```
web/src/app/
  layout.tsx                (root layout — locale-agnostic)
  page.tsx                  (root landing — EN default)
  (marketing)/              (existing EN marketing)
  vi/
    layout.tsx              (VI-specific layout wrapper, sets html lang="vi")
    page.tsx                (VI landing)
    (marketing)/
      pricing/page.tsx
      for/[segment]/page.tsx
      svi/page.tsx
      security-audit/page.tsx
      roadmap/page.tsx
      changelog/page.tsx
    index/page.tsx          (VI-labelled version of public index)
    listings/[ticker]/page.tsx
    onboarding/page.tsx     (VI wizard variant)
```

`/vi/*` renders Vietnamese-language surfaces. All URL paths mirror the English tree so a founder can toggle locale on any page (via a `<LocaleSwitcher>` in the header).

Alternate consideration: subdomain (`vi.blockid.au`) vs. path (`/vi/*`). Path chosen because:
- No DNS work, no cert regeneration.
- Shares session cookies (locale toggle preserves login).
- Same domain for SEO consolidation.
- Path-based i18n is Next 16 idiomatic.

### 2.2 Translation infrastructure

Two categories of copy:

**Category A — Marketing surfaces** (about 20 pages, ~5000 words total). Static VI translations stored as MDX or JSON alongside EN sources.

```
web/src/content/i18n/vi/
  landing.json              (hero, features, footer)
  pricing.json
  for/founders.json
  for/investors.json
  for/advisors.json
  for/accelerators.json
  svi.json
  onboarding.json
  legal/tos.mdx             (VI legal — reuses v3 T-0514 VI legal MDX)
  legal/privacy.mdx
  emails/welcome.json
  emails/lifecycle-day3.json
  emails/lifecycle-day7.json
  emails/winback.json
```

Loader helper `web/src/lib/i18n/load.ts` reads locale + key path, falls back to EN on missing key. Runtime cost negligible (JSON pre-loaded per page).

**Category B — Workspace UI strings** (about 500 keys). Handled via a lightweight key/value map, NOT full-workspace localisation.

```
web/src/lib/i18n/strings.ts
  export const strings = {
    en: { "workspace.svi.compute": "Compute SVI", ... },
    vi: { "workspace.svi.compute": "Tinh diem SVI", ... }
  };
```

Only the top-20 workspace surfaces get VI strings in v1. The rest remain EN with a fallback rule: unknown key → EN. This is EXPLICITLY the scope agreed in the v3.1 amendment ("v3 T-0514 ships legal MDX in VI but workspace UI remains EN-only"). Goal 5D pushes past T-0514 for onboarding + top-20, but does NOT attempt full workspace i18n.

### 2.3 VI onboarding wizard

Reuses the existing 5-step wizard (`web/src/app/onboarding/*`) — segment / goal / tier / trial / payment. VI variant lives at `/vi/onboarding` and swaps:

- Copy: all strings from `web/src/content/i18n/vi/onboarding.json`.
- Currency display: still A$ (AU regulation applies); label reads "AUD" not "USD".
- Legal disclaimers: read from `disclaimer_registry` where `jurisdiction = 'AU-VI'` (new jurisdiction code) or fall back to `AU` if VI translation missing.
- Zalo option: on step 5 (payment), add a "Sign up for Zalo updates" checkbox that on completion calls `/api/vi/zalo/subscribe`.

### 2.4 Zalo integration

Zalo Official Account API is documented at oa.zalo.me. Integration shape:

**Outbound (broadcast)**

```
web/src/lib/zalo.ts
  export async function zaloBroadcast(subscriberId: string, message: ZaloMessage): Promise<void>
  export async function zaloBroadcastAll(message: ZaloMessage): Promise<void>
```

Same shape as `web/src/lib/telegram.ts`. `ZaloMessage` type:

```
type ZaloMessage = {
  text: string;               // <= 2000 chars
  buttons?: Array<{ title: string; url: string }>;    // max 8
  attachment_url?: string;    // for image cards
};
```

**Inbound (webhook)**

Not in v1 scope. Zalo webhooks can subscribe/unsubscribe/receive-message; v1 uses only broadcast + landing-page CTAs to sign up subscribers. Inbound chatbot is v2.

**Rate limits + persistence**

```
zalo_subscribers (
  subscriber_id text primary key,       -- Zalo user ID
  user_id uuid,                          -- BlockID.au account if linked
  vi_locale boolean not null default true,
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  source text                            -- e.g. 'vi_onboarding_step5', 'submit_form_vi'
);
```

`SubscribeUnsubscribe` events logged to `audit_events` (per v3.1 §7 gate criterion).

### 2.5 Zalo cron `vi-zalo-digest`

Daily 08:00 AEST cron:

1. Pick top VI-market updates in the last 24h:
   - New public listings (Goal 5C dep) with `vi_locale = true` OR industry match to VI-founder ICP (fintech, ecommerce, F&B tech).
   - New VI-language SEO articles (T-1404).
   - AU regulatory updates from a curated feed (ESIC updates, ASIC releases).
2. Compose a Zalo broadcast message.
3. Send to all `zalo_subscribers` with `unsubscribed_at is null`.
4. Log in `cron-health.jsonl`.

### 2.6 VI email templates

Reuse existing `web/src/lib/email.ts` + template pipeline (per CTO review §2.2 refactor recommendation, but no dependency here — templates ship regardless of that refactor).

Top-6 VI email templates:

- `welcome.vi.tsx` — signup welcome.
- `magic-link.vi.tsx` — login magic link.
- `svi-ready.vi.tsx` — SVI score computed.
- `lifecycle-day3.vi.tsx` — trial nudge day 3.
- `lifecycle-day7.vi.tsx` — trial-ending day 7.
- `winback.vi.tsx` — post-cancel winback.

Locale detection: if `app_users.locale = 'vi'`, dispatch VI template; else EN. `locale` column added to `app_users` in T-1401.

### 2.7 VI SEO surfaces

Priority head queries for VI-language SEO:

1. `cong ty khoi nghiep uc` (Australian startup company)
2. `dieu le cong ty uc` (AU company constitution)
3. `dinh gia startup uc` (AU startup valuation)
4. `esic uc` (ESIC Australia)
5. `esop uc` (ESOP Australia)
6. `so huu co phan uc` (AU shareholding)
7. `gay quy startup uc` (AU startup fundraise)
8. `blockid tieng viet` (branded VI query)

Landing pages:

- `/vi/insights/cong-ty-khoi-nghiep-uc` — foundational article, uses same template as EN insights.
- `/vi/insights/dieu-le-cong-ty-uc` — VI constitution primer.
- `/vi/insights/esic-danh-cho-nguoi-viet` — ESIC guide for Vietnamese founders.
- `/vi/for/founders` — VI variant of `/for/founders`.
- `/vi/pricing` — VI variant of pricing.

VI content pipeline: publish-insight cron extended to support VI queue (per T-1019 unstick + T-1404 VI extension).

### 2.8 Vietnamese-Australian accelerator BD list

The Chief of Staff maintains a BD list at `docs/vi-accelerator-partnerships.md` (created as part of T-1409). Row shape:

```
| Partner | Contact | Cohort size | Cadence | Status | Signed? |
|---------|---------|-------------|---------|--------|---------|
| Startmate VN cohort | intro pending | ~25/cohort | quarterly | prospecting | no |
| VVA Sydney | intro pending | ~500 members | monthly meetup | prospecting | no |
| VIISA | intro pending | ~30/cohort | biannual | prospecting | no |
| Startup Victoria diverse founder | intro pending | ~50 | annual | prospecting | no |
| Beach Australia Vietnamese | intro pending | ~500 informal | ad-hoc | prospecting | no |
```

Success metric target: 1 signed partnership in 90 days.

### 2.9 VI legal + regulatory

Legal MDX bodies (per v3 T-0514) already have VI translations of ToS + Privacy. Extend with:

- General advice warning (VI).
- Wholesale investor disclosure (VI).
- Auto-renew notice (VI).
- Consent capture Q&A (VI).

`disclaimer_registry` gets new rows `jurisdiction = 'AU-VI'` chained to same body-hash regime as AU rows. Chain integrity preserved per beta.5 H3 fix.

### 2.10 Currency + tax + regulation stays AU

VI users are AU residents (that is the target segment: Vietnamese-Australian diaspora, NOT Vietnam-resident founders). Therefore:

- Currency: A$ AUD only. No VND display.
- Tax: GST 10%, T-1022 GST watcher applies.
- Regulatory: ASIC + ACL + Privacy Act. NOT Vietnamese State Securities Commission.
- Payment methods: standard Stripe rails (card + Australia bank direct debit). No VNPay integration.

If demand emerges for Vietnam-resident founders, that is a separate goal (Goal 5F or later, out of AU-regulatory scope).

---

## 3. Task list T-14xx

Effort: S=1 (≤4h), M=2 (≤1d), L=3 (≤3d). WSJF = (bv+tc+rr)/effort.

| id | task | effort | bv | tc | rr | wsjf | dependencies |
|----|------|--------|----|----|----|------|--------------|
| T-1401 | Next 16 i18n locale routing under `/vi/*` + `<LocaleSwitcher>` + `app_users.locale` column (migration `0093_locale.sql`) | M | 5 | 4 | 4 | 6.5 | none |
| T-1402 | `web/src/lib/i18n/load.ts` + JSON key/value store; migrate top-20 marketing surfaces (`landing`, `pricing`, `for/*`, `svi`, `onboarding`, `security-audit`) to VI + EN | M | 5 | 4 | 3 | 6.0 | T-1401 |
| T-1403 | VI onboarding wizard variant at `/vi/onboarding` — reuses 5-step flow, swaps copy, uses AU currency + AU-VI legal disclaimers | M | 4 | 4 | 3 | 5.5 | T-1401, T-1402 |
| T-1404 | VI SEO articles (top-8 head queries per §2.7); reuse publish-insight cron with VI queue extension | L | 4 | 4 | 3 | 3.67 | T-1019 (publish-insight unstick), T-1401 |
| T-1405 | 6 VI email templates (`welcome/magic-link/svi-ready/lifecycle-day3/lifecycle-day7/winback`) + locale dispatch in `email.ts` | M | 4 | 3 | 3 | 5.0 | T-1401 |
| T-1406 | `web/src/lib/zalo.ts` broadcast client + subscriber persistence (migration `0094_zalo_subscribers.sql`) | M | 4 | 4 | 3 | 5.5 | T-1401 |
| T-1407 | Zalo webhook `POST /api/vi/zalo/subscribe` from onboarding step 5 checkbox + submit form | S | 3 | 3 | 3 | 9.0 | T-1406 |
| T-1408 | Cron `vi-zalo-digest` daily 08:00 AEST (broadcast top-3 updates to VI subscribers) | S | 3 | 3 | 3 | 9.0 | T-1406, T-1404 |
| T-1409 | Vietnamese-Australian accelerator partnership BD list + outreach cadence (`docs/vi-accelerator-partnerships.md`) | S | 4 | 3 | 2 | 9.0 | none |
| T-1410 | VI legal MDX extensions in `disclaimer_registry` (general advice warning, wholesale disclosure, auto-renew, consent Q&A) with `jurisdiction = 'AU-VI'` | M | 4 | 3 | 4 | 5.5 | v3 T-0514 (VI ToS + Privacy MDX), T-1401 |
| T-1411 | Analytics event `vi_signup` + `vi_zalo_subscribed` + `vi_svi_computed` wired into T-1003 registry; VI cohort dashboard in BQ | S | 3 | 3 | 3 | 9.0 | T-1003 registry live, T-1401 |
| T-1412 | Playwright regression `vi-cohort.spec.ts` — locale toggle, VI onboarding completes, VI SVI computes, VI email fires, Zalo subscribe persists | M | 3 | 3 | 4 | 5.0 | T-1401 through T-1408 |

12 tasks. WSJF-ordered priority: T-1407 / T-1408 / T-1409 / T-1411 (9.0), T-1401 (6.5), T-1402 (6.0), T-1403 / T-1406 / T-1410 (5.5), T-1405 / T-1412 (5.0), T-1404 (3.67).

T-1401 is a hard blocker for 8 downstream tasks; sequence first regardless of WSJF ordering.

---

## 4. Success metrics

### 4.1 VI signups per week

- **Target:** ≥ 20 VI-language signups within 90 days of launch (per v3.1 amendment).
- **Measurement:** `select count(*) from app_users where locale = 'vi' AND created_at > now() - interval '90d'`.
- **Baseline:** 0. No VI signups possible pre-launch.

### 4.2 VI SVI generation rate

- **Target:** ≥ 60% of VI signups produce ≥ 1 SVI score within 30 days.
- **Measurement:** `analytics_events` join on `vi_svi_computed` and `app_users.locale = 'vi'`.
- **Baseline:** UNKNOWN. EN baseline: ~55% per current beta.7 data (UNKNOWN — need CDO to pull GA4 tie-out).

### 4.3 VI email open rate

- **Target:** ≥ 30% open rate on VI templates (EN benchmark ~22%).
- **Measurement:** SES / Resend event pipeline joined to `app_users.locale`.
- **Baseline:** UNKNOWN.

### 4.4 Zalo subscribers

- **Target:** ≥ 100 subscribers within 90 days.
- **Measurement:** `select count(*) from zalo_subscribers where unsubscribed_at is null`.
- **Baseline:** 0.

### 4.5 Zalo digest engagement

- **Target:** ≥ 40% of digest broadcasts result in ≥ 1 button click.
- **Measurement:** Zalo OA click reporting (available via Zalo API `event.click`).
- **Baseline:** UNKNOWN.

### 4.6 Accelerator partnership

- **Target:** 1 signed partnership within 90 days (per v3.1 amendment).
- **Measurement:** signed MoU stored under `docs/legal/partnerships/`.
- **Baseline:** 0.

### 4.7 VI SEO organic traffic

- **Target:** ≥ 100 organic sessions/month on `/vi/*` URLs within 6 months of launch.
- **Measurement:** GA4 `page_location contains '/vi/'` + `session_medium=organic`.
- **Baseline:** 0.

### 4.8 VI signup → paid conversion

- **Target:** VI trial-to-paid rate ≥ 80% of EN rate (not below; hoping ≥ 100%).
- **Measurement:** cohort comparison per `app_users.locale` at 30 days.
- **Baseline:** UNKNOWN.

### 4.9 Locale-toggle usage

- **Target:** ≤ 15% of VI-locale users toggle back to EN (indicates VI content is complete enough).
- **Measurement:** analytics event `locale_switched` (net-new).
- **Baseline:** UNKNOWN.

---

## 5. Six-week rollout

### Week 1 — Locale routing + i18n loader

- Ship T-1401 (Next 16 i18n + `<LocaleSwitcher>` + `locale` column).
- Ship T-1402 (JSON store + top-20 marketing surfaces translated).
- Manual QA: toggle EN↔VI on landing, pricing, /for/founders, /svi.

Exit criteria for Week 1: `<LocaleSwitcher>` visible on every marketing page; VI translations load; no layout breakage.

### Week 2 — VI onboarding + emails

- Ship T-1403 (VI wizard variant).
- Ship T-1405 (6 VI email templates + locale dispatch).
- Ship T-1410 (VI disclaimer registry rows).
- Manual QA: complete VI wizard end-to-end, receive welcome email in VI.

Exit criteria for Week 2: internal test VI signup completes wizard, receives VI welcome, produces SVI in VI.

### Week 3 — Zalo integration

- Ship T-1406 (Zalo broadcast client + `zalo_subscribers` migration).
- Ship T-1407 (subscribe endpoint from wizard).
- Ship T-1408 (`vi-zalo-digest` cron with placeholder content).
- Zalo OA setup (register account, get API key, verify webhook).

Exit criteria for Week 3: internal Zalo OA broadcasts a test message to a seed subscriber list.

### Week 4 — SEO content

- Ship T-1404 (first 4 of 8 VI SEO articles).
- Publish `/vi/insights/*` articles.
- Submit `/vi/*` sitemap to Google Search Console.
- Wire T-1411 analytics events.

Exit criteria for Week 4: 4 VI insight articles indexed; `/vi/*` sitemap live; analytics captures VI events.

### Week 5 — Accelerator partnerships + polish

- Ship T-1409 (BD outreach — first 5 accelerator partners contacted).
- Ship remaining 4 VI SEO articles (T-1404 completion).
- Ship T-1412 (Playwright regression).
- CRO trigger: VI-locale users get `vi_zalo_subscribe` prompt if not subscribed.

Exit criteria for Week 5: 3 accelerator partners in conversation; Playwright green.

### Week 6 — GA + measurement

- Publish `/vi/index` and `/vi/listings/[ticker]` (fork of Goal 5C surfaces — depends on Goal 5C shipping first).
- Launch VI-language ad campaign on Facebook (Facebook is the second-largest VN-AU platform after Zalo).
- Retro + measure Week 1-5 metrics.
- First accelerator MoU target close.

Exit criteria for Week 6: measurable VI signup flow live; ≥ 5 VI signups from Week 4-5 launches; 1 partnership close-in-progress.

---

## 6. Dependencies

### 6.1 Upstream

- **v3 T-0514** — VI legal MDX (ToS + Privacy). Blocks T-1410 partial dependency.
- **T-1003** — Analytics registry. Blocks T-1411.
- **T-1010** — BQ export. Blocks measurement infra.
- **T-1019** — Publish-insight cron unstick. Blocks T-1404.
- **Goal 5C** — Public index. Blocks Week 6 `/vi/index` and `/vi/listings/[ticker]`. Goal 5D can ship Week 1-5 without Goal 5C; only Week 6 depends.
- **Zalo OA registration** — external, requires VN business ID (BlockID.au / Auschain Pty Ltd international registration flow). Estimated 2-3 weeks lead time; start Week 0 (before Goal 5D Week 1) to unblock Week 3.
- **Existing email infrastructure** — `web/src/lib/email.ts`, per CTO review §2.2 (monolith flagged but functional).

### 6.2 Downstream

- **VI-only workspace i18n** — not in v1; would be Goal 5D-v2 or v3.

### 6.3 Parallel

- Goals 5A and 5B can develop in parallel and are non-blocking.

---

## 7. Non-goals

Explicitly OUT of scope for Goal 5D:

- **Vietnamese State Securities Commission compliance.** Target segment is AU-resident Vietnamese-Australian founders. Vietnam-resident founders are out of scope.
- **VND currency display.** All AUD.
- **VNPay integration.** Standard Stripe rails only.
- **Full workspace localisation.** Only top-20 surfaces + onboarding + emails. All other workspace UI stays EN with fallback.
- **Zalo inbound chatbot.** Only outbound broadcast in v1.
- **Vietnamese SVI methodology adjustments.** Same 13-criteria; no VI-specific weights.
- **Non-Vietnamese Asian diaspora.** Mandarin / Cantonese / Thai / Indonesian cohorts are separate goals.
- **VN-Australia bilateral tax planning content.** Complex regulatory territory; deferred.

---

## 8. Risks

### 8.1 Small addressable market vs. build cost

- **Probability:** Medium (3/5).
- **Impact:** High (4/5) — 6 weeks of build for < 50 signups is a poor ROI.
- **EMV:** 3 × 4 × 1.4 = 16.8 — Mitigate.
- **Mitigation:** infrastructure investment (locale routing, i18n loader, Zalo client) is generic and reusable for future locales; success metric 20 VI signups is conservative and achievable via 1 accelerator partnership alone.

### 8.2 Zalo OA registration blocker

- **Probability:** Medium (3/5). Vietnamese business registration for a foreign entity is well-defined but bureaucratic.
- **Impact:** Medium (3/5) — Zalo is nice-to-have not blocker for the whole goal.
- **EMV:** 3 × 3 × 1.0 = 9.0 — Mitigate.
- **Mitigation:** start OA registration Week 0; if blocked, ship Zalo-less v1 (Week 1-5 delivers language wedge alone) and add Zalo in a follow-up.

### 8.3 VI translations of legal disclaimers introduce compliance risk

- **Probability:** Medium (3/5). VI translations of AU legal terms are non-trivial.
- **Impact:** High (5/5) — mistranslation of general advice warning is a real regulatory risk.
- **EMV:** 3 × 5 × 1.4 = 21.0 — Mitigate.
- **Mitigation:** T-1410 has CLO agent review + a professional VI translator sign-off before ship; disclaimers link back to canonical EN alongside VI version.

### 8.4 SEO cannibalisation

- **Probability:** Low (2/5). VI-language queries have low overlap with EN.
- **Impact:** Medium (3/5) — if `/vi/insights/*` competes with `/insights/*`, Google may split PageRank.
- **EMV:** 2 × 3 × 1.0 = 6.0 — Accept with monitoring.
- **Mitigation:** hreflang tags between EN and VI equivalents; VI articles are net-new topics (not translations of existing EN articles) where possible.

### 8.5 Accelerator partnership not closed in 90 days

- **Probability:** Medium (3/5). Partnerships are relationship-driven, not code-driven.
- **Impact:** Low (2/5) — partnership is a bonus, not blocker.
- **EMV:** 3 × 2 × 1.1 = 6.6 — Accept.
- **Mitigation:** BD tracker in `docs/vi-accelerator-partnerships.md` with weekly review; if none close by day 60, pivot to individual-founder ambassador program.

### 8.6 Cultural / copy quality

- **Probability:** Medium (3/5). Machine-translated Vietnamese reads awkwardly.
- **Impact:** High (4/5) — poor translations kill trust immediately.
- **EMV:** 3 × 4 × 1.1 = 13.2 — Mitigate.
- **Mitigation:** all VI copy reviewed by a native VI speaker in AU-diaspora context (not Vietnam-resident VI — colloquialism differences matter); T-1402 has a "cultural review" checkpoint before ship.

### 8.7 Locale switcher confuses EN-locale users

- **Probability:** Low (2/5).
- **Impact:** Low (2/5).
- **EMV:** 2 × 2 × 1.0 = 4.0 — Accept.
- **Mitigation:** locale switcher shown as a small flag icon; not obtrusive; toggle preserves URL path.

---

## 9. Open questions

- Should the locale switcher offer auto-detection from `Accept-Language`? Current plan: yes, but with a session cookie that remembers explicit user choice.
- Should we support VN-resident IP addresses at all? Currently unrestricted; user education via disclaimer says "AU service".
- Do we localise pricing to AUD but display an approximate VND conversion? Under consideration; complicates checkout and creates FX exposure — probably no.
- Should we use Vercel Edge middleware for auto-locale-redirect? Deferred; keeping locale switching explicit for now.
- Do we need a Zalo Mini Program (Zalo's PWA equivalent)? Not in v1. Nice-to-have if broadcast subscribers exceed 500.
- Do we support Vietnamese personal name transliteration in cap-table? Not currently blocking; Latin characters accepted in cap-table input.
- Do we translate the SVI 13-criteria labels themselves, or leave criteria names in English with VI descriptions? Current plan: translate labels + descriptions.

---

## 10. Cross-references

- v3.1 amendment: `docs/IMPLEMENTATION-PLAN-v3.1-amended.md` §4 Goal 5D
- Related v3 task: T-0514 (VI legal MDX)
- Related task: T-1003 analytics registry
- Related task: T-1010 BQ export
- Related task: T-1019 publish-insight cron unstick
- Related infra: `web/src/lib/email.ts`, `web/src/lib/telegram.ts` (Zalo mirror)
- Related infra: `web/src/lib/svi/*` (localised labels), `disclaimer_registry`
- Related routes (new): `/vi/*` tree, `/api/vi/zalo/subscribe`
- Related tables (new): `zalo_subscribers`; column added `app_users.locale`
- Related migrations (new): `0093_locale.sql`, `0094_zalo_subscribers.sql`
- Related docs (new): `docs/vi-accelerator-partnerships.md`
- Zalo Official Account docs: https://oa.zalo.me
- ABS 2021 Census cultural diversity data: reference source
- Common Sense Advisory 2020 "Can't Read, Won't Buy" report: retention lever benchmark
- Orchestrator meta-doc: `docs/orchestrator-goal-tracking.md`

---

*End of Goal 5D. Owned by CMO + CPO + CTO. Next review: after Week 3 Zalo integration.*
