import type { Gear } from '../vehicle/drivetrain';

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
  private jack?: OscillatorNode;
  private jackGain?: GainNode;
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

      // W4 #22: hydraulic jack pump, silent until the jack is actually used.
      const jack = context.createOscillator();
      jack.type = 'square';
      jack.frequency.value = 68;
      const jackFilter = context.createBiquadFilter();
      jackFilter.type = 'lowpass';
      jackFilter.frequency.value = 220;
      const jackGain = context.createGain();
      jackGain.gain.value = 0;
      jack.connect(jackFilter);
      jackFilter.connect(jackGain);
      jackGain.connect(context.destination);
      jack.start();

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
      this.jack = jack;
      this.jackGain = jackGain;
      this.noise = noise;
    } catch {
      // Silent fallback: the prototype must still run without audio.
      this.context = undefined;
    }
  }

  update(speedKmh: number, throttle: number, gear: Gear): void {
    if (!this.context || !this.engine || !this.engineGain || !this.filter) return;
    if (this.muted) {
      this.engineGain.gain.setTargetAtTime(0, this.context.currentTime, 0.05);
      return;
    }
    const gearTone = gear === 'L' ? 14 : gear === 'H' ? 0 : 8;
    const targetFrequency = 48 + speedKmh * 1.35 + gearTone;
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

  /** W4 #22: hydraulic valve clunk when the jack takes the weight. */
  jackStart(): void {
    if (!this.context || this.muted) return;
    const now = this.context.currentTime;
    this.playNoise(0.09, 0.05, 520);
    const oscillator = this.context.createOscillator();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(95, now);
    oscillator.frequency.exponentialRampToValueAtTime(58, now + 0.12);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.03, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.15);
  }

  /** Continuous hydraulic pump tone while the jack lifts the car. */
  jackPump(active: boolean, progress: number): void {
    if (!this.context || !this.jack || !this.jackGain) return;
    const now = this.context.currentTime;
    if (this.muted || !active) {
      this.jackGain.gain.setTargetAtTime(0, now, 0.06);
      return;
    }
    this.jack.frequency.setTargetAtTime(64 + progress * 26, now, 0.08);
    this.jackGain.gain.setTargetAtTime(0.018 + progress * 0.012, now, 0.08);
  }

  /** W4 #22: the car settles back onto its wheels. */
  jackDone(): void {
    if (!this.context || this.muted) return;
    this.jackPump(false, 0);
    const now = this.context.currentTime;
    this.playNoise(0.16, 0.06, 420);
    const oscillator = this.context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(120, now);
    oscillator.frequency.exponentialRampToValueAtTime(52, now + 0.18);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.21);
  }

  /** W4 #23: ratchet click during the 2 s repair animation. */
  repairTick(): void {
    if (!this.context || this.muted) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(340, now);
    oscillator.frequency.exponentialRampToValueAtTime(210, now + 0.04);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.018, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.07);
  }

  /** W4 #23: wrench-down confirmation when a kit is spent. */
  repairDone(): void {
    if (!this.context || this.muted) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(300, now);
    oscillator.frequency.setValueAtTime(450, now + 0.07);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.03, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.23);
  }

  /** W4 #24: supply crate collected. */
  pickup(): void {
    if (!this.context || this.muted) return;
    const now = this.context.currentTime;
    for (const [offset, frequency] of [
      [0, 520],
      [0.08, 780],
    ] as const) {
      const oscillator = this.context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      const gain = this.context.createGain();
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.linearRampToValueAtTime(0.03, now + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.11);
      oscillator.connect(gain);
      gain.connect(this.context.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.12);
    }
  }

  /** W4 #23: crash thud; the HUD carries the number. */
  damage(): void {
    if (!this.context || this.muted) return;
    const now = this.context.currentTime;
    this.playNoise(0.22, 0.09, 340);
    const oscillator = this.context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(78, now);
    oscillator.frequency.exponentialRampToValueAtTime(34, now + 0.26);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.29);
  }

  /** W4 #21: the board lands on both supports. */
  plankPlace(): void {
    if (!this.context || this.muted) return;
    const now = this.context.currentTime;
    this.playNoise(0.16, 0.07, 480);
    const oscillator = this.context.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(150, now);
    oscillator.frequency.exponentialRampToValueAtTime(70, now + 0.14);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.17);
  }

  /** W4 #21: a badly placed board scrapes and falls. */
  plankSlip(): void {
    if (!this.context || this.muted) return;
    this.playNoise(0.5, 0.05, 1500);
  }

  /** W4 #21: the board flexes under the car. */
  plankCreak(load: number): void {
    if (!this.context || this.muted) return;
    const now = this.context.currentTime;
    const clamped = Math.max(0, Math.min(1, load));
    const oscillator = this.context.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(240 + clamped * 180, now);
    oscillator.frequency.exponentialRampToValueAtTime(180 + clamped * 90, now + 0.12);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.006 + clamped * 0.012, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.17);
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
    this.jack?.stop();
    void this.context?.close();
  }
}
