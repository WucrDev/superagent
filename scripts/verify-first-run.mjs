#!/usr/bin/env node
/**
 * "第一趟" acceptance harness.
 *
 *   npm run build
 *   node scripts/verify-first-run.mjs
 *
 * Serves the production build with Vite preview and drives the mission from a
 * fresh load with real keyboard events. It never calls `car.place`,
 * `__superagent.teleport` or mission debug helpers: the only reset used is the
 * normal in-game `R` (after the W4 jack, to return to the practice anchor).
 *
 * Screenshots are written to docs/images/first-run-*.png. The process exits
 * non-zero if any objective, the save, or the completion screen fails.
 */
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const PORT = 4177;
const server = await preview({
  logLevel: 'warn',
  preview: { host: '127.0.0.1', port: PORT, strictPort: true },
});

const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('pageerror', e.message); });
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  // Ignore the browser's automatic favicon probe; the page itself has no
  // runtime errors. Everything else is a real failure signal.
  if (m.text().includes('404')) return;
  errors.push(m.text());
  console.log('console error', m.text());
});
page.on('download', (d) => d.cancel().catch(() => {}));

try {
  await page.goto(`http://127.0.0.1:${PORT}/?fresh=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__superagent != null, null, { timeout: 60000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'docs/images/first-run-intro.png' });
  await page.click('#missionStart');
  await page.waitForTimeout(400);
const held = new Set();
async function setKey(key, on) {
  if (on && !held.has(key)) { held.add(key); await page.keyboard.down(key); }
  if (!on && held.has(key)) { held.delete(key); await page.keyboard.up(key); }
}
async function releaseAll() { for (const k of [...held]) await setKey(k, false); }
async function state() {
  return page.evaluate(() => {
    const a = window.__superagent;
    const f = a.car.forward;
    return {
      x: a.car.position.x, z: a.car.position.z,
      yaw: Math.atan2(f.x, f.z), speed: a.car.speedKmh,
      idx: a.mission.snapshot.objectiveIndex, status: a.mission.snapshot.status,
      planks: a.toolkit.inventory.count('plank'), health: a.car.healthValue,
      upY: a.car.up.y, rolled: a.car.isRolledOver,
      winch: a.winch.snapshot.attached?.id ?? null,
      reeling: a.winch.snapshot.reeling,
      photo: a.photo.isActive,
    };
  });
}
const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const deg = (r) => (r * 180) / Math.PI;
let step = 0;
function log(label, s) {
  console.log(`[${String(++step).padStart(2, '0')}] ${label} · x=${s.x.toFixed(1)} z=${s.z.toFixed(1)} v=${s.speed.toFixed(1)} yaw=${deg(s.yaw).toFixed(0)} health=${s.health.toFixed(0)} mission=${s.idx}/${s.status}`);
}

async function driveTo(tx, tz, { stop = true, arrive = 1.2, maxSpeed = 14, timeout = 50000, label = '' } = {}) {
  const t0 = Date.now();
  let lastLog = 0;
  while (Date.now() - t0 < timeout) {
    const s = await state();
    const dx = tx - s.x, dz = tz - s.z;
    const dist = Math.hypot(dx, dz);
    const err = norm(Math.atan2(dx, dz) - s.yaw);
    if (!stop && dist <= arrive) { await releaseAll(); return { ok: true, s }; }
    if (stop && dist <= arrive && s.speed <= 1.8) {
      await releaseAll();
      console.log(`[${label}] STOP x=${s.x.toFixed(1)} z=${s.z.toFixed(1)} v=${s.speed.toFixed(1)} yaw=${deg(s.yaw).toFixed(0)}`);
      return { ok: true, s };
    }
    if (Date.now() - lastLog > 2000) {
      lastLog = Date.now();
      console.log(`[${label}] x=${s.x.toFixed(1)} z=${s.z.toFixed(1)} v=${s.speed.toFixed(1)} d=${dist.toFixed(1)} err=${deg(err).toFixed(0)}`);
    }
    await setKey('a', err > 0.04);
    await setKey('d', err < -0.04);
    let targetSpeed;
    if (!stop) targetSpeed = maxSpeed;
    else if (dist < 2.2) targetSpeed = 1.2;
    else if (dist < 6) targetSpeed = 3.2;
    else if (dist < 12) targetSpeed = 7;
    else targetSpeed = maxSpeed;
    const closeForStop = stop && dist <= arrive + 0.6 && s.speed > 1.8;
    if (closeForStop) {
      await setKey('w', false);
      await setKey('s', true);
      if (s.speed <= 0.5) {
        await releaseAll();
        console.log(`[${label}] STOP x=${s.x.toFixed(1)} z=${s.z.toFixed(1)} v=${s.speed.toFixed(1)} yaw=${deg(s.yaw).toFixed(0)}`);
        return { ok: true, s };
      }
    } else if (s.speed > targetSpeed + 1.2) {
      await setKey('w', false);
      await setKey('s', true);
    } else if (s.speed > targetSpeed + 0.4) {
      await setKey('w', false);
      await setKey('s', false);
    } else {
      await setKey('s', false);
      await setKey('w', s.speed < targetSpeed);
    }
    await page.waitForTimeout(60);
  }
  await releaseAll();
  const s = await state();
  console.log(`[${label}] TIMEOUT x=${s.x.toFixed(1)} z=${s.z.toFixed(1)} v=${s.speed.toFixed(1)}`);
  return { ok: false, s };
}

// 1. Ditch stop box -> plank -> cross.
await driveTo(20, 24.5, { stop: false, arrive: 2.5, maxSpeed: 14, label: 'pad approach' });
await driveTo(28.6, 24.1, { stop: true, arrive: 0.9, maxSpeed: 10, label: 'ditch stop box' });
await page.keyboard.press('2');
await page.waitForTimeout(250);
await page.keyboard.press('g');
await page.waitForTimeout(800);
console.log('plank placed', await state());
await page.screenshot({ path: 'docs/images/first-run-plank.png' });
await driveTo(36.2, 24.3, { stop: true, arrive: 1.0, maxSpeed: 10, label: 'cross ditch' });
console.log('crossed', await state());
if ((await state()).idx < 1) throw new Error('ditch objective did not complete');
const saveAfterDitch = await page.evaluate(() => window.__superagent.storedSave()?.mission);
console.log('save after ditch', saveAfterDitch);
if (saveAfterDitch?.status !== 'active' || saveAfterDitch.objectiveIndex !== 1) {
  throw new Error('checkpoint did not persist the ditch objective');
}

// 2. Rollover ramp -> jack.
await driveTo(45.5, 24.5, { stop: false, arrive: 2.0, maxSpeed: 15, label: 'ramp entry' });
await setKey('w', true);
for (let i = 0; i < 100; i += 1) {
  await page.waitForTimeout(60);
  const s = await state();
  if (s.rolled) { console.log('rolled', s.x.toFixed(1), s.z.toFixed(1)); break; }
  if (s.x > 55) break;
}
await setKey('w', false);
await releaseAll();
await page.waitForTimeout(900);
await page.screenshot({ path: 'docs/images/first-run-rollover.png' });
await page.keyboard.down('j');
await page.waitForTimeout(3400);
await page.keyboard.up('j');
await page.waitForTimeout(700);
console.log('after jack', await state());
if ((await state()).idx < 2) throw new Error('recovery objective did not complete');
await page.screenshot({ path: 'docs/images/first-run-recovered.png' });

// 3. Return to the spawn practice anchor and winch out (normal R reset; the
//    W3 wet-mud trial is the optional harder recovery and is also accepted).
await page.keyboard.down('r');
await page.waitForTimeout(200);
await page.keyboard.up('r');
await page.waitForTimeout(1100);
console.log('after reset', await state());
if ((await state()).idx < 2) throw new Error('mission progress lost on reset');
await page.keyboard.press('1');
await page.waitForTimeout(300);
console.log('winch selection', await page.evaluate(() => {
  const s = window.__superagent.winch.snapshot;
  return { selected: s.selected?.anchor.id ?? null, hint: s.hint };
}));
await page.keyboard.press('g');
await page.waitForTimeout(900);
console.log('after hook', await state());
await page.keyboard.down('f');
let winched = false;
for (let i = 0; i < 80; i += 1) {
  await page.waitForTimeout(80);
  const s = await state();
  if (i % 10 === 0) console.log('reel', i, s.x.toFixed(1), s.z.toFixed(1), 'idx', s.idx, 'attached', s.winch, 'reeling', s.reeling);
  if (s.idx >= 3) { winched = true; console.log('WINCH DONE', s.x.toFixed(1), s.z.toFixed(1)); break; }
}
await page.keyboard.up('f');
await page.keyboard.press('g');
await page.waitForTimeout(300);
await setKey('s', true);
await page.waitForTimeout(900);
await setKey('s', false);
await page.waitForTimeout(500);
console.log('after winch', await state());
if (!winched) throw new Error('winch objective did not complete');
await page.screenshot({ path: 'docs/images/first-run-winched.png' });

// 4. Ridge lookout -> photo.
// 4. Ridge lookout -> photo.
await driveTo(5, 40, { stop: false, arrive: 3.0, maxSpeed: 14, label: 'up the hill' });
await driveTo(7, 61, { stop: true, arrive: 1.5, maxSpeed: 10, label: 'ridge' });
console.log('at ridge', await state());
if ((await state()).idx !== 3) throw new Error('photo objective is not current at ridge');
await page.screenshot({ path: 'docs/images/first-run-ridge.png' });
await page.keyboard.press('p');
await page.waitForTimeout(900);
console.log('photo active', await page.evaluate(() => window.__superagent.photo.isActive));
await page.keyboard.press(' ');
await page.waitForTimeout(1200);
console.log('after shutter', await state());
await page.screenshot({ path: 'docs/images/first-run-photo.png' });
await page.keyboard.press('p');
await page.waitForTimeout(700);
if ((await state()).idx < 4) throw new Error('photo objective did not complete');

// 5. Return to the cabin via the south descent and west side of the hill.
await driveTo(7, 95, { stop: false, arrive: 3.0, maxSpeed: 14, label: 'south descent' });
await driveTo(-15, 95, { stop: false, arrive: 3.0, maxSpeed: 16, label: 'west of hill' });
await driveTo(-15, 15, { stop: false, arrive: 3.0, maxSpeed: 18, label: 'south along hill' });
await driveTo(-9, 8, { stop: true, arrive: 1.5, maxSpeed: 12, label: 'cabin' });
await page.waitForTimeout(1400);
const final = await state();

  await page.screenshot({ path: 'docs/images/first-run-complete.png' });
  console.log(JSON.stringify({
    mission: final,
    save: await page.evaluate(() => window.__superagent.storedSave()?.mission),
    completeVisible: await page.locator('#missionComplete').isVisible(),
    completeTime: await page.locator('#missionCompleteTime').textContent(),
    photoVisible: await page.locator('#missionPhoto').isVisible(),
    consoleErrors: errors,
  }, null, 2));

  if (final.status !== 'complete') throw new Error('mission did not complete');
  if (!(await page.locator('#missionComplete').isVisible())) throw new Error('completion card not visible');
  if (!(await page.locator('#missionPhoto').isVisible())) throw new Error('completion photo missing');
  if (errors.length > 0) throw new Error(`console errors: ${errors.join(' | ')}`);
  console.log('FIRST RUN ACCEPTANCE PASS');
} finally {
  await browser.close();
  await server.httpServer.close();
}
