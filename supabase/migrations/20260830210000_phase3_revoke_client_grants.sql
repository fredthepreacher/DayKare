-- DayKare Phase 3 - close the client-callable economy functions.
--
-- Found by the Phase 3 preview QA, from the browser, as a real anonymous
-- player. This POST succeeded:
--
--   POST /rest/v1/rpc/adjust_resource {"p_scope":"story",
--        "p_resource_key":"tokens","p_delta":999999}
--   -> 200 {"status":"ok","resource_key":"tokens","amount":999999}
--
-- Row-level security did its job everywhere it was asked to: direct INSERTs
-- into item_ownership, resources and save_backups were all refused with
-- 42501, and a direct UPDATE or DELETE of the player's own story_saves row
-- matched zero rows. The hole was not in the policies. It was that the two
-- economy functions were granted to `authenticated` and are SECURITY DEFINER,
-- so calling one is a legitimate, authenticated request that bypasses every
-- policy by design.
--
-- The delta guard inside adjust_resource (abs(p_delta) > 1000000) is a sanity
-- clamp on a plausible value, not an authorization check. It was never
-- pretending to be one. It bounds a single call to a million and does nothing
-- at all about calling it again.
--
-- The fix is not a better guard. Nothing in the game calls either function:
-- grep across lib/ and artifacts/3d-game/src finds zero references. They were
-- granted in anticipation of a Phase 4 economy that does not exist yet, and
-- an unused door is still a door. So take the grant away and leave the
-- functions in place.
--
-- This costs nothing today and nothing later. When Phase 7 puts a trusted
-- server in front of the economy, that server holds the service role, which
-- is not subject to these grants at all. The client never regains them - if
-- a future client genuinely needs to spend currency, it asks the server, and
-- the server decides. That is the whole point of the split.

-- NOTE the `public` in the revoke list, and do not remove it.
--
-- Postgres grants EXECUTE on every new function to the PUBLIC role by
-- default. The first attempt at this fix revoked from `authenticated, anon`
-- only, re-ran the browser probe, and adjust_resource still returned
-- 200 {"status":"ok","amount":1000000}. Nothing had changed, because the
-- privilege those roles were using was never their own - it was PUBLIC's.
-- The tell was grant_item answering 409 "unknown item" instead of a
-- permission error: the function was still executing, just failing its own
-- validation.
--
-- Revoking from a named role does not remove a PUBLIC grant. Only revoking
-- from PUBLIC does.

revoke execute on function public.grant_item(text, text, text)
  from public, authenticated, anon;

revoke execute on function public.adjust_resource(text, text, bigint)
  from public, authenticated, anon;

comment on function public.grant_item(text, text, text) is
  'Server-authority only. Deliberately NOT granted to authenticated or anon: '
  'a browser that can grant itself items is a browser that will. Callable by '
  'the service role, and from Phase 7 by the trusted server that owns the '
  'economy.';

comment on function public.adjust_resource(text, text, bigint) is
  'Server-authority only. Deliberately NOT granted to authenticated or anon. '
  'The internal delta clamp bounds one call; it does not bound a loop, and it '
  'was never an authorization check. Callable by the service role, and from '
  'Phase 7 by the trusted server that owns the economy.';
