import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getUnlockedRoutes, MAX_EXPERIENCE, MAX_REPUTATION } from './progression';
import { useGameStore } from './store';
import { useStorybookLaneStore } from './storybookLaneStore';
import {
  DEFAULT_AVATAR, FIRST_HEIST_CASH, FIRST_HEIST_RB, FIRST_HEIST_XP, FULL_REDESIGN_PRICE,
  HEIST_STEPS, REPLAY_HEIST_RB, RASCAL_BUCKS_PER_GEM, STARTER_HOME_PRICE, TUTORIAL_CHAPTERS,
  type AvatarProfile, type HeistStatus,
} from './finalMaster';

export const FINAL_MASTER_STORAGE_KEY = 'daykare-final-master';

interface FinalMasterState {
  avatar: AvatarProfile;
  avatarConfirmed: boolean;
  tutorialChapter: number;
  tutorialComplete: boolean;
  heistStatus: HeistStatus;
  heistStep: number;
  firstHeistComplete: boolean;
  firstRewardChoice: 'rb' | 'home' | null;
  lastReplayDay: number | null;
  ownedStarterHome: boolean;
  homeVoucher: boolean;
  insideHome: boolean;
  gems: number;
  activeAnimation: string | null;
  companionCommand: 'follow' | 'wait' | 'goto' | 'interact' | 'regroup' | 'finale';
  saveAvatar: (avatar: AvatarProfile, paid?: boolean) => 'saved' | 'insufficient';
  completeTutorialChapter: () => boolean;
  skipTutorialForReturningPlayer: () => void;
  startHeist: () => boolean;
  advanceHeist: () => boolean;
  chooseFirstReward: (choice: 'rb' | 'home') => boolean;
  claimReplayReward: (dayNumber: number) => boolean;
  buyStarterHome: () => 'purchased' | 'owned' | 'insufficient';
  enterHome: () => boolean;
  leaveHome: () => void;
  convertRbToGem: () => boolean;
  setCompanionCommand: (command: FinalMasterState['companionCommand']) => void;
  playAnimation: (id: string | null) => void;
}

function grantCoreReward(xp: number, cash: number, reputation = 0) {
  useGameStore.setState((state) => {
    const progression = {
      ...state.progression,
      experience: Math.min(MAX_EXPERIENCE, (state.progression.experience ?? 0) + xp),
      reputation: Math.min(MAX_REPUTATION, state.progression.reputation + reputation),
    };
    return {
      juiceClubCash: Math.min(999_999, state.juiceClubCash + cash),
      progression: { ...progression, routeUnlocks: getUnlockedRoutes(progression) },
    };
  });
}

const storage = createJSONStorage(() => typeof window === 'undefined'
  ? { getItem: () => null, setItem: () => undefined, removeItem: () => undefined }
  : window.localStorage);

export const useFinalMasterStore = create<FinalMasterState>()(persist((set, get) => ({
  avatar: DEFAULT_AVATAR,
  avatarConfirmed: false,
  tutorialChapter: 0,
  tutorialComplete: false,
  heistStatus: 'available',
  heistStep: 0,
  firstHeistComplete: false,
  firstRewardChoice: null,
  lastReplayDay: null,
  ownedStarterHome: false,
  homeVoucher: false,
  insideHome: false,
  gems: 0,
  activeAnimation: null,
  companionCommand: 'follow',
  saveAvatar: (avatar, paid = false) => {
    if (paid) {
      const rb = useStorybookLaneStore.getState().ribbonBucks;
      if (rb < FULL_REDESIGN_PRICE) return 'insufficient';
      useStorybookLaneStore.setState({ ribbonBucks: rb - FULL_REDESIGN_PRICE });
    }
    set({ avatar: { ...avatar, name: avatar.name.trim().slice(0, 20) || 'New Kid' }, avatarConfirmed: true });
    return 'saved';
  },
  completeTutorialChapter: () => {
    const index = get().tutorialChapter;
    const chapter = TUTORIAL_CHAPTERS[index];
    if (!chapter) return false;
    grantCoreReward(chapter.xp, 'cash' in chapter ? chapter.cash : 0, 'reputation' in chapter ? chapter.reputation : 0);
    const next = index + 1;
    set({ tutorialChapter: next, tutorialComplete: next >= TUTORIAL_CHAPTERS.length, activeAnimation: null });
    return true;
  },
  skipTutorialForReturningPlayer: () => set({ avatarConfirmed: true, tutorialChapter: TUTORIAL_CHAPTERS.length, tutorialComplete: true }),
  startHeist: () => {
    const state = get();
    const dayNumber = useGameStore.getState().dayNumber;
    if (!state.tutorialComplete || state.heistStatus === 'active' || state.heistStatus === 'reward-choice' || (state.firstHeistComplete && state.lastReplayDay === dayNumber)) return false;
    set({ heistStatus: 'active', heistStep: 0, companionCommand: 'follow', activeAnimation: 'anim_miss_leslie_board_intro' });
    return true;
  },
  advanceHeist: () => {
    const state = get();
    if (state.heistStatus !== 'active') return false;
    const next = state.heistStep + 1;
    if (next >= HEIST_STEPS.length) {
      if (!state.firstHeistComplete) {
        grantCoreReward(FIRST_HEIST_XP, FIRST_HEIST_CASH);
        set({ heistStatus: 'reward-choice', heistStep: HEIST_STEPS.length, companionCommand: 'finale' });
      } else {
        const dayNumber = useGameStore.getState().dayNumber;
        if (state.lastReplayDay !== dayNumber) {
          useStorybookLaneStore.getState().grantRibbonBucks(REPLAY_HEIST_RB);
          grantCoreReward(FIRST_HEIST_XP, FIRST_HEIST_CASH);
        }
        set({ heistStatus: 'complete', heistStep: HEIST_STEPS.length, companionCommand: 'finale', lastReplayDay: dayNumber });
      }
    } else set({ heistStep: next, companionCommand: next === 2 ? 'wait' : next === 3 ? 'goto' : next === 4 ? 'interact' : next === 5 ? 'regroup' : 'follow' });
    return true;
  },
  chooseFirstReward: (choice) => {
    const state = get();
    if (state.heistStatus !== 'reward-choice' || state.firstRewardChoice) return false;
    if (choice === 'rb') useStorybookLaneStore.getState().grantRibbonBucks(FIRST_HEIST_RB);
    set({ firstRewardChoice: choice, firstHeistComplete: true, heistStatus: 'complete', homeVoucher: choice === 'home' });
    return true;
  },
  claimReplayReward: (dayNumber) => {
    const state = get();
    if (!state.firstHeistComplete || state.lastReplayDay === dayNumber) return false;
    set({ heistStatus: 'active', heistStep: 0, companionCommand: 'follow', activeAnimation: 'anim_miss_leslie_board_intro' });
    return true;
  },
  buyStarterHome: () => {
    const state = get();
    if (state.ownedStarterHome) return 'owned';
    const rb = useStorybookLaneStore.getState().ribbonBucks;
    if (!state.homeVoucher && rb < STARTER_HOME_PRICE) return 'insufficient';
    if (!state.homeVoucher) useStorybookLaneStore.setState({ ribbonBucks: rb - STARTER_HOME_PRICE });
    set({ ownedStarterHome: true, homeVoucher: false });
    return 'purchased';
  },
  enterHome: () => {
    if (!get().ownedStarterHome) return false;
    set({ insideHome: true });
    return true;
  },
  leaveHome: () => set({ insideHome: false }),
  convertRbToGem: () => {
    const rb = useStorybookLaneStore.getState().ribbonBucks;
    if (rb < RASCAL_BUCKS_PER_GEM) return false;
    useStorybookLaneStore.setState({ ribbonBucks: rb - RASCAL_BUCKS_PER_GEM });
    set((state) => ({ gems: state.gems + 1 }));
    return true;
  },
  setCompanionCommand: (companionCommand) => set({ companionCommand }),
  playAnimation: (activeAnimation) => set({ activeAnimation }),
}), {
  name: FINAL_MASTER_STORAGE_KEY,
  storage,
  partialize: (state) => ({
    avatar: state.avatar, avatarConfirmed: state.avatarConfirmed, tutorialChapter: state.tutorialChapter,
    tutorialComplete: state.tutorialComplete, heistStatus: state.heistStatus, heistStep: state.heistStep,
    firstHeistComplete: state.firstHeistComplete, firstRewardChoice: state.firstRewardChoice,
    lastReplayDay: state.lastReplayDay, ownedStarterHome: state.ownedStarterHome, homeVoucher: state.homeVoucher,
    gems: state.gems,
  }),
}));

export function deleteDayKareSave() {
  if (typeof window === 'undefined') return;
  ['daykare-save', 'daykare-final-master', 'daykare-storybook-lane', 'daykare-monetization'].forEach((key) => window.localStorage.removeItem(key));
  window.sessionStorage.clear();
  window.location.reload();
}
