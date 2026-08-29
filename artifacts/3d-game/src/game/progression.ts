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
  tokens: number;
  routeUnlocks: string[];
  activityRuns: Record<string, number>;
  activityRewards: Record<string, number>;
  collectibleProgress: Record<string, number>;
  vehicleProgress: Record<string, number>;
  hubUpgrades: string[];
  trustedHelperPass: boolean;
}

export const PROGRESSION_VERSION = 3;

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

function safeCountRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, count]) => [key, safeCount(count)] as const)
      .filter(([, count]) => count > 0),
  );
}

export function normalizeProgression(value: unknown): ProgressionState {
  const initial = createInitialProgression();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return initial;

  const candidate = value as Partial<ProgressionState>;
  const knownRouteIds = new Set(HUB_ROUTES.map((route) => route.id));
  const routeUnlocks = Array.isArray(candidate.routeUnlocks)
    ? Array.from(new Set(
        candidate.routeUnlocks.filter(
          (routeId): routeId is string => typeof routeId === 'string' && knownRouteIds.has(routeId),
        ),
      ))
    : [];

  const normalized: ProgressionState = {
    version: PROGRESSION_VERSION,
    reputation: safeCount(candidate.reputation, 0, 100),
    tokens: safeCount(candidate.tokens),
    routeUnlocks,
    activityRuns: safeCountRecord(candidate.activityRuns),
    activityRewards: safeCountRecord(candidate.activityRewards),
    collectibleProgress: safeCountRecord(candidate.collectibleProgress),
    vehicleProgress: safeCountRecord(candidate.vehicleProgress),
    hubUpgrades: Array.isArray(candidate.hubUpgrades)
      ? Array.from(new Set(candidate.hubUpgrades.filter((id): id is string => typeof id === 'string')))
      : [],
    trustedHelperPass: candidate.trustedHelperPass === true
      || safeCount(candidate.reputation) >= 8
      || safeCountRecord(candidate.activityRuns)['rainbow-tidy-up'] >= 1,
  };

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