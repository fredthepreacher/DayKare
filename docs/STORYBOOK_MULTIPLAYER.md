# Storybook Lane and 20-player multiplayer

## Storybook Lane

Storybook Lane is a third playable world zone. The route still requires the
existing three Rainbow Tidy-Up lifetime rounds and is only enterable from
5:30 PM to 6:30 PM. At closing, the game saves and starts the next daycare day.

Persistent local data is stored under `daykare-storybook-lane`:

- Ribbon Bucks balance (new players receive 2,500 RB)
- tricycle, dog, Personal Crib and Mini Ride-On ownership
- crib tier

The per-visit scoop count and 60-second recovery are session-only. Multiplayer
purchases use the `purchase_storybook_item` database function and never trust a
client-submitted balance.

## Multiplayer architecture

- Supabase Anonymous Auth supplies a stable player id without collecting PII.
- `join_daykare_room` atomically enforces the configurable 20-player cap.
- Supabase Presence tracks joins, leaves and occupancy.
- Broadcast sends validated player transforms at 10 Hz; clients interpolate
  remote avatars locally.
- A 30-second heartbeat makes stale browser sessions recoverable.
- Personal quests, settings and UI remain local. Zone, position, facing,
  locomotion and the ice-cream flop state are shared.
- Economy writes use database RPCs; no service-role key is shipped to Vite.

## Deployment setup

1. Create a Supabase project (a separate project for previews is recommended).
2. Enable **Anonymous Sign-Ins** under Authentication providers.
3. Apply `supabase/migrations/20260901063000_daykare_multiplayer_storybook_authority.sql`.
4. Set these Vercel build variables:

   ```text
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<publishable-or-anon-key>
   ```

5. Redeploy. Open the same deployment in two browsers, choose Multiplayer,
   enter different display names, and select **Join DayKare Room**.

When either variable is absent, Multiplayer accurately reports that it is not
configured and Story Mode keeps working normally.

## Free-tier envelope

As checked on September 1, 2026, Supabase Free includes 200 peak Realtime
connections and 2 million Realtime messages per month. A single DayKare room
uses at most 20 connections. The 10 Hz transform rate is appropriate for short
friends sessions, but long or heavily used rooms can exhaust the free message
quota and should be monitored in Supabase Realtime reports. Free projects may
pause after one week of inactivity.

## Future hooks

- multiple room allocation and invite-code routing
- chat moderation and parental controls before public discovery
- authoritative shared task/object claims
- pet and vehicle transform replication beyond ownership/recovery display
- reconnect backoff and region-aware room selection
- server-recorded crib tiers and an earnable RB activity loop
