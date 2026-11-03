/**
 * Tiny synthesized engine/shift audio for W1 #3.
 *
 * Audio is created lazily after a user gesture (browser autoplay policy). If the
 * Web Audio API is unavailable the game keeps running silently.
 */
export class EngineAudio {
  private context?: AudioContext;
  private engine?: OscillatorNode;
  private engineGain?: GainNode;
  private filter?: BiquadFilterNode;
  private started = false;
  private muted = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    try {
      const Context = window.AudioContext;
      if (!Context) return;
      const context = new Context();
      const engine = context.createOscillator();
      engine.type = 'sawtooth';
      engine.frequency.value = 55;

      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 520;
      filter.Q.value = 2;

      const gain = context.createGain();
      gain.gain.value = 0;

      engine.connect(filter);
      filter.connect(gain);
      gain.connect(context.destination);
      engine.start();

      this.context = context;
      this.engine = engine;
      this.engineGain = gain;
      this.filter = filter;
    } catch {
      // Silent fallback: the prototype must still run without audio.
      this.context = undefined;
    }
  }

  update(speedKmh: number, throttle: number, gear: 'L' | 'H'): void {
    if (!this.context || !this.engine || !this.engineGain || !this.filter) return;
    if (this.muted) {
      this.engineGain.gain.setTargetAtTime(0, this.context.currentTime, 0.05);
      return;
    }
    const targetFrequency = 48 + speedKmh * 1.35 + (gear === 'L' ? 14 : 0);
    this.engine.frequency.setTargetAtTime(targetFrequency, this.context.currentTime, 0.06);
    this.filter.frequency.setTargetAtTime(
      380 + speedKmh * 14,
      this.context.currentTime,
      0.08,
    );
    this.engineGain.gain.setTargetAtTime(
      0.012 + throttle * 0.028,
      this.context.currentTime,
      0.08,
    );
  }

  shift(): void {
    if (!this.context || this.muted) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(110, now);
    oscillator.frequency.exponentialRampToValueAtTime(42, now + 0.12);

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.17);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  dispose(): void {
    this.engine?.stop();
    void this.context?.close();
  }
}
