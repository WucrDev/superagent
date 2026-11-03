import { clamp } from './math';

interface RumbleActuator {
  playEffect?: (
    type: 'dual-rumble',
    effect: {
      startDelay: number;
      duration: number;
      weakMagnitude: number;
      strongMagnitude: number;
    },
  ) => Promise<unknown>;
}

/**
 * W3 #19: gamepad rumble for rope load and the snap pulse.
 *
 * The Gamepad vibration API is Chromium-only and may be absent (desktop
 * keyboard, Firefox, headless). Everything degrades to a no-op; keyboard still
 * completes every winch action. Updates are throttled because some drivers
 * queue effects and rumble faster than 20 Hz feels like noise.
 */
export class Haptics {
  private lastUpdate = 0;
  private lastIntensity = -1;
  private pulseUntil = 0;

  update(intensity: number): void {
    const now = performance.now();
    if (now < this.pulseUntil) return;
    if (now - this.lastUpdate < 80 && Math.abs(intensity - this.lastIntensity) < 0.08) {
      return;
    }
    this.lastUpdate = now;
    this.lastIntensity = intensity;
    this.play(clamp(intensity, 0, 1) * 0.55, clamp(intensity, 0, 1) * 0.2, 140);
  }

  /** One strong pulse for a rope snap or anchor failure. */
  pulse(strength = 1): void {
    const now = performance.now();
    this.pulseUntil = now + 220;
    this.play(0.4 * strength, strength, 200);
  }

  private play(weakMagnitude: number, strongMagnitude: number, duration: number): void {
    const actuator = this.actuator();
    if (!actuator?.playEffect) return;
    void actuator
      .playEffect('dual-rumble', {
        startDelay: 0,
        duration,
        weakMagnitude,
        strongMagnitude,
      })
      .catch(() => {
        // Browser refused the effect (no gesture / unsupported): stay silent.
      });
  }

  private actuator(): RumbleActuator | null {
    if (!navigator.getGamepads) return null;
    for (const pad of navigator.getGamepads()) {
      if (!pad) continue;
      const actuator = (pad as Gamepad & { vibrationActuator?: RumbleActuator })
        .vibrationActuator;
      if (actuator) return actuator;
    }
    return null;
  }
}
