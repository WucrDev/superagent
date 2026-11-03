import { applyDeadzone, clamp } from './math';

export interface DrivingInput {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  /** True only on the frame the reset control is pressed. */
  reset: boolean;
}

export type InputDevice = 'keyboard' | 'gamepad' | 'none';

export interface InputSettings {
  deadzone: number;
  steerSensitivity: number;
}

const DRIVING_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyR',
  'ArrowUp',
  'ArrowLeft',
  'ArrowDown',
  'ArrowRight',
  'Space',
]);

/**
 * Web equivalent of an input map: keyboard + mouse wheel (camera) + Gamepad API.
 * Gamepad values win when they are active; keyboard remains usable at all times.
 */
export class InputManager {
  private readonly keys = new Set<string>();
  private readonly settings: InputSettings;
  private lastDevice: InputDevice = 'keyboard';
  private resetHeld = false;

  constructor(settings: InputSettings) {
    this.settings = {
      deadzone: clamp(settings.deadzone, 0, 0.9),
      steerSensitivity: settings.steerSensitivity,
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  get device(): InputDevice {
    return this.lastDevice;
  }

  sample(): DrivingInput {
    const pad = this.getGamepad();

    const padSteerRaw = pad ? (pad.axes[0] ?? 0) : 0;
    const padSteer =
      Math.abs(padSteerRaw) > this.settings.deadzone
        ? applyDeadzone(padSteerRaw, this.settings.deadzone) * this.settings.steerSensitivity
        : 0;
    const padThrottle = pad ? (pad.buttons[7]?.value ?? 0) : 0;
    const padBrake = pad ? (pad.buttons[6]?.value ?? 0) : 0;
    const padHandbrake = pad ? (pad.buttons[0]?.value ?? 0) > 0.5 : false;
    const padReset = pad ? (pad.buttons[9]?.value ?? 0) > 0.5 : false;

    const keyThrottle = this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0;
    const keyBrake = this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0;
    const keySteer =
      (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
      (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    const keyHandbrake = this.keys.has('Space');
    const keyReset = this.keys.has('KeyR');

    const gamepadActive =
      padSteer !== 0 || padThrottle > 0.02 || padBrake > 0.02 || padHandbrake || padReset;
    const keyboardActive =
      keyThrottle > 0 || keyBrake > 0 || keySteer !== 0 || keyHandbrake || keyReset;
    if (gamepadActive) this.lastDevice = 'gamepad';
    else if (keyboardActive) this.lastDevice = 'keyboard';

    const steer =
      Math.abs(padSteer) > Math.abs(keySteer * this.settings.steerSensitivity)
        ? padSteer
        : keySteer * this.settings.steerSensitivity;

    // Track pad/key reset jointly: the edge is emitted once per press.
    const resetHeld = padReset || keyReset;
    const reset = resetHeld && !this.resetHeld;
    this.resetHeld = resetHeld;

    return {
      throttle: Math.max(keyThrottle, padThrottle),
      brake: Math.max(keyBrake, padBrake),
      steer: clamp(steer, -1, 1),
      handbrake: keyHandbrake || padHandbrake,
      reset,
    };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.keys.clear();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (DRIVING_KEYS.has(event.code)) {
      event.preventDefault();
      this.keys.add(event.code);
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (DRIVING_KEYS.has(event.code)) {
      event.preventDefault();
      this.keys.delete(event.code);
    }
  };

  private readonly onBlur = (): void => {
    this.keys.clear();
    this.resetHeld = false;
  };

  private getGamepad(): Gamepad | null {
    if (!navigator.getGamepads) return null;
    for (const pad of navigator.getGamepads()) {
      if (pad) return pad;
    }
    return null;
  }
}
