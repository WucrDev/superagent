#!/usr/bin/env node
/**
 * W5 #23 / issue #29: one command from source to a 1080p60 MP4.
 *
 *   npm run record
 *
 * Builds are run by the npm script. This file serves dist/ with Vite preview,
 * opens the `?record=1` cinematic in system Chrome, captures the canvas through
 * MediaRecorder, then transcodes the webm to H.264 with ffmpeg.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'docs');
const webmPath = path.join(outDir, 'w5-60s.webm');
const mp4Path = path.join(outDir, 'w5-60s.mp4');
const PORT = 4174;
const WIDTH = 1920;
const HEIGHT = 1080;

function log(message) {
  process.stdout.write(`[record] ${message}\n`);
}

fs.mkdirSync(outDir, { recursive: true });

const server = await preview({
  root,
  logLevel: 'warn',
  preview: { host: '127.0.0.1', port: PORT, strictPort: true },
});

let browser;
try {
  browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [
      '--use-angle=metal',
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  log(`opening ${WIDTH}x${HEIGHT} record scene`);
  await page.goto(`http://127.0.0.1:${PORT}/?record=1&fresh=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__recordReady === true, null, { timeout: 60000 });
  // Let the loading curtain finish its 240 ms transition before frame 0.
  await page.waitForTimeout(700);
  await page.evaluate(() => window.__recordStart());
  log('recording 60 s...');
  await page.waitForFunction(() => window.__recordState() === 'done', null, {
    timeout: 120000,
  });

  const size = await page.evaluate(() => window.__recordSize());
  if (!size || size < 100_000) {
    throw new Error(`media recorder produced only ${size} bytes`);
  }
  const parts = [];
  const chunkSize = 1_000_000;
  for (let offset = 0; offset < size; offset += chunkSize) {
    const length = Math.min(chunkSize, size - offset);
    const base64 = await page.evaluate(
      ([start, count]) => window.__recordChunk(start, count),
      [offset, length],
    );
    parts.push(Buffer.from(base64, 'base64'));
    log(`fetched ${Math.min(offset + length, size)} / ${size} bytes`);
  }
  fs.writeFileSync(webmPath, Buffer.concat(parts));
  log(`webm written: ${webmPath}`);

  if (errors.length > 0) {
    log(`browser errors (first 5): ${errors.slice(0, 5).join(' | ')}`);
  }

  log('transcoding to H.264 1080p60...');
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      webmPath,
      '-vf',
      'fps=60,scale=1920:1080:flags=lanczos',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '24',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      mp4Path,
    ],
    { stdio: 'inherit' },
  );

  const probe = execFileSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height,r_frame_rate,nb_frames',
      '-show_entries',
      'format=duration,size',
      '-of',
      'json',
      mp4Path,
    ],
    { encoding: 'utf8' },
  );
  const meta = JSON.parse(probe);
  const stream = meta.streams?.[0] ?? {};
  log(
    `done: ${mp4Path} · ${stream.width}x${stream.height} · ${stream.r_frame_rate} · ` +
      `${Number(meta.format?.duration ?? 0).toFixed(2)} s · ` +
      `${(Number(meta.format?.size ?? 0) / 1_000_000).toFixed(1)} MB`,
  );

  if (!process.argv.includes('--keep-webm')) fs.rmSync(webmPath, { force: true });
  await context.close();
  // The headless browser can keep a GPU process alive after a WebGL session;
  // do not let that block the one-command contract.
  await Promise.race([browser.close(), new Promise((resolve) => setTimeout(resolve, 8000))]);
  await server.close();
  process.exit(0);
} finally {
  if (browser) {
    await Promise.race([browser.close(), new Promise((resolve) => setTimeout(resolve, 8000))]);
  }
  await server.close();
}
