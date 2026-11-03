import * as THREE from 'three';
import type { Surface } from '../terrain/surfaces';
import type { RaycastVehicle } from '../vehicle/raycastVehicle';

const UP = new THREE.Vector3(0, 1, 0);
const MARK_LIFETIME = 8;
const MARK_INTERVAL = 0.18;

/**
 * W2 #7 / issue #13: slip dust/snow, water spray, tire marks and the white
 * smoke that tells the driver the engine has taken on water.
 *
 * Everything is pooled: particles are two THREE.Points buffers and the marks
 * are a fixed ring of ground-aligned planes, so the effect layer allocates
 * nothing per frame.
 */
export class SurfaceEffects {
  private readonly debris: ParticleField;
  private readonly spray: ParticleField;
  private readonly smoke: ParticleField;
  private readonly marks = new TireMarks(180);
  private markTimer = 0;

  constructor(scene: THREE.Scene) {
    const texture = createParticleTexture();
    this.debris = new ParticleField(320, 0.18, 0.18, -9.8, texture);
    this.spray = new ParticleField(180, 0.24, 0.14, -9.8, texture);
    this.smoke = new ParticleField(140, 1.1, 0.3, -0.25, texture);
    scene.add(this.debris.points, this.spray.points, this.smoke.points);
    scene.add(this.marks.group);
  }

  update(dt: number, car: RaycastVehicle): void {
    this.debris.update(dt);
    this.spray.update(dt);
    this.smoke.update(dt);
    this.marks.update(dt);

    const contacts = car.contacts;
    const speed = car.speedKmh;
    const markThisFrame = this.markTimer <= 0;
    if (markThisFrame) this.markTimer = MARK_INTERVAL;
    this.markTimer -= dt;

    for (const contact of contacts) {
      if (!contact.grounded) continue;
      const surface = contact.surface;
      if (contact.slipSpeed > 2.2 && surface.looseness > 0) {
        if (Math.random() < 0.45) {
          const velocity = contact.forward
            .clone()
            .multiplyScalar(-1.3 - Math.random() * 1.4)
            .add(new THREE.Vector3(
              (Math.random() - 0.5) * 1.2,
              1.1 + Math.random() * 1.5,
              (Math.random() - 0.5) * 1.2,
            ));
          this.debris.spawn(
            contact.point,
            velocity,
            0.5 + Math.random() * 0.5,
            surface.dustColor,
          );
        }
        if (markThisFrame && speed > 4) {
          this.marks.spawn(contact.point, contact.normal, contact.forward, surface);
        }
      }

      if (contact.waterDepth > 0.05 && speed > 3 && Math.random() < 0.5) {
        this.spray.spawn(
          contact.point,
          new THREE.Vector3(
            (Math.random() - 0.5) * 1.6,
            0.9 + Math.random() * 1.8,
            (Math.random() - 0.5) * 1.6,
          ),
          0.45 + Math.random() * 0.4,
          0xd7eef7,
        );
      }
    }

    if (car.waterIngress > 0.12 && Math.random() < 0.55) {
      const engine = car.position
        .clone()
        .addScaledVector(car.up, 0.65)
        .addScaledVector(car.forward, 1.5);
      const velocity = car.forward
        .clone()
        .multiplyScalar(-0.5 - Math.random() * 0.5)
        .add(new THREE.Vector3(
          (Math.random() - 0.5) * 0.7,
          0.7 + Math.random() * 0.5,
          (Math.random() - 0.5) * 0.7,
        ));
      this.smoke.spawn(
        engine.add(new THREE.Vector3(
          (Math.random() - 0.5) * 0.5,
          Math.random() * 0.3,
          (Math.random() - 0.5) * 0.5,
        )),
        velocity,
        1.4 + Math.random() * 0.9,
        0xeef3f6,
      );
    }
  }

  dispose(): void {
    this.debris.dispose();
    this.spray.dispose();
    this.smoke.dispose();
    this.marks.dispose();
  }
}

interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  color: THREE.Color;
}

class ParticleField {
  readonly points: THREE.Points;
  private readonly particles: Particle[] = [];
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.PointsMaterial;
  private cursor = 0;

  constructor(
    private readonly count: number,
    size: number,
    private readonly opacity: number,
    private readonly gravity: number,
    texture: THREE.Texture,
  ) {
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      this.positions[i * 3 + 1] = -1000;
      this.particles.push({
        position: new THREE.Vector3(0, -1000, 0),
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        color: new THREE.Color(1, 1, 1),
      });
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.material = new THREE.PointsMaterial({
      size,
      map: texture,
      vertexColors: true,
      transparent: true,
      opacity,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  spawn(position: THREE.Vector3, velocity: THREE.Vector3, life: number, color: number): void {
    const particle = this.particles[this.cursor]!;
    this.cursor = (this.cursor + 1) % this.count;
    particle.position.copy(position);
    particle.velocity.copy(velocity);
    particle.life = life;
    particle.maxLife = life;
    particle.color.set(color);
  }

  update(dt: number): void {
    for (let i = 0; i < this.count; i += 1) {
      const particle = this.particles[i]!;
      if (particle.life > 0) {
        particle.life -= dt;
        particle.position.addScaledVector(particle.velocity, dt);
        particle.velocity.y += this.gravity * dt;
        if (particle.life <= 0) particle.position.y = -1000;
      }
      this.positions[i * 3] = particle.position.x;
      this.positions[i * 3 + 1] = particle.position.y;
      this.positions[i * 3 + 2] = particle.position.z;
      this.colors[i * 3] = particle.color.r;
      this.colors[i * 3 + 1] = particle.color.g;
      this.colors[i * 3 + 2] = particle.color.b;
    }
    this.geometry.attributes.position!.needsUpdate = true;
    this.geometry.attributes.color!.needsUpdate = true;
    this.material.opacity = this.opacity;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

class TireMarks {
  readonly group = new THREE.Group();
  private readonly meshes: THREE.Mesh[] = [];
  private readonly materials: THREE.MeshBasicMaterial[] = [];
  private readonly lives: number[] = [];
  private readonly geometry: THREE.PlaneGeometry;
  private cursor = 0;

  constructor(private readonly count: number) {
    this.geometry = new THREE.PlaneGeometry(0.3, 0.72);
    this.geometry.rotateX(-Math.PI / 2);
    for (let i = 0; i < count; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: 0x241a10,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      });
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.visible = false;
      this.group.add(mesh);
      this.meshes.push(mesh);
      this.materials.push(material);
      this.lives.push(0);
    }
  }

  spawn(
    point: THREE.Vector3,
    normal: THREE.Vector3,
    forward: THREE.Vector3,
    surface: Surface,
  ): void {
    const index = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    const mesh = this.meshes[index]!;
    const material = this.materials[index]!;
    mesh.position.copy(point).addScaledVector(normal, 0.03);
    mesh.quaternion.setFromUnitVectors(UP, normal);
    mesh.rotateOnWorldAxis(normal, Math.atan2(forward.x, forward.z));
    material.color.set(treadColor(surface));
    material.opacity = 0.5;
    mesh.visible = true;
    this.lives[index] = MARK_LIFETIME;
  }

  update(dt: number): void {
    for (let i = 0; i < this.count; i += 1) {
      if (this.lives[i]! <= 0) continue;
      this.lives[i]! -= dt;
      const life = this.lives[i]!;
      if (life <= 0) {
        this.meshes[i]!.visible = false;
        this.materials[i]!.opacity = 0;
      } else {
        this.materials[i]!.opacity = (life / MARK_LIFETIME) * 0.5;
      }
    }
  }

  dispose(): void {
    this.geometry.dispose();
    for (const material of this.materials) material.dispose();
  }
}

function createParticleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas unavailable for particle texture');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.55, 'rgba(255,255,255,0.6)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function treadColor(surface: Surface): number {
  if (surface.id === 'snow') return 0x9fb0bf;
  if (surface.id === 'rock') return 0x2a2a26;
  if (surface.id === 'dirt') return 0x3a2f1e;
  return 0x1e150d;
}
