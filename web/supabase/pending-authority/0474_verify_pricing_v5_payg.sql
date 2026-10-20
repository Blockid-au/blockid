-- Read-only verification for 0474_pricing_v5_payg.sql — run after apply (and
-- before, to see the "missing" baseline). SELECTs only; safe on production.
--   docker exec -i supabase-db psql -U postgres -d postgres < 0474_verify_pricing_v5_payg.sql
-- Every row's `ok` column must be true after a successful apply.

-- 1. new columns
SELECT 'column ' || t || '.' || c AS check, EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = t AND column_name = c) AS ok
  FROM (VALUES
    ('report_orders', 'tier'), ('report_orders', 'currency'), ('report_orders', 'upgrade_of_order_id'),
    ('report_orders', 'reviewed_by'), ('report_orders', 'reviewed_at'), ('report_orders', 'delivered_at'),
    ('report_orders', 'sla_due_at'),
    ('assembled_reports', 'payg_tier'), ('assembled_reports', 'reviewed'), ('assembled_reports', 'reviewed_at'),
    ('assembled_reports', 'reviewed_by'),
    ('report_reviews', 'order_id'), ('report_reviews', 'report_id'), ('report_reviews', 'reviewer_id'),
    ('report_reviews', 'notes'), ('report_reviews', 'status'), ('report_reviews', 'completed_at'),
    ('report_review_claims', 'review_id'), ('report_review_claims', 'claim_ref'),
    ('report_review_claims', 'decision'), ('report_review_claims', 'note'), ('report_review_claims', 'decided_at')
  ) AS v(t, c);

-- 2. constraints (CHECK bodies carry the v5 values)
SELECT 'constraint ' || conname AS check, true AS ok, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
 WHERE conrelid IN ('public.report_orders'::regclass, 'public.assembled_reports'::regclass, 'public.revenue_events'::regclass)
   AND conname IN ('report_orders_product_sku_check', 'report_orders_status_check', 'report_orders_tier_check',
                   'report_orders_currency_check', 'report_orders_upgrade_of_order_id_fkey', 'report_orders_upgrade_not_self_check',
                   'report_orders_reviewed_by_fkey', 'assembled_reports_payg_tier_check', 'assembled_reports_reviewed_by_fkey',
                   'revenue_events_kind_check')
 ORDER BY conname;

SELECT 'product_sku allows report_verified' AS check,
       pg_get_constraintdef(oid) LIKE '%report_verified%' AS ok
  FROM pg_constraint WHERE conname = 'report_orders_product_sku_check' AND conrelid = 'public.report_orders'::regclass
UNION ALL
SELECT 'status allows IN_REVIEW', pg_get_constraintdef(oid) LIKE '%IN_REVIEW%'
  FROM pg_constraint WHERE conname = 'report_orders_status_check' AND conrelid = 'public.report_orders'::regclass
UNION ALL
SELECT 'revenue kind allows report_upgrade', pg_get_constraintdef(oid) LIKE '%report_upgrade%'
  FROM pg_constraint WHERE conname = 'revenue_events_kind_check' AND conrelid = 'public.revenue_events'::regclass;

-- 3. indexes: the in-flight per-SKU index replaces report_orders_active_uniq
SELECT 'index report_orders_inflight_sku_uniq' AS check,
       EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'report_orders_inflight_sku_uniq') AS ok
UNION ALL
SELECT 'index report_orders_active_uniq dropped',
       NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'report_orders_active_uniq')
UNION ALL
SELECT 'index report_reviews_order_open_uniq',
       EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'report_reviews_order_open_uniq');

-- 4. RLS + policies
SELECT 'rls ' || relname AS check, relrowsecurity AS ok
  FROM pg_class
 WHERE oid IN ('public.report_orders'::regclass, 'public.assembled_reports'::regclass);
SELECT 'rls report_reviews / report_review_claims' AS check,
       bool_and(relrowsecurity) AS ok
  FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname IN ('report_reviews', 'report_review_claims');
SELECT 'policy ' || tablename || '.' || policyname AS check, true AS ok, cmd, qual
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename IN ('report_orders', 'report_reviews', 'report_review_claims', 'assembled_reports')
 ORDER BY tablename, policyname;
SELECT 'assembled_reports has no anon/authenticated policy (tier projection is server-side)' AS check,
       NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'assembled_reports') AS ok;

-- 5. erase_account() carries the three reviewer detaches
SELECT 'erase_account maps ' || x AS check,
       position(x IN pg_get_functiondef('public.erase_account(uuid, boolean)'::regprocedure)) > 0 AS ok
  FROM (VALUES
    ('''report_orders''::text, ''reviewed_by''::text, ''detach''::text'),
    ('''assembled_reports''::text, ''reviewed_by''::text, ''detach''::text'),
    ('''report_reviews''::text, ''reviewer_id''::text, ''detach''::text')
  ) AS v(x);

-- 6. existing data untouched (legacy rows keep tier NULL + currency aud)
SELECT 'legacy orders: tier NULL, currency aud' AS check,
       count(*) FILTER (WHERE tier IS NOT NULL OR currency <> 'aud') = 0 AS ok,
       count(*) AS rows
  FROM public.report_orders
 WHERE product_sku IN ('sku_trust_report_5aud', 'sku_trust_report_credits');
