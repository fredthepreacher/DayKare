export interface GameplayGateState {
  journalOpen: boolean;
  activeDialogue: unknown;
  zoneTransitioning: boolean;
}

export function isGameplayBlocked(state: GameplayGateState) {
  return state.journalOpen || state.activeDialogue !== null || state.zoneTransitioning;
}