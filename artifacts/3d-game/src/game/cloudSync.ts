import { create } from 'zustand';
import {
  MIGRATED_FLAG_KEY,
  MIGRATION_TOKEN_KEY,
  buildConflictReport,
  claimLocalMigration,
  ensureSession,
  getCloudClient,
  payloadHash,
  readCloudConfig,
  readCloudSave,
  validateCandidate,
  verifyUpload,
  writeCloudSave,
  type ConflictReport,
  type SaveScope,
  type SyncMeta,
  type SyncStatus,
} from '@workspace/cloud-sync';
import { useGameStore, serializeGameState, normalizePersistedGameState } from './store';
import { useModeStore } from './modeStore';
import { PROGRESSION_VERSION } from './progression';

/**
 * Cloud synchronisation for DayKare.
 *
 * The single rule this module is built around: **DayKare must play without
 * it.** No Supabase configuration, no network, an outage, an expired session,
 * a rejected write — every one of those paths ends with the game running
 * normally on its local save. Nothing here is on the critical path to first
 * paint, and nothing here runs on the frame path.
 *
 * It also never merges saves. When the cloud has moved on, the write is
 * refused and a conflict is reported for the player to resolve. Protecting
 * progress beats resolving it cleverly.
 */

const DEBOUNCE_MS = 10_000;

const emptyStatus = (state: SyncStatus['state']): SyncStatus => ({
  state,
  lastSyncedAt: null,
  lastError: null,
  revision: 0,
  pendingWrites: 0,
});

interface CloudSyncStore {
  story: SyncStatus;
  online: SyncStatus;
  conflict: ConflictReport | null;
  signedIn: boolean;
  setStatus: (scope: SaveScope, patch: Partial<SyncStatus>) => void;
  setConflict: (report: ConflictReport | null) => void;
  setSignedIn: (value: boolean) => void;
}

export const useCloudSyncStore = create<CloudSyncStore>()((set) => ({
  story: emptyStatus('disabled'),
  online: emptyStatus('disabled'),
  conflict: null,
  signedIn: false,
  setStatus: (scope, patch) => set((state) => ({
    [scope]: { ...state[scope], ...patch },
  } as Pick<CloudSyncStore, SaveScope>)),
  setConflict: (report) => set({ conflict: report }),
  setSignedIn: (value) => set({ signedIn: value }),
}));

const meta: Record<SaveScope, SyncMeta> = {
  story: { scope: 'story', revision: 0, saveVersion: PROGRESSION_VERSION, updatedAt: null, deviceLabel: null, payloadHash: null },
  online: { scope: 'online', revision: 0, saveVersion: 1, updatedAt: null, deviceLabel: null, payloadHash: null },
};

const deviceLabel = () => {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Mac/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows';
  return 'Browser';
};

const readLocal = (key: string): unknown => {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const flag = (key: string, value?: string): string | null => {
  try {
    if (typeof window === 'undefined') return null;
    if (value === undefined) return window.localStorage.getItem(key);
    window.localStorage.setItem(key, value);
    return value;
  } catch {
    return null;
  }
};

/** Stable per scope, so a refresh mid-migration reuses the same claim. */
function migrationToken(scope: SaveScope): string {
  const existing = flag(MIGRATION_TOKEN_KEY(scope));
  if (existing) return existing;
  const token = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  flag(MIGRATION_TOKEN_KEY(scope), token);
  return token;
}

let client: Awaited<ReturnType<typeof getCloudClient>> = null;
let started = false;
const timers: Partial<Record<SaveScope, ReturnType<typeof setTimeout>>> = {};

function storyPayload() {
  return serializeGameState(useGameStore.getState());
}

function onlinePayload() {
  const state = useModeStore.getState();
  return {
    version: 1,
    visibility: state.online.visibility,
    inviteCode: state.online.inviteCode,
    appearance: {
      outfitIndex: state.online.selectedOutfit,
      accessoryIndex: state.online.selectedAccessory,
    },
    // `seats` is deliberately absent. They are local preview scaffolding, and
    // persisting invented seats into a cloud "online save" would be the first
    // step towards faking a connected player.
  };
}

async function pushScope(scope: SaveScope): Promise<void> {
  const status = useCloudSyncStore.getState()[scope];
  if (status.state === 'disabled' || status.state === 'conflict') return;

  const { setStatus, setConflict } = useCloudSyncStore.getState();
  setStatus(scope, { state: 'syncing' });

  const payload = scope === 'story' ? storyPayload() : onlinePayload();
  const gameState = useGameStore.getState();

  const result = await writeCloudSave(client, {
    scope,
    saveVersion: scope === 'story' ? PROGRESSION_VERSION : 1,
    payload,
    meta: meta[scope],
    deviceLabel: deviceLabel(),
    rep: scope === 'story' ? (gameState.progression?.reputation ?? 0) : 0,
    dayNumber: gameState.dayNumber ?? 1,
  });

  if (result.status === 'ok') {
    meta[scope] = { ...meta[scope], revision: result.revision, payloadHash: payloadHash(payload) };
    setStatus(scope, { state: 'idle', revision: result.revision, lastSyncedAt: Date.now(), lastError: null });
    return;
  }
  if (result.status === 'skipped') {
    setStatus(scope, { state: 'idle' });
    return;
  }
  if (result.status === 'conflict') {
    // Another device moved the save on. Stop writing this scope and let the
    // player decide; do not overwrite and do not merge.
    const { row } = await readCloudSave(client, scope);
    if (row) {
      setConflict(buildConflictReport(scope, {
        scope,
        saveVersion: scope === 'story' ? PROGRESSION_VERSION : 1,
        revision: meta[scope].revision,
        updatedAt: Date.now(),
        dayNumber: scope === 'story' ? gameState.dayNumber : undefined,
        rep: scope === 'story' ? gameState.progression?.reputation : undefined,
        deviceLabel: deviceLabel(),
      }, row));
    }
    setStatus(scope, { state: 'conflict', lastError: result.reason });
    return;
  }
  setStatus(scope, { state: 'error', lastError: result.message });
}

function schedulePush(scope: SaveScope) {
  if (useCloudSyncStore.getState()[scope].state === 'disabled') return;
  if (timers[scope]) clearTimeout(timers[scope]);
  timers[scope] = setTimeout(() => { void pushScope(scope); }, DEBOUNCE_MS);
}

/** Flush without waiting for the debounce — used when the tab is hidden. */
export function flushCloudSync() {
  for (const scope of ['story', 'online'] as SaveScope[]) {
    if (timers[scope]) clearTimeout(timers[scope]);
    void pushScope(scope);
  }
}

async function initialiseScope(scope: SaveScope, localKey: string): Promise<void> {
  const { setStatus } = useCloudSyncStore.getState();
  const { row, error } = await readCloudSave(client, scope);
  if (error) {
    setStatus(scope, { state: 'error', lastError: error });
    return;
  }

  if (row) {
    meta[scope] = {
      scope,
      revision: row.revision,
      saveVersion: row.save_version,
      updatedAt: Date.parse(row.updated_at) || null,
      deviceLabel: row.device_label,
      payloadHash: row.payload_hash,
    };
    setStatus(scope, { state: 'idle', revision: row.revision, lastSyncedAt: Date.now() });
    return;
  }

  // No cloud save yet. If this device has local progress, migrate it.
  const stored = readLocal(localKey) as { state?: unknown; version?: number } | null;
  const localPayload = stored && typeof stored === 'object' ? stored.state ?? stored : null;
  if (!localPayload) {
    setStatus(scope, { state: 'idle', revision: 0 });
    return;
  }

  const validated = scope === 'story'
    ? validateCandidate(
      {
        scope,
        saveVersion: PROGRESSION_VERSION,
        payload: localPayload,
        rep: useGameStore.getState().progression?.reputation ?? 0,
        dayNumber: useGameStore.getState().dayNumber ?? 1,
      },
      normalizePersistedGameState,
    )
    : validateCandidate(
      { scope, saveVersion: 1, payload: localPayload, rep: 0, dayNumber: 1 },
      (value) => value,
    );

  if (!validated.ok) {
    // A save we cannot validate is never uploaded and never deleted. It stays
    // exactly where it is and the problem is reported.
    console.error(`DayKare: local ${scope} save failed validation, not migrated:`, validated.reason);
    setStatus(scope, { state: 'error', lastError: `local save not migrated: ${validated.reason}` });
    return;
  }

  const claim = await claimLocalMigration(client, {
    token: migrationToken(scope),
    scope,
    saveVersion: scope === 'story' ? PROGRESSION_VERSION : 1,
    payload: validated.payload,
    rep: useGameStore.getState().progression?.reputation ?? 0,
    dayNumber: useGameStore.getState().dayNumber ?? 1,
    deviceLabel: deviceLabel(),
  });

  if (claim.status === 'error') {
    setStatus(scope, { state: 'error', lastError: claim.message ?? 'migration failed' });
    return;
  }

  // Read back and compare before believing it worked.
  const { row: verifyRow } = await readCloudSave(client, scope);
  const verified = verifyRow ? verifyUpload(validated.hash, verifyRow.payload) : false;
  if (!verified) {
    setStatus(scope, { state: 'error', lastError: 'cloud copy did not match after upload' });
    return;
  }

  meta[scope] = {
    scope,
    revision: verifyRow!.revision,
    saveVersion: verifyRow!.save_version,
    updatedAt: Date.parse(verifyRow!.updated_at) || null,
    deviceLabel: verifyRow!.device_label,
    payloadHash: verifyRow!.payload_hash,
  };
  // The local save is KEPT. Marked migrated, never deleted.
  flag(MIGRATED_FLAG_KEY(scope), new Date().toISOString());
  setStatus(scope, { state: 'idle', revision: verifyRow!.revision, lastSyncedAt: Date.now() });
}

/**
 * Starts cloud sync. Safe to call unconditionally: with no configuration it
 * marks itself disabled and returns, and the game never knows the difference.
 */
export async function startCloudSync(env: Record<string, unknown> | undefined): Promise<void> {
  if (started) return;
  started = true;

  const config = readCloudConfig(env);
  if (!config) {
    // Local-only play. Not an error, not a degraded mode — just DayKare.
    useCloudSyncStore.getState().setStatus('story', { state: 'disabled' });
    useCloudSyncStore.getState().setStatus('online', { state: 'disabled' });
    return;
  }

  useCloudSyncStore.getState().setStatus('story', { state: 'offline' });
  useCloudSyncStore.getState().setStatus('online', { state: 'offline' });

  try {
    client = await getCloudClient(config);
    const session = await ensureSession(client);
    if (!session.user) {
      const message = session.error ?? 'no session';
      useCloudSyncStore.getState().setStatus('story', { state: 'offline', lastError: message });
      useCloudSyncStore.getState().setStatus('online', { state: 'offline', lastError: message });
      return;
    }
    useCloudSyncStore.getState().setSignedIn(true);

    await initialiseScope('story', 'daykare-save');
    await initialiseScope('online', 'daykare-online-preview');

    useGameStore.subscribe(() => schedulePush('story'));
    useModeStore.subscribe(() => schedulePush('online'));

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushCloudSync();
      });
    }
  } catch (error) {
    // Absolutely nothing above is allowed to break the game.
    console.error('DayKare: cloud sync could not start; continuing offline.', error);
    useCloudSyncStore.getState().setStatus('story', { state: 'error', lastError: String(error) });
    useCloudSyncStore.getState().setStatus('online', { state: 'error', lastError: String(error) });
  }
}

/** Test seam. */
export function resetCloudSyncForTests() {
  started = false;
  client = null;
  meta.story = { scope: 'story', revision: 0, saveVersion: PROGRESSION_VERSION, updatedAt: null, deviceLabel: null, payloadHash: null };
  meta.online = { scope: 'online', revision: 0, saveVersion: 1, updatedAt: null, deviceLabel: null, payloadHash: null };
}
