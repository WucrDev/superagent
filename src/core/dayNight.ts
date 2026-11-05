import { clamp } from './math';

/**
 * W5 #20 / issue #26: the 24-minute day cycle.
 *
 * This module is deliberately free of THREE and DOM so the palette, clock and
 * sun direction can be unit-tested. `world/environment.ts` consumes the values
 * and applies them to lights, fog, the sky dome and the tone-mapping exposure.
 */

/** Default: one full 24 h game day takes 24 real minutes. */
export const DEFAULT_DAY_SECONDS = 24 * 60;

export interface SkyPalette {
  /** Upper sky colour of the gradient dome. */
  skyTop: number;
  /** Horizon colour of the gradient dome. */
  skyBottom: number;
  /** Fog colour; also used as the renderer clear colour behind the dome. */
  fog: number;
  /** Base fog distances before weather adjustments. */
  fogNear: number;
  fogFar: number;
  /** Directional sun/moon light. */
  sunColor: number;
  sunIntensity: number;
  /** Hemisphere ambient. */
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  /** Tone-mapping exposure used by the renderer/composer. */
  exposure: number;
  /** 0 = no stars, 1 = full night sky. */
  stars: number;
  /** 0 = full day, 1 = deep night; used for headlight automation. */
  night: number;
}

interface Keyframe {
  hour: number;
  palette: SkyPalette;
}

function palette(values: SkyPalette): SkyPalette {
  return values;
}

/**
 * Hand-tuned keyframes for a cool, overcast northern-forest look. The gaps are
 * interpolated linearly; all values are measured in the same units the renderer
 * consumes them.
 */
const KEYFRAMES: readonly Keyframe[] = [
  {
    hour: 0,
    palette: palette({
      skyTop: 0x060a16,
      skyBottom: 0x142034,
      fog: 0x0d1524,
      fogNear: 30,
      fogFar: 190,
      sunColor: 0x9db4e8,
      sunIntensity: 0.85,
      hemiSky: 0x3a4a68,
      hemiGround: 0x0c1016,
      hemiIntensity: 1.15,
      exposure: 1.75,
      stars: 1,
      night: 1,
    }),
  },
  {
    hour: 4.6,
    palette: palette({
      skyTop: 0x081020,
      skyBottom: 0x1d2332,
      fog: 0x151c28,
      fogNear: 28,
      fogFar: 180,
      sunColor: 0x8fa6d8,
      sunIntensity: 0.7,
      hemiSky: 0x2b3d5c,
      hemiGround: 0x0a0d12,
      hemiIntensity: 0.9,
      exposure: 1.55,
      stars: 1,
      night: 1,
    }),
  },
  {
    hour: 6.1,
    palette: palette({
      skyTop: 0x2f4d6a,
      skyBottom: 0xd88a58,
      fog: 0xb07e62,
      fogNear: 34,
      fogFar: 230,
      sunColor: 0xffb070,
      sunIntensity: 1.35,
      hemiSky: 0x8fa8bf,
      hemiGround: 0x3f3a2e,
      hemiIntensity: 0.95,
      exposure: 1.2,
      stars: 0,
      night: 0.15,
    }),
  },
  {
    hour: 8.2,
    palette: palette({
      skyTop: 0x6c9dc6,
      skyBottom: 0xafc8d6,
      fog: 0xa9c2cf,
      fogNear: 60,
      fogFar: 340,
      sunColor: 0xffefcf,
      sunIntensity: 2.4,
      hemiSky: 0xd6e6ff,
      hemiGround: 0x46513a,
      hemiIntensity: 1.5,
      exposure: 1.08,
      stars: 0,
      night: 0,
    }),
  },
  {
    hour: 12,
    palette: palette({
      skyTop: 0x5a98d2,
      skyBottom: 0xb9d5e7,
      fog: 0xb8d4e6,
      fogNear: 80,
      fogFar: 420,
      sunColor: 0xffffff,
      sunIntensity: 3,
      hemiSky: 0xd6e6ff,
      hemiGround: 0x46513a,
      hemiIntensity: 1.7,
      exposure: 1.02,
      stars: 0,
      night: 0,
    }),
  },
  {
    hour: 16,
    palette: palette({
      skyTop: 0x6a9cc8,
      skyBottom: 0xc4c3a8,
      fog: 0xc2bda4,
      fogNear: 70,
      fogFar: 380,
      sunColor: 0xffe6c0,
      sunIntensity: 2.6,
      hemiSky: 0xd8e4ef,
      hemiGround: 0x4b4a36,
      hemiIntensity: 1.45,
      exposure: 1.06,
      stars: 0,
      night: 0,
    }),
  },
  {
    hour: 17.7,
    palette: palette({
      skyTop: 0x3a4a78,
      skyBottom: 0xe08a58,
      fog: 0xc9855e,
      fogNear: 50,
      fogFar: 300,
      sunColor: 0xff9a50,
      sunIntensity: 2,
      hemiSky: 0xb0b0c0,
      hemiGround: 0x4a3a2a,
      hemiIntensity: 1.15,
      exposure: 1.2,
      stars: 0,
      night: 0.1,
    }),
  },
  {
    hour: 19.2,
    palette: palette({
      skyTop: 0x1a2340,
      skyBottom: 0x6a3a48,
      fog: 0x3a3038,
      fogNear: 34,
      fogFar: 220,
      sunColor: 0x7d88b0,
      sunIntensity: 1,
      hemiSky: 0x46546e,
      hemiGround: 0x16140f,
      hemiIntensity: 0.95,
      exposure: 1.5,
      stars: 0.45,
      night: 0.72,
    }),
  },
  {
    hour: 21,
    palette: palette({
      skyTop: 0x060a16,
      skyBottom: 0x142034,
      fog: 0x0d1524,
      fogNear: 30,
      fogFar: 190,
      sunColor: 0x9db4e8,
      sunIntensity: 0.85,
      hemiSky: 0x3a4a68,
      hemiGround: 0x0c1016,
      hemiIntensity: 1.15,
      exposure: 1.75,
      stars: 1,
      night: 1,
    }),
  },
  {
    hour: 24,
    palette: palette({
      skyTop: 0x060a16,
      skyBottom: 0x142034,
      fog: 0x0d1524,
      fogNear: 30,
      fogFar: 190,
      sunColor: 0x9db4e8,
      sunIntensity: 0.85,
      hemiSky: 0x3a4a68,
      hemiGround: 0x0c1016,
      hemiIntensity: 1.15,
      exposure: 1.75,
      stars: 1,
      night: 1,
    }),
  },
];

export function wrapHours(hours: number): number {
  if (!Number.isFinite(hours)) return 0;
  const wrapped = hours % 24;
  return wrapped < 0 ? wrapped + 24 : wrapped;
}

/** "06:05" style clock for the HUD. */
export function formatClock(hours: number): string {
  const wrapped = wrapHours(hours);
  const whole = Math.floor(wrapped);
  const minutes = Math.floor((wrapped - whole) * 60);
  return `${String(whole).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Coarse phase label used by the HUD and the recording demo. */
export function dayPhaseLabel(hours: number): string {
  const h = wrapHours(hours);
  if (h < 5) return '深夜';
  if (h < 6.5) return '黎明';
  if (h < 11) return '清晨';
  if (h < 15) return '正午';
  if (h < 17.5) return '午后';
  if (h < 19) return '黄昏';
  if (h < 21) return '入夜';
  return '夜晚';
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(lerp(ar, br, t));
  const g = Math.round(lerp(ag, bg, t));
  const bl = Math.round(lerp(ab, bb, t));
  return (r << 16) | (g << 8) | bl;
}

/** Sample the palette at a (wrapped) hour of day. */
export function skyPalette(hours: number): SkyPalette {
  const h = wrapHours(hours);
  let index = 0;
  while (index < KEYFRAMES.length - 2 && h > KEYFRAMES[index + 1]!.hour) {
    index += 1;
  }
  const from = KEYFRAMES[index]!;
  const to = KEYFRAMES[index + 1]!;
  const span = Math.max(1e-6, to.hour - from.hour);
  const t = clamp((h - from.hour) / span, 0, 1);
  const a = from.palette;
  const b = to.palette;
  return {
    skyTop: lerpColor(a.skyTop, b.skyTop, t),
    skyBottom: lerpColor(a.skyBottom, b.skyBottom, t),
    fog: lerpColor(a.fog, b.fog, t),
    fogNear: lerp(a.fogNear, b.fogNear, t),
    fogFar: lerp(a.fogFar, b.fogFar, t),
    sunColor: lerpColor(a.sunColor, b.sunColor, t),
    sunIntensity: lerp(a.sunIntensity, b.sunIntensity, t),
    hemiSky: lerpColor(a.hemiSky, b.hemiSky, t),
    hemiGround: lerpColor(a.hemiGround, b.hemiGround, t),
    hemiIntensity: lerp(a.hemiIntensity, b.hemiIntensity, t),
    exposure: lerp(a.exposure, b.exposure, t),
    stars: lerp(a.stars, b.stars, t),
    night: lerp(a.night, b.night, t),
  };
}

export interface SunDirection {
  x: number;
  y: number;
  z: number;
}

/**
 * Unit vector pointing from the scene toward the sun. Sunrise is east (+x),
 * noon is high and slightly south (+z), sunset is west (-x).
 */
export function sunDirection(hours: number): SunDirection {
  const h = wrapHours(hours);
  const dayProgress = clamp((h - 6) / 12, 0, 1);
  const elevation = Math.sin(dayProgress * Math.PI) * (Math.PI / 3);
  const azimuth = dayProgress * Math.PI;
  const cosEl = Math.cos(elevation);
  const x = Math.cos(azimuth) * cosEl;
  const y = Math.sin(elevation);
  const z = Math.sin(azimuth) * cosEl * 0.6;
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
}

/**
 * Direction the directional light should sit in. At night the moon is modelled
 * as a dim light opposite the sun so the terrain still reads.
 */
export function lightDirection(hours: number): SunDirection {
  const sun = sunDirection(hours);
  if (sun.y > 0.08) return sun;
  const length = Math.hypot(sun.x, 0.35, sun.z) || 1;
  return { x: -sun.x / length, y: 0.35 / length, z: -sun.z / length };
}

export function isNight(hours: number): boolean {
  const h = wrapHours(hours);
  return h < 5.9 || h >= 19.1;
}

export function isHeadlightTime(hours: number): boolean {
  const h = wrapHours(hours);
  return h < 6.6 || h >= 17.6;
}

/** Rain/fog need lights even in the daytime. */
export function headlightsWanted(hours: number, rain: number, fog: number): boolean {
  return isHeadlightTime(hours) || rain > 0.15 || fog > 0.25;
}
