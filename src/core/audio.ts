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
  private winch?: OscillatorNode;
  private winchGain?: GainNode;
  private winchFilter?: BiquadFilterNode;
  private creak?: OscillatorNode;
  private creakGain?: GainNode;
  private noise?: AudioBuffer;
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

      // W3 #19: winch motor (three load stages) and a high rope creak.
      const winch = context.createOscillator();
      winch.type = 'sawtooth';
      winch.frequency.value = 62;
      const winchFilter = context.createBiquadFilter();
      winchFilter.type = 'lowpass';
      winchFilter.frequency.value = 360;
      winchFilter.Q.value = 1.4;
      const winchGain = context.createGain();
      winchGain.gain.value = 0;
      winch.connect(winchFilter);
      winchFilter.connect(winchGain);
      winchGain.connect(context.destination);
      winch.start();

      const creak = context.createOscillator();
      creak.type = 'triangle';
      creak.frequency.value = 820;
      const creakGain = context.createGain();
      creakGain.gain.value = 0;
      creak.connect(creakGain);
      creakGain.connect(context.destination);
      creak.start();

      const noise = context.createBuffer(1, context.sampleRate * 0.5, context.sampleRate);
      const samples = noise.getChannelData(0);
      for (let index = 0; index < samples.length; index += 1) {
        samples[index] = Math.random() * 2 - 1;
      }

      this.context = context;
      this.engine = engine;
      this.engineGain = gain;
      this.filter = filter;
      this.winch = winch;
      this.winchGain = winchGain;
      this.winchFilter = winchFilter;
      this.creak = creak;
      this.creakGain = creakGain;
      this.noise = noise;
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

  /** W3 #19: motor stage from rope load; overload adds a higher, harder tone. */
  updateWinch(load: number, reeling: boolean, overload: boolean): void {
    if (!this.context || !this.winch || !this.winchGain || !this.winchFilter) return;
    if (!this.creak || !this.creakGain) return;
    if (this.muted) {
      this.winchGain.gain.setTargetAtTime(0, this.context.currentTime, 0.05);
      this.creakGain.gain.setTargetAtTime(0, this.context.currentTime, 0.05);
      return;
    }
    const clamped = Math.max(0, Math.min(1, load));
    const now = this.context.currentTime;
    const frequency = 62 + clamped * 82 + (overload ? 34 : 0);
    this.winch.frequency.setTargetAtTime(frequency, now, 0.06);
    this.winchFilter.frequency.setTargetAtTime(320 + clamped * 1100, now, 0.08);
    const motorGain = reeling ? 0.014 + clamped * 0.022 : 0.004 + clamped * 0.006;
    this.winchGain.gain.setTargetAtTime(motorGain, now, 0.07);

    this.creak.frequency.setTargetAtTime(760 + clamped * 820, now, 0.08);
    this.creakGain.gain.setTargetAtTime(
      clamped > 0.12 ? clamped * clamped * 0.012 : 0,
      now,
      0.06,
    );
  }

  /** Short mechanical clunk when the hook bites. */
  winchHitch(): void {
    if (!this.context || this.muted) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(150, now);
    oscillator.frequency.exponentialRampToValueAtTime(70, now + 0.09);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.13);
  }

  /** W3 #20: rope snap: broad noise burst plus a falling thump. */
  winchBreak(): void {
    if (!this.context || this.muted) return;
    const now = this.context.currentTime;
    this.playNoise(0.22, 0.11, 2400);
    const oscillator = this.context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(120, now);
    oscillator.frequency.exponentialRampToValueAtTime(38, now + 0.26);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.31);
  }

  /** W3 #20: tree/stump break or rock rolling loose. */
  anchorCrack(): void {
    if (!this.context || this.muted) return;
    const now = this.context.currentTime;
    this.playNoise(0.34, 0.09, 620);
    const oscillator = this.context.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(82, now);
    oscillator.frequency.exponentialRampToValueAtTime(44, now + 0.3);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.35);
  }

  private playNoise(duration: number, level: number, cutoff: number): void {
    if (!this.context || !this.noise) return;
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    source.buffer = this.noise;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(level, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.context.destination);
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  dispose(): void {
    this.engine?.stop();
    this.winch?.stop();
    this.creak?.stop();
    void this.context?.close();
  }
}
