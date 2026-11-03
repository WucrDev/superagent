import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import './style.css';
import { EngineAudio } from './core/audio';
import { InputManager } from './core/input';
import { GameLoop } from './core/loop';
import { createRenderer } from './core/renderer';
import { createTestTrack } from './terrain/testTrack';
import { Hud } from './ui/hud';
import { SettingsPanel } from './ui/settingsPanel';
import { CameraRig } from './vehicle/cameraRig';
import { RaycastVehicle } from './vehicle/raycastVehicle';

const FIXED_STEP = 1 / 60;

declare global {
  interface Window {
    __superagent?: {
      car: RaycastVehicle;
      world: RAPIER.World;
      input: InputManager;
      cameraRig: CameraRig;
    };
  }
}

async function boot(): Promise<void> {
  const app = document.querySelector<HTMLDivElement>('#app');
  const loading = document.querySelector<HTMLDivElement>('#loading');
  const error = document.querySelector<HTMLDivElement>('#error');
  if (!app || !loading || !error) throw new Error('页面结构缺少挂载点');

  try {
    await RAPIER.init();

    const renderer = createRenderer(app);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9fc3e8);
    scene.fog = new THREE.Fog(0x9fc3e8, 100, 420);

    const camera = new THREE.PerspectiveCamera(
      65,
      window.innerWidth / window.innerHeight,
      0.1,
      1200,
    );

    const hemisphere = new THREE.HemisphereLight(0xd6e6ff, 0x46513a, 1.55);
    scene.add(hemisphere);

    const sun = new THREE.DirectionalLight(0xfff0d0, 2.8);
    sun.position.set(40, 60, 25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -70;
    sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 70;
    sun.shadow.camera.bottom = -70;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 220;
    sun.shadow.bias = -0.0004;
    scene.add(sun);
    scene.add(sun.target);

    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = FIXED_STEP;

    createTestTrack(scene, world);

    const audio = new EngineAudio();
    const startAudio = (): void => audio.start();
    window.addEventListener('keydown', startAudio, { once: true });
    window.addEventListener('pointerdown', startAudio, { once: true });

    const car = new RaycastVehicle(scene, world, () => audio.shift());
    const input = new InputManager({ deadzone: 0.15, steerSensitivity: 1 });
    const cameraRig = new CameraRig(camera, car);
    new SettingsPanel(input, cameraRig);
    const hud = new Hud();

    let lastThrottle = 0;

    const loop = new GameLoop(FIXED_STEP, {
      update: (step) => {
        const sample = input.sample();
        lastThrottle = sample.throttle;
        if (sample.reset) car.reset();
        if (sample.camera) cameraRig.cycle();
        car.update(step, sample);
        world.step();
        car.sync(step);
      },
      render: (_alpha, frameTime) => {
        car.group.updateMatrixWorld(true);
        const position = car.position;
        sun.position.set(position.x + 40, 60, position.z + 25);
        sun.target.position.set(position.x, 0, position.z);
        sun.target.updateMatrixWorld();

        cameraRig.update(frameTime, input);
        hud.update(car.speedKmh, car.gear, cameraRig.mode, input.device);
        audio.update(car.speedKmh, lastThrottle, car.gear);
        renderer.render(scene, camera);
      },
    });

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    window.__superagent = { car, world, input, cameraRig };
    loop.start();
    loading.classList.add('hidden');
  } catch (cause) {
    console.error(cause);
    loading.classList.add('hidden');
    error.hidden = false;
    error.textContent = `启动失败：${cause instanceof Error ? cause.message : String(cause)}`;
  }
}

void boot();
