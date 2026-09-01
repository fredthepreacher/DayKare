-- DayKare monetization authority foundation.
--
-- The playable preview uses an explicitly marked, local-only sandbox adapter.
-- These tables are the production boundary: browsers may read their own
-- wallet/entitlements but cannot create receipts, alter balances, or fulfill
-- products. A future Stripe/App Store/Play webhook uses the service role after
-- independently verifying a provider transaction.

create table if not exists public.monetization_products (
  id text primary key,
  display_name text not null,
  product_kind text not null check (product_kind in ('cosmetic','furniture','bundle','boost','subscription','currency')),
  platform_skus jsonb not null default '{}'::jsonb,
  price_usd numeric(10,2) check (price_usd is null or price_usd >= 0),
  care_coin_price bigint check (care_coin_price is null or care_coin_price >= 0),
  care_gem_price bigint check (care_gem_price is null or care_gem_price >= 0),
  grant_definition jsonb not null default '{}'::jsonb,
  sections text[] not null default '{}',
  is_consumable boolean not null default false,
  is_featured boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  release_state text not null default 'draft' check (release_state in ('draft','live','retired')),
  config_version bigint not null default 1 check (config_version > 0),
  updated_at timestamptz not null default now(),
  constraint monetization_product_window check (ends_at is null or starts_at is null or ends_at > starts_at),
  constraint monetization_single_price check (
    num_nonnulls(price_usd, care_coin_price, care_gem_price) = 1
  )
);

create table if not exists public.monetization_wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  care_coins bigint not null default 0 check (care_coins >= 0),
  care_gems bigint not null default 0 check (care_gems >= 0),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.monetization_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id text not null references public.monetization_products(id),
  entitlement_type text not null check (entitlement_type in ('product','subscription','boost','cosmetic','furniture','badge')),
  entitlement_key text not null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active','expired','revoked','pending')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monetization_entitlement_window check (expires_at is null or expires_at > starts_at),
  unique (user_id, entitlement_type, entitlement_key)
);

create table if not exists public.monetization_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id text not null references public.monetization_products(id),
  provider text not null check (provider in ('stripe','apple','google','admin')),
  provider_transaction_id text not null,
  status text not null check (status in ('pending','verified','fulfilled','declined','canceled','refunded')),
  amount_minor bigint check (amount_minor is null or amount_minor >= 0),
  currency_code text check (currency_code is null or currency_code ~ '^[A-Z]{3}$'),
  provider_event_created_at timestamptz,
  verified_at timestamptz,
  fulfilled_at timestamptz,
  failure_code text,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_transaction_id)
);

create index if not exists monetization_entitlements_user_status_idx
  on public.monetization_entitlements (user_id, status, expires_at);
create index if not exists monetization_transactions_user_created_idx
  on public.monetization_transactions (user_id, created_at desc);
create index if not exists monetization_products_rotation_idx
  on public.monetization_products (release_state, starts_at, ends_at);

drop trigger if exists monetization_products_touch_updated_at on public.monetization_products;
create trigger monetization_products_touch_updated_at before update on public.monetization_products
  for each row execute function public.touch_updated_at();
drop trigger if exists monetization_wallets_touch_updated_at on public.monetization_wallets;
create trigger monetization_wallets_touch_updated_at before update on public.monetization_wallets
  for each row execute function public.touch_updated_at();
drop trigger if exists monetization_entitlements_touch_updated_at on public.monetization_entitlements;
create trigger monetization_entitlements_touch_updated_at before update on public.monetization_entitlements
  for each row execute function public.touch_updated_at();
drop trigger if exists monetization_transactions_touch_updated_at on public.monetization_transactions;
create trigger monetization_transactions_touch_updated_at before update on public.monetization_transactions
  for each row execute function public.touch_updated_at();

insert into public.monetization_products
  (id, display_name, product_kind, price_usd, grant_definition, sections, is_consumable, is_featured, release_state)
values
  ('starter_kare_pack', 'Starter Kare Pack', 'bundle', 2.99, '{"careCoins":150,"careGems":40,"cosmetics":["sunbeam_tee"],"boost":{"durationMs":900000,"multiplier":1.25},"badge":"Kare Starter"}', array['featured','bundles'], false, true, 'live'),
  ('kare_pass_monthly', 'Kare Pass', 'subscription', 4.99, '{"subscription":"kare_pass","progressMultiplier":1.35,"dailyCareCoins":20}', array['featured','kare-pass'], false, true, 'live'),
  ('family_pass_monthly', 'Family Pass', 'subscription', 9.99, '{"subscription":"family_pass","progressMultiplier":1.5,"dailyCareCoins":40,"futureSharedProfiles":true}', array['kare-pass'], false, false, 'live'),
  ('boost_short', 'Quick Cheer Boost', 'boost', 0.99, '{"boost":{"durationMs":600000,"multiplier":1.2}}', array['xp-boosts'], true, false, 'live'),
  ('boost_15_min', '15-Minute REP Boost', 'boost', 2.99, '{"boost":{"durationMs":900000,"multiplier":1.5}}', array['xp-boosts'], true, false, 'live'),
  ('boost_1_hour', '1-Hour REP Boost', 'boost', 5.99, '{"boost":{"durationMs":3600000,"multiplier":1.5}}', array['xp-boosts'], true, false, 'live')
on conflict (id) do nothing;

alter table public.monetization_products enable row level security;
alter table public.monetization_wallets enable row level security;
alter table public.monetization_entitlements enable row level security;
alter table public.monetization_transactions enable row level security;

drop policy if exists monetization_products_read_live on public.monetization_products;
create policy monetization_products_read_live on public.monetization_products
  for select to anon, authenticated
  using (release_state = 'live' and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));

drop policy if exists monetization_wallets_read_own on public.monetization_wallets;
create policy monetization_wallets_read_own on public.monetization_wallets
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists monetization_entitlements_read_own on public.monetization_entitlements;
create policy monetization_entitlements_read_own on public.monetization_entitlements
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists monetization_transactions_read_own on public.monetization_transactions;
create policy monetization_transactions_read_own on public.monetization_transactions
  for select to authenticated using ((select auth.uid()) = user_id);

-- Supabase no longer exposes new public tables through the Data API without
-- explicit grants. Reads are intentional; every write remains service-only.
revoke all on public.monetization_products, public.monetization_wallets,
  public.monetization_entitlements, public.monetization_transactions
  from public, anon, authenticated;
grant select on public.monetization_products to anon, authenticated;
grant select on public.monetization_wallets, public.monetization_entitlements,
  public.monetization_transactions to authenticated;

comment on table public.monetization_transactions is
  'Server-authoritative provider receipts. Never store card data or grant client writes. The provider+transaction unique key makes fulfillment idempotent.';
comment on table public.monetization_wallets is
  'Premium wallet authority. Browsers may read their row but all balance changes require the trusted backend/service role.';
comment on table public.monetization_entitlements is
  'Server-authoritative ownership, subscription, boost, furniture, cosmetic and badge grants.';
