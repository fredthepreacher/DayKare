export enum Controls {
  forward = 'forward',
  back = 'back',
  left = 'left',
  right = 'right',
  jump = 'jump',
  run = 'run',
  crouch = 'crouch',
  interact = 'interact',
  journal = 'journal',
}

export const keyMap = [
  { name: Controls.forward, keys: ['ArrowUp', 'KeyW'] },
  { name: Controls.back, keys: ['ArrowDown', 'KeyS'] },
  { name: Controls.left, keys: ['ArrowLeft', 'KeyA'] },
  { name: Controls.right, keys: ['ArrowRight', 'KeyD'] },
  { name: Controls.jump, keys: ['Space'] },
  { name: Controls.run, keys: ['ShiftLeft', 'ShiftRight'] },
  { name: Controls.crouch, keys: ['KeyC'] },
  { name: Controls.interact, keys: ['KeyE'] },
  { name: Controls.journal, keys: ['KeyJ', 'Tab'] },
];
