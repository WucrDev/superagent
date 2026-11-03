import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { DrivingInput, ToolInput } from '../core/input';
import { SURFACES, TerrainField } from '../terrain/surfaces';
import { RaycastVehicle } from '../vehicle/raycastVehicle';
import { ANCHOR_TYPES, type WinchAnchor } from './anchorTypes';
import { Winch } from './winch';
import { WINCH } from './winchMath';

const STEP = 1 / 60;

const IDLE_DRIVE: DrivingInput = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  reset: false,
  shiftUp: false,
  shiftDown: false,
  camera: false,
};

function tools(overrides: Partial<ToolInput> = {}): ToolInput {
  return {
    winchHeld: false,
    hook: false,
    cycle: false,
    auto: false,
    right: false,
    hud: false,
    ...overrides,
  };
}

interface Rig {
  car: RaycastVehicle;
  world: RAPIER.World;
  winch: Winch;
}

function makeAnchor(
  id: string,
  kind: WinchAnchor['kind'],
  x: number,
  z: number,
  baseY = 0,
  attachHeight = 1.2,
): WinchAnchor {
  const group = new THREE.Group();
  group.position.set(x, baseY, z);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.05, 6, 16),
    new THREE.MeshBasicMaterial({ color: ANCHOR_TYPES[kind].color }),
  );
  return {
    id,
    kind,
    label: id,
    attachPoint: new THREE.Vector3(x, baseY + attachHeight, z),
    baseY,
    strength: ANCHOR_TYPES[kind].strength,
    group,
    ring,
    colliderHandles: new Set<number>(),
    status: 'ok',
    failTimer: -1,
    failDirection: new THREE.Vector3(0, 0, 1),
  };
}

function createRig(
  anchors: WinchAnchor[],
  options: { ramp?: boolean; start?: [number, number, number] } = {},
): Rig {  const scene = new THREE.Scene();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = STEP;
  const field = new TerrainField();

  const ground = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0),
  );
  const groundCollider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(60, 0.5, 60).setFriction(SURFACES.dirt.friction),
    ground,
  );
  field.addSurface(groundCollider.handle, SURFACES.dirt);

  if (options.ramp) {
    const ramp = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(0, 0.45, 1.7)
        .setRotation(
          (() => {
            const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.61, 0, 0));
            return { x: q.x, y: q.y, z: q.z, w: q.w };
          })(),
        ),
    );
    const rampCollider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(5, 0.2, 1.2).setFriction(SURFACES.wetMud.friction),
      ramp,
    );
    field.addSurface(rampCollider.handle, SURFACES.wetMud);

    const plateau = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, 1.05, 4.9),
    );
    const plateauCollider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(5, 0.25, 2).setFriction(SURFACES.wetMud.friction),
      plateau,
    );
    field.addSurface(plateauCollider.handle, SURFACES.wetMud);
  }

  const car = new RaycastVehicle(scene, world, undefined, field);
  const winch = new Winch(scene, world, car, anchors);
  const start = options.start ?? [0, 0, 0];
  car.place(start[0], start[1], start[2]);

  return { car, world, winch };
}

function step(rig: Rig, tool: ToolInput, drive: DrivingInput = IDLE_DRIVE): void {
  rig.car.update(STEP, drive);
  rig.winch.update(STEP, tool);
  rig.world.step();
  rig.car.sync(STEP);
}

function settle(rig: Rig): void {
  for (let stepIndex = 0; stepIndex < 45; stepIndex += 1) {
    step(rig, tools());
  }
}

describe('W3 winch integration', () => {
  beforeAll(async () => {
    await RAPIER.init();
  });

  it(
    'pulls the car up a 35° wet-mud ramp in under 6 s',
    () => {
      const anchor = makeAnchor('tree', 'tree', 0, 5.2, 1.3);
      const rig = createRig([anchor], { ramp: true, start: [0, -1, 0] });
      settle(rig);

      let elapsed = 0;
      let moved = false;
      for (let stepIndex = 0; stepIndex < Math.ceil(6 / STEP); stepIndex += 1) {
        const tool =
          stepIndex === 0
            ? tools({ winchHeld: true, hook: true })
            : tools({ winchHeld: true });
        step(rig, tool);
        elapsed = (stepIndex + 1) * STEP;
        if (rig.car.position.z > 3.0 && rig.car.position.y > 1.4) {
          moved = true;
          break;
        }
      }

      expect(moved, `car ended at ${rig.car.position.toArray().join(', ')}`).toBe(true);
      expect(elapsed).toBeLessThanOrEqual(6);
      expect(rig.car.up.y).toBeGreaterThan(0.5);
      console.log(
        `[W3] wet-mud ramp escape: ${elapsed.toFixed(2)} s, car=(${rig.car.position
          .toArray()
          .map((value) => value.toFixed(2))
          .join(', ')})`,
      );
    },
    30000,
  );

  it(
    'snaps the rope after 1.2 s above the tension limit and allows a retry',
    () => {
      const anchor = makeAnchor('tree', 'tree', 0, 9);
      const rig = createRig([anchor], { start: [0, 0, 0] });
      settle(rig);

      step(rig, tools({ winchHeld: true, hook: true }));
      for (let stepIndex = 0; stepIndex < 30; stepIndex += 1) {
        step(rig, tools({ winchHeld: true }));
      }
      expect(rig.winch.attachedAnchor?.id).toBe('tree');

      rig.car.rigidBody.setBodyType(RAPIER.RigidBodyType.Fixed, true);
      let sawBreak = false;
      let breakTime = 0;
      for (let stepIndex = 0; stepIndex < 180; stepIndex += 1) {
        step(rig, tools({ winchHeld: true }));
        if (
          rig.winch.winchState === 'broken' ||
          rig.winch.snapshot.message.includes('绳断')
        ) {
          sawBreak = true;
          breakTime = (stepIndex + 1) * STEP;
          break;
        }
      }

      expect(sawBreak).toBe(true);
      expect(rig.winch.attachedAnchor).toBeNull();
      expect(rig.winch.snapshot.message).toContain('绳断');
      console.log(`[W3] rope snap after ${breakTime.toFixed(2)} s over the limit`);
    },
    30000,
  );

  it(
    'drops a bush hook after 0.5 s with a readable message',
    () => {
      const bush = makeAnchor('bush', 'bush', 0, 5, 0, 0.45);
      const rig = createRig([bush], { start: [0, 0, 0] });
      settle(rig);

      step(rig, tools({ winchHeld: true }));
      expect(rig.winch.selectAnchor('bush')).toBe(true);
      step(rig, tools({ winchHeld: true, hook: true }));

      let sawMessage = false;
      let detachTime = 0;
      for (let stepIndex = 0; stepIndex < 90; stepIndex += 1) {
        step(rig, tools({ winchHeld: true }));
        if (rig.winch.snapshot.message.includes('挂不住')) {
          sawMessage = true;
          detachTime = (stepIndex + 1) * STEP;
          break;
        }
      }

      expect(sawMessage).toBe(true);
      expect(rig.winch.attachedAnchor).toBeNull();
      expect(rig.winch.snapshot.message).toContain('挂不住');
      console.log(`[W3] bush hook dropped after ${detachTime.toFixed(2)} s`);
    },
    30000,
  );

  it(
    'keeps the auto pick ahead of a misleading bush',
    () => {
      const tree = makeAnchor('tree', 'tree', 0, 7);
      const bush = makeAnchor('bush', 'bush', 2.5, 7, 0, 0.45);
      const rig = createRig([tree, bush], { start: [0, 0, 0] });
      settle(rig);

      step(rig, tools({ winchHeld: true }));
      expect(rig.winch.snapshot.selected?.anchor.id).toBe('tree');
      expect(rig.winch.snapshot.candidates).toHaveLength(2);

      expect(rig.winch.selectAnchor('bush')).toBe(true);
      step(rig, tools({ winchHeld: true }));
      expect(rig.winch.snapshot.selected?.anchor.id).toBe('bush');
    },
    30000,
  );

  it('keeps the rope length within the 10 m spool limit', () => {
    const far = makeAnchor('tree', 'tree', 0, 13);
    const rig = createRig([far], { start: [0, 0, 0] });
    settle(rig);
    step(rig, tools({ winchHeld: true }));
    expect(rig.winch.snapshot.candidates[0]?.reachable).toBe(false);
    expect(rig.winch.selectAnchor('tree')).toBe(true);
    step(rig, tools({ winchHeld: true, hook: true }));
    expect(rig.winch.attachedAnchor).toBeNull();
    expect(rig.winch.snapshot.message).toContain('绳长');
    expect(WINCH.ropeLength).toBe(10);
  });
});
