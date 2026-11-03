import type { InputDevice } from '../core/input';

const DEVICE_LABELS: Record<InputDevice, string> = {
  keyboard: '键盘',
  gamepad: '手柄',
  none: '键盘',
};

export class Hud {
  private readonly speedElement: HTMLElement;
  private readonly deviceElement: HTMLElement;
  private lastUpdate = 0;

  constructor() {
    const speed = document.querySelector<HTMLElement>('#speed');
    const device = document.querySelector<HTMLElement>('#device');
    if (!speed || !device) throw new Error('HUD elements missing');
    this.speedElement = speed;
    this.deviceElement = device;
  }

  update(speedKmh: number, device: InputDevice): void {
    const now = performance.now();
    if (now - this.lastUpdate < 100) return;
    this.lastUpdate = now;

    this.speedElement.textContent = String(Math.round(speedKmh));
    this.deviceElement.textContent = DEVICE_LABELS[device];
  }
}
