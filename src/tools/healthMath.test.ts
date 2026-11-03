import { describe, expect, it } from 'vitest';
import {
  JACK,
  VEHICLE_HEALTH,
  applyDamage,
  applyRepair,
  damageFromImpact,
  healthLevel,
  healthWarning,
  jackAvailability,
  powerFactorFor,
  steerFactorFor,
} from './healthMath';

describe('W4 vehicle health', () => {
  it('only damages above the impact threshold and caps per event', () => {
    expect(damageFromImpact(0)).toBe(0);
    expect(damageFromImpact(VEHICLE_HEALTH.impactForceThreshold)).toBe(0);
    expect(damageFromImpact(VEHICLE_HEALTH.impactForceThreshold + 1000)).toBe(1);
    expect(damageFromImpact(1_000_000)).toBe(VEHICLE_HEALTH.maxImpactDamagePerEvent);
  });

  it('keeps full power and steering until health drops below 50', () => {
    expect(powerFactorFor(100)).toBe(1);
    expect(powerFactorFor(50)).toBe(1);
    expect(powerFactorFor(40)).toBeLessThan(1);
    expect(powerFactorFor(40)).toBeGreaterThan(VEHICLE_HEALTH.minPower);
    expect(steerFactorFor(40)).toBeLessThan(1);
    expect(steerFactorFor(0)).toBeCloseTo(VEHICLE_HEALTH.minSteer, 6);
  });

  it('never kills the car: a wrecked vehicle still has power and steering', () => {
    expect(powerFactorFor(0)).toBeGreaterThan(0.5);
    expect(steerFactorFor(0)).toBeGreaterThan(0.5);
  });

  it('clamps damage and repair to 0..100', () => {
    expect(applyDamage(10, 50)).toBe(0);
    expect(applyDamage(100, 0)).toBe(100);
    expect(applyRepair(80, 35)).toBe(100);
    expect(applyRepair(10, VEHICLE_HEALTH.repairPerKit)).toBe(45);
  });

  it('labels low and critical health and explains the loss', () => {
    expect(healthLevel(100)).toBe('ok');
    expect(healthLevel(45)).toBe('low');
    expect(healthLevel(20)).toBe('critical');
    expect(healthWarning(100)).toBe('');
    expect(healthWarning(40)).toContain('动力 -');
    expect(healthWarning(40)).toContain('转向 -');
  });

  it('allows the jack on flat ground and refuses steep slopes with a reason', () => {
    expect(jackAvailability(8).ok).toBe(true);
    const steep = jackAvailability(22);
    expect(steep.ok).toBe(false);
    expect(steep.reason).toContain('22°');
    expect(steep.reason).toContain('15°');
    expect(steep.reason).not.toBe('');
    expect(jackAvailability(Number.NaN).ok).toBe(false);
  });

  it('uses the documented 3 s jack time and +35 repair', () => {
    expect(JACK.rightingTime).toBe(3);
    expect(VEHICLE_HEALTH.repairPerKit).toBe(35);
    expect(VEHICLE_HEALTH.repairTime).toBe(2);
  });
});
