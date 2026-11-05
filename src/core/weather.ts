import { clamp } from './math';

/** W5 #20 / issue #26: the two weather states required by the milestone. */
export type WeatherKind = 'clear' | 'rain' | 'fog';

export const WEATHER_LABELS: Record<WeatherKind, string> = {
  clear: '晴',
  rain: '雨',
  fog: '雾',
};

export const WEATHER_ORDER: readonly WeatherKind[] = ['clear', 'rain', 'fog'];

export function nextWeather(kind: WeatherKind): WeatherKind {
  const index = WEATHER_ORDER.indexOf(kind);
  return WEATHER_ORDER[(index + 1) % WEATHER_ORDER.length]!;
}

/**
 * 0..1 wetness used by the tire model. Rain soaks the surface fully; fog only
 * leaves a damp film so it changes visibility more than grip.
 */
export function weatherWetness(kind: WeatherKind, intensity = 1): number {
  const amount = clamp(intensity, 0, 1);
  if (kind === 'rain') return amount;
  if (kind === 'fog') return 0.15 * amount;
  return 0;
}

export interface WeatherFog {
  near: number;
  far: number;
}

/**
 * Multipliers applied to the time-of-day fog distances. Rain closes the world
 * in but keeps a longer tail than fog; fog is the low-visibility state.
 */
export function weatherFog(kind: WeatherKind, intensity = 1): WeatherFog {
  const amount = clamp(intensity, 0, 1);
  if (kind === 'rain') {
    return { near: 0.7, far: 1 - 0.55 * amount };
  }
  if (kind === 'fog') {
    return { near: 0.3, far: 1 - 0.82 * amount };
  }
  return { near: 1, far: 1 };
}
