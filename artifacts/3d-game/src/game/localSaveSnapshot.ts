/**
 * What was actually on disk when the tab opened.
 *
 * The Phase 3 preview QA found that cloud restore never fired. The reason was
 * a conflation this module exists to end: by the time cloud sync starts,
 * `localStorage['daykare-save']` ALWAYS exists, because Zustand's `persist`
 * middleware rehydrates and the running game writes a default save back long
 * before the first cloud read. So "is there a local save?" answered `true`
 * even for a player who had just cleared their browser data - and two saves
 * that both "exist" is a conflict, not a restore. The player was asked to
 * choose between a save they had never played and their real progress.
 *
 * A default written one second ago and a save played for a week are identical
 * in shape, so no amount of inspecting the contents can tell them apart. The
 * only thing that distinguishes them is WHEN the key appeared. So we look
 * once, before anything can write, and remember the answer.
 *
 * This module must have no imports. Importing a store here would evaluate
 * that store - and its persist middleware - before the snapshot is taken,
 * which is precisely the bug. It is imported first in main.tsx for the same
 * reason.
 */

export const SAVE_KEYS = {
  story: 'daykare-save',
  online: 'daykare-online-preview',
} as const;

export type SnapshotScope = keyof typeof SAVE_KEYS;

export interface BootSave {
  /**
   * The key was present in localStorage before the app wrote anything.
   *
   * `true` here is the ONLY evidence that a save is genuinely the player's
   * rather than a default the app just created.
   */
  existed: boolean;
  /** The raw string, kept verbatim so nothing is lost to a parse we got wrong. */
  raw: string | null;
  /** Parsed, or null when absent or malformed. `existed` stays true either way. */
  parsed: unknown;
  /** The inner persisted state, unwrapped from Zustand's { state, version }. */
  payload: unknown;
}

const empty = (): BootSave => ({ existed: false, raw: null, parsed: null, payload: null });

const readOne = (key: string): BootSave => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return empty();
    const raw = window.localStorage.getItem(key);
    if (raw === null) return empty();
    // The key was there. That is the fact that matters, and it stays true
    // even if the contents turn out to be unreadable - a save we cannot parse
    // is a save we must not silently replace with a cloud copy.
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    const payload = parsed && typeof parsed === 'object' && 'state' in (parsed as Record<string, unknown>)
      ? (parsed as { state?: unknown }).state ?? null
      : parsed;
    return { existed: true, raw, parsed, payload };
  } catch {
    // Storage can throw outright (private mode, blocked site data). We cannot
    // prove a save existed, so we do not claim one did.
    return empty();
  }
};

let snapshot: Record<SnapshotScope, BootSave> | null = null;

/**
 * Takes the snapshot. Idempotent: the first call wins, so a stray later call
 * cannot overwrite the boot truth with a post-hydration reading.
 */
export function captureBootSnapshot(): void {
  if (snapshot) return;
  snapshot = { story: readOne(SAVE_KEYS.story), online: readOne(SAVE_KEYS.online) };
}

export function bootSave(scope: SnapshotScope): BootSave {
  if (!snapshot) captureBootSnapshot();
  return snapshot![scope];
}

/**
 * Did a real, player-owned save exist for this scope when the tab opened?
 *
 * This is the input the sync decision needs. It is deliberately NOT "is there
 * something in the store right now" - there always is.
 */
export function hadPersistedSaveAtBoot(scope: SnapshotScope): boolean {
  return bootSave(scope).existed;
}

/** Test seam. */
export function resetBootSnapshotForTests(): void {
  snapshot = null;
}

// Taken at module evaluation as well as from main.tsx, so the snapshot is
// correct even if some other entry point imports this module first.
captureBootSnapshot();
