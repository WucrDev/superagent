/**
 * Accumulates real frame time and emits whole fixed simulation steps.
 *
 * Rendering can run at any refresh rate; gameplay/physics always advances in
 * `step` seconds. Long frames are clamped so a background tab cannot trigger a
 * spiral of death when it comes back.
 */
export class FixedStepClock {
  private accumulator = 0;

  constructor(
    readonly step: number,
    readonly maxFrameTime = 0.25,
  ) {
    if (step <= 0) throw new Error('step must be > 0');
  }

  /** Advance by `frameTime` seconds; returns how many fixed steps to run. */
  advance(frameTime: number): number {
    const clamped = Math.min(Math.max(frameTime, 0), this.maxFrameTime);
    this.accumulator += clamped;

    let steps = 0;
    while (this.accumulator >= this.step) {
      this.accumulator -= this.step;
      steps += 1;
    }
    return steps;
  }

  /** Fraction of a step left over, for render interpolation. */
  get alpha(): number {
    return this.accumulator / this.step;
  }

  reset(): void {
    this.accumulator = 0;
  }
}
