import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Rope } from './rope';

const FLAT = (): number => 0;

function segmentLengths(rope: Rope): number[] {
  const lengths: number[] = [];
  for (let index = 0; index < rope.segments; index += 1) {
    lengths.push(rope.points[index]!.distanceTo(rope.points[index + 1]!));
  }
  return lengths;
}

function allFinite(rope: Rope): boolean {
  return rope.points.every(
    (point) =>
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      Number.isFinite(point.z),
  );
}

describe('W3 rope (16-segment PBD)', () => {
  it('starts with 17 points and a straight reset pose', () => {
    const rope = new Rope(16);
    expect(rope.points).toHaveLength(17);
    const start = new THREE.Vector3(0, 2, 0);
    const end = new THREE.Vector3(8, 2, 0);
    rope.reset(start, end, 8);
    expect(rope.rest).toBe(8);
    expect(rope.start.x).toBeCloseTo(0, 6);
    expect(rope.end.x).toBeCloseTo(8, 6);
    expect(rope.stretchRatio).toBeCloseTo(0, 6);
    expect(rope.points[8]!.x).toBeCloseTo(4, 6);
  });

  it('sags under gravity when slack and keeps its endpoints', () => {
    const rope = new Rope(16);
    const start = new THREE.Vector3(0, 4, 0);
    const end = new THREE.Vector3(8, 4, 0);
    rope.reset(start, end, 10);
    for (let step = 0; step < 180; step += 1) {
      rope.step(1 / 60, start, end, FLAT);
    }
    expect(allFinite(rope)).toBe(true);
    expect(rope.points[8]!.y).toBeLessThan(4);
    expect(rope.points[8]!.y).toBeGreaterThan(0);
    expect(rope.start.distanceTo(start)).toBeCloseTo(0, 6);
    expect(rope.end.distanceTo(end)).toBeCloseTo(0, 6);
  });

  it('straightens when the endpoints stretch it', () => {
    const rope = new Rope(16);
    const start = new THREE.Vector3(0, 4, 0);
    const end = new THREE.Vector3(8.4, 4, 0);
    rope.reset(start, end, 8);
    for (let step = 0; step < 120; step += 1) {
      rope.step(1 / 60, start, end, FLAT);
    }
    expect(allFinite(rope)).toBe(true);
    expect(rope.stretchRatio).toBeGreaterThan(0);
    expect(rope.points[8]!.y).toBeGreaterThan(4 - 1);
  });

  it('collides with the terrain without exploding', () => {
    const rope = new Rope(16);
    const start = new THREE.Vector3(0, 3, 0);
    const end = new THREE.Vector3(8, 3, 0);
    rope.reset(start, end, 10);
    const ground = (): number => 0.5;
    for (let step = 0; step < 180; step += 1) {
      rope.step(1 / 60, start, end, ground);
      for (let index = 1; index < rope.points.length - 1; index += 1) {
        expect(rope.points[index]!.y).toBeGreaterThanOrEqual(0.55 - 1e-6);
      }
    }
    expect(allFinite(rope)).toBe(true);
    for (const length of segmentLengths(rope)) {
      expect(length).toBeLessThan((rope.rest / rope.segments) * 1.6);
    }
  });

  it('falls freely once the anchor end is released', () => {
    const rope = new Rope(16);
    const start = new THREE.Vector3(0, 5, 0);
    const end = new THREE.Vector3(8, 5, 0);
    rope.reset(start, end, 8);
    for (let step = 0; step < 150; step += 1) {
      rope.freeStep(1 / 60, start, FLAT);
    }
    expect(allFinite(rope)).toBe(true);
    expect(rope.end.y).toBeLessThan(4);
    expect(rope.end.y).toBeGreaterThanOrEqual(0.05);
  });
});
