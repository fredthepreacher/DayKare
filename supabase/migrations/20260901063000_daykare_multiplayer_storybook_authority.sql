-- DayKare friends-room membership and Storybook Lane economy authority.
-- Anonymous sign-ins use the authenticated role; every mutation validates
-- auth.uid() and no service key is exposed to the browser.

create table if not exists public.daykare_room_members (
  room_id text not null check (room_id ~ '^[a-z0-9-]{1,32}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

alter table public.daykare_room_members enable row level security;
revoke all on public.daykare_room_members from public, anon, authenticated;
grant select on public.daykare_room_members to authenticated;

drop policy if exists "room members can view occupancy" on public.daykare_room_members;
create policy "room members can view occupancy"
on public.daykare_room_members for select
to authenticated
using (true);

create table if not exists public.storybook_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ribbon_bucks integer not null default 2500 check (ribbon_bucks between 0 and 999999),
  owned_items text[] not null default '{}',
  crib_tier smallint not null default 0 check (crib_tier between 0 and 3),
  updated_at timestamptz not null default now()
);

alter table public.storybook_profiles enable row level security;
revoke all on public.storybook_profiles from public, anon, authenticated;
grant select on public.storybook_profiles to authenticated;

drop policy if exists "players read their Storybook profile" on public.storybook_profiles;
create policy "players read their Storybook profile"
on public.storybook_profiles for select
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.join_daykare_room(p_room_id text, p_display_name text)
returns table (accepted boolean, occupancy integer, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
begin
  if v_user is null then return query select false, 0, 'authentication-required'; return; end if;
  if p_room_id !~ '^[a-z0-9-]{1,32}$' then return query select false, 0, 'invalid-room'; return; end if;
  if char_length(trim(p_display_name)) not between 1 and 24 then return query select false, 0, 'invalid-name'; return; end if;

  perform pg_advisory_xact_lock(hashtext('daykare-room:' || p_room_id));
  delete from public.daykare_room_members where last_seen_at < now() - interval '90 seconds';
  select count(*)::integer into v_count from public.daykare_room_members where room_id = p_room_id;
  if v_count >= 20 and not exists (
    select 1 from public.daykare_room_members where room_id = p_room_id and user_id = v_user
  ) then return query select false, v_count, 'room-full'; return; end if;

  insert into public.daykare_room_members (room_id, user_id, display_name, last_seen_at)
  values (p_room_id, v_user, trim(p_display_name), now())
  on conflict (room_id, user_id) do update
  set display_name = excluded.display_name, last_seen_at = now();
  select count(*)::integer into v_count from public.daykare_room_members where room_id = p_room_id;
  return query select true, v_count, null::text;
end;
$$;

create or replace function public.heartbeat_daykare_room(p_room_id text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  update public.daykare_room_members
  set last_seen_at = now()
  where room_id = p_room_id and user_id = auth.uid()
  returning true;
$$;

create or replace function public.leave_daykare_room(p_room_id text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  delete from public.daykare_room_members
  where room_id = p_room_id and user_id = auth.uid()
  returning true;
$$;

create or replace function public.purchase_storybook_item(p_item_id text)
returns table (accepted boolean, reason text, ribbon_bucks integer, owned_items text[], crib_tier smallint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_cost integer;
  v_profile public.storybook_profiles%rowtype;
begin
  if v_user is null then return query select false, 'authentication-required', 0, '{}'::text[], 0::smallint; return; end if;
  v_cost := case p_item_id
    when 'ice-cream' then 25 when 'tricycle' then 2500 when 'dog' then 5000 when 'crib' then 10000 when 'mini-ride-on' then 15000
    else null end;
  if v_cost is null then return query select false, 'invalid-item', 0, '{}'::text[], 0::smallint; return; end if;

  insert into public.storybook_profiles (user_id) values (v_user) on conflict do nothing;
  select * into v_profile from public.storybook_profiles where user_id = v_user for update;
  if p_item_id <> 'ice-cream' and p_item_id = any(v_profile.owned_items) then
    return query select false, 'already-owned', v_profile.ribbon_bucks, v_profile.owned_items, v_profile.crib_tier; return;
  end if;
  if v_profile.ribbon_bucks < v_cost then
    return query select false, 'insufficient-rb', v_profile.ribbon_bucks, v_profile.owned_items, v_profile.crib_tier; return;
  end if;

  update public.storybook_profiles set
    ribbon_bucks = public.storybook_profiles.ribbon_bucks - v_cost,
    owned_items = case when p_item_id = 'ice-cream' then public.storybook_profiles.owned_items else array_append(public.storybook_profiles.owned_items, p_item_id) end,
    updated_at = now()
  where user_id = v_user
  returning * into v_profile;
  return query select true, 'purchased', v_profile.ribbon_bucks, v_profile.owned_items, v_profile.crib_tier;
end;
$$;

revoke all on function public.join_daykare_room(text, text) from public, anon;
revoke all on function public.heartbeat_daykare_room(text) from public, anon;
revoke all on function public.leave_daykare_room(text) from public, anon;
revoke all on function public.purchase_storybook_item(text) from public, anon;
grant execute on function public.join_daykare_room(text, text) to authenticated;
grant execute on function public.heartbeat_daykare_room(text) to authenticated;
grant execute on function public.leave_daykare_room(text) to authenticated;
grant execute on function public.purchase_storybook_item(text) to authenticated;
