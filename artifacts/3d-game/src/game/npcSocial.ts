/**
 * Player-facing NPC social behaviour: greetings, approaches, reactions.
 *
 * What existed before was one greeting rule with a MODULE-SCOPE cooldown:
 *
 *     let nextGreetingAt = 0;   // shared by all eleven children
 *
 * so the first child to greet you silenced the entire daycare for the next
 * twelve seconds. That is why the room can feel empty even with eleven kids in
 * it - and the effect got worse the more children were near you, which is
 * exactly backwards.
 *
 * Cooldowns are per child here, with a much shorter global floor that exists
 * only to stop several children speaking over each other in the same second.
 * Everything is deterministic given (name, time), so the same situation produces
 * the same behaviour and a bug report is reproducible - but the *pattern* is
 * irregular enough not to read as a metronome.
 *
 * The design constraint from the brief: "Do not constantly interrupt the
 * player." Approaches are rarer than greetings, only one child may be
 * approaching at a time, and both stop entirely during Story dialogue.
 */

export type SocialAction = 'none' | 'wave' | 'greet' | 'approach' | 'offer-play' | 'point-out';

export interface SocialContext {
  name: string;
  /** Seconds since scene start, from the render clock. */
  now: number;
  distance: number;
  /** True when the player is mid-quest; Story outranks ambience. */
  questActive: boolean;
  /** True when a dialogue, journal or transition owns the screen. */
  blocked: boolean;
  /** Whether the child can afford social work at its current simulation tier. */
  allowed: boolean;
  schedule: string;
  friendship: number;
}

export interface SocialDecision {
  action: SocialAction;
  /** Ambient line to publish, if any. */
  message?: string;
  /**
   * Reaction to drive the character animation with. These are CharacterModel's
   * own vocabulary rather than a parallel one, so nothing has to map between
   * them and no reaction can be emitted that the rig cannot play.
   */
  reaction?: 'wave' | 'cheer' | 'listen';
  /** Seconds to hold this child quiet afterwards. */
  cooldown: number;
}

/** A child notices you at conversational range. */
const GREET_RANGE = 2.4;
/** Beyond this, a child may still wave rather than speak. */
const WAVE_RANGE = 5.5;
/** A child will only walk over to you from inside this range. */
const APPROACH_RANGE = 7;

/**
 * Per-child quiet time after acting. Long enough that one child is not a
 * chatterbox; short enough that a room of eleven feels populated.
 */
const GREET_COOLDOWN = 26;
const WAVE_COOLDOWN = 15;
const APPROACH_COOLDOWN = 95;

/**
 * The global floor. Its only job is to stop two children greeting you in the
 * same breath - it is 2.5 seconds, not the 12 the old shared cooldown used.
 */
export const GLOBAL_SOCIAL_FLOOR = 2.5;

const cooldowns = new Map<string, number>();
let nextGlobalAt = 0;
let approachingChild: string | null = null;
let approachExpiresAt = 0;

export function resetNpcSocialState() {
  cooldowns.clear();
  nextGlobalAt = 0;
  approachingChild = null;
  approachExpiresAt = 0;
}

/** Who, if anyone, is currently walking over to the player. */
export function currentApproacher(now: number): string | null {
  if (approachingChild && now > approachExpiresAt) {
    approachingChild = null;
  }
  return approachingChild;
}

export function releaseApproach(name: string) {
  if (approachingChild === name) approachingChild = null;
}

/** Deterministic 0..1 from a name and a coarse time bucket. */
function roll(name: string, now: number, salt: string): number {
  let value = 0x811c9dc5;
  const input = `${salt}:${name}:${Math.floor(now / 3)}`;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return (value >>> 8) / 0xffffff;
}

const GREETINGS: Record<string, string[]> = {
  'morning-play': [
    '{name} waves you over to the building corner.',
    '{name} holds up a block tower for you to see.',
    '{name} says good morning without looking up from the blocks.',
  ],
  'art-time': [
    '{name} holds up a drawing with a proud little grin.',
    '{name} asks if you want the purple crayon.',
    '{name} shows you a very large scribble of a dog.',
  ],
  'juice-club': [
    '{name} waves from the Juice Club line.',
    '{name} asks whether the juice is the good kind today.',
    '{name} is saving a spot in the queue for you.',
  ],
  'outdoor-play': [
    '{name} calls, "Want to play?"',
    '{name} runs past and shouts that you are it.',
    '{name} points out a bug on the fence.',
  ],
  pickup: [
    '{name} gives you a quick goodbye wave.',
    '{name} is looking for their backpack.',
    '{name} says see you tomorrow.',
  ],
};

const OFFERS: string[] = [
  '{name} asks if you want to build something together.',
  '{name} wants to show you their favourite spot.',
  '{name} asks if you will be on their team.',
];

const POINTS: Record<string, string> = {
  'morning-play': '{name} points at the reading nook and says the good books are there.',
  'art-time': '{name} says there are still fresh paper sheets at the art table.',
  'juice-club': '{name} says the Juice Club counter is open.',
  'outdoor-play': '{name} says the slide is free right now.',
  pickup: '{name} says the pickup line is forming in the hallway.',
};

function pick(list: string[], name: string, now: number, salt: string): string {
  return list[Math.floor(roll(name, now, salt) * list.length) % list.length].replace(/\{name\}/g, name);
}

/**
 * Decide what, if anything, this child does about the player this frame.
 *
 * Returns 'none' far more often than not. That is the point: an NPC that reacts
 * every time you walk past stops reading as a person and starts reading as a
 * vending machine.
 */
export function decideSocialAction(context: SocialContext): SocialDecision {
  const none: SocialDecision = { action: 'none', cooldown: 0 };

  // Story always wins. Ambient chatter over a quest line is noise.
  if (context.blocked || context.questActive || !context.allowed) return none;
  if (context.now < nextGlobalAt) return none;
  if (context.now < (cooldowns.get(context.name) ?? 0)) return none;
  if (context.distance > WAVE_RANGE && context.distance > APPROACH_RANGE) return none;

  const friendship = Math.min(100, Math.max(0, context.friendship));
  // Children who know you better reach out more. This is the only place
  // friendship changes ambient behaviour, and it only ever adds warmth.
  const warmth = 0.5 + friendship / 200;

  if (context.distance <= GREET_RANGE) {
    const chance = roll(context.name, context.now, 'greet');
    if (chance < 0.55 * warmth) {
      const list = GREETINGS[context.schedule] ?? GREETINGS['morning-play'];
      return {
        action: 'greet',
        message: pick(list, context.name, context.now, 'greet-line'),
        reaction: 'wave',
        cooldown: GREET_COOLDOWN,
      };
    }
    // Sometimes a child just tells you what is going on nearby, which is more
    // useful than a hello and reads as the room being aware of itself.
    if (chance < 0.72 * warmth) {
      return {
        action: 'point-out',
        message: (POINTS[context.schedule] ?? POINTS['morning-play']).replace(/\{name\}/g, context.name),
        reaction: 'listen',
        cooldown: GREET_COOLDOWN,
      };
    }
    return none;
  }

  if (context.distance <= APPROACH_RANGE && friendship >= 20) {
    // Only one child approaches at a time, and only occasionally, so the player
    // is never swarmed.
    if (currentApproacher(context.now) === null && roll(context.name, context.now, 'approach') < 0.05 * warmth) {
      approachingChild = context.name;
      approachExpiresAt = context.now + 14;
      nextGlobalAt = context.now + GLOBAL_SOCIAL_FLOOR;
      cooldowns.set(context.name, context.now + APPROACH_COOLDOWN);
      return {
        action: 'approach',
        message: pick(OFFERS, context.name, context.now, 'offer'),
        reaction: 'cheer',
        cooldown: APPROACH_COOLDOWN,
      };
    }
  }

  if (context.distance <= WAVE_RANGE && roll(context.name, context.now, 'wave') < 0.16 * warmth) {
    // A silent wave, with no ambient message: cheap, frequent, and it fills the
    // room without adding text the player has to read.
    return { action: 'wave', reaction: 'wave', cooldown: WAVE_COOLDOWN };
  }

  return none;
}

/** Record that a decision was acted on. Kept separate so a caller can decline. */
export function commitSocialAction(name: string, now: number, decision: SocialDecision) {
  if (decision.action === 'none') return;
  cooldowns.set(name, now + decision.cooldown);
  // A silent wave does not consume the global floor; only things that speak do.
  if (decision.message) nextGlobalAt = now + GLOBAL_SOCIAL_FLOOR;
}
