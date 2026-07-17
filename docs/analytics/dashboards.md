# BI Dashboards: Metabase / Looker Spec

Owner-of-record for this document: CDO. Cadence for review: quarterly.
Source of truth for schema: migrations `0075_entitlements_trial_and_webhook_state.sql`,
`0076_compliance_and_equity.sql`, `0077_analytics_and_conversion.sql`.

---

## 1. Data source connection

All dashboards below connect to the primary Supabase Postgres instance through a
**read-only** database role. Metabase and Looker must **never** connect with the
service-role key.

### Connection recipe

1. Create a dedicated Postgres role:
   ```sql
   create role bi_reader login password '<pw>';
   grant usage on schema public to bi_reader;
   grant select on all tables in schema public to bi_reader;
   alter default privileges in schema public
     grant select on tables to bi_reader;
   revoke insert, update, delete, truncate, references, trigger
     on all tables in schema public from bi_reader;
   ```
2. In Metabase / Looker, add a new database:
   - Host: internal Supabase Postgres endpoint (private network only)
   - Port: 5432
   - Database: `postgres`
   - User: `bi_reader`
   - Password: from vault (rotated quarterly)
   - SSL: `require`
3. Row-level security (RLS) is enforced against `bi_reader` by service-role
   policies only; BI dashboards must therefore aggregate — never expose per-row
   PII columns.

### PII policy (applies to every tile)

- **No dashboard may render `app_users.email`, `stripe_customer_id`, `ip_address`,
  or `user_agent` at row level.** Even in drill-through detail views, users are
  referenced by `user_id` UUID only.
- Any tile that surfaces a `user_id` must be gated to CISO / CDO groups in
  Metabase. Public / marketing dashboards must aggregate to counts, ratios, or
  cohorts.
- `analytics_events.params`, `churn_events.exit_survey`, and all `detail` JSONB
  columns must be selectively extracted — never rendered as raw JSON — because
  free-text fields can carry PII.

---

## 2. Trial Funnel Dashboard (CRO)

Owner: CRO. Refresh: hourly. Purpose: monitor the 14-day trial funnel, drip email
performance, save-offer performance, and A/B experiment lift.

### Tile 2.1 — 7-day trial starts (daily count)

- Type: bar chart, one bar per day
- Refresh: hourly
- Owner: CRO
- SQL:
  ```sql
  select
    date_trunc('day', trial_start) as day,
    count(*)                        as trial_starts
  from subscription_trial_state
  where trial_start >= now() - interval '7 days'
    and trial_start is not null
  group by 1
  order by 1;
  ```

### Tile 2.2 — Trial to paid conversion rate (weekly cohort)

- Type: line chart with two series (converted %, expired-no-pay %)
- Refresh: hourly
- Owner: CRO
- SQL:
  ```sql
  select
    week,
    started,
    converted,
    expired_no_pay,
    canceled,
    round(100.0 * converted      / nullif(started, 0), 2) as convert_pct,
    round(100.0 * expired_no_pay / nullif(started, 0), 2) as expire_pct
  from v_trial_conversion
  order by week desc
  limit 12;
  ```

### Tile 2.3 — Day-5 email open rate

- Type: single-number tile with sparkline (open % over last 30 days)
- Refresh: daily
- Owner: CRO (email marketing sub-owner)
- SQL:
  ```sql
  with sends as (
    select date_trunc('day', ts) as day, count(*) as sent
    from analytics_events
    where event_name = 'day5_email_sent'
      and ts >= now() - interval '30 days'
    group by 1
  ),
  opens as (
    select date_trunc('day', ts) as day, count(*) as opened
    from analytics_events
    where event_name = 'day5_email_open'
      and ts >= now() - interval '30 days'
    group by 1
  )
  select
    s.day,
    s.sent,
    coalesce(o.opened, 0)                                    as opened,
    round(100.0 * coalesce(o.opened, 0) / nullif(s.sent, 0), 2) as open_pct
  from sends s
  left join opens o using (day)
  order by s.day;
  ```

### Tile 2.4 — Save-offer accept rate

- Type: single-number tile (percentage) with breakdown table beneath
- Refresh: hourly
- Owner: CRO
- SQL:
  ```sql
  select
    coalesce(offered_coupon, '(none)')                          as coupon,
    count(*)                                                     as offers,
    count(*) filter (where accepted_coupon is true)              as accepted,
    round(
      100.0 * count(*) filter (where accepted_coupon is true)
             / nullif(count(*), 0),
      2
    )                                                            as accept_pct
  from churn_events
  where ts >= now() - interval '30 days'
    and offered_coupon is not null
  group by 1
  order by accept_pct desc;
  ```

### Tile 2.5 — A/B variant lift vs default

- Type: table (experiment_id, variant, assigned, converted, convert_pct, lift_pp)
- Refresh: hourly
- Owner: CRO
- SQL:
  ```sql
  with assigned as (
    select
      a.experiment_id,
      a.variant,
      count(*) as assigned_users
    from ab_assignments a
    join ab_experiments e on e.id = a.experiment_id
    where e.active = true
    group by 1, 2
  ),
  converted as (
    select
      a.experiment_id,
      a.variant,
      count(distinct c.user_id) as converted_users
    from ab_assignments a
    join conversion_events c
      on c.user_id = a.user_id
     and c.action  = 'accepted'
     and c.ts     >= a.assigned_at
    group by 1, 2
  ),
  merged as (
    select
      a.experiment_id,
      a.variant,
      a.assigned_users,
      coalesce(c.converted_users, 0) as converted_users,
      round(
        100.0 * coalesce(c.converted_users, 0)
               / nullif(a.assigned_users, 0),
        2
      )                              as convert_pct
    from assigned a
    left join converted c using (experiment_id, variant)
  ),
  default_pct as (
    select m.experiment_id, m.convert_pct as default_pct
    from merged m
    join ab_experiments e on e.id = m.experiment_id
    where m.variant = e.default_variant
  )
  select
    m.experiment_id,
    m.variant,
    m.assigned_users,
    m.converted_users,
    m.convert_pct,
    m.convert_pct - d.default_pct as lift_pp
  from merged m
  join default_pct d using (experiment_id)
  order by m.experiment_id, m.variant;
  ```

### Tile 2.6 — Trial end pipeline (next 7 days)

- Type: bar chart, one bar per day, day 0 through day 7
- Refresh: hourly
- Owner: CRO
- SQL:
  ```sql
  select
    date_trunc('day', trial_end) as day,
    count(*)                      as trials_ending,
    count(*) filter (where payment_method_saved is true) as pm_saved
  from subscription_trial_state
  where status = 'trialing'
    and trial_end between now() and now() + interval '7 days'
  group by 1
  order by 1;
  ```

---

## 3. SKU MRR Dashboard (CFO)

Owner: CFO. Refresh: hourly for headline tiles, daily for GST accrual. Purpose:
plan-level revenue, ARR run-rate, GST accrual, SKU mix, runway proxy.

### Tile 3.1 — MRR by SKU (trailing 30 days)

- Type: stacked bar chart, x-axis = plan_id, series = kind
- Refresh: hourly
- Owner: CFO
- SQL:
  ```sql
  select
    plan_id,
    kind,
    sum(net_aud_cents) / 100.0 as net_aud
  from revenue_events
  where kind in ('subscribe', 'renewal', 'upgrade')
    and ts >= now() - interval '30 days'
  group by 1, 2
  order by 1, 2;
  ```

### Tile 3.2 — ARR run-rate (single-number)

- Type: single big number (AUD), trailing 30-day MRR × 12
- Refresh: hourly
- Owner: CFO
- SQL:
  ```sql
  select
    round(
      (sum(net_aud_cents) / 100.0) * 12,
      2
    ) as arr_aud
  from revenue_events
  where kind in ('subscribe', 'renewal', 'upgrade')
    and ts >= now() - interval '30 days';
  ```

### Tile 3.3 — GST accrual by month

- Type: line chart, one point per month
- Refresh: daily (03:00 UTC)
- Owner: CFO
- SQL:
  ```sql
  select
    date_trunc('month', ts)               as month,
    sum(gst_aud_cents) / 100.0             as gst_collected_aud,
    sum(gross_aud_cents) / 100.0           as gross_aud,
    sum(net_aud_cents) / 100.0             as net_aud
  from revenue_events
  where kind in ('subscribe', 'renewal', 'upgrade', 'credit_pack')
    and ts >= now() - interval '13 months'
  group by 1
  order by 1;
  ```

### Tile 3.4 — SKU mix (active subs by plan)

- Type: pie chart
- Refresh: hourly
- Owner: CFO
- SQL:
  ```sql
  select
    coalesce(plan_id, '(unknown)') as plan_id,
    count(*)                        as active_subs
  from subscription_trial_state
  where status = 'active'
  group by 1
  order by active_subs desc;
  ```

### Tile 3.5 — Runway proxy (months)

- Type: single-number with sparkline (12-week trailing)
- Refresh: daily
- Owner: CFO
- Model: assumes fixed monthly burn = MRR × 0.6 (per finance model). Replace the
  0.6 constant when the FP&A team publishes an actual burn number.
- SQL:
  ```sql
  with mrr as (
    select sum(net_aud_cents) / 100.0 as mrr_aud
    from revenue_events
    where kind in ('subscribe', 'renewal', 'upgrade')
      and ts >= now() - interval '30 days'
  )
  select
    mrr_aud,
    mrr_aud * 0.6                             as assumed_monthly_burn,
    round(mrr_aud / nullif(mrr_aud * 0.6, 0), 2) as runway_months
  from mrr;
  ```

### Tile 3.6 — Refund + chargeback tracker

- Type: table (month, refund_count, refund_aud, cb_count, cb_aud)
- Refresh: daily
- Owner: CFO
- SQL:
  ```sql
  select
    date_trunc('month', ts)                              as month,
    count(*) filter (where kind = 'refund')              as refund_count,
    -sum(net_aud_cents) filter (where kind = 'refund') / 100.0    as refund_aud,
    count(*) filter (where kind = 'chargeback')          as cb_count,
    -sum(net_aud_cents) filter (where kind = 'chargeback') / 100.0 as cb_aud
  from revenue_events
  where ts >= now() - interval '6 months'
    and kind in ('refund', 'chargeback')
  group by 1
  order by 1 desc;
  ```

---

## 4. Gate-Hit Heatmap Dashboard (CDO)

Owner: CDO. Refresh: hourly. Purpose: expose which paywalled features drive the
most gate-hits and which of those hits convert to upgrades.

### Tile 4.1 — Feature-gate hits by feature x current plan (pivot)

- Type: heat-map / pivot table
- Refresh: hourly
- Owner: CDO
- SQL:
  ```sql
  select
    params->>'feature'      as feature,
    params->>'current_plan' as current_plan,
    count(*)                 as hits
  from analytics_events
  where event_name = 'feature_gate_hit'
    and ts >= now() - interval '30 days'
  group by 1, 2
  order by hits desc;
  ```

### Tile 4.2 — Gate to upgrade conversion (within 24h)

- Type: table (feature, hits, upgrades_within_24h, convert_pct)
- Refresh: hourly
- Owner: CDO
- SQL:
  ```sql
  with gate_hits as (
    select
      user_id,
      params->>'feature' as feature,
      ts                  as hit_ts
    from analytics_events
    where event_name = 'feature_gate_hit'
      and ts >= now() - interval '30 days'
      and user_id is not null
  ),
  upgrades as (
    select
      g.feature,
      count(distinct g.user_id) as hitters,
      count(distinct c.user_id) as upgraders
    from gate_hits g
    left join conversion_events c
      on c.user_id = g.user_id
     and c.action  = 'accepted'
     and c.ts      between g.hit_ts and g.hit_ts + interval '24 hours'
    group by 1
  )
  select
    feature,
    hitters,
    upgraders,
    round(100.0 * upgraders / nullif(hitters, 0), 2) as convert_pct
  from upgrades
  order by hitters desc;
  ```

### Tile 4.3 — Top-10 blocked features (last 7 days)

- Type: horizontal bar chart, sorted descending
- Refresh: hourly
- Owner: CDO
- SQL:
  ```sql
  select
    params->>'feature' as feature,
    count(*)            as blocked_count
  from analytics_events
  where event_name = 'feature_gate_hit'
    and ts >= now() - interval '7 days'
  group by 1
  order by blocked_count desc
  limit 10;
  ```

### Tile 4.4 — Consent coverage by kind

- Type: table (consent_kind, granted, declined, granted_pct)
- Refresh: daily
- Owner: CDO
- SQL:
  ```sql
  select
    consent_kind,
    count(*) filter (where granted is true)  as granted_count,
    count(*) filter (where granted is false) as declined_count,
    round(
      100.0 * count(*) filter (where granted is true)
             / nullif(count(*), 0),
      2
    )                                        as granted_pct
  from consent_events
  where ts >= now() - interval '30 days'
  group by 1
  order by granted_count desc;
  ```

### Tile 4.5 — Analytics event volume by day

- Type: line chart, one series per top-5 event name
- Refresh: hourly
- Owner: CDO
- SQL:
  ```sql
  with top5 as (
    select event_name
    from analytics_events
    where ts >= now() - interval '7 days'
    group by 1
    order by count(*) desc
    limit 5
  )
  select
    date_trunc('day', a.ts) as day,
    a.event_name,
    count(*)                 as events
  from analytics_events a
  join top5 t on t.event_name = a.event_name
  where a.ts >= now() - interval '30 days'
  group by 1, 2
  order by 1, 2;
  ```

---

## 5. Equity Offer Pipeline Dashboard (CLO)

Owner: CLO. Refresh: 15 minutes. Purpose: track equity-request intake, response
SLAs, and cryptographic integrity of the consent + audit chain that legally
underwrites each offer.

### Tile 5.1 — equity_requests by status

- Type: funnel or stacked bar
- Refresh: 15 minutes
- Owner: CLO
- SQL:
  ```sql
  select
    status,
    count(*) as requests
  from equity_requests
  group by 1
  order by
    case status
      when 'pending_review' then 1
      when 'contacted'      then 2
      when 'converted'      then 3
      when 'declined'       then 4
      when 'withdrawn'      then 5
      else 99
    end;
  ```

### Tile 5.2 — Average equity_pct_requested by stage

- Type: bar chart, x = stage, y = avg
- Refresh: hourly
- Owner: CLO
- SQL:
  ```sql
  select
    coalesce(stage, '(unspecified)')                as stage,
    count(*)                                         as requests,
    round(avg(equity_pct_requested)::numeric, 3)    as avg_pct,
    round(percentile_cont(0.5)
          within group (order by equity_pct_requested)::numeric, 3) as median_pct
  from equity_requests
  where equity_pct_requested is not null
  group by 1
  order by requests desc;
  ```

### Tile 5.3 — Time-to-first-response P50 / P90

- Type: two single-number tiles (hours)
- Refresh: hourly
- Owner: CLO
- SQL:
  ```sql
  with responded as (
    select
      extract(epoch from (reviewed_at - submitted_at)) / 3600.0
        as response_hours
    from equity_requests
    where reviewed_at is not null
      and submitted_at >= now() - interval '90 days'
  )
  select
    round(percentile_cont(0.5)  within group (order by response_hours)::numeric, 2) as p50_hours,
    round(percentile_cont(0.9)  within group (order by response_hours)::numeric, 2) as p90_hours,
    count(*)                                                                          as sample_size
  from responded;
  ```

### Tile 5.4 — Consent-chain integrity signal

- Type: single-value tile (OK / STALE / BROKEN) plus latest verify timestamp
- Refresh: hourly
- Owner: CLO (co-owned with CISO)
- Data source: this tile pulls from `audit_events` where the nightly
  `verify-audit-chain.ts` cron writes a heartbeat row (`action =
  'audit_chain_verify'`, `resource_type = 'system'`). The runbook at
  `docs/AUDIT-CHAIN-RUNBOOK.md` describes the heartbeat format.
- SQL:
  ```sql
  select
    max(ts)                                             as last_verify_ts,
    max(ts) filter (where detail->>'result' = 'ok')     as last_ok_ts,
    (
      select detail->>'result'
      from audit_events
      where action = 'audit_chain_verify'
        and resource_type = 'system'
      order by id desc
      limit 1
    )                                                    as last_result,
    case
      when max(ts) < now() - interval '36 hours' then 'STALE'
      when (
        select detail->>'result'
        from audit_events
        where action = 'audit_chain_verify'
          and resource_type = 'system'
        order by id desc
        limit 1
      ) <> 'ok' then 'BROKEN'
      else 'OK'
    end                                                 as chain_status
  from audit_events
  where action = 'audit_chain_verify'
    and resource_type = 'system';
  ```

### Tile 5.5 — Equity-request intake volume (12 weeks)

- Type: line chart
- Refresh: hourly
- Owner: CLO
- SQL:
  ```sql
  select
    date_trunc('week', submitted_at) as week,
    count(*)                          as requests
  from equity_requests
  where submitted_at >= now() - interval '12 weeks'
  group by 1
  order by 1;
  ```

### Tile 5.6 — Consent-linked equity requests (last 30d)

- Type: table (id short, submitted_at, jurisdiction, status, consent_kind,
  consent_granted)
- Refresh: 15 minutes
- Owner: CLO
- PII note: `user_id` UUIDs only, never joined against `app_users.email`.
- SQL:
  ```sql
  select
    substring(er.id::text, 1, 8)  as request_id,
    er.submitted_at,
    er.jurisdiction,
    er.status,
    er.equity_pct_requested,
    ce.consent_kind,
    ce.granted                    as consent_granted
  from equity_requests er
  left join consent_events ce on ce.id = er.consent_event_id
  where er.submitted_at >= now() - interval '30 days'
  order by er.submitted_at desc;
  ```

---

## 6. Change control

- Any new tile that joins `app_users` must be reviewed by CISO before
  publication; RLS bypass is prohibited.
- Schema changes made by future migrations (0078+) must be reflected in this
  document within the same release cycle.
- Dashboard ownership is defined per-dashboard above; owners are responsible for
  broken-tile alerts routed via Metabase / Looker email + Telegram.
