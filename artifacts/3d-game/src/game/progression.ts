export type RouteRequirementKind = 'reputation' | 'activity-runs' | 'tokens';

export interface RouteDefinition {
  id: string;
  label: string;
  subtitle: string;
  description: string;
  position: [number, number, number];
  color: string;
  requirement: {
    kind: RouteRequirementKind;
    value: number;
  };
}

export interface ProgressionState {
  version: number;
  reputation: number;
  /** Lifetime gameplay XP. Kept separate from spendable Star Tokens. */
  experience?: number;
  tokens: number;
  routeUnlocks: string[];
  activityRuns: Record<string, number>;
  activityRewards: Record<string, number>;
  collectibleProgress: Record<string, number>;
  vehicleProgress: Record<string, number>;
  hubUpgrades: string[];
  trustedHelperPass: boolean;
}

export const PROGRESSION_VERSION = 4;
/**
 * Reputation ceiling.
 *
 * This was 100, which predates the Drip economy. The authored catalog's tiers -
 * Starter 0-99, Known Kid 100-249, Popular Kid 250-499, DayKare Legend 500+ -
 * and its top item at 750 REP are all unreachable under a cap of 100, so three
 * of the four tiers could never be entered and half the catalog could never be
 * bought at any price.
 *
 * Raising the ceiling is purely additive: every existing save holds at most 100,
 * every existing gate (the Garden route needs 10) is untouched, and nothing
 * reads reputation as a percentage.
 *
 * See the delivery notes on earn rates - the ceiling is now reachable in
 * principle, which is a different question from whether it is reachable in a
 * reasonable number of sessions.
 */
export const MAX_REPUTATION = 1000;

export const MAX_TOKENS = 999_999;
export const MAX_EXPERIENCE = 9_999_999;
export const MAX_ACTIVITY_RUNS = 99_999;

export interface RankProgress {
  rank: number;
  xpIntoRank: number;
  xpForNextRank: number;
}

export function xpRequiredForNextRank(currentRank: number) {
  if (currentRank < 10) return 100;
  if (currentRank < 30) return 120;
  return 140;
}

/** Lifetime XP is persisted; Rank and overflow are derived deterministically. */
export function rankFromLifetimeXp(lifetimeXp: number): RankProgress {
  let remaining = Math.max(0, Math.min(MAX_EXPERIENCE, Math.floor(Number.isFinite(lifetimeXp) ? lifetimeXp : 0)));
  let rank = 1;
  while (remaining >= xpRequiredForNextRank(rank)) {
    remaining -= xpRequiredForNextRank(rank);
    rank += 1;
  }
  return { rank, xpIntoRank: remaining, xpForNextRank: xpRequiredForNextRank(rank) };
}

export function addLifetimeXp(current: number | undefined, amount: number) {
  const experience = Math.min(MAX_EXPERIENCE, Math.max(0, (current ?? 0) + Math.trunc(Number.isFinite(amount) ? amount : 0)));
  return { experience, ...rankFromLifetimeXp(experience) };
}

export const ACTIVITY_DEFINITIONS = {
  'rainbow-tidy-up': { tokenReward: 2, reputationReward: 2 },
  'juice-club-service': { tokenReward: 1, reputationReward: 1 },
  'garden-planting': { tokenReward: 2, reputationReward: 1 },
  'art-activity': { tokenReward: 0, reputationReward: 0 },
  'show-and-tell': { tokenReward: 0, reputationReward: 2 },
} as const;

export type ActivityId = keyof typeof ACTIVITY_DEFINITIONS;

export const HUB_UPGRADE_IDS = ['storage-organizer'] as const;

export const HUB_ROUTES: RouteDefinition[] = [
  {
    id: 'garden-district',
    label: 'Garden District',
    subtitle: 'A quiet path beyond the east gate',
    description: 'A connected garden of winding paths, flower beds, a pond, and sunny places to explore.',
    position: [14, 0, -13],
    color: '#4d9a73',
    requirement: { kind: 'reputation', value: 10 },
  },
  {
    id: 'storybook-lane',
    label: 'Storybook Lane',
    subtitle: 'A story trail beyond the art room',
    description: 'A future storybook district where drawings become places to explore.',
    position: [-14, 0, -13],
    color: '#8a63c7',
    requirement: { kind: 'activity-runs', value: 3 },
  },
  {
    id: 'maker-market',
    label: 'Maker Market',
    subtitle: 'A weekend route past the playground',
    description: 'A future maker district for trading crafts, stickers, and clever inventions.',
    position: [14, 0, 13],
    color: '#d37b3d',
    requirement: { kind: 'tokens', value: 25 },
  },
];

export const createInitialProgression = (): ProgressionState => ({
  version: PROGRESSION_VERSION,
  reputation: 0,
  experience: 0,
  tokens: 0,
  routeUnlocks: [],
  activityRuns: {},
  activityRewards: {},
  collectibleProgress: {},
  vehicleProgress: {},
  hubUpgrades: [],
  trustedHelperPass: false,
});

function safeCount(value: unknown, fallback = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(maximum, Math.max(0, Math.floor(value)))
    : fallback;
}

function safeCountRecord(
  value: unknown,
  knownKeys?: ReadonlySet<string>,
  maximum = Number.MAX_SAFE_INTEGER,
): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, count]) => [key, safeCount(count)] as const)
      .filter(([key, count]) => (
        count > 0 && (!knownKeys || knownKeys.has(key))
      ))
      .map(([key, count]) => [key, Math.min(maximum, count)] as const),
  );
}

export function normalizeProgression(value: unknown): ProgressionState {
  const initial = createInitialProgression();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return initial;

  const candidate = value as Partial<ProgressionState>;
  const knownRouteIds = new Set(HUB_ROUTES.map((route) => route.id));
  const knownActivityIds = new Set<ActivityId>(Object.keys(ACTIVITY_DEFINITIONS) as ActivityId[]);
  const knownCollectibleIds = new Set(['Shiny Rock']);
  const knownVehicleProgressIds = new Set(['tricycleRides']);
  const routeUnlocks = Array.isArray(candidate.routeUnlocks)
    ? Array.from(new Set(
        candidate.routeUnlocks.filter(
          (routeId): routeId is string => typeof routeId === 'string' && knownRouteIds.has(routeId),
        ),
      ))
    : [];

  const normalized: ProgressionState = {
    version: PROGRESSION_VERSION,
    reputation: safeCount(candidate.reputation, 0, MAX_REPUTATION),
    experience: safeCount(candidate.experience, 0, MAX_EXPERIENCE),
    tokens: safeCount(candidate.tokens, 0, MAX_TOKENS),
    routeUnlocks,
    activityRuns: safeCountRecord(candidate.activityRuns, knownActivityIds, MAX_ACTIVITY_RUNS),
    activityRewards: safeCountRecord(candidate.activityRewards, knownActivityIds, MAX_TOKENS),
    collectibleProgress: safeCountRecord(candidate.collectibleProgress, knownCollectibleIds, MAX_ACTIVITY_RUNS),
    vehicleProgress: safeCountRecord(candidate.vehicleProgress, knownVehicleProgressIds, MAX_ACTIVITY_RUNS),
    hubUpgrades: Array.isArray(candidate.hubUpgrades)
      ? Array.from(new Set(candidate.hubUpgrades.filter(
          (id): id is typeof HUB_UPGRADE_IDS[number] => (
            typeof id === 'string' && (HUB_UPGRADE_IDS as readonly string[]).includes(id)
          ),
        )))
      : [],
    trustedHelperPass: candidate.trustedHelperPass === true
      || safeCount(candidate.reputation) >= 8
      || safeCountRecord(candidate.activityRuns)['rainbow-tidy-up'] >= 1,
  };

  normalized.activityRewards = Object.fromEntries(
    Object.entries(normalized.activityRuns).map(([activityId, runs]) => [
      activityId,
      Math.min(MAX_TOKENS, runs * ACTIVITY_DEFINITIONS[activityId as ActivityId].tokenReward),
    ]),
  );

  return {
    ...normalized,
    routeUnlocks: getUnlockedRoutes(normalized),
  };
}

export function isRouteUnlocked(route: RouteDefinition, progression: ProgressionState) {
  // Route unlocks are a derived record for saves and UI history. The live
  // requirement remains authoritative so a stale or hand-edited save cannot
  // bypass a locked gate.
  return getUnlockedRoutes(progression).includes(route.id);
}

export function requirementLabel(route: RouteDefinition) {
  const { kind, value } = route.requirement;
  if (kind === 'reputation') return `${value} hub reputation`;
  if (kind === 'activity-runs') return `${value} tidy-up rounds`;
  return `${value} Star Tokens`;
}

export function getRouteRequirementProgress(route: RouteDefinition, progression: ProgressionState) {
  const { kind, value } = route.requirement;
  const current = kind === 'reputation'
    ? progression.reputation
    : kind === 'activity-runs'
      ? progression.activityRuns['rainbow-tidy-up'] ?? 0
      : progression.tokens;
  return { current: Math.min(value, Math.max(0, current)), required: value };
}

export function requirementProgressLabel(route: RouteDefinition, progression: ProgressionState) {
  const { current, required } = getRouteRequirementProgress(route, progression);
  if (route.requirement.kind === 'reputation') return `${current}/${required} hub reputation`;
  if (route.requirement.kind === 'activity-runs') return `${current}/${required} tidy-up rounds`;
  return `${current}/${required} Star Tokens`;
}

export function getUnlockedRoutes(progression: ProgressionState) {
  return HUB_ROUTES.filter((route) => {
    const { kind, value } = route.requirement;
    if (kind === 'reputation') return progression.reputation >= value;
    if (kind === 'activity-runs') return (progression.activityRuns['rainbow-tidy-up'] ?? 0) >= value;
    return progression.tokens >= value;
  }).map((route) => route.id);
}
