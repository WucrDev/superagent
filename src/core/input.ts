import { applyDeadzone, clamp } from './math';

export interface DrivingInput {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  /** True only on the frame the reset control is pressed. */
  reset: boolean;
  /** True only on the frame the shift-up control is pressed. */
  shiftUp: boolean;
  /** True only on the frame the shift-down control is pressed. */
  shiftDown: boolean;
  /** True only on the frame the camera-toggle control is pressed. */
  camera: boolean;
}

export type InputDevice = 'keyboard' | 'gamepad' | 'none';

export interface InputSettings {
  deadzone: number;
  steerSensitivity: number;
}

export interface LookDelta {
  x: number;
  y: number;
}

const DRIVING_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyE',
  'KeyC',
  'KeyR',
  'ArrowUp',
  'ArrowLeft',
  'ArrowDown',
  'ArrowRight',
  'Space',
]);

/**
 * Web equivalent of an input map: keyboard + mouse (right-drag look / wheel
 * camera zoom) + Gamepad API. Gamepad values win when they are active; keyboard
 * remains usable at all times.
 */
export class InputManager {
  private readonly keys = new Set<string>();
  private settings: InputSettings;
  private lastDevice: InputDevice = 'keyboard';
  private resetHeld = false;
  private shiftUpHeld = false;
  private shiftDownHeld = false;
  private cameraHeld = false;
  private looking = false;
  private lookDelta: LookDelta = { x: 0, y: 0 };

  constructor(settings: InputSettings) {
    this.settings = {
      deadzone: clamp(settings.deadzone, 0, 0.9),
      steerSensitivity: settings.steerSensitivity,
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('contextmenu', this.onContextMenu);
  }

  get device(): InputDevice {
    return this.lastDevice;
  }

  get currentSettings(): Readonly<InputSettings> {
    return this.settings;
  }

  setSettings(settings: InputSettings): void {
    this.settings = {
      deadzone: clamp(settings.deadzone, 0, 0.9),
      steerSensitivity: settings.steerSensitivity,
    };
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
    const padShiftUp = pad ? (pad.buttons[5]?.value ?? 0) > 0.5 : false;
    const padShiftDown = pad ? (pad.buttons[4]?.value ?? 0) > 0.5 : false;
    const padCamera = pad ? (pad.buttons[3]?.value ?? 0) > 0.5 : false;

    const keyThrottle = this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0;
    const keyBrake = this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0;
    const keySteer =
      (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
      (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    const keyHandbrake = this.keys.has('Space');
    const keyReset = this.keys.has('KeyR');
    const keyShiftUp = this.keys.has('KeyE');
    const keyShiftDown = this.keys.has('KeyQ');
    const keyCamera = this.keys.has('KeyC');

    const gamepadActive =
      padSteer !== 0 ||
      padThrottle > 0.02 ||
      padBrake > 0.02 ||
      padHandbrake ||
      padReset ||
      padShiftUp ||
      padShiftDown ||
      padCamera;
    const keyboardActive =
      keyThrottle > 0 ||
      keyBrake > 0 ||
      keySteer !== 0 ||
      keyHandbrake ||
      keyReset ||
      keyShiftUp ||
      keyShiftDown ||
      keyCamera;
    if (gamepadActive) this.lastDevice = 'gamepad';
    else if (keyboardActive) this.lastDevice = 'keyboard';

    const steer =
      Math.abs(padSteer) > Math.abs(keySteer * this.settings.steerSensitivity)
        ? padSteer
        : keySteer * this.settings.steerSensitivity;

    const shiftUpHeld = padShiftUp || keyShiftUp;
    const shiftDownHeld = padShiftDown || keyShiftDown;
    const cameraHeld = padCamera || keyCamera;
    const resetHeld = padReset || keyReset;

    const input: DrivingInput = {
      throttle: Math.max(keyThrottle, padThrottle),
      brake: Math.max(keyBrake, padBrake),
      steer: clamp(steer, -1, 1),
      handbrake: keyHandbrake || padHandbrake,
      reset: resetHeld && !this.resetHeld,
      shiftUp: shiftUpHeld && !this.shiftUpHeld,
      shiftDown: shiftDownHeld && !this.shiftDownHeld,
      camera: cameraHeld && !this.cameraHeld,
    };

    this.resetHeld = resetHeld;
    this.shiftUpHeld = shiftUpHeld;
    this.shiftDownHeld = shiftDownHeld;
    this.cameraHeld = cameraHeld;

    return input;
  }

  /** Mouse look accumulated since the previous render frame (pixels). */
  consumeMouseLook(): LookDelta {
    const delta = this.lookDelta;
    this.lookDelta = { x: 0, y: 0 };
    return delta;
  }

  /** Right-stick look axes for the current render frame, with deadzone applied. */
  gamepadLook(): LookDelta {
    const pad = this.getGamepad();
    if (!pad) return { x: 0, y: 0 };
    return {
      x: applyDeadzone(pad.axes[2] ?? 0, this.settings.deadzone),
      y: applyDeadzone(pad.axes[3] ?? 0, this.settings.deadzone),
    };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('contextmenu', this.onContextMenu);
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
    this.shiftUpHeld = false;
    this.shiftDownHeld = false;
    this.cameraHeld = false;
    this.looking = false;
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 2) return;
    event.preventDefault();
    this.looking = true;
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.looking) return;
    event.preventDefault();
    this.lookDelta.x += event.movementX;
    this.lookDelta.y += event.movementY;
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.button === 2) this.looking = false;
  };

  private readonly onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  private getGamepad(): Gamepad | null {
    if (!navigator.getGamepads) return null;
    for (const pad of navigator.getGamepads()) {
      if (pad) return pad;
    }
    return null;
  }
}
