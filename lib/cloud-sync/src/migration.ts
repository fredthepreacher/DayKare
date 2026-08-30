import { payloadHash } from './hash';
import type { SaveScope } from './types';

/**
 * Local -> cloud migration, as a pure state machine.
 *
 * Kept free of Supabase and of the DOM so the ordering guarantees below can be
 * tested deterministically, without a network or a browser. The adapter layer
 * supplies the effects.
 *
 * The ordering is the point:
 *   validate -> back up -> upload -> VERIFY -> mark migrated -> keep local
 *
 * The local save is never deleted. Not after upload, not after verification.
 * Deleting the player's only other copy the moment we believe we succeeded is
 * exactly how save-loss incidents happen.
 */

export type MigrationStep =
  | 'idle'
  | 'authenticating'
  | 'detecting'
  | 'validating'
  | 'uploading'
  | 'verifying'
  | 'complete'
  | 'conflict'
  | 'failed';

export interface MigrationState {
  step: MigrationStep;
  scope: SaveScope;
  /** Stable across retries - this is what makes the upload idempotent. */
  token: string;
  error: string | null;
  /** Set only once the cloud copy has been read back and matched. */
  verified: boolean;
  /** Always true once started: we do not delete local saves. */
  localRetained: boolean;
}

export interface LocalSaveCandidate {
  scope: SaveScope;
  saveVersion: number;
  payload: unknown;
  rep: number;
  dayNumber: number;
}

export const MIGRATED_FLAG_KEY = (scope: SaveScope) => `daykare-cloud-migrated-${scope}`;
export const MIGRATION_TOKEN_KEY = (scope: SaveScope) => `daykare-cloud-migration-token-${scope}`;

export function createMigrationState(scope: SaveScope, token: string): MigrationState {
  return { step: 'idle', scope, token, error: null, verified: false, localRetained: true };
}

/**
 * Validates a candidate before anything is uploaded.
 *
 * `normalize` is the game's OWN existing normalizer. We do not reimplement
 * validation here - the whole point is that one validator governs both the
 * local and the cloud path.
 */
export function validateCandidate(
  candidate: LocalSaveCandidate,
  normalize: (payload: unknown) => unknown,
): { ok: true; payload: unknown; hash: string } | { ok: false; reason: string } {
  if (!candidate.payload || typeof candidate.payload !== 'object') {
    return { ok: false, reason: 'local save is empty or not an object' };
  }
  if (!Number.isInteger(candidate.saveVersion) || candidate.saveVersion < 0) {
    return { ok: false, reason: `implausible save version ${candidate.saveVersion}` };
  }
  let normalized: unknown;
  try {
    normalized = normalize(candidate.payload);
  } catch (error) {
    return { ok: false, reason: `normalizer rejected the save: ${String(error)}` };
  }
  if (!normalized || typeof normalized !== 'object') {
    return { ok: false, reason: 'normalizer produced an empty save' };
  }
  return { ok: true, payload: normalized, hash: payloadHash(normalized) };
}

/** Verification compares what we sent with what came back. */
export function verifyUpload(sentHash: string, cloudPayload: unknown): boolean {
  return payloadHash(cloudPayload) === sentHash;
}

export function advance(state: MigrationState, step: MigrationStep, error?: string): MigrationState {
  return {
    ...state,
    step,
    error: error ?? (step === 'failed' ? state.error : null),
    verified: step === 'complete' ? true : state.verified,
    localRetained: true,
  };
}
