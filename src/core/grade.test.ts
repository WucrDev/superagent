import { describe, expect, it } from 'vitest';
import { GAME_GRADE_INDEX, LOCKED_GRADE, PHOTO_FILTERS, type PhotoFilter } from './grade';

/**
 * W5.1: these values are the in-game colour grade. They are locked to the three
 * target shots in `docs/target-shots/`; see `docs/w5-color-lock.md`. Changing a
 * number here is a style change and needs a new target review, not a test edit.
 */
describe('W5.1 locked in-game grade', () => {
  it('keeps the target-locked values', () => {
    expect(LOCKED_GRADE).toEqual({
      id: 'neutral',
      label: '原片',
      grain: 0.018,
      vignette: 0.24,
      saturation: 1.02,
      contrast: 1.03,
      lift: [-0.004, 0.002, 0.008],
      gain: [1.03, 1.0, 0.97],
    });
  });

  it('is photo filter 0, so gameplay and photo mode "原片" share one look', () => {
    expect(GAME_GRADE_INDEX).toBe(0);
    expect(PHOTO_FILTERS[0]).toBe(LOCKED_GRADE);
    expect(PHOTO_FILTERS).toHaveLength(5);
  });

  it('cannot be mutated at runtime', () => {
    expect(Object.isFrozen(LOCKED_GRADE)).toBe(true);
    expect(Object.isFrozen(LOCKED_GRADE.lift)).toBe(true);
    expect(Object.isFrozen(LOCKED_GRADE.gain)).toBe(true);
    expect(Object.isFrozen(PHOTO_FILTERS)).toBe(true);
    for (const filter of PHOTO_FILTERS) {
      expect(Object.isFrozen(filter)).toBe(true);
      expect(Object.isFrozen(filter.lift)).toBe(true);
      expect(Object.isFrozen(filter.gain)).toBe(true);
    }
    expect(() => (LOCKED_GRADE as { grain: number }).grain = 1).toThrow();
    expect(() => (PHOTO_FILTERS as PhotoFilter[]).push(LOCKED_GRADE)).toThrow();
  });

  it('keeps the target split-tone direction: warm highlights, cool shadows', () => {
    // The target shots show warm dusk/cockpit highlights and cool night shadows.
    expect(LOCKED_GRADE.gain[0]).toBeGreaterThan(LOCKED_GRADE.gain[2]);
    expect(LOCKED_GRADE.lift[2]).toBeGreaterThan(LOCKED_GRADE.lift[0]);
    expect(LOCKED_GRADE.grain).toBeGreaterThan(0);
    expect(LOCKED_GRADE.vignette).toBeGreaterThan(0);
    expect(LOCKED_GRADE.vignette).toBeLessThan(0.5);
    expect(LOCKED_GRADE.saturation).toBeGreaterThan(0.9);
    expect(LOCKED_GRADE.saturation).toBeLessThan(1.1);
    expect(LOCKED_GRADE.contrast).toBeGreaterThan(0.95);
    expect(LOCKED_GRADE.contrast).toBeLessThan(1.15);
  });
});
