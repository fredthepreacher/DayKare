import { useEffect, useRef, useState } from 'react';

/**
 * A small floating "+2" that rises off a HUD counter when it goes up.
 *
 * The game already had a reward banner for milestones, but ordinary gains -
 * serving a customer, finishing a round - moved a number silently, so the most
 * frequent rewards were the least legible.
 *
 * Deliberately restrained, and deliberately NOT a compulsion mechanic: it only
 * ever reports something that already happened, it has no streak, no timer, no
 * scarcity, and nothing is lost by ignoring it. It also never fires on a
 * DECREASE, so spending tokens is not dramatised as a loss.
 */

interface Pulse {
  id: number;
  amount: number;
}

let nextPulseId = 0;

export function RewardPulse({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const previous = useRef(value);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const delta = value - previous.current;
    previous.current = value;
    // Only gains, and only real ones: a load or a save restore can move these
    // counters by a large amount, which is a state change rather than a reward.
    if (delta <= 0 || delta > 50) return;

    const id = nextPulseId += 1;
    setPulses((current) => [...current, { id, amount: delta }].slice(-3));
    const timer = window.setTimeout(() => {
      setPulses((current) => current.filter((pulse) => pulse.id !== id));
    }, 1100);
    timers.current.push(timer);
  }, [value]);

  useEffect(() => () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  }, []);

  if (pulses.length === 0) return null;

  return (
    <span className="daykare-reward-pulse-host" aria-hidden="true">
      {pulses.map((pulse) => (
        <span key={pulse.id} className="daykare-reward-pulse">
          +{pulse.amount}{suffix}
        </span>
      ))}
    </span>
  );
}
