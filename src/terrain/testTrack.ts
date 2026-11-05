import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { SURFACES, TerrainField, type Surface } from './surfaces';

const GROUND_SIZE = 800;
const DITCH_Z = 175;
const DITCH_HALF_WIDTH = 25;
const DITCH_HALF_LENGTH = 1;

/**
 * W4 rework: a compact, signposted tool-test pad just east of the spawn.
 *
 * The old W4 self-test dropped the car at the far 2 m ditch with `car.place`.
 * A real player driving from spawn hit the rock pile, then the 30° / 35° mud
 * slopes, lost all health and was pushed outside the ditch. This pad puts a
 * second 2 m ditch, a single-wheel rollover ramp, a low-speed crash block and
 * supply crates within ~60 m of spawn, on flat ground with no obstacles before
 * it. The W1/W2/W3 coordinates, slopes and anchors are unchanged; only the
 * east ground slab is split around the new ditch.
 */
const W4_DITCH_X = 33;
const W4_DITCH_HALF_WIDTH = 1;
const W4_DITCH_Z = 25;
const W4_DITCH_HALF_LENGTH = 10;

const W4_RAMP_CENTER_X = 50;
const W4_RAMP_CENTER_Z = 25.2;
const W4_RAMP_LENGTH = 7;
const W4_RAMP_WIDTH = 1.6;
const W4_RAMP_ANGLE = 0.35;

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
  buildW4Pad(scene, world, field);

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

  // W2 #12: four material lanes for back-to-back feel tests. The lanes start
  // at z = 54 (centre 78, 48 m long) so a standing start at z = 55 is already
  // on the tested material; the previous 62 m start put the first 7 m on dry
  // dirt and hid most of the launch difference.
  addSurfaceLane(scene, world, field, '干土（基线）', 40, 78, SURFACES.dirt, 0x5f6b47);
  addSurfaceLane(scene, world, field, '泥地', 54, 78, SURFACES.mud, 0x4a3420);
  addSurfaceLane(scene, world, field, '岩石', 68, 78, SURFACES.rock, 0x7c7c74);
  addSurfaceLane(scene, world, field, '雪地', 82, 78, SURFACES.snow, 0xe8eef4);

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

  // W3 anchors and the winch test pad live in terrain/winchCourse.ts.

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
  // The east slab carries the W4 pad, so split it around that 2 m ditch. The
  // rest of the W1/W2/W3 layout keeps exactly the same colliders as before.
  const w4West = W4_DITCH_X - W4_DITCH_HALF_WIDTH;
  const w4East = W4_DITCH_X + W4_DITCH_HALF_WIDTH;
  ground({
    size: [w4West - DITCH_HALF_WIDTH, thickness, GROUND_SIZE],
    position: [(DITCH_HALF_WIDTH + w4West) / 2, y, 0],
    color: 0x46543a,
    friction: 1,
    surface: dirt,
  });
  ground({
    size: [400 - w4East, thickness, GROUND_SIZE],
    position: [(w4East + 400) / 2, y, 0],
    color: 0x46543a,
    friction: 1,
    surface: dirt,
  });
  ground({
    size: [W4_DITCH_HALF_WIDTH * 2, thickness, 400 + W4_DITCH_Z - W4_DITCH_HALF_LENGTH],
    position: [W4_DITCH_X, y, (-400 + W4_DITCH_Z - W4_DITCH_HALF_LENGTH) / 2],
    color: 0x46543a,
    friction: 1,
    surface: dirt,
  });
  ground({
    size: [W4_DITCH_HALF_WIDTH * 2, thickness, 400 - W4_DITCH_Z - W4_DITCH_HALF_LENGTH],
    position: [W4_DITCH_X, y, (400 + W4_DITCH_Z + W4_DITCH_HALF_LENGTH) / 2],
    color: 0x46543a,
    friction: 1,
    surface: dirt,
  });
  ground({
    size: [W4_DITCH_HALF_WIDTH * 2, 0.5, W4_DITCH_HALF_LENGTH * 2],
    position: [W4_DITCH_X, -2.25, W4_DITCH_Z],
    color: 0x2a2a24,
    friction: 0.9,
    surface: SURFACES.mud,
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

/**
 * W4 rework: compact tool-test pad east of the spawn.
 *
 * Layout, all on flat dirt with no obstacles on the approach:
 *  - dashed lane + signs point east from the start gate;
 *  - a 20 m-long 2 m ditch at x=33 with a painted stop box;
 *  - a single-wheel rollover ramp at x≈50 that tips the car onto its side;
 *  - a low-speed crash block at x=60 and a repair-crate station south of it.
 * Supplies and the crash block are signposted so this path needs no debug
 * commands; `car.place` is only used while tuning the pad.
 */
function buildW4Pad(scene: THREE.Scene, world: RAPIER.World, field: TerrainField): void {
  const box = (options: StaticBoxOptions): void => addStaticBox(scene, world, field, options);

  addSign(
    scene,
    'W4 工具试炼 → 出闸左转 35 m',
    -10.5,
    3.0,
    9.5,
    0xf0c35a,
    Math.PI,
    3.2,
  );
  addSign(
    scene,
    'W4 试炼场 · 补给驶过拾取 · 1–4/T',
    26,
    2.6,
    33,
    0xf0c35a,
    -Math.PI / 2,
    2.6,
  );

  // Dashed lead-in on the flat ground, plus a painted stop box. The plank is
  // 4 m long and is placed 4.4 m ahead, so the car centre must stop between
  // x=27.6 and x=29.6 for both board ends to find ground on either bank.
  for (const x of [12, 16.5, 21, 25.5]) {
    addGroundMark(scene, 2.2, 0.28, x, W4_DITCH_Z, 0xf0c35a);
  }
  addGroundMark(scene, 2.0, 16.0, 28.6, W4_DITCH_Z, 0x8a7a55);
  addGroundMark(scene, 0.45, 16.0, 27.7, W4_DITCH_Z, 0xf0c35a);
  addGroundMark(scene, 0.45, 16.0, 29.7, W4_DITCH_Z, 0xf0c35a);

  addSign(
    scene,
    '2m 沟 · 停进黄框 · 2 选木板 · G 架桥',
    28.4,
    2.7,
    18.2,
    0xc9a227,
    -Math.PI / 2,
    2.6,
  );
  addSign(
    scene,
    '过沟直行 → 侧翻坡',
    36.6,
    2.6,
    19.8,
    0xc9a227,
    -Math.PI / 2,
    2.6,
  );
  addSign(
    scene,
    '侧翻测试 · 左轮上坡',
    44.5,
    2.5,
    30.5,
    0xf0c35a,
    -Math.PI / 2,
    2.6,
  );
  addSign(
    scene,
    '撞击墩 · 低速撞一下',
    55.2,
    2.4,
    16.5,
    0xc94f5a,
    -Math.PI / 2,
    2.6,
  );
  addSign(
    scene,
    '维修包补给 · 停稳按住 G 2 s',
    60,
    2.4,
    14.5,
    0xc94f5a,
    -Math.PI / 2,
    2.6,
  );

  // Marker posts frame the ditch so it reads as a test feature, not a random
  // hole in the world. No colliders: they must not damage the approach.
  for (const [x, z] of [
    [31.2, 14.4],
    [31.2, 35.6],
    [34.8, 14.4],
    [34.8, 35.6],
  ] as const) {
    addMarkerPost(scene, x, z, 0xf0c35a);
  }

  // Single-wheel rollover ramp: the car approaches east along z≈24.5, so the
  // left wheels ride this 1.6 m-wide ramp while the right wheels stay low.
  const half = W4_RAMP_LENGTH / 2;
  const rampCenterY =
    Math.sin(W4_RAMP_ANGLE) * half - Math.cos(W4_RAMP_ANGLE) * 0.2 + 0.02;
  box({
    size: [W4_RAMP_LENGTH, 0.4, W4_RAMP_WIDTH],
    position: [W4_RAMP_CENTER_X, rampCenterY, W4_RAMP_CENTER_Z],
    rotation: [0, 0, W4_RAMP_ANGLE],
    color: 0x8a6a3a,
    friction: 1,
    surface: SURFACES.dirt,
  });

  // Low-speed damage source; one hit costs ~22 health, two hits put the car
  // in comfortable range for the +35 repair check.
  box({
    size: [2.2, 1.0, 3.0],
    position: [60, 0.5, 21.5],
    color: 0x8a8a82,
    friction: 0.9,
    surface: SURFACES.rock,
  });

  // A gentle dirt apron so the rollover ramp reads as part of the pad.
  addGroundMark(scene, 10, 6, 50, 21.5, 0x5f6b47);
}

function addMarkerPost(scene: THREE.Scene, x: number, z: number, color: number): void {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.4, 8), material);
  post.position.set(x, 0.7, z);
  post.castShadow = true;
  scene.add(post);
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 0.18, 8),
    new THREE.MeshStandardMaterial({ color: 0x1d2328, roughness: 0.8 }),
  );
  band.position.set(x, 1.15, z);
  scene.add(band);
}

function addGroundMark(
  scene: THREE.Scene,
  width: number,
  depth: number,
  x: number,
  z: number,
  color: number,
): void {
  const mark = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  mark.rotation.x = -Math.PI / 2;
  mark.position.set(x, 0.035, z);
  scene.add(mark);
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
    size: [10, 0.08, 48],
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

  field.addWater({
    x: options.x,
    z: options.z,
    halfWidth: options.width / 2,
    halfDepth: options.depth / 2,
    level: options.level,
    depth: options.level,
  });
}

function addSign(
  scene: THREE.Scene,
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
    side: THREE.FrontSide,
  });
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.06, width / 4 + 0.06, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x1a1e17, roughness: 0.9 }),
  );
  board.position.set(x, y, z);
  board.rotation.y = yaw;
  scene.add(board);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), material);
  sign.position.set(x + Math.sin(yaw) * 0.021, y, z + Math.cos(yaw) * 0.021);
  sign.rotation.y = yaw;
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
