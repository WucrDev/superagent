import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { DrivingInput } from '../core/input';
import { clamp, damp } from '../core/math';

const CAR_MASS = 1200;
const ENGINE_FORCE = 9000;
const REVERSE_FORCE = 4500;
const BRAKE_FORCE = 15000;
const MAX_SPEED = 28;
const MAX_REVERSE_SPEED = 8;
const MAX_YAW_RATE = 1.5;
const WHEEL_RADIUS = 0.36;
const WHEEL_BASE = 1.35;
const TRACK_HALF = 0.99;

/**
 * W1 skeleton vehicle: a rigid box with wheel visuals and an arcade force model.
 *
 * This is a placeholder so the 60 Hz loop, input and chase camera can be
 * verified end-to-end. W1 #2 / issue #8 replaces it with the 8-ray spring-damper
 * suspension (Rapier ray casts), which is where the real handling work belongs.
 */
export class PlaceholderCar {
  readonly group = new THREE.Group();

  private readonly body: RAPIER.RigidBody;
  private readonly tires: THREE.Mesh[] = [];
  private wheelSpin = 0;
  private forwardSpeed = 0;

  constructor(scene: THREE.Scene, world: RAPIER.World) {
    this.buildVisuals();
    scene.add(this.group);

    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, 0.5, 0)
        .setLinearDamping(0.08)
        .setAngularDamping(1.2),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(1.0, 0.4, 2.1)
        .setMass(CAR_MASS)
        // The placeholder slides on its box collider, so surface friction would
        // fight the arcade engine force. Lateral grip is applied explicitly in
        // applyInput(); the real tire model arrives with W1 #2 / issue #8.
        .setFriction(0)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setRestitution(0.02),
      this.body,
    );

    // Keep the placeholder flat on the ground: allow yaw only.
    this.body.setEnabledRotations(false, true, false, true);
    this.sync(0);
  }

  get speedKmh(): number {
    return Math.abs(this.forwardSpeed) * 3.6;
  }

  get position(): THREE.Vector3 {
    const t = this.body.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  get forward(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, 1).applyQuaternion(this.rotation());
  }

  applyInput(dt: number, input: DrivingInput): void {
    const rotation = this.rotation();
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation);
    const velocity = this.body.linvel();
    const forwardSpeed = velocity.x * forward.x + velocity.z * forward.z;
    const lateralSpeed = velocity.x * right.x + velocity.z * right.z;

    const throttle = clamp(input.throttle, 0, 1);
    const brake = clamp(input.brake, 0, 1);

    if (throttle > 0 && forwardSpeed < MAX_SPEED) {
      this.body.applyImpulse(forward.clone().multiplyScalar(ENGINE_FORCE * throttle * dt), true);
    }

    if (brake > 0) {
      if (forwardSpeed > 1) {
        this.body.applyImpulse(
          forward.clone().multiplyScalar(-BRAKE_FORCE * brake * dt),
          true,
        );
      } else if (forwardSpeed > -MAX_REVERSE_SPEED) {
        this.body.applyImpulse(
          forward.clone().multiplyScalar(-REVERSE_FORCE * brake * dt),
          true,
        );
      }
    }

    if (input.handbrake) {
      this.body.applyImpulse(
        forward.clone().multiplyScalar(-forwardSpeed * CAR_MASS * 0.5 * dt),
        true,
      );
    }

    // Rolling resistance keeps the car from coasting forever.
    this.body.applyImpulse(forward.clone().multiplyScalar(-forwardSpeed * 10 * dt), true);

    const speedFactor = clamp(Math.abs(forwardSpeed) / 8, 0, 1);
    const direction = forwardSpeed >= -0.1 ? 1 : -1;
    const targetYaw = input.steer * MAX_YAW_RATE * speedFactor * direction;
    const yaw = damp(this.body.angvel().y, targetYaw, 8, dt);
    this.body.setAngvel({ x: 0, y: yaw, z: 0 }, true);

    // Simple lateral grip: cancel most sideways velocity each step.
    const grip = input.handbrake ? 2.5 : 9;
    const lateralImpulse = -lateralSpeed * CAR_MASS * Math.min(1, grip * dt);
    this.body.applyImpulse(right.clone().multiplyScalar(lateralImpulse), true);
  }

  sync(dt: number): void {
    const t = this.body.translation();
    const q = this.body.rotation();
    this.group.position.set(t.x, t.y, t.z);
    this.group.quaternion.set(q.x, q.y, q.z, q.w);

    const velocity = this.body.linvel();
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion);
    this.forwardSpeed = velocity.x * forward.x + velocity.z * forward.z;
    this.wheelSpin += (this.forwardSpeed * dt) / WHEEL_RADIUS;
    for (const tire of this.tires) {
      tire.rotation.y = this.wheelSpin;
    }
  }

  reset(): void {
    this.body.setTranslation({ x: 0, y: 0.5, z: 0 }, true);
    this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.wheelSpin = 0;
    this.forwardSpeed = 0;
    this.sync(0);
  }

  private rotation(): THREE.Quaternion {
    const q = this.body.rotation();
    return new THREE.Quaternion(q.x, q.y, q.z, q.w);
  }

  private buildVisuals(): void {
    const bodyMesh = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.8, 4.2),
      new THREE.MeshStandardMaterial({ color: 0xd95f2b, roughness: 0.5, metalness: 0.15 }),
    );
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    this.group.add(bodyMesh);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.72, 0.62, 1.9),
      new THREE.MeshStandardMaterial({ color: 0x22303a, roughness: 0.25, metalness: 0.35 }),
    );
    cabin.position.set(0, 0.62, -0.15);
    cabin.castShadow = true;
    this.group.add(cabin);

    const bumperMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.8 });
    for (const z of [-2.04, 2.04]) {
      const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.22, 0.28), bumperMaterial);
      bumper.position.set(0, -0.18, z);
      bumper.castShadow = true;
      this.group.add(bumper);
    }

    const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });
    for (const z of [-WHEEL_BASE, WHEEL_BASE]) {
      for (const x of [-TRACK_HALF, TRACK_HALF]) {
        const pivot = new THREE.Group();
        pivot.position.set(x, -0.04, z);
        pivot.rotation.z = Math.PI / 2;

        const tire = new THREE.Mesh(
          new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.3, 20),
          tireMaterial,
        );
        tire.castShadow = true;
        pivot.add(tire);
        this.group.add(pivot);
        this.tires.push(tire);
      }
    }
  }
}
