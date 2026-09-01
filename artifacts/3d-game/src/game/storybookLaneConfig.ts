export const STORYBOOK_OPEN_MINUTE = 17 * 60 + 30;
export const STORYBOOK_CLOSE_MINUTE = 18 * 60 + 30;
export const STORYBOOK_WARNING_MINUTE = 18 * 60 + 25;

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
export const STORYBOOK_STARTER_RB = 2_500;

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
