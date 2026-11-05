import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DAY_SECONDS,
  dayPhaseLabel,
  formatClock,
  isHeadlightTime,
  isNight,
  lightDirection,
  skyPalette,
  sunDirection,
  wrapHours,
} from './dayNight';

describe('24-minute day cycle', () => {
  it('uses 24 real minutes for one game day by default', () => {
    expect(DEFAULT_DAY_SECONDS).toBe(1440);
  });

  it('wraps hours and formats a stable HUD clock', () => {
    expect(wrapHours(-1)).toBe(23);
    expect(wrapHours(25)).toBe(1);
    expect(formatClock(6.5)).toBe('06:30');
    expect(formatClock(19.999)).toBe('19:59');
    expect(formatClock(0)).toBe('00:00');
  });

  it('labels the phases the HUD and demo use', () => {
    expect(dayPhaseLabel(2)).toBe('深夜');
    expect(dayPhaseLabel(12)).toBe('正午');
    expect(dayPhaseLabel(18)).toBe('黄昏');
    expect(dayPhaseLabel(22)).toBe('夜晚');
  });

  it('is dark at night and bright at noon', () => {
    const night = skyPalette(0);
    const noon = skyPalette(12);
    expect(noon.sunIntensity).toBeGreaterThan(night.sunIntensity * 3);
    expect(night.sunIntensity).toBeLessThan(1);
    expect(noon.night).toBeLessThan(0.05);
    expect(night.night).toBeGreaterThan(0.9);
    expect(night.stars).toBeGreaterThan(0.9);
    expect(noon.fogFar).toBeGreaterThan(night.fogFar);
  });

  it('interpolates smoothly through sunrise and sunset', () => {
    const dawn = skyPalette(5.4);
    const morning = skyPalette(7);
    expect(dawn.sunIntensity).toBeGreaterThan(skyPalette(4.6).sunIntensity);
    expect(morning.sunIntensity).toBeGreaterThan(dawn.sunIntensity);
    expect(morning.stars).toBeLessThan(0.2);
  });

  it('puts the sun east at sunrise, high at noon and west at sunset', () => {
    const sunrise = sunDirection(6.1);
    const noon = sunDirection(12);
    const sunset = sunDirection(17.9);
    expect(sunrise.x).toBeGreaterThan(0.5);
    expect(sunrise.y).toBeLessThan(0.2);
    expect(noon.y).toBeGreaterThan(0.8);
    expect(sunset.x).toBeLessThan(-0.5);
  });

  it('switches headlights on at dusk and night', () => {
    expect(isNight(22)).toBe(true);
    expect(isNight(12)).toBe(false);
    expect(isHeadlightTime(19)).toBe(true);
    expect(isHeadlightTime(12)).toBe(false);
    const moon = lightDirection(23);
    expect(moon.y).toBeGreaterThan(0.1);
  });
});
