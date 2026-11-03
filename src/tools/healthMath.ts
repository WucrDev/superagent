import { clamp } from '../core/math';

/**
 * W4 #17 / issue #23: vehicle health, damage and repair numbers.
 * W4 #16 / issue #22: jack righting rules.
 *
 * Damage is deliberately survivable: the health floor only takes power and
 * steering down to 65 % / 70 %, so a badly damaged car still drives home. The
 * prototype never "kills" the player.
 */
export const VEHICLE_HEALTH = {
  max: 100,
  /** Below this the engine and steering start to degrade. */
  lowThreshold: 50,
  /** Health restored per repair kit. */
  repairPerKit: 35,
  /** Seconds of repair animation before the kit is consumed. */
  repairTime: 2,
  /** Kit count available at the start of a run (more can be picked up). */
  startKits: 1,
  /** Hard landing / crash contact force that starts causing damage (N). */
  impactForceThreshold: 38000,
  /** Damage per newton above the threshold. */
  impactDamageScale: 0.0006,
  /** Cap per contact event so one violent frame cannot wipe the car. */
  maxImpactDamagePerEvent: 22,
  /** Minimum time between impact damage events (s). */
  impactCooldown: 0.4,
  /** Slowest speed at which a repair can be started (km/h). */
  repairMaxSpeedKmh: 3,
  /** The engine starts smoking below this. */
  smokeThreshold: 35,
  /** Minimum power multiplier at 0 health. */
  minPower: 0.65,
  /** Minimum steering multiplier at 0 health. */
  minSteer: 0.7,
} as const;

export const JACK = {
  /** Seconds to right the car with the hydraulic jack. */
  rightingTime: 3,
  /** The jack needs a reasonably level spot (degrees). */
  maxSlopeDeg: 15,
} as const;

export interface JackAvailability {
  ok: boolean;
  /** Player-facing reason when the jack cannot be used. */
  reason: string;
}

/** Is the current ground slope flat enough to jack the car upright? */
export function jackAvailability(slopeDeg: number): JackAvailability {
  if (!Number.isFinite(slopeDeg)) {
    return { ok: false, reason: '地面坡度未知 · 千斤顶不敢用，先开回平地' };
  }
  if (slopeDeg > JACK.maxSlopeDeg) {
    return {
      ok: false,
      reason: `坡度 ${slopeDeg.toFixed(0)}° > ${JACK.maxSlopeDeg}° · 千斤顶会滑，先开到平处`,
    };
  }
  return { ok: true, reason: '' };
}

/** Damage caused by one chassis contact-force event. */
export function damageFromImpact(force: number): number {
  if (!Number.isFinite(force)) return 0;
  const excess = force - VEHICLE_HEALTH.impactForceThreshold;
  if (excess <= 0) return 0;
  return Math.min(
    VEHICLE_HEALTH.maxImpactDamagePerEvent,
    Math.max(1, excess * VEHICLE_HEALTH.impactDamageScale),
  );
}

/** 1 while healthy; falls smoothly to minPower at 0 health. */
export function powerFactorFor(health: number): number {
  const value = clamp(health, 0, VEHICLE_HEALTH.max);
  if (value >= VEHICLE_HEALTH.lowThreshold) return 1;
  const t = value / VEHICLE_HEALTH.lowThreshold;
  return VEHICLE_HEALTH.minPower + (1 - VEHICLE_HEALTH.minPower) * t;
}

/** 1 while healthy; falls smoothly to minSteer at 0 health. */
export function steerFactorFor(health: number): number {
  const value = clamp(health, 0, VEHICLE_HEALTH.max);
  if (value >= VEHICLE_HEALTH.lowThreshold) return 1;
  const t = value / VEHICLE_HEALTH.lowThreshold;
  return VEHICLE_HEALTH.minSteer + (1 - VEHICLE_HEALTH.minSteer) * t;
}

export function applyDamage(health: number, amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return clamp(health, 0, VEHICLE_HEALTH.max);
  return clamp(health - amount, 0, VEHICLE_HEALTH.max);
}

export function applyRepair(
  health: number,
  amount: number = VEHICLE_HEALTH.repairPerKit,
): number {
  if (!Number.isFinite(amount) || amount <= 0) return clamp(health, 0, VEHICLE_HEALTH.max);
  return clamp(health + amount, 0, VEHICLE_HEALTH.max);
}

export type HealthLevel = 'ok' | 'low' | 'critical';

export function healthLevel(health: number): HealthLevel {
  if (health >= VEHICLE_HEALTH.lowThreshold) return 'ok';
  if (health >= 25) return 'low';
  return 'critical';
}

export function healthWarning(health: number): string {
  const level = healthLevel(health);
  if (level === 'ok') {
    return '';
  }
  const powerLoss = Math.round((1 - powerFactorFor(health)) * 100);
  const steerLoss = Math.round((1 - steerFactorFor(health)) * 100);
  return `车损 · 动力 -${powerLoss}% · 转向 -${steerLoss}% · 维修包 +${VEHICLE_HEALTH.repairPerKit}`;
}
