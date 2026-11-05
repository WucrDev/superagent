import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { TerrainField } from '../terrain/surfaces';
import { SURFACES } from '../terrain/surfaces';
import { PLANK, planPlank, plankSagFor, plankSupports, type PlankPose } from './plankMath';

export interface PlankDeps {
  /** Called while the car is on a board so the audio layer can creak. */
  onCreak?: (load: number) => void;
}

interface PlacedPlank {
  group: THREE.Group;
  body: RAPIER.RigidBody;
  pose: PlankPose;
  baseY: number;
  sag: number;
}

interface SlidingPlank {
  group: THREE.Group;
  velocity: number;
  spin: number;
  life: number;
  baseY: number;
}

/**
 * W4 #15 / issue #21: the plank bridge.
 *
 * The board itself is a fixed collider so the raycast vehicle can drive over it
 * without the physics solver jittering; the visible group sags and creaks while
 * the car is on it. Because the real board does not move, the sag is small
 * enough (7.5 cm) that it reads as flex, not as a floating prop.
 */
export class PlankBridge {
  private readonly planks: PlacedPlank[] = [];
  private readonly sliding: SlidingPlank[] = [];
  private readonly woodMaterial = new THREE.MeshStandardMaterial({
    color: 0x8a6035,
    roughness: 0.92,
    metalness: 0.02,
  });
  private readonly edgeMaterial = new THREE.MeshStandardMaterial({
    color: 0x5c3d20,
    roughness: 0.95,
  });
  private creakTimer = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly world: RAPIER.World,
    private readonly field: TerrainField,
    private readonly deps: PlankDeps = {},
  ) {}

  get placedCount(): number {
    return this.planks.length;
  }

  get slidingCount(): number {
    return this.sliding.length;
  }

  /**
   * Try to place a board straight ahead of the car. Returns the plan so the
   * caller can decide about consuming a plank and showing the message.
   */
  place(
    carPosition: THREE.Vector3,
    forward: THREE.Vector3,
    carBody: RAPIER.RigidBody,
  ): ReturnType<typeof planPlank> {
    const yaw = Math.atan2(forward.x, forward.z);
    const supports = plankSupports(carPosition.x, carPosition.z, yaw);
    const nearY = this.groundUnder(supports.near.x, supports.near.z, carBody);
    const farY = this.groundUnder(supports.far.x, supports.far.z, carBody);
    const placement = planPlank(carPosition.x, carPosition.z, yaw, nearY, farY);

    if (placement.ok) {
      this.spawnPlaced(placement.pose);
    } else if (placement.reason === 'slip' && placement.pose) {
      this.spawnSliding(placement.pose);
    }
    return placement;
  }

  update(dt: number, carX: number, carZ: number, speedKmh: number): void {
    this.creakTimer = Math.max(0, this.creakTimer - dt);
    let maxLoad = 0;
    for (const plank of this.planks) {
      const sag = plankSagFor(carX, carZ, plank.pose, speedKmh);
      plank.sag += (sag - plank.sag) * Math.min(1, dt * 9);
      plank.group.position.y = plank.baseY - plank.sag;
      maxLoad = Math.max(maxLoad, plank.sag / PLANK.sag);
    }
    if (maxLoad > 0.12 && this.creakTimer <= 0) {
      this.creakTimer = 0.32;
      this.deps.onCreak?.(Math.min(1, maxLoad));
    }

    for (let index = this.sliding.length - 1; index >= 0; index -= 1) {
      const slide = this.sliding[index]!;
      slide.life += dt;
      slide.velocity += 9.8 * dt;
      slide.group.position.y = Math.max(
        slide.baseY - 0.35 * slide.life - slide.velocity * slide.life,
        slide.baseY - 2.1,
      );
      slide.group.rotation.x += slide.spin * dt;
      slide.group.rotation.z += slide.spin * 0.6 * dt;
      if (slide.life >= PLANK.slipTime) {
        this.scene.remove(slide.group);
        this.sliding.splice(index, 1);
      }
    }
  }

  /** Remove every board, e.g. on a full run reset. */
  reset(): void {
    for (const plank of this.planks) {
      this.scene.remove(plank.group);
      this.field.removeSurface?.(plank.group.userData.colliderHandle as number);
      this.world.removeRigidBody(plank.body);
    }
    this.planks.length = 0;
    for (const slide of this.sliding) this.scene.remove(slide.group);
    this.sliding.length = 0;
    this.creakTimer = 0;
  }

  dispose(): void {
    this.reset();
    this.woodMaterial.dispose();
    this.edgeMaterial.dispose();
  }

  private spawnPlaced(pose: PlankPose): void {
    const group = this.buildBoard(pose);
    group.position.set(pose.centerX, pose.centerY, pose.centerZ);
    group.rotation.order = 'YXZ';
    group.rotation.y = pose.yaw;
    group.rotation.x = pose.pitch;
    this.scene.add(group);

    const quaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(pose.pitch, pose.yaw, 0, 'YXZ'),
    );
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(pose.centerX, pose.centerY, pose.centerZ)
        .setRotation({
          x: quaternion.x,
          y: quaternion.y,
          z: quaternion.z,
          w: quaternion.w,
        }),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(PLANK.width / 2, PLANK.thickness / 2, PLANK.length / 2)
        .setFriction(SURFACES.wood.friction)
        .setRestitution(0),
      body,
    );
    this.field.addSurface(collider.handle, SURFACES.wood);
    group.userData.colliderHandle = collider.handle;
    this.planks.push({ group, body, pose, baseY: pose.centerY, sag: 0 });
  }

  private spawnSliding(pose: PlankPose): void {
    const group = this.buildBoard(pose);
    group.position.set(pose.centerX, pose.centerY, pose.centerZ);
    group.rotation.order = 'YXZ';
    group.rotation.y = pose.yaw;
    group.rotation.x = pose.pitch;
    this.scene.add(group);
    this.sliding.push({
      group,
      velocity: 0.4,
      spin: 1.6 + Math.random(),
      life: 0,
      baseY: pose.centerY,
    });
  }

  private buildBoard(pose: PlankPose): THREE.Group {
    const group = new THREE.Group();
    // Three slats with small gaps read as a plank bridge from the chase camera.
    const slatWidth = PLANK.width / 3 - 0.02;
    for (const offset of [-1, 0, 1]) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(slatWidth, PLANK.thickness, PLANK.length),
        this.woodMaterial,
      );
      slat.position.x = offset * (slatWidth + 0.03);
      slat.castShadow = true;
      slat.receiveShadow = true;
      group.add(slat);
    }
    for (const z of [-PLANK.length / 2 + 0.18, PLANK.length / 2 - 0.18]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(PLANK.width + 0.06, PLANK.thickness + 0.03, 0.16),
        this.edgeMaterial,
      );
      rail.position.set(0, 0.01, z);
      rail.castShadow = true;
      group.add(rail);
    }
    // Keep the pose argument meaningful for callers that later customise the
    // board (colour per material etc.); the board is currently uniform.
    group.userData.pose = pose;
    return group;
  }

  private groundUnder(x: number, z: number, carBody: RAPIER.RigidBody): number | null {
    const hit = this.world.castRayAndGetNormal(
      new RAPIER.Ray({ x, y: 12, z }, { x: 0, y: -1, z: 0 }),
      18,
      true,
      undefined,
      undefined,
      undefined,
      carBody,
    );
    if (!hit) return null;
    return 12 - hit.timeOfImpact;
  }
}
