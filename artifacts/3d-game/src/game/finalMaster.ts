export const RASCAL_BUCKS_PER_GEM = 10_000;
export const STARTER_HOME_PRICE = 25_000;
export const FULL_REDESIGN_PRICE = 10_000;
export const FIRST_HEIST_CASH = 1_000;
export const FIRST_HEIST_XP = 250;
export const FIRST_HEIST_RB = 14_000;
export const REPLAY_HEIST_RB = 5_000;

export const TUTORIAL_CHAPTERS = [
  { id: 'welcome', title: 'Welcome to DayKare', objective: 'Move around, check the HUD, and meet your room.', xp: 25 },
  { id: 'tour', title: 'Backpack Tour', objective: 'Visit the classroom stations and open your backpack.', xp: 35 },
  { id: 'art', title: 'Make Some Art', objective: 'Complete one art-table creation.', xp: 40 },
  { id: 'garden', title: 'Three Little Seeds', objective: 'Plant three tutorial seeds in the Garden.', xp: 50 },
  { id: 'snack', title: 'Snack & Money', objective: 'Have a snack and learn how cash works.', xp: 60, cash: 25 },
  { id: 'lost-found', title: 'Lost, Found & Fished', objective: 'Return a lost item and visit the fishing shop.', xp: 75 },
  { id: 'reputation', title: 'Friends & Reputation', objective: 'Meet Mia and Noah, then find Miss Leslie.', xp: 100, reputation: 5 },
] as const;

export type TutorialChapterId = typeof TUTORIAL_CHAPTERS[number]['id'];

export const HEIST_STEPS = [
  { id: 'briefing', title: 'The Sticker Parade', objective: 'Talk to Miss Leslie beside the Heist Board.' },
  { id: 'scope', title: 'Scope the route', objective: 'Inspect the classroom window, hall corner, and playground gate.' },
  { id: 'access', title: 'Set up access', objective: 'Ask Mia to hold the art-room shortcut.' },
  { id: 'distraction', title: 'Create a distraction', objective: 'Send Noah to start the toy-box commotion.' },
  { id: 'equipment', title: 'Prepare the shortcut', objective: 'Collect the grabber tool beside the storage shelves.' },
  { id: 'finale', title: 'Parade finale', objective: 'Regroup with Mia and Noah at the Heist Board.' },
] as const;

export type HeistStepId = typeof HEIST_STEPS[number]['id'];
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
