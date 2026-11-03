import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { DrivingInput } from '../core/input';
import { PlaceholderCar } from './placeholderCar';

const STEP = 1 / 60;

const IDLE: DrivingInput = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  reset: false,
};

interface Rig {
  car: PlaceholderCar;
  world: RAPIER.World;
}

function createRig(): Rig {
  const scene = new THREE.Scene();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = STEP;

  const ground = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0),
  );
  world.createCollider(RAPIER.ColliderDesc.cuboid(100, 0.5, 100), ground);

  return { car: new PlaceholderCar(scene, world), world };
}

function simulate(rig: Rig, input: DrivingInput, seconds: number): void {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    rig.car.applyInput(STEP, input);
    rig.world.step();
    rig.car.sync(STEP);
  }
}

beforeAll(async () => {
  await RAPIER.init();
});

describe('PlaceholderCar', () => {
  it('accelerates forward when throttle is applied', () => {
    const rig = createRig();
    simulate(rig, { ...IDLE, throttle: 1 }, 2);

    expect(rig.car.speedKmh).toBeGreaterThan(10);
    expect(rig.car.position.z).toBeGreaterThan(1);
  });

  it('does not steer while standing still', () => {
    const rig = createRig();
    simulate(rig, { ...IDLE, steer: 1 }, 1);

    expect(Math.abs(rig.car.forward.x)).toBeLessThan(0.05);
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
