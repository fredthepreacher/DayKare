import assert from 'node:assert/strict';
import {
  ACCOUNT_SETTINGS_KEY,
  decideInitialAction,
  describeOnlineSave,
  describeSave,
  describeStorySave,
  formatRelativeTime,
  DEVICE_SETTINGS_KEY,
  MIGRATED_FLAG_KEY,
  accountSettingsFromLegacyOnlineSave,
  buildConflictReport,
  canWrite,
  COLUMNS,
  defaultAccountSettings,
  defaultDeviceSettings,
  deviceSettingsFromLegacyOnlineSave,
  normalizeAccountSettings,
  normalizeDeviceSettings,
  payloadHash,
  readCloudConfig,
  stableStringify,
  suggestResolution,
  validateCandidate,
  verifyUpload,
  type SaveSummary,
  type SyncMeta,
} from '@workspace/cloud-sync';
import {
  SAVE_KEYS,
  bootSave,
  captureBootSnapshot,
  hadPersistedSaveAtBoot,
  resetBootSnapshotForTests,
} from './localSaveSnapshot';

/**
 * Deterministic tests for the cloud sync layer. No network, no Supabase, no
 * browser — every guarantee asserted here is one we can hold without them,
 * which is the point: the offline path is the one players depend on.
 */

// --- payload hashing --------------------------------------------------------

assert.equal(
  stableStringify({ b: 1, a: 2 }),
  stableStringify({ a: 2, b: 1 }),
  'hashing is independent of property order',
);
assert.equal(
  payloadHash({ dayNumber: 3, rep: 10 }),
  payloadHash({ rep: 10, dayNumber: 3 }),
  'identical saves hash identically regardless of key order',
);
assert.notEqual(
  payloadHash({ dayNumber: 3 }),
  payloadHash({ dayNumber: 4 }),
  'a changed save produces a different hash',
);
assert.equal(
  stableStringify({ a: 1, b: undefined }),
  stableStringify({ a: 1 }),
  'undefined values do not change the hash',
);
assert.equal(payloadHash([1, 2, 3]), payloadHash([1, 2, 3]), 'arrays hash stably');
assert.notEqual(payloadHash([1, 2, 3]), payloadHash([3, 2, 1]), 'array order is significant');

// --- optimistic concurrency -------------------------------------------------

const meta: SyncMeta = {
  scope: 'story',
  revision: 14,
  saveVersion: 4,
  updatedAt: null,
  deviceLabel: null,
  payloadHash: null,
};
assert.equal(canWrite(meta, 14), true, 'a write against the expected revision is allowed');
assert.equal(canWrite(meta, 15), false, 'a write against a moved-on revision is refused');
assert.equal(canWrite(meta, 13), false, 'a write against an older revision is refused too');

// --- conflict resolution ordering -------------------------------------------

const local = (patch: Partial<SaveSummary> = {}): SaveSummary => ({
  scope: 'story', saveVersion: 4, revision: 14, updatedAt: 1000, dayNumber: 5, rep: 50, ...patch,
});
const cloud = (patch: Partial<SaveSummary> = {}): SaveSummary => ({
  scope: 'story', saveVersion: 4, revision: 15, updatedAt: 2000, dayNumber: 5, rep: 50, ...patch,
});

assert.equal(
  suggestResolution(local({ saveVersion: 5 }), cloud()).choice,
  'keep-local',
  'a newer save version wins over everything else',
);
assert.equal(
  suggestResolution(local(), cloud({ saveVersion: 5 })).choice,
  'keep-cloud',
  'a newer cloud save version wins even though local was edited more recently',
);
assert.equal(
  suggestResolution(local({ dayNumber: 9 }), cloud({ dayNumber: 3 })).choice,
  'keep-local',
  'more days played beats a more recent timestamp',
);
assert.equal(
  suggestResolution(local({ rep: 90 }), cloud({ rep: 10 })).choice,
  'keep-local',
  'more REP breaks a day-number tie',
);
assert.equal(
  suggestResolution(local({ updatedAt: 1 }), cloud({ updatedAt: 2 })).choice,
  'keep-cloud',
  'timestamp is the last resort, not the first',
);

const report = buildConflictReport('story', local(), {
  save_version: 4,
  payload: {},
  revision: 15,
  payload_hash: null,
  updated_at: new Date(2000).toISOString(),
  device_label: 'iOS',
  rep: 50,
  day_number: 5,
});
assert.equal(report.scope, 'story', 'the report names its scope');
assert.equal(report.cloud.deviceLabel, 'iOS', 'the report says which device the other save came from');
assert.ok(report.reason.length > 0, 'the report explains its suggestion in words a player can read');

// --- migration validation ---------------------------------------------------

const identity = (value: unknown) => value;

assert.equal(
  validateCandidate({ scope: 'story', saveVersion: 4, payload: null, rep: 0, dayNumber: 1 }, identity).ok,
  false,
  'an empty local save is never uploaded',
);
assert.equal(
  validateCandidate({ scope: 'story', saveVersion: -1, payload: { a: 1 }, rep: 0, dayNumber: 1 }, identity).ok,
  false,
  'an implausible save version is rejected',
);

const thrower = () => { throw new Error('bad save'); };
const rejected = validateCandidate(
  { scope: 'story', saveVersion: 4, payload: { a: 1 }, rep: 0, dayNumber: 1 },
  thrower,
);
assert.equal(rejected.ok, false, 'a save the game normalizer rejects is not uploaded');
assert.ok(
  rejected.ok === false && rejected.reason.includes('normalizer'),
  'the failure says the normalizer rejected it, so the cause is obvious',
);

const accepted = validateCandidate(
  { scope: 'story', saveVersion: 4, payload: { dayNumber: 5 }, rep: 0, dayNumber: 5 },
  identity,
);
assert.equal(accepted.ok, true, 'a valid save passes validation');
assert.ok(accepted.ok === true && accepted.hash.length === 8, 'validation produces a hash for verification');

// --- upload verification ----------------------------------------------------

const sent = { dayNumber: 5, rep: 12 };
assert.equal(verifyUpload(payloadHash(sent), sent), true, 'a faithful cloud copy verifies');
assert.equal(
  verifyUpload(payloadHash(sent), { dayNumber: 5, rep: 13 }),
  false,
  'a cloud copy that differs fails verification and is never marked migrated',
);
assert.equal(
  verifyUpload(payloadHash(sent), { rep: 12, dayNumber: 5 }),
  true,
  'verification is not fooled by key ordering',
);

// --- configuration / offline safety -----------------------------------------

assert.equal(readCloudConfig(undefined), null, 'no env means local-only, not a crash');
assert.equal(readCloudConfig({}), null, 'empty env means local-only');
assert.equal(
  readCloudConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co' }),
  null,
  'half-configured Supabase falls back to local-only rather than half-working',
);
assert.deepEqual(
  readCloudConfig({ VITE_SUPABASE_URL: ' https://x.supabase.co ', VITE_SUPABASE_ANON_KEY: ' key ' }),
  { url: 'https://x.supabase.co', anonKey: 'key' },
  'configuration is trimmed, so a stray newline in a dashboard field does not break auth',
);

// --- settings split ---------------------------------------------------------

const legacyOnlineSave = {
  online: { visibility: 'public', inviteCode: 'ABC123', selectedOutfit: 2, selectedAccessory: 1 },
  reducedMotion: true,
  highContrast: true,
  largerText: false,
  audioEnabled: false,
};

const lifted = accountSettingsFromLegacyOnlineSave(legacyOnlineSave);
assert.equal(lifted.reducedMotion, true, 'accessibility preferences survive the lift out of the Online save');
assert.equal(lifted.highContrast, true, 'high contrast survives the lift');
assert.equal(lifted.largerText, false, 'a disabled preference stays disabled');

const liftedDevice = deviceSettingsFromLegacyOnlineSave(legacyOnlineSave);
assert.equal(liftedDevice.audioEnabled, false, 'the mute toggle follows the device, not the account');
assert.equal(
  (lifted as unknown as Record<string, unknown>).audioEnabled,
  undefined,
  'audio is not smuggled into account settings',
);

assert.equal(
  (normalizeAccountSettings(legacyOnlineSave) as unknown as Record<string, unknown>).online,
  undefined,
  'Online progression never leaks into account settings',
);
assert.equal(
  (normalizeDeviceSettings(legacyOnlineSave) as unknown as Record<string, unknown>).online,
  undefined,
  'Online progression never leaks into device settings',
);

assert.deepEqual(
  normalizeAccountSettings(null),
  defaultAccountSettings(),
  'missing account settings fall back to defaults',
);
assert.deepEqual(
  normalizeDeviceSettings('nonsense'),
  defaultDeviceSettings(),
  'corrupt device settings fall back to defaults instead of throwing',
);
assert.equal(
  normalizeDeviceSettings({ renderScale: 99 }).renderScale,
  2,
  'out-of-range device values are clamped, not trusted',
);
assert.equal(
  normalizeDeviceSettings({ quality: 'ludicrous' }).quality,
  'auto',
  'an unknown quality tier falls back to auto',
);

// --- Story / Online isolation ----------------------------------------------

assert.notEqual(
  MIGRATED_FLAG_KEY('story'),
  MIGRATED_FLAG_KEY('online'),
  'Story and Online track their migration state under separate keys',
);
assert.ok(
  MIGRATED_FLAG_KEY('story').includes('story') && !MIGRATED_FLAG_KEY('story').includes('online'),
  'the Story migration flag never references Online',
);
assert.notEqual(
  ACCOUNT_SETTINGS_KEY,
  DEVICE_SETTINGS_KEY,
  'account and device settings use separate storage keys',
);
for (const key of [ACCOUNT_SETTINGS_KEY, DEVICE_SETTINGS_KEY]) {
  assert.ok(
    !key.includes('daykare-save') && !key.includes('daykare-online-preview'),
    `settings key ${key} must not collide with a progression save key`,
  );
}

// --- initial action decision ------------------------------------------------

assert.equal(
  decideInitialAction({ hasCloud: false, hasPersistedLocal: false, cloudHash: null, localHash: null }),
  'idle',
  'a brand new player with nothing anywhere does nothing',
);
assert.equal(
  decideInitialAction({ hasCloud: false, hasPersistedLocal: true, cloudHash: null, localHash: 'aaaa' }),
  'migrate',
  'an existing local save with no cloud copy migrates up',
);
assert.equal(
  decideInitialAction({ hasCloud: true, hasPersistedLocal: false, cloudHash: 'aaaa', localHash: null }),
  'restore',
  'a cloud save with nothing local restores down',
);
assert.equal(
  decideInitialAction({ hasCloud: true, hasPersistedLocal: true, cloudHash: 'aaaa', localHash: 'aaaa' }),
  'idle',
  'identical local and cloud saves are already in sync',
);
assert.equal(
  decideInitialAction({ hasCloud: true, hasPersistedLocal: true, cloudHash: 'aaaa', localHash: 'bbbb' }),
  'conflict',
  'two saves that differ is a conflict, never an automatic overwrite',
);
assert.equal(
  decideInitialAction({ hasCloud: true, hasPersistedLocal: true, cloudHash: null, localHash: 'bbbb' }),
  'conflict',
  'an unknown cloud hash is treated as a conflict, not as "probably the same"',
);

console.log('cloud sync tests passed');

// --- cloud read column lists ---------------------------------------------
//
// Regression test for the Phase 3 preview QA finding. online_saves has no
// day_number column; selecting it made PostgREST reject EVERY Online read with
// 42703, which left the cached revision at 0, which made every Online write a
// revision mismatch. Online stopped syncing after its first row and the UI
// still reported "Cloud save on". A one-word column list was the whole bug.

assert.ok(
  !COLUMNS.online.includes('day_number'),
  'the Online select must not ask for day_number - online_saves has no such column',
);
assert.ok(
  COLUMNS.story.includes('day_number'),
  'the Story select still asks for day_number, which story_saves does have',
);
for (const scope of ['story', 'online'] as const) {
  for (const required of ['save_version', 'payload', 'revision', 'payload_hash', 'updated_at', 'device_label']) {
    assert.ok(
      COLUMNS[scope].includes(required),
      `the ${scope} select must include ${required}; sync cannot work without it`,
    );
  }
}

// --- automatic cloud restore ------------------------------------------------
//
// The Phase 3 preview QA found restore was unreachable: by the time sync ran,
// Zustand had rehydrated and the game had written a default save back, so
// "is there a local save?" was true for everyone - including a player who had
// just cleared their browser data. They were shown a conflict between the save
// they had lost and a default they had never played.
//
// These assertions pin the distinction that fixes it. `hasPersistedLocal` means
// a save was on disk at boot; it never means "the store has state".

// 1. Wiped local storage + an existing cloud save -> restore, NOT conflict.
assert.equal(
  decideInitialAction({
    hasCloud: true,
    hasPersistedLocal: false,
    cloudHash: 'cloud',
    // A default the game wrote milliseconds ago. It hashes to something real,
    // and that is exactly why the hash must not be what decides this.
    localHash: 'freshly-written-default',
  }),
  'restore',
  'a wiped device with a cloud save restores automatically and is never asked to choose',
);

// The same inputs under the old, broken reading produced a conflict. Proving
// the two readings disagree is the regression test: if some future refactor
// starts passing "the store has state" again, this is the line that fails.
assert.notEqual(
  decideInitialAction({ hasCloud: true, hasPersistedLocal: false, cloudHash: 'cloud', localHash: 'default' }),
  'conflict',
  'a default written during hydration must never be treated as a save worth protecting',
);

// 2. A true divergence still conflicts. The fix must not buy restore by
//    weakening the protection that made any of this safe.
assert.equal(
  decideInitialAction({ hasCloud: true, hasPersistedLocal: true, cloudHash: 'cloud', localHash: 'local' }),
  'conflict',
  'two real saves that differ still stop and ask the player',
);
assert.equal(
  decideInitialAction({ hasCloud: true, hasPersistedLocal: true, cloudHash: null, localHash: 'local' }),
  'conflict',
  'an unknown cloud hash is still a conflict, never an assumption that they match',
);
assert.equal(
  decideInitialAction({ hasCloud: true, hasPersistedLocal: true, cloudHash: 'same', localHash: 'same' }),
  'idle',
  'a real local save identical to the cloud copy just continues',
);
assert.equal(
  decideInitialAction({ hasCloud: false, hasPersistedLocal: true, cloudHash: null, localHash: 'local' }),
  'migrate',
  'a real local save with no cloud copy still migrates up',
);
assert.equal(
  decideInitialAction({ hasCloud: false, hasPersistedLocal: false, cloudHash: null, localHash: null }),
  'idle',
  'nothing anywhere is a fresh game, not a restore and not a conflict',
);

// 3. Story and Online decide independently.
//
// The scopes share this function, so the guarantee is that the function is
// pure in its inputs - one scope's answer cannot depend on the other's. Given
// per-scope inputs, each gets its own verdict in the same breath.
const storyDecision = decideInitialAction({
  hasCloud: true, hasPersistedLocal: false, cloudHash: 'story-cloud', localHash: null,
});
const onlineDecision = decideInitialAction({
  hasCloud: true, hasPersistedLocal: true, cloudHash: 'online-cloud', localHash: 'online-local',
});
assert.equal(storyDecision, 'restore', 'Story restores on its own evidence');
assert.equal(onlineDecision, 'conflict', 'Online conflicts on its own evidence, in the same session');
assert.notEqual(storyDecision, onlineDecision, 'the two scopes reach different verdicts independently');

// 4. A restore must not spend a revision echoing itself back.
//
// After applying a cloud payload, cloudSync re-seeds the cached hash from what
// the game is NOW holding rather than from the row, because normalising can
// legitimately change a byte. writeCloudSave skips when the hash is unchanged,
// so a correctly seeded cache means the next flush is a no-op. These two
// assertions are the halves of that: normalising is hash-visible, and an
// unchanged payload hashes identically.
const restoredFromCloud = { dayNumber: 5, rep: 12 };
const afterNormalising = { dayNumber: 5, rep: 12 };
assert.equal(
  payloadHash(restoredFromCloud),
  payloadHash(afterNormalising),
  'a payload the normalizer left alone hashes identically, so no write is scheduled',
);
assert.notEqual(
  payloadHash(restoredFromCloud),
  payloadHash({ dayNumber: 5, rep: 13 }),
  'a payload the normalizer DID change hashes differently - which is why the cache is seeded from the game, not the row',
);
// And the concurrency guard still refuses a write against a revision that moved.
assert.equal(
  canWrite({ scope: 'story', revision: 9, saveVersion: 4, updatedAt: null, deviceLabel: null, payloadHash: null }, 9),
  true,
  'after a restore the client writes against the revision it just read',
);
assert.equal(
  canWrite({ scope: 'story', revision: 9, saveVersion: 4, updatedAt: null, deviceLabel: null, payloadHash: null }, 10),
  false,
  'and still refuses if that revision moved underneath it',
);


// --- the boot snapshot ------------------------------------------------------
//
// The reading that makes automatic restore possible. Everything above depends
// on this answering "was any of this the player's before we started?" rather
// than "is there something in storage now?".

const fakeStorage = (seed: Record<string, string>) => {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
};
const withStorage = (seed: Record<string, string>) => {
  (globalThis as Record<string, unknown>).window = { localStorage: fakeStorage(seed) };
  resetBootSnapshotForTests();
  captureBootSnapshot();
};

// A player with a real Story save and no Online save.
withStorage({ [SAVE_KEYS.story]: JSON.stringify({ state: { dayNumber: 9, rep: 40 }, version: 4 }) });
assert.equal(hadPersistedSaveAtBoot('story'), true, 'a save on disk at boot is recognised as the player\'s');
assert.equal(hadPersistedSaveAtBoot('online'), false, 'an absent key is absent - not an empty save');
assert.deepEqual(
  bootSave('story').payload,
  { dayNumber: 9, rep: 40 },
  'the inner state is unwrapped from the Zustand { state, version } envelope',
);

// Wiped storage. This is the case the whole change exists for.
withStorage({});
assert.equal(hadPersistedSaveAtBoot('story'), false, 'cleared site data reads as no save, so the cloud copy comes down');
assert.equal(
  decideInitialAction({ hasCloud: true, hasPersistedLocal: hadPersistedSaveAtBoot('story'), cloudHash: 'c', localHash: 'default' }),
  'restore',
  'wiped storage plus a cloud save restores end to end through the real snapshot',
);

// A real save we cannot parse. `existed` must stay true: a corrupt save is
// still the player's, and overwriting it with a cloud copy would destroy the
// only thing that could be recovered from. It conflicts instead.
withStorage({ [SAVE_KEYS.story]: '{ this is not json' });
assert.equal(hadPersistedSaveAtBoot('story'), true, 'an unparseable save still counts as a real save');
assert.equal(bootSave('story').payload, null, 'but its payload is null rather than a guess');
assert.equal(
  decideInitialAction({ hasCloud: true, hasPersistedLocal: hadPersistedSaveAtBoot('story'), cloudHash: 'c', localHash: null }),
  'conflict',
  'a corrupt local save is never silently replaced by the cloud copy',
);

// Storage that throws outright - private mode, blocked site data.
(globalThis as Record<string, unknown>).window = {
  get localStorage(): never { throw new Error('blocked'); },
};
resetBootSnapshotForTests();
captureBootSnapshot();
assert.equal(hadPersistedSaveAtBoot('story'), false, 'unreadable storage claims nothing rather than inventing a save');

// Idempotent: a later call cannot overwrite the boot reading with a
// post-hydration one, which is the failure mode this guards.
withStorage({});
(globalThis as Record<string, unknown>).window = {
  localStorage: fakeStorage({ [SAVE_KEYS.story]: JSON.stringify({ state: { dayNumber: 1 }, version: 4 }) }),
};
captureBootSnapshot();
assert.equal(
  hadPersistedSaveAtBoot('story'),
  false,
  'the first reading wins - a default written after boot cannot masquerade as a persisted save',
);

delete (globalThis as Record<string, unknown>).window;
resetBootSnapshotForTests();


// --- conflict save summaries -------------------------------------------------
//
// The chooser used to offer "Day 7, 100 REP" against "Day 7, 100 REP" - two
// identical lines describing saves that differed by a full Juice Club float and
// a restock. Choosing "the other save" would silently have cost real progress
// and nothing on screen said so.

const storyFacts = describeStorySave({
  dayNumber: 7,
  progression: { reputation: 100, tokens: 42 },
  rivalStory: { chapter: 3 },
  juiceClubCash: 8,
  juiceStock: 5,
  crackerStock: 5,
  inventory: ['a', 'b', 'c'],
  collectibles: ['rock'],
});
const factValue = (facts: { label: string; value: string }[], label: string) =>
  facts.find((f) => f.label === label)?.value ?? null;

assert.equal(factValue(storyFacts, 'Day'), '7', 'Story shows the day');
assert.equal(factValue(storyFacts, 'REP'), '100', 'Story shows REP');
assert.equal(factValue(storyFacts, 'Chapter'), '3', 'Story shows the story chapter marker');
assert.equal(factValue(storyFacts, 'Star Tokens'), '42', 'Story shows the major currency');
assert.equal(factValue(storyFacts, 'Juice Club cash'), '$8', 'Story shows Juice Club cash - the field that made this necessary');
assert.equal(factValue(storyFacts, 'Juice stock'), '5', 'Story shows juice stock');
assert.equal(factValue(storyFacts, 'Cracker stock'), '5', 'Story shows cracker stock');
assert.equal(factValue(storyFacts, 'Items'), '3', 'Story shows how many items are owned');

// The two saves from the real conflict: identical Day and REP, different money.
const richer = describeStorySave({ dayNumber: 7, progression: { reputation: 100 }, juiceClubCash: 8, juiceStock: 5, crackerStock: 5 });
const poorer = describeStorySave({ dayNumber: 7, progression: { reputation: 100 }, juiceClubCash: 0, juiceStock: 0, crackerStock: 0 });
assert.equal(factValue(richer, 'Day'), factValue(poorer, 'Day'), 'the two saves really do agree on the day');
assert.equal(factValue(richer, 'REP'), factValue(poorer, 'REP'), 'and on REP');
assert.notEqual(
  factValue(richer, 'Juice Club cash'),
  factValue(poorer, 'Juice Club cash'),
  'but the summary now distinguishes them, which is the entire point of the change',
);

// Zero is a fact. Absent is not. These must never render the same.
assert.equal(factValue(poorer, 'Juice Club cash'), '$0', 'a real zero is shown as zero');
const sparse = describeStorySave({ dayNumber: 2 });
assert.equal(factValue(sparse, 'Juice Club cash'), null, 'a save with no Juice Club data omits the row entirely');
assert.equal(factValue(sparse, 'Star Tokens'), null, 'a missing currency is omitted, never shown as 0');
assert.equal(factValue(sparse, 'Day'), '2', 'the fields it does have are still reported');
assert.deepEqual(describeStorySave(null), [], 'an absent payload describes nothing rather than inventing defaults');
assert.deepEqual(describeStorySave('nonsense'), [], 'a malformed payload describes nothing');

// Online is described in Online's terms.
const onlineFacts = describeOnlineSave({
  version: 1,
  visibility: 'invite',
  inviteCode: 'DAYKARE',
  appearance: { outfitIndex: 2, accessoryIndex: 0 },
});
assert.equal(factValue(onlineFacts, 'Who can join'), 'Invite code', 'Online shows visibility in words, not a raw enum');
assert.equal(factValue(onlineFacts, 'Outfit'), '#3', 'Online shows the outfit, counted from one as players see it');
assert.equal(factValue(onlineFacts, 'Accessory'), '#1', 'Online shows the accessory');
assert.equal(factValue(onlineFacts, 'Invite code'), 'DAYKARE', 'Online shows the invite code');
assert.equal(factValue(onlineFacts, 'Day'), null, 'Online never shows a day - it does not have one');
assert.equal(
  factValue(onlineFacts, 'REP'),
  null,
  'Online never shows REP: online_saves.rep is a column default, and reporting it would invent a fact',
);
assert.equal(factValue(onlineFacts, 'Juice Club cash'), null, 'Story-only fields stay out of an Online summary');

// describeSave routes by scope rather than guessing from the payload shape.
assert.deepEqual(
  describeSave('online', { visibility: 'public' }),
  describeOnlineSave({ visibility: 'public' }),
  'describeSave uses the Online describer for the Online scope',
);
assert.deepEqual(
  describeSave('story', { dayNumber: 4 }),
  describeStorySave({ dayNumber: 4 }),
  'and the Story describer for the Story scope',
);

// The summary describes; it must not rank. Adding money to one side cannot
// change which side is suggested.
const base = { scope: 'story' as const, saveVersion: 4, revision: 14, updatedAt: 1000, dayNumber: 5, rep: 50 };
const withoutFacts = suggestResolution({ ...base }, { ...base, revision: 15, updatedAt: 2000 });
const withFacts = suggestResolution(
  { ...base, facts: describeStorySave({ dayNumber: 5, progression: { reputation: 50 }, juiceClubCash: 9999 }) },
  { ...base, revision: 15, updatedAt: 2000, facts: describeStorySave({ dayNumber: 5, progression: { reputation: 50 }, juiceClubCash: 0 }) },
);
assert.equal(
  withFacts.choice,
  withoutFacts.choice,
  'the displayed facts do not feed the suggestion - the sync layer never decides whose progress matters more',
);

// Relative times, used only where a real timestamp exists.
const now = Date.UTC(2026, 0, 2, 12, 0, 0);
assert.equal(formatRelativeTime(now - 5_000, now), 'just now', 'seconds ago reads as just now');
assert.equal(formatRelativeTime(now - 60_000, now), '1 minute ago', 'singular minute');
assert.equal(formatRelativeTime(now - 120_000, now), '2 minutes ago', 'plural minutes');
assert.equal(formatRelativeTime(now - 3 * 3_600_000, now), '3 hours ago', 'hours');
assert.equal(formatRelativeTime(now - 2 * 86_400_000, now), '2 days ago', 'days');
assert.equal(formatRelativeTime(now + 5_000, now), 'just now', 'a clock skewed into the future does not read as negative');

// A conflict report carries both summaries, each in its own scope's terms.
const reportWithFacts = buildConflictReport('story', {
  scope: 'story', saveVersion: 4, revision: 14, updatedAt: null, dayNumber: 7, rep: 100,
  facts: describeStorySave({ dayNumber: 7, progression: { reputation: 100 }, juiceClubCash: 8 }),
}, {
  save_version: 4,
  payload: { dayNumber: 7, progression: { reputation: 100 }, juiceClubCash: 0 },
  revision: 15,
  payload_hash: null,
  updated_at: new Date(now).toISOString(),
  device_label: 'Windows',
  rep: 100,
  day_number: 7,
});
assert.equal(factValue(reportWithFacts.local.facts ?? [], 'Juice Club cash'), '$8', 'the local side describes the local save');
assert.equal(factValue(reportWithFacts.cloud.facts ?? [], 'Juice Club cash'), '$0', 'the cloud side is described from the cloud payload');
assert.notEqual(
  factValue(reportWithFacts.local.facts ?? [], 'Juice Club cash'),
  factValue(reportWithFacts.cloud.facts ?? [], 'Juice Club cash'),
  'the difference that was invisible is now on the card',
);

const onlineReport = buildConflictReport('online', {
  scope: 'online', saveVersion: 1, revision: 1, updatedAt: null,
  facts: describeOnlineSave({ visibility: 'public', appearance: { outfitIndex: 0, accessoryIndex: 0 } }),
}, {
  save_version: 1,
  payload: { visibility: 'invite', appearance: { outfitIndex: 2, accessoryIndex: 1 } },
  revision: 2,
  payload_hash: null,
  updated_at: new Date(now).toISOString(),
  device_label: 'Windows',
  rep: 0,
  day_number: 1,
});
assert.equal(onlineReport.cloud.dayNumber, undefined, 'an Online conflict carries no day number, even though the column exists');
assert.equal(onlineReport.cloud.rep, undefined, 'and no REP, because the column value is a default and not a fact');
assert.equal(factValue(onlineReport.cloud.facts ?? [], 'Who can join'), 'Invite code', 'the Online summary is in Online terms');
