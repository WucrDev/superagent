import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { ANCHOR_TYPES, type WinchAnchor } from '../tools/anchorTypes';
import { SURFACES, TerrainField, type Surface } from './surfaces';

interface BoxOptions {
  size: [number, number, number];
  position: [number, number, number];
  rotation?: [number, number, number];
  color: number;
  surface: Surface;
}

/**
 * W3 #16–#20 test content: a winch pad, anchor vocabulary and a cross-water
 * case. This is deliberately separate from the W1/W2 test track so the older
 * acceptance evidence keeps its geometry.
 *
 * Layout:
 *  - anchors A/B/C keep the original W1 positions (three trees);
 *  - "W3 绞盘试炼" at x≈50,z≈148: a wet-mud floor with a 35° wet-mud ramp up to
 *    a plateau. Two trees stand on the plateau 8 m apart from the car line, so
 *    the car cannot drive up (tan 35° > wet-mud friction 0.32) and must winch;
 *  - a stump, bush and boulder around the pad for the failure states;
 *  - a stream at x≈73 with a tree across it for the lateral-drag counterexample.
 */
export function createWinchCourse(
  scene: THREE.Scene,
  world: RAPIER.World,
  field: TerrainField,
): WinchAnchor[] {
  const anchors: WinchAnchor[] = [];

  // A practice anchor within 12 m of the spawn: the winch only reacts when an
  // anchor is in range, so without this the first F/G press at the start gate
  // looks like a dead key. The sign and the tutorial banner point at it.
  anchors.push(
    createTree(scene, world, 'spawn-tree', '起手锚点（练习）', 3.5, 9),
  );
  addSign(scene, '起手绞盘 F / G', 0, 2.2, 13, 0xf0c35a);

  // Original W1 anchors (three trees) are now real, selectable W3 anchors.
  anchors.push(createTree(scene, world, 'anchor-a', '锚点 A', 13, 118));
  anchors.push(createTree(scene, world, 'anchor-b', '锚点 B', -16, 145));
  anchors.push(createTree(scene, world, 'anchor-c', '锚点 C', 11, 210));

  // W3 winch pad: wet mud floor -> 35° ramp -> plateau with two trees.
  addBox(scene, world, field, {
    size: [10, 0.1, 8],
    position: [50, 0.0, 148],
    color: 0x3a2a1c,
    surface: SURFACES.wetMud,
  });
  addBox(scene, world, field, {
    size: [10, 0.4, 4.0],
    position: [50, 0.45, 153.3],
    rotation: [-0.61, 0, 0],
    color: 0x3a2a1c,
    surface: SURFACES.wetMud,
  });
  addBox(scene, world, field, {
    size: [10, 0.5, 5],
    position: [50, 1.51, 157],
    color: 0x4b3826,
    surface: SURFACES.mud,
  });
  addSign(scene, 'W3 绞盘试炼 · 35° 湿泥坡', 43, 2.8, 145, 0xf0c35a);

  anchors.push(createTree(scene, world, 'pad-tree-a', '泥坑树 A', 51.5, 157.5, 1.76));
  anchors.push(createTree(scene, world, 'pad-tree-b', '泥坑树 B（偏 18°）', 47.5, 157, 1.76));
  // A rotten stump: same type as the table's 60-strength wood pole but a
  // deliberately weak instance so the "anchor pulls out" failure is teachable.
  anchors.push(
    createStump(scene, world, 'pad-stump', '朽木桩（会断）', 53.5, 158, 1.76, 20),
  );
  anchors.push(createBush(scene, 'pad-bush', '细灌木（挂不住）', 52.5, 150));
  anchors.push(createRock(scene, world, 'pad-rock', '大岩石（会滚）', 44.5, 150.5));

  // Cross-water counterexample: a 3.5 m stream between the car and the tree.
  addWater(scene, field, {
    x: 73,
    z: 156.5,
    width: 24,
    depth: 3.5,
    level: 0.6,
    color: 0x2f6f86,
  });
  addSign(scene, '跨水锚点 · 拉车会横拖入水', 63, 2.4, 152, 0x6fc3e0);
  anchors.push(createTree(scene, world, 'stream-tree', '跨水树', 73, 161.5));

  addSign(scene, 'W3 绞盘试炼 → 东侧 x≈50 / z≈148', 7, 2.6, 14, 0xf0c35a);

  return anchors;
}

function createTree(
  scene: THREE.Scene,
  world: RAPIER.World,
  id: string,
  label: string,
  x: number,
  z: number,
  baseY = 0,
): WinchAnchor {
  const group = new THREE.Group();
  group.position.set(x, baseY, z);
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.44, 3.2, 10),
    new THREE.MeshStandardMaterial({ color: 0x5a3b24, roughness: 0.95 }),
  );
  trunk.position.y = 1.6;
  trunk.castShadow = true;
  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(1.85, 3.4, 10),
    new THREE.MeshStandardMaterial({ color: 0x2f5c35, roughness: 0.95 }),
  );
  canopy.position.y = 4.0;
  canopy.castShadow = true;
  group.add(trunk, canopy);
  const ring = createRing(group, ANCHOR_TYPES.tree.color, 1.15);
  scene.add(group);

  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(x, baseY + 1.6, z),
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.cylinder(1.6, 0.44),
    body,
  );
  const labelMesh = addLabel(
    scene,
    label,
    x - 2.3,
    baseY + 3.4,
    z,
    ANCHOR_TYPES.tree.color,
  );

  return {
    id,
    kind: 'tree',
    label,
    attachPoint: new THREE.Vector3(x, baseY + 1.2, z),
    baseY,
    strength: ANCHOR_TYPES.tree.strength,
    group,
    ring,
    labelMesh: labelMesh ?? undefined,
    colliderHandles: new Set([collider.handle]),
    status: 'ok',
    failTimer: -1,
    failDirection: new THREE.Vector3(0, 0, 1),
  };
}

function createStump(
  scene: THREE.Scene,
  world: RAPIER.World,
  id: string,
  label: string,
  x: number,
  z: number,
  baseY = 0,
  strength = ANCHOR_TYPES.stump.strength,
): WinchAnchor {
  const group = new THREE.Group();
  group.position.set(x, baseY, z);
  const stump = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.3, 0.9, 8),
    new THREE.MeshStandardMaterial({ color: 0x6b4b2e, roughness: 0.95 }),
  );
  stump.position.y = 0.45;
  stump.castShadow = true;
  group.add(stump);
  const ring = createRing(group, ANCHOR_TYPES.stump.color, 0.85);
  scene.add(group);

  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(x, baseY + 0.45, z),
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.cylinder(0.45, 0.3),
    body,
  );
  const labelMesh = addLabel(
    scene,
    label,
    x - 1.8,
    baseY + 1.8,
    z,
    ANCHOR_TYPES.stump.color,
  );

  return {
    id,
    kind: 'stump',
    label,
    attachPoint: new THREE.Vector3(x, baseY + 0.8, z),
    baseY,
    strength,
    group,
    ring,
    labelMesh: labelMesh ?? undefined,
    colliderHandles: new Set([collider.handle]),
    status: 'ok',
    failTimer: -1,
    failDirection: new THREE.Vector3(0, 0, 1),
  };
}

function createBush(
  scene: THREE.Scene,
  id: string,
  label: string,
  x: number,
  z: number,
): WinchAnchor {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const material = new THREE.MeshStandardMaterial({ color: 0x3f6b3a, roughness: 0.95 });
  for (const [dx, dz, size] of [
    [0, 0, 0.55],
    [0.4, 0.2, 0.4],
    [-0.35, 0.25, 0.35],
  ] as const) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(size, size * 1.7, 6), material);
    leaf.position.set(dx, size * 0.85, dz);
    leaf.castShadow = true;
    group.add(leaf);
  }
  const ring = createRing(group, ANCHOR_TYPES.bush.color, 0.7);
  scene.add(group);
  const labelMesh = addLabel(scene, label, x - 2, 1.6, z, ANCHOR_TYPES.bush.color);

  return {
    id,
    kind: 'bush',
    label,
    attachPoint: new THREE.Vector3(x, 0.45, z),
    baseY: 0,
    strength: ANCHOR_TYPES.bush.strength,
    group,
    ring,
    labelMesh: labelMesh ?? undefined,
    colliderHandles: new Set<number>(),
    status: 'ok',
    failTimer: -1,
    failDirection: new THREE.Vector3(0, 0, 1),
  };
}

function createRock(
  scene: THREE.Scene,
  world: RAPIER.World,
  id: string,
  label: string,
  x: number,
  z: number,
): WinchAnchor {
  const group = new THREE.Group();
  group.position.set(x, 1, z);
  const boulder = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.1, 1),
    new THREE.MeshStandardMaterial({ color: 0x77776c, roughness: 0.95 }),
  );
  boulder.scale.set(1.15, 0.95, 1);
  boulder.castShadow = true;
  group.add(boulder);
  scene.add(group);

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: ANCHOR_TYPES.rock.color,
    transparent: true,
    opacity: 0.35,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.05, 8, 32), ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 0.06, z);
  scene.add(ring);

  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(x, 1, z),
  );
  const collider = world.createCollider(RAPIER.ColliderDesc.ball(1.1), body);
  const labelMesh = addLabel(scene, label, x - 2.2, 2.8, z, ANCHOR_TYPES.rock.color);

  return {
    id,
    kind: 'rock',
    label,
    attachPoint: new THREE.Vector3(x, 2.05, z),
    baseY: 0,
    strength: ANCHOR_TYPES.rock.strength,
    group,
    ring,
    labelMesh: labelMesh ?? undefined,
    colliderHandles: new Set([collider.handle]),
    rigidBody: body,
    status: 'ok',
    failTimer: -1,
    failDirection: new THREE.Vector3(0, 0, 1),
  };
}

function createRing(group: THREE.Group, color: number, radius: number): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.35,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.05, 8, 32), material);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  group.add(ring);
  return ring;
}

function addBox(
  scene: THREE.Scene,
  world: RAPIER.World,
  field: TerrainField,
  options: BoxOptions,
): void {
  const [sx, sy, sz] = options.size;
  const [px, py, pz] = options.position;
  const [rx, ry, rz] = options.rotation ?? [0, 0, 0];
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(sx, sy, sz),
    new THREE.MeshStandardMaterial({ color: options.color, roughness: 0.95 }),
  );
  mesh.position.set(px, py, pz);
  mesh.rotation.set(rx, ry, rz);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  scene.add(mesh);

  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed()
      .setTranslation(px, py, pz)
      .setRotation({ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w }),
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2)
      .setFriction(options.surface.friction)
      .setRestitution(0),
    body,
  );
  field.addSurface(collider.handle, options.surface);
}

function addWater(
  scene: THREE.Scene,
  field: TerrainField,
  options: {
    x: number;
    z: number;
    width: number;
    depth: number;
    level: number;
    color: number;
  },
): void {
  const material = new THREE.MeshPhysicalMaterial({
    color: options.color,
    transparent: true,
    opacity: 0.58,
    roughness: 0.12,
    metalness: 0.04,
    transmission: 0.12,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(options.width, options.depth),
    material,
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(options.x, options.level, options.z);
  scene.add(water);

  field.addWater({
    x: options.x,
    z: options.z,
    halfWidth: options.width / 2,
    halfDepth: options.depth / 2,
    level: options.level,
    depth: options.level,
  });
}

function addLabel(
  scene: THREE.Scene,
  text: string,
  x: number,
  y: number,
  z: number,
  color: number,
): THREE.Mesh | null {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = 'rgba(10, 14, 10, 0.78)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
  context.lineWidth = 7;
  context.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
  context.fillStyle = '#e9f0e4';
  context.font = 'bold 48px "PingFang SC", "Hiragino Sans GB", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2 + 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), material);
  sign.position.set(x, y, z);
  sign.rotation.y = Math.PI;
  scene.add(sign);
  return sign;
}

function addSign(
  scene: THREE.Scene,
  text: string,
  x: number,
  y: number,
  z: number,
  color: number,
): void {
  addLabel(scene, text, x, y, z, color);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, y, 6),
    new THREE.MeshStandardMaterial({ color: 0x777777 }),
  );
  pole.position.set(x, y / 2, z);
  scene.add(pole);
}
