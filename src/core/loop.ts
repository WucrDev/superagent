import { FixedStepClock } from './clock';

export interface LoopCallbacks {
  /** Runs once per fixed simulation step. */
  update(step: number): void;
  /** Runs once per rendered frame. */
  render(alpha: number, frameTime: number): void;
}

export class GameLoop {
  private readonly clock: FixedStepClock;
  private frame = 0;
  private lastTime = 0;
  private running = false;

  constructor(
    step: number,
    private readonly callbacks: LoopCallbacks,
  ) {
    this.clock = new FixedStepClock(step);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  private readonly tick = (now: number): void => {
    const frameTime = (now - this.lastTime) / 1000;
    this.lastTime = now;

    const steps = this.clock.advance(frameTime);
    for (let i = 0; i < steps; i += 1) {
      this.callbacks.update(this.clock.step);
    }
    this.callbacks.render(this.clock.alpha, frameTime);

    if (this.running) {
      this.frame = requestAnimationFrame(this.tick);
    }
  };
}
