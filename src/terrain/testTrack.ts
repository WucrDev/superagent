import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { SURFACES, TerrainField, type Surface } from './surfaces';

const GROUND_SIZE = 800;
const DITCH_Z = 175;
const DITCH_HALF_WIDTH = 25;
const DITCH_HALF_LENGTH = 1;

interface StaticBoxOptions {
  size: [number, number, number];
  position: [number, number, number];
  rotation?: [number, number, number];
  color: number;
  surface?: Surface;
  friction?: number;
  restitution?: number;
}

/**
 * W1 #5 / issue #11: 800 x 800 m whitebox test ground.
 *
 * Zones, in driving order from the spawn: start gate -> gentle slope -> shallow
 * water (40 cm) -> rock pile -> 30° / 35° mud slopes -> 2 m ditch -> deep water
 * (80 cm) -> three winch anchors.
 *
 * W2 #6 / issue #12 adds the surface lanes and the dry-vs-wet-mud ramp pair.
 * Every collider is registered with a surface in the returned `TerrainField`;
 * the vehicle resolves friction from that instead of the collider value.
 */
export function createTestTrack(scene: THREE.Scene, world: RAPIER.World): TerrainField {
  const field = new TerrainField();
  const box = (options: StaticBoxOptions): void => addStaticBox(scene, world, field, options);

  buildGround(scene, world, field);
  buildStartGate(scene, world);

  // Gentle 8° hill with a flat top and a matching descent.
  box({
    size: [18, 0.5, 26],
    position: [0, 1.52, 40],
    rotation: [-0.14, 0, 0],
    color: 0x5a6248,
  });
  box({
    size: [18, 0.5, 12],
    position: [0, 3.38, 59],
    color: 0x5a6248,
  });
  box({
    size: [18, 0.5, 22],
    position: [0, 1.36, 76],
    rotation: [0.18, 0, 0],
    color: 0x5a6248,
  });

  // Shallow water (40 cm).
  addWater(scene, field, {
    x: 0,
    z: 100,
    width: 42,
    depth: 24,
    level: 0.4,
    color: 0x3f7f9a,
  });
  addSign(scene, '浅水 40cm', -13, 2.2, 100, 0x3f7f9a);

  // Rock pile.
  for (const [x, z, size] of [
    [-8, 114, 1.6],
    [9, 116, 2.2],
    [-10, 112, 1.4],
    [8, 120, 1.2],
    [11, 122, 1.8],
  ] as const) {
    box({
      size: [size, size, size],
      position: [x, size / 2, z],
      rotation: [0.2, x * 0.1, 0.1],
      color: 0x6f6f66,
      friction: 0.95,
      surface: SURFACES.rock,
    });
  }

  // Mud slopes: 30° for the L/H gear check, 35° per the track spec. Keep the
  // W1 friction values via a per-zone override so the W1 acceptance still holds.
  addMudSlope(scene, world, field, '30° 泥坡', 135, 0.52, 0.7);
  addMudSlope(scene, world, field, '35° 泥坡', 158, 0.61, 0.55);

  // W2 #12: dry dirt vs wet mud on the same 30° geometry.
  addRamp(scene, world, field, '干土 30°', -60, 118, 0.52, {
    ...SURFACES.dirt,
  });
  addRamp(scene, world, field, '湿泥 30°', -32, 118, 0.52, {
    ...SURFACES.wetMud,
  });

  // W2 #12: four material lanes for back-to-back feel tests.
  addSurfaceLane(scene, world, field, '干土（基线）', 40, 80, SURFACES.dirt, 0x5f6b47);
  addSurfaceLane(scene, world, field, '泥地', 54, 80, SURFACES.mud, 0x4a3420);
  addSurfaceLane(scene, world, field, '岩石', 68, 80, SURFACES.rock, 0x7c7c74);
  addSurfaceLane(scene, world, field, '雪地', 82, 80, SURFACES.snow, 0xe8eef4);

  // 2 m ditch across the middle of the track.
  addSign(scene, '2m 沟', -13, 2.4, DITCH_Z, 0xc9a227);

  // Deep water (80 cm).
  addWater(scene, field, {
    x: 0,
    z: 200,
    width: 36,
    depth: 30,
    level: 0.8,
    color: 0x214e6b,
  });
  addSign(scene, '深水 80cm', -13, 2.4, 200, 0x214e6b);

  // Three winch anchors for W3.
  addAnchor(scene, world, '锚点 A', 13, 118);
  addAnchor(scene, world, '锚点 B', -16, 145);
  addAnchor(scene, world, '锚点 C', 11, 210);

  return field;
}

function buildGround(scene: THREE.Scene, world: RAPIER.World, field: TerrainField): void {
  const dirt = SURFACES.dirt;
  const thickness = 2.5;
  const y = -thickness / 2;
  const ground = (options: StaticBoxOptions): void => addStaticBox(scene, world, field, options);
  // West / east slabs, then the north / south slabs around the ditch slot.
  ground({
    size: [375, thickness, GROUND_SIZE],
    position: [-(DITCH_HALF_WIDTH + 375 / 2), y, 0],
    color: 0x46543a,
    friction: 1,
    surface: dirt,
  });
  ground({
    size: [375, thickness, GROUND_SIZE],
    position: [DITCH_HALF_WIDTH + 375 / 2, y, 0],
    color: 0x46543a,
    friction: 1,
    surface: dirt,
  });
  ground({
    size: [DITCH_HALF_WIDTH * 2, thickness, 400 + DITCH_Z - DITCH_HALF_LENGTH],
    position: [0, y, (-400 + DITCH_Z - DITCH_HALF_LENGTH) / 2],
    color: 0x46543a,
    friction: 1,
    surface: dirt,
  });
  ground({
    size: [DITCH_HALF_WIDTH * 2, thickness, 400 - DITCH_Z - DITCH_HALF_LENGTH],
    position: [0, y, (400 + DITCH_Z + DITCH_HALF_LENGTH) / 2],
    color: 0x46543a,
    friction: 1,
    surface: dirt,
  });
  ground({
    size: [DITCH_HALF_WIDTH * 2, 0.5, DITCH_HALF_LENGTH * 2],
    position: [0, -2.25, DITCH_Z],
    color: 0x2a2a24,
    friction: 0.9,
    surface: SURFACES.mud,
  });

  const grid = new THREE.GridHelper(GROUND_SIZE, 80, 0x7f8f6d, 0x2a3424);
  grid.position.y = 0.02;
  const gridMaterial = grid.material as THREE.Material;
  gridMaterial.transparent = true;
  gridMaterial.opacity = 0.18;
  scene.add(grid);
}

function buildStartGate(scene: THREE.Scene, world: RAPIER.World): void {
  const postMaterial = new THREE.MeshStandardMaterial({ color: 0x8a2f22, roughness: 0.7 });
  for (const x of [-6, 6]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.24, 3.4, 0.24), postMaterial);
    post.position.set(x, 1.7, 5);
    post.castShadow = true;
    scene.add(post);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(x, 1.7, 5),
    );
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.12, 1.7, 0.12), body);
  }

  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(12, 0.5, 0.08),
    new THREE.MeshStandardMaterial({ color: 0xd8d2b8, roughness: 0.8 }),
  );
  banner.position.set(0, 3.35, 5);
  banner.castShadow = true;
  scene.add(banner);
}

function addMudSlope(
  scene: THREE.Scene,
  world: RAPIER.World,
  field: TerrainField,
  label: string,
  z: number,
  angle: number,
  friction: number,
): void {
  addRamp(scene, world, field, label, 0, z, angle, {
    ...SURFACES.mud,
    friction,
  });
}

function addRamp(
  scene: THREE.Scene,
  world: RAPIER.World,
  field: TerrainField,
  label: string,
  x: number,
  z: number,
  angle: number,
  surface: Surface,
): void {
  const length = 12;
  const halfLength = length / 2;
  const height = Math.sin(angle) * halfLength;
  const centerY = height - 0.3 * Math.cos(angle);
  const color = surface.id === 'wetMud' ? 0x3f2f20 : 0x6b4b32;
  addStaticBox(scene, world, field, {
    size: [14, 0.6, length],
    position: [x, centerY, z],
    rotation: [-angle, 0, 0],
    color,
    friction: surface.friction,
    surface,
  });
  const topZ = z + Math.cos(angle) * halfLength;
  const topY = height * 2;
  addStaticBox(scene, world, field, {
    size: [14, 0.5, 8],
    position: [x, topY - 0.25, topZ + 4],
    color,
    friction: 0.8,
    surface,
  });
  addSign(scene, label, x - 10, 2.4, z - 6, surface.id === 'wetMud' ? 0x7b6a50 : 0x8a5a2b);
}

function addSurfaceLane(
  scene: THREE.Scene,
  world: RAPIER.World,
  field: TerrainField,
  label: string,
  x: number,
  z: number,
  surface: Surface,
  color: number,
): void {
  addStaticBox(scene, world, field, {
    size: [10, 0.08, 36],
    position: [x, 0.04, z],
    color,
    friction: surface.friction,
    surface,
  });
  addSign(scene, label, x - 7, 2.0, z - 20, surface.dustColor);
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
    opacity: 0.55,
    roughness: 0.15,
    metalness: 0.05,
    transmission: 0.15,
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

  const rimMaterial = new THREE.MeshBasicMaterial({
    color: options.color,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
  });
  const rim = new THREE.Mesh(new THREE.RingGeometry(1, 2, 32), rimMaterial);
  rim.rotation.x = -Math.PI / 2;
  rim.position.set(options.x, options.level + 0.01, options.z);
  scene.add(rim);

  field.addWater({
    x: options.x,
    z: options.z,
    halfWidth: options.width / 2,
    halfDepth: options.depth / 2,
    level: options.level,
    depth: options.level,
  });
}

function addAnchor(
  scene: THREE.Scene,
  world: RAPIER.World,
  label: string,
  x: number,
  z: number,
): void {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.42, 3.2, 10),
    new THREE.MeshStandardMaterial({ color: 0x5a3b24, roughness: 0.95 }),
  );
  trunk.position.set(x, 1.6, z);
  trunk.castShadow = true;
  scene.add(trunk);

  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(1.8, 3.4, 10),
    new THREE.MeshStandardMaterial({ color: 0x2f5c35, roughness: 0.95 }),
  );
  canopy.position.set(x, 4.0, z);
  canopy.castShadow = true;
  scene.add(canopy);

  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(x, 1.6, z),
  );
  world.createCollider(RAPIER.ColliderDesc.cylinder(1.6, 0.42), body);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.2, 0.06, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xf0c35a }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 0.05, z);
  scene.add(ring);
  addSign(scene, label, x - 2.2, 2.0, z, 0xf0c35a);
}

function addSign(
  scene: THREE.Scene,
  text: string,
  x: number,
  y: number,
  z: number,
  color: number,
): void {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.fillStyle = 'rgba(10, 14, 10, 0.82)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
  context.lineWidth = 8;
  context.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
  context.fillStyle = '#e9f0e4';
  context.font = 'bold 56px "PingFang SC", "Hiragino Sans GB", sans-serif';
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
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), material);
  sign.position.set(x, y, z);
  sign.rotation.y = Math.PI;
  scene.add(sign);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, y, 6),
    new THREE.MeshStandardMaterial({ color: 0x777777 }),
  );
  pole.position.set(x, y / 2, z);
  scene.add(pole);
}

function addStaticBox(
  scene: THREE.Scene,
  world: RAPIER.World,
  field: TerrainField,
  options: StaticBoxOptions,
): void {
  const [sx, sy, sz] = options.size;
  const [px, py, pz] = options.position;
  const [rx, ry, rz] = options.rotation ?? [0, 0, 0];
  const surface = options.surface ?? SURFACES.dirt;

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(sx, sy, sz),
    new THREE.MeshStandardMaterial({
      color: options.color,
      roughness: 0.92,
      metalness: 0.02,
    }),
  );
  mesh.position.set(px, py, pz);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed()
      .setTranslation(px, py, pz)
      .setRotation({ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w }),
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2)
      .setFriction(options.friction ?? surface.friction)
      .setRestitution(options.restitution ?? 0),
    body,
  );
  field.addSurface(collider.handle, surface);
}
