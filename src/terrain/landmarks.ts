import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { SURFACES, TerrainField } from './surfaces';

export interface LandmarkPoi {
  id: string;
  label: string;
  x: number;
  z: number;
  radius: number;
}

export interface Checkpoint {
  id: string;
  label: string;
  x: number;
  z: number;
  yaw: number;
  radius: number;
}

export interface LandmarkTick {
  discovered: LandmarkPoi[];
  enteredCheckpoint: boolean;
  insideCheckpoint: boolean;
}

/** Pure discovery test used both by the runtime and the unit tests. */
export function newPoisAt(
  pois: readonly LandmarkPoi[],
  discovered: ReadonlySet<string>,
  x: number,
  z: number,
): LandmarkPoi[] {
  return pois.filter(
    (poi) => !discovered.has(poi.id) && Math.hypot(x - poi.x, z - poi.z) <= poi.radius,
  );
}

export function isInsideCheckpoint(checkpoint: Checkpoint, x: number, z: number): boolean {
  return Math.hypot(x - checkpoint.x, z - checkpoint.z) <= checkpoint.radius;
}

interface BoxOptions {
  size: [number, number, number];
  position: [number, number, number];
  rotation?: [number, number, number];
  color: number;
  surface?: 'dirt' | 'wood' | 'rock';
  collidable?: boolean;
}

const CABIN_X = -16;
const CABIN_Z = 4.2;

/**
 * W5 #22 / issue #28: the hut checkpoint and the discoverable landmarks.
 *
 * The hut sits west of the start gate, visible from spawn. Its porch is a real
 * 10 cm step and its walls have colliders, but the checkpoint trigger sits on
 * flat dirt just east of the porch so restoring never drops the car onto a
 * ledge. The ridge lookout and the winch practice anchor are the other two
 * “discovered objectives” the save file records.
 */
export class Landmarks {
  readonly checkpoint: Checkpoint = {
    id: 'cabin',
    label: '木屋检查点',
    x: -9.6,
    z: 4.2,
    yaw: Math.PI / 2,
    radius: 5.5,
  };

  readonly pois: readonly LandmarkPoi[] = [
    { id: 'cabin', label: '木屋检查点', x: -9.6, z: 4.2, radius: 6 },
    { id: 'ridge', label: '山脊观景点', x: 7, z: 61, radius: 10 },
    { id: 'winch', label: '起手绞盘练习', x: 3.5, z: 9, radius: 8 },
  ];

  private readonly discovered = new Set<string>();
  private inside = false;
  private readonly group = new THREE.Group();
  private readonly porchLight: THREE.PointLight;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly world: RAPIER.World,
    private readonly field: TerrainField,
  ) {
    this.buildCabin();
    this.buildRidgeLookout();
    this.porchLight = new THREE.PointLight(0xffb060, 7, 12, 1.6);
    this.porchLight.position.set(CABIN_X + 4.6, 2.05, CABIN_Z);
    this.group.add(this.porchLight);
    this.scene.add(this.group);
  }

  get discoveredIds(): string[] {
    return [...this.discovered];
  }

  get discoveredCount(): number {
    return this.discovered.size;
  }

  get totalPois(): number {
    return this.pois.length;
  }

  isDiscovered(id: string): boolean {
    return this.discovered.has(id);
  }

  restore(ids: readonly string[]): void {
    const known = new Set(this.pois.map((poi) => poi.id));
    for (const id of ids) {
      if (known.has(id)) this.discovered.add(id);
    }
  }

  update(x: number, z: number): LandmarkTick {
    const discovered = newPoisAt(this.pois, this.discovered, x, z);
    for (const poi of discovered) this.discovered.add(poi.id);
    const insideCheckpoint = isInsideCheckpoint(this.checkpoint, x, z);
    const enteredCheckpoint = insideCheckpoint && !this.inside;
    this.inside = insideCheckpoint;
    return { discovered, enteredCheckpoint, insideCheckpoint };
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      }
    });
  }

  private buildCabin(): void {
    const box = (options: BoxOptions): void => this.addBox(options);
    box({ size: [7.4, 0.24, 6.2], position: [CABIN_X, 0.12, CABIN_Z], color: 0x5a4a34, surface: 'wood' });
    box({ size: [2.4, 0.2, 3.6], position: [CABIN_X + 4.7, 0.1, CABIN_Z], color: 0x67553b, surface: 'wood' });

    // Walls, with the door on the east face.
    box({ size: [0.24, 2.5, 6.2], position: [CABIN_X - 3.55, 1.4, CABIN_Z], color: 0x6f5a3e, collidable: true });
    box({ size: [7.4, 2.5, 0.24], position: [CABIN_X, 1.4, CABIN_Z - 3.1], color: 0x6f5a3e, collidable: true });
    box({ size: [7.4, 2.5, 0.24], position: [CABIN_X, 1.4, CABIN_Z + 3.1], color: 0x6f5a3e, collidable: true });
    box({ size: [0.24, 2.5, 2.2], position: [CABIN_X + 3.55, 1.4, CABIN_Z - 2.0], color: 0x6f5a3e, collidable: true });
    box({ size: [0.24, 2.5, 2.2], position: [CABIN_X + 3.55, 1.4, CABIN_Z + 2.0], color: 0x6f5a3e, collidable: true });
    box({ size: [0.24, 0.5, 1.8], position: [CABIN_X + 3.55, 2.3, CABIN_Z], color: 0x6f5a3e, collidable: true });

    // Door + frame on the east wall.
    box({ size: [0.08, 2.1, 1.8], position: [CABIN_X + 3.6, 1.1, CABIN_Z], color: 0x2e2418, collidable: false });
    box({ size: [0.12, 0.16, 2.0], position: [CABIN_X + 3.58, 2.18, CABIN_Z], color: 0x2e2418, collidable: false });
    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshStandardMaterial({ color: 0xd8b26a, metalness: 0.6, roughness: 0.35 }));
    handle.position.set(CABIN_X + 3.66, 1.1, CABIN_Z + 0.65);
    this.group.add(handle);

    // Windows (emissive panes so the hut reads at night).
    const warmGlass = new THREE.MeshStandardMaterial({
      color: 0xffd08a,
      emissive: 0xffb25a,
      emissiveIntensity: 1.1,
      roughness: 0.4,
    });
    for (const z of [CABIN_Z - 2.1, CABIN_Z + 2.1]) {
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.8), warmGlass);
      pane.position.set(CABIN_X + 3.48, 1.55, z);
      pane.rotation.y = Math.PI / 2;
      this.group.add(pane);
    }
    const sidePane = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), warmGlass);
    sidePane.position.set(CABIN_X - 1.0, 1.55, CABIN_Z - 3.23);
    this.group.add(sidePane);

    // Gable roof: two slabs rising to a ridge along z.
    box({ size: [4.1, 0.18, 7.0], position: [CABIN_X - 1.95, 2.72, CABIN_Z], rotation: [0, 0, 0.44], color: 0x3a3f3a });
    box({ size: [4.1, 0.18, 7.0], position: [CABIN_X + 1.95, 2.72, CABIN_Z], rotation: [0, 0, -0.44], color: 0x3a3f3a });
    box({ size: [8.4, 0.14, 7.2], position: [CABIN_X, 2.55, CABIN_Z], color: 0x2c302c });

    // Chimney and porch posts.
    box({ size: [0.7, 1.4, 0.7], position: [CABIN_X - 2.4, 3.1, CABIN_Z + 1.7], color: 0x77756b });
    for (const z of [CABIN_Z - 1.6, CABIN_Z + 1.6]) {
      box({ size: [0.18, 2.3, 0.18], position: [CABIN_X + 5.2, 1.25, z], color: 0x4a3a26, collidable: true });
    }
    box({ size: [2.8, 0.16, 3.8], position: [CABIN_X + 4.8, 2.45, CABIN_Z], color: 0x3a3024 });

    // A stone path from the porch toward spawn.
    for (let index = 0; index < 5; index += 1) {
      box({
        size: [0.75, 0.06, 0.9],
        position: [CABIN_X + 6.2 + index * 1.1, 0.03, CABIN_Z + (index % 2 === 0 ? -0.35 : 0.35)],
        color: 0x807d70,
        collidable: false,
      });
    }

    this.addSign('木屋检查点 · 驶近自动保存', CABIN_X + 6.4, 2.2, CABIN_Z + 3.3, 0xf0c35a, Math.PI / 2, 3.4);
    this.addSign('W5 木屋 · 车况与装备已记录', CABIN_X + 3.0, 3.0, CABIN_Z - 4.2, 0xd8d2b8, 0, 3.6);
  }

  private buildRidgeLookout(): void {
    const y = 3.63;
    const flagMaterial = new THREE.MeshStandardMaterial({ color: 0xe07b3a, roughness: 0.8, side: THREE.DoubleSide });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6), new THREE.MeshStandardMaterial({ color: 0x8a8a82 }));
    pole.position.set(7, y + 1.6, 61);
    this.group.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), flagMaterial);
    flag.position.set(7.72, y + 2.7, 61);
    this.group.add(flag);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.16, 0.5), new THREE.MeshStandardMaterial({ color: 0x5a4a34 }));
    bench.position.set(5.2, y + 0.5, 61);
    this.group.add(bench);
    this.addSign('山脊观景点', 3.0, y + 2.2, 61, 0xe07b3a, Math.PI / 2, 2.6);
  }

  private addBox(options: BoxOptions): void {
    const [sx, sy, sz] = options.size;
    const [px, py, pz] = options.position;
    const [rx, ry, rz] = options.rotation ?? [0, 0, 0];
    const surface = options.surface === 'wood' ? SURFACES.wood : options.surface === 'rock' ? SURFACES.rock : SURFACES.dirt;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(sx, sy, sz),
      new THREE.MeshStandardMaterial({ color: options.color, roughness: 0.9, metalness: 0.02 }),
    );
    mesh.position.set(px, py, pz);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    if (options.collidable === false) return;
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(px, py, pz)
        .setRotation({ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w }),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2).setFriction(surface.friction),
      body,
    );
    this.field.addSurface(collider.handle, surface);
  }

  private addSign(
    text: string,
    x: number,
    y: number,
    z: number,
    color: number,
    yaw = Math.PI,
    width = 4,
  ): void {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = 'rgba(10, 14, 10, 0.85)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
    context.lineWidth = 8;
    context.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
    context.fillStyle = '#e9f0e4';
    context.font = 'bold 48px "PingFang SC", "Hiragino Sans GB", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.FrontSide });
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.06, width / 4 + 0.06, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x1a1e17, roughness: 0.9 }),
    );
    board.position.set(x, y, z);
    board.rotation.y = yaw;
    this.group.add(board);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), material);
    sign.position.set(x + Math.sin(yaw) * 0.021, y, z + Math.cos(yaw) * 0.021);
    sign.rotation.y = yaw;
    this.group.add(sign);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, y, 6),
      new THREE.MeshStandardMaterial({ color: 0x777777 }),
    );
    pole.position.set(x, y / 2, z);
    this.group.add(pole);
  }
}
