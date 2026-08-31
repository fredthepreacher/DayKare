/**
 * Player-readable descriptions of a save, for the conflict chooser.
 *
 * The chooser used to offer "Day 7, 100 REP" against "Day 7, 100 REP" - two
 * lines that were identical while the saves behind them differed by a full
 * Juice Club float and a restock. The player was asked to choose and given
 * nothing to choose on. These functions exist so the question carries the
 * evidence needed to answer it.
 *
 * Three rules:
 *
 *  - A missing field is OMITTED, never rendered as 0. "Juice $0" and "no Juice
 *    Club data in this save" look identical on screen and mean opposite
 *    things, and the second one must not be able to talk the player out of a
 *    save that actually has money in it.
 *  - Each scope describes itself. Story facts are meaningless for an Online
 *    save, and online_saves carries a `rep` column that defaults to 0 - so
 *    reading REP for Online would invent a fact rather than report one.
 *  - Nothing here ranks or scores. It describes. The choice stays the
 *    player's, and no field is weighted to nudge them.
 */

const asInt = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null;

const asCount = (value: unknown): number | null =>
  Array.isArray(value) ? value.length : null;

const obj = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export interface SaveFact {
  label: string;
  value: string;
}

const push = (facts: SaveFact[], label: string, value: number | null, format?: (n: number) => string) => {
  // `null` means the save does not carry this field. Zero means it does, and
  // the value is zero - a real and often decisive difference.
  if (value === null) return;
  facts.push({ label, value: format ? format(value) : String(value) });
};

/** A Story save, in the terms the player sees while playing it. */
export function describeStorySave(payload: unknown): SaveFact[] {
  const state = obj(payload);
  if (!state) return [];
  const facts: SaveFact[] = [];
  const progression = obj(state.progression);
  const rivalStory = obj(state.rivalStory);

  push(facts, 'Day', asInt(state.dayNumber));
  push(facts, 'REP', asInt(progression?.reputation));
  push(facts, 'Chapter', asInt(rivalStory?.chapter));
  push(facts, 'Star Tokens', asInt(progression?.tokens));
  push(facts, 'Juice Club cash', asInt(state.juiceClubCash), (n) => `$${n}`);
  push(facts, 'Juice stock', asInt(state.juiceStock));
  push(facts, 'Cracker stock', asInt(state.crackerStock));
  push(facts, 'Items', asCount(state.inventory));
  push(facts, 'Collectibles', asCount(state.collectibles));

  return facts;
}

const VISIBILITY_LABELS: Record<string, string> = {
  public: 'Public discovery',
  friends: 'Friends only',
  invite: 'Invite code',
};

/**
 * An Online save. Deliberately NOT Day and REP: Online has no day, and its
 * table's `rep` column defaults to 0, so reporting it would be inventing a
 * fact rather than describing one.
 */
export function describeOnlineSave(payload: unknown): SaveFact[] {
  const state = obj(payload);
  if (!state) return [];
  const facts: SaveFact[] = [];
  const appearance = obj(state.appearance);

  if (typeof state.visibility === 'string') {
    facts.push({ label: 'Who can join', value: VISIBILITY_LABELS[state.visibility] ?? state.visibility });
  }
  // The stored indexes are 0-based; players count outfits from one.
  push(facts, 'Outfit', asInt(appearance?.outfitIndex ?? state.selectedOutfit), (n) => `#${n + 1}`);
  push(facts, 'Accessory', asInt(appearance?.accessoryIndex ?? state.selectedAccessory), (n) => `#${n + 1}`);
  if (typeof state.inviteCode === 'string' && state.inviteCode.length > 0) {
    facts.push({ label: 'Invite code', value: state.inviteCode });
  }

  return facts;
}

export function describeSave(scope: 'story' | 'online', payload: unknown): SaveFact[] {
  return scope === 'online' ? describeOnlineSave(payload) : describeStorySave(payload);
}

/**
 * "3 hours ago". Only ever called with a timestamp we actually have - a save
 * with no recorded time shows no time rather than a guessed one.
 */
export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const seconds = Math.round((now - timestamp) / 1000);
  if (!Number.isFinite(seconds)) return '';
  if (seconds < 0) return 'just now';
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
