-- 0046: Add estimated_valuation to svi_snapshots for history tracking
-- Also add price_per_share to share_classes for valuation-linked cap table

begin;

alter table svi_snapshots add column if not exists estimated_valuation numeric default 0;

-- Update share_classes to support dynamic price_per_share
alter table share_classes add column if not exists price_per_share numeric default 0.10;

commit;
