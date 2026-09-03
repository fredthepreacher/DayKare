import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { addLifetimeXp, getUnlockedRoutes, MAX_REPUTATION } from './progression';
import { registerHeistsCompletedReader, useGameStore } from './store';
import { useStorybookLaneStore } from './storybookLaneStore';
import {
  DEFAULT_AVATAR, FIRST_HEIST_CASH, FIRST_HEIST_RB, FIRST_HEIST_XP, FULL_REDESIGN_PRICE,
  HEIST_STEPS, REPLAY_HEIST_RB, RASCAL_BUCKS_PER_GEM, STARTER_HOME_PRICE, TUTORIAL_CHAPTERS,
  type AvatarProfile, type HeistEvent, type HeistStatus, type TutorialEvent,
} from './finalMaster';
import { useToastStore } from './toastStore';
import { TIMING_GRID_ROUNDS } from './heistPlanning';
import { GARAGE_THEMES, HOME_THEMES, nextGarageTheme, nextHomeTheme } from './interiorThemes';
import { NEIGHBORHOOD_SPOT_IDS, activityCompletedBy } from './neighborhood';

/** How many completed heists earn the reward outfit. */
export const HERO_OUTFIT_HEISTS = 1;

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
  heistsCompleted: number;
  successfulFinales: number;
  totalHeistRbEarned: number;
  routePlannerComplete: boolean;
  routePlannerBestRisk: number | null;
  timingGridComplete: boolean;
  timingGridBestScore: number | null;
  /**
   * A legacy save finished the first heist but never recorded which
   * reward the player took. We owe them exactly one of the two, so the
   * recovery prompt is shown once rather than silently granting both
   * or silently granting neither.
   */
  homeRewardRecoveryPending: boolean;
  /** Interior colour themes, stored as indices into the authored palettes. */
  homeThemeIndex: number;
  garageThemeIndex: number;
  /** Best rally reached in each of the two rally minigames. */
  rallyBest: Record<string, number>;
  /** Spot ids completed across the three neighbourhood activities. */
  neighborhoodDone: string[];
  /** The heist-completion reward outfit, once earned. */
  heroOutfitUnlocked: boolean;
  heistBoardOpen: boolean;
  leoHeistHintCount: number;
  leoHeistIntroCompleted: boolean;
  leoHeistNextHintMinute: number | null;
  leoHeistApproachActive: boolean;
  leoHeistWaypointActive: boolean;
  missLeslieHeistIntroduced: boolean;
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
  openHeistBoard: () => void;
  closeHeistBoard: () => void;
  completeRoutePlanner: (risk: number) => boolean;
  completeTimingGrid: (score: number) => boolean;
  resolveHomeRewardRecovery: (choice: 'rb' | 'home') => boolean;
  cycleHomeTheme: () => number;
  cycleGarageTheme: () => number;
  recordRallyResult: (id: string, bestRally: number, xp: number) => boolean;
  completeNeighborhoodSpot: (spotId: string) => 'done' | 'already' | 'unknown';
  claimHeroOutfit: () => boolean;
  requestLeoHeistApproach: (absoluteMinute: number, eligible: boolean, leoStoryComplete: boolean) => boolean;
  completeLeoHeistHint: (absoluteMinute: number) => 1 | 2 | null;
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

/**
 * Coerce a persisted number.
 *
 * `Math.max(0, Math.min(2, Math.floor(value ?? 0)))` looks like a clamp but is
 * not one: a string or an object floors to NaN, and every comparison against
 * NaN is false. A save with `leoHeistHintCount: "lots"` therefore passed the
 * `>= 2` cap check forever, so Leo would have kept walking over with the same
 * reminder for the rest of the game.
 */
function safeCount(value: unknown, max: number, fallback = 0): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(max, parsed));
}

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
  heistsCompleted: 0,
  successfulFinales: 0,
  totalHeistRbEarned: 0,
  routePlannerComplete: false,
  routePlannerBestRisk: null,
  timingGridComplete: false,
  timingGridBestScore: null,
  homeRewardRecoveryPending: false,
  homeThemeIndex: 0,
  garageThemeIndex: 0,
  rallyBest: {},
  neighborhoodDone: [],
  heroOutfitUnlocked: false,
  heistBoardOpen: false,
  leoHeistHintCount: 0,
  leoHeistIntroCompleted: false,
  leoHeistNextHintMinute: null,
  leoHeistApproachActive: false,
  leoHeistWaypointActive: false,
  missLeslieHeistIntroduced: false,
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
    set({ heistStatus: 'active', heistStep: 0, heistCompletedEvents: [], companionCommand: 'follow', activeAnimation: 'anim_miss_leslie_board_intro', missLeslieHeistIntroduced: true, leoHeistApproachActive: false, leoHeistWaypointActive: false });
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
        set({ heistStatus: 'reward-choice', heistStep: HEIST_STEPS.length, heistCompletedEvents: completed, companionCommand: 'finale', heistsCompleted: state.heistsCompleted + 1, successfulFinales: state.successfulFinales + 1 });
      } else {
        const dayNumber = useGameStore.getState().dayNumber;
        if (state.lastReplayDay !== dayNumber) {
          useStorybookLaneStore.getState().grantRibbonBucks(REPLAY_HEIST_RB);
          grantCoreReward(FIRST_HEIST_XP, FIRST_HEIST_CASH);
        }
        set({ heistStatus: 'complete', heistStep: HEIST_STEPS.length, heistCompletedEvents: completed, companionCommand: 'finale', lastReplayDay: dayNumber, heistsCompleted: state.heistsCompleted + 1, successfulFinales: state.successfulFinales + 1, totalHeistRbEarned: state.totalHeistRbEarned + REPLAY_HEIST_RB });
        get().claimHeroOutfit();
      }
    } else set({ heistStep: next, heistCompletedEvents: completed, companionCommand: next === 2 ? 'wait' : next === 3 ? 'goto' : next === 4 ? 'interact' : next === 5 ? 'regroup' : 'follow' });
    return true;
  },
  chooseFirstReward: (choice) => {
    const state = get();
    if (state.heistStatus !== 'reward-choice' || state.firstRewardChoice) return false;
    if (choice === 'rb') useStorybookLaneStore.getState().grantRibbonBucks(FIRST_HEIST_RB);
    set({ firstRewardChoice: choice, firstHeistComplete: true, heistStatus: 'complete', homeVoucher: choice === 'home', totalHeistRbEarned: state.totalHeistRbEarned + (choice === 'rb' ? FIRST_HEIST_RB : 0) });
    // The suit is the proof you finished a heist, so it lands the moment the
    // first clear is booked rather than waiting for the next replay.
    get().claimHeroOutfit();
    set({ homeRewardRecoveryPending: false });
    return true;
  },
  claimReplayReward: (dayNumber) => {
    const state = get();
    if (!state.firstHeistComplete || state.lastReplayDay === dayNumber) return false;
    set({ heistStatus: 'active', heistStep: 0, heistCompletedEvents: [], companionCommand: 'follow', activeAnimation: 'anim_miss_leslie_board_intro' });
    return true;
  },
  openHeistBoard: () => set({ heistBoardOpen: true }),
  closeHeistBoard: () => set({ heistBoardOpen: false }),
  completeRoutePlanner: (risk) => {
    const state = get();
    const safeRisk = Math.max(0, Math.min(9, Math.floor(Number.isFinite(risk) ? risk : 9)));
    const firstClear = !state.routePlannerComplete;
    set({ routePlannerComplete: true, routePlannerBestRisk: state.routePlannerBestRisk === null ? safeRisk : Math.min(state.routePlannerBestRisk, safeRisk) });
    if (firstClear) {
      grantCoreReward(25, 0);
      useToastStore.getState().enqueue({ title: 'Low-risk route planned! +25 XP', detail: 'Setup advantage saved. Major heist payouts are unchanged.', kind: 'success' });
    }
    return firstClear;
  },
  completeTimingGrid: (score) => {
    const state = get();
    const safeScore = Math.max(0, Math.min(TIMING_GRID_ROUNDS.length, Math.floor(Number.isFinite(score) ? score : 0)));
    const firstClear = !state.timingGridComplete;
    set({
      timingGridComplete: true,
      timingGridBestScore: state.timingGridBestScore === null ? safeScore : Math.max(state.timingGridBestScore, safeScore),
    });
    if (firstClear) {
      // Practice pays a token amount of XP and no Rascal Bucks, so the
      // board can never be farmed in place of an actual heist.
      grantCoreReward(25, 0);
      useToastStore.getState().enqueue({ title: 'Timing read! +25 XP', detail: 'Practice only \u2014 heist payouts are unchanged.', kind: 'success' });
    }
    return firstClear;
  },
  /**
   * The one-time make-good for a legacy first-clear. It grants exactly
   * one reward and clears the flag whether or not the player picks the
   * home, so the prompt cannot come back for a second helping.
   */
  resolveHomeRewardRecovery: (choice) => {
    const state = get();
    if (!state.homeRewardRecoveryPending || state.firstRewardChoice !== null) {
      set({ homeRewardRecoveryPending: false });
      return false;
    }
    set({
      homeRewardRecoveryPending: false,
  homeThemeIndex: 0,
  garageThemeIndex: 0,
  rallyBest: {},
  neighborhoodDone: [],
  heroOutfitUnlocked: false,
      firstRewardChoice: choice,
      homeVoucher: choice === 'home',
      totalHeistRbEarned: state.totalHeistRbEarned + (choice === 'rb' ? FIRST_HEIST_RB : 0),
    });
    if (choice === 'rb') useStorybookLaneStore.setState({ ribbonBucks: useStorybookLaneStore.getState().ribbonBucks + FIRST_HEIST_RB });
    return true;
  },
  cycleHomeTheme: () => {
    const next = nextHomeTheme(get().homeThemeIndex);
    set({ homeThemeIndex: next });
    return next;
  },
  cycleGarageTheme: () => {
    const next = nextGarageTheme(get().garageThemeIndex);
    set({ garageThemeIndex: next });
    return next;
  },
  /**
   * A rally result. XP is paid only when a run beats the stored best, so a
   * minigame rewards getting better at it rather than replaying it.
   */
  recordRallyResult: (id, bestRally, xp) => {
    const state = get();
    const safeBest = Math.max(0, Math.min(999, Math.floor(Number.isFinite(bestRally) ? bestRally : 0)));
    const previous = state.rallyBest[id] ?? 0;
    if (safeBest <= previous) return false;
    set({ rallyBest: { ...state.rallyBest, [id]: safeBest } });
    grantCoreReward(Math.max(0, Math.floor(xp)), 0);
    return true;
  },
  completeNeighborhoodSpot: (spotId) => {
    if (!NEIGHBORHOOD_SPOT_IDS.includes(spotId)) return 'unknown';
    const state = get();
    if (state.neighborhoodDone.includes(spotId)) return 'already';
    const completed = activityCompletedBy(spotId, state.neighborhoodDone);
    set({ neighborhoodDone: [...state.neighborhoodDone, spotId] });
    // The activity's reward lands once, on the visit that finishes it.
    if (completed) {
      grantCoreReward(completed.xpReward, 0, completed.repReward);
      useToastStore.getState().enqueue({
        title: `${completed.label} complete!`,
        detail: `+${completed.xpReward} XP · +${completed.repReward} REP`,
        kind: 'success',
      });
    }
    return 'done';
  },
  /** The hero outfit is earned, once, and never sold. */
  claimHeroOutfit: () => {
    const state = get();
    if (state.heroOutfitUnlocked || !state.firstHeistComplete || state.heistsCompleted < HERO_OUTFIT_HEISTS) return false;
    set({ heroOutfitUnlocked: true });
    useGameStore.getState().syncDripOwnership();
    useToastStore.getState().enqueue({
      title: 'Rascal Ranger suit unlocked!',
      detail: 'Change into it at your bedroom closet.',
      kind: 'success',
    });
    return true;
  },
  requestLeoHeistApproach: (absoluteMinute, eligible, leoStoryComplete) => {
    const state = get();
    if (!eligible || !leoStoryComplete || state.missLeslieHeistIntroduced || state.heistStatus === 'active' || state.heistStatus === 'reward-choice' || state.leoHeistHintCount >= 2 || state.leoHeistApproachActive) return false;
    if (state.leoHeistHintCount === 1 && absoluteMinute < (state.leoHeistNextHintMinute ?? Number.POSITIVE_INFINITY)) return false;
    set({ leoHeistApproachActive: true });
    return true;
  },
  completeLeoHeistHint: (absoluteMinute) => {
    const state = get();
    if (!state.leoHeistApproachActive || state.missLeslieHeistIntroduced || state.leoHeistHintCount >= 2) return null;
    const next = (state.leoHeistHintCount + 1) as 1 | 2;
    set({
      leoHeistHintCount: next,
      leoHeistIntroCompleted: true,
      leoHeistNextHintMinute: next === 1 ? absoluteMinute + 60 : null,
      leoHeistApproachActive: false,
      leoHeistWaypointActive: true,
    });
    return next;
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
    // The interior is its own zone; the travel does the fade, the spawn
    // and the collision switch, so this only records that we are inside.
    if (!useGameStore.getState().enterOwnedHome()) return false;
    set({ insideHome: true });
    return true;
  },
  leaveHome: () => {
    useGameStore.getState().leaveOwnedHome();
    set({ insideHome: false });
  },
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
    lastReplayDay: state.lastReplayDay, heistsCompleted: state.heistsCompleted, successfulFinales: state.successfulFinales, totalHeistRbEarned: state.totalHeistRbEarned,
    routePlannerComplete: state.routePlannerComplete, routePlannerBestRisk: state.routePlannerBestRisk,
    timingGridComplete: state.timingGridComplete, timingGridBestScore: state.timingGridBestScore,
    homeRewardRecoveryPending: state.homeRewardRecoveryPending,
    homeThemeIndex: state.homeThemeIndex, garageThemeIndex: state.garageThemeIndex,
    rallyBest: state.rallyBest, neighborhoodDone: state.neighborhoodDone,
    heroOutfitUnlocked: state.heroOutfitUnlocked,
    leoHeistHintCount: state.leoHeistHintCount, leoHeistIntroCompleted: state.leoHeistIntroCompleted, leoHeistNextHintMinute: state.leoHeistNextHintMinute,
    leoHeistWaypointActive: state.leoHeistWaypointActive, missLeslieHeistIntroduced: state.missLeslieHeistIntroduced,
    ownedStarterHome: state.ownedStarterHome, homeVoucher: state.homeVoucher,
    gems: state.gems,
  }),
  merge: (persisted, current) => {
    const saved = (persisted && typeof persisted === 'object' ? persisted : {}) as Partial<FinalMasterState>;
    const chapter = Math.max(0, Math.min(TUTORIAL_CHAPTERS.length, Math.floor(saved.tutorialChapter ?? 0)));
    const rewarded = Array.isArray(saved.tutorialRewardedChapters)
      ? saved.tutorialRewardedChapters.filter((id) => TUTORIAL_CHAPTERS.some((item) => item.id === id))
      : TUTORIAL_CHAPTERS.slice(0, chapter).map((item) => item.id);
    const routeRisk = saved.routePlannerBestRisk;
    const gridScore = saved.timingGridBestScore;
    const firstReward = saved.firstRewardChoice === 'rb' || saved.firstRewardChoice === 'home' ? saved.firstRewardChoice : null;
    const ownsHome = saved.ownedStarterHome === true;
    // A player who took the Rascal Bucks was never owed a house, so a
    // stray voucher on such a save is dropped rather than honoured.
    const voucher = saved.homeVoucher === true && firstReward !== 'rb' && !ownsHome;
    // Unresolved legacy first-clear: the heist is finished, but the save
    // carries neither a recorded choice, nor a house, nor a voucher, and
    // the choice modal is not pending. That player is owed exactly one
    // reward, offered once.
    const owedRecovery = saved.firstHeistComplete === true
      && firstReward === null
      && !ownsHome
      && !voucher
      && saved.heistStatus !== 'reward-choice';
    return { ...current, ...saved,
      firstRewardChoice: firstReward,
      ownedStarterHome: ownsHome,
      homeVoucher: voucher,
      insideHome: false,
      homeRewardRecoveryPending: owedRecovery,
      homeThemeIndex: safeCount(saved.homeThemeIndex ?? 0, HOME_THEMES.length - 1),
      garageThemeIndex: safeCount(saved.garageThemeIndex ?? 0, GARAGE_THEMES.length - 1),
      rallyBest: saved.rallyBest && typeof saved.rallyBest === 'object'
        ? Object.fromEntries(Object.entries(saved.rallyBest)
          .filter(([, value]) => Number.isFinite(Number(value)))
          .map(([key, value]) => [key, safeCount(value, 999)]))
        : {},
      // Only spots that still exist survive a load, so removing an activity
      // later cannot leave a save pointing at nothing.
      neighborhoodDone: Array.isArray(saved.neighborhoodDone)
        ? saved.neighborhoodDone.filter((id) => NEIGHBORHOOD_SPOT_IDS.includes(id))
        : [],
      heroOutfitUnlocked: saved.heroOutfitUnlocked === true,
      timingGridComplete: saved.timingGridComplete === true,
      timingGridBestScore: typeof gridScore === 'number' && Number.isFinite(gridScore)
        ? Math.max(0, Math.min(TIMING_GRID_ROUNDS.length, Math.floor(gridScore)))
        : null, tutorialChapter: chapter, tutorialComplete: saved.tutorialComplete === true || chapter >= TUTORIAL_CHAPTERS.length, tutorialCompletedSteps: Array.isArray(saved.tutorialCompletedSteps) ? saved.tutorialCompletedSteps : [], tutorialRewardedChapters: rewarded, tutorialMovementDistance: Number.isFinite(Number(saved.tutorialMovementDistance)) ? Math.max(0, Number(saved.tutorialMovementDistance)) : 0, heistCompletedEvents: Array.isArray(saved.heistCompletedEvents) ? saved.heistCompletedEvents : [], heistsCompleted: safeCount(saved.heistsCompleted ?? 0, Number.MAX_SAFE_INTEGER), successfulFinales: safeCount(saved.successfulFinales ?? 0, Number.MAX_SAFE_INTEGER), totalHeistRbEarned: safeCount(saved.totalHeistRbEarned ?? 0, Number.MAX_SAFE_INTEGER), routePlannerComplete: saved.routePlannerComplete === true, routePlannerBestRisk: typeof routeRisk === 'number' && Number.isFinite(routeRisk) ? Math.max(0, Math.min(9, Math.floor(routeRisk))) : null, heistBoardOpen: false, leoHeistHintCount: safeCount(saved.leoHeistHintCount ?? 0, 2), leoHeistIntroCompleted: saved.leoHeistIntroCompleted === true, leoHeistNextHintMinute: typeof saved.leoHeistNextHintMinute === 'number' && Number.isFinite(saved.leoHeistNextHintMinute) ? Math.max(0, Math.floor(saved.leoHeistNextHintMinute)) : null, leoHeistApproachActive: false, leoHeistWaypointActive: saved.leoHeistWaypointActive === true && saved.missLeslieHeistIntroduced !== true, missLeslieHeistIntroduced: saved.missLeslieHeistIntroduced === true || saved.heistStatus === 'active' || saved.firstHeistComplete === true };
  },
}));

export function deleteDayKareSave() {
  if (typeof window === 'undefined') return;
  ['daykare-save', 'daykare-final-master', 'daykare-storybook-lane', 'daykare-monetization'].forEach((key) => window.localStorage.removeItem(key));
  window.sessionStorage.clear();
  window.location.reload();
}

/**
 * The career heist count lives here, but drip ownership is derived in the game
 * store, which loads first. Hand it a reader, then ask it to rebuild once - the
 * suit would otherwise stay locked for the rest of a session that started with
 * a heist already finished.
 */
registerHeistsCompletedReader(() => useFinalMasterStore.getState().heistsCompleted);
useGameStore.getState().syncDripOwnership();

