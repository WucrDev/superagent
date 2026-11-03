import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

const GROUND_SIZE = 400;

interface StaticBox {
  size: [number, number, number];
  position: [number, number, number];
  rotation?: [number, number, number];
  color: number;
  friction?: number;
}

/**
 * Flat proving ground for the W1 skeleton. The real whitebox test track lands in
 * W1 #5 / issue #11; this only needs enough surface to verify driving + physics.
 */
export function createTestGround(scene: THREE.Scene, world: RAPIER.World): void {
  const groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new THREE.MeshStandardMaterial({ color: 0x46543a, roughness: 0.96, metalness: 0 }),
  );
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  const grid = new THREE.GridHelper(GROUND_SIZE, 80, 0x7f8f6d, 0x2a3424);
  grid.position.y = 0.02;
  const gridMaterial = grid.material as THREE.Material;
  gridMaterial.transparent = true;
  gridMaterial.opacity = 0.28;
  scene.add(grid);

  const groundBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(GROUND_SIZE / 2, 0.5, GROUND_SIZE / 2).setFriction(1.0),
    groundBody,
  );

  // Low ramps and a couple of obstacles so the chase camera has scale references.
  addStaticBox(scene, world, {
    size: [8, 0.5, 12],
    position: [14, 0.25, -20],
    rotation: [-0.12, 0, 0],
    color: 0x6b5741,
  });
  addStaticBox(scene, world, {
    size: [10, 0.6, 8],
    position: [-18, 0.3, 16],
    rotation: [0.1, 0.35, 0],
    color: 0x6b5741,
  });
  addStaticBox(scene, world, {
    size: [4, 0.3, 4],
    position: [7, 0.15, 11],
    color: 0x5b5b55,
  });
  addStaticBox(scene, world, {
    size: [2, 1.2, 2],
    position: [-9, 0.6, -8],
    color: 0x6f6f66,
  });
  addStaticBox(scene, world, {
    size: [2.6, 0.8, 2.2],
    position: [18, 0.4, 6],
    color: 0x6f6f66,
  });
  addStaticBox(scene, world, {
    size: [1.4, 1.8, 1.4],
    position: [-24, 0.9, -4],
    color: 0x7a6a52,
  });

  addStartLine(scene);
}

function addStaticBox(scene: THREE.Scene, world: RAPIER.World, box: StaticBox): void {
  const [sx, sy, sz] = box.size;
  const [px, py, pz] = box.position;
  const [rx, ry, rz] = box.rotation ?? [0, 0, 0];

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(sx, sy, sz),
    new THREE.MeshStandardMaterial({ color: box.color, roughness: 0.9, metalness: 0.02 }),
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
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2).setFriction(box.friction ?? 0.9),
    body,
  );
}

function addStartLine(scene: THREE.Scene): void {
  const material = new THREE.MeshBasicMaterial({ color: 0xd8d2b8 });
  const line = new THREE.Mesh(new THREE.BoxGeometry(10, 0.02, 0.4), material);
  line.position.set(0, 0.03, 7);
  scene.add(line);

  const postMaterial = new THREE.MeshStandardMaterial({ color: 0x8a2f22, roughness: 0.7 });
  for (const x of [-5.2, 5.2]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.2, 0.18), postMaterial);
    post.position.set(x, 1.6, 7);
    post.castShadow = true;
    scene.add(post);
  }
}
