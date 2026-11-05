import { describe, expect, it } from 'vitest';
import { WEATHER_LABELS, nextWeather, weatherFog, weatherWetness } from './weather';

describe('weather cycle', () => {
  it('cycles clear -> rain -> fog -> clear', () => {
    expect(nextWeather('clear')).toBe('rain');
    expect(nextWeather('rain')).toBe('fog');
    expect(nextWeather('fog')).toBe('clear');
    expect(WEATHER_LABELS.rain).toBe('雨');
  });

  it('soaks the ground in rain and only damps it in fog', () => {
    expect(weatherWetness('clear', 1)).toBe(0);
    expect(weatherWetness('rain', 1)).toBe(1);
    expect(weatherWetness('rain', 0.5)).toBe(0.5);
    expect(weatherWetness('fog', 1)).toBeCloseTo(0.15, 5);
  });

  it('closes visibility much more in fog than in rain', () => {
    expect(weatherFog('clear', 1).far).toBe(1);
    expect(weatherFog('rain', 1).far).toBeCloseTo(0.45, 5);
    expect(weatherFog('fog', 1).far).toBeCloseTo(0.18, 5);
    expect(weatherFog('fog', 1).near).toBeLessThan(weatherFog('rain', 1).near);
  });
});
