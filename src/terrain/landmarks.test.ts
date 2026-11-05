import { describe, expect, it } from 'vitest';
import { isInsideCheckpoint, newPoisAt, type Checkpoint, type LandmarkPoi } from './landmarks';

const checkpoint: Checkpoint = {
  id: 'cabin',
  label: '木屋检查点',
  x: -9.6,
  z: 4.2,
  yaw: Math.PI / 2,
  radius: 5.5,
};

const pois: LandmarkPoi[] = [
  { id: 'cabin', label: '木屋', x: -9.6, z: 4.2, radius: 6 },
  { id: 'ridge', label: '山脊', x: 7, z: 61, radius: 10 },
  { id: 'winch', label: '起手绞盘', x: 3.5, z: 9, radius: 8 },
];

describe('W5 landmarks and checkpoint', () => {
  it('only discovers POIs inside their radius that are not already known', () => {
    expect(newPoisAt(pois, new Set(), 0, 0).map((poi) => poi.id)).toEqual([]);
    expect(newPoisAt(pois, new Set(), 3.5, 9).map((poi) => poi.id)).toEqual(['winch']);
    expect(newPoisAt(pois, new Set(['winch']), 3.5, 9)).toEqual([]);
    expect(newPoisAt(pois, new Set(['winch']), -9.6, 4.2).map((poi) => poi.id)).toEqual(['cabin']);
  });

  it('uses the checkpoint radius as an inclusive trigger', () => {
    expect(isInsideCheckpoint(checkpoint, checkpoint.x, checkpoint.z)).toBe(true);
    expect(isInsideCheckpoint(checkpoint, checkpoint.x + checkpoint.radius, checkpoint.z)).toBe(true);
    expect(isInsideCheckpoint(checkpoint, checkpoint.x + checkpoint.radius + 0.01, checkpoint.z)).toBe(false);
    expect(isInsideCheckpoint(checkpoint, 0, 0)).toBe(false);
  });
});
