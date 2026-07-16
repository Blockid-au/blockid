-- EOI book (T_SVI_EXC_0013, v2.18) — verified investors register Expression
-- of Interest against live secondary offers.

create table if not exists eoi_book (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references secondary_offers(id) on delete cascade,
  investor_id uuid not null references app_users(id) on delete cascade,
  amount_aud numeric,                       -- indicative commitment
  notes text,
  status text not null default 'pending',   -- pending | accepted | declined | withdrawn
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (offer_id, investor_id)
);

create index if not exists eoi_offer_idx on eoi_book(offer_id);
create index if not exists eoi_investor_idx on eoi_book(investor_id);
