import type { InputDevice } from '../core/input';
import { CAMERA_MODE_LABELS, type CameraMode } from '../vehicle/cameraRig';
import type { GearLabel } from '../vehicle/drivetrain';

const DEVICE_LABELS: Record<InputDevice, string> = {
  keyboard: '键盘',
  gamepad: '手柄',
  none: '键盘',
};

export class Hud {
  private readonly speedElement: HTMLElement;
  private readonly gearElement: HTMLElement;
  private readonly cameraElement: HTMLElement;
  private readonly deviceElement: HTMLElement;
  private lastUpdate = 0;

  constructor() {
    this.speedElement = required('#speed');
    this.gearElement = required('#gear');
    this.cameraElement = required('#camera');
    this.deviceElement = required('#device');
  }

  update(
    speedKmh: number,
    gear: GearLabel,
    camera: CameraMode,
    device: InputDevice,
  ): void {
    const now = performance.now();
    if (now - this.lastUpdate < 100) return;
    this.lastUpdate = now;

    this.speedElement.textContent = String(Math.round(speedKmh));
    this.gearElement.textContent = gear;
    this.cameraElement.textContent = CAMERA_MODE_LABELS[camera];
    this.deviceElement.textContent = DEVICE_LABELS[device];
  }
}

function required(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`HUD element ${selector} missing`);
  return element;
}
