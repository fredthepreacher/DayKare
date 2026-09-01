export interface StandardGamepadActions {
  x: number;
  y: number;
  run: boolean;
  crouch: boolean;
  jump: boolean;
  interact: boolean;
  journal: boolean;
}

type ButtonLike = { pressed?: boolean; value?: number };
type GamepadLike = { axes: readonly number[]; buttons: readonly ButtonLike[] };

const deadzone = (value: number) => Math.abs(value) < 0.16 ? 0 : Math.max(-1, Math.min(1, value));

/** Standard Gamepad API mapping shared by Xbox, PlayStation and generic pads. */
export function mapStandardGamepad(pad: GamepadLike): StandardGamepadActions {
  return {
    x: deadzone(pad.axes[0] ?? 0),
    y: deadzone(pad.axes[1] ?? 0),
    run: Boolean(pad.buttons[10]?.pressed || (pad.buttons[7]?.value ?? 0) > 0.45),
    crouch: Boolean(pad.buttons[1]?.pressed),
    jump: Boolean(pad.buttons[2]?.pressed),
    interact: Boolean(pad.buttons[0]?.pressed),
    journal: Boolean(pad.buttons[3]?.pressed),
  };
}
