import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { EngineAudio } from '../core/audio';
import type { SurfaceEffects } from '../core/effects';
import type { Haptics } from '../core/haptics';
import type { ToolInput } from '../core/input';
import { clamp } from '../core/math';
import { slopeDegFromNormal, type TerrainField } from '../terrain/surfaces';
import type { RaycastVehicle } from '../vehicle/raycastVehicle';
import type { ToolHud, ToolSnapshot } from '../ui/toolHud';
import {
  Inventory,
  TOOL_META,
  slotForWheelDirection,
  type ToolKind,
} from './inventory';
import {
  JACK,
  VEHICLE_HEALTH,
  damageFromImpact,
  healthWarning,
  jackAvailability,
} from './healthMath';
import { SupplyPickups } from './pickups';
import { PlankBridge } from './plank';

export interface ToolkitDeps {
  audio?: EngineAudio;
  effects?: SurfaceEffects;
  haptics?: Haptics;
  hud?: ToolHud;
}

interface Message {
  text: string;
  tone: 'info' | 'warn' | 'danger';
  time: number;
}

/**
 * W4 #15–#18: the four tools.
 *
 * This owns the inventory, the plank bridge layer, pickup crates, the hydraulic
 * jack animation and the repair animation. `update()` runs inside the fixed
 * step; `sync()` runs at render rate for HUD/audio. Contact-force damage events
 * are fed in from main after `world.step`.
 */
export class Toolkit {
  readonly inventory = new Inventory();
  private readonly planks: PlankBridge;
  private readonly pickups: SupplyPickups;
  private message: Message = { text: '', tone: 'info', time: 0 };
  private repairProgress = 0;
  private repairing = false;
  private repairTick = 0;
  private jackProgress = 0;
  private jacking = false;
  private jackSlope = Number.NaN;
  private wheelOpen = false;
  private wheelIndex = 0;
  private wheelMoved = false;
  private damageCooldown = 0;
  private damageTotal = 0;
  /** Keep the "repair done" toast up while G is still held with an empty stack. */
  private repairDoneCooldown = 0;

  constructor(
    scene: THREE.Scene,
    private readonly world: RAPIER.World,
    private readonly car: RaycastVehicle,
    field: TerrainField,
    private readonly deps: ToolkitDeps = {},
  ) {
    this.planks = new PlankBridge(scene, world, field, {
      onCreak: (load) => this.deps.audio?.plankCreak(load),
    });
    this.pickups = new SupplyPickups(scene);
  }

  get activeKind(): ToolKind {
    return this.inventory.activeKind;
  }

  /** True while the jack holds the car and driving input must be ignored. */
  get controlsLocked(): boolean {
    return this.jacking;
  }

  get jackingActive(): boolean {
    return this.jacking;
  }

  get plankCount(): number {
    return this.inventory.count('plank');
  }

  get health(): number {
    return this.car.healthValue;
  }

  /** Fixed-step tool simulation + input handling. */
  update(dt: number, input: ToolInput): void {
    this.message.time = Math.max(0, this.message.time - dt);
    this.damageCooldown = Math.max(0, this.damageCooldown - dt);
    this.repairDoneCooldown = Math.max(0, this.repairDoneCooldown - dt);

    this.updateWheel(input);
    if (input.slot !== null) this.inventory.select(input.slot);
    if (input.nextTool) {
      this.inventory.cycle();
      this.setMessage(
        `工具：${TOOL_META[this.inventory.activeKind].label}`,
        'info',
        1.2,
      );
    }
    if (input.drop) this.dropActive();

    const picked = this.pickups.update(
      this.car.position.x,
      this.car.position.z,
      this.inventory,
      dt,
    );
    for (const result of picked) {
      this.setMessage(
        `拾取 ${result.label} ×${result.added}（现有 ${result.total}）`,
        'info',
        2.4,
      );
      this.deps.audio?.pickup();
      this.deps.haptics?.pulse(0.4);
    }

    this.updateRepair(dt, input);
    this.updateJack(dt, input);

    if (input.hook && this.activeKind === 'plank' && !this.car.isRolledOver && !this.jacking) {
      this.usePlank();
    }

    this.planks.update(
      dt,
      this.car.position.x,
      this.car.position.z,
      this.car.speedKmh,
    );
  }

  /** Feed the Rapier contact-force queue after `world.step`. */
  handleContactEvents(queue: RAPIER.EventQueue): void {
    const chassis = this.car.chassisColliderHandle;
    let damage = 0;
    queue.drainContactForceEvents((event) => {
      const first = event.collider1();
      const second = event.collider2();
      if (first !== chassis && second !== chassis) return;
      damage += damageFromImpact(event.maxForceMagnitude());
    });
    if (damage <= 0) return;
    if (this.damageCooldown > 0) {
      this.damageTotal = 0;
      return;
    }
    this.damageTotal = Math.min(60, this.damageTotal + damage);
    const applied = Math.min(
      VEHICLE_HEALTH.maxImpactDamagePerEvent,
      this.damageTotal,
    );
    this.damageTotal = 0;
    if (applied <= 0) return;
    const lost = this.car.applyDamage(applied);
    if (lost <= 0) return;
    this.damageCooldown = VEHICLE_HEALTH.impactCooldown;
    this.setMessage(`撞击 · 车况 -${Math.round(lost)}（${Math.round(this.car.healthValue)}）`, 'danger', 2.4);
    this.deps.audio?.damage();
    this.deps.haptics?.pulse(clamp(lost / 20, 0.3, 1));
  }

  /** Render-rate HUD update and continuous audio feedback. */
  sync(): void {
    this.deps.audio?.jackPump(this.jacking, this.jackProgress);
    this.deps.hud?.update(this.snapshot);
  }

  get snapshot(): ToolSnapshot {
    const prompt = this.buildPrompt();
    return {
      active: this.activeKind,
      slots: this.inventory.slots,
      health: this.car.healthValue,
      healthWarning: healthWarning(this.car.healthValue),
      prompt: prompt.text,
      promptTone: prompt.tone,
      repairProgress: clamp(this.repairProgress / VEHICLE_HEALTH.repairTime, 0, 1),
      jackProgress: clamp(this.jackProgress, 0, 1),
      wheelOpen: this.wheelOpen,
      wheelIndex: this.wheelIndex,
      wheelNeedsRelease: this.wheelOpen,
    };
  }

  /** Reset per-run transients after the R reset. Inventory and damage persist. */
  reset(): void {
    if (this.jacking) this.car.endJack();
    this.jacking = false;
    this.jackProgress = 0;
    this.jackSlope = Number.NaN;
    this.repairing = false;
    this.repairProgress = 0;
    this.wheelOpen = false;
    this.wheelMoved = false;
    this.damageCooldown = 0;
    this.damageTotal = 0;
    this.repairDoneCooldown = 0;
    this.message = { text: '', tone: 'info', time: 0 };
  }

  /** Debug/test helper: set the car's remaining health. */
  debugSetHealth(health: number): void {
    const target = clamp(health, 0, VEHICLE_HEALTH.max);
    if (target < this.car.healthValue) {
      this.car.applyDamage(this.car.healthValue - target);
    } else if (target > this.car.healthValue) {
      this.car.repairHealth(target - this.car.healthValue);
    }
  }

  /** Debug/test helper: place a plank without going through the key mapping. */
  debugPlacePlank(): boolean {
    return this.usePlank();
  }

  dispose(): void {
    this.planks.dispose();
    this.pickups.dispose();
  }

  private updateWheel(input: ToolInput): void {
    if (input.wheelHeld) {
      if (!this.wheelOpen) {
        this.wheelOpen = true;
        this.wheelMoved = false;
        this.wheelIndex = this.inventory.activeIndex;
      }
      const direction = slotForWheelDirection(input.wheelX, input.wheelY);
      if (direction !== null) {
        this.wheelIndex = direction;
        this.wheelMoved = true;
      }
      return;
    }
    if (!this.wheelOpen) return;
    this.wheelOpen = false;
    if (this.wheelMoved) {
      this.inventory.select(this.wheelIndex);
      this.setMessage(
        `工具：${TOOL_META[this.inventory.activeKind].label}`,
        'info',
        1.1,
      );
    }
  }

  private updateRepair(dt: number, input: ToolInput): void {
    const wantsRepair =
      this.activeKind === 'repair' && input.useHeld && !this.car.isRolledOver;
    if (!wantsRepair) {
      this.repairing = false;
      this.repairProgress = Math.max(0, this.repairProgress - dt * 2);
      return;
    }
    if (!this.inventory.has('repair')) {
      this.repairing = false;
      this.repairProgress = 0;
      // Holding G through the 2 s animation spends the last kit on the same
      // frame the repair completes; without this guard the success toast was
      // overwritten by "no kits left" before the player could read it.
      if (this.repairDoneCooldown <= 0) {
        this.setMessage('没有维修包了 · 沿路找红色补给箱', 'warn', 1.6);
      }
      return;
    }
    if (this.car.healthValue >= VEHICLE_HEALTH.max) {
      this.repairing = false;
      this.repairProgress = 0;
      this.setMessage('车况已满 · 维修包留着', 'info', 1.4);
      return;
    }
    if (this.car.speedKmh > VEHICLE_HEALTH.repairMaxSpeedKmh) {
      this.repairing = false;
      this.repairProgress = 0;
      this.setMessage('停稳再修：车还在动', 'warn', 1.4);
      return;
    }

    this.repairing = true;
    this.repairProgress += dt;
    this.repairTick += dt;
    if (this.repairTick >= 0.4) {
      this.repairTick = 0;
      this.deps.audio?.repairTick();
    }
    if (this.repairProgress >= VEHICLE_HEALTH.repairTime) {
      this.repairProgress = 0;
      this.repairing = false;
      if (!this.inventory.take('repair', 1)) return;
      const restored = this.car.repairHealth(VEHICLE_HEALTH.repairPerKit);
      this.setMessage(
        `修理完成 · 车况 +${Math.round(restored)}（${Math.round(this.car.healthValue)}）`,
        'info',
        2.6,
      );
      this.repairDoneCooldown = 2.6;
      this.deps.audio?.repairDone();
      this.deps.haptics?.pulse(0.5);
    }
  }

  private updateJack(dt: number, input: ToolInput): void {
    if (this.jacking) {
      // Keep the jack holding the car at the current lift, even if the player
      // lets go: a hydraulic jack does not drop the vehicle.
      this.car.applyJackProgress(this.jackProgress);
      if (!input.right) return;
      this.jackProgress = Math.min(
        1,
        this.jackProgress + dt / JACK.rightingTime,
      );
      this.car.applyJackProgress(this.jackProgress);
      if (this.jackProgress >= 1) {
        this.car.rightAtCurrent();
        this.car.endJack();
        this.jacking = false;
        this.jackProgress = 0;
        this.setMessage('千斤顶翻正完成，可以继续', 'info', 2.6);
        this.deps.audio?.jackDone();
        this.deps.haptics?.pulse(0.7);
      }
      return;
    }

    if (!this.car.isRolledOver) {
      this.jackProgress = 0;
      return;
    }

    this.jackSlope = this.groundSlope();
    const availability = jackAvailability(this.jackSlope);
    if (!input.right) return;
    if (!availability.ok) {
      this.setMessage(availability.reason, 'danger', 1.8);
      return;
    }
    this.car.beginJack();
    this.jacking = true;
    this.jackProgress = 0;
    this.deps.audio?.jackStart();
  }

  private usePlank(): boolean {
    if (!this.inventory.has('plank')) {
      this.setMessage('没有木板了 · 沿路找木板补给箱', 'warn', 2);
      return false;
    }
    const placement = this.planks.place(
      this.car.position,
      this.car.forward,
      this.car.rigidBody,
    );
    if (placement.ok) {
      this.inventory.take('plank', 1);
      this.setMessage(placement.message, 'info', 3);
      this.deps.audio?.plankPlace();
      this.deps.haptics?.pulse(0.4);
      return true;
    }
    if (placement.reason === 'slip') {
      this.inventory.take('plank', 1);
      this.setMessage(placement.message, 'warn', 3.2);
      this.deps.audio?.plankSlip();
      return false;
    }
    this.setMessage(placement.message, 'warn', 2.6);
    return false;
  }

  private dropActive(): void {
    const kind = this.activeKind;
    if (kind !== 'plank' && kind !== 'repair') {
      this.setMessage(`${TOOL_META[kind].label}不能丢下`, 'warn', 1.3);
      return;
    }
    if (!this.inventory.has(kind)) {
      this.setMessage(`没有可丢的${TOOL_META[kind].label}`, 'warn', 1.3);
      return;
    }
    this.inventory.take(kind, 1);
    const back = this.car.position.clone().addScaledVector(this.car.forward, -3.2);
    this.pickups.drop(kind, back.x, back.z);
    this.setMessage(
      `已丢下${TOOL_META[kind].label} ×1（现有 ${this.inventory.count(kind)}）`,
      'info',
      2,
    );
  }

  private groundSlope(): number {
    const position = this.car.position;
    const hit = this.world.castRayAndGetNormal(
      new RAPIER.Ray(
        { x: position.x, y: position.y + 3, z: position.z },
        { x: 0, y: -1, z: 0 },
      ),
      12,
      true,
      undefined,
      undefined,
      undefined,
      this.car.rigidBody,
    );
    if (!hit) return Number.NaN;
    return slopeDegFromNormal(hit.normal.y);
  }

  private buildPrompt(): { text: string; tone: 'info' | 'warn' | 'danger' } {
    if (this.wheelOpen) {
      return {
        text: '工具轮盘 · 方向键/左摇杆选槽 · 松开确认 · Backspace 丢弃',
        tone: 'info',
      };
    }
    if (this.jacking) {
      const remaining = (1 - this.jackProgress) * JACK.rightingTime;
      return {
        text: `千斤顶翻正中 · 还差 ${remaining.toFixed(1)} s · 按住 J · 坡度 ${this.jackSlope.toFixed(0)}°`,
        tone: 'info',
      };
    }
    if (this.message.time > 0) {
      return { text: this.message.text, tone: this.message.tone };
    }
    if (this.car.isRolledOver) {
      this.jackSlope = this.groundSlope();
      const availability = jackAvailability(this.jackSlope);
      if (!availability.ok) {
        return { text: availability.reason, tone: 'danger' };
      }
      return {
        text: `侧翻 · 按住 J 3 s 用千斤顶翻正（坡度 ${this.jackSlope.toFixed(0)}°）`,
        tone: 'warn',
      };
    }
    if (this.repairing) {
      const remaining = VEHICLE_HEALTH.repairTime - this.repairProgress;
      return {
        text: `修理中 ${Math.max(0, remaining).toFixed(1)} s · 保持停车 · 松开 G 取消`,
        tone: 'info',
      };
    }

    const active = this.activeKind;
    if (active === 'plank') {
      const count = this.inventory.count('plank');
      if (count <= 0) {
        return { text: '木板用完了 · 沿路找木板补给箱', tone: 'warn' };
      }
      return {
        text: `木板 ×${count} · G 放到车前 4 m（两端都要有支撑；斜放会打滑）`,
        tone: 'info',
      };
    }
    if (active === 'jack') {
      return {
        text: '千斤顶 · 侧翻后按住 J 3 s 翻正（坡度需 < 15°）',
        tone: 'info',
      };
    }
    if (active === 'repair') {
      const health = Math.round(this.car.healthValue);
      if (health >= VEHICLE_HEALTH.max) {
        return { text: '车况已满 · 维修包留着', tone: 'info' };
      }
      if (this.car.speedKmh > VEHICLE_HEALTH.repairMaxSpeedKmh) {
        return { text: '停稳后按住 G 修理（2 s · 车况 +35）', tone: 'warn' };
      }
      return {
        text: `按住 G 修理 2 s · 车况 +35（当前 ${health}）`,
        tone: 'info',
      };
    }
    return { text: '', tone: 'info' };
  }

  private setMessage(
    text: string,
    tone: 'info' | 'warn' | 'danger',
    seconds: number,
  ): void {
    this.message = { text, tone, time: seconds };
  }
}
