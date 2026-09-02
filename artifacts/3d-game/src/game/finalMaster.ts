export const RASCAL_BUCKS_PER_GEM = 10_000;
export const STARTER_HOME_PRICE = 25_000;
export const FULL_REDESIGN_PRICE = 10_000;
export const FIRST_HEIST_CASH = 1_000;
export const FIRST_HEIST_XP = 250;
export const FIRST_HEIST_RB = 14_000;
export const REPLAY_HEIST_RB = 5_000;

export const TUTORIAL_CHAPTERS = [
  { id: 'welcome', title: 'Welcome to DayKare', objective: 'Move around and learn the HUD.', xp: 25, steps: [{ id: 'move-5m', label: 'Walk at least 5 meters' }] },
  { id: 'tour', title: 'Backpack Tour', objective: 'Explore a real station and open your Backpack.', xp: 35, steps: [{ id: 'visit-art-table', label: 'Visit the Art Table' }, { id: 'open-backpack', label: 'Open the Backpack / Journal' }] },
  { id: 'art', title: 'Make Some Art', objective: 'Complete the real art-table pattern.', xp: 40, steps: [{ id: 'complete-art', label: 'Finish the Art pattern' }] },
  { id: 'garden', title: 'Three Little Seeds', objective: 'Plant a real three-seed Garden crop.', xp: 50, steps: [{ id: 'plant-three-seeds', label: 'Plant all 3 seeds' }] },
  { id: 'snack', title: 'Snack & Money', objective: 'Complete a valid snack or Juice Club transaction.', xp: 60, cash: 25, steps: [{ id: 'complete-snack-sale', label: 'Complete a snack or sale' }] },
  { id: 'lost-found', title: 'Lost, Found & Fished', objective: 'Complete a full Lost & Found return and visit the Fishing Shop.', xp: 75, steps: [{ id: 'lost-found-accepted', label: 'Accept a Lost & Found job' }, { id: 'lost-found-found', label: 'Find the missing item' }, { id: 'lost-found-returned', label: 'Return the item' }, { id: 'fishing-shop-visited', label: 'Visit the Fishing Shop' }] },
  { id: 'reputation', title: 'Friends & Reputation', objective: 'Meet Mia, Noah, and Miss Leslie in the world.', xp: 100, reputation: 5, steps: [{ id: 'talk-mia', label: 'Talk to Mia' }, { id: 'talk-noah', label: 'Talk to Noah' }, { id: 'talk-miss-leslie', label: 'Meet Miss Leslie at the Heist Board' }] },
] as const;

export type TutorialChapterId = typeof TUTORIAL_CHAPTERS[number]['id'];
export type TutorialEvent = typeof TUTORIAL_CHAPTERS[number]['steps'][number]['id'];

export const HEIST_STEPS = [
  { id: 'briefing', title: 'The Sticker Parade', objective: 'Talk to Miss Leslie beside the Heist Board.', events: ['miss-leslie-intro'] },
  { id: 'scope', title: 'Scope the route', objective: 'Inspect the classroom window, hall corner, and playground gate.', events: ['scope-window', 'scope-hall', 'scope-gate'] },
  { id: 'access', title: 'Set up access', objective: 'Reach Mia and ask her to hold the art-room shortcut.', events: ['mia-door'] },
  { id: 'distraction', title: 'Create a distraction', objective: 'Reach Noah and start the toy-box commotion.', events: ['noah-distraction'] },
  { id: 'equipment', title: 'Prepare the shortcut', objective: 'Collect the grabber tool beside the storage shelves.', events: ['grabber-collected'] },
  { id: 'finale', title: 'Parade finale', objective: 'Physically regroup with Mia and Noah at the Heist Board.', events: ['finale-regroup'] },
] as const;

export type HeistStepId = typeof HEIST_STEPS[number]['id'];
export type HeistEvent = typeof HEIST_STEPS[number]['events'][number];
export type HeistStatus = 'available' | 'active' | 'reward-choice' | 'complete';
export type BodyBuild = 'slim' | 'average' | 'broad' | 'chubby';
export type EyeShape = 'round' | 'soft' | 'wide';
export type EarShape = 'small' | 'round' | 'wide';
export type AvatarHair = 'bob' | 'curls' | 'ponytail' | 'pigtails' | 'cap' | 'sprout';

export interface AvatarProfile {
  name: string;
  skinColor: string;
  eyeColor: string;
  eyeShape: EyeShape;
  earShape: EarShape;
  hairStyle: AvatarHair;
  hairColor: string;
  bodyBuild: BodyBuild;
  height: number;
  topColor: string;
  bottomColor: string;
}

export const DEFAULT_AVATAR: AvatarProfile = {
  name: 'New Kid', skinColor: '#c98562', eyeColor: '#302331', eyeShape: 'round', earShape: 'round',
  hairStyle: 'curls', hairColor: '#3f2927', bodyBuild: 'average', height: 1,
  topColor: '#e76f51', bottomColor: '#4a5672',
};

export const ANIMATION_CLIPS = [
  ['anim_arrival_intro', 'Arrival intro', 18], ['anim_art_table_loop', 'Art table', 14],
  ['anim_show_and_tell_present', 'Show & tell', 16], ['anim_snack_service', 'Snack service', 12],
  ['anim_garden_harvest', 'Garden harvest', 13], ['anim_fishing_reel_in', 'Fishing reel-in', 15],
  ['anim_lost_found_return', 'Lost & Found return', 12], ['anim_recess_play', 'Recess play', 20],
  ['anim_storybook_social', 'Storybook social', 22], ['anim_miss_leslie_board_intro', 'Miss Leslie intro', 20],
] as const;

export function tutorialXpTotal() {
  return TUTORIAL_CHAPTERS.reduce((sum, chapter) => sum + chapter.xp, 0);
}

export function canClaimDailyReplay(lastDay: number | null, dayNumber: number) {
  return lastDay !== dayNumber;
}

export function rbToGems(balance: number) {
  const gems = Math.floor(Math.max(0, balance) / RASCAL_BUCKS_PER_GEM);
  return { gems, remainder: Math.max(0, balance) - gems * RASCAL_BUCKS_PER_GEM };
}
