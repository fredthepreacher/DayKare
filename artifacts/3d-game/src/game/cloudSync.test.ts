import assert from 'node:assert/strict';
import {
  ACCOUNT_SETTINGS_KEY,
  decideInitialAction,
  DEVICE_SETTINGS_KEY,
  MIGRATED_FLAG_KEY,
  accountSettingsFromLegacyOnlineSave,
  buildConflictReport,
  canWrite,
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
  decideInitialAction({ hasCloud: false, hasLocal: false, cloudHash: null, localHash: null }),
  'idle',
  'a brand new player with nothing anywhere does nothing',
);
assert.equal(
  decideInitialAction({ hasCloud: false, hasLocal: true, cloudHash: null, localHash: 'aaaa' }),
  'migrate',
  'an existing local save with no cloud copy migrates up',
);
assert.equal(
  decideInitialAction({ hasCloud: true, hasLocal: false, cloudHash: 'aaaa', localHash: null }),
  'restore',
  'a cloud save with nothing local restores down',
);
assert.equal(
  decideInitialAction({ hasCloud: true, hasLocal: true, cloudHash: 'aaaa', localHash: 'aaaa' }),
  'idle',
  'identical local and cloud saves are already in sync',
);
assert.equal(
  decideInitialAction({ hasCloud: true, hasLocal: true, cloudHash: 'aaaa', localHash: 'bbbb' }),
  'conflict',
  'two saves that differ is a conflict, never an automatic overwrite',
);
assert.equal(
  decideInitialAction({ hasCloud: true, hasLocal: true, cloudHash: null, localHash: 'bbbb' }),
  'conflict',
  'an unknown cloud hash is treated as a conflict, not as "probably the same"',
);

console.log('cloud sync tests passed');
