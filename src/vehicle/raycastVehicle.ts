import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { DrivingInput } from '../core/input';
import { clamp } from '../core/math';
import { Drivetrain } from './drivetrain';

const CHASSIS_MASS = 1500;
const CHASSIS_HALF_WIDTH = 0.9;
const CHASSIS_HALF_HEIGHT = 0.3;
const CHASSIS_HALF_LENGTH = 1.9;

const WHEEL_RADIUS = 0.36;
const SUSPENSION_REST = 0.25;
const SUSPENSION_MAX_COMPRESSION = 0.2;
const SPRING_K = 46000;
const SPRING_C = 4800;
const ANCHOR_Y = -CHASSIS_HALF_HEIGHT;

const RAYS_PER_WHEEL = 8;
const RAY_RADIUS = 0.16;
const MAX_STEER = 0.5;

const ENGINE_FORCE = 8000;
const BRAKE_FORCE = 18000;
const LATERAL_GRIP = 7.5;
const YAW_DAMPING = 900;
const PITCH_ROLL_DAMPING = 500;

interface WheelDef {
  x: number;
  z: number;
  steer: boolean;
  drive: boolean;
}

const WHEELS: WheelDef[] = [
  { x: -0.86, z: 1.85, steer: true, drive: true },
  { x: 0.86, z: 1.85, steer: true, drive: true },
  { x: -0.86, z: -1.85, steer: false, drive: true },
  { x: 0.86, z: -1.85, steer: false, drive: true },
];

const DRIVEN_WHEELS = WHEELS.filter((wheel) => wheel.drive).length;

interface WheelState {
  compression: number;
  length: number;
  grounded: boolean;
  contactNormal: THREE.Vector3;
  contactPoint: THREE.Vector3;
  steerAngle: number;
  spin: number;
  root: THREE.Group;
  tire: THREE.Mesh;
}

/**
 * W1 #2 / issue #8: raycast vehicle with 8 suspension rays per wheel.
 *
 * Per wheel we cast 8 short rays around the tire contact patch, use the closest
 * hit for spring compression and surface normal, then apply spring/damper and
 * tire forces at the contact point. The engine/gearbox is W1 #3 / issue #9; the
 * tire model and surface friction curves mature in W2.
 */
export class RaycastVehicle {
  readonly group = new THREE.Group();
  readonly exterior = new THREE.Group();
  readonly cockpit = new THREE.Group();
  readonly drivetrain = new Drivetrain();

  private readonly body: RAPIER.RigidBody;
  private readonly wheelStates: WheelState[] = [];
  private readonly steeringWheel: THREE.Group;
  private forwardSpeed = 0;
  private lastSteer = 0;
  private readonly onShift?: () => void;

  constructor(
    scene: THREE.Scene,
    private readonly world: RAPIER.World,
    onShift?: () => void,
  ) {
    this.onShift = onShift;
    this.buildExterior();
    this.steeringWheel = this.buildCockpit();
    this.group.add(this.exterior, this.cockpit);
    this.cockpit.visible = false;
    scene.add(this.group);

    this.body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, 1.4, 0)
        .setLinearDamping(0.04)
        .setAngularDamping(0.3)
        .setCcdEnabled(true),
    );

    // Low centre of mass keeps the blocky chassis from tripping over itself.
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(CHASSIS_HALF_WIDTH, CHASSIS_HALF_HEIGHT, CHASSIS_HALF_LENGTH)
        .setMassProperties(
          CHASSIS_MASS,
          { x: 0, y: -0.2, z: 0 },
          { x: 2200, y: 2600, z: 560 },
          { x: 0, y: 0, z: 0, w: 1 },
        )
        .setFriction(0.5)
        .setRestitution(0.05),
      this.body,
    );

    this.sync(0);
  }

  get gear(): 'L' | 'H' {
    return this.drivetrain.gear;
  }

  get speedKmh(): number {
    return Math.abs(this.forwardSpeed) * 3.6;
  }

  get position(): THREE.Vector3 {
    const t = this.body.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  get forward(): THREE.Vector3 {
    const q = this.body.rotation();
    return new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
  }

  get up(): THREE.Vector3 {
    const q = this.body.rotation();
    return new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
  }

  setCockpit(active: boolean): void {
    this.cockpit.visible = active;
    this.exterior.visible = !active;
  }

  update(dt: number, input: DrivingInput): void {
    this.drivetrain.update(dt);
    this.lastSteer = input.steer;

    if (input.shiftUp && this.drivetrain.shiftUp()) this.onShift?.();
    if (input.shiftDown && this.drivetrain.shiftDown()) this.onShift?.();

    const q = this.body.rotation();
    const rotation = new THREE.Quaternion(q.x, q.y, q.z, q.w);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
    const chassisForward = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation);
    const chassisRight = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation);

    const velocity = this.body.linvel();
    const speed = velocity.x * chassisForward.x + velocity.y * chassisForward.y + velocity.z * chassisForward.z;

    const gearMax = this.drivetrain.maxSpeed;
    const torqueFactor = this.drivetrain.shifting ? 0 : this.drivetrain.torqueFactor;
    const engineForce =
      input.throttle *
      ENGINE_FORCE *
      torqueFactor *
      clamp((gearMax - Math.max(0, speed)) / 0.6, 0, 1);
    const perWheelDrive = engineForce / DRIVEN_WHEELS;
    const perWheelBrake = (input.brake * BRAKE_FORCE) / WHEELS.length;
    const handbrakeForce = input.handbrake ? (BRAKE_FORCE * 1.15) / WHEELS.length : 0;

    for (let index = 0; index < WHEELS.length; index += 1) {
      this.updateWheel(
        index,
        dt,
        input,
        rotation,
        up,
        chassisForward,
        chassisRight,
        perWheelDrive,
        perWheelBrake,
        handbrakeForce,
      );
    }

    const angular = this.body.angvel();
    this.body.applyTorqueImpulse(
      {
        x: -angular.x * PITCH_ROLL_DAMPING * dt,
        y: -angular.y * YAW_DAMPING * dt,
        z: -angular.z * PITCH_ROLL_DAMPING * dt,
      },
      true,
    );
  }

  sync(dt: number): void {
    const t = this.body.translation();
    const q = this.body.rotation();
    this.group.position.set(t.x, t.y, t.z);
    this.group.quaternion.set(q.x, q.y, q.z, q.w);

    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion);
    const velocity = this.body.linvel();
    this.forwardSpeed =
      velocity.x * forward.x + velocity.y * forward.y + velocity.z * forward.z;

    for (let index = 0; index < WHEELS.length; index += 1) {
      const config = WHEELS[index]!;
      const state = this.wheelStates[index]!;
      state.root.position.set(config.x, ANCHOR_Y - state.length, config.z);
      state.root.rotation.y = state.steerAngle;
      state.spin += (this.forwardSpeed * dt) / WHEEL_RADIUS;
      state.tire.rotation.y = state.spin;
    }

    this.steeringWheel.rotation.z = this.lastSteer * 1.8;
  }

  reset(): void {
    this.body.setTranslation({ x: 0, y: 1.4, z: 0 }, true);
    this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.drivetrain.reset();
    this.forwardSpeed = 0;
    this.lastSteer = 0;
    for (const state of this.wheelStates) {
      state.compression = 0;
      state.length = SUSPENSION_REST;
      state.grounded = false;
      state.spin = 0;
      state.steerAngle = 0;
    }
    this.sync(0);
  }

  private updateWheel(
    index: number,
    dt: number,
    input: DrivingInput,
    rotation: THREE.Quaternion,
    up: THREE.Vector3,
    chassisForward: THREE.Vector3,
    chassisRight: THREE.Vector3,
    driveForce: number,
    brakeForce: number,
    handbrakeForce: number,
  ): void {
    const config = WHEELS[index]!;
    const state = this.wheelStates[index]!;
    const bodyPosition = this.body.translation();
    const anchor = new THREE.Vector3(config.x, ANCHOR_Y, config.z)
      .applyQuaternion(rotation)
      .add(new THREE.Vector3(bodyPosition.x, bodyPosition.y, bodyPosition.z));
    const direction = up.clone().multiplyScalar(-1);
    const maxRayLength = SUSPENSION_REST + WHEEL_RADIUS;

    let closestDistance = Number.POSITIVE_INFINITY;
    let closestNormal = up.clone();
    let closestPoint = new THREE.Vector3();
    let surfaceFriction = 1.0;

    for (let ray = 0; ray < RAYS_PER_WHEEL; ray += 1) {
      const angle = (ray / RAYS_PER_WHEEL) * Math.PI * 2;
      const offset = chassisRight
        .clone()
        .multiplyScalar(Math.cos(angle) * RAY_RADIUS)
        .add(chassisForward.clone().multiplyScalar(Math.sin(angle) * RAY_RADIUS));
      const origin = anchor.clone().add(offset);
      const hit = this.world.castRayAndGetNormal(
        new RAPIER.Ray(
          { x: origin.x, y: origin.y, z: origin.z },
          { x: direction.x, y: direction.y, z: direction.z },
        ),
        maxRayLength,
        true,
        undefined,
        undefined,
        undefined,
        this.body,
      );
      if (!hit) continue;

      if (hit.timeOfImpact < closestDistance) {
        closestDistance = hit.timeOfImpact;
        closestNormal = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z);
        closestPoint = origin.addScaledVector(direction, hit.timeOfImpact);
        surfaceFriction = clamp(hit.collider.friction(), 0.05, 1.2);
      }
    }

    state.steerAngle = config.steer ? input.steer * MAX_STEER : 0;

    if (!Number.isFinite(closestDistance)) {
      state.grounded = false;
      state.compression = 0;
      state.length = SUSPENSION_REST;
      state.contactNormal.copy(up);
      state.contactPoint
        .copy(anchor)
        .addScaledVector(direction, SUSPENSION_REST + WHEEL_RADIUS);
      return;
    }

    state.grounded = true;
    const compression = clamp(
      SUSPENSION_REST + WHEEL_RADIUS - closestDistance,
      0,
      SUSPENSION_MAX_COMPRESSION,
    );
    state.compression = compression;
    state.length = SUSPENSION_REST - compression;
    const normal = closestNormal.normalize();
    state.contactNormal.copy(normal);
    state.contactPoint.copy(closestPoint);

    const contactVelocity = this.body.velocityAtPoint({
      x: closestPoint.x,
      y: closestPoint.y,
      z: closestPoint.z,
    });
    const normalVelocity =
      contactVelocity.x * normal.x + contactVelocity.y * normal.y + contactVelocity.z * normal.z;

    let springForce = SPRING_K * compression - SPRING_C * normalVelocity;
    if (compression >= SUSPENSION_MAX_COMPRESSION - 1e-4) {
      springForce += SPRING_K * 4 * (compression - SUSPENSION_MAX_COMPRESSION + 1e-4);
    }
    springForce = Math.max(0, springForce);

    const springImpulse = springForce * dt;
    this.body.applyImpulseAtPoint(
      { x: normal.x * springImpulse, y: normal.y * springImpulse, z: normal.z * springImpulse },
      { x: closestPoint.x, y: closestPoint.y, z: closestPoint.z },
      true,
    );

    const wheelForward = chassisForward.clone();
    if (config.steer) wheelForward.applyAxisAngle(up, state.steerAngle);
    wheelForward.addScaledVector(normal, -wheelForward.dot(normal)).normalize();
    const wheelRight = normal.clone().cross(wheelForward).normalize();

    const longSpeed =
      contactVelocity.x * wheelForward.x +
      contactVelocity.y * wheelForward.y +
      contactVelocity.z * wheelForward.z;
    const latSpeed =
      contactVelocity.x * wheelRight.x +
      contactVelocity.y * wheelRight.y +
      contactVelocity.z * wheelRight.z;

    const maxFrictionImpulse = surfaceFriction * Math.max(springForce, 300) * dt;
    let longitudinal = config.drive ? driveForce : 0;
    const gravityAlong = -9.81 * wheelForward.y;

    // Rolling resistance / engine braking keeps the car from free-rolling.
    longitudinal -= longSpeed * 30;

    if (brakeForce > 0) {
      if (longSpeed > 0.2) longitudinal -= brakeForce;
      else if (longSpeed < -0.2) longitudinal += brakeForce;
      else longitudinal -= gravityAlong * (CHASSIS_MASS / 4);
    }
    if (handbrakeForce > 0) {
      if (longSpeed > 0.05) longitudinal -= handbrakeForce;
      else if (longSpeed < -0.05) longitudinal += handbrakeForce;
      else longitudinal -= gravityAlong * (CHASSIS_MASS / 4);
      longitudinal -= longSpeed * 1200;
    }
    if (
      input.throttle < 0.05 &&
      input.brake < 0.05 &&
      !input.handbrake &&
      Math.abs(longSpeed) < 1.5
    ) {
      // Static friction / engine braking on a slope when the driver is off pedals.
      longitudinal -= gravityAlong * (CHASSIS_MASS / 4);
      longitudinal -= longSpeed * 900;
    }

    const longImpulse = clamp(longitudinal * dt, -maxFrictionImpulse, maxFrictionImpulse);
    this.body.applyImpulseAtPoint(
      {
        x: wheelForward.x * longImpulse,
        y: wheelForward.y * longImpulse,
        z: wheelForward.z * longImpulse,
      },
      { x: closestPoint.x, y: closestPoint.y, z: closestPoint.z },
      true,
    );

    const lateralImpulse = clamp(
      -latSpeed * (CHASSIS_MASS / 4) * LATERAL_GRIP * dt,
      -maxFrictionImpulse,
      maxFrictionImpulse,
    );
    this.body.applyImpulseAtPoint(
      {
        x: wheelRight.x * lateralImpulse,
        y: wheelRight.y * lateralImpulse,
        z: wheelRight.z * lateralImpulse,
      },
      { x: closestPoint.x, y: closestPoint.y, z: closestPoint.z },
      true,
    );
  }

  private buildExterior(): void {
    const bodyMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.6, 4.0),
      new THREE.MeshStandardMaterial({ color: 0xd95f2b, roughness: 0.5, metalness: 0.15 }),
    );
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    this.exterior.add(bodyMesh);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.5, 1.8),
      new THREE.MeshStandardMaterial({ color: 0x22303a, roughness: 0.3, metalness: 0.35 }),
    );
    cabin.position.set(0, 0.55, -0.15);
    cabin.castShadow = true;
    this.exterior.add(cabin);

    const bumperMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.8 });
    for (const z of [-2.02, 2.02]) {
      const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.2, 0.24), bumperMaterial);
      bumper.position.set(0, -0.18, z);
      bumper.castShadow = true;
      this.exterior.add(bumper);
    }

    const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });
    for (const config of WHEELS) {
      const root = new THREE.Group();
      root.position.set(config.x, ANCHOR_Y - SUSPENSION_REST, config.z);
      const steerGroup = new THREE.Group();
      const axleGroup = new THREE.Group();
      axleGroup.rotation.z = Math.PI / 2;

      const tire = new THREE.Mesh(
        new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.3, 20),
        tireMaterial,
      );
      tire.castShadow = true;
      axleGroup.add(tire);
      steerGroup.add(axleGroup);
      root.add(steerGroup);
      this.exterior.add(root);

      this.wheelStates.push({
        compression: 0,
        length: SUSPENSION_REST,
        grounded: false,
        contactNormal: new THREE.Vector3(0, 1, 0),
        contactPoint: new THREE.Vector3(),
        steerAngle: 0,
        spin: 0,
        root,
        tire,
      });
    }
  }

  private buildCockpit(): THREE.Group {
    const dark = new THREE.MeshStandardMaterial({ color: 0x1d2328, roughness: 0.9 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x3b444b, roughness: 0.75 });
    const accent = new THREE.MeshStandardMaterial({ color: 0xc9d1c2, roughness: 0.6 });

    const dashboard = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.2, 0.42), dark);
    dashboard.position.set(0, 0.12, 0.98);
    this.cockpit.add(dashboard);

    const cluster = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.15, 0.06), trim);
    cluster.position.set(-0.32, 0.26, 0.8);
    this.cockpit.add(cluster);

    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.28, 10), trim);
    column.position.set(-0.32, 0.24, 0.76);
    column.rotation.x = Math.PI / 2 - 0.45;
    this.cockpit.add(column);

    const steeringWheel = new THREE.Group();
    steeringWheel.position.set(-0.32, 0.3, 0.72);
    steeringWheel.rotation.x = -0.45;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.024, 8, 24), accent);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 12), dark);
    hub.rotation.x = Math.PI / 2;
    steeringWheel.add(rim, hub);
    this.cockpit.add(steeringWheel);

    const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), trim);
    seatBase.position.set(-0.32, -0.02, -0.2);
    this.cockpit.add(seatBase);
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.12), trim);
    seatBack.position.set(-0.32, 0.22, -0.45);
    seatBack.rotation.x = -0.12;
    this.cockpit.add(seatBack);

    for (const x of [-0.78, 0.78]) {
      const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 1.4), dark);
      doorPanel.position.set(x, 0.12, 0.02);
      this.cockpit.add(doorPanel);
    }

    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.06, 1.7), dark);
    roof.position.set(0, 0.7, -0.1);
    this.cockpit.add(roof);

    for (const x of [-0.62, 0.62]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.08), trim);
      pillar.position.set(x, 0.5, 0.85);
      pillar.rotation.z = x > 0 ? -0.12 : 0.12;
      this.cockpit.add(pillar);
    }

    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.04), dark);
    mirror.position.set(0, 0.65, 0.76);
    this.cockpit.add(mirror);

    // A hood/fender blockout beyond the dashboard: the exterior body is hidden
    // in the cabin camera, so this keeps the engine cover visible through the glass.
    const paint = new THREE.MeshStandardMaterial({
      color: 0xd95f2b,
      roughness: 0.55,
      metalness: 0.12,
    });
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 1.3), paint);
    hood.position.set(0, 0.06, 1.55);
    this.cockpit.add(hood);
    for (const x of [-0.8, 0.8]) {
      const fender = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 1.4), paint);
      fender.position.set(x, 0.02, 1.5);
      this.cockpit.add(fender);
    }
    const frontBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.6, 1.3),
      new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 }),
    );
    frontBody.position.set(0, -0.2, 1.55);
    this.cockpit.add(frontBody);

    return steeringWheel;
  }
}
