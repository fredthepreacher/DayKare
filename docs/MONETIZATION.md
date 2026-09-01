# DayKare monetization architecture

The playable branch uses a clearly labeled local preview sandbox. It never
collects payment details and does not claim to create production entitlements.
On a custom production hostname, paid checkout is disabled.

## Configuration

- `artifacts/3d-game/src/game/monetization.ts` is the versioned, data-driven
  preview catalog: prices, currency quantities, bundle contents, boost duration
  and multipliers, Kare/Family Pass benefits, featured items, daily deals, and
  availability windows.
- `supabase/migrations/20260901041440_care_monetization.sql` is the future remote
  source of truth. Its product records are readable, but wallets, receipts, and
  entitlements have no browser write path.

## Payment boundary

`paymentProvider.ts` defines one interface for web, Apple, and Google providers.
Only an unavailable production adapter and a preview sandbox adapter exist.
Add Stripe webhooks or native store receipt verification on a trusted backend;
never put secret keys or purchase fulfillment in the browser.

The backend flow is: create provider checkout -> provider callback/webhook ->
verify signature/receipt and player -> insert the unique provider transaction ->
atomically update wallet/entitlements -> return the authoritative snapshot.
The `(provider, provider_transaction_id)` database constraint prevents replay.

## External setup still required

- Apply the Supabase migration to the intended project after review.
- Configure Stripe products/webhooks for web, if web sales are enabled.
- Configure Apple App Store Connect and Google Play Billing SKUs for native
  digital goods. Native builds must use their platform billing system.
- Add a trusted fulfillment API/service-role runtime and provider secrets there.
- Add a remote catalog loader/admin UI only after authenticated authorization is
  available. Do not expose product mutation to a public client.
