-- 0119_founder_ladder_stripe_prices.sql
-- ---------------------------------------------------------------------------
-- Provision the public founder subscription ladder against real Stripe Prices.
--
-- Context
--   /pricing advertises Free / Growth A$99/mo / Pro A$299/mo, each with a
--   7-day card-required trial. The trial machinery was built and tested, but
--   the ladder could not be purchased:
--     * env vars STRIPE_PRICE_FOUNDER_{STARTER,GROWTH,SCALE} were unset, and
--     * plans.stripe_price_id held stale ids inherited from the 2025 legacy
--       catalogue, which did NOT match the advertised amounts:
--         founder_starter (A$29)  -> price_1TYoqY... = "Founder"  A$99/mo
--         founder_growth  (A$99)  -> price_1TYzjS... = "Growth"   A$99/mo
--                                    (tax_behavior=unspecified, so GST would
--                                     be ADDED on top of a GST-inclusive
--                                     advertised price)
--         founder_scale   (A$299) -> price_1TYoqa... = "Growth"   A$499/mo
--   Left as-is that mis-charges customers, so this migration repoints all
--   three tiers at freshly minted AUD monthly Prices with
--   tax_behavior='inclusive' (site prices are GST-inclusive; automatic_tax is
--   enabled at checkout).
--
-- Stripe objects created 2026-09-08 (live mode). Legacy Products/Prices are
-- left untouched — existing subscriptions keep their locked Price ids valid.
--     BlockID Starter  prod_VDn6QHVzkCbfGP  price_1UDLWZJ7OAnXQ9sVInWgnZpM  A$29.00/mo
--     BlockID Growth   prod_VDn6dipe0eblgC  price_1UDLWaJ7OAnXQ9sVUoNtg12x  A$99.00/mo
--     BlockID Pro      prod_VDn60SbkwuAeD3  price_1UDLWaJ7OAnXQ9sVhHRWhgi8  A$299.00/mo
--
-- founder_enterprise is deliberately NOT provisioned: it is invoiced offline
-- and routes to contact-sales (plans-v2 marks it cta_kind='contact',
-- public=false). Its stripe_price_id stays null.
--
-- Idempotent: plain UPDATEs keyed on the tier id, safe to re-run.
-- ---------------------------------------------------------------------------

update plans
   set stripe_price_id = 'price_1UDLWZJ7OAnXQ9sVInWgnZpM',
       updated_at      = now()
 where id = 'founder_starter';

update plans
   set stripe_price_id = 'price_1UDLWaJ7OAnXQ9sVUoNtg12x',
       updated_at      = now()
 where id = 'founder_growth';

update plans
   set stripe_price_id = 'price_1UDLWaJ7OAnXQ9sVhHRWhgi8',
       updated_at      = now()
 where id = 'founder_scale';

-- Enterprise stays unprovisioned (contact-sales / offline invoice).
update plans
   set stripe_price_id = null,
       updated_at      = now()
 where id = 'founder_enterprise';

-- Surface the change to PostgREST immediately.
notify pgrst, 'reload schema';
