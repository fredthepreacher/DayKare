import type { CloudSaveRow, SaveScope, SyncMeta } from './types';

/**
 * Conflict handling for DayKare cloud saves.
 *
 * The rule, decided deliberately: PROTECT PROGRESS OVER RESOLVING CONFLICTS.
 * We never merge two saves field by field. Merging produces states the game
 * logic never intended - a quest complete but its item missing, a business
 * owned but never bought - and those are worse than an honest question.
 */

export type ConflictChoice = 'keep-local' | 'keep-cloud';

export interface SaveSummary {
  scope: SaveScope;
  saveVersion: number;
  revision: number;
  updatedAt: number | null;
  /** Story only; undefined for Online. */
  dayNumber?: number;
  rep?: number;
  deviceLabel?: string | null;
}

export interface ConflictReport {
  scope: SaveScope;
  local: SaveSummary;
  cloud: SaveSummary;
  /** Which side we suggest, and why - the player still decides. */
  suggested: ConflictChoice;
  reason: string;
}

/**
 * Decides whether a write may proceed.
 *
 * `expectedRevision` is what this client last saw. If the row has moved on,
 * the write is refused here rather than clobbering another device's progress.
 */
export function canWrite(meta: SyncMeta, serverRevision: number): boolean {
  return meta.revision === serverRevision;
}

/**
 * Suggests a side when local and cloud have diverged.
 *
 * Ordering, most to least trustworthy:
 *   1. a newer save version wins - it has been through migrations the other has not
 *   2. more progress wins (day number, then REP)
 *   3. more recently updated wins
 *
 * Nothing here is automatic. This only chooses which button is highlighted.
 */
export function suggestResolution(local: SaveSummary, cloud: SaveSummary): { choice: ConflictChoice; reason: string } {
  if (local.saveVersion !== cloud.saveVersion) {
    return local.saveVersion > cloud.saveVersion
      ? { choice: 'keep-local', reason: 'This device has a newer save format.' }
      : { choice: 'keep-cloud', reason: 'The cloud save has a newer save format.' };
  }

  const localDay = local.dayNumber ?? 0;
  const cloudDay = cloud.dayNumber ?? 0;
  if (localDay !== cloudDay) {
    return localDay > cloudDay
      ? { choice: 'keep-local', reason: `This device is further along (day ${localDay} vs ${cloudDay}).` }
      : { choice: 'keep-cloud', reason: `The cloud save is further along (day ${cloudDay} vs ${localDay}).` };
  }

  const localRep = local.rep ?? 0;
  const cloudRep = cloud.rep ?? 0;
  if (localRep !== cloudRep) {
    return localRep > cloudRep
      ? { choice: 'keep-local', reason: `This device has more REP (${localRep} vs ${cloudRep}).` }
      : { choice: 'keep-cloud', reason: `The cloud save has more REP (${cloudRep} vs ${localRep}).` };
  }

  const localAt = local.updatedAt ?? 0;
  const cloudAt = cloud.updatedAt ?? 0;
  return localAt >= cloudAt
    ? { choice: 'keep-local', reason: 'This device was played most recently.' }
    : { choice: 'keep-cloud', reason: 'The cloud save was played most recently.' };
}

export function buildConflictReport(
  scope: SaveScope,
  local: SaveSummary,
  cloudRow: CloudSaveRow,
): ConflictReport {
  const cloud: SaveSummary = {
    scope,
    saveVersion: cloudRow.save_version,
    revision: cloudRow.revision,
    updatedAt: Date.parse(cloudRow.updated_at) || null,
    dayNumber: cloudRow.day_number,
    rep: cloudRow.rep,
    deviceLabel: cloudRow.device_label,
  };
  const { choice, reason } = suggestResolution(local, cloud);
  return { scope, local, cloud, suggested: choice, reason };
}
