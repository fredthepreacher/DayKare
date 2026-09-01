import { useMemo } from 'react';
import { useGameStore } from './store';
import { equippedAppearance } from './drip';

/**
 * The colours the player's equipped Drip should tint the character with.
 *
 * Split out of Player so the same appearance can later drive the Online lobby
 * preview and the wardrobe without three copies of the lookup, and memoised on
 * the equipped map so a cosmetic change costs one object build rather than one
 * per frame.
 */
export function useEquippedAppearance() {
  const dripEquipped = useGameStore((state) => state.dripEquipped);
  return useMemo(() => equippedAppearance(dripEquipped), [dripEquipped]);
}
