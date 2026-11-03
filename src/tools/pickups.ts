import * as THREE from 'three';
import type { Inventory, ToolKind } from './inventory';
import { TOOL_META } from './inventory';

export interface PickupSpec {
  kind: 'plank' | 'repair';
  x: number;
  z: number;
}

interface Pickup {
  kind: 'plank' | 'repair';
  group: THREE.Group;
  x: number;
  z: number;
  picked: boolean;
  /** Seconds before a dropped crate can be re-collected. */
  delay: number;
  bob: number;
}

export interface PickupResult {
  kind: 'plank' | 'repair';
  label: string;
  added: number;
  total: number;
}

/** Default supply crates: one near the start, one at the 2 m ditch, one at the winch pad. */
export const DEFAULT_PICKUPS: readonly PickupSpec[] = [
  { kind: 'repair', x: -4.5, z: 14 },
  { kind: 'plank', x: -6.5, z: 169.5 },
  { kind: 'repair', x: 56, z: 146 },
];

const PICKUP_RADIUS = 2.8;

/**
 * W4 #18 / issue #24: pickup and drop crates for the consumable tools.
 *
 * Crates are auto-collected when the car drives within 2.8 m; dropping places
 * one behind the car and waits three seconds before it can be collected again.
 */
export class SupplyPickups {
  private readonly pickups: Pickup[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    specs: readonly PickupSpec[] = DEFAULT_PICKUPS,
  ) {
    for (const spec of specs) this.spawn(spec.kind, spec.x, spec.z, 0);
  }

  /** Collect nearby crates; returns what was added so the HUD can announce it. */
  update(carX: number, carZ: number, inventory: Inventory, dt: number): PickupResult[] {
    const results: PickupResult[] = [];
    for (const pickup of this.pickups) {
      if (pickup.picked) continue;
      if (pickup.delay > 0) {
        pickup.delay = Math.max(0, pickup.delay - dt);
        continue;
      }
      pickup.bob += dt;
      pickup.group.position.y = 0.22 + Math.sin(pickup.bob * 2.2) * 0.05;
      if (Math.hypot(carX - pickup.x, carZ - pickup.z) > PICKUP_RADIUS) continue;
      const added = inventory.add(pickup.kind, 1);
      if (added <= 0) continue;
      pickup.picked = true;
      pickup.group.visible = false;
      results.push({
        kind: pickup.kind,
        label: TOOL_META[pickup.kind].label,
        added,
        total: inventory.count(pickup.kind),
      });
    }
    return results;
  }

  /** Drop one crate behind the car so the player can retrieve a misplaced item. */
  drop(kind: 'plank' | 'repair', x: number, z: number): void {
    this.spawn(kind, x, z, 3);
  }

  reset(): void {
    for (const pickup of this.pickups) {
      if (!pickup.picked) continue;
      pickup.picked = false;
      pickup.group.visible = true;
      pickup.delay = 0;
    }
  }

  dispose(): void {
    for (const pickup of this.pickups) this.scene.remove(pickup.group);
    this.pickups.length = 0;
  }

  private spawn(kind: 'plank' | 'repair', x: number, z: number, delay: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0.22, z);

    const color = kind === 'repair' ? 0xc94f5a : 0x8a6035;
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.45, 0.5),
      new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.1 }),
    );
    crate.castShadow = true;
    crate.receiveShadow = true;
    group.add(crate);

    const band = new THREE.Mesh(
      new THREE.BoxGeometry(0.74, 0.1, 0.54),
      new THREE.MeshStandardMaterial({ color: 0x1d2328, roughness: 0.8 }),
    );
    band.position.y = 0.05;
    group.add(band);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.75, 0.035, 6, 28),
      new THREE.MeshBasicMaterial({
        color: kind === 'repair' ? 0xff8a95 : 0xf0c35a,
        transparent: true,
        opacity: 0.55,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.19;
    group.add(ring);

    const label = makeLabel(TOOL_META[kind].label);
    label.position.set(0, 0.95, 0);
    group.add(label);

    this.scene.add(group);
    this.pickups.push({
      kind,
      group,
      x,
      z,
      picked: false,
      delay,
      bob: 0,
    });
  }
}

function makeLabel(text: string): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = 'rgba(10, 14, 10, 0.78)';
    context.fillRect(0, 10, canvas.width, 44);
    context.strokeStyle = 'rgba(240, 195, 90, 0.7)';
    context.lineWidth = 3;
    context.strokeRect(2, 12, canvas.width - 4, 40);
    context.fillStyle = '#e9f0e4';
    context.font = 'bold 30px "PingFang SC", "Hiragino Sans GB", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, 34);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.375),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  return plane;
}

export type PickupKind = Extract<ToolKind, 'plank' | 'repair'>;
