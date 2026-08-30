-- DayKare Phase 3 — one-paste verification.
--
-- Run this in the Supabase SQL Editor AFTER applying the migration.
-- Every row should read PASS. Anything else, send me the whole table.
--
-- NOTE: the SQL Editor runs as a superuser and BYPASSES row-level security.
-- This proves the protections EXIST. It cannot prove the browser is
-- restricted by them - that test has to run from the game, as the player.

with checks as (

  select 1 as ord, 'tables created' as check_name, '10' as expected,
    count(*)::text as actual
  from information_schema.tables
  where table_schema = 'public'
    and table_name in ('profiles','account_settings','story_saves','online_saves',
                       'save_backups','catalog_items','item_ownership',
                       'equipped_items','resources','claimed_migrations')

  union all
  select 2, 'row level security enabled on all 10', '10',
    count(*)::text
  from pg_class
  where relnamespace = 'public'::regnamespace and relkind = 'r' and relrowsecurity
    and relname in ('profiles','account_settings','story_saves','online_saves',
                    'save_backups','catalog_items','item_ownership',
                    'equipped_items','resources','claimed_migrations')

  union all
  -- The heart of it: no way in for the client except the definer functions.
  select 3, 'no client write policies on ownership/resources/saves', '0',
    count(*)::text
  from pg_policies
  where schemaname = 'public'
    and tablename in ('item_ownership','resources','story_saves','online_saves',
                      'save_backups','claimed_migrations','catalog_items')
    and cmd in ('INSERT','UPDATE','DELETE','ALL')

  union all
  select 4, 'security definer functions', '6',
    count(*)::text
  from pg_proc
  where pronamespace = 'public'::regnamespace and prosecdef
    and proname in ('story_save_write','online_save_write','claim_local_migration',
                    'grant_item','adjust_resource','handle_new_user')

  union all
  select 5, 'story and online saves are separate tables', '2',
    count(*)::text
  from information_schema.tables
  where table_schema = 'public' and table_name in ('story_saves','online_saves')

  union all
  -- The anti-duplication guarantee, enforced by Postgres.
  select 6, 'item_ownership primary key is (user_id, item_id, scope)', 'true',
    (exists (
      select 1 from pg_constraint c
      where c.conrelid = 'public.item_ownership'::regclass
        and c.contype = 'p'
        and (
          select array_agg(a.attname::text order by a.attname)
          from unnest(c.conkey) k join pg_attribute a
            on a.attrelid = c.conrelid and a.attnum = k
        ) = array['item_id','scope','user_id']
    ))::text

  union all
  select 7, 'resources cannot go negative', 'true',
    (exists (
      select 1 from pg_constraint
      where conrelid = 'public.resources'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%amount >= 0%'
    ))::text

  union all
  select 8, 'equipped items must be owned (foreign key)', 'true',
    (exists (
      select 1 from pg_constraint
      where conrelid = 'public.equipped_items'::regclass
        and contype = 'f'
        and confrelid = 'public.item_ownership'::regclass
    ))::text

  union all
  select 9, 'save guard triggers installed', '2',
    count(*)::text
  from pg_trigger
  where not tgisinternal and tgname in ('story_saves_guard','online_saves_guard')

  union all
  select 10, 'profile bootstrap trigger on auth.users', '1',
    count(*)::text
  from pg_trigger
  where not tgisinternal and tgname = 'on_auth_user_created'

  union all
  select 11, 'story save rep/day constraints', '2',
    count(*)::text
  from pg_constraint
  where conrelid = 'public.story_saves'::regclass and contype = 'c'
    and (pg_get_constraintdef(oid) ilike '%rep >= 0%'
      or pg_get_constraintdef(oid) ilike '%day_number >= 1%')
)

select
  ord as "#",
  check_name as "check",
  expected,
  actual,
  case when expected = actual then 'PASS' else '*** FAIL ***' end as status
from checks
order by ord;
