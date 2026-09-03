import { STARTER_HOME_PRICE } from './finalMaster';

/**
 * Stony Brook real estate.
 *
 * The catalog and the offer logic are pure so the purchase rules can be
 * asserted directly. Nothing here spends anything; the store owns that.
 */

export interface StonyBrookProperty {
  id: string;
  name: string;
  blurb: string;
  price: number;
  /** Only a starter property can be taken with a free-home voucher. */
  starter: boolean;
  /** True when the property has a built interior to walk through. */
  enterable: boolean;
}

export const STONY_BROOK_PROPERTIES: readonly StonyBrookProperty[] = [
  {
    id: 'wavy-manor',
    name: 'Wavy Manor',
    blurb: 'Two storeys and a finished basement. Driveway, porch, and a mailbox with your name on it.',
    price: STARTER_HOME_PRICE,
    starter: true,
    enterable: true,
  },
  {
    id: 'bluebell-cottage',
    name: 'Bluebell Cottage',
    blurb: 'A neighbour’s place on the lane. Not for sale yet — Mr. Brooks is still talking them round.',
    price: 48000,
    starter: false,
    enterable: false,
  },
];

export const STARTER_PROPERTY_ID = 'wavy-manor';

export type PropertyAction =
  | { kind: 'enter' }
  | { kind: 'claim' }
  | { kind: 'buy'; price: number }
  | { kind: 'short'; price: number; balance: number; shortfall: number }
  | { kind: 'unavailable' };

export interface PropertyOwnershipView {
  ownedStarterHome: boolean;
  homeVoucher: boolean;
  rascalBucks: number;
}

/**
 * What the realtor can offer on a property right now.
 *
 * A player who already owns the starter home is shown the way in, never
 * a second purchase; a voucher claims only a starter property; and a
 * short balance reports the gap rather than silently doing nothing.
 */
export function propertyAction(property: StonyBrookProperty, view: PropertyOwnershipView): PropertyAction {
  if (property.id === STARTER_PROPERTY_ID && view.ownedStarterHome) return { kind: 'enter' };
  if (!property.enterable) return { kind: 'unavailable' };
  if (property.starter && view.homeVoucher) return { kind: 'claim' };
  if (view.rascalBucks >= property.price) return { kind: 'buy', price: property.price };
  return {
    kind: 'short',
    price: property.price,
    balance: view.rascalBucks,
    shortfall: property.price - view.rascalBucks,
  };
}

/* ------------------------------ realtors ------------------------------ */

export interface RealtorProfile {
  id: string;
  name: string;
  title: string;
  /** Patrol loop through Stony Brook, walked slowly and repeatedly. */
  patrol: readonly [number, number, number][];
  bodyColor: string;
  accentColor: string;
  bottomColor: string;
  hairColor: string;
  hairStyle: 'bob' | 'curls' | 'ponytail' | 'sprout' | 'pigtails';
  skinColor: string;
}

/**
 * The pack suggested "Ms. Harper" for the female realtor, but that name
 * already belongs to a DayKare teacher and friend state is keyed by
 * name, so the realtor is Ms. Hartwell.
 */
export const REALTORS: readonly RealtorProfile[] = [
  {
    id: 'realtor_male_01',
    name: 'Mr. Brooks',
    title: 'Stony Brook Realty',
    patrol: [[-6.4, 0, -4.6], [-6.4, 0, 0.4], [-2.6, 0, 1.4], [-3.2, 0, -4.2]],
    bodyColor: '#3f5674',
    accentColor: '#c9d6e5',
    bottomColor: '#2b3a4f',
    hairColor: '#3b2a22',
    hairStyle: 'curls',
    skinColor: '#8d5836',
  },
  {
    id: 'realtor_female_01',
    name: 'Ms. Hartwell',
    title: 'Stony Brook Realty',
    patrol: [[5.6, 0, -3.6], [5.6, 0, 1.2], [2.4, 0, 2.2], [2.8, 0, -3.2]],
    bodyColor: '#5c4a72',
    accentColor: '#e6d8ef',
    bottomColor: '#3a2e4a',
    hairColor: '#5b3a2a',
    hairStyle: 'bob',
    skinColor: '#e0aa82',
  },
];

/** Where along a patrol loop a realtor should be at a given time. */
export function realtorPatrolTarget(profile: RealtorProfile, seconds: number) {
  const legSeconds = 6.5;
  const index = Math.floor(Math.max(0, seconds) / legSeconds) % profile.patrol.length;
  return profile.patrol[index];
}
