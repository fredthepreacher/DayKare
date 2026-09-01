/**
 * Optional-area access gates, from the owner's `map_access_requirements_v1.json`.
 *
 * These five areas do not exist as world geometry yet, and this module
 * deliberately does not pretend otherwise. What it provides is the RULE - the
 * requirement, the evaluation, and the player-facing explanation - so that when
 * a district is built, the gate it needs is already specified, already tested,
 * and already visible to the player as something to work toward.
 *
 * The economy principle from the pack is enforced structurally rather than by
 * convention: `coreStoryBlocked` is asserted false for every entry in the suite,
 * so no cash requirement can ever end up in front of required Story content.
 */

import type { ProgressionState } from './progression';
import type { QuestStates } from './quests';

export type AreaKind =
  | 'optional_activity'
  | 'shop_zone'
  | 'social_secret'
  | 'optional_garden'
  | 'prestige_social';

export interface AreaGate {
  id: string;
  name: string;
  kind: AreaKind;
  repRequired: number;
  cashRequired: number;
  /** Free text describing a Story prerequisite; empty means none. */
  storyRequired: string;
  purpose: string;
  /**
   * Whether this gate stands in front of required Story progression. Must always
   * be false - cash-walling the main line is the one thing the economy rules
   * forbid outright.
   */
  coreStoryBlocked: false;
}

export const AREA_GATES: AreaGate[] = [
  {
    id: 'ride_on_yard',
    name: 'Ride-On Yard',
    kind: 'optional_activity',
    repRequired: 150,
    cashRequired: 8,
    storyRequired: '',
    purpose: 'Tricycle and scooter courses, and ride-on challenges.',
    coreStoryBlocked: false,
  },
  {
    id: 'maker_market_premium_counter',
    name: 'Maker Market Premium Counter',
    kind: 'shop_zone',
    repRequired: 250,
    cashRequired: 15,
    storyRequired: 'Maker Market unlocked',
    purpose: 'Premium Drip and specialty vendors.',
    coreStoryBlocked: false,
  },
  {
    id: 'quiet_loft_clubhouse',
    name: 'Quiet Loft Clubhouse',
    kind: 'social_secret',
    repRequired: 350,
    cashRequired: 0,
    storyRequired: 'Chapter 2+',
    purpose: 'Social quests, rare conversations and collectibles.',
    coreStoryBlocked: false,
  },
  {
    id: 'garden_conservatory',
    name: 'Garden Conservatory',
    kind: 'optional_garden',
    repRequired: 300,
    cashRequired: 10,
    storyRequired: 'Garden milestone 2',
    purpose: 'Rare plants, collectibles and Garden prestige content.',
    coreStoryBlocked: false,
  },
  {
    id: 'legend_corner',
    name: 'Legend Corner',
    kind: 'prestige_social',
    repRequired: 600,
    cashRequired: 25,
    storyRequired: '',
    purpose: 'Late-game prestige hangout and cosmetic showcase.',
    coreStoryBlocked: false,
  },
];

export interface AreaAccessInput {
  progression: ProgressionState;
  cash: number;
  quests: QuestStates;
  /** Mae's chapter number, for the Chapter-2 style requirements. */
  storyChapter: number;
  gardenRuns: number;
}

export interface AreaAccessView {
  gate: AreaGate;
  unlocked: boolean;
  /** Every requirement still outstanding, in plain words. Empty when unlocked. */
  outstanding: string[];
  /** How far along the REP requirement the player is, for a progress bar. */
  repProgress: { current: number; required: number };
}

function storyRequirementMet(gate: AreaGate, input: AreaAccessInput): boolean {
  if (!gate.storyRequired) return true;
  if (gate.storyRequired.startsWith('Chapter')) {
    const wanted = Number.parseInt(gate.storyRequired.replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(wanted) ? input.storyChapter >= wanted : true;
  }
  if (gate.storyRequired.startsWith('Garden milestone')) {
    const wanted = Number.parseInt(gate.storyRequired.replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(wanted) ? input.gardenRuns >= wanted : true;
  }
  if (gate.storyRequired === 'Maker Market unlocked') {
    return input.progression.routeUnlocks.includes('maker-market');
  }
  return true;
}

export function evaluateAreaAccess(gate: AreaGate, input: AreaAccessInput): AreaAccessView {
  const outstanding: string[] = [];
  const reputation = input.progression.reputation;

  if (reputation < gate.repRequired) {
    outstanding.push(`${gate.repRequired} REP (you have ${reputation})`);
  }
  if (input.cash < gate.cashRequired) {
    outstanding.push(`$${gate.cashRequired} (you have $${input.cash})`);
  }
  if (!storyRequirementMet(gate, input)) {
    outstanding.push(gate.storyRequired);
  }

  return {
    gate,
    unlocked: outstanding.length === 0,
    outstanding,
    repProgress: { current: Math.min(reputation, gate.repRequired), required: gate.repRequired },
  };
}

export function evaluateAllAreaAccess(input: AreaAccessInput): AreaAccessView[] {
  return AREA_GATES.map((gate) => evaluateAreaAccess(gate, input));
}
