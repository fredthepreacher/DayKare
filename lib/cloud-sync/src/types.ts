/** Shared types for DayKare cloud synchronisation. */

export type SaveScope = 'story' | 'online';

/** Every state the sync layer can be in, from the player's point of view. */
export type SyncState =
  | 'disabled'      // Supabase not configured - local-only play, not an error
  | 'offline'       // configured, but no network or no session yet
  | 'idle'          // in sync
  | 'syncing'
  | 'conflict'      // cloud moved on; the player must choose
  | 'error';

export interface SyncStatus {
  state: SyncState;
  lastSyncedAt: number | null;
  lastError: string | null;
  /** Revision this client believes the cloud row is at. */
  revision: number;
  pendingWrites: number;
}

/**
 * What the client tracks per scope so it can write with optimistic
 * concurrency instead of blind last-write-wins.
 */
export interface SyncMeta {
  scope: SaveScope;
  /** 0 means "no cloud save yet". */
  revision: number;
  saveVersion: number;
  updatedAt: number | null;
  deviceLabel: string | null;
  payloadHash: string | null;
}

export interface CloudSaveRow {
  save_version: number;
  payload: unknown;
  revision: number;
  payload_hash: string | null;
  updated_at: string;
  device_label: string | null;
  rep?: number;
  day_number?: number;
}

export type WriteResult =
  | { status: 'ok'; revision: number }
  | { status: 'conflict'; reason: string; server: Partial<CloudSaveRow> & { revision?: number } }
  | { status: 'error'; message: string }
  | { status: 'skipped'; reason: string };
