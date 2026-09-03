export const STORYBOOK_OPEN_MINUTE = 17 * 60 + 30;
// Stony Brook stays open until 7:30 PM. The evening is the social half of
// the day - shops, the lane, the owned home - and one game hour was not
// enough to do more than one errand in it.
export const STORYBOOK_CLOSE_MINUTE = 19 * 60 + 30;
export const STORYBOOK_WARNING_MINUTE = 19 * 60 + 25;
/**
 * How long the end-of-day card sits on screen after closing time before the
 * day actually rolls over, in real seconds. Long enough to read, short
 * enough not to feel like a hang.
 */
export const STORYBOOK_CLOSE_HOLD_SECONDS = 15;

export const STORYBOOK_PRICES = {
  iceCream: 25,
  tricycle: 2_500,
  dog: 5_000,
  crib: 10_000,
  miniRideOn: 15_000,
  cribTier1: 2_500,
  cribTier2: 5_000,
  cribTier3: 10_000,
} as const;

export const ICE_CREAM_SICK_THRESHOLD = 8;
export const ICE_CREAM_RECOVERY_SECONDS = 60;
// Existing saves keep their balance; new players earn Rascal Bucks through the
// Miss Leslie heist instead of receiving an unexplained starter grant.
export const STORYBOOK_STARTER_RB = 0;

export const STORYBOOK_ITEM_IDS = ['tricycle', 'dog', 'crib', 'mini-ride-on'] as const;
export type StorybookItemId = typeof STORYBOOK_ITEM_IDS[number];

export const STORYBOOK_FLAVORS = [
  'Bubblegum Blast',
  'Cookie Comet',
  'Strawberry Swirl',
  'Blue Moon',
  'Birthday Cake',
  'Chocolate Mountain',
] as const;

export function storybookIsOpen(minute: number) {
  return minute >= STORYBOOK_OPEN_MINUTE && minute < STORYBOOK_CLOSE_MINUTE;
}

export function storybookItemPrice(item: StorybookItemId) {
  return STORYBOOK_PRICES[item === 'mini-ride-on' ? 'miniRideOn' : item];
}
