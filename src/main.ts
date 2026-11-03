import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import './style.css';
import { EngineAudio } from './core/audio';
import { SurfaceEffects } from './core/effects';
import { Haptics } from './core/haptics';
import { InputManager } from './core/input';
import { GameLoop } from './core/loop';
import { createRenderer } from './core/renderer';
import { createTestTrack } from './terrain/testTrack';
import { createWinchCourse } from './terrain/winchCourse';
import { Toolkit } from './tools/toolkit';
import { Winch } from './tools/winch';
import { Hud } from './ui/hud';
import { SettingsPanel } from './ui/settingsPanel';
import { ToolHud } from './ui/toolHud';
import { WinchHud } from './ui/winchHud';
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
      winch: Winch;
      toolkit: Toolkit;
      anchors: ReturnType<typeof createWinchCourse>;
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
    // A canvas tab stop makes the keyboard target explicit inside embedded
    // webviews (Feishu) where the parent window can keep focus otherwise.
    renderer.domElement.tabIndex = 0;
    renderer.domElement.addEventListener('pointerdown', () => {
      renderer.domElement.focus();
    });
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
    // W4 #23: chassis contact forces are the damage source.
    const eventQueue = new RAPIER.EventQueue(true);

    const track = createTestTrack(scene, world);
    const anchors = createWinchCourse(scene, world, track);

    const audio = new EngineAudio();
    const startAudio = (): void => audio.start();
    window.addEventListener('keydown', startAudio, { once: true });
    window.addEventListener('pointerdown', startAudio, { once: true });

    const car = new RaycastVehicle(scene, world, () => audio.shift(), track);
    const effects = new SurfaceEffects(scene);
    const input = new InputManager({ deadzone: 0.15, steerSensitivity: 1 });
    const cameraRig = new CameraRig(camera, car);
    new SettingsPanel(input, cameraRig);
    const hud = new Hud();
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

    const loop = new GameLoop(FIXED_STEP, {
      update: (step) => {
        const raw = input.sample();
        if (reverseHeld) raw.brake = 1;
        const toolInput = input.sampleTools();
        lastThrottle = raw.throttle;
        if (toolInput.hook || toolInput.winchHeld) hideTutorial();
        if (toolInput.hud) winchHud.toggle();
        if (raw.reset) {
          car.reset();
          winch.reset();
          tools.reset();
        }
        if (raw.camera) cameraRig.cycle();

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
      },
      render: (_alpha, frameTime) => {
        car.group.updateMatrixWorld(true);
        const position = car.position;
        sun.position.set(position.x + 40, 60, position.z + 25);
        sun.target.position.set(position.x, 0, position.z);
        sun.target.updateMatrixWorld();

        cameraRig.update(frameTime, input);
        effects.update(frameTime, car);
        winch.sync(frameTime);
        tools.sync();
        const water = track.waterAt(position.x, position.z);
        hud.update(
          car.speedKmh,
          car.displayGear,
          cameraRig.mode,
          input.device,
          water?.depth ?? 0,
        );
        audio.update(car.speedKmh, lastThrottle, car.gear);
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
        renderer.render(scene, camera);
      },
    });

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    window.__superagent = {
      car,
      world,
      input,
      cameraRig,
      winch,
      toolkit: tools,
      anchors,
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
