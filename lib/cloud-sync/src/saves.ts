import type { SupabaseClient } from '@supabase/supabase-js';
import { payloadHash } from './hash';
import type { CloudSaveRow, SaveScope, SyncMeta, WriteResult } from './types';

/**
 * Cloud save reads and writes.
 *
 * Writes go through SECURITY DEFINER RPCs rather than table updates, so
 * optimistic concurrency and the pre-overwrite backup cannot be bypassed by
 * the client - not even by this file.
 *
 * Story and Online use separate tables and separate functions. There is no
 * shared code path that takes a scope and picks a table at runtime, because
 * that is precisely the shape of the bug we are refusing to allow.
 */

const TABLE: Record<SaveScope, string> = {
  story: 'story_saves',
  online: 'online_saves',
};

/**
 * The columns each scope actually has.
 *
 * `day_number` exists on story_saves and NOT on online_saves - an Online save
 * has no day. Selecting one list for both scopes made PostgREST answer every
 * Online read with 42703 "column online_saves.day_number does not exist", and
 * because a failed read leaves the cached revision at 0, every subsequent
 * Online write was rejected as a revision mismatch. Online silently stopped
 * syncing after its very first row while the UI still said "Cloud save on".
 *
 * Found in the Phase 3 preview QA. The columns are listed per scope so the
 * next divergence between the two tables fails at the type level here rather
 * than at runtime in a player's browser.
 */
export const COLUMNS: Record<SaveScope, string> = {
  story: 'save_version, payload, revision, payload_hash, updated_at, device_label, rep, day_number',
  online: 'save_version, payload, revision, payload_hash, updated_at, device_label, rep',
};

export async function readCloudSave(
  client: SupabaseClient | null,
  scope: SaveScope,
): Promise<{ row: CloudSaveRow | null; error: string | null }> {
  if (!client) return { row: null, error: null };
  try {
    const { data, error } = await client
      .from(TABLE[scope])
      .select(COLUMNS[scope])
      .maybeSingle();
    if (error) return { row: null, error: error.message };
    return { row: (data as CloudSaveRow | null) ?? null, error: null };
  } catch (error) {
    return { row: null, error: String(error) };
  }
}

export interface WriteRequest {
  scope: SaveScope;
  saveVersion: number;
  payload: unknown;
  meta: SyncMeta;
  deviceLabel: string;
  rep: number;
  dayNumber?: number;
}

export async function writeCloudSave(
  client: SupabaseClient | null,
  request: WriteRequest,
): Promise<WriteResult> {
  if (!client) return { status: 'skipped', reason: 'cloud not configured' };

  const hash = payloadHash(request.payload);
  // Nothing changed since the last successful write - do not spend a round
  // trip, a battery cycle or a row revision on it.
  if (hash === request.meta.payloadHash) {
    return { status: 'skipped', reason: 'unchanged' };
  }

  try {
    const shared = {
      p_save_version: request.saveVersion,
      p_payload: request.payload,
      p_expected_revision: request.meta.revision,
      p_payload_hash: hash,
      p_device_label: request.deviceLabel,
      p_rep: Math.max(0, Math.trunc(request.rep)),
    };

    const { data, error } = request.scope === 'story'
      ? await client.rpc('story_save_write', {
        ...shared,
        p_day_number: Math.max(1, Math.trunc(request.dayNumber ?? 1)),
      })
      : await client.rpc('online_save_write', shared);

    if (error) return { status: 'error', message: error.message };

    const result = data as { status?: string; revision?: number; reason?: string } | null;
    if (result?.status === 'ok' && typeof result.revision === 'number') {
      return { status: 'ok', revision: result.revision };
    }
    if (result?.status === 'conflict') {
      return {
        status: 'conflict',
        reason: result.reason ?? 'revision-mismatch',
        server: result as Partial<CloudSaveRow> & { revision?: number },
      };
    }
    return { status: 'error', message: `unexpected write result: ${JSON.stringify(result)}` };
  } catch (error) {
    return { status: 'error', message: String(error) };
  }
}

export async function claimLocalMigration(
  client: SupabaseClient | null,
  args: {
    token: string;
    scope: SaveScope;
    saveVersion: number;
    payload: unknown;
    rep: number;
    dayNumber: number;
    deviceLabel: string;
  },
): Promise<{ status: 'migrated' | 'exists' | 'error'; message?: string }> {
  if (!client) return { status: 'error', message: 'cloud not configured' };
  try {
    const { data, error } = await client.rpc('claim_local_migration', {
      p_token: args.token,
      p_scope: args.scope,
      p_save_version: args.saveVersion,
      p_payload: args.payload,
      p_rep: Math.max(0, Math.trunc(args.rep)),
      p_day_number: Math.max(1, Math.trunc(args.dayNumber)),
      p_device_label: args.deviceLabel,
    });
    if (error) return { status: 'error', message: error.message };
    const result = data as { status?: string } | null;
    if (result?.status === 'migrated') return { status: 'migrated' };
    if (result?.status === 'exists') return { status: 'exists' };
    return { status: 'error', message: `unexpected migration result: ${JSON.stringify(result)}` };
  } catch (error) {
    return { status: 'error', message: String(error) };
  }
}
