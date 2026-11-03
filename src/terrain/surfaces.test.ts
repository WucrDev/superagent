import { describe, expect, it } from 'vitest';
import { SURFACES, TerrainField, gripCurve, slopeDegFromNormal } from './surfaces';

describe('surface materials', () => {
  it('has four explicit W2 materials plus the dry-dirt baseline', () => {
    expect(SURFACES.mud.label).toBe('泥地');
    expect(SURFACES.rock.label).toBe('岩石');
    expect(SURFACES.snow.label).toBe('雪地');
    expect(SURFACES.water.label).toBe('深水');
    expect(SURFACES.dirt.label).toBe('干土');
  });

  it('keeps wet mud below the 30° climb threshold and dry dirt above it', () => {
    const tan30 = Math.tan(Math.PI / 6);
    expect(SURFACES.dirt.friction).toBeGreaterThan(tan30);
    expect(SURFACES.wetMud.friction).toBeLessThan(tan30);
    expect(SURFACES.snow.lateralGrip).toBeLessThan(SURFACES.rock.lateralGrip);
  });

  it('keeps full grip at low slip and loses grip while sliding', () => {
    expect(gripCurve(0)).toBe(1);
    expect(gripCurve(1.4)).toBe(1);
    expect(gripCurve(5)).toBeLessThan(0.9);
    expect(gripCurve(40)).toBeGreaterThanOrEqual(0.6);
  });

  it('converts contact normals to degrees', () => {
    expect(slopeDegFromNormal(1)).toBeCloseTo(0, 5);
    expect(slopeDegFromNormal(Math.cos(Math.PI / 6))).toBeCloseTo(30, 4);
  });
});

describe('TerrainField', () => {
  it('defaults unknown colliders to dry dirt and returns registered surfaces', () => {
    const field = new TerrainField();
    expect(field.surfaceAt(123).id).toBe('dirt');
    field.addSurface(7, SURFACES.snow);
    expect(field.surfaceAt(7).id).toBe('snow');
  });

  it('looks up water by position and keeps the deepest overlapping zone', () => {
    const field = new TerrainField();
    field.addWater({
      x: 0,
      z: 0,
      halfWidth: 10,
      halfDepth: 10,
      level: 0.4,
      depth: 0.4,
    });
    field.addWater({
      x: 0,
      z: 0,
      halfWidth: 2,
      halfDepth: 2,
      level: 0.8,
      depth: 0.8,
    });

    expect(field.waterDepthAt(0, 0)).toBe(0.8);
    expect(field.waterDepthAt(8, 8)).toBe(0.4);
    expect(field.waterAt(20, 20)).toBeNull();
    expect(field.waterDepthAt(20, 20)).toBe(0);
    expect(field.waters).toHaveLength(2);
  });
});
