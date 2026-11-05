import type * as THREE from 'three';
import type { DrivingInput } from './input';
import type { Environment } from '../world/environment';
import type { RaycastVehicle } from '../vehicle/raycastVehicle';
import type { WeatherKind } from './weather';

/**
 * W5 #23 / issue #29: the 60-second capture script.
 *
 * The demo drives the car through a fixed sequence of tripod shots, toggles the
 * 8x world clock on and changes clear -> fog -> rain. The canvas is recorded by
 * MediaRecorder; `scripts/record-demo.mjs` fetches the blob and transcodes it to
 * 1080p60 H.264. No HUD is drawn because the video is the canvas only.
 */
export type RecordState = 'ready' | 'recording' | 'stopping' | 'done' | 'error';

interface Shot {
  start: number;
  position: [number, number, number];
  fov: number;
}

interface SpeedKey {
  start: number;
  target: number;
}

const DURATION = 60;

const SHOTS: readonly Shot[] = [
  { start: 0, position: [13, 3.4, 30], fov: 46 },
  { start: 10, position: [-10, 5.5, 48], fov: 48 },
  { start: 20, position: [-14, 3.2, 92], fov: 50 },
  { start: 30, position: [10, 2.8, 106], fov: 50 },
  { start: 44, position: [-10, 2.2, 100], fov: 52 },
];

const SPEEDS: readonly SpeedKey[] = [
  { start: 0, target: 16 },
  { start: 10, target: 10 },
  { start: 20, target: 12 },
  { start: 26, target: 6 },
  { start: 30, target: 0 },
];

const WEATHER: readonly { start: number; kind: WeatherKind }[] = [
  { start: 0, kind: 'clear' },
  { start: 8, kind: 'fog' },
  { start: 20, kind: 'rain' },
];

const START_HOURS = 15;

const IDLE: DrivingInput = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  reset: false,
  shiftUp: false,
  shiftDown: false,
  camera: false,
};

export class RecordDemo {
  state: RecordState = 'ready';
  private started = false;
  private time = 0;
  private startMs = 0;
  private weatherIndex = -1;
  private media: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private blob: Blob | null = null;
  private stream: MediaStream | null = null;
  private readonly driving: DrivingInput = { ...IDLE };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly car: RaycastVehicle,
    private readonly environment: Environment,
  ) {
    this.environment.setDayLengthMinutes(24);
    this.environment.setHours(START_HOURS);
    this.environment.setFastTime(false);
    this.environment.setWeatherInstant('clear');
  }

  get elapsed(): number {
    return this.time;
  }

  get blobSize(): number {
    return this.blob?.size ?? 0;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.time = 0;
    this.startMs = performance.now();
    this.weatherIndex = -1;
    this.environment.setHours(START_HOURS);
    this.environment.setFastTime(true);
    this.environment.setWeatherInstant('clear');
    this.state = 'recording';
    try {
      this.stream = this.canvas.captureStream(60);
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
          ? 'video/webm;codecs=vp8'
          : 'video/webm';
      this.media = new MediaRecorder(this.stream, {
        mimeType: mime,
        videoBitsPerSecond: 12_000_000,
      });
      this.media.ondataavailable = (event) => {
        if (event.data.size > 0) this.chunks.push(event.data);
      };
      this.media.onstop = () => {
        this.blob = new Blob(this.chunks, { type: this.media?.mimeType ?? 'video/webm' });
        this.state = 'done';
      };
      this.media.onerror = () => {
        this.state = 'error';
      };
      this.media.start(1000);
    } catch (cause) {
      console.error(cause);
      this.state = 'error';
    }
  }

  /** Fixed-step timeline update: keeps the scripted weather in sync. */
  update(): void {
    if (!this.started) return;
    this.time = Math.min(DURATION, (performance.now() - this.startMs) / 1000);
    while (
      this.weatherIndex + 1 < WEATHER.length &&
      this.time >= WEATHER[this.weatherIndex + 1]!.start
    ) {
      this.weatherIndex += 1;
      this.environment.setWeatherInstant(WEATHER[this.weatherIndex]!.kind);
    }
  }

  /** Scripted pedals for the current fixed step. */
  drivingInput(): DrivingInput {
    if (!this.started) return IDLE;
    const target = this.targetSpeed(this.time);
    const speed = this.car.speedKmh;
    this.driving.throttle = 0;
    this.driving.brake = 0;
    this.driving.handbrake = false;
    if (target <= 0.5) {
      // Brake down, then hold with the handbrake: holding S at standstill would
      // engage reverse and back the car out of the hero water shot.
      if (speed > 1) this.driving.brake = 1;
      else this.driving.handbrake = true;
    } else if (speed < target - 1.2) {
      this.driving.throttle = target > 14 ? 0.8 : 0.65;
    } else if (speed > target + 1.8) {
      this.driving.brake = 0.5;
    }
    return { ...this.driving };
  }

  /** Called from the render loop in record mode. */
  updateCamera(camera: THREE.PerspectiveCamera): void {
    const shot = this.shotAt(this.time);
    camera.position.set(shot.position[0], shot.position[1], shot.position[2]);
    camera.fov = shot.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(
      this.car.position.x,
      this.car.position.y + 0.85,
      this.car.position.z,
    );
  }

  /** Stop when the script reaches 60 s; onstop flips the state to done. */
  tick(): void {
    if (!this.started || this.state !== 'recording') return;
    if (this.time < DURATION) return;
    this.state = 'stopping';
    try {
      this.media?.stop();
    } catch {
      this.state = 'error';
    }
  }

  /** Called by the automation hook; returns one base64 slice of the webm. */
  async chunk(offset: number, length: number): Promise<string> {
    if (!this.blob) return '';
    const buffer = await this.blob.slice(offset, offset + length).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const step = 0x8000;
    for (let index = 0; index < bytes.length; index += step) {
      binary += String.fromCharCode(...bytes.subarray(index, index + step));
    }
    return btoa(binary);
  }

  private targetSpeed(t: number): number {
    let target = SPEEDS[0]!.target;
    for (const key of SPEEDS) {
      if (t >= key.start) target = key.target;
    }
    return target;
  }

  private shotAt(t: number): Shot {
    let shot = SHOTS[0]!;
    for (const candidate of SHOTS) {
      if (t >= candidate.start) shot = candidate;
    }
    return shot;
  }
}

