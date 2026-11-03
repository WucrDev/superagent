import type { InputDevice } from '../core/input';
import { CAMERA_MODE_LABELS, type CameraMode } from '../vehicle/cameraRig';
import type { Gear } from '../vehicle/drivetrain';

const DEVICE_LABELS: Record<InputDevice, string> = {
  keyboard: '键盘',
  gamepad: '手柄',
  none: '键盘',
};

/** HUD gear readout: L/H forward ranges plus the temporary reverse range. */
export const GEAR_LABELS: Record<Gear, string> = {
  L: 'L',
  H: 'H',
  R: 'R',
};

export class Hud {
  private readonly speedElement: HTMLElement;
  private readonly gearElement: HTMLElement;
  private readonly cameraElement: HTMLElement;
  private readonly deviceElement: HTMLElement;
  private readonly waterElement: HTMLElement;
  private lastUpdate = 0;

  constructor() {
    this.speedElement = required('#speed');
    this.gearElement = required('#gear');
    this.cameraElement = required('#camera');
    this.deviceElement = required('#device');
    this.waterElement = required('#water');
  }

  update(
    speedKmh: number,
    gear: Gear | 'R',
    camera: CameraMode,
    device: InputDevice,
    waterDepth: number,
  ): void {
    const now = performance.now();
    if (now - this.lastUpdate < 100) return;
    this.lastUpdate = now;

    this.speedElement.textContent = String(Math.round(speedKmh));
    this.gearElement.textContent = GEAR_LABELS[gear];
    this.cameraElement.textContent = CAMERA_MODE_LABELS[camera];
    this.deviceElement.textContent = DEVICE_LABELS[device];

    if (waterDepth > 0.5) {
      this.waterElement.hidden = false;
      this.waterElement.textContent = '深水 80 cm · 动力 -40% · 尽快驶出（进水后 10 s 恢复）';
    } else if (waterDepth > 0.05) {
      this.waterElement.hidden = false;
      this.waterElement.textContent = '浅水 40 cm';
    } else {
      this.waterElement.hidden = true;
    }
  }
}

function required(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`HUD element ${selector} missing`);
  return element;
}
