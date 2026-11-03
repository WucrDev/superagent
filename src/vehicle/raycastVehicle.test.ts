import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { DrivingInput } from '../core/input';
import {
  SURFACES,
  TerrainField,
  type Surface,
  type WaterZone,
} from '../terrain/surfaces';
import { RaycastVehicle } from './raycastVehicle';

const STEP = 1 / 60;

const IDLE: DrivingInput = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  reset: false,
  shiftUp: false,
  shiftDown: false,
  camera: false,
};

interface Rig {
  car: RaycastVehicle;
  world: RAPIER.World;
}

interface RigOptions {
  surface?: Surface;
  ramp?: boolean;
  water?: WaterZone;
}

function createRig(options: RigOptions = {}): Rig {
  const scene = new THREE.Scene();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = STEP;
  const field = new TerrainField();
  const surface = options.surface ?? SURFACES.dirt;

  const ground = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0),
  );
  const groundCollider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(200, 0.5, 200).setFriction(surface.friction),
    ground,
  );
  field.addSurface(groundCollider.handle, surface);

  // Same 30° geometry as the test track: 12 m long, 14 m wide, centre z = 8.
  if (options.ramp) {
    const angle = 0.52;
    const halfLength = 6;
    const height = Math.sin(angle) * halfLength;
    const centerY = height - 0.3 * Math.cos(angle);
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(-angle, 0, 0));
    const ramp = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(0, centerY, 8)
        .setRotation({ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w }),
    );
    const rampCollider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(7, 0.3, halfLength).setFriction(surface.friction),
      ramp,
    );
    field.addSurface(rampCollider.handle, surface);

    const topZ = 8 + Math.cos(angle) * halfLength;
    const top = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, height * 2 - 0.25, topZ + 4),
    );
    const topCollider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(7, 0.25, 4).setFriction(surface.friction),
      top,
    );
    field.addSurface(topCollider.handle, surface);
  }

  if (options.water) field.addWater(options.water);

  return {
    car: new RaycastVehicle(scene, world, undefined, field),
    world,
  };
}

function simulate(rig: Rig, input: DrivingInput, seconds: number): void {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    rig.car.update(STEP, input);
    rig.world.step();
    rig.car.sync(STEP);
  }
}

function simulatePeakY(rig: Rig, input: DrivingInput, seconds: number): number {
  const steps = Math.round(seconds / STEP);
  let peak = rig.car.position.y;
  for (let i = 0; i < steps; i += 1) {
    rig.car.update(STEP, input);
    rig.world.step();
    rig.car.sync(STEP);
    peak = Math.max(peak, rig.car.position.y);
  }
  return peak;
}

beforeAll(async () => {
  await RAPIER.init();
});

describe('RaycastVehicle', () => {
  it('settles on its suspension and accelerates on throttle', () => {
    const rig = createRig();
    simulate(rig, IDLE, 1);
    const settledY = rig.car.position.y;
    expect(settledY).toBeGreaterThan(0.6);
    expect(settledY).toBeLessThan(1.1);

    simulate(rig, { ...IDLE, throttle: 1 }, 2);
    expect(rig.car.speedKmh).toBeGreaterThan(10);
    expect(rig.car.position.z).toBeGreaterThan(1);
  });

  it('shifts from L to H with a power interruption', () => {
    const rig = createRig();
    simulate(rig, IDLE, 1);
    rig.car.update(STEP, { ...IDLE, shiftUp: true });
    expect(rig.car.gear).toBe('H');
    expect(rig.car.drivetrain.shifting).toBe(true);
    simulate(rig, IDLE, 0.4);
    expect(rig.car.drivetrain.shifting).toBe(false);
  });

  it('steers toward screen-right for positive steer input', () => {
    const rig = createRig();
    simulate(rig, IDLE, 1);
    simulate(rig, { ...IDLE, throttle: 1 }, 1);
    const beforeX = rig.car.position.x;
    simulate(rig, { ...IDLE, throttle: 1, steer: 1 }, 2);

    // Chase camera sits behind the car: screen-right is world -X.
    expect(rig.car.position.x).toBeLessThan(beforeX - 0.2);
    expect(rig.car.forward.x).toBeLessThan(-0.05);
  });

  it('reset returns the car to the spawn point and clears speed', () => {
    const rig = createRig();
    simulate(rig, { ...IDLE, throttle: 1 }, 1);
    rig.car.reset();

    expect(Math.abs(rig.car.position.x)).toBeLessThan(1e-4);
    expect(Math.abs(rig.car.position.z)).toBeLessThan(1e-4);
    expect(rig.car.speedKmh).toBe(0);
  });

  // W2 #12 / issue #12: the same ramp must be climbable on dry dirt and not on
  // wet mud. 30° needs μ ≈ tan(30°) = 0.58, so dirt 1.0 reaches the top and wet
  // mud 0.35 climbs only on momentum, then slides back down.
  it('climbs the same 30° ramp on dry dirt but not on wet mud', () => {
    const dry = createRig({ surface: SURFACES.dirt, ramp: true });
    simulate(dry, IDLE, 1);
    const dryPeak = simulatePeakY(dry, { ...IDLE, throttle: 1 }, 6);

    const wet = createRig({ surface: SURFACES.wetMud, ramp: true });
    simulate(wet, IDLE, 1);
    const wetPeak = simulatePeakY(wet, { ...IDLE, throttle: 1 }, 6);
    const wetEnd = wet.car.position.y;

    expect(dryPeak).toBeGreaterThan(5);
    expect(wetPeak).toBeLessThan(3.5);
    expect(dryPeak - wetPeak).toBeGreaterThan(2);
    // The wet-mud car does not get to stay up the ramp.
    expect(wetEnd).toBeLessThan(2.5);
    expect(wetEnd).toBeLessThan(wetPeak - 0.5);
  });

  it('reports the slope from contact normals', () => {
    const rig = createRig({ ramp: true });
    simulate(rig, IDLE, 1);
    expect(rig.car.slopeDeg).toBeLessThan(4);

    simulate(rig, { ...IDLE, throttle: 1 }, 2);
    expect(rig.car.slopeDeg).toBeGreaterThan(20);
  });

  // W2 #7 / issue #13: water deeper than 50 cm floods the intake (power -40 %)
  // and recovers over 10 s after leaving the water.
  it('floods the engine in deep water and recovers after driving out', () => {
    const water: WaterZone = {
      x: 0,
      z: 20,
      halfWidth: 10,
      halfDepth: 10,
      level: 0.8,
      depth: 0.8,
    };
    const rig = createRig({ water });
    simulate(rig, IDLE, 1);
    expect(rig.car.waterIngress).toBe(0);

    simulate(rig, { ...IDLE, throttle: 1 }, 3);
    expect(rig.car.waterIngress).toBeGreaterThan(0.5);
    expect(rig.car.powerFactor).toBeLessThan(0.8);

    rig.car.place(0, 0);
    simulate(rig, IDLE, 10.5);
    expect(rig.car.waterIngress).toBeLessThan(0.05);
    expect(rig.car.powerFactor).toBeGreaterThan(0.99);
  });

  it('does not flood the engine in 40 cm water', () => {
    const water: WaterZone = {
      x: 0,
      z: 20,
      halfWidth: 10,
      halfDepth: 10,
      level: 0.4,
      depth: 0.4,
    };
    const rig = createRig({ water });
    simulate(rig, IDLE, 1);
    simulate(rig, { ...IDLE, throttle: 1 }, 3);
    expect(rig.car.waterIngress).toBe(0);
    expect(rig.car.powerFactor).toBe(1);
  });
});
