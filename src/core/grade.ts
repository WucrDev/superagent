/**
 * W5.1 / #21: the in-game colour grade is locked to the three target shots in
 * `docs/target-shots/`.
 *
 * The targets are not concept art: they were captured from this build's photo
 * mode, and the cockpit target reproduces this fixed grade at the spawn
 * cockpit. The lock freezes the base in-game grade; per-shot photo filters are
 * a separate look-dev choice and do not change gameplay. `src/core/grade.test.ts`
 * fails if a value drifts, and `docs/w5-color-lock.md` records the comparison
 * evidence and limitations.
 *
 * Do not tune these values without a new target-shot review from the project
 * owner. Photo-mode filters are deliberately separate parameter sets over the
 * same shader; they can never change the in-game grade.
 */
export interface PhotoFilter {
  readonly id: string;
  readonly label: string;
  readonly grain: number;
  readonly vignette: number;
  readonly saturation: number;
  readonly contrast: number;
  readonly lift: readonly [number, number, number];
  readonly gain: readonly [number, number, number];
}

/**
 * The one fixed grade used by gameplay and by photo mode's "原片" (filter 0).
 * Target reference: `docs/target-shots/README.md`.
 */
export const LOCKED_GRADE: PhotoFilter = Object.freeze({
  id: 'neutral',
  label: '原片',
  grain: 0.018,
  vignette: 0.24,
  saturation: 1.02,
  contrast: 1.03,
  lift: Object.freeze([-0.004, 0.002, 0.008]) as readonly [number, number, number],
  gain: Object.freeze([1.03, 1.0, 0.97]) as readonly [number, number, number],
});

/**
 * Photo-mode looks. Index 0 is the locked in-game grade; the four looks after
 * it only affect photo mode. The array and every parameter set are frozen so a
 * stray mutation cannot silently un-lock the game grade.
 */
export const PHOTO_FILTERS: readonly PhotoFilter[] = Object.freeze([
  LOCKED_GRADE,
  Object.freeze({
    id: 'film',
    label: '胶片',
    grain: 0.055,
    vignette: 0.4,
    saturation: 0.9,
    contrast: 1.05,
    lift: Object.freeze([0.018, 0.012, 0.002]) as readonly [number, number, number],
    gain: Object.freeze([1.05, 1.0, 0.9]) as readonly [number, number, number],
  }),
  Object.freeze({
    id: 'cool',
    label: '冷调',
    grain: 0.03,
    vignette: 0.3,
    saturation: 0.88,
    contrast: 1.04,
    lift: Object.freeze([-0.006, 0.0, 0.016]) as readonly [number, number, number],
    gain: Object.freeze([0.93, 1.0, 1.06]) as readonly [number, number, number],
  }),
  Object.freeze({
    id: 'warm',
    label: '暖调',
    grain: 0.025,
    vignette: 0.28,
    saturation: 1.06,
    contrast: 1.06,
    lift: Object.freeze([0.02, 0.006, -0.01]) as readonly [number, number, number],
    gain: Object.freeze([1.08, 1.02, 0.92]) as readonly [number, number, number],
  }),
  Object.freeze({
    id: 'faded',
    label: '褪色',
    grain: 0.045,
    vignette: 0.34,
    saturation: 0.72,
    contrast: 0.92,
    lift: Object.freeze([0.026, 0.022, 0.022]) as readonly [number, number, number],
    gain: Object.freeze([0.98, 0.98, 1.0]) as readonly [number, number, number],
  }),
]);

/** Index of the locked in-game grade in `PHOTO_FILTERS`. */
export const GAME_GRADE_INDEX = 0;
