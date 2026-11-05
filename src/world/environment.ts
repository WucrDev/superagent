import * as THREE from 'three';
import {
  DEFAULT_DAY_SECONDS,
  dayPhaseLabel,
  formatClock,
  headlightsWanted,
  lightDirection,
  skyPalette,
  type SkyPalette,
} from '../core/dayNight';
import { clamp } from '../core/math';
import {
  WEATHER_LABELS,
  nextWeather,
  weatherFog,
  type WeatherKind,
} from '../core/weather';
import type { RaycastVehicle } from '../vehicle/raycastVehicle';

export interface EnvironmentSnapshot {
  hours: number;
  clock: string;
  phase: string;
  weather: WeatherKind;
  weatherLabel: string;
  fastTime: boolean;
  lightsOn: boolean;
  wetness: number;
  rainAmount: number;
  fogAmount: number;
  exposure: number;
  dayLengthMinutes: number;
}

const RAIN_DROPS = 900;
const RAIN_RADIUS = 34;
const RAIN_HEIGHT = 18;
const STAR_COUNT = 900;

function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

/**
 * W5 #20 / issue #26: the visual world clock.
 *
 * Owns the sun/hemisphere lights, gradient sky, stars, rain, fog distance,
 * tone-mapping exposure and the car's headlights. Pure palette math lives in
 * `core/dayNight.ts`; this class is the only piece that touches THREE.
 */
export class Environment {
  private dayLength = DEFAULT_DAY_SECONDS;
  private hours = 16;
  private fast = false;
  private kind: WeatherKind = 'clear';
  private rainAmount = 0;
  private fogAmount = 0;
  private soak = 0;

  private readonly sun: THREE.DirectionalLight;
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly stars: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly rain: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly rainPositions: Float32Array;
  private readonly rainVelocities: Float32Array;
  private readonly headlights: THREE.SpotLight[] = [];
  private readonly carFill: THREE.PointLight;
  private readonly headlightMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly tailMaterials: THREE.MeshStandardMaterial[] = [];
  private lightsOn = false;
  private currentExposure = 1.1;
  private readonly fogColor = new THREE.Color(0x0b1220);

  constructor(
    private readonly scene: THREE.Scene,
    private readonly car: RaycastVehicle,
  ) {
    this.sun = new THREE.DirectionalLight(0xfff0d0, 2.8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -70;
    this.sun.shadow.camera.right = 70;
    this.sun.shadow.camera.top = 70;
    this.sun.shadow.camera.bottom = -70;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 260;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun, this.sun.target);

    this.hemisphere = new THREE.HemisphereLight(0xd6e6ff, 0x46513a, 1.55);
    this.scene.add(this.hemisphere);

    this.scene.fog = new THREE.Fog(0x9fc3e8, 100, 420);
    this.scene.background = new THREE.Color(0x9fc3e8);

    this.sky = this.buildSky();
    this.scene.add(this.sky);

    this.stars = this.buildStars();
    this.scene.add(this.stars);

    this.rainPositions = new Float32Array(RAIN_DROPS * 2 * 3);
    this.rainVelocities = new Float32Array(RAIN_DROPS * 3);
    this.rain = this.buildRain();
    this.scene.add(this.rain);

    this.carFill = new THREE.PointLight(0x9db4e8, 0, 8, 1.6);
    this.carFill.position.set(0, 2.4, 0);
    car.group.add(this.carFill);
    this.buildHeadlights();
    this.apply(car.position);
  }

  get currentHours(): number {
    return this.hours;
  }

  get dayLengthSeconds(): number {
    return this.dayLength;
  }

  get fastTime(): boolean {
    return this.fast;
  }

  get weather(): WeatherKind {
    return this.kind;
  }

  get rainIntensity(): number {
    return this.rainAmount;
  }

  get wetness(): number {
    return clamp(this.soak + this.fogAmount * 0.1, 0, 1);
  }

  get exposure(): number {
    return this.currentExposure;
  }

  get snapshot(): EnvironmentSnapshot {
    return {
      hours: this.hours,
      clock: formatClock(this.hours),
      phase: dayPhaseLabel(this.hours),
      weather: this.kind,
      weatherLabel: WEATHER_LABELS[this.kind],
      fastTime: this.fast,
      lightsOn: this.lightsOn,
      wetness: this.wetness,
      rainAmount: this.rainAmount,
      fogAmount: this.fogAmount,
      exposure: this.currentExposure,
      dayLengthMinutes: this.dayLength / 60,
    };
  }

  setDayLengthMinutes(minutes: number): void {
    this.dayLength = clamp(minutes, 6, 90) * 60;
  }

  setDayLengthSeconds(seconds: number): void {
    this.dayLength = clamp(seconds, 6 * 60, 90 * 60);
  }

  setHours(hours: number): void {
    this.hours = ((hours % 24) + 24) % 24;
  }

  setFastTime(active: boolean): void {
    this.fast = active;
  }

  toggleFastTime(): void {
    this.fast = !this.fast;
  }

  setWeather(kind: WeatherKind): void {
    this.kind = kind;
  }

  cycleWeather(): WeatherKind {
    this.kind = nextWeather(this.kind);
    return this.kind;
  }

  /** Immediate weather state for the recording demo and evidence scripts. */
  setWeatherInstant(kind: WeatherKind): void {
    this.kind = kind;
    this.rainAmount = kind === 'rain' ? 1 : 0;
    this.fogAmount = kind === 'fog' ? 1 : 0;
    this.soak = kind === 'rain' ? 1 : 0;
  }

  /** Fixed-step world update. */
  update(dt: number, carPosition: THREE.Vector3): void {
    const timeScale = this.fast ? 8 : 1;
    this.hours = (this.hours + (24 * dt * timeScale) / this.dayLength) % 24;

    this.rainAmount = damp(
      this.rainAmount,
      this.kind === 'rain' ? 1 : 0,
      this.kind === 'rain' ? 2.2 : 0.8,
      dt,
    );
    this.fogAmount = damp(
      this.fogAmount,
      this.kind === 'fog' ? 1 : 0,
      this.kind === 'fog' ? 1.8 : 0.7,
      dt,
    );
    this.soak =
      this.kind === 'rain'
        ? Math.min(1, this.soak + dt * 0.4)
        : Math.max(0, this.soak - dt * 0.035);

    this.apply(carPosition);
    this.updateRain(dt, carPosition);
  }

  dispose(): void {
    this.scene.remove(
      this.sun,
      this.sun.target,
      this.hemisphere,
      this.sky,
      this.stars,
      this.rain,
      this.carFill,
    );
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.stars.geometry.dispose();
    this.stars.material.dispose();
    this.rain.geometry.dispose();
    this.rain.material.dispose();
    for (const spot of this.headlights) {
      this.scene.remove(spot, spot.target);
      spot.dispose();
    }
  }

  private apply(carPosition: THREE.Vector3): void {
    const palette = skyPalette(this.hours);
    const rainFog = weatherFog('rain', this.rainAmount);
    const fogFog = weatherFog('fog', this.fogAmount);
    const fogNear = Math.max(1, palette.fogNear * rainFog.near * fogFog.near);
    const fogFar = Math.max(fogNear + 8, palette.fogFar * rainFog.far * fogFog.far);
    const fog = this.scene.fog;
    if (fog instanceof THREE.Fog) {
      fog.color.setHex(palette.fog);
      fog.near = fogNear;
      fog.far = fogFar;
    }
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.setHex(palette.fog);
    }
    this.fogColor.setHex(palette.fog);

    this.sky.position.copy(carPosition);
    this.stars.position.copy(carPosition);
    this.stars.material.opacity = palette.stars * (1 - this.rainAmount) * (1 - this.fogAmount);

    const dir = lightDirection(this.hours);
    this.sun.position.set(
      carPosition.x + dir.x * 130,
      carPosition.y + dir.y * 130,
      carPosition.z + dir.z * 130,
    );
    this.sun.target.position.copy(carPosition);
    this.sun.target.updateMatrixWorld();
    const weatherDim = 1 - this.rainAmount * 0.28 - this.fogAmount * 0.35;
    this.sun.color.setHex(palette.sunColor);
    this.sun.intensity = palette.sunIntensity * weatherDim;
    this.hemisphere.color.setHex(palette.hemiSky);
    this.hemisphere.groundColor.setHex(palette.hemiGround);
    this.hemisphere.intensity = palette.hemiIntensity * (1 - this.rainAmount * 0.18 - this.fogAmount * 0.2);

    const fogMix = 1 - (1 - this.rainAmount * 0.45) * (1 - this.fogAmount * 0.9);
    this.sky.material.uniforms.topColor!.value.setHex(palette.skyTop).lerp(this.fogColor, fogMix);
    this.sky.material.uniforms.bottomColor!.value
      .setHex(palette.skyBottom)
      .lerp(this.fogColor, fogMix);
    this.sky.material.uniforms.sunColor!.value.setHex(palette.sunColor);
    this.sky.material.uniforms.sunDirection!.value.set(dir.x, dir.y, dir.z);

    this.currentExposure = palette.exposure * (1 + this.rainAmount * 0.04);
    this.setHeadlights(headlightsWanted(this.hours, this.rainAmount, this.fogAmount), palette);
  }

  private setHeadlights(on: boolean, palette: SkyPalette): void {
    this.lightsOn = on;
    const nightBoost = 1 + (1 - palette.night) * 0.15;
    for (const spot of this.headlights) {
      spot.intensity = on ? 240 * nightBoost : 0;
    }
    this.carFill.intensity = 1.4 * palette.night + this.rainAmount * 0.5;
    for (const material of this.headlightMaterials) {
      material.emissiveIntensity = on ? 2.4 : 0.18;
    }
    for (const material of this.tailMaterials) {
      material.emissiveIntensity = on ? 2.2 : 0.12;
    }
  }

  private updateRain(dt: number, carPosition: THREE.Vector3): void {
    const active = this.rainAmount > 0.02;
    this.rain.visible = active;
    if (!active) return;
    this.rain.material.opacity = 0.1 + this.rainAmount * 0.25;
    const positions = this.rainPositions;
    for (let index = 0; index < RAIN_DROPS; index += 1) {
      const p = index * 6;
      let x = positions[p]!;
      let y = positions[p + 1]!;
      let z = positions[p + 2]!;
      const v = index * 3;
      x += this.rainVelocities[v]! * dt;
      y += this.rainVelocities[v + 1]! * dt;
      z += this.rainVelocities[v + 2]! * dt;

      const dx = x - carPosition.x;
      const dz = z - carPosition.z;
      if (y < -1.5 || Math.hypot(dx, dz) > RAIN_RADIUS + 6) {
        x = carPosition.x + (Math.random() - 0.5) * RAIN_RADIUS * 2;
        z = carPosition.z + (Math.random() - 0.5) * RAIN_RADIUS * 2;
        y = carPosition.y + RAIN_HEIGHT * (0.55 + Math.random() * 0.45);
        this.rainVelocities[v] = -1.5 + Math.random() * 1.2;
        this.rainVelocities[v + 1] = -13 - Math.random() * 8;
        this.rainVelocities[v + 2] = -0.8 + Math.random() * 1.6;
      }

      positions[p] = x;
      positions[p + 1] = y;
      positions[p + 2] = z;
      positions[p + 3] = x + this.rainVelocities[v]! * 0.03;
      positions[p + 4] = y - 0.45;
      positions[p + 5] = z + this.rainVelocities[v + 2]! * 0.03;
    }
    this.rain.geometry.attributes.position!.needsUpdate = true;
  }

  private buildSky(): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x5a98d2) },
        bottomColor: { value: new THREE.Color(0xb9d5e7) },
        sunColor: { value: new THREE.Color(0xffffff) },
        sunDirection: { value: new THREE.Vector3(0, 1, 0) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPosition;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorldPosition = world.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform vec3 sunColor;
        uniform vec3 sunDirection;
        varying vec3 vWorldPosition;
        void main() {
          vec3 dir = normalize(vWorldPosition - cameraPosition);
          float horizon = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 color = mix(bottomColor, topColor, pow(horizon, 0.85));
          float sunDot = max(dot(dir, normalize(sunDirection)), 0.0);
          color += sunColor * pow(sunDot, 240.0) * 1.8;
          color += sunColor * pow(sunDot, 14.0) * 0.14;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), material);
    mesh.frustumCulled = false;
    return mesh;
  }

  private buildStars(): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
    const positions = new Float32Array(STAR_COUNT * 3);
    for (let index = 0; index < STAR_COUNT; index += 1) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(0.05 + Math.random() * 0.95);
      const radius = 820;
      positions[index * 3] = Math.sin(phi) * Math.cos(theta) * radius;
      positions[index * 3 + 1] = Math.cos(phi) * radius;
      positions[index * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xdfe9ff,
      size: 1.7,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    });
    return new THREE.Points(geometry, material);
  }

  private buildRain(): THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> {
    const positions = this.rainPositions;
    for (let index = 0; index < RAIN_DROPS; index += 1) {
      const p = index * 6;
      const x = (Math.random() - 0.5) * RAIN_RADIUS * 2;
      const y = Math.random() * RAIN_HEIGHT;
      const z = (Math.random() - 0.5) * RAIN_RADIUS * 2;
      positions[p] = x;
      positions[p + 1] = y;
      positions[p + 2] = z;
      positions[p + 3] = x - 0.08;
      positions[p + 4] = y - 0.45;
      positions[p + 5] = z + 0.08;
      this.rainVelocities[index * 3] = -1.5 + Math.random() * 1.2;
      this.rainVelocities[index * 3 + 1] = -13 - Math.random() * 8;
      this.rainVelocities[index * 3 + 2] = -0.8 + Math.random() * 1.6;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color: 0x9fc0d8,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    const lines = new THREE.LineSegments(geometry, material);
    lines.frustumCulled = false;
    return lines;
  }

  private buildHeadlights(): void {
    const lampMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff2c9,
      emissive: 0xffdf9a,
      emissiveIntensity: 0.18,
      roughness: 0.35,
    });
    const tailMaterial = new THREE.MeshStandardMaterial({
      color: 0x6b1414,
      emissive: 0xff2a1a,
      emissiveIntensity: 0.12,
      roughness: 0.5,
    });
    this.headlightMaterials.push(lampMaterial);
    this.tailMaterials.push(tailMaterial);

    for (const x of [-0.62, 0.62]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.06), lampMaterial);
      lamp.position.set(x, 0.06, 2.03);
      this.car.bodyShell.add(lamp);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.05), tailMaterial);
      tail.position.set(x, 0.04, -2.03);
      this.car.bodyShell.add(tail);

      const spot = new THREE.SpotLight(0xffe8c0, 0, 85, 0.48, 0.6, 1.1);
      spot.position.set(x, 0.26, 2.05);
      spot.target.position.set(x * 0.9, -1.2, 20);
      spot.castShadow = false;
      this.car.group.add(spot, spot.target);
      this.headlights.push(spot);
    }
  }
}
