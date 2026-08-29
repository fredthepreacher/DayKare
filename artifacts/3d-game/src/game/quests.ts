export type QuestStatus = 'locked' | 'active' | 'complete';
export type ObjectiveStatus = 'pending' | 'active' | 'complete';

export interface QuestObjectiveDefinition {
  id: string;
  label: string;
  guidance: string;
}

export interface QuestDefinition {
  id: string;
  title: string;
  summary: string;
  objectives: QuestObjectiveDefinition[];
  repeatable?: boolean;
}

export interface QuestState {
  status: QuestStatus;
  currentObjectiveId: string | null;
  objectiveStates: Record<string, ObjectiveStatus>;
  completionCount: number;
}

export type QuestStates = Record<string, QuestState>;

export const QUEST_DEFINITIONS: QuestDefinition[] = [
  {
    id: 'where-binky',
    title: "Where's Binky?",
    summary: "Help Leo track down his lost favorite toy.",
    objectives: [
      { id: 'talk-to-leo', label: 'Talk to Leo', guidance: 'Leo is waiting in the main classroom.' },
      { id: 'ask-mia', label: 'Ask Mia what she saw', guidance: 'Mia remembers something near the playground.' },
      { id: 'trade-with-sam', label: 'Trade Sam a Shiny Rock', guidance: 'Sam is exploring near the playground.' },
      { id: 'search-storage', label: 'Find Binky in Storage', guidance: 'Follow the hallway to the storage boxes.' },
      { id: 'return-binky', label: 'Return Binky to Leo', guidance: 'Carry Binky back to Leo. Do not drop him.' },
    ],
  },
  {
    id: 'rainbow-tidy-up',
    title: 'Rainbow Tidy-Up',
    summary: 'Carry the misplaced toys back to the activity station.',
    repeatable: true,
    objectives: [
      { id: 'collect-blue-block', label: 'Find and carry the blue block', guidance: 'The blue block is in the classroom.' },
      { id: 'place-blue-block', label: 'Place the blue block at the station', guidance: 'Carry it to the Rainbow Tidy-Up station.' },
      { id: 'collect-red-block', label: 'Find and carry the red block', guidance: 'The red block is by the classroom rug.' },
      { id: 'place-red-block', label: 'Place the red block at the station', guidance: 'Carry it to the Rainbow Tidy-Up station.' },
      { id: 'collect-yellow-block', label: 'Find and carry the yellow block', guidance: 'The yellow block is near the reading nook.' },
      { id: 'place-yellow-block', label: 'Place the yellow block at the station', guidance: 'Carry it to the Rainbow Tidy-Up station.' },
    ],
  },
];

const definitionMap = new Map(QUEST_DEFINITIONS.map((definition) => [definition.id, definition]));

function createQuestState(definition: QuestDefinition, status: QuestStatus): QuestState {
  const objectiveStates = Object.fromEntries(
    definition.objectives.map((objective, index) => [
      objective.id,
      status === 'active' && index === 0 ? 'active' : 'pending',
    ]),
  ) as Record<string, ObjectiveStatus>;

  return {
    status,
    currentObjectiveId: status === 'active' ? definition.objectives[0]?.id ?? null : null,
    objectiveStates,
    completionCount: 0,
  };
}

export function createInitialQuests(): QuestStates {
  return {
    'where-binky': createQuestState(QUEST_DEFINITIONS[0], 'active'),
    'rainbow-tidy-up': createQuestState(QUEST_DEFINITIONS[1], 'locked'),
  };
}

export function getQuestDefinition(questId: string) {
  return definitionMap.get(questId);
}

export function getActiveQuest(states: QuestStates) {
  return QUEST_DEFINITIONS.find((definition) => states[definition.id]?.status === 'active');
}

export function getCurrentObjective(states: QuestStates, questId?: string) {
  const definition = questId
    ? getQuestDefinition(questId)
    : getActiveQuest(states);
  if (!definition) return undefined;
  const state = states[definition.id];
  if (!state?.currentObjectiveId) return undefined;
  return definition.objectives.find((objective) => objective.id === state.currentObjectiveId);
}

export function objectiveIsActive(states: QuestStates, questId: string, objectiveId: string) {
  return states[questId]?.status === 'active' && states[questId]?.currentObjectiveId === objectiveId;
}

export function advanceObjective(states: QuestStates, questId: string, objectiveId: string): QuestStates {
  const definition = getQuestDefinition(questId);
  const current = states[questId];
  if (!definition || !current || current.status !== 'active' || current.currentObjectiveId !== objectiveId) {
    return states;
  }

  const index = definition.objectives.findIndex((objective) => objective.id === objectiveId);
  if (index < 0) return states;
  const next = definition.objectives[index + 1];
  const objectiveStates = { ...current.objectiveStates, [objectiveId]: 'complete' as const };

  if (!next) {
    return {
      ...states,
      [questId]: {
        ...current,
        status: 'complete',
        currentObjectiveId: null,
        objectiveStates,
        completionCount: current.completionCount + 1,
      },
    };
  }

  return {
    ...states,
    [questId]: {
      ...current,
      currentObjectiveId: next.id,
      objectiveStates: { ...objectiveStates, [next.id]: 'active' },
    },
  };
}

export function activateQuest(states: QuestStates, questId: string): QuestStates {
  const definition = getQuestDefinition(questId);
  const current = states[questId];
  if (!definition || !current || current.status === 'complete') return states;
  return {
    ...states,
    [questId]: {
      ...current,
      status: 'active',
      currentObjectiveId: current.currentObjectiveId ?? definition.objectives[0]?.id ?? null,
      objectiveStates: Object.fromEntries(
        definition.objectives.map((objective, index) => [
          objective.id,
          current.objectiveStates[objective.id] === 'complete'
            ? 'complete'
            : current.currentObjectiveId === objective.id || (!current.currentObjectiveId && index === 0)
              ? 'active'
              : 'pending',
        ]),
      ),
    },
  };
}

export function resetRepeatableQuest(states: QuestStates, questId: string): QuestStates {
  const definition = getQuestDefinition(questId);
  const current = states[questId];
  if (!definition || !current || !definition.repeatable) return states;
  return {
    ...states,
    [questId]: {
      ...createQuestState(definition, 'active'),
      completionCount: current.completionCount,
    },
  };
}

function validObjectiveStates(definition: QuestDefinition, state: unknown): QuestState {
  const candidate = state && typeof state === 'object' ? state as Partial<QuestState> : {};
  const rawObjectives = candidate.objectiveStates && typeof candidate.objectiveStates === 'object'
    ? candidate.objectiveStates as Record<string, unknown>
    : {};
  const objectiveStates = Object.fromEntries(
    definition.objectives.map((objective) => [
      objective.id,
      rawObjectives[objective.id] === 'complete' || rawObjectives[objective.id] === 'active'
        ? rawObjectives[objective.id]
        : 'pending',
    ]),
  ) as Record<string, ObjectiveStatus>;
  const status: QuestStatus = candidate.status === 'complete' || candidate.status === 'active'
    ? candidate.status
    : 'locked';
  let currentObjectiveId = typeof candidate.currentObjectiveId === 'string'
    && definition.objectives.some((objective) => objective.id === candidate.currentObjectiveId)
    ? candidate.currentObjectiveId
    : null;
  const completionCount = typeof candidate.completionCount === 'number' && Number.isFinite(candidate.completionCount)
    ? Math.max(0, Math.floor(candidate.completionCount))
    : 0;
  if (status === 'active') {
    const firstIncomplete = definition.objectives.find((objective) => objectiveStates[objective.id] !== 'complete');
    currentObjectiveId = currentObjectiveId && objectiveStates[currentObjectiveId] !== 'complete'
      ? currentObjectiveId
      : firstIncomplete?.id ?? definition.objectives[0]?.id ?? null;
    definition.objectives.forEach((objective) => {
      if (objectiveStates[objective.id] !== 'complete') {
        objectiveStates[objective.id] = objective.id === currentObjectiveId ? 'active' : 'pending';
      }
    });
  } else {
    currentObjectiveId = null;
  }
  return { status, currentObjectiveId, objectiveStates, completionCount };
}

export function normalizeQuestStates(value: unknown, legacyBinkyStatus?: string, inventory: string[] = []): QuestStates {
  const initial = createInitialQuests();
  const candidate = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const normalized = Object.fromEntries(
    QUEST_DEFINITIONS.map((definition) => [
      definition.id,
      validObjectiveStates(definition, candidate[definition.id]),
    ]),
  ) as QuestStates;

  // Legacy saves predate objective state. Preserve their furthest verified Binky step.
  const legacyIndex: Record<string, number> = {
    'not-started': -1,
    'talked-to-owner': 1,
    'found-clue': 2,
    'traded-info': 3,
    found: 4,
    'returned-good': 5,
    'returned-bad': 2,
  };
  if (legacyBinkyStatus && (!candidate['where-binky'] || normalized['where-binky'].status === 'locked')) {
    const index = legacyIndex[legacyBinkyStatus] ?? -1;
    const definition = QUEST_DEFINITIONS[0];
    const binky = createQuestState(definition, index < 0 ? 'active' : index >= 5 ? 'complete' : 'active');
    const objectiveStates: Record<string, ObjectiveStatus> = {};
    definition.objectives.forEach((objective, objectiveIndex) => {
      objectiveStates[objective.id] = objectiveIndex < index ? 'complete' : objectiveIndex === index ? 'active' : 'pending';
    });
    binky.objectiveStates = objectiveStates;
    binky.currentObjectiveId = index >= 5 ? null : definition.objectives[Math.max(0, index)]?.id ?? null;
    binky.completionCount = index >= 5 ? 1 : 0;
    normalized['where-binky'] = binky;
  }

  if (legacyBinkyStatus === 'returned-good' || normalized['where-binky'].status === 'complete') {
    normalized['rainbow-tidy-up'] = activateQuest(normalized, 'rainbow-tidy-up')['rainbow-tidy-up'];
  }
  if (legacyBinkyStatus === 'found' && !inventory.includes('binky')) {
    // The store adds the actual recovery world item; this keeps migration deterministic.
    normalized['where-binky'].currentObjectiveId = 'return-binky';
    normalized['where-binky'].objectiveStates = {
      ...normalized['where-binky'].objectiveStates,
      'search-storage': 'complete',
      'return-binky': 'active',
    };
  }
  return { ...initial, ...normalized };
}

export function legacyStatusForQuest(states: QuestStates): string {
  const binky = states['where-binky'];
  if (!binky) return 'not-started';
  const ordered = ['talk-to-leo', 'ask-mia', 'trade-with-sam', 'search-storage', 'return-binky'];
  if (binky.status === 'complete') return 'returned-good';
  const index = ordered.indexOf(binky.currentObjectiveId ?? '');
  if (index === 0) return 'not-started';
  if (index === 1) return 'talked-to-owner';
  if (index === 2) return 'found-clue';
  if (index === 3) return 'traded-info';
  return 'found';
}