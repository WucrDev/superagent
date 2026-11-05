#!/usr/bin/env node
/**
 * W5.1 / #21: reproduce the three colour-lock reference scenes at 1920×1080.
 *
 *   npm run build && node scripts/capture-grade-lock.mjs
 *   node scripts/capture-grade-lock.mjs --url https://game.xiaoannurse.art/?fresh=1 --prefix before
 *
 * The captures use the game's debug API (the same one the acceptance evidence
 * uses) and the live locked grade. They are HUD-free canvas captures, so the
 * comparison with `docs/target-shots/` is not polluted by DOM UI.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'docs', 'images');
fs.mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
function arg(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}
const prefix = arg('prefix', '');
const urlArg = arg('url', '');
const PORT = 4175;
const WIDTH = 1920;
const HEIGHT = 1080;

/** The three conditions in `docs/target-shots/`. */
const SCENES = [
  {
    id: 'dusk',
    label: '黄昏山脊',
    time: 17.6,
    weather: 'clear',
    x: 7,
    z: 61,
    yaw: -0.55,
    camera: 'free',
    fov: 55,
    orbitYaw: Math.PI * 0.85,
    orbitPitch: 0.15,
    freeDistance: 7,
    stops: 0,
  },
  {
    id: 'night',
    label: '夜雨车灯',
    time: 21,
    weather: 'rain',
    x: -13,
    z: 100,
    yaw: 0,
    camera: 'free',
    fov: 60,
    orbitYaw: 0.5,
    orbitPitch: 0.25,
    freeDistance: 8,
    stops: 0,
  },
  {
    id: 'cockpit',
    label: '座舱',
    time: 17.4,
    weather: 'clear',
    x: 0,
    z: 0,
    yaw: 0,
    camera: 'cockpit',
    fov: 70,
    lookPitch: -0.04,
    stops: 0,
  },
];

const server = urlArg
  ? null
  : await preview({
      root,
      logLevel: 'warn',
      preview: { host: '127.0.0.1', port: PORT, strictPort: true },
    });
const url = urlArg || `http://127.0.0.1:${PORT}/?fresh=1`;

let browser;
try {
  browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => Boolean(window.__superagent), null, { timeout: 60000 });
  await page.evaluate(() => {
    document.querySelector('#tutorial')?.classList.add('hidden');
    document.body.classList.add('photo-mode');
    window.__superagent.loop.stop();
  });
  await page.waitForTimeout(300);

  const results = [];
  for (const scene of SCENES) {
    const result = await page.evaluate(async (scene) => {
      const a = window.__superagent;
      a.car.setCockpit(scene.camera === 'cockpit');
      a.cameraRig.mode = scene.camera;
      a.cameraRig.setPhotoMode(true);
      a.cameraRig.setPhotoFov(scene.fov);
      if (scene.camera === 'free') {
        a.cameraRig.orbitYaw = scene.orbitYaw;
        a.cameraRig.orbitPitch = scene.orbitPitch;
        a.cameraRig.freeDistance = scene.freeDistance;
      }
      if (scene.camera === 'cockpit') {
        a.cameraRig.lookYaw = 0;
        a.cameraRig.lookPitch = scene.lookPitch;
      }
      a.postFx.setPhotoMode(true);
      a.postFx.setPhotoStops(scene.stops);
      a.postFx.setFilter(0);
      a.setTime(scene.time);
      a.setWeather(scene.weather);
      a.teleport(scene.x, scene.z, scene.yaw);
      for (let i = 0; i < 150; i += 1) {
        a.environment.update(1 / 60, a.car.position);
        a.car.sync(1 / 60);
        a.cameraRig.update(1 / 60, a.input);
      }
      const focus = a.car.position.clone().setY(a.car.position.y + 1);
      a.postFx.setBaseExposure(a.environment.exposure);
      a.postFx.updateFocus(a.camera.position, focus);
      a.postFx.render();
      const dataUrl = a.postFx.capture();

      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 135;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const sum = [0, 0, 0];
      const luma = [];
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        sum[0] += r;
        sum[1] += g;
        sum[2] += b;
        luma.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
      }
      const count = pixels.length / 4;
      luma.sort((x, y) => x - y);
      return {
        dataUrl,
        stats: {
          mean: sum.map((value) => Math.round((value / count) * 10) / 10),
          lumaP5: Math.round(luma[Math.floor(count * 0.05)]),
          lumaP50: Math.round(luma[Math.floor(count * 0.5)]),
          lumaP95: Math.round(luma[Math.floor(count * 0.95)]),
        },
      };
    }, scene);

    const file = path.join(outDir, `w5-lock-${prefix}${scene.id}.png`);
    fs.writeFileSync(file, Buffer.from(result.dataUrl.split(',')[1], 'base64'));
    results.push({ scene: scene.id, label: scene.label, file: path.relative(root, file), ...scene, ...result.stats });
    process.stdout.write(`[grade-lock] ${scene.id}: ${path.relative(root, file)}\n`);
  }

  const statsFile = path.join(root, 'docs', `w5-color-lock${prefix ? `-${prefix.replace(/-$/, '')}` : ''}.json`);
  fs.writeFileSync(statsFile, `${JSON.stringify({ url, capturedAt: new Date().toISOString(), results }, null, 2)}\n`);
  process.stdout.write(`[grade-lock] stats: ${path.relative(root, statsFile)}\n`);
  if (errors.length > 0) {
    process.stdout.write(`[grade-lock] browser errors: ${errors.slice(0, 5).join(' | ')}\n`);
  }
} finally {
  await browser?.close();
  await server?.close();
}
