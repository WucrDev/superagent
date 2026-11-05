import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import './style.css';
import { EngineAudio } from './core/audio';
import { SurfaceEffects } from './core/effects';
import { Haptics } from './core/haptics';
import { InputManager } from './core/input';
import { RecordDemo } from './core/demoRecord';
import { GameLoop } from './core/loop';
import { PostFx } from './core/postfx';
import { createRenderer } from './core/renderer';
import {
  clearSave as clearStoredSave,
  createSaveData,
  loadSave,
  writeSave,
  type SavedInventory,
  type SaveData,
} from './core/saveGame';
import { WEATHER_LABELS, type WeatherKind } from './core/weather';
import { Landmarks } from './terrain/landmarks';
import { createTestTrack } from './terrain/testTrack';
import { createWinchCourse } from './terrain/winchCourse';
import { TOOL_ORDER } from './tools/inventory';
import { Toolkit } from './tools/toolkit';
import { Winch } from './tools/winch';
import { Hud } from './ui/hud';
import { PhotoMode } from './ui/photoMode';
import { SettingsPanel } from './ui/settingsPanel';
import { ToolHud } from './ui/toolHud';
import { WinchHud } from './ui/winchHud';
import { WorldHud } from './ui/worldHud';
import { CameraRig } from './vehicle/cameraRig';
import { RaycastVehicle } from './vehicle/raycastVehicle';
import { Environment } from './world/environment';

const FIXED_STEP = 1 / 60;
const SAVE_QUERY = 'fresh';

declare global {
  interface Window {
    __superagent?: {
      car: RaycastVehicle;
      world: RAPIER.World;
      input: InputManager;
      cameraRig: CameraRig;
      winch: Winch;
      toolkit: Toolkit;
      anchors: ReturnType<typeof createWinchCourse>;
      environment: Environment;
      landmarks: Landmarks;
      postFx: PostFx;
      photo: PhotoMode;
      worldHud: WorldHud;
      loop: GameLoop;
      camera: THREE.PerspectiveCamera;
      teleport: (x: number, z: number, yaw?: number) => void;
      setTime: (hours: number) => void;
      setWeather: (kind: WeatherKind) => void;
      capturePhoto: () => string;
      saveNow: () => SaveData | null;
      storedSave: () => SaveData | null;
      clearCheckpoint: () => void;
    };
    __recordReady?: boolean;
    __recordStart?: () => void;
    __recordState?: () => string;
    __recordSize?: () => number;
    __recordChunk?: (offset: number, length: number) => Promise<string>;
  }
}

async function boot(): Promise<void> {
  const app = document.querySelector<HTMLDivElement>('#app');
  const loading = document.querySelector<HTMLDivElement>('#loading');
  const error = document.querySelector<HTMLDivElement>('#error');
  if (!app || !loading || !error) throw new Error('页面结构缺少挂载点');

  try {
    await RAPIER.init();

    const params = new URLSearchParams(window.location.search);
    const recordMode = params.get('record') === '1';
    if (recordMode) clearStoredSave(localStorage);
    if (params.get(SAVE_QUERY) === '1') {
      clearStoredSave(localStorage);
      params.delete(SAVE_QUERY);
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
      window.history.replaceState(null, '', next);
    }

    const renderer = createRenderer(app);
    // A canvas tab stop makes the keyboard target explicit inside embedded
    // webviews (Feishu) where the parent window can keep focus otherwise.
    renderer.domElement.tabIndex = 0;
    renderer.domElement.addEventListener('pointerdown', () => {
      renderer.domElement.focus();
    });
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      65,
      window.innerWidth / window.innerHeight,
      0.1,
      1200,
    );

    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = FIXED_STEP;
    // W4 #23: chassis contact forces are the damage source.
    const eventQueue = new RAPIER.EventQueue(true);

    const track = createTestTrack(scene, world);
    const landmarks = new Landmarks(scene, world, track);
    const anchors = createWinchCourse(scene, world, track);

    const audio = new EngineAudio();
    const startAudio = (): void => audio.start();
    window.addEventListener('keydown', startAudio, { once: true });
    window.addEventListener('pointerdown', startAudio, { once: true });

    const car = new RaycastVehicle(scene, world, () => audio.shift(), track);
    const environment = new Environment(scene, car);
    const effects = new SurfaceEffects(scene);
    const input = new InputManager({ deadzone: 0.15, steerSensitivity: 1 });
    const cameraRig = new CameraRig(camera, car);
    const hud = new Hud();
    const worldHud = new WorldHud();
    const winchHud = new WinchHud();
    const haptics = new Haptics();
    const winch = new Winch(scene, world, car, anchors, {
      audio,
      effects,
      haptics,
      hud: winchHud,
    });
    let toolkit: Toolkit | null = null;
    const toolHud = new ToolHud((index) => toolkit?.inventory.select(index));
    toolkit = new Toolkit(scene, world, car, track, {
      audio,
      effects,
      haptics,
      hud: toolHud,
    });
    const tools = toolkit;
    new SettingsPanel(input, cameraRig, environment);
    const postFx = new PostFx(renderer, scene, camera);
    const photo = new PhotoMode({
      rig: cameraRig,
      postFx,
      onShutter: () => audio.cameraShutter(),
      onNotice: (text, tone) => worldHud.notice(text, tone ?? 'info'),
    });
    const demo = recordMode ? new RecordDemo(renderer.domElement, car, environment) : null;
    if (demo) {
      document.body.classList.add('record-mode');
      document.querySelector('#hud')?.setAttribute('hidden', '');
      window.__recordReady = true;
      window.__recordStart = () => demo.start();
      window.__recordState = () => demo.state;
      window.__recordSize = () => demo.blobSize;
      window.__recordChunk = (offset, length) => demo.chunk(offset, length);
    }

    const saveCheckpoint = (source: 'checkpoint' | 'discovery'): SaveData | null => {
      const checkpoint = landmarks.checkpoint;
      const inventory: SavedInventory = {
        winch: tools.inventory.count('winch'),
        plank: tools.inventory.count('plank'),
        jack: tools.inventory.count('jack'),
        repair: tools.inventory.count('repair'),
      };
      const data = createSaveData({
        checkpointId: checkpoint.id,
        checkpointLabel: checkpoint.label,
        x: checkpoint.x,
        z: checkpoint.z,
        yaw: checkpoint.yaw,
        health: car.healthValue,
        inventory,
        discovered: landmarks.discoveredIds,
        hours: environment.currentHours,
        weather: environment.weather,
      });
      if (!writeSave(localStorage, data)) {
        worldHud.notice('检查点保存失败：浏览器存储不可用', 'warn', 5);
        return null;
      }
      if (source === 'checkpoint') {
        worldHud.notice(
          `检查点已保存 · 木屋 · 车况 ${Math.round(data.health)} · 木板 ${data.inventory.plank} · 维修包 ${data.inventory.repair} · 发现 ${landmarks.discoveredCount}/${landmarks.totalPois}`,
          'ok',
          4.5,
        );
      }
      return data;
    };

    const applySave = (data: SaveData): void => {
      car.place(data.x, data.z, data.yaw);
      car.restoreHealth(data.health);
      for (const kind of TOOL_ORDER) {
        tools.inventory.setCount(kind, data.inventory[kind]);
      }
      landmarks.restore(data.discovered);
      environment.setHours(data.hours);
      environment.setWeatherInstant(data.weather);
      landmarks.update(data.x, data.z);
      worldHud.notice(
        `已从${data.checkpointLabel}继续 · 车况 ${Math.round(data.health)} · 木板 ${data.inventory.plank} · 维修包 ${data.inventory.repair} · 发现 ${landmarks.discoveredCount}/${landmarks.totalPois}`,
        'ok',
        6,
      );
    };

    const saved = loadSave(localStorage);
    if (saved) applySave(saved);

    const IDLE_DRIVE = {
      throttle: 0,
      brake: 0,
      steer: 0,
      handbrake: false,
      reset: false,
      shiftUp: false,
      shiftDown: false,
      camera: false,
    } as const;
    let lastThrottle = 0;

    const tutorial = document.querySelector<HTMLElement>('#tutorial');
    let tutorialHidden = false;
    const hideTutorial = (): void => {
      if (tutorialHidden) return;
      tutorialHidden = true;
      tutorial?.classList.add('hidden');
    };
    window.setTimeout(hideTutorial, 12000);

    const focusHint = document.querySelector<HTMLElement>('#focusHint');
    const setFocusHint = (visible: boolean): void => {
      if (focusHint) focusHint.hidden = !visible;
    };
    // The card is visible at boot; the first click/key hides it. A blur (e.g.
    // switching to Feishu) brings it back with the keyboard-paused explanation.
    let pageFocused = document.hasFocus();
    let lastKeyLabel = '';
    let lastKeyAt = 0;
    window.addEventListener('blur', () => {
      pageFocused = false;
      setFocusHint(true);
    });
    window.addEventListener('focus', () => {
      pageFocused = true;
      setFocusHint(false);
    });
    window.addEventListener('pointerdown', () => {
      pageFocused = true;
      setFocusHint(false);
    });
    window.addEventListener('keydown', (event) => {
      pageFocused = true;
      lastKeyLabel = event.code || event.key || '?';
      lastKeyAt = performance.now();
      setFocusHint(false);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') setFocusHint(false);
    });
    const inputDiag = document.querySelector<HTMLElement>('#inputDiag');

    // On-screen reverse: a held pointer is a held brake, so the normal
    // standstill->R logic applies even when the browser/IME eats keydown.
    const reverseButton = document.querySelector<HTMLButtonElement>('#reverseButton');
    let reverseHeld = false;
    const setReverseHeld = (held: boolean): void => {
      reverseHeld = held;
      reverseButton?.classList.toggle('active', held);
    };
    reverseButton?.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      reverseButton.setPointerCapture?.(event.pointerId);
      setReverseHeld(true);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      reverseButton?.addEventListener(type, () => setReverseHeld(false));
    }
    window.addEventListener('pointerup', () => setReverseHeld(false));

    const buildTag = document.querySelector<HTMLElement>('#buildTag');
    const buildTagTop = document.querySelector<HTMLElement>('#buildTagTop');
    const scriptSrc = document.querySelector<HTMLScriptElement>('script[type="module"]')?.src ?? '';
    const buildMatch = scriptSrc.match(/index-([^/]+)\.js/);
    const buildLabel = buildMatch ? `build ${buildMatch[1]}` : 'build dev';
    if (buildTag) buildTag.textContent = buildLabel;
    if (buildTagTop) buildTagTop.textContent = buildLabel;

    const focusTarget = new THREE.Vector3();

    const loop = new GameLoop(FIXED_STEP, {
      update: (step) => {
        if (demo) {
          demo.update();
          environment.update(step, car.position);
          car.setWetness(environment.wetness);
          car.update(step, demo.drivingInput());
          world.step(eventQueue);
          car.sync(step);
          demo.tick();
          return;
        }
        const worldInput = input.sampleWorld(photo.isActive);
        if (worldInput.photoToggle) photo.toggle();
        if (worldInput.fastTime) {
          environment.toggleFastTime();
          worldHud.notice(
            environment.fastTime ? '时间加速 ×8（再按 N 恢复）' : '时间恢复正常速度',
            'info',
            2.5,
          );
        }
        if (worldInput.weather) {
          const kind = environment.cycleWeather();
          if (photo.isActive) environment.setWeatherInstant(kind);
          worldHud.notice(`天气：${WEATHER_LABELS[kind]}`, 'info', 2.2);
        }
        worldHud.tick(step);

        if (photo.isActive) {
          photo.handle(worldInput);
          const photoDrive = input.sample();
          if (photoDrive.camera) cameraRig.cycle();
          return;
        }

        const raw = input.sample();
        const toolInput = input.sampleTools();
        if (reverseHeld) raw.brake = 1;
        lastThrottle = raw.throttle;
        if (toolInput.hook || toolInput.winchHeld) hideTutorial();
        if (toolInput.hud) winchHud.toggle();
        if (raw.reset) {
          car.reset();
          winch.reset();
          tools.reset();
        }
        if (raw.camera) cameraRig.cycle();

        // W5 #20: the world clock drives sun/fog/rain and the tire wetness.
        environment.update(step, car.position);
        car.setWetness(environment.wetness);

        // Tool routing: the rope wins G while it is attached, otherwise the
        // selected tool owns the button. J only drives the W4 hydraulic jack.
        const winchOwnsHook =
          toolInput.hook &&
          (winch.attachedAnchor !== null ||
            winch.winchState === 'attaching' ||
            tools.activeKind === 'winch');
        winch.setSuppressed(
          tools.controlsLocked ||
            !(
              tools.activeKind === 'winch' ||
              winch.attachedAnchor !== null ||
              winch.winchState === 'attaching' ||
              winch.winchState === 'broken' ||
              winch.winchState === 'anchorFailed'
            ),
        );

        const drive = tools.controlsLocked ? IDLE_DRIVE : raw;
        car.update(step, drive);
        winch.update(step, {
          ...toolInput,
          hook: winchOwnsHook,
          right: false,
        });
        tools.update(step, {
          ...toolInput,
          hook: toolInput.hook && !winchOwnsHook,
        });
        world.step(eventQueue);
        tools.handleContactEvents(eventQueue);
        car.sync(step);

        const position = car.position;
        const landmarkTick = landmarks.update(position.x, position.z);
        let shouldSave = landmarkTick.enteredCheckpoint;
        for (const poi of landmarkTick.discovered) {
          shouldSave = true;
          worldHud.notice(
            `发现：${poi.label}（${landmarks.discoveredCount}/${landmarks.totalPois}）· 进度已记录`,
            'ok',
            4,
          );
        }
        if (shouldSave) saveCheckpoint(landmarkTick.enteredCheckpoint ? 'checkpoint' : 'discovery');
      },
      render: (_alpha, frameTime) => {
        car.group.updateMatrixWorld(true);
        if (demo) {
          demo.updateCamera(camera);
          postFx.setBaseExposure(environment.exposure);
          focusTarget.set(car.position.x, car.position.y + 1, car.position.z);
          postFx.updateFocus(camera.position, focusTarget);
          postFx.render();
          return;
        }
        cameraRig.update(frameTime, input);
        if (!photo.isActive) {
          effects.update(frameTime, car);
          winch.sync(frameTime);
          tools.sync();
        }
        postFx.setBaseExposure(environment.exposure);
        focusTarget.set(car.position.x, car.position.y + 1, car.position.z);
        postFx.updateFocus(camera.position, focusTarget);
        hud.update(
          car.speedKmh,
          car.displayGear,
          cameraRig.mode,
          input.device,
          track.waterAt(car.position.x, car.position.z)?.depth ?? 0,
        );
        worldHud.update(environment.snapshot, landmarks.discoveredCount, landmarks.totalPois);
        photo.sync();
        audio.update(car.speedKmh, lastThrottle, car.gear);
        audio.setRain(environment.rainIntensity);
        postFx.render();
        if (inputDiag) {
          const now = performance.now();
          let diag = '键盘输入：等待按键（按 S 后这里应显示 KeyS）';
          let tone = '';
          if (reverseHeld) {
            diag = '屏幕倒车按钮：按住中（松开停）';
            tone = 'ok';
          } else if (!pageFocused) {
            diag = '页面失焦 · 点一下游戏画面';
            tone = 'lost';
          } else if (lastKeyAt > 0 && now - lastKeyAt < 3000) {
            diag = `最后按键：${lastKeyLabel} · ${((now - lastKeyAt) / 1000).toFixed(1)} s 前`;
            tone = 'ok';
          }
          inputDiag.textContent = diag;
          inputDiag.classList.toggle('ok', tone === 'ok');
          inputDiag.classList.toggle('lost', tone === 'lost');
        }
      },
    });

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      postFx.setSize(window.innerWidth, window.innerHeight);
    });

    window.__superagent = {
      car,
      world,
      input,
      cameraRig,
      winch,
      toolkit: tools,
      anchors,
      environment,
      landmarks,
      postFx,
      photo,
      worldHud,
      loop,
      camera,
      teleport: (x, z, yaw = 0) => car.place(x, z, yaw),
      setTime: (hours) => environment.setHours(hours),
      setWeather: (kind) => environment.setWeatherInstant(kind),
      capturePhoto: () => photo.shutter(),
      saveNow: () => saveCheckpoint('checkpoint'),
      storedSave: () => loadSave(localStorage),
      clearCheckpoint: () => {
        clearStoredSave(localStorage);
        worldHud.notice('检查点存档已清除；下次刷新从起点开始', 'warn', 5);
      },
    };
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
