/**
 * One view model for every progression track in DayKare.
 *
 * The Journal used to render five unrelated state machines in five different
 * vocabularies: the quest registry printed its raw lowercase enum, the caper
 * printed `caper.step` de-hyphenated, chapters said Complete/Current/Locked,
 * routes said "Entrance foundation 2/3", and the Juice Club said nothing at all.
 * That is why "Where's Binky - complete", "Rainbow Tidy-Up - active - 7 done"
 * and "Sticker Parade Caper - idle" could all be true at once and tell the
 * player nothing about what to do next.
 *
 * This module answers three questions for every track, in the same words:
 *   what state is it in, what is the next actionable step, and why is it locked.
 *
 * It is pure and derives everything from state, so it can be unit-tested without
 * a browser and cannot drift from what the game actually knows.
 */

import type { CaperState } from './storyProgression';
import { RIVAL_CHAPTERS, type RivalStoryState } from './storyProgression';
import type { ProgressionState } from './progression';
import { HUB_ROUTES, isRouteUnlocked, requirementProgressLabel } from './progression';
import { QUEST_DEFINITIONS, getQuestDefinition, type QuestStates } from './quests';

/**
 * The player-facing status vocabulary. Every row in the Journal uses exactly one
 * of these, whatever machine produced it.
 */
export type BoardStatus =
  | 'active'
  | 'available'
  | 'locked'
  | 'complete'
  | 'repeatable'
  | 'cooldown'
  | 'story-required';

export const BOARD_STATUS_LABELS: Record<BoardStatus, string> = {
  active: 'Active',
  available: 'Available',
  locked: 'Locked',
  complete: 'Complete',
  repeatable: 'Repeatable',
  cooldown: 'Cooldown',
  'story-required': 'Story required',
};

export type BoardSection = 'story' | 'activities' | 'businesses' | 'completed';

export interface BoardProgress {
  done: number;
  total: number;
  label: string;
}

export interface BoardEntry {
  id: string;
  title: string;
  summary: string;
  section: BoardSection;
  status: BoardStatus;
  /**
   * The single next thing to do. Present for every entry the player can act on.
   * An entry that is actionable and cannot name its next step is a bug, and
   * `assertEveryActionableEntryGuidesThePlayer` below turns that into a failure.
   */
  nextAction?: string;
  location?: string;
  /** Why it is not available yet, in plain words rather than a flag name. */
  requirement?: string;
  /** Progress within the CURRENT round - never the lifetime total. */
  roundProgress?: BoardProgress;
  /** Lifetime completions, stated as such so it cannot be mistaken for progress. */
  lifetime?: string;
  reward?: string;
  unlocks?: string[];
}

export interface BoardInput {
  quests: QuestStates;
  caper: CaperState;
  rivalStory: RivalStoryState;
  progression: ProgressionState;
  juiceStock: number;
  crackerStock: number;
  juiceClubCash: number;
  juiceClubCustomersServed: number;
  /** Current schedule block id, for the Juice Club's opening hours. */
  schedule: string;
}

/* -------------------------------------------------------------------------- */
/* Registry quests                                                            */
/* -------------------------------------------------------------------------- */

function questEntry(definition: (typeof QUEST_DEFINITIONS)[number], input: BoardInput): BoardEntry {
  const state = input.quests[definition.id];
  const section: BoardSection = definition.kind === 'story' ? 'story' : 'activities';
  const base = {
    id: definition.id,
    title: definition.title,
    summary: definition.summary,
    location: definition.locationHint,
    reward: definition.rewardSummary,
    unlocks: definition.unlocks,
  };

  if (!state) {
    return { ...base, section, status: 'locked', requirement: 'Not available yet.' };
  }

  if (state.status === 'locked') {
    const prerequisite = definition.prerequisite;
    const blockedByStory = prerequisite
      && input.quests[prerequisite.questId]?.status !== 'complete';
    return {
      ...base,
      section,
      status: blockedByStory ? 'story-required' : 'locked',
      requirement: prerequisite?.label ?? 'Not available yet.',
    };
  }

  if (state.status === 'complete') {
    return {
      ...base,
      section: 'completed',
      status: 'complete',
      nextAction: definition.unlocks?.length
        ? `Opened ${definition.unlocks.join(' and ')}.`
        : undefined,
    };
  }

  // Active. Count progress within THIS round only.
  const objective = definition.objectives.find((entry) => entry.id === state.currentObjectiveId);
  const done = definition.objectives.filter((entry) => state.objectiveStates[entry.id] === 'complete').length;
  const total = definition.objectives.length;

  if (definition.repeatable) {
    const rounds = state.completionCount;
    return {
      ...base,
      section: 'activities',
      // A repeatable mid-round is Active; sitting at the start of a fresh round
      // it is Repeatable. Neither ever reads as unfinished Story content.
      status: done > 0 ? 'active' : 'repeatable',
      nextAction: objective ? `${objective.label} — ${objective.guidance}` : undefined,
      roundProgress: { done, total, label: `${done}/${total} this round` },
      lifetime: rounds > 0 ? `${rounds} round${rounds === 1 ? '' : 's'} completed` : undefined,
    };
  }

  return {
    ...base,
    section,
    status: 'active',
    nextAction: objective ? `${objective.label} — ${objective.guidance}` : undefined,
    roundProgress: { done, total, label: `Step ${Math.min(done + 1, total)} of ${total}` },
  };
}

/* -------------------------------------------------------------------------- */
/* Sticker Parade Caper                                                       */
/* -------------------------------------------------------------------------- */

/**
 * What the player should physically do at each caper step. The Journal used to
 * print the raw step name, so "idle" was the whole explanation a new player got
 * for a quest whose board is invisible until the Trusted Helper Pass exists.
 */
const CAPER_NEXT_ACTION: Record<string, string> = {
  idle: 'Visit the Sticker Parade board in the playground to start planning.',
  plan: 'Choose your role at the Sticker Parade board.',
  scout: 'Scout the route your role picked out.',
  'teacher-check': 'Talk to Ms. Harper and get the plan approved.',
  'patrol-timing': 'Watch the patrol for a moment, then move when it passes.',
  'safe-distraction': 'Set up the bubble table distraction.',
  retrieve: 'Collect the parade banner.',
  escape: 'Slip back to the group.',
  interrupted: 'Regroup and scout the route again.',
  celebrate: 'Celebrate with your friends.',
  complete: 'Start a fresh caper from the board whenever you like.',
};

const CAPER_STEP_LABELS: Record<string, string> = {
  idle: 'Not started',
  plan: 'Planning',
  scout: 'Scouting',
  'teacher-check': 'Getting approval',
  'patrol-timing': 'Timing the patrol',
  'safe-distraction': 'Setting the distraction',
  retrieve: 'Retrieving the banner',
  escape: 'Slipping away',
  interrupted: 'Interrupted',
  celebrate: 'Celebrating',
  complete: 'Complete',
};

export function caperStepLabel(step: string): string {
  return CAPER_STEP_LABELS[step] ?? step.replace(/-/g, ' ');
}

function caperEntry(input: BoardInput): BoardEntry {
  const base = {
    id: 'sticker-parade-caper',
    title: 'Sticker Parade Caper',
    summary: 'Plan the parade with your friends and bring back the banner.',
    location: 'The caper board is by the playground.',
    reward: '+2 REP · +3 Star Tokens · Maker Market foundation',
  };

  // The board itself does not exist in the world without the pass, so saying
  // "idle" was describing a quest the player could not see or reach.
  if (!input.progression.trustedHelperPass) {
    return {
      ...base,
      section: 'story',
      status: 'story-required',
      requirement: 'Earn the Trusted Helper Pass by returning Binky to Leo.',
    };
  }

  if (input.caper.step === 'complete') {
    return {
      ...base,
      section: 'completed',
      status: 'complete',
      nextAction: CAPER_NEXT_ACTION.complete,
      lifetime: input.caper.attempts > 0
        ? `${input.caper.attempts} caper${input.caper.attempts === 1 ? '' : 's'} run`
        : undefined,
    };
  }

  if (input.caper.step === 'idle') {
    return {
      ...base,
      section: 'story',
      status: 'available',
      nextAction: CAPER_NEXT_ACTION.idle,
    };
  }

  return {
    ...base,
    section: 'story',
    status: 'active',
    nextAction: CAPER_NEXT_ACTION[input.caper.step] ?? `Continue the caper (${caperStepLabel(input.caper.step)}).`,
    roundProgress: { done: 0, total: 0, label: caperStepLabel(input.caper.step) },
  };
}

/* -------------------------------------------------------------------------- */
/* Mae storyline                                                              */
/* -------------------------------------------------------------------------- */

const MAE_NEXT_ACTION: Record<string, string> = {
  'meet-mae': 'Find Mae in the classroom and hear out her plan.',
  'rainbow-rules': 'Finish a full Rainbow Tidy-Up round to show her how you work.',
  'garden-reversal': 'Finish a round of garden planting with her.',
  'two-stars-one-team': 'Talk to Mae and build the plan together.',
};

function maeEntry(input: BoardInput): BoardEntry {
  const completed = new Set(input.rivalStory.completedChapters);
  const chapter = RIVAL_CHAPTERS.find((entry) => !completed.has(entry.id));
  const done = RIVAL_CHAPTERS.filter((entry) => completed.has(entry.id)).length;

  const base = {
    id: 'mae-storyline',
    title: "Mae's Story",
    summary: 'A rival with her own plans — and the makings of a friend.',
    location: 'Mae is usually in the classroom.',
    reward: '+5 Star Tokens · +4 REP · Bridge Builder',
  };

  if (!chapter) {
    return {
      ...base,
      section: 'completed',
      status: 'complete',
      nextAction: 'You and Mae build plans together now.',
    };
  }

  return {
    ...base,
    section: 'story',
    status: done === 0 ? 'available' : 'active',
    nextAction: MAE_NEXT_ACTION[chapter.id] ?? `Continue ${chapter.title}.`,
    roundProgress: {
      done,
      total: RIVAL_CHAPTERS.length,
      label: `Chapter ${done + 1} of ${RIVAL_CHAPTERS.length} · ${chapter.title}`,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Garden + Juice Club                                                        */
/* -------------------------------------------------------------------------- */

function gardenEntry(input: BoardInput): BoardEntry {
  const route = HUB_ROUTES.find((entry) => entry.id === 'garden-district');
  const unlocked = route ? isRouteUnlocked(route, input.progression) : false;
  const runs = input.progression.activityRuns['garden-planting'] ?? 0;

  const base = {
    id: 'garden-planting',
    title: 'Garden Planting',
    summary: 'Tend the beds in the Garden District.',
    location: 'Through the east gate, past the playground.',
    reward: '+1 REP · +2 Star Tokens each round',
  };

  if (!unlocked) {
    return {
      ...base,
      section: 'activities',
      status: 'locked',
      requirement: route ? `Needs ${requirementProgressLabel(route, input.progression)}` : 'Not available yet.',
    };
  }

  return {
    ...base,
    section: 'activities',
    status: 'repeatable',
    nextAction: 'Walk to the east gate and enter the Garden District, then tend a bed.',
    lifetime: runs > 0 ? `${runs} round${runs === 1 ? '' : 's'} completed` : undefined,
  };
}

function juiceClubEntry(input: BoardInput): BoardEntry {
  const open = input.schedule === 'juice-club';
  const outOfStock = input.juiceStock <= 0 || input.crackerStock <= 0;

  const base = {
    id: 'juice-club',
    title: 'Juice Club',
    summary: 'Serve juice and crackers to the queue.',
    location: 'The Juice Club counter is in the classroom.',
    reward: '+1 REP · +1 Star Token · cash per customer',
  };

  if (!open) {
    // Not a failure - it simply has opening hours, and saying so is the whole
    // point of a Cooldown badge as opposed to a Locked one.
    return {
      ...base,
      section: 'businesses',
      status: 'cooldown',
      requirement: 'Opens at 12:00 PM.',
      lifetime: `${input.juiceClubCustomersServed} served · $${input.juiceClubCash}`,
    };
  }

  return {
    ...base,
    section: 'businesses',
    status: outOfStock ? 'cooldown' : 'active',
    nextAction: outOfStock
      ? 'Restock juice and crackers in the Journal before serving.'
      : 'Serve the next customer at the counter.',
    requirement: outOfStock ? 'Out of stock' : undefined,
    roundProgress: {
      done: Math.min(input.juiceStock, input.crackerStock),
      total: 5,
      label: `${input.juiceStock} juice · ${input.crackerStock} crackers`,
    },
    lifetime: `${input.juiceClubCustomersServed} served · $${input.juiceClubCash}`,
  };
}

/* -------------------------------------------------------------------------- */
/* Assembly                                                                   */
/* -------------------------------------------------------------------------- */

export function buildQuestBoard(input: BoardInput): BoardEntry[] {
  return [
    ...QUEST_DEFINITIONS.map((definition) => questEntry(definition, input)),
    maeEntry(input),
    caperEntry(input),
    gardenEntry(input),
    juiceClubEntry(input),
  ];
}

export function boardSection(entries: BoardEntry[], section: BoardSection): BoardEntry[] {
  return entries.filter((entry) => entry.section === section);
}

/**
 * The one thing the player should do next, for the HUD and the Journal header.
 * Story outranks activities: a repeatable must never be presented as the main
 * thread, which is exactly how Rainbow Tidy-Up came to look like stuck Story.
 */
export function primaryObjective(entries: BoardEntry[]): BoardEntry | undefined {
  return entries.find((entry) => entry.section === 'story' && entry.status === 'active')
    ?? entries.find((entry) => entry.section === 'story' && entry.status === 'available')
    ?? entries.find((entry) => entry.status === 'active');
}

/**
 * Invariant: no entry the player can act on may leave them without a next step.
 * This is the property that was actually broken - "idle" with no explanation -
 * so it is asserted rather than left to review.
 */
export function assertEveryActionableEntryGuidesThePlayer(entries: BoardEntry[]): void {
  for (const entry of entries) {
    const actionable = entry.status === 'active' || entry.status === 'available' || entry.status === 'repeatable';
    if (actionable && !entry.nextAction) {
      throw new Error(`Board entry "${entry.id}" is ${entry.status} but names no next action.`);
    }
    const blocked = entry.status === 'locked' || entry.status === 'story-required' || entry.status === 'cooldown';
    if (blocked && !entry.requirement) {
      throw new Error(`Board entry "${entry.id}" is ${entry.status} but explains no requirement.`);
    }
  }
}

export function getBoardQuestTitle(questId: string): string {
  return getQuestDefinition(questId)?.title ?? questId;
}
