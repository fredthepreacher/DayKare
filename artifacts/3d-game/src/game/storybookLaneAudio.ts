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
  playAssetSfx(`audio/storybook-lane/${FILES[sound]}`, volume / 0.45);
}
import { playAssetSfx } from './audioDirector';
