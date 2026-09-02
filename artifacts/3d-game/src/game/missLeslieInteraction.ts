import { HEIST_STEPS } from './finalMaster';
import { useFinalMasterStore } from './finalMasterStore';
import { useGameStore } from './store';
import { useToastStore } from './toastStore';

const debug = (event: string, detail: unknown) => {
  if (import.meta.env?.DEV) console.debug(`[DayKare heist] ${event}`, detail);
};

export function interactWithMissLeslie() {
  useFinalMasterStore.getState().recordTutorialEvent('talk-miss-leslie');
  const state = useFinalMasterStore.getState();
  const day = useGameStore.getState().dayNumber;
  const setDialogue = useGameStore.getState().setActiveDialogue;
  const step = HEIST_STEPS[Math.min(state.heistStep, HEIST_STEPS.length - 1)];
  debug('Miss Leslie interaction', { status: state.heistStatus, step: step?.id, objective: step?.objective, day });

  if (!state.tutorialComplete) {
    setDialogue({ name: 'Miss Leslie', text: 'Welcome, little rascal! Finish the tracked orientation steps, then come back and I’ll show you the Sticker Parade plan.' });
    return 'orientation' as const;
  }
  if (state.heistStatus === 'reward-choice') {
    setDialogue(null);
    useToastStore.getState().enqueue({ title: 'Choose your first-clear reward', detail: 'Select Rascal Bucks or the starter-home voucher.' });
    return 'reward-choice' as const;
  }
  if (state.heistStatus === 'active') {
    if (step.id === 'briefing') {
      state.recordHeistEvent('miss-leslie-intro');
      const next = HEIST_STEPS[useFinalMasterStore.getState().heistStep];
      setDialogue({ name: 'Miss Leslie', text: `Continue Heist — ${next.title}: ${next.objective}` });
      return 'resume' as const;
    }
    const done = step?.events.filter((event) => state.heistCompletedEvents.includes(event)).length ?? 0;
    setDialogue({ name: 'Miss Leslie', text: `Continue Heist — ${step.title}: ${step.objective} (${done}/${step.events.length})` });
    return 'resume' as const;
  }
  if (state.firstHeistComplete && state.lastReplayDay === day) {
    setDialogue({ name: 'Miss Leslie', text: 'That parade was legendary. Today’s reward is already claimed, but tomorrow I’ll have another plan ready.' });
    return 'cooldown' as const;
  }

  setDialogue({
    name: 'Miss Leslie',
    text: state.firstHeistComplete ? 'Ready for today’s Sticker Parade replay?' : 'Mia, Noah, and I have a guaranteed first heist ready. Want to see the board?',
    options: [{
      label: state.firstHeistComplete ? 'Start Daily Heist' : 'Start Sticker Parade Heist',
      action: () => {
        const live = useFinalMasterStore.getState();
        if (!live.startHeist()) {
          debug('start rejected', { status: live.heistStatus, lastReplayDay: live.lastReplayDay, day });
          useToastStore.getState().enqueue({ title: 'Heist unavailable', detail: 'Talk to Miss Leslie again for the current status.' });
          return;
        }
        useFinalMasterStore.getState().recordHeistEvent('miss-leslie-intro');
        const next = HEIST_STEPS[useFinalMasterStore.getState().heistStep];
        setDialogue({ name: 'Miss Leslie', text: `Heist started! ${next.title}: ${next.objective}` });
        debug('started', { step: next.id, objective: next.objective });
      },
    }, { label: 'Maybe later', action: () => setDialogue(null) }],
  });
  return 'available' as const;
}

export function interactWithHeistTarget(id: string) {
  const event = id.replace('final-heist-', '') as Parameters<ReturnType<typeof useFinalMasterStore.getState>['recordHeistEvent']>[0];
  const before = useFinalMasterStore.getState();
  const accepted = before.recordHeistEvent(event);
  debug('trigger', { event, accepted, phase: before.heistStep });
  if (accepted) useToastStore.getState().enqueue({ title: 'Heist objective complete', detail: event.replaceAll('-', ' '), kind: 'success' });
  return accepted;
}
