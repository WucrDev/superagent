import * as THREE from 'three';
import type { InputManager } from '../core/input';
import { clamp } from '../core/math';
import type { RaycastVehicle } from './raycastVehicle';

export type CameraMode = 'chase' | 'free' | 'cockpit';

export const CAMERA_MODE_LABELS: Record<CameraMode, string> = {
  chase: '第三人称',
  free: '自由',
  cockpit: '座舱',
};

/** W1 #4 / issue #10: chase, free orbit and cabin cameras. */
export class CameraRig {
  mode: CameraMode = 'chase';
  private chaseDistance = 9;
  private freeDistance = 11;
  private orbitYaw = Math.PI;
  private orbitPitch = 0.28;
  private lookYaw = 0;
  private lookPitch = -0.04;
  private chaseFov = 65;
  private cockpitFov = 75;

  private readonly target = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly driverEye = new THREE.Vector3(-0.32, 0.5, 0.0);
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly car: RaycastVehicle,
  ) {
    window.addEventListener('wheel', this.onWheel, { passive: true });
    this.applyProjection();
  }

  get chaseFovValue(): number {
    return this.chaseFov;
  }

  get cockpitFovValue(): number {
    return this.cockpitFov;
  }

  cycle(): CameraMode {
    this.mode = this.mode === 'chase' ? 'free' : this.mode === 'free' ? 'cockpit' : 'chase';
    if (this.mode === 'cockpit') {
      this.lookYaw = 0;
      this.lookPitch = -0.04;
    }
    this.car.setCockpit(this.mode === 'cockpit');
    this.applyProjection();
    return this.mode;
  }

  setFovs(chaseFov: number, cockpitFov: number): void {
    this.chaseFov = clamp(chaseFov, 60, 80);
    this.cockpitFov = clamp(cockpitFov, 60, 90);
    this.applyProjection();
  }

  update(dt: number, input: InputManager): void {
    const mouse = input.consumeMouseLook();
    const stick = input.gamepadLook();

    if (this.mode === 'chase') {
      this.updateChase(dt);
      return;
    }

    if (this.mode === 'free') {
      this.orbitYaw -= mouse.x * 0.005 + stick.x * 1.6 * dt;
      this.orbitPitch = clamp(
        this.orbitPitch - (mouse.y * 0.004 + stick.y * 1.2 * dt),
        0.05,
        1.15,
      );
      this.updateFree(dt);
      return;
    }

    this.lookYaw = clamp(this.lookYaw + mouse.x * 0.003 + stick.x * 1.7 * dt, -1.15, 1.15);
    this.lookPitch = clamp(
      this.lookPitch - (mouse.y * 0.002 + stick.y * 1.1 * dt),
      -0.45,
      0.45,
    );
    this.updateCockpit();
  }

  dispose(): void {
    window.removeEventListener('wheel', this.onWheel);
  }

  private updateChase(dt: number): void {
    const position = this.car.position;
    this.desired
      .copy(position)
      .addScaledVector(this.car.forward, -this.chaseDistance)
      .add(new THREE.Vector3(0, 4.1, 0));
    this.camera.position.lerp(this.desired, 1 - Math.exp(-6 * dt));

    this.target.lerp(
      new THREE.Vector3(position.x, position.y + 1.1, position.z),
      1 - Math.exp(-10 * dt),
    );
    this.camera.lookAt(this.target);
  }

  private updateFree(dt: number): void {
    const position = this.car.position;
    const cosPitch = Math.cos(this.orbitPitch);
    this.desired.set(
      position.x + Math.sin(this.orbitYaw) * cosPitch * this.freeDistance,
      position.y + 1.0 + Math.sin(this.orbitPitch) * this.freeDistance,
      position.z + Math.cos(this.orbitYaw) * cosPitch * this.freeDistance,
    );
    this.camera.position.lerp(this.desired, 1 - Math.exp(-10 * dt));
    this.target.lerp(
      new THREE.Vector3(position.x, position.y + 1.0, position.z),
      1 - Math.exp(-12 * dt),
    );
    this.camera.lookAt(this.target);
  }

  private updateCockpit(): void {
    this.car.group.updateMatrixWorld(true);
    const eye = this.driverEye.clone();
    this.car.group.localToWorld(eye);
    this.camera.position.copy(eye);

    this.tmpEuler.set(this.lookPitch, Math.PI + this.lookYaw, 0, 'YXZ');
    this.tmpQuat.setFromEuler(this.tmpEuler);
    this.camera.quaternion.copy(this.car.group.quaternion).multiply(this.tmpQuat);
  }

  private applyProjection(): void {
    this.camera.fov = this.mode === 'cockpit' ? this.cockpitFov : this.chaseFov;
    this.camera.near = this.mode === 'cockpit' ? 0.05 : 0.12;
    this.camera.updateProjectionMatrix();
  }

  private readonly onWheel = (event: WheelEvent): void => {
    const delta = event.deltaY * 0.01;
    this.chaseDistance = clamp(this.chaseDistance + delta, 5.5, 16);
    this.freeDistance = clamp(this.freeDistance + delta, 5.5, 22);
  };
}
