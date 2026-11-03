import * as THREE from 'three';
import { clamp } from '../core/math';
import type { PlaceholderCar } from './placeholderCar';

const MIN_DISTANCE = 6;
const MAX_DISTANCE = 16;
const HEIGHT = 4.2;

/** Third-person chase camera; free/cockpit cameras are W1 #4 / issue #10. */
export class FollowCamera {
  private readonly target = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private distance = 9;

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    window.addEventListener('wheel', this.onWheel, { passive: true });
  }

  update(dt: number, car: PlaceholderCar): void {
    const position = car.position;
    const forward = car.forward;

    this.desired
      .copy(position)
      .addScaledVector(forward, -this.distance)
      .add(new THREE.Vector3(0, HEIGHT, 0));
    this.camera.position.lerp(this.desired, 1 - Math.exp(-6 * dt));

    this.target.lerp(
      new THREE.Vector3(position.x, position.y + 1.1, position.z),
      1 - Math.exp(-10 * dt),
    );
    this.camera.lookAt(this.target);
  }

  snap(car: PlaceholderCar): void {
    const position = car.position;
    this.camera.position
      .copy(position)
      .addScaledVector(car.forward, -this.distance)
      .add(new THREE.Vector3(0, HEIGHT, 0));
    this.target.set(position.x, position.y + 1.1, position.z);
    this.camera.lookAt(this.target);
  }

  dispose(): void {
    window.removeEventListener('wheel', this.onWheel);
  }

  private readonly onWheel = (event: WheelEvent): void => {
    this.distance = clamp(this.distance + event.deltaY * 0.01, MIN_DISTANCE, MAX_DISTANCE);
  };
}
