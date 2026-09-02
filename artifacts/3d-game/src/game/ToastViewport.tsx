import { useEffect, useRef } from 'react';
import { rankFromLifetimeXp } from './progression';
import { useGameStore } from './store';
import { TOAST_FADE_MS, TOAST_VISIBLE_MS, useToastStore } from './toastStore';

export function ToastViewport() {
  const { active, fading, beginFade, dismiss, enqueue } = useToastStore();
  const ambient = useGameStore((state) => state.ambientMessage);
  const experience = useGameStore((state) => state.progression.experience ?? 0);
  const previousRank = useRef(rankFromLifetimeXp(experience).rank);
  useEffect(() => {
    if (!ambient) return;
    enqueue({ title: ambient });
    useGameStore.getState().setAmbientMessage(null);
  }, [ambient, enqueue]);
  useEffect(() => {
    const next = rankFromLifetimeXp(experience).rank;
    if (next > previousRank.current) enqueue({ title: 'RANK UP!', detail: `Rank ${previousRank.current} → Rank ${next}`, kind: 'rank' });
    previousRank.current = next;
  }, [experience, enqueue]);
  useEffect(() => {
    if (!active) return undefined;
    const fade = window.setTimeout(beginFade, TOAST_VISIBLE_MS);
    const remove = window.setTimeout(dismiss, TOAST_VISIBLE_MS + TOAST_FADE_MS);
    return () => { window.clearTimeout(fade); window.clearTimeout(remove); };
  }, [active?.id, beginFade, dismiss]);
  if (!active) return null;
  return <button type="button" className={`game-toast ${fading ? 'is-fading' : ''} ${active.kind === 'rank' ? 'is-rank' : ''}`} onClick={dismiss} data-testid="game-toast"><strong>{active.title}</strong>{active.detail && <span>{active.detail}</span>}</button>;
}
