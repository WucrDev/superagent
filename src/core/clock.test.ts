import { describe, expect, it } from 'vitest';
import { FixedStepClock } from './clock';

describe('FixedStepClock', () => {
  it('accumulates sub-step frames until a full step is reached', () => {
    const clock = new FixedStepClock(0.25);
    expect(clock.advance(0.1)).toBe(0);
    expect(clock.advance(0.1)).toBe(0);
    expect(clock.advance(0.1)).toBe(1);
    expect(clock.alpha).toBeCloseTo(0.2, 5);
  });

  it('runs exactly the number of whole steps a frame is worth', () => {
    const clock = new FixedStepClock(0.25, 0.5);
    expect(clock.advance(0.5)).toBe(2);
    expect(clock.alpha).toBeCloseTo(0, 5);
  });

  it('clamps long frames instead of running an unbounded number of steps', () => {
    const clock = new FixedStepClock(0.25, 0.5);
    expect(clock.advance(10)).toBe(2);
    expect(clock.alpha).toBeCloseTo(0, 5);
  });

  it('reset drops the remainder', () => {
    const clock = new FixedStepClock(0.25);
    clock.advance(0.1);
    clock.reset();
    expect(clock.alpha).toBe(0);
  });
});
