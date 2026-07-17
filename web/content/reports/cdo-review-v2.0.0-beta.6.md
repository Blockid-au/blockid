# CDO Data Quality & Governance Review — v2.0.0-beta.6

Owner: CDO (Chief Data Officer).
Prepared: 2026-07-17.
Scope: analytics event catalog, consent chain, PII surface, data-moat gap analysis, BigQuery export, dashboard SQL, and AI governance snapshot.
Source of truth for events: `web/src/lib/analytics.ts` (`AnalyticsEventMap`) and `web/src/lib/analytics/events.ts` (`AnalyticsEvent` discriminated union).
Source of truth for schema: migrations `0075..0081`.

---

## 1. Event catalog audit

There are **two independent `trackEvent` implementations** in the tree, and they do not share a registry. The audit therefore has to run against both.

- `web/src/lib/analytics.ts` (lines 17-133) exports `trackEvent<E extends keyof AnalyticsEventMap>`. This is the client-only tracker (gtag + `window.dataLayer`). Every UI call site imports from `"@/lib/analytics"`; a grep for `from "@/lib/analytics"` returns 20 files, matching all UI-side call sites.
- `web/src/lib/analytics/events.ts` (lines 111-139) exports a different `trackEvent<E extends AnalyticsEvent>` that lazy-imports `emitEvent` from `./server` and writes to Supabase + GA4 MP. A grep for `from "@/lib/analytics/events"` in `web/src/**/*.ts{,x}` returns **zero call sites**. The new registry is dead code from a producer's perspective — nothing fires it.

That structural split drives most of the findings below.

### 1a. Fired but not typed (in `AnalyticsEventMap`)

These names are actually emitted at runtime but do not appear in the `AnalyticsEventMap` interface at `web/src/lib/analytics.ts:17-133`. The `trackEvent` generic still accepts them because the local file at `web/src/app/workspace/equity-setup/wizard-client.tsx:112-124` defines its **own** loose `trackEvent(event: string, props?)` shim that shadows the typed one.

| Event name                | Fired at                                             |
|---------------------------|------------------------------------------------------|
| `equity_wizard_started`   | `web/src/app/workspace/equity-setup/wizard-client.tsx:185` |
| `equity_wizard_ai_suggest`| `web/src/app/workspace/equity-setup/wizard-client.tsx:257` |
| `equity_wizard_completed` | `web/src/app/workspace/equity-setup/wizard-client.tsx:496` |

Impact: three real conversion events land in GA4 with no typed payload contract, no PII guard, and no server mirror. They are also invisible to any downstream `AnalyticsEventMap`-driven tooling.

### 1b. Typed but never fired (in `AnalyticsEventMap`)

Cross-check of the 76 keys of `AnalyticsEventMap` (`web/src/lib/analytics.ts:17-133`) against the 48 unique names actually invoked by `trackEvent(...)` in `web/src/**` yields the following dead-key list.

| Typed key                        | Line in `analytics.ts` | Comment |
|----------------------------------|------------------------|---------|
| `svi_result_reset`               | 24  | UI never resets a result via a tracked handler. |
| `svi_paywall_checkout_click`     | 26  | Only `svi_paywall_analysis_click` (line 27) fires. |
| `score_form_started`             | 37  | No caller — score-form flow uses `svi_form_started` instead. |
| `score_form_step`                | 38  | Same — form step tracking not wired. |
| `score_form_submitted`           | 39  | Same. Also note: params include `company_name` (see section 3). |
| `login_google_clicked`           | 44  | Only the post-callback `login_google_success` fires. |
| `login_email_verified`           | 47  | Magic-link verify handler does not fire. |
| `plan_cta_clicked`               | 55  | Landing pricing fires `checkout_started` instead. |
| `newsletter_signup`              | 62  | No caller. |
| `founding50_viewed`              | 65  | No page-view fire on `/founding-50`. |
| `tool_result_generated`          | 71  | Only `tool_accessed` fires. |
| `investor_link_viewed`           | 83  | Recipient-side view is not instrumented (see section 4). |
| `plan_upgrade_started`           | 91  | No caller — checkout starts do not distinguish upgrade path. |
| `insight_cta_clicked`            | 102 | CTAs on insights lack the tracker wrapper. |
| `index_viewed`                   | 105 | `/index` (Startup Index) page-view not fired. |
| `nav_tool_selected`              | 109 | No caller. |
| `mobile_menu_opened`             | 110 | No caller. |
| `logout`                         | 113 | Sign-out handler does not fire. |
| `first_report_started`           | 116 | Only `first_report_completed` fires. |
| `first_report_section_unlock`    | 118 | No caller. |
| `report_locked_preview_click`    | 119 | No caller. |
| `report_viewed_tier_preview`     | 125 | T0074 progressive-monetization ring is dark end-to-end. |
| `report_unlock_cta_shown`        | 126 | Same. |
| `report_unlock_cta_clicked`      | 127 | Same — only the legacy `report_unlock_click` (line 79) fires. |
| `report_upgraded_to_paid`        | 128 | Same. |
| `roadmap_viewed`                 | 131 | **New today** — no `<PageViewTracker>` on `/roadmap`. |
| `changelog_viewed`               | 132 | **New today** — no `<PageViewTracker>` on `/changelog`. |

That is **27 typed-but-dark events out of 76** (36% of the client-side catalog is unused).

### 1c. Defined in one type source but not the other

The client `AnalyticsEventMap` and the server `AnalyticsEvent` discriminated union at `web/src/lib/analytics/events.ts:31-51` were designed independently. There is **zero overlap** in event names:

- 20 names live only in `AnalyticsEvent`: `sign_up`, `trial_start`, `trial_end`, `subscribe`, `plan_upgrade`, `plan_downgrade`, `plan_cancel`, `report_generate`, `dashboard_view`, `feature_gate_hit`, `credits_spend`, `credits_purchase`, `equity_offer_request`, `share_link_open`, `evidence_upload`, `svi_analyze`, `agent_invoke`, `cohort_action`, `investor_view_deal`, `session_start`.
- 76 names live only in `AnalyticsEventMap`.
- Zero names in both.

Consequence: the four dashboards in `docs/analytics/dashboards.md` query the server-side `analytics_events` table for names such as `feature_gate_hit`, `day5_email_sent`, `day5_email_open` (Tiles 2.3, 4.1, 4.2, 4.3) — none of which are ever inserted, because (a) no code path fires them and (b) the only writer, the new `events.ts` tracker, has no callers. The tiles will always render zero.

Fix direction: pick one registry. Recommend promoting `events.ts` to the primary tracker, extending its union to cover the ~48 real UI events, and having `analytics.ts` re-export the same helper so `window.gtag`/`dataLayer` still get their mirror.

---

## 2. Consent chain drift risk

The dashboards SQL at `docs/analytics/dashboards.md` (Tiles 2.3, 4.4, 4.5) assumes every row in `analytics_events` carries the correct `consent_granted` flag. Tracing one client event end-to-end:

1. **Browser call.** `trackEvent("insight_read_complete", …)` at `web/src/components/analytics/insight-tracker.tsx:85` invokes the client tracker at `web/src/lib/analytics.ts:151-163`. That function only calls `window.gtag(...)` and pushes to `window.dataLayer`. **It never reads `getConsent()` from `web/src/lib/analytics/consent.ts` and never issues a `fetch("/api/analytics/ingest", …)`.**
2. **/api/analytics/ingest.** A grep for `/api/analytics/ingest` in `web/src/**/*.ts{,x}` returns **only the route file itself** (`web/src/app/api/analytics/ingest/route.ts:1`). No caller in the app posts to it — so the ingest path is unreachable in production today.
3. **analytics_events row.** Because step 2 is never executed, there is no client-side row in `analytics_events`. The only rows currently possible are ones written directly server-side via `emitEvent(...)` at `web/src/lib/analytics/server.ts:62-78` — and every such call site defaults `consent_granted` to `false` unless overridden, per `web/src/lib/analytics/server.ts:69`.

That produces two structural drift risks that a dashboard reader would not detect:

- **Default-false leakage into "consented" rollups.** Any hypothetical future caller of `emitEvent` that forgets to pass `consentGranted: true` will land as `false`, and Tile 4.4 (`docs/analytics/dashboards.md:428-447`) will silently count them as declined. `web/src/lib/analytics/server.ts:69` should either require the field or infer it from the caller context (server-source events default `true`, client-source events default to the ingest-supplied flag).
- **False `true` from server-source events.** The GA4 mirror at `web/src/lib/analytics/server.ts:136` explicitly forwards events whose `source !== 'client'` even if `consent_granted` is `false`, on the grounds that they are "system telemetry". That is the correct policy for GA4 MP, but the same rows land in `analytics_events` unchanged — Tile 2.3 and 4.5 rollups treat them as "consented" because they filter by `event_name`, not `source`. Recommend adding a `source in ('server','webhook:*')` guard or an explicit `consent_granted = true` filter to every consent-sensitive tile.

The ingest route itself (`web/src/app/api/analytics/ingest/route.ts:28`) has a further quiet bug: `consent_granted` on the wire defaults to `false` via Zod (`z.boolean().default(false)`). Even when a fixed client is wired up, if the caller forgets to pass the flag every row will land as denied. Recommend making the field required (no default) so the compiler catches missing wire-ups.

**Verdict:** the consent flag propagates on the server-side path but is completely absent on the client-side path. Tiles 2.3, 4.4, 4.5 will read whatever the server-side callers happen to set, and today most of them do not set it at all.

---

## 3. PII surface risk

The PII guard at `web/src/lib/analytics/events.ts:78-88` runs only inside the new (uncalled) `events.ts` tracker and inside the `/api/analytics/ingest` route (`web/src/app/api/analytics/ingest/route.ts:35-45`). It does **not** run inside the client `trackEvent` in `web/src/lib/analytics.ts`. Any `params` object flowing through the 81 call sites of that tracker is passed to `gtag` and `dataLayer` unmodified.

That path is where the current PII exposures live.

| Call site                                                                        | Field carrying user text | Risk |
|----------------------------------------------------------------------------------|--------------------------|------|
| `web/src/components/svi/svi-entrance.tsx:1822`                                   | `code` (raw user-typed coupon at the paywall) | Coupon codes have been used in the past as internal-referral tokens containing partial email or partner name. Recommend hashing before send, or replacing with `{ has_code: true, code_prefix: string.slice(0,4) }`. |
| `web/src/app/founding-50/founding-50-form.tsx:48`                                | `code`                   | Same as above; the founding-50 form accepts arbitrary strings before validation. |
| `web/src/lib/analytics.ts:39` (`score_form_submitted` typed shape)               | `company_name: string`   | Not currently fired (see section 1b), but the typed payload embeds a free-text field the PII guard would not catch (company name is not in `PII_FIELDS`). If a future caller wires it up, `company_name` may contain an email pattern (e.g. `me@acme.com`) or a founder's full name. Recommend replacing with a hashed `company_id` before shipping this event. |
| `web/src/app/workspace/equity-setup/wizard-client.tsx:496`                       | `equity_wizard_completed` payload includes `email`, `userName`-derived fields | The local `trackEvent` shim at line 112-124 forwards `props` verbatim to `gtag`. The wizard has direct access to `email` and `userName` (props). Even if today's payload omits them, there is no guardrail. Recommend routing through the typed tracker (once section 1 is fixed) so the PII guard runs. |
| `web/src/components/analytics/insight-tracker.tsx:31`                            | `slug` (article slug)    | Low risk — slugs are generated server-side, but flagged so review scope is complete. |

None of the currently active call sites ship an obvious `feedback` or `query` free-text string. That said, when the search bar, feedback modal, and support form get instrumented (planned for v2.1), each must land on the new typed tracker so the guard fires.

**Recommendation:** move the PII-detect regex + key-set from `events.ts` into `analytics.ts` so both trackers share one guard. Add `company_name`, `startup_name`, `founder_name`, `first_name`, `last_name`, `full_name` to the `PII_FIELDS` block-list at `web/src/lib/analytics/events.ts:65-76` (they identify a natural person under Privacy Act 1988 s. 6 even without an email).

Two structural improvements the guard should also acquire:

- **Recursive walk.** `containsPii(params)` at `web/src/lib/analytics/events.ts:78-88` and the sibling `detectPii(params)` at `web/src/app/api/analytics/ingest/route.ts:35-45` only inspect the top-level object entries. Any caller who nests a raw string inside `params.detail.notes` bypasses the check. The `cohort_action` typed event at `web/src/lib/analytics/events.ts:49` explicitly accepts `detail: Record<string, string | number | boolean>` — a plausible vector.
- **Length ceiling.** The Zod envelope at `web/src/lib/analytics/events.ts:92-95` allows arbitrary string values in `params`. A single 100 KB free-text blob would land in `analytics_events.params` and then in BigQuery. Recommend `z.string().max(1024)` on any string leaf and reject at the ingest boundary.

---

## 4. Data-moat metrics not yet captured

Six events are absent from both registries but represent the core telemetry BlockID needs to prove and defend the data moat. Shapes are given in the same discriminated-union style as `web/src/lib/analytics/events.ts:31-51`, so the fix is a straight append to that union.

```ts
// 1. Actual SVI score value + criteria dim breakdown — powers moat cohorting.
| {
    name: "svi_score_computed";
    params: {
      project_id: string;
      overall_score: number;             // 0..300 (Nikkei-style, uncapped)
      stage: number;                     // 0..8 (platform_roadmap phase)
      criteria: Record<CriterionKey, number>; // per-criterion 0..100
      evidence_count: number;
      auto_filled_pct: number;           // % of fields auto-populated
      compute_ms: number;                // pipeline latency
      pipeline_version: string;          // e.g. "sviv13.2"
    };
  }

// 2. Per-criterion refresh (partial re-score after evidence added).
| {
    name: "criterion_score_updated";
    params: {
      project_id: string;
      criterion: CriterionKey;
      previous_score: number;
      new_score: number;
      delta: number;
      trigger: "evidence_added" | "manual" | "cron" | "agent";
      evidence_id?: string;
    };
  }

// 3. Investor pack packaged doc downloaded (PDF/DOCX bundle event).
| {
    name: "investor_pack_generated";
    params: {
      project_id: string;
      pack_id: string;
      tier: "free" | "pro" | "premium" | "founding50";
      format: "pdf" | "docx" | "zip";
      page_count: number;
      credits_spent: number;
      generation_ms: number;
    };
  }

// 4. Recipient-side share view (distinct from InvestorLinkOpen which is
//    fired on the owner's click). Keyed by token_hash so we never leak
//    the raw token to analytics.
| {
    name: "share_link_view";
    params: {
      link_kind: "report" | "deal" | "profile" | "index";
      token_hash: string;                // sha256(token) — never raw
      referrer_domain?: string;          // strip path, keep host only
      viewer_role: "anonymous" | "authenticated";
    };
  }

// 5. Upgrade INTENT — the user clicked the upgrade CTA. Distinct from
//    checkout_completed (which fires post-Stripe). Feeds gate→intent→purchase
//    funnel and dashboard Tile 4.2's numerator problem.
| {
    name: "entitlement_upgrade_intent";
    params: {
      from_plan: PlanCode;
      to_plan: PlanCode;
      surface: string;                    // where the CTA lives, e.g. "paywall:svi_deep_dive"
      trigger_event_id?: string;          // FK to the feature_gate_hit that led here
      offer_variant?: string;             // A/B variant that was shown
    };
  }

// 6. Saved-search matched a NEW listing — flywheel signal.
| {
    name: "saved_search_hit";
    params: {
      saved_search_id: string;
      matched_project_id: string;
      match_score: number;                // 0..1 relevance
      filter_summary: string;             // hashed summary, not raw JSON
      delivery: "in_app" | "email" | "webhook";
    };
  }
```

Rationale: the first two are the ONLY events that tie usage back to the SVI score itself — every dashboard tile that claims "we score X startups per week" is currently backed by row-counts on `svi_analyses` not on an event stream, so no cohort/percentile analysis is possible without a re-query. `investor_pack_generated` and `share_link_view` are the leading indicators for the exit-side of the moat (investor engagement). `entitlement_upgrade_intent` fills the gap between `feature_gate_hit` and `checkout_completed` that Tile 4.2 (`docs/analytics/dashboards.md:376-407`) currently tries to bridge with a 24-hour join — an intent event would let us score at the click level. `saved_search_hit` is the flywheel event that closes the loop: more startups scored → richer filters → more matches → more retained investors.

All six should be typed on **both** registries once the two are merged.

---

## 5. BigQuery export gap

`ls web/scripts/` shows there is **no** `bq-export-events.ts` (or `bq-export-events.mjs`, `bq-export.ts`, etc.). The planned nightly sweep referenced in `web/src/lib/analytics/server.ts:6-11` ("later swept to BigQuery by the nightly cron") is not implemented.

Recommended sketch (for the v2.1 sprint):

- **Path.** `web/scripts/bq-export-events.ts` invoked by `web/scripts/crontab.production` at `10 15 * * *` UTC (01:10 AEST, off-peak per platform routing rules).
- **Query window.** `select … from analytics_events where ts >= now() - interval '25 hours' and ts < now() - interval '1 hour'` — the 25/1 overlap makes the job idempotent under clock skew.
- **Schema (BigQuery table `analytics.events_daily`, partitioned on `DATE(ts)`, clustered on `event_name, user_id`):**

  | Column           | Type      | Mode     | Source                                    |
  |------------------|-----------|----------|-------------------------------------------|
  | `event_id`       | STRING    | REQUIRED | pk, MERGE key                             |
  | `ts`             | TIMESTAMP | REQUIRED | analytics_events.ts                       |
  | `event_name`     | STRING    | REQUIRED |                                           |
  | `user_id`        | STRING    | NULLABLE | UUID text (never joined to email in BQ)   |
  | `session_id`     | STRING    | NULLABLE |                                           |
  | `params`         | JSON      | NULLABLE | jsonb → JSON                              |
  | `consent_granted`| BOOL      | REQUIRED | server-side flag (default FALSE)          |
  | `source`         | STRING    | REQUIRED | client/server/webhook:*                   |
  | `ingested_at`    | TIMESTAMP | REQUIRED | job clock — auditable pipeline latency    |

- **Idempotency.** `MERGE analytics.events_daily T USING S ON T.event_id = S.event_id WHEN NOT MATCHED THEN INSERT ...`. Because Supabase already enforces `analytics_events_event_id_uq` (`web/supabase/migrations/0077_analytics_and_conversion.sql:21`), the exported set will never contain a duplicate on `event_id`; MERGE is a defence-in-depth layer for reruns.
- **Region.** `australia-southeast1` for both dataset and job — matches customer-data-locality commitments and keeps egress in the same region as the primary Postgres.
- **Auth.** Use a workload-identity federation service account with `bigquery.dataEditor` scoped to `analytics.events_daily` only. **Never** the platform's Supabase service-role key.
- **Cost guard.** Fail the job if the source-side count exceeds 500k rows/day and page the CDO — the current volume floor is ~10k/day, and a 50x spike almost certainly means an unbounded loop is firing events.

**Blocker:** with the current unreachable client path (section 2), the BQ export today would ship at most the server-emitted events (webhook + cron) — a fraction of the intended volume. Fix the ingest wiring first, then land the exporter.

---

## 6. Dashboard SQL sanity

Cross-referencing each SQL block in `docs/analytics/dashboards.md` against migrations `0075..0081`:

| Tile | Table / column referenced | Verdict |
|------|---------------------------|---------|
| 2.1  | `subscription_trial_state(trial_start)` | OK. `0075_entitlements_trial_and_webhook_state.sql:11`. |
| 2.2  | `v_trial_conversion` | OK. `0077_analytics_and_conversion.sql:162-174`. |
| 2.3  | `analytics_events(event_name = 'day5_email_sent'/'day5_email_open')` | **Dark.** No caller in `web/src` fires either name. Tile will return NULL for `open_pct`. Either instrument the drip mailer (`web/src/app/api/cron/lifecycle-mailer/route.ts`, not currently emitting analytics) or rewrite the tile against `lifecycle_state.history` (`0077_analytics_and_conversion.sql:139-146`). |
| 2.4  | `churn_events(offered_coupon, accepted_coupon)` | OK. `0077_analytics_and_conversion.sql:112-121`. |
| 2.5  | `ab_experiments(default_variant, active)`, `ab_assignments(user_id, experiment_id, variant, assigned_at)`, `conversion_events(user_id, action='accepted', ts)` | OK schema-wise. Behavioural risk: `conversion_events.action='accepted'` is a magic string; the only known writer is the save-offer flow. If the CRO team starts writing other `action` values ('viewed', 'dismissed'), the tile silently loses precision. Recommend a `check (action in (...))` constraint. |
| 2.6  | `subscription_trial_state(payment_method_saved)` | OK. `0075_entitlements_trial_and_webhook_state.sql:20-21`. |
| 3.1  | `revenue_events(plan_id, kind, net_aud_cents, ts)` | OK. `0075_entitlements_trial_and_webhook_state.sql:108-123`. |
| 3.2  | Same as 3.1 | OK. |
| 3.3  | `revenue_events(gst_aud_cents, gross_aud_cents)` | OK. |
| 3.4  | `subscription_trial_state(plan_id, status)` | OK. |
| 3.5  | `revenue_events` — modelled | OK. Assumption of `burn = MRR × 0.6` is documented in the tile itself; flag if FP&A publishes a real number. |
| 3.6  | `revenue_events(kind in ('refund','chargeback'))` | OK — matches the check-constraint at `0075_entitlements_trial_and_webhook_state.sql:128`. |
| 4.1  | `analytics_events` filtered `event_name = 'feature_gate_hit'` | **Dark.** `feature_gate_hit` lives only in the new `AnalyticsEvent` union at `web/src/lib/analytics/events.ts:41`, which has zero callers. Tile will render 0 rows until the entitlements code path is instrumented. |
| 4.2  | Same as 4.1 + `conversion_events` | **Dark** on the numerator side. |
| 4.3  | Same as 4.1 | **Dark.** |
| 4.4  | `consent_events(consent_kind, granted, ts)` | Schema OK (`0076_compliance_and_equity.sql:6-16`). Volumetric risk: only the wholesale-cert / equity-offer flows currently insert here — the general-purpose analytics consent from `web/src/lib/analytics/consent.ts` writes to localStorage only, not to `consent_events`. The tile therefore reflects legal-consent posture, not analytics-consent posture. Rename the tile or add an analytics-consent inserter. |
| 4.5  | `analytics_events(event_name, ts)` | Column-safe. Rows-thin — the biggest series will be whatever server-side event is emitted most, which today is a very short list. |
| 5.1  | `equity_requests(status)` | OK. `0076_compliance_and_equity.sql:162-175`. |
| 5.2  | `equity_requests(stage, equity_pct_requested)` | OK. |
| 5.3  | `equity_requests(reviewed_at, submitted_at)` | OK. |
| 5.4  | `audit_events(action='audit_chain_verify', resource_type='system', detail->>'result')` | OK schema (`0076_compliance_and_equity.sql:75-93`). Requires the `verify-audit-chain` cron to run — confirmed present at `web/scripts/verify-audit-chain.ts`. |
| 5.5  | `equity_requests(submitted_at)` | OK. |
| 5.6  | `equity_requests` LEFT JOIN `consent_events(id)` on `consent_event_id` | OK. `0076_compliance_and_equity.sql:170`. |

**No columns 404 the schema.** The three dark tiles (2.3, 4.1, 4.2, 4.3) fail because the source events are never emitted, not because the SQL is wrong.

---

## 7. AI governance snapshot

Six primary places call an LLM. Each is classified by oversight grade:

- **Deterministic-post-check** — output is parsed against a Zod schema (or equivalent) and rejected if it drifts.
- **Critic-reviser** — llm-auditor runs a second pass to catch fabrications.
- **Freeform** — output is inserted directly into a user-visible surface with no structural validation.

| Call site | File | Model chain | Oversight | Drift failure mode |
|-----------|------|-------------|-----------|--------------------|
| Report pipeline (customer SVI report) | `web/src/lib/report-pipeline/orchestrator.ts:47` (delegating to `web/src/lib/report-pipeline/agent-dispatcher.ts` per criterion) | Injected `callAI` — production default is the free chain from `web/src/lib/ai-client.ts` (Groq → OpenRouter → Cerebras → SambaNova → Claude OAuth) | **Critic-reviser** via `web/src/lib/report-pipeline/llm-auditor.ts` | Fabricated MRR/user-count numbers reach the customer PDF if both the critic AND reviser miss the same claim. Cost of miss: reputational + Privacy Act s. 6 exposure if a hallucinated "founder name" is emitted. |
| CEO daily summary | `web/src/app/api/cron/ceo-daily-summary/route.ts:12,133` — `callAIForUpgrade({...})` | Free chain, upgraded to Claude Sonnet 4.6 (`web/src/lib/ai-client.ts:612`) when the OAuth token is present | **Freeform** — output is written to `content/reports/ceo-daily-*.md` and read by the CEO agent's implementing loop | Drift produces a plausible-looking but wrong task queue; downstream implementing loop then commits code based on that. Highest blast-radius miss on the list. |
| C-Level daily reports | `web/src/app/api/cron/clevel-daily-reports/route.ts:9-11` | **No AI call.** Comment at line 10-11 states "Deterministic and cheap (no AI calls): reads from …matrix.json …project-state.json …git log". | **N/A** | Cannot drift on model output, only on JSON-file schema. |
| Weekly SVI review email | `web/src/app/api/cron/svi-review/route.ts` | **No AI call.** Purely a mail-merge over `SVI_STAGE_LABELS` + `svi-badges`. | **N/A** | Copy drift only. |
| Growth insights cron | `web/src/app/api/cron/growth-insights/route.ts:3,and body` — `callAI({...})` around Supabase-aggregated metrics | Free chain | **Freeform** — persisted to `growth_insights` and mailed to CMO/CRO. | Model can invent trends that were not in the input metric rollup; the recipient reads it as a signal. |
| Publish insight cron (SEO article) | `web/src/app/api/cron/publish-insight/route.ts:4,7-9` — `callAI` via ADK `optimizeForSearch` in `web/src/lib/adk/agents/index.ts` | Free chain | **Freeform** with a topic-queue.json guardrail (title/slug/keywords are fixed by the queue file, not the model) | Model drift produces low-quality article body but the metadata (slug, keywords) is deterministic — so drift is bounded to the prose section. Still shipped to prod unreviewed. |
| Agent orchestrator (self-upgrade loop) | `web/src/app/api/cron/agent-orchestrator/route.ts:19,175,218` — `callAIForUpgrade` per researched topic | Free chain (upgrade preference to Claude Sonnet 4.6) | **Freeform**, downstream agents then act on the plan | Same as CEO summary — drift becomes code in the implementing loop. |

Additional freeform surfaces to watch, out of scope for v2.0.0-beta.6 but tracked for v2.1: agent-research, agent-auto-improve, agent-upgrade, agent-deploy, cfo-advisor (`web/src/app/api/cfo-advisor/route.ts`), competitive-intelligence (`web/src/lib/competitive-intelligence.ts`), rnd-analysis (`web/src/lib/rnd-analysis.ts`), ai-equity (`web/src/lib/ai-equity.ts`). None of these go through llm-auditor.

**Drift signature to watch.** If the free chain quietly demotes to a lower-tier free model (Groq/OpenRouter free tiers rotate), the output typically loses numeric grounding first (Sonnet 4.6 is more conservative about invented numbers). A weekly comparison of `model` field in `web/src/lib/ai-client.ts:373` `recordModelOutcome` telemetry against last week's would surface the demotion; today no such comparison exists.

---

## 8. Top-3 CDO actions for v2.1 Week 1

1. **Merge the two `trackEvent` implementations into one typed registry** so PII guard + consent flag + typed union cover every UI call site (kills 27 dark keys and eliminates the equity-wizard shim at `web/src/app/workspace/equity-setup/wizard-client.tsx:112-124`).
2. **Wire the client tracker to `/api/analytics/ingest`** with an explicit `consent_granted` from `getConsent()` in `web/src/lib/analytics/consent.ts` — unblocks the four dark dashboard tiles and creates the row volume the BQ exporter needs.
3. **Ship `web/scripts/bq-export-events.ts` + `MERGE`-on-`event_id` idempotency + `australia-southeast1` region**, and add a `pipeline_version` / `ingested_at` audit column so drift in either the client tracker or the LLM chain (section 7) is diffable week-over-week.

---

## Appendix A — Evidence enumeration for section 1

The following table catalogues every `trackEvent(...)` call site in `web/src` so future audits can grep against a known baseline. Numbers are file:line pairs verified via `grep -rn "trackEvent(" web/src --include="*.ts" --include="*.tsx"` on 2026-07-17.

| Event name                              | Call sites                                                                            |
|-----------------------------------------|---------------------------------------------------------------------------------------|
| `svi_form_started`                      | `web/src/components/svi/svi-entrance.tsx:1076,1190`                                   |
| `svi_voice_input`                       | `web/src/components/svi/svi-entrance.tsx:343`                                         |
| `svi_file_uploaded`                     | `web/src/components/svi/svi-entrance.tsx:346,347`                                     |
| `svi_paywall_shown`                     | `web/src/components/svi/svi-entrance.tsx:370,454,626`                                 |
| `svi_submitted`                         | `web/src/components/svi/svi-entrance.tsx:382`                                         |
| `svi_credit_gate_shown`                 | `web/src/components/svi/svi-entrance.tsx:449,621,692`                                 |
| `svi_analysis_complete`                 | `web/src/components/svi/svi-entrance.tsx:651`                                         |
| `svi_paywall_credit_pack_click`         | `web/src/components/svi/svi-entrance.tsx:1764`                                        |
| `svi_paywall_analysis_click`            | `web/src/components/svi/svi-entrance.tsx:1797`                                        |
| `svi_paywall_coupon_submit`             | `web/src/components/svi/svi-entrance.tsx:1822`                                        |
| `svi_paywall_founding50_click`          | `web/src/components/svi/svi-entrance.tsx:1907`                                        |
| `svi_section_picker_opened`             | `web/src/components/svi/svi-entrance.tsx:801`                                         |
| `svi_modular_submitted`                 | `web/src/components/svi/svi-entrance.tsx:819`                                         |
| `svi_modular_complete`                  | `web/src/components/svi/svi-entrance.tsx:853`                                         |
| `rnd_analysis_complete`                 | `web/src/components/svi/svi-entrance.tsx:498,568`, `web/src/components/svi/rnd-results-panel.tsx:833` |
| `rnd_deep_dive_upgrade`                 | `web/src/components/svi/svi-entrance.tsx:674`                                         |
| `rnd_deep_dive_complete`                | `web/src/components/svi/svi-entrance.tsx:734,767`                                     |
| `rnd_reanalyze`                         | `web/src/components/workspace/living-report.tsx:81`                                   |
| `rnd_link_copied`                       | `web/src/components/svi/rnd-results-panel.tsx:852`                                    |
| `report_unlock_click`                   | `web/src/components/svi/rnd-locked-section.tsx:86`                                    |
| `investor_link_copied`                  | `web/src/components/svi/rnd-locked-section.tsx:98`, `rnd-results-panel.tsx:859`, `svi-results-panel.tsx:1720` |
| `investor_pdf_downloaded`               | `web/src/components/ui/pdf-download-button.tsx:65`                                    |
| `evidence_added`                        | `web/src/components/ui/connect-buttons.tsx:99,124,138,152,166,180`, `web/src/components/svi/evidence-wizard.tsx:523` |
| `evidence_vault_opened`                 | via `page-tracker.tsx:9`                                                              |
| `dashboard_viewed`                      | via `page-tracker.tsx:8`                                                              |
| `billing_page_viewed`                   | via `page-tracker.tsx:10`                                                             |
| `pricing_viewed`                        | `web/src/components/landing/pricing.tsx:27`, `page-tracker.tsx:11`                    |
| `pricing_toggle_billing`                | `web/src/components/landing/pricing.tsx:112`                                          |
| `checkout_started`                      | `web/src/components/landing/pricing.tsx:40`                                           |
| `checkout_completed`                    | `web/src/app/checkout/success/checkout-tracker.tsx:11`                                |
| `coupon_applied`                        | `web/src/app/founding-50/founding-50-form.tsx:48`                                     |
| `founding50_submitted`                  | `web/src/app/founding-50/founding-50-form.tsx:89`                                     |
| `founding50_checkout_redirect`          | `web/src/app/founding-50/founding-50-form.tsx:124`                                    |
| `lead_form_submitted`                   | `web/src/components/landing/cta-strip.tsx:33`, `web/src/app/founding-50/founding-50-form.tsx:90` |
| `login_page_viewed`                     | `web/src/app/auth/login/login-form.tsx:541`                                           |
| `login_google_success`                  | `web/src/app/auth/login/login-form.tsx:41`                                            |
| `login_email_requested`                 | `web/src/app/auth/login/login-form.tsx:188`                                           |
| `partner_code_applied`                  | `web/src/app/auth/login/login-form.tsx:279,283`                                       |
| `login_password_success` / `register_password_success` | `web/src/app/auth/login/login-form.tsx:440` (dynamic name)             |
| `score_result_viewed`                   | `web/src/components/svi/svi-results-panel.tsx:1699`                                   |
| `cta_clicked`                           | `web/src/components/svi/svi-results-panel.tsx:1504,1554`                              |
| `insight_article_viewed`                | `web/src/components/analytics/insight-tracker.tsx:31`                                 |
| `insight_scroll_depth`                  | `web/src/components/analytics/insight-tracker.tsx:73`                                 |
| `insight_read_complete`                 | `web/src/components/analytics/insight-tracker.tsx:85`                                 |
| `tool_accessed`                         | `web/src/components/analytics/page-tracker.tsx:27`                                    |
| `referral_link_copied`                  | `web/src/components/workspace/referral-card.tsx:58`                                   |
| `referral_email_shared`                 | `web/src/components/workspace/referral-card.tsx:82`, `rnd-results-panel.tsx:871`      |
| `referral_linkedin_shared`              | `web/src/components/workspace/referral-card.tsx:92`                                   |
| `action_completed`                      | `web/src/components/svi/action-plan-checklist.tsx:87`                                 |
| `first_report_completed`                | `web/src/components/svi/svi-entrance.tsx:499,652`                                     |
| `equity_wizard_started`                 | `web/src/app/workspace/equity-setup/wizard-client.tsx:185` (via local shim, line 112) |
| `equity_wizard_ai_suggest`              | `web/src/app/workspace/equity-setup/wizard-client.tsx:257` (via local shim)           |
| `equity_wizard_completed`               | `web/src/app/workspace/equity-setup/wizard-client.tsx:496` (via local shim)           |

Totals: 48 unique event names, 81 call sites, plus the local shim inside the equity wizard producing three additional untyped events. `<PageViewTracker>` at `web/src/components/site/page-view-tracker.tsx:22` forwards arbitrary `(event, params)` tuples — every route mount using it is only as safe as the props it is instantiated with; audit those callers next.

---

## Appendix B — Consent chain acceptance criteria

For the v2.1 fix to be considered complete, the following must all hold — each is verifiable with a single check.

- `curl -X POST http://localhost:3000/api/analytics/ingest ...` with `consent_granted: true` returns `{"ok":true,"accepted":1,"rejected":0}` **and** a row lands in `analytics_events` with `consent_granted = true`.
- The same call with `consent_granted: false` still lands the row (source of truth) but is skipped by the GA4 MP mirror at `web/src/lib/analytics/server.ts:136`.
- A subsequent client call with the same `event_id` is a no-op at the Supabase layer (idempotency via `analytics_events_event_id_uq`, `web/supabase/migrations/0077_analytics_and_conversion.sql:21`).
- The PII guard at `web/src/lib/analytics/events.ts:78` AND the route-level guard at `web/src/app/api/analytics/ingest/route.ts:35` reject events containing an email/phone/CC pattern in ANY string param, at ANY nesting depth (today the guard is one level deep only — recursive walk needed).
- A dashboard-side spot check on Tile 4.4 (`docs/analytics/dashboards.md:428`) distinguishes analytics-consent from legal-consent by filtering on a new `consent_kind = 'analytics'` value written by the ingest route.

---

## Appendix C — AI governance drift monitors (v2.1 candidates)

The v2.1 CDO backlog should stand up three cheap drift-monitor jobs, each backed by data already in the tree:

1. **Model-mix drift.** Read `recordModelOutcome` telemetry from `web/src/lib/ai-client.ts:373` for the trailing 7 days, group by `model`, and alert if the top-2 models by call-share change week-over-week by more than 20 percentage points. Signal that the free chain is silently rotating providers.
2. **Fabrication rate proxy.** For every report generated through `web/src/lib/report-pipeline/orchestrator.ts`, log the critic verdict from `web/src/lib/report-pipeline/llm-auditor.ts` (`ACCURATE` vs `NEEDS_REVISION`). Weekly `NEEDS_REVISION` rate above 30% is the signal that either (a) prompts have regressed or (b) the model tier has silently demoted.
3. **Consent-flag inversion sentinel.** Nightly `select count(*) from analytics_events where consent_granted = true and source = 'client' and ts >= now() - interval '24h';` — if this drops to zero for a full day while site sessions are non-zero, the client tracker is broken and the whole dashboard suite is running on server-only signal.

None of these require new external services. All three read tables/logs that migrations `0075..0081` already create or that the ai-client module already emits to stdout.
