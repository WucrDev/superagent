import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { DrivingInput } from '../core/input';
import { clamp } from '../core/math';
import {
  VEHICLE_HEALTH,
  applyDamage,
  applyRepair,
  powerFactorFor,
  steerFactorFor,
} from '../tools/healthMath';
import {
  SURFACES,
  TerrainField,
  gripCurve,
  slopeDegFromNormal,
  weatherGripMultiplier,
  type Surface,
} from '../terrain/surfaces';
import { Drivetrain, type Gear } from './drivetrain';

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
// Automatic reverse: hold S after the car has stopped. A short delay prevents
// the brake at a normal stop from immediately turning into reverse.
const REVERSE_FORCE = 6500;
const REVERSE_MAX_SPEED = 12 / 3.6; // 12 km/h (owner range 10-15 km/h)
const REVERSE_ENGAGE_SPEED = 0.6; // m/s: must be near standstill
const REVERSE_ENGAGE_DELAY = 0.45; // s: holding S at rest before R engages
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
  contactForward: THREE.Vector3;
  steerAngle: number;
  spin: number;
  root: THREE.Group;
  tire: THREE.Mesh;
  surface: Surface;
  slipSpeed: number;
  waterDepth: number;
}

/** Read-only snapshot used by the effects layer (W2 #7) and debug tooling. */
export interface WheelContact {
  grounded: boolean;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  forward: THREE.Vector3;
  surface: Surface;
  slipSpeed: number;
  waterDepth: number;
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
  /** Body/cabin/bumpers only: the winch can pitch this without moving the wheels. */
  readonly bodyShell = new THREE.Group();
  readonly cockpit = new THREE.Group();
  readonly drivetrain = new Drivetrain();

  private readonly body: RAPIER.RigidBody;
  private readonly chassisCollider: RAPIER.Collider;
  private readonly wheelStates: WheelState[] = [];
  private readonly steeringWheel: THREE.Group;
  private readonly speedNeedle: THREE.Object3D;
  private readonly tachNeedle: THREE.Object3D;
  private forwardSpeed = 0;
  private lastSteer = 0;
  private readonly onShift?: () => void;
  private waterIngressLevel = 0;
  private slopeAngle = 0;
  private maxSlip = 0;
  private dominantSurface: Surface = SURFACES.dirt;
  private winchAssist = 1;
  private winchLoad = 0;
  private reverse = false;
  private reverseHold = 0;
  private health: number = VEHICLE_HEALTH.max;
  private wetness = 0;
  private damageFlash = 0;
  private jackStartPosition = new THREE.Vector3();
  private jackStartRotation = new THREE.Quaternion();
  private jacking = false;

  constructor(
    scene: THREE.Scene,
    private readonly world: RAPIER.World,
    onShift?: () => void,
    private readonly terrain?: TerrainField,
  ) {
    this.onShift = onShift;
    this.buildExterior();
    const cockpit = this.buildCockpit();
    this.steeringWheel = cockpit.steeringWheel;
    this.speedNeedle = cockpit.speedNeedle;
    this.tachNeedle = cockpit.tachNeedle;
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
    // W4 #23: contact-force events on the chassis are the damage source. The
    // suspension is raycast-based, so a chassis contact really is a crash or a
    // hard landing, not normal driving.
    this.chassisCollider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(CHASSIS_HALF_WIDTH, CHASSIS_HALF_HEIGHT, CHASSIS_HALF_LENGTH)
        .setMassProperties(
          CHASSIS_MASS,
          { x: 0, y: -0.2, z: 0 },
          { x: 2200, y: 2600, z: 560 },
          { x: 0, y: 0, z: 0, w: 1 },
        )
        .setFriction(0.5)
        .setRestitution(0.05)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(VEHICLE_HEALTH.impactForceThreshold),
      this.body,
    );

    this.sync(0);
  }

  get gear(): Gear {
    return this.reverse ? 'R' : this.drivetrain.gear;
  }

  /** True while holding S at a standstill has engaged reverse. */
  get isReversing(): boolean {
    return this.reverse;
  }

  /** HUD gear: L/H, or R while the automatic reverse is engaged. */
  get displayGear(): Gear {
    return this.gear;
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

  /** W2 #7 / issue #13: contact-normal slope under the car, in degrees. */
  get slopeDeg(): number {
    return this.slopeAngle;
  }

  /** W2 #6: largest contact-patch slip speed, used by the effects layer. */
  get slipSpeed(): number {
    return this.maxSlip;
  }

  /** W2 #6: surface under most grounded wheels (for labelling and evidence). */
  get currentSurface(): Surface {
    return this.dominantSurface;
  }

  /** W2 #7: 0..1 engine-ingress level; 1 = full 40 % power loss. */
  get waterIngress(): number {
    return this.waterIngressLevel;
  }

  /** W2 #7: throttle multiplier caused by water ingress (1 = dry). */
  get powerFactor(): number {
    return 1 - 0.4 * this.waterIngressLevel;
  }

  get contacts(): WheelContact[] {
    return this.wheelStates.map((state) => ({
      grounded: state.grounded,
      point: state.contactPoint.clone(),
      normal: state.contactNormal.clone(),
      forward: state.contactForward.clone(),
      surface: state.surface,
      slipSpeed: state.slipSpeed,
      waterDepth: state.waterDepth,
    }));
  }

  setCockpit(active: boolean): void {
    this.cockpit.visible = active;
    this.exterior.visible = !active;
  }

  /** W3 #17: world-space front hook point the rope pulls on. */
  get hookPoint(): THREE.Vector3 {
    const t = this.body.translation();
    const q = this.body.rotation();
    return new THREE.Vector3(0, 0.05, 2.15)
      .applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w))
      .add(new THREE.Vector3(t.x, t.y, t.z));
  }

  get velocity(): THREE.Vector3 {
    const v = this.body.linvel();
    return new THREE.Vector3(v.x, v.y, v.z);
  }

  get mass(): number {
    return CHASSIS_MASS;
  }

  /** W4 #23: 0..100 current vehicle condition. */
  get healthValue(): number {
    return this.health;
  }

  /** Multiplier on engine torque from crash damage (1 while healthy). */
  get damagePowerFactor(): number {
    return powerFactorFor(this.health);
  }

  /** Multiplier on steering angle from crash damage (1 while healthy). */
  get damageSteerFactor(): number {
    return steerFactorFor(this.health);
  }

  /** 1 right after a hit, decaying over ~0.8 s for the HUD flash. */
  get damageFlashLevel(): number {
    return this.damageFlash;
  }

  /** W4 #23: apply crash damage; returns the health actually lost. */
  applyDamage(amount: number): number {
    const before = this.health;
    this.health = applyDamage(this.health, amount);
    const lost = before - this.health;
    if (lost > 0) this.damageFlash = 1;
    return lost;
  }

  /** W4 #23: repair kit heals up to the 100 cap; returns the health restored. */
  repairHealth(amount: number): number {
    const before = this.health;
    this.health = applyRepair(this.health, amount);
    return this.health - before;
  }

  /** W5 #22: restore a checkpoint's condition without a repair animation. */
  restoreHealth(value: number): void {
    this.health = clamp(value, 0, VEHICLE_HEALTH.max);
  }

  /** W5 #20: 0 = dry, 1 = fully soaked; scales both tire friction terms. */
  setWetness(value: number): void {
    this.wetness = clamp(value, 0, 1);
  }

  get wetnessValue(): number {
    return this.wetness;
  }

  get rigidBody(): RAPIER.RigidBody {
    return this.body;
  }

  get chassisColliderHandle(): number {
    return this.chassisCollider.handle;
  }

  /** W3 #20: true once the chassis is on its side or roof. */
  get isRolledOver(): boolean {
    return this.up.y < 0.35;
  }

  /** W3 #17: apply a winch impulse at the front hook. */
  applyWinchImpulse(impulse: THREE.Vector3, point: THREE.Vector3): void {
    this.body.applyImpulseAtPoint(
      { x: impulse.x, y: impulse.y, z: impulse.z },
      { x: point.x, y: point.y, z: point.z },
      true,
    );
  }

  /** W3 #19: throttle still helps, but only ~35 % while the rope is loaded. */
  setWinchAssist(active: boolean): void {
    this.winchAssist = active ? 0.35 : 1;
  }

  /** 0..1 rope load, used for the subtle nose-down visual. */
  setWinchLoad(load: number): void {
    this.winchLoad = clamp(load, 0, 1.5);
  }

  /** W4 #22: start a hydraulic-jack lift; remember the pose to animate from. */
  beginJack(): void {
    const t = this.body.translation();
    const q = this.body.rotation();
    this.jackStartPosition.set(t.x, t.y, t.z);
    this.jackStartRotation.set(q.x, q.y, q.z, q.w);
    this.jacking = true;
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  /**
   * W4 #22: animate the chassis from its rolled pose to upright over the jack
   * progress (0..1). The body is moved directly and its velocity zeroed so the
   * lift reads as a hydraulic jack rather than a physics bounce.
   */
  applyJackProgress(progress: number): void {
    if (!this.jacking) return;
    const t = clamp(progress, 0, 1);
    const eased = t * t * (3 - 2 * t);
    const forward = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(this.jackStartRotation);
    forward.y = 0;
    if (forward.lengthSq() < 1e-4) forward.set(0, 0, 1);
    forward.normalize();
    const yaw = Math.atan2(forward.x, forward.z);
    const upright = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      yaw,
    );
    const rotation = this.jackStartRotation.clone().slerp(upright, eased);
    const lift = 0.45 * Math.sin(Math.PI * Math.min(1, t));
    this.body.setTranslation(
      {
        x: this.jackStartPosition.x,
        y: this.jackStartPosition.y + lift,
        z: this.jackStartPosition.z,
      },
      true,
    );
    this.body.setRotation(
      { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
      true,
    );
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  /** Finish or abort the jack animation; the car settles on its wheels. */
  endJack(): void {
    this.jacking = false;
  }

  /** W3 #20: righting action used at the end of the W4 jack animation. */
  rightAtCurrent(): void {
    const t = this.body.translation();
    const q = this.body.rotation();
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(
      new THREE.Quaternion(q.x, q.y, q.z, q.w),
    );
    const yaw = Math.atan2(forward.x, forward.z);
    const upright = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    // The W4 jack animation already lifted the body; settle from its current
    // height instead of teleporting a metre up (that read as a hop).
    this.body.setTranslation({ x: t.x, y: Math.max(t.y, 1.0), z: t.z }, true);
    this.body.setRotation(
      { x: upright.x, y: upright.y, z: upright.z, w: upright.w },
      true,
    );
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.winchAssist = 1;
    this.winchLoad = 0;
    this.sync(0);
  }

  update(dt: number, input: DrivingInput): void {
    this.drivetrain.update(dt);
    this.lastSteer = input.steer;

    // Any Q/E shift input selects a forward range again; L/H shifting itself
    // stays exactly as before.
    if (input.shiftUp || input.shiftDown) this.disengageReverse();
    if (input.shiftUp && this.drivetrain.shiftUp()) this.onShift?.();
    if (input.shiftDown && this.drivetrain.shiftDown()) this.onShift?.();

    const q = this.body.rotation();
    const rotation = new THREE.Quaternion(q.x, q.y, q.z, q.w);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
    const chassisForward = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation);
    const chassisRight = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation);

    const velocity = this.body.linvel();
    const speed = velocity.x * chassisForward.x + velocity.y * chassisForward.y + velocity.z * chassisForward.z;
    this.updateReverse(dt, input, speed);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.4);

    // W2 #7 / issue #13: deep water (> 50 cm) floods the intake; power drops
    // 40 % and recovers over 10 s once the car is back on dry ground.
    const bodyPosition = this.body.translation();
    const water = this.terrain?.waterAt(bodyPosition.x, bodyPosition.z) ?? null;
    const submerged =
      water !== null &&
      water.depth > 0.5 &&
      bodyPosition.y - CHASSIS_HALF_HEIGHT < water.level + 0.02;
    this.waterIngressLevel = submerged
      ? Math.min(1, this.waterIngressLevel + dt / 1.5)
      : Math.max(0, this.waterIngressLevel - dt / 10);
    if (water && water.depth > 0.05) {
      const drag = (submerged ? 0.35 : 0.08) * (water.depth / 0.8);
      const dragScale = CHASSIS_MASS * drag * dt;
      this.body.applyImpulse(
        { x: -velocity.x * dragScale, y: 0, z: -velocity.z * dragScale },
        true,
      );
    }

    const powerFactor = 1 - 0.4 * this.waterIngressLevel;
    let engineForce: number;
    if (this.reverse) {
      // S becomes reverse throttle at a standstill; cap the reverse speed and
      // keep the same water/winch power modifiers as forward drive.
      const reverseSpeed = Math.max(0, -speed);
      const overspeed = Math.max(0, reverseSpeed - REVERSE_MAX_SPEED);
      engineForce =
        -input.brake *
          REVERSE_FORCE *
          powerFactor *
          this.damagePowerFactor *
          this.winchAssist *
          clamp((REVERSE_MAX_SPEED - reverseSpeed) / 0.6, 0, 1) +
        // A light governor keeps a downhill roll from running away past the
        // 12 km/h reverse cap while S is still held.
        Math.min(overspeed * 2000, ENGINE_FORCE);
    } else {
      const gearMax = this.drivetrain.maxSpeed;
      const torqueFactor = this.drivetrain.shifting ? 0 : this.drivetrain.torqueFactor;
      engineForce =
        input.throttle *
        ENGINE_FORCE *
        torqueFactor *
        powerFactor *
        this.damagePowerFactor *
        this.winchAssist *
        clamp((gearMax - Math.max(0, speed)) / 0.6, 0, 1);
    }
    const perWheelDrive = engineForce / DRIVEN_WHEELS;
    // While reversing, S is the reverse pedal, not the brake. Braking while
    // rolling forward is unchanged.
    const perWheelBrake = this.reverse ? 0 : (input.brake * BRAKE_FORCE) / WHEELS.length;
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

    this.updateContactSummary();

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

    this.steeringWheel.rotation.z = -this.lastSteer * 1.8;
    const speedNorm = clamp(Math.abs(this.forwardSpeed) * 3.6 / 100, 0, 1);
    this.speedNeedle.rotation.z = -2.1 + speedNorm * 4.2;
    const tachNorm = clamp(Math.abs(this.forwardSpeed) * 3.6 / 90, 0, 1);
    this.tachNeedle.rotation.z = -2.1 + tachNorm * 4.2;

    // W3 #19: a loaded rope pulls the body down a few centimetres; the wheels
    // stay on their suspension rays so the ride height does not lie.
    this.bodyShell.position.y = -0.05 * this.winchLoad;
    this.bodyShell.rotation.x = 0.03 * this.winchLoad;
  }

  reset(): void {
    this.body.setTranslation({ x: 0, y: 1.4, z: 0 }, true);
    this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.drivetrain.reset();
    this.disengageReverse();
    this.damageFlash = 0;
    this.jacking = false;
    this.forwardSpeed = 0;
    this.lastSteer = 0;
    this.waterIngressLevel = 0;
    this.slopeAngle = 0;
    this.maxSlip = 0;
    this.dominantSurface = SURFACES.dirt;
    this.winchAssist = 1;
    this.winchLoad = 0;
    for (const state of this.wheelStates) {
      state.compression = 0;
      state.length = SUSPENSION_REST;
      state.grounded = false;
      state.spin = 0;
      state.steerAngle = 0;
      state.slipSpeed = 0;
      state.waterDepth = 0;
      state.surface = SURFACES.dirt;
    }
    this.sync(0);
  }

  /** Debug/test helper: move the car to a known pose without a reset delay. */
  place(x: number, z: number, yaw = 0): void {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.body.setTranslation({ x, y: 1.4, z }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.disengageReverse();
    this.forwardSpeed = 0;
    this.sync(0);
  }

  /**
   * Reverse engagement: S brakes while the car is rolling; once it is at rest
   * and S is still held for 0.45 s, reverse engages. W/throttle, Q/E shifts or
   * releasing S leave reverse immediately. L/H forward behavior is untouched.
   */
  private updateReverse(dt: number, input: DrivingInput, speed: number): void {
    if (this.reverse) {
      if (input.brake < 0.05 || input.throttle > 0.05 || speed > 1.5) {
        this.disengageReverse();
      }
      return;
    }
    if (
      input.brake >= 0.5 &&
      input.throttle < 0.05 &&
      Math.abs(speed) <= REVERSE_ENGAGE_SPEED
    ) {
      this.reverseHold += dt;
      if (this.reverseHold >= REVERSE_ENGAGE_DELAY) {
        this.reverse = true;
        this.reverseHold = 0;
      }
      return;
    }
    this.reverseHold = 0;
  }

  private disengageReverse(): void {
    this.reverse = false;
    this.reverseHold = 0;
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
    let surface = SURFACES.dirt;

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
        surface = this.terrain?.surfaceAt(hit.collider.handle) ?? SURFACES.dirt;
      }
    }

    state.steerAngle = config.steer
      ? -input.steer * MAX_STEER * this.damageSteerFactor
      : 0;

    if (!Number.isFinite(closestDistance)) {
      state.grounded = false;
      state.compression = 0;
      state.length = SUSPENSION_REST;
      state.contactNormal.copy(up);
      state.contactPoint
        .copy(anchor)
        .addScaledVector(direction, SUSPENSION_REST + WHEEL_RADIUS);
      state.slipSpeed = 0;
      state.waterDepth = 0;
      state.surface = SURFACES.dirt;
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
    state.surface = surface;

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

    const contactSlip = Math.hypot(longSpeed, latSpeed);
    const weatherGrip = weatherGripMultiplier(surface, this.wetness);
    const maxFrictionImpulse =
      surface.friction *
      weatherGrip *
      gripCurve(contactSlip) *
      Math.max(springForce, 300) *
      dt;
    let longitudinal = config.drive ? driveForce : 0;
    const gravityAlong = -9.81 * wheelForward.y;

    // Rolling resistance / engine braking keeps the car from free-rolling.
    longitudinal -= longSpeed * 30 * surface.rollingResistance;

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
      -latSpeed * (CHASSIS_MASS / 4) * LATERAL_GRIP * surface.lateralGrip * weatherGrip * dt,
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

    state.contactForward.copy(wheelForward);
    state.slipSpeed = contactSlip;
    state.waterDepth = this.terrain?.waterDepthAt(closestPoint.x, closestPoint.z) ?? 0;
  }

  /** W2 #6/#7: combine the four wheel contacts into car-level state. */
  private updateContactSummary(): void {
    let groundedCount = 0;
    let normalY = 0;
    let maxSlip = 0;
    const counts = new Map<Surface, number>();
    for (const state of this.wheelStates) {
      if (!state.grounded) continue;
      groundedCount += 1;
      normalY += state.contactNormal.y;
      maxSlip = Math.max(maxSlip, state.slipSpeed);
      counts.set(state.surface, (counts.get(state.surface) ?? 0) + 1);
    }
    this.slopeAngle =
      groundedCount > 0 ? slopeDegFromNormal(normalY / groundedCount) : 0;
    this.maxSlip = maxSlip;

    let dominant = SURFACES.dirt;
    let dominantCount = 0;
    for (const [surface, count] of counts) {
      if (count > dominantCount) {
        dominant = surface;
        dominantCount = count;
      }
    }
    this.dominantSurface = dominant;
  }

  private buildExterior(): void {
    this.exterior.add(this.bodyShell);
    const bodyMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.6, 4.0),
      new THREE.MeshStandardMaterial({ color: 0xd95f2b, roughness: 0.5, metalness: 0.15 }),
    );
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    this.bodyShell.add(bodyMesh);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.5, 1.8),
      new THREE.MeshStandardMaterial({ color: 0x22303a, roughness: 0.3, metalness: 0.35 }),
    );
    cabin.position.set(0, 0.55, -0.15);
    cabin.castShadow = true;
    this.bodyShell.add(cabin);

    const bumperMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.8 });
    for (const z of [-2.02, 2.02]) {
      const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.2, 0.24), bumperMaterial);
      bumper.position.set(0, -0.18, z);
      bumper.castShadow = true;
      this.bodyShell.add(bumper);
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
        contactForward: new THREE.Vector3(0, 0, 1),
        steerAngle: 0,
        spin: 0,
        root,
        tire,
        surface: SURFACES.dirt,
        slipSpeed: 0,
        waterDepth: 0,
      });
    }
  }

  /**
   * W5 #19 / issue #25: cockpit interior v0.
   *
   * The blockout keeps the W1 camera proportions and adds a low-poly interior
   * that reads from the driver's eye: dashboard with two live gauges, a spoked
   * wheel, driver/passenger seats, door panels and armrests, A-pillars, sun
   * visors, a rear-view mirror and side mirrors, plus the hood/fender blockout
   * that keeps the road visible. All interior dimensions are local to the same
   * chassis used by the exterior (body 1.8 x 4.0 m, cabin 1.5 m wide).
   */
  private buildCockpit(): {
    steeringWheel: THREE.Group;
    speedNeedle: THREE.Object3D;
    tachNeedle: THREE.Object3D;
  } {
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a3138, roughness: 0.9 });
    const soft = new THREE.MeshStandardMaterial({ color: 0x434d54, roughness: 0.82 });
    const trim = new THREE.MeshStandardMaterial({
      color: 0x5d666e,
      roughness: 0.45,
      metalness: 0.45,
    });
    const fabric = new THREE.MeshStandardMaterial({ color: 0x46524a, roughness: 0.96 });
    const accent = new THREE.MeshStandardMaterial({ color: 0xd8c9a2, roughness: 0.55 });
    const gaugeFace = new THREE.MeshStandardMaterial({
      color: 0x10161a,
      emissive: 0x2a5048,
      emissiveIntensity: 1.1,
      roughness: 0.35,
    });
    const needleMaterial = new THREE.MeshStandardMaterial({
      color: 0xffb060,
      emissive: 0xff7a20,
      emissiveIntensity: 1.5,
      roughness: 0.4,
    });
    const mirrorGlass = new THREE.MeshStandardMaterial({
      color: 0xc0d0d8,
      roughness: 0.15,
      metalness: 0.4,
    });
    const leather = new THREE.MeshStandardMaterial({ color: 0x23282c, roughness: 0.72 });

    const add = (
      mesh: THREE.Mesh,
      x: number,
      y: number,
      z: number,
      rx = 0,
      ry = 0,
      rz = 0,
    ): THREE.Mesh => {
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, rz);
      this.cockpit.add(mesh);
      return mesh;
    };
    const box = (
      width: number,
      height: number,
      depth: number,
      x: number,
      y: number,
      z: number,
      material: THREE.Material,
      rx = 0,
      ry = 0,
      rz = 0,
    ): THREE.Mesh => add(new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material), x, y, z, rx, ry, rz);

    // Floor and dashboard. The dash top stays below the eye line so the road
    // remains visible; the binnacle carries the gauges above the wheel rim.
    box(1.45, 0.06, 1.8, 0, -0.16, 0.05, dark);
    box(1.48, 0.22, 0.45, 0, 0.1, 0.98, soft);
    box(1.48, 0.06, 0.12, 0, 0.23, 0.82, dark);
    box(1.48, 0.16, 0.1, 0, -0.02, 0.8, dark);
    box(0.3, 0.3, 0.16, 0.18, 0.06, 0.9, dark);
    box(0.26, 0.04, 0.3, 0.18, 0.15, 0.9, trim);
    for (const x of [-0.5, 0.5]) {
      box(0.13, 0.06, 0.02, x, 0.2, 0.8, trim);
      for (let slat = -1; slat <= 1; slat += 1) {
        box(0.11, 0.012, 0.012, x, 0.2 + slat * 0.018, 0.786, dark);
      }
    }

    // Instrument binnacle: two gauge faces with tick marks and live needles.
    box(0.52, 0.2, 0.12, -0.32, 0.4, 0.83, dark);
    box(0.54, 0.03, 0.14, -0.32, 0.51, 0.82, trim);
    const gaugeCenters: Array<[number, number]> = [
      [-0.44, 0.42],
      [-0.2, 0.42],
    ];
    for (const [x, y] of gaugeCenters) {
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.062, 24), gaugeFace);
      add(face, x, y, 0.766, 0, Math.PI, 0);
      const rim = new THREE.Mesh(new THREE.RingGeometry(0.062, 0.075, 24), trim);
      add(rim, x, y, 0.765, 0, Math.PI, 0);
      for (let tick = 0; tick < 7; tick += 1) {
        const angle = -2.2 + (tick / 6) * 4.4;
        const mark = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.018, 0.006), trim);
        add(
          mark,
          x + Math.sin(angle) * 0.052,
          y + Math.cos(angle) * 0.052,
          0.764,
          0,
          Math.PI,
          -angle,
        );
      }
    }
    const needle = (): THREE.Object3D => {
      const group = new THREE.Group();
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.1, 0.008), needleMaterial);
      blade.geometry.translate(0, 0.045, 0);
      group.add(blade);
      this.cockpit.add(group);
      return group;
    };
    const speedNeedle = needle();
    speedNeedle.position.set(-0.44, 0.42, 0.76);
    const tachNeedle = needle();
    tachNeedle.position.set(-0.2, 0.42, 0.76);

    // A soft warm cabin light: without it the blockout reads as a black hole
    // at dusk even though the exterior is lit correctly.
    const cabinLight = new THREE.PointLight(0xffd2a0, 0.9, 3.2, 1.6);
    cabinLight.position.set(0, 0.36, 0.5);
    this.cockpit.add(cabinLight);

    // Steering column + wheel with three spokes.
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.04, 0.3, 12),
      trim,
    );
    add(column, -0.32, 0.18, 0.79, Math.PI / 2 - 0.42, 0, 0);

    const steeringWheel = new THREE.Group();
    steeringWheel.position.set(-0.32, 0.25, 0.73);
    steeringWheel.rotation.x = -0.42;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.02, 10, 28), leather);
    steeringWheel.add(rim);
    for (const x of [-0.068, 0.068]) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.018, 0.018), trim);
      spoke.position.set(x, 0, 0);
      steeringWheel.add(spoke);
    }
    const lowerSpoke = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.09, 0.018), trim);
    lowerSpoke.position.set(0, -0.062, 0);
    steeringWheel.add(lowerSpoke);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.045, 16), dark);
    hub.rotation.x = Math.PI / 2;
    steeringWheel.add(hub);
    const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 12), accent);
    badge.rotation.x = Math.PI / 2;
    badge.position.z = 0.026;
    steeringWheel.add(badge);
    this.cockpit.add(steeringWheel);

    // Centre console and transfer lever.
    box(0.28, 0.2, 0.72, 0.2, 0.02, 0.38, soft);
    box(0.26, 0.03, 0.52, 0.2, 0.13, 0.38, trim);
    const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.18, 8), trim);
    add(lever, 0.2, 0.22, 0.48, 0.18, 0, 0);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), dark);
    add(knob, 0.2, 0.31, 0.49);

    // Seats. The driver seat centre matches the wheel centre and the camera eye.
    const seat = (x: number): void => {
      box(0.5, 0.12, 0.5, x, -0.03, -0.15, fabric);
      box(0.08, 0.14, 0.5, x - 0.27, 0.02, -0.15, fabric);
      box(0.08, 0.14, 0.5, x + 0.27, 0.02, -0.15, fabric);
      box(0.48, 0.55, 0.12, x, 0.22, -0.42, fabric, -0.12, 0, 0);
      box(0.07, 0.5, 0.14, x - 0.24, 0.24, -0.42, fabric, -0.12, 0, 0);
      box(0.07, 0.5, 0.14, x + 0.24, 0.24, -0.42, fabric, -0.12, 0, 0);
      box(0.26, 0.18, 0.12, x, 0.55, -0.43, fabric, -0.12, 0, 0);
      box(0.035, 0.46, 0.02, x, 0.23, -0.36, dark, -0.12, 0, 0.22);
    };
    seat(-0.32);
    seat(0.45);

    // Door panels, armrests and sills.
    for (const side of [-1, 1]) {
      const x = side * 0.72;
      box(0.07, 0.38, 1.45, x, 0.1, 0, dark);
      box(0.1, 0.07, 0.68, side * 0.65, -0.02, 0.12, soft);
      box(0.08, 0.06, 1.4, x, 0.35, 0, trim);
      box(0.04, 0.04, 0.18, side * 0.66, 0.22, 0.45, trim);
      box(0.04, 0.28, 0.04, side * 0.74, 0.18, -0.7, dark);
    }

    // Roof, A-pillars (leaning inward), header and sun visors.
    box(1.4, 0.06, 1.75, 0, 0.76, -0.05, soft);
    for (const x of [-0.64, 0.64]) {
      box(0.07, 0.64, 0.07, x, 0.49, 0.84, trim, 0, 0, x > 0 ? 0.12 : -0.12);
    }
    box(1.3, 0.08, 0.08, 0, 0.78, 0.84, trim);
    for (const x of [-0.35, 0.35]) {
      box(0.44, 0.02, 0.12, x, 0.75, 0.75, soft, 0.12, 0, 0);
    }

    // Rear-view mirror and compact side mirrors.
    box(0.22, 0.07, 0.04, 0, 0.73, 0.64, dark);
    const rearGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.05), mirrorGlass);
    add(rearGlass, 0, 0.73, 0.619, 0, Math.PI, 0);
    box(0.02, 0.12, 0.02, 0, 0.78, 0.68, dark, 0.3, 0, 0);
    for (const side of [-1, 1]) {
      const x = side * 0.86;
      box(0.1, 0.06, 0.035, x, 0.52, 0.8, dark);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.04), mirrorGlass);
      add(glass, x, 0.52, 0.781, 0, Math.PI, 0);
      box(0.03, 0.02, 0.1, side * 0.8, 0.51, 0.83, trim);
    }

    // Hood/fender blockout beyond the dashboard: the exterior is hidden in the
    // cabin camera, so this keeps the engine cover visible through the glass.
    const paint = new THREE.MeshStandardMaterial({
      color: 0xd95f2b,
      roughness: 0.55,
      metalness: 0.12,
    });
    box(1.7, 0.1, 1.3, 0, 0.06, 1.55, paint);
    for (const x of [-0.8, 0.8]) {
      box(0.16, 0.3, 1.4, x, 0.02, 1.5, paint);
    }
    box(
      1.7,
      0.6,
      1.3,
      0,
      -0.2,
      1.55,
      new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 }),
    );

    return { steeringWheel, speedNeedle, tachNeedle };
  }
}
