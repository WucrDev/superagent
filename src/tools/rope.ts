import * as THREE from 'three';
import { WINCH } from './winchMath';

export type GroundHeight = (x: number, z: number) => number;

export interface RopeStepOptions {
  stiffness?: number;
  damping?: number;
  iterations?: number;
  gravity?: number;
}

/**
 * W3 #17 / docs/winch-design.md §4: 16-segment position-based rope.
 *
 * The endpoints are pinned by the winch (car hook / anchor). Internal points
 * integrate with Verlet, are projected onto the segment-length constraints four
 * times, then dropped onto the terrain. The visual mesh reads `points`; the
 * pulling force is computed separately from the endpoint stretch so the feel
 * does not depend on PBD convergence.
 */
export class Rope {
  readonly points: THREE.Vector3[] = [];
  private readonly previous: THREE.Vector3[] = [];
  private restLength = 1;

  constructor(readonly segments = WINCH.segments) {
    if (segments < 2) throw new Error('rope needs at least 2 segments');
    for (let index = 0; index <= segments; index += 1) {
      this.points.push(new THREE.Vector3());
      this.previous.push(new THREE.Vector3());
    }
  }

  get rest(): number {
    return this.restLength;
  }

  get start(): THREE.Vector3 {
    return this.points[0]!;
  }

  get end(): THREE.Vector3 {
    return this.points[this.segments]!;
  }

  get endpointDistance(): number {
    return this.start.distanceTo(this.end);
  }

  /** Stretch beyond the spooled rest length; 0 while slack. */
  get stretchRatio(): number {
    if (this.restLength <= 0) return 0;
    return Math.max(0, this.endpointDistance - this.restLength) / this.restLength;
  }

  reset(start: THREE.Vector3, end: THREE.Vector3, restLength: number): void {
    this.restLength = Math.max(0.5, restLength);
    this.stretchTo(start, end);
  }

  setRestLength(length: number): void {
    this.restLength = Math.max(0.5, length);
  }

  /** Lay the points straight between the endpoints (hook flight / reset). */
  stretchTo(start: THREE.Vector3, end: THREE.Vector3): void {
    for (let index = 0; index <= this.segments; index += 1) {
      const point = this.points[index]!;
      point.lerpVectors(start, end, index / this.segments);
      this.previous[index]!.copy(point);
    }
  }

  step(
    dt: number,
    start: THREE.Vector3,
    end: THREE.Vector3,
    ground: GroundHeight,
    options: RopeStepOptions = {},
  ): void {
    this.integrate(dt, options, false);
    this.pin(start, end);
    this.solve(ground, options, end);
    this.pin(start, end);
  }

  /** Used after a release/snap: only the car end is still held. */
  freeStep(
    dt: number,
    start: THREE.Vector3,
    ground: GroundHeight,
    options: RopeStepOptions = {},
  ): void {
    this.integrate(dt, options, true);
    this.pin(start, null);
    this.solve(ground, options, null);
    this.pin(start, null);
  }

  private integrate(dt: number, options: RopeStepOptions, includeEnd: boolean): void {
    const damping = options.damping ?? WINCH.damping;
    const gravity = options.gravity ?? WINCH.gravity;
    const last = includeEnd ? this.segments : this.segments - 1;
    const gravityStep = -gravity * dt * dt;
    for (let index = 1; index <= last; index += 1) {
      const point = this.points[index]!;
      const previous = this.previous[index]!;
      const vx = (point.x - previous.x) * (1 - damping);
      const vy = (point.y - previous.y) * (1 - damping);
      const vz = (point.z - previous.z) * (1 - damping);
      previous.copy(point);
      point.x += vx;
      point.y += vy + gravityStep;
      point.z += vz;
    }
  }

  private solve(ground: GroundHeight, options: RopeStepOptions, end: THREE.Vector3 | null): void {
    const stiffness = options.stiffness ?? WINCH.stiffness;
    const iterations = options.iterations ?? WINCH.iterations;
    const segment = this.restLength / this.segments;
    const startPinned = true;
    const endPinned = end !== null;
    const last = this.segments - 1;
    const lastFreePoint = endPinned ? this.segments - 1 : this.segments;

    for (let iteration = 0; iteration < iterations; iteration += 1) {
      for (let index = 0; index < this.segments; index += 1) {
        const a = this.points[index]!;
        const b = this.points[index + 1]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const length = Math.hypot(dx, dy, dz);
        if (length < 1e-6) continue;
        const correction = (length - segment) / length;
        const aPinned = startPinned && index === 0;
        const bPinned = endPinned && index === last;
        if (aPinned && bPinned) continue;
        if (aPinned) {
          b.x -= dx * correction * stiffness;
          b.y -= dy * correction * stiffness;
          b.z -= dz * correction * stiffness;
        } else if (bPinned) {
          a.x += dx * correction * stiffness;
          a.y += dy * correction * stiffness;
          a.z += dz * correction * stiffness;
        } else {
          const half = correction * stiffness * 0.5;
          a.x += dx * half;
          a.y += dy * half;
          a.z += dz * half;
          b.x -= dx * half;
          b.y -= dy * half;
          b.z -= dz * half;
        }
      }

      for (let index = 1; index <= lastFreePoint; index += 1) {
        const point = this.points[index]!;
        const floor = ground(point.x, point.z) + 0.06;
        if (point.y < floor) {
          point.y = floor;
          const previous = this.previous[index]!;
          previous.y = Math.max(previous.y, floor);
        }
      }
    }
  }

  private pin(start: THREE.Vector3, end: THREE.Vector3 | null): void {
    this.points[0]!.copy(start);
    this.previous[0]!.copy(start);
    if (end) {
      this.points[this.segments]!.copy(end);
      this.previous[this.segments]!.copy(end);
    }
  }
}
