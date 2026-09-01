const FILES = {
  arrival: 'storybook_lane_arrival_chime.wav',
  purchase: 'icecream_purchase_pop.wav',
  warning: 'sugar_sick_warning.wav',
  flop: 'sugar_sick_flop.wav',
  recovery: 'recovery_twinkle.wav',
  trike: 'trike_bell.wav',
  rideOn: 'mini_rideon_beep.wav',
  pet: 'pet_happy_chirp.wav',
} as const;

export type StorybookSound = keyof typeof FILES;

export function playStorybookSound(sound: StorybookSound, volume = 0.45) {
  if (typeof Audio === 'undefined') return;
  try {
    const audio = new Audio(`${import.meta.env.BASE_URL}audio/storybook-lane/${FILES[sound]}`);
    audio.volume = Math.max(0, Math.min(1, volume));
    void audio.play().catch(() => undefined);
  } catch {
    // Audio is a non-blocking enhancement. Gameplay must survive a missing file
    // or a browser that has not granted playback permission yet.
  }
}
