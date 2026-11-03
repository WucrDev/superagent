import { clamp } from '../core/math';

/**
 * W4 #15 / issue #21: the plank bridge.
 *
 * A plank is 4 m long and is dropped straight ahead of the car centre. It needs
 * solid ground under both ends; a gap, a missing end, or a badly tilted spot
 * makes it slide off. `planPlank` is pure so the placement rules are testable
 * without Rapier.
 */
export const PLANK = {
  /** Board length along the driving direction (m). */
  length: 4,
  /** Board width (m). */
  width: 0.9,
  /** Board thickness (m). */
  thickness: 0.12,
  /** Distance from the car centre to the board centre (m). */
  ahead: 4.4,
  /** Height difference between the two ends that still counts as level (m). */
  maxHeightDiff: 0.5,
  /** Seconds before a dropped, sliding plank is removed. */
  slipTime: 1.8,
  /** Maximum visual sag while the car is on it (m). */
  sag: 0.075,
} as const;

export interface PlankPose {
  centerX: number;
  centerY: number;
  centerZ: number;
  /** Yaw of the board, matching the car's heading. */
  yaw: number;
  /** Pitch from the two support heights (radians, Three.js X rotation). */
  pitch: number;
  nearY: number;
  farY: number;
}

export type PlankPlacement =
  | { ok: true; pose: PlankPose; message: string }
  | {
      ok: false;
      /** 'support' = no placement (not consumed); 'slip' = placed then slid (consumed). */
      reason: 'support' | 'slip';
      message: string;
      pose: PlankPose | null;
    };

/** Where the two ends of a board placed ahead of the car land. */
export function plankSupports(
  carX: number,
  carZ: number,
  yaw: number,
): { near: { x: number; z: number }; far: { x: number; z: number }; center: { x: number; z: number } } {
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  const half = PLANK.length / 2;
  const center = {
    x: carX + forwardX * PLANK.ahead,
    z: carZ + forwardZ * PLANK.ahead,
  };
  return {
    center,
    near: { x: center.x - forwardX * half, z: center.z - forwardZ * half },
    far: { x: center.x + forwardX * half, z: center.z + forwardZ * half },
  };
}

/**
 * Decide whether a plank would sit on two supports. `nearY` / `farY` are the
 * ground heights under each end (null when the downward ray found no ground).
 */
export function planPlank(
  carX: number,
  carZ: number,
  yaw: number,
  nearY: number | null,
  farY: number | null,
): PlankPlacement {
  const supports = plankSupports(carX, carZ, yaw);
  const pose = (ny: number, fy: number): PlankPose => ({
    centerX: supports.center.x,
    centerY: (ny + fy) / 2 + PLANK.thickness / 2,
    centerZ: supports.center.z,
    yaw,
    pitch: -Math.atan2(fy - ny, PLANK.length),
    nearY: ny,
    farY: fy,
  });

  if (nearY === null || farY === null) {
    const which = nearY === null && farY === null ? '两端' : nearY === null ? '近端' : '远端';
    return {
      ok: false,
      reason: 'support',
      message: `木板需要两个受力点：${which}悬空，往前/往后挪一点再放`,
      pose: null,
    };
  }

  const heightDiff = Math.abs(farY - nearY);
  if (heightDiff > PLANK.maxHeightDiff) {
    return {
      ok: false,
      reason: 'slip',
      message: `两端高差 ${heightDiff.toFixed(1)} m · 斜放会打滑，找平一点再放`,
      pose: pose(nearY, farY),
    };
  }

  return {
    ok: true,
    pose: pose(nearY, farY),
    message: `木板已架好 · 4 m · 两端高差 ${heightDiff.toFixed(2)} m`,
  };
}

/** Sag under the car, 0 when the car is not over the board. */
export function plankSagFor(
  carX: number,
  carZ: number,
  pose: PlankPose,
  speedKmh: number,
): number {
  const dx = carX - pose.centerX;
  const dz = carZ - pose.centerZ;
  const forwardX = Math.sin(pose.yaw);
  const forwardZ = Math.cos(pose.yaw);
  const along = dx * forwardX + dz * forwardZ;
  const across = dx * -forwardZ + dz * forwardX;
  if (Math.abs(along) > PLANK.length / 2 || Math.abs(across) > PLANK.width / 2) {
    return 0;
  }
  const centerLoad = clamp(1 - Math.abs(along) / (PLANK.length / 2), 0.35, 1);
  const speedLoad = clamp(speedKmh / 20, 0, 1);
  return PLANK.sag * (0.55 * centerLoad + 0.45 * speedLoad);
}
