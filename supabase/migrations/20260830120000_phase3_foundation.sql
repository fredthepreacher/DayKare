-- DayKare Phase 3 — accounts, cloud save sync, ownership foundation
--
-- Design constraints this file encodes:
--   * Story and Online saves live in PHYSICALLY SEPARATE tables. Online code
--     never references the Story table, so "Online corrupts Story" cannot be
--     expressed, let alone shipped.
--   * The client is not authoritative. These functions enforce every invariant
--     they reasonably can (known ids, valid scope, no negatives, no duplicate
--     ownership, idempotent grants) but real reward authority arrives in
--     Phase 7 when a game server calls them instead of the browser.
--   * Nothing is ever destroyed. Overwrites back up first; migration keeps the
--     local copy; conflicts are reported, never silently resolved.

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
--
-- Deliberately holds no email, birth date, real name or location. DayKare's
-- players are children; the less we hold, the less there is to leak or to
-- regulate. Supabase Auth already stores what identity requires.
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  -- Not player-editable in Phase 3 and never shown to another player yet.
  -- Public naming needs moderation design first (pre-Online).
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz,
  -- true once a guardian-controlled identity is linked to this anonymous
  -- account. Linking upgrades the SAME auth user, so progress is never
  -- migrated, replaced or duplicated.
  is_guardian_linked boolean not null default false,
  guardian_linked_at timestamptz,
  account_flags jsonb not null default '{}'::jsonb,
  constraint display_name_length check (
    display_name is null or char_length(display_name) between 2 and 20
  )
);

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- account settings
--
-- Accessibility preferences follow the player across devices. Device
-- configuration (graphics tier, render scale, sensitivities, safe-area
-- calibration, audio volume) is deliberately NOT here: it belongs to the
-- hardware, not the account, and it must never live in a progression save.
-- ---------------------------------------------------------------------------

create table if not exists public.account_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  settings_version int not null default 1,
  reduced_motion boolean not null default false,
  high_contrast boolean not null default false,
  larger_text boolean not null default false,
  captions_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

drop trigger if exists account_settings_touch_updated_at on public.account_settings;
create trigger account_settings_touch_updated_at
  before update on public.account_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- saves
--
-- `payload` is the EXACT object the game already writes to localStorage. Not a
-- reshaped version of it. That keeps one serializer, one normalizer and one
-- PROGRESSION_VERSION governing both paths, and makes a cloud save restorable
-- by dropping it straight back into localStorage.
-- ---------------------------------------------------------------------------

create table if not exists public.story_saves (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  save_version int not null,
  payload jsonb not null,
  revision bigint not null default 1,
  payload_hash text,
  rep int not null default 0 check (rep >= 0),
  day_number int not null default 1 check (day_number >= 1),
  device_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.online_saves (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  save_version int not null,
  payload jsonb not null,
  revision bigint not null default 1,
  payload_hash text,
  rep int not null default 0 check (rep >= 0),
  device_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A save version going backwards is either a bug or an attack. Either way it
-- must not be written silently.
create or replace function public.guard_save_version()
returns trigger
language plpgsql
as $$
begin
  if new.save_version < old.save_version then
    raise exception 'daykare: refusing to downgrade save_version from % to %',
      old.save_version, new.save_version
      using errcode = 'check_violation';
  end if;
  if new.revision <= old.revision then
    raise exception 'daykare: revision must increase (was %, got %)',
      old.revision, new.revision
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists story_saves_guard on public.story_saves;
create trigger story_saves_guard
  before update on public.story_saves
  for each row execute function public.guard_save_version();

drop trigger if exists online_saves_guard on public.online_saves;
create trigger online_saves_guard
  before update on public.online_saves
  for each row execute function public.guard_save_version();

-- ---------------------------------------------------------------------------
-- backups — what makes "never wipe progress" true rather than aspirational
-- ---------------------------------------------------------------------------

create table if not exists public.save_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  scope text not null check (scope in ('story', 'online')),
  save_version int not null,
  payload jsonb not null,
  reason text not null check (reason in ('pre-migration', 'pre-overwrite', 'conflict-loser', 'manual')),
  created_at timestamptz not null default now()
);

create index if not exists save_backups_user_scope_idx
  on public.save_backups (user_id, scope, created_at desc);

-- ---------------------------------------------------------------------------
-- catalog + ownership
-- ---------------------------------------------------------------------------

create table if not exists public.catalog_items (
  id text primary key,
  name text not null,
  category text not null check (category in (
    'outfit','top','bottom','shoes','hat','hair','glasses','backpack',
    'accessory','toy','skateboard','scooter','bike','tricycle','emote','badge'
  )),
  unlock_method text not null check (unlock_method in (
    'default','rep','story','caper','district','achievement','purchase','grant'
  )),
  rep_requirement int check (rep_requirement is null or rep_requirement >= 0),
  story_requirement text,
  caper_requirement text,
  district_requirement text,
  story_available boolean not null default true,
  online_available boolean not null default true,
  account_wide boolean not null default false,
  asset_ref text,
  thumbnail_ref text,
  release_state text not null default 'draft'
    check (release_state in ('draft','live','retired')),
  created_at timestamptz not null default now()
);

create table if not exists public.item_ownership (
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id text not null references public.catalog_items(id),
  scope text not null check (scope in ('story','online','account')),
  acquired_at timestamptz not null default now(),
  acquired_via text not null,
  -- THIS is the anti-duplication guarantee. Enforced by Postgres, not by
  -- client code remembering to check first.
  primary key (user_id, item_id, scope)
);

create table if not exists public.equipped_items (
  user_id uuid not null references public.profiles(id) on delete cascade,
  scope text not null check (scope in ('story','online')),
  category text not null,
  item_id text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, scope, category),
  -- Equipping something you do not own is rejected by the database.
  foreign key (user_id, item_id, scope) references public.item_ownership (user_id, item_id, scope)
    on delete cascade
);

create table if not exists public.resources (
  user_id uuid not null references public.profiles(id) on delete cascade,
  scope text not null check (scope in ('story','online')),
  resource_key text not null,
  amount bigint not null default 0 check (amount >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, scope, resource_key)
);

-- ---------------------------------------------------------------------------
-- migration claims — makes local->cloud migration idempotent
--
-- A refresh, a double tap or a flaky network retry must not be able to grant a
-- reward twice. The unique token is what guarantees that.
-- ---------------------------------------------------------------------------

create table if not exists public.claimed_migrations (
  token uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  scope text not null check (scope in ('story','online')),
  claimed_at timestamptz not null default now(),
  result jsonb not null
);

create index if not exists claimed_migrations_user_idx
  on public.claimed_migrations (user_id, scope);

-- ---------------------------------------------------------------------------
-- profile bootstrap
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
    on conflict (id) do nothing;
  insert into public.account_settings (user_id) values (new.id)
    on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- save write with optimistic concurrency
--
-- The client sends the revision it believes it is updating. If the row has
-- moved on, we DO NOT overwrite: we return the server's state and let the
-- player decide. Protecting progress beats resolving conflicts automatically.
-- ---------------------------------------------------------------------------

create or replace function public.story_save_write(
  p_save_version int,
  p_payload jsonb,
  p_expected_revision bigint,
  p_payload_hash text default null,
  p_device_label text default null,
  p_rep int default 0,
  p_day_number int default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_current public.story_saves%rowtype;
begin
  if v_user is null then
    raise exception 'daykare: not authenticated' using errcode = '28000';
  end if;

  select * into v_current from public.story_saves where user_id = v_user;

  -- First ever write for this account.
  if not found then
    if p_expected_revision is not null and p_expected_revision <> 0 then
      return jsonb_build_object('status', 'conflict', 'reason', 'no-cloud-save');
    end if;
    insert into public.story_saves (
      user_id, save_version, payload, revision, payload_hash, rep, day_number, device_label
    ) values (
      v_user, p_save_version, p_payload, 1, p_payload_hash,
      greatest(p_rep, 0), greatest(p_day_number, 1), p_device_label
    );
    return jsonb_build_object('status', 'ok', 'revision', 1);
  end if;

  -- Someone else moved the save on. Hand back the truth; do not clobber it.
  if p_expected_revision is distinct from v_current.revision then
    return jsonb_build_object(
      'status', 'conflict',
      'reason', 'revision-mismatch',
      'server_revision', v_current.revision,
      'server_save_version', v_current.save_version,
      'server_updated_at', v_current.updated_at,
      'server_device_label', v_current.device_label,
      'server_rep', v_current.rep,
      'server_day_number', v_current.day_number
    );
  end if;

  -- Keep the version we are about to replace, so an overwrite is recoverable.
  insert into public.save_backups (user_id, scope, save_version, payload, reason)
  values (v_user, 'story', v_current.save_version, v_current.payload, 'pre-overwrite');

  update public.story_saves set
    save_version = p_save_version,
    payload = p_payload,
    revision = v_current.revision + 1,
    payload_hash = p_payload_hash,
    rep = greatest(p_rep, 0),
    day_number = greatest(p_day_number, 1),
    device_label = p_device_label
  where user_id = v_user;

  return jsonb_build_object('status', 'ok', 'revision', v_current.revision + 1);
end;
$$;

create or replace function public.online_save_write(
  p_save_version int,
  p_payload jsonb,
  p_expected_revision bigint,
  p_payload_hash text default null,
  p_device_label text default null,
  p_rep int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_current public.online_saves%rowtype;
begin
  if v_user is null then
    raise exception 'daykare: not authenticated' using errcode = '28000';
  end if;

  select * into v_current from public.online_saves where user_id = v_user;

  if not found then
    if p_expected_revision is not null and p_expected_revision <> 0 then
      return jsonb_build_object('status', 'conflict', 'reason', 'no-cloud-save');
    end if;
    insert into public.online_saves (
      user_id, save_version, payload, revision, payload_hash, rep, device_label
    ) values (
      v_user, p_save_version, p_payload, 1, p_payload_hash, greatest(p_rep, 0), p_device_label
    );
    return jsonb_build_object('status', 'ok', 'revision', 1);
  end if;

  if p_expected_revision is distinct from v_current.revision then
    return jsonb_build_object(
      'status', 'conflict',
      'reason', 'revision-mismatch',
      'server_revision', v_current.revision,
      'server_save_version', v_current.save_version,
      'server_updated_at', v_current.updated_at,
      'server_device_label', v_current.device_label,
      'server_rep', v_current.rep
    );
  end if;

  insert into public.save_backups (user_id, scope, save_version, payload, reason)
  values (v_user, 'online', v_current.save_version, v_current.payload, 'pre-overwrite');

  update public.online_saves set
    save_version = p_save_version,
    payload = p_payload,
    revision = v_current.revision + 1,
    payload_hash = p_payload_hash,
    rep = greatest(p_rep, 0),
    device_label = p_device_label
  where user_id = v_user;

  return jsonb_build_object('status', 'ok', 'revision', v_current.revision + 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- idempotent local -> cloud migration
-- ---------------------------------------------------------------------------

create or replace function public.claim_local_migration(
  p_token uuid,
  p_scope text,
  p_save_version int,
  p_payload jsonb,
  p_rep int default 0,
  p_day_number int default 1,
  p_device_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_existing public.claimed_migrations%rowtype;
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'daykare: not authenticated' using errcode = '28000';
  end if;
  if p_scope not in ('story', 'online') then
    raise exception 'daykare: invalid scope %', p_scope using errcode = 'check_violation';
  end if;

  -- Replay protection. A refresh mid-migration returns the first result
  -- instead of running the migration again.
  select * into v_existing from public.claimed_migrations where token = p_token;
  if found then
    if v_existing.user_id <> v_user then
      raise exception 'daykare: migration token belongs to another account' using errcode = '42501';
    end if;
    return v_existing.result;
  end if;

  -- Never migrate over an existing cloud save: that decision belongs to the
  -- player, in the client, with both saves described.
  if p_scope = 'story' and exists (select 1 from public.story_saves where user_id = v_user) then
    v_result := jsonb_build_object('status', 'exists', 'scope', 'story');
  elsif p_scope = 'online' and exists (select 1 from public.online_saves where user_id = v_user) then
    v_result := jsonb_build_object('status', 'exists', 'scope', 'online');
  else
    insert into public.save_backups (user_id, scope, save_version, payload, reason)
    values (v_user, p_scope, p_save_version, p_payload, 'pre-migration');

    if p_scope = 'story' then
      insert into public.story_saves (
        user_id, save_version, payload, revision, rep, day_number, device_label
      ) values (
        v_user, p_save_version, p_payload, 1, greatest(p_rep, 0), greatest(p_day_number, 1), p_device_label
      );
    else
      insert into public.online_saves (
        user_id, save_version, payload, revision, rep, device_label
      ) values (
        v_user, p_save_version, p_payload, 1, greatest(p_rep, 0), p_device_label
      );
    end if;

    v_result := jsonb_build_object('status', 'migrated', 'scope', p_scope, 'revision', 1);
  end if;

  insert into public.claimed_migrations (token, user_id, scope, result)
  values (p_token, v_user, p_scope, v_result);

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- ownership + resources
--
-- The client cannot insert into item_ownership or resources directly (see RLS
-- below). It asks these functions, which validate what they can. In Phase 3
-- the requirement check reads client-controlled state, so this is a BUG guard,
-- not a cheat guard - the honest framing. Phase 7 calls the same functions
-- from the server with server-held state and revokes the client's path.
-- ---------------------------------------------------------------------------

create or replace function public.grant_item(
  p_item_id text,
  p_scope text,
  p_via text default 'client'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_item public.catalog_items%rowtype;
begin
  if v_user is null then
    raise exception 'daykare: not authenticated' using errcode = '28000';
  end if;
  if p_scope not in ('story', 'online', 'account') then
    raise exception 'daykare: invalid scope %', p_scope using errcode = 'check_violation';
  end if;

  select * into v_item from public.catalog_items where id = p_item_id;
  if not found then
    raise exception 'daykare: unknown item %', p_item_id using errcode = 'foreign_key_violation';
  end if;
  if v_item.release_state <> 'live' then
    raise exception 'daykare: item % is not live', p_item_id using errcode = 'check_violation';
  end if;
  if p_scope = 'story' and not v_item.story_available then
    raise exception 'daykare: item % is not available in Story', p_item_id using errcode = 'check_violation';
  end if;
  if p_scope = 'online' and not v_item.online_available then
    raise exception 'daykare: item % is not available in Online', p_item_id using errcode = 'check_violation';
  end if;
  if p_scope = 'account' and not v_item.account_wide then
    raise exception 'daykare: item % is not account-wide', p_item_id using errcode = 'check_violation';
  end if;

  -- Idempotent by construction: the composite primary key makes a repeat
  -- grant a no-op rather than a duplicate.
  insert into public.item_ownership (user_id, item_id, scope, acquired_via)
  values (v_user, p_item_id, p_scope, p_via)
  on conflict (user_id, item_id, scope) do nothing;

  return jsonb_build_object('status', 'ok', 'item_id', p_item_id, 'scope', p_scope);
end;
$$;

create or replace function public.adjust_resource(
  p_scope text,
  p_resource_key text,
  p_delta bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_amount bigint;
begin
  if v_user is null then
    raise exception 'daykare: not authenticated' using errcode = '28000';
  end if;
  if p_scope not in ('story', 'online') then
    raise exception 'daykare: invalid scope %', p_scope using errcode = 'check_violation';
  end if;
  if abs(p_delta) > 1000000 then
    raise exception 'daykare: implausible resource delta %', p_delta using errcode = 'check_violation';
  end if;

  insert into public.resources (user_id, scope, resource_key, amount)
  values (v_user, p_scope, p_resource_key, greatest(p_delta, 0))
  on conflict (user_id, scope, resource_key) do update
    set amount = greatest(resources.amount + p_delta, 0),
        updated_at = now()
  returning amount into v_amount;

  return jsonb_build_object('status', 'ok', 'resource_key', p_resource_key, 'amount', v_amount);
end;
$$;

-- ---------------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------------

alter table public.profiles          enable row level security;
alter table public.account_settings  enable row level security;
alter table public.story_saves       enable row level security;
alter table public.online_saves      enable row level security;
alter table public.save_backups      enable row level security;
alter table public.catalog_items     enable row level security;
alter table public.item_ownership    enable row level security;
alter table public.equipped_items    enable row level security;
alter table public.resources         enable row level security;
alter table public.claimed_migrations enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists account_settings_all_own on public.account_settings;
create policy account_settings_all_own on public.account_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Saves are readable and insertable by their owner, but UPDATES go through the
-- write functions so optimistic concurrency and backups cannot be bypassed.
drop policy if exists story_saves_select_own on public.story_saves;
create policy story_saves_select_own on public.story_saves
  for select using (auth.uid() = user_id);
drop policy if exists online_saves_select_own on public.online_saves;
create policy online_saves_select_own on public.online_saves
  for select using (auth.uid() = user_id);

drop policy if exists save_backups_select_own on public.save_backups;
create policy save_backups_select_own on public.save_backups
  for select using (auth.uid() = user_id);

drop policy if exists catalog_read_authenticated on public.catalog_items;
create policy catalog_read_authenticated on public.catalog_items
  for select to authenticated using (true);

drop policy if exists ownership_select_own on public.item_ownership;
create policy ownership_select_own on public.item_ownership
  for select using (auth.uid() = user_id);

drop policy if exists equipped_all_own on public.equipped_items;
create policy equipped_all_own on public.equipped_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists resources_select_own on public.resources;
create policy resources_select_own on public.resources
  for select using (auth.uid() = user_id);

drop policy if exists claimed_migrations_select_own on public.claimed_migrations;
create policy claimed_migrations_select_own on public.claimed_migrations
  for select using (auth.uid() = user_id);

-- No insert/update/delete policies exist for item_ownership, resources,
-- story_saves, online_saves (update), save_backups (write) or
-- claimed_migrations. That is deliberate: those paths are reachable only
-- through the SECURITY DEFINER functions above.

grant execute on function
  public.story_save_write(int, jsonb, bigint, text, text, int, int),
  public.online_save_write(int, jsonb, bigint, text, text, int),
  public.claim_local_migration(uuid, text, int, jsonb, int, int, text),
  public.grant_item(text, text, text),
  public.adjust_resource(text, text, bigint)
to authenticated;
