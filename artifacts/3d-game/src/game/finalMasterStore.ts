import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { addLifetimeXp, getUnlockedRoutes, MAX_REPUTATION } from './progression';
import { useGameStore } from './store';
import { useStorybookLaneStore } from './storybookLaneStore';
import {
  DEFAULT_AVATAR, FIRST_HEIST_CASH, FIRST_HEIST_RB, FIRST_HEIST_XP, FULL_REDESIGN_PRICE,
  HEIST_STEPS, REPLAY_HEIST_RB, RASCAL_BUCKS_PER_GEM, STARTER_HOME_PRICE, TUTORIAL_CHAPTERS,
  type AvatarProfile, type HeistEvent, type HeistStatus, type TutorialEvent,
} from './finalMaster';
import { useToastStore } from './toastStore';

export const FINAL_MASTER_STORAGE_KEY = 'daykare-final-master';

interface FinalMasterState {
  avatar: AvatarProfile;
  avatarConfirmed: boolean;
  tutorialStarted: boolean;
  tutorialChapter: number;
  tutorialCompletedSteps: string[];
  tutorialRewardedChapters: string[];
  tutorialMovementDistance: number;
  tutorialComplete: boolean;
  heistStatus: HeistStatus;
  heistStep: number;
  heistCompletedEvents: string[];
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
  startTutorial: () => void;
  recordTutorialEvent: (event: TutorialEvent) => boolean;
  recordTutorialMovement: (distance: number) => void;
  skipTutorialForReturningPlayer: () => void;
  startHeist: () => boolean;
  recordHeistEvent: (event: HeistEvent) => boolean;
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
    const xpResult = addLifetimeXp(state.progression.experience, xp);
    const progression = {
      ...state.progression,
      experience: xpResult.experience,
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
  tutorialStarted: false,
  tutorialChapter: 0,
  tutorialCompletedSteps: [],
  tutorialRewardedChapters: [],
  tutorialMovementDistance: 0,
  tutorialComplete: false,
  heistStatus: 'available',
  heistStep: 0,
  heistCompletedEvents: [],
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
  startTutorial: () => set({ tutorialStarted: true }),
  recordTutorialEvent: (event) => {
    const state = get();
    const chapter = TUTORIAL_CHAPTERS[state.tutorialChapter];
    if (!state.tutorialStarted || !chapter || state.tutorialCompletedSteps.includes(event)) return false;
    if (!chapter.steps.some((step) => step.id === event)) return false;
    const completed = [...state.tutorialCompletedSteps, event];
    const chapterDone = chapter.steps.every((step) => completed.includes(step.id));
    if (!chapterDone) { set({ tutorialCompletedSteps: completed }); return true; }
    const alreadyRewarded = state.tutorialRewardedChapters.includes(chapter.id);
    if (!alreadyRewarded) {
      grantCoreReward(chapter.xp, 'cash' in chapter ? chapter.cash : 0, 'reputation' in chapter ? chapter.reputation : 0);
      useToastStore.getState().enqueue({ title: `${chapter.title} complete!`, detail: `+${chapter.xp} XP`, kind: 'success' });
    }
    const next = state.tutorialChapter + 1;
    set({ tutorialChapter: next, tutorialCompletedSteps: [], tutorialMovementDistance: 0, tutorialStarted: next < TUTORIAL_CHAPTERS.length, tutorialComplete: next >= TUTORIAL_CHAPTERS.length, tutorialRewardedChapters: alreadyRewarded ? state.tutorialRewardedChapters : [...state.tutorialRewardedChapters, chapter.id], activeAnimation: null });
    return true;
  },
  recordTutorialMovement: (distance) => {
    const state = get();
    if (!state.tutorialStarted || TUTORIAL_CHAPTERS[state.tutorialChapter]?.id !== 'welcome' || !Number.isFinite(distance) || distance <= 0) return;
    const total = state.tutorialMovementDistance + Math.min(distance, 2);
    set({ tutorialMovementDistance: total });
    if (total >= 5) get().recordTutorialEvent('move-5m');
  },
  skipTutorialForReturningPlayer: () => set({ avatarConfirmed: true, tutorialStarted: false, tutorialChapter: TUTORIAL_CHAPTERS.length, tutorialCompletedSteps: [], tutorialRewardedChapters: TUTORIAL_CHAPTERS.map((chapter) => chapter.id), tutorialComplete: true }),
  startHeist: () => {
    const state = get();
    const dayNumber = useGameStore.getState().dayNumber;
    if (!state.tutorialComplete || state.heistStatus === 'active' || state.heistStatus === 'reward-choice' || (state.firstHeistComplete && state.lastReplayDay === dayNumber)) return false;
    set({ heistStatus: 'active', heistStep: 0, heistCompletedEvents: [], companionCommand: 'follow', activeAnimation: 'anim_miss_leslie_board_intro' });
    return true;
  },
  recordHeistEvent: (event) => {
    const state = get();
    if (state.heistStatus !== 'active') return false;
    const step = HEIST_STEPS[state.heistStep];
    if (!step || !step.events.includes(event as never) || state.heistCompletedEvents.includes(event)) return false;
    const completed = [...state.heistCompletedEvents, event];
    if (!step.events.every((required) => completed.includes(required))) { set({ heistCompletedEvents: completed }); return true; }
    const next = state.heistStep + 1;
    if (next >= HEIST_STEPS.length) {
      if (!state.firstHeistComplete) {
        grantCoreReward(FIRST_HEIST_XP, FIRST_HEIST_CASH);
        set({ heistStatus: 'reward-choice', heistStep: HEIST_STEPS.length, heistCompletedEvents: completed, companionCommand: 'finale' });
      } else {
        const dayNumber = useGameStore.getState().dayNumber;
        if (state.lastReplayDay !== dayNumber) {
          useStorybookLaneStore.getState().grantRibbonBucks(REPLAY_HEIST_RB);
          grantCoreReward(FIRST_HEIST_XP, FIRST_HEIST_CASH);
        }
        set({ heistStatus: 'complete', heistStep: HEIST_STEPS.length, heistCompletedEvents: completed, companionCommand: 'finale', lastReplayDay: dayNumber });
      }
    } else set({ heistStep: next, heistCompletedEvents: completed, companionCommand: next === 2 ? 'wait' : next === 3 ? 'goto' : next === 4 ? 'interact' : next === 5 ? 'regroup' : 'follow' });
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
    set({ heistStatus: 'active', heistStep: 0, heistCompletedEvents: [], companionCommand: 'follow', activeAnimation: 'anim_miss_leslie_board_intro' });
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
    avatar: state.avatar, avatarConfirmed: state.avatarConfirmed, tutorialStarted: state.tutorialStarted, tutorialChapter: state.tutorialChapter,
    tutorialCompletedSteps: state.tutorialCompletedSteps, tutorialRewardedChapters: state.tutorialRewardedChapters, tutorialMovementDistance: state.tutorialMovementDistance,
    tutorialComplete: state.tutorialComplete, heistStatus: state.heistStatus, heistStep: state.heistStep, heistCompletedEvents: state.heistCompletedEvents,
    firstHeistComplete: state.firstHeistComplete, firstRewardChoice: state.firstRewardChoice,
    lastReplayDay: state.lastReplayDay, ownedStarterHome: state.ownedStarterHome, homeVoucher: state.homeVoucher,
    gems: state.gems,
  }),
  merge: (persisted, current) => {
    const saved = (persisted && typeof persisted === 'object' ? persisted : {}) as Partial<FinalMasterState>;
    const chapter = Math.max(0, Math.min(TUTORIAL_CHAPTERS.length, Math.floor(saved.tutorialChapter ?? 0)));
    const rewarded = Array.isArray(saved.tutorialRewardedChapters)
      ? saved.tutorialRewardedChapters.filter((id) => TUTORIAL_CHAPTERS.some((item) => item.id === id))
      : TUTORIAL_CHAPTERS.slice(0, chapter).map((item) => item.id);
    return { ...current, ...saved, tutorialChapter: chapter, tutorialComplete: saved.tutorialComplete === true || chapter >= TUTORIAL_CHAPTERS.length, tutorialCompletedSteps: Array.isArray(saved.tutorialCompletedSteps) ? saved.tutorialCompletedSteps : [], tutorialRewardedChapters: rewarded, tutorialMovementDistance: Math.max(0, Number(saved.tutorialMovementDistance) || 0), heistCompletedEvents: Array.isArray(saved.heistCompletedEvents) ? saved.heistCompletedEvents : [] };
  },
}));

export function deleteDayKareSave() {
  if (typeof window === 'undefined') return;
  ['daykare-save', 'daykare-final-master', 'daykare-storybook-lane', 'daykare-monetization'].forEach((key) => window.localStorage.removeItem(key));
  window.sessionStorage.clear();
  window.location.reload();
}
