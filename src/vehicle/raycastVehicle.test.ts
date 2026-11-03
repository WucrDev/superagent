import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { DrivingInput } from '../core/input';
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

function createRig(): Rig {
  const scene = new THREE.Scene();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = STEP;

  const ground = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(100, 0.5, 100).setFriction(1.0),
    ground,
  );

  return { car: new RaycastVehicle(scene, world), world };
}

function simulate(rig: Rig, input: DrivingInput, seconds: number): void {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    rig.car.update(STEP, input);
    rig.world.step();
    rig.car.sync(STEP);
  }
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
});
