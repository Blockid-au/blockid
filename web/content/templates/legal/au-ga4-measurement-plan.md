> **NOT LEGAL ADVICE — TEMPLATE ONLY.** This GA4 Measurement Plan template
> is provided by BlockID (Auschain PTY LTD, ABN 79 659 615 111) for
> early-stage Australian founders to define an investor-defensible
> analytics baseline in Phase 7 (Growth / Analytics) and lodge it in the
> Phase-4 data-room folder "Product & Technology". BlockID does not hold
> an Australian Financial Services Licence (AFSL) and cannot provide
> personal legal, financial, or tax advice. Personal information collected
> via GA4 (including hashed advertising IDs, IP address, device
> identifiers) is regulated by the *Privacy Act 1988* (Cth) and the 13
> Australian Privacy Principles in Schedule 1 — APP 1 (open and
> transparent management), APP 3 (collection), APP 5 (notification), APP
> 6 (use and disclosure), APP 8 (cross-border disclosure — GA4 data is
> processed on Google-owned servers in the US and EU), and APP 11
> (security). Overstating growth or engagement metrics in an investor
> deck or data room risks s18 *Australian Consumer Law* (misleading and
> deceptive conduct) or s1041H *Corporations Act 2001* (Cth) (misleading
> conduct in financial products) exposure.

---

# GA4 MEASUREMENT PLAN — {{product_name}}

**Plan version:** {{plan_version}} · **Effective from:** {{effective_date}}
**Owner:** {{plan_owner_name}} <{{plan_owner_email}}>
**On behalf of:** {{company_name}} Pty Ltd (ACN {{acn}})
**GA4 property ID:** {{ga4_property_id}} · **Measurement ID:** {{ga4_measurement_id}}
**Data-stream URL(s):** {{data_stream_urls}}

---

## 1. Why we measure — business questions this plan must answer

An investor-defensible measurement plan starts with the **decision**
that a metric will support, not the tool that surfaces it. Every event
declared below must trace back to one of the following questions the
founding team must be able to answer at any board or investor update:

1. **Acquisition:** which channels bring users who reach the "aha
   moment" defined in {{aha_moment_definition}}?
2. **Activation:** what percentage of new sign-ups complete
   {{activation_event_name}} within {{activation_window_days}} days?
3. **Retention:** what is the {{retention_period}} retention curve of
   users cohorted by {{cohort_dimension}}?
4. **Revenue:** what is the trailing-12-month revenue attributable to
   channels + campaigns + first-touch source, reconciled to Stripe /
   Xero within a ±{{revenue_reconciliation_tolerance_pct}}% tolerance?
5. **Referral / virality:** what percentage of new users are reached
   through the referral / word-of-mouth surface at
   {{referral_surface_slug}}?

**Founder note:** if a proposed event cannot be traced to one of the
five questions above (or a founder-authored addition documented in this
plan), it should not be shipped. Vanity events (page-view counts on
marketing pages, scroll-depth on the pricing page) are cheap to add,
expensive to explain to an investor, and lead to over-counting when
reused as "engagement".

## 2. Consent + Privacy Act 1988 baseline

BlockID.au's public-facing surfaces load GA4 **only after** the
visitor's consent state permits analytics under APP 3 (collection) and
APP 5 (notification). The mechanics below must be implemented before
this plan can be treated as live.

| Requirement | Where implemented | Evidence pointer |
|---|---|---|
| Consent banner offers Accept / Reject / Manage on first load in AU | {{consent_banner_component}} | {{consent_banner_screenshot_ref}} |
| Consent state stored in first-party cookie / localStorage under {{consent_storage_key}} | {{consent_storage_impl}} | {{consent_storage_repo_ref}} |
| GA4 loaded via Google Consent Mode v2 with `analytics_storage` gated on the consent state above | {{gtag_bootstrap_snippet_ref}} | {{gtag_snippet_screenshot_ref}} |
| IP anonymisation on (`anonymize_ip=true` — GA4 default; verify in DebugView) | {{ga4_ip_anonymise_config_ref}} | GA4 DebugView export |
| APP 5 collection notice cross-linked from the consent banner | {{privacy_policy_url}} | Privacy policy version {{privacy_policy_version}} |
| Data-retention window set to {{ga4_retention_months}} months (default 2, max 14) | GA4 Admin → Data Settings → Data Retention | {{ga4_retention_screenshot_ref}} |
| Cross-border disclosure disclosure lists Google LLC (US, EU) per APP 8.1 | Privacy Policy §{{privacy_policy_cross_border_section}} | {{privacy_policy_url}} |
| Google Signals **{{google_signals_state}}** (recommend OFF for AU consumer / regulated audiences) | GA4 Admin → Data Collection | Configuration screenshot |
| User-provided identifiers (email, phone) never sent to GA4 in raw form; user_id hashed before send | {{user_id_hashing_impl}} | Unit test {{user_id_hash_test_ref}} |

**Founder note:** if any row above is not yet true, this plan is a
**target state** — flag the row as blocked in the *Sign-off* section
and do not represent the events below as active in an investor deck
until the row is green. Loading GA4 without a valid consent banner in
AU risks an OAIC complaint under the Privacy Act and a *Notifiable
Data Breaches Scheme* trigger under Part IIIC if personal information
is disclosed without APP 5 notification.

## 3. Event taxonomy

Every custom event must (a) belong to a **stage** (acquisition,
activation, retention, revenue, referral, funnel diagnostic), (b) name
a **primary decision** it enables, (c) declare its **params** with a
data type, and (d) name the **person accountable** for the event's
integrity.

### 3.1 Acquisition events

| Event name | Stage | Trigger | Params (type) | Owner | Decision it supports |
|---|---|---|---|---|---|
| `page_view` (GA4 default) | acquisition | Route change on marketing surfaces | page_location (string), page_referrer (string), utm_source / utm_medium / utm_campaign / utm_content / utm_term (string) | {{acquisition_owner}} | Channel attribution |
| `sign_up_initiated` | acquisition | First interaction on {{signup_form_route}} | source_page (string), form_variant (string) | {{acquisition_owner}} | Funnel diagnostic |
| `sign_up_completed` | acquisition | Server-side webhook on user create | method (email / oauth / sso), plan (string), first_touch_channel (string) | {{acquisition_owner}} | CAC by channel |

### 3.2 Activation events

| Event name | Stage | Trigger | Params (type) | Owner | Decision it supports |
|---|---|---|---|---|---|
| `{{activation_event_name}}` | activation | {{activation_trigger_description}} | user_id_hash (string), account_age_days (int), first_touch_channel (string), activation_flow_variant (string) | {{activation_owner}} | Activation rate + cohort |
| `{{aha_event_name}}` | activation | {{aha_trigger_description}} | user_id_hash (string), time_to_aha_hours (float) | {{activation_owner}} | Product / market fit signal |

### 3.3 Retention events

| Event name | Stage | Trigger | Params (type) | Owner | Decision it supports |
|---|---|---|---|---|---|
| `session_start` (GA4 default) | retention | GA4 auto | — | {{retention_owner}} | DAU / WAU / MAU |
| `feature_used` | retention | Any core-loop feature interaction | feature_slug (string, from enum {{feature_slug_enum_ref}}), user_id_hash (string) | {{retention_owner}} | Feature stickiness + retention driver |

### 3.4 Revenue events

| Event name | Stage | Trigger | Params (type) | Owner | Decision it supports |
|---|---|---|---|---|---|
| `purchase` (GA4 default) | revenue | Server-side webhook from Stripe on successful charge | transaction_id (string), value (float, GST-exclusive), currency (`AUD`), tax (float — GST), items[] (array of {item_id, item_name, price, quantity}) | {{revenue_owner}} | Revenue by channel + campaign |
| `subscription_started` | revenue | Stripe webhook on subscription create | plan (string), value_annualised (float, GST-exclusive), currency (`AUD`) | {{revenue_owner}} | MRR growth |
| `subscription_cancelled` | revenue | Stripe webhook on subscription delete | plan (string), reason (string), months_active (int) | {{revenue_owner}} | Churn diagnostics |

**GST hygiene:** the `value` and `value_annualised` params must be
**GST-exclusive** — GA4 has no native GST field and Stripe passes the
gross charge in `amount`. The event pipeline must split `amount` into
`value` + `tax` before send, or the total will double-count once GST
is added back in the P&L. Recording GST-inclusive figures as GA4
`value` overstates revenue in every investor-facing chart derived from
GA4 by 10% (the ATO GST rate under *A New Tax System (Goods and
Services Tax) Act 1999* (Cth) s9-70).

### 3.5 Referral events

| Event name | Stage | Trigger | Params (type) | Owner | Decision it supports |
|---|---|---|---|---|---|
| `referral_share_link_copied` | referral | Share button on {{referral_surface_slug}} | referrer_user_id_hash (string), surface (string) | {{growth_owner}} | Viral loop diagnostics |
| `referral_signup_completed` | referral | Sign-up completed with `?ref=` param | referrer_user_id_hash (string), campaign (string) | {{growth_owner}} | K-factor + LTV / CAC lift |

## 4. User properties (identity + segmentation)

| Property | Type | Set on | Purpose | Personal information? |
|---|---|---|---|---|
| `user_id` | string (SHA-256 of internal user_id — never raw email) | sign-in | Cross-device stitching | No (hashed; irreversible) |
| `plan` | string | sign-in / plan-change | Segment by monetisation tier | No |
| `account_age_days` | int | sign-in | Cohort analysis | No |
| `first_touch_channel` | string | sign-up | Attribution across sessions | No |
| `country` | string (ISO 3166-1 alpha-2) | derived from IP by GA4 | Geo segmentation | Derived at country-level only |

**Never send:** raw email, raw phone number, raw name, raw postal
address, raw payment identifier, Medicare / TFN / passport number, or
any other identifier that would let Google re-identify the user under
APP 6 or APP 11. Sending raw personal information to GA4 is a Privacy
Act breach and violates the Google Analytics ToS §7.

## 5. Custom dimensions + custom metrics

| Name | Scope | Source | Definition | Owner |
|---|---|---|---|---|
| `plan` | user | user property | Monetisation tier at event time | {{revenue_owner}} |
| `first_touch_channel` | user | user property | Channel attribution at first session | {{acquisition_owner}} |
| `activation_flow_variant` | event | event param | A/B variant on the activation flow | {{growth_owner}} |
| `feature_slug` | event | event param | Feature interacted with | {{retention_owner}} |

## 6. KPI derivation + reconciliation

Every headline KPI surfaced to investors must be derivable **inside
the plan** — no ad-hoc SQL, no manual pivot tables, no undocumented
BigQuery joins. If a KPI needs a derivation not listed below, either
add it here first or do not use the KPI in an investor pack.

| KPI | GA4 events used | Derivation | Reconciled to | Tolerance |
|---|---|---|---|---|
| Sign-up conversion rate | `sign_up_initiated`, `sign_up_completed` | `sign_up_completed` unique users / `sign_up_initiated` unique users | Internal `users` table `created_at` | ±5% |
| Activation rate | `sign_up_completed`, `{{activation_event_name}}` | Cohort of `sign_up_completed` users who fired `{{activation_event_name}}` within {{activation_window_days}} days | Internal activation view | ±2% |
| Weekly retention curve | `session_start` | Users with session in week N cohorted by `sign_up_completed` week | Internal `sessions` table | ±5% |
| MRR | `subscription_started`, `subscription_cancelled` | Sum of `value_annualised` / 12 for active subs at period end | Stripe `subscription.items` | ±1% |
| Trailing 12-month revenue (channel view) | `purchase` | Sum of `value` grouped by `first_touch_channel` over 365d | Stripe + Xero (GST-exclusive) | ±{{revenue_reconciliation_tolerance_pct}}% |
| K-factor | `referral_signup_completed`, `sign_up_completed` | `referral_signup_completed` / `sign_up_completed` per cohort week | Internal referrals table | ±3% |

**Reconciliation cadence:** monthly at month-close + before every
board pack + before any investor-facing metric snapshot. If the
tolerance is exceeded, the GA4 figure is **not** used in the
investor-facing surface until the discrepancy is traced and closed.

## 7. Sample-size + statistical-significance guardrails

Small-sample analytics is the single most common source of misleading
metrics in early-stage investor packs. This plan enforces:

- **Cohort floor:** no cohort with n < {{cohort_min_n}} users is
  surfaced in an investor-facing chart. Cohorts below the floor are
  aggregated to the next-larger cohort with a footnote.
- **Confidence intervals:** any % reported to investors (activation,
  retention, K-factor) carries a Wilson 95% CI when n < 1,000. Do not
  round a 4/12 = 33% activation rate up to "roughly 33% activation"
  without stating the CI is 12-65%.
- **A/B test decision rule:** no A/B variant is declared the "winner"
  until (a) n ≥ {{ab_test_min_n_per_arm}} per arm, (b) p-value
  ≤ 0.05 on a two-sided test, and (c) the practical lift is ≥
  {{ab_test_min_lift_pct}}% on the primary metric. Otherwise the test
  is declared inconclusive.
- **No cherry-picking dashboard date ranges:** dashboards used in
  board packs must be time-anchored to a fixed window
  (last-full-month, last-full-quarter, YTD) with the window disclosed
  on-screen. Ad-hoc "last 7 days" comparisons in a pitch deck are a
  s18 ACL risk when the choice of window is materially favourable.

## 8. Data-quality audits + change management

| Audit | Cadence | Owner | Evidence lodged |
|---|---|---|---|
| DebugView spot-check across all events after every deploy touching event send code | per deploy | {{revenue_owner}} | Deploy PR reviewer comment |
| Monthly reconciliation of `purchase` vs Stripe (see §6) | monthly | {{revenue_owner}} | Reconciliation memo in data-room folder 3 |
| Quarterly review of consent-banner accept / reject / manage rates | quarterly | {{plan_owner_name}} | Board deck appendix |
| Annual review of this plan against the current investor deck | annual | {{plan_owner_name}} | Signed-off diff attached to this plan |

Any event schema change (new param, new event, removed event) is a
**versioned change** — bump `plan_version` in the header, capture the
diff in the change log below, and store the outgoing version alongside
the new one in the data-room folder so an investor reviewing an
earlier reporting period can reproduce the numbers from that period's
plan.

### 8.1 Change log

| Version | Date | Change | Reason | Approved by |
|---|---|---|---|---|
| {{plan_version}} | {{effective_date}} | Initial plan | Baseline for {{effective_date}} onwards | {{plan_owner_name}} |

## 9. Investor-pack disclosure guardrails

When any of the KPIs in §6 are quoted in a founder-facing investor
material (deck, memo, data-room summary, weekly digest), the following
guardrails apply — a founder who ignores them in reliance on the
"template only" wording of this document still carries personal +
company liability under s18 ACL and s1041H Corps Act:

1. **Anchor every metric to the plan.** Cite `plan_version` +
   effective date on any chart or table sourced from GA4 so a reader
   can locate the derivation.
2. **Disclose the reconciliation status.** If a KPI has failed
   reconciliation in the current period, do not quote it in the deck
   or explicitly disclose the failure.
3. **Never aggregate cohorts below the floor.** A "conversion rate"
   quoted from n < {{cohort_min_n}} users is a fabrication risk even
   when honestly reported.
4. **Never quote a chart cropped to a favourable date window.**
   Anchor the window to the reporting period (full month, quarter,
   year) or the earliest full period the metric has been tracked.
5. **Retain the raw export for {{retention_period_days}} days.** An
   investor's lawyer asking for the underlying GA4 export must be
   able to receive it — this is a s18 ACL rebuttable-defence
   requirement, not a nice-to-have.

## 10. Sign-off

| Row | Sign-off |
|---|---|
| Plan owner ({{plan_owner_name}}) | {{plan_owner_sign_off_date}} |
| Technical implementer ({{technical_implementer_name}}) | {{technical_implementer_sign_off_date}} |
| Legal / privacy reviewer ({{legal_reviewer_name}}) | {{legal_reviewer_sign_off_date}} |
| Consent banner live in production | {{consent_banner_live_state}} |
| Server-side purchase pipeline live | {{purchase_pipeline_live_state}} |
| Reconciliation for {{effective_date}} period complete | {{initial_reconciliation_state}} |

---

*This template is version-controlled at
`web/content/templates/legal/au-ga4-measurement-plan.md`. Revisions
must land through a pull request that also updates the change log in
§8.1 and re-runs the reconciliation memo in §6 for the current
reporting period.*

**Revision date:** {{revision_date}}
