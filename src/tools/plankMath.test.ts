import { describe, expect, it } from 'vitest';
import { PLANK, planPlank, plankSagFor, plankSupports } from './plankMath';

describe('W4 plank bridge placement', () => {
  it('places the board 4.4 m ahead with its ends 2 m either side', () => {
    const supports = plankSupports(0, 0, 0);
    expect(supports.center.z).toBeCloseTo(PLANK.ahead, 6);
    expect(supports.near.z).toBeCloseTo(PLANK.ahead - 2, 6);
    expect(supports.far.z).toBeCloseTo(PLANK.ahead + 2, 6);
    expect(supports.center.x).toBeCloseTo(0, 6);
  });

  it('accepts level ground under both ends', () => {
    const placement = planPlank(0, 0, 0, 0, 0);
    expect(placement.ok).toBe(true);
    if (!placement.ok) return;
    expect(placement.pose.centerY).toBeCloseTo(PLANK.thickness / 2, 6);
    expect(placement.pose.pitch).toBeCloseTo(0, 6);
  });

  it('refuses a missing support without consuming a plank (support reason)', () => {
    const placement = planPlank(0, 0, 0, 0, null);
    expect(placement.ok).toBe(false);
    if (placement.ok) return;
    expect(placement.reason).toBe('support');
    expect(placement.message).toContain('受力点');
    expect(placement.pose).toBeNull();
  });

  it('reports a diagonal/dropped placement as a slip over a big height gap', () => {
    // A 30° ramp across the 4 m board: ends differ by ~2.3 m.
    const placement = planPlank(0, 0, 0, 0, 2.3);
    expect(placement.ok).toBe(false);
    if (placement.ok) return;
    expect(placement.reason).toBe('slip');
    expect(placement.message).toContain('2.3 m');
    expect(placement.message).toContain('打滑');
    expect(placement.pose).not.toBeNull();
  });

  it('tolerates a small height difference and tilts the board', () => {
    const placement = planPlank(0, 0, 0, 0.1, 0.5);
    expect(placement.ok).toBe(true);
    if (!placement.ok) return;
    expect(placement.pose.centerY).toBeCloseTo(0.3 + PLANK.thickness / 2, 6);
    expect(placement.pose.pitch).toBeLessThan(0);
  });

  it('sags only while the car is over the board', () => {
    const placement = planPlank(0, 0, 0, 0, 0);
    expect(placement.ok).toBe(true);
    if (!placement.ok) return;
    const { pose } = placement;
    expect(plankSagFor(pose.centerX, pose.centerZ, pose, 0)).toBeGreaterThan(0);
    expect(plankSagFor(pose.centerX, pose.centerZ + 8, pose, 0)).toBe(0);
    expect(plankSagFor(pose.centerX + 2, pose.centerZ, pose, 0)).toBe(0);
  });
});
