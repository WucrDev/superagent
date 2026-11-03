import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { EngineAudio } from '../core/audio';
import type { ToolInput } from '../core/input';
import { clamp } from '../core/math';
import type { Haptics } from '../core/haptics';
import type { SurfaceEffects } from '../core/effects';
import type { WinchHud } from '../ui/winchHud';
import type { RaycastVehicle } from '../vehicle/raycastVehicle';
import { ANCHOR_TYPES, type WinchAnchor } from './anchorTypes';
import { Rope } from './rope';
import {
  WINCH,
  accumulateLoadTime,
  anchorFailForce,
  isInAutoCone,
  manualCandidates,
  maxTensionFor,
  pickAutoCandidate,
  reelSpeedFor,
  scoreAnchor,
  tensionFromStretch,
} from './winchMath';

export type WinchState =
  | 'ready'
  | 'attaching'
  | 'attached'
  | 'broken'
  | 'anchorFailed'
  | 'rolled';

export interface WinchCandidate {
  anchor: WinchAnchor;
  distance: number;
  /** Absolute angle from the car's forward direction, degrees. */
  angleDeg: number;
  /** Signed angle; positive to the car's right (used by the angle ring). */
  signedAngleDeg: number;
  heightDiff: number;
  score: number;
  visible: boolean;
  inCone: boolean;
  reachable: boolean;
  autoSelectable: boolean;
}

export interface WinchSnapshot {
  state: WinchState;
  status: string;
  message: string;
  tension: number;
  maxTension: number;
  load: number;
  selected: WinchCandidate | null;
  candidates: readonly WinchCandidate[];
  /** Why auto-aim has no target (distance / cone / occlusion), shown to the player. */
  hint: string;
  attached: WinchAnchor | null;
  /** Manual anchor cycling is active (X); V returns to automatic selection. */
  manual: boolean;
  /** Seconds left before an anchor can be hooked again after a release. */
  cooldown: number;
  breakProgress: number;
  stall: boolean;
  slipping: boolean;
  rightingProgress: number;
  reeling: boolean;
}

export interface WinchDeps {
  audio?: EngineAudio;
  effects?: SurfaceEffects;
  haptics?: Haptics;
  hud?: WinchHud;
}

const UP = new THREE.Vector3(0, 1, 0);
const ROPE_FALL_TIME = 2.5;
const FAIL_FLASH_TIME = 1.8;

/**
 * W3 #16–#20: the winch.
 *
 * Interaction (docs/winch-design.md §2): with no rope attached the winch is
 * always in `ready`, automatically showing the best nearby anchor. Press G to
 * hook it (no aim key), hold F to reel while attached, press G to release.
 * X cycles manual anchors and V returns to automatic selection. The physics
 * force is applied at the car's front hook; the rope itself is visual PBD.
 * Feedback lives in `sync()` so the fixed simulation step stays deterministic
 * and cheap.
 */
export class Winch {
  private readonly maxTension: number;
  private readonly rope = new Rope(WINCH.segments);
  private readonly ropeGroup = new THREE.Group();
  private readonly ropeMeshes: THREE.Mesh[] = [];
  private readonly ropeGeometry: THREE.CylinderGeometry;
  private readonly ropeMaterial: THREE.MeshStandardMaterial;
  private readonly hookMesh: THREE.Mesh;
  private readonly hookMaterial: THREE.MeshBasicMaterial;
  private readonly markerGeometry: THREE.OctahedronGeometry;
  private readonly markers = new Map<string, THREE.Mesh>();

  private state: WinchState = 'ready';
  private attached: WinchAnchor | null = null;
  private selected: WinchCandidate | null = null;
  private candidates: WinchCandidate[] = [];
  private hint = '';
  private manual = false;
  private manualIndex = 0;
  private attachTimer = 0;
  private readonly attachFrom = new THREE.Vector3();
  private readonly hookFlight = new THREE.Vector3();
  private targetLength = 0;
  private tension = 0;
  private overTension = 0;
  private anchorLoad = 0;
  private stallTimer = 0;
  private slipTimer = 0;
  private bushTimer = 0;
  private cooldown = 0;
  private failFlash = 0;
  private failState: 'none' | 'broken' | 'anchor' = 'none';
  private falling = false;
  private fallTimer = 0;
  private rightProgress = 0;
  private message = '';
  private messageTimer = 0;
  private reeling = false;
  private time = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly world: RAPIER.World,
    private readonly car: RaycastVehicle,
    private readonly anchors: WinchAnchor[],
    private readonly deps: WinchDeps = {},
  ) {
    this.maxTension = maxTensionFor(car.mass);

    this.ropeGeometry = new THREE.CylinderGeometry(0.04, 0.04, 1, 6, 1);
    this.ropeMaterial = new THREE.MeshStandardMaterial({
      color: 0xb9b9ae,
      roughness: 0.62,
      metalness: 0.08,
      transparent: true,
      opacity: 1,
    });
    for (let index = 0; index < WINCH.segments; index += 1) {
      const mesh = new THREE.Mesh(this.ropeGeometry, this.ropeMaterial);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      this.ropeMeshes.push(mesh);
      this.ropeGroup.add(mesh);
    }
    this.ropeGroup.visible = false;
    this.scene.add(this.ropeGroup);

    this.hookMaterial = new THREE.MeshBasicMaterial({ color: 0xf0c35a });
    this.hookMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 10, 8),
      this.hookMaterial,
    );
    this.hookMesh.visible = false;
    this.scene.add(this.hookMesh);

    this.markerGeometry = new THREE.OctahedronGeometry(0.24, 0);
    for (const anchor of anchors) {
      const material = new THREE.MeshBasicMaterial({
        color: ANCHOR_TYPES[anchor.kind].color,
        transparent: true,
        opacity: 0.5,
      });
      const marker = new THREE.Mesh(this.markerGeometry, material);
      marker.visible = false;
      this.markers.set(anchor.id, marker);
      this.scene.add(marker);
    }
  }

  get winchState(): WinchState {
    return this.state;
  }

  get attachedAnchor(): WinchAnchor | null {
    return this.attached;
  }

  get ropeTension(): number {
    return this.tension;
  }

  get maxRopeTension(): number {
    return this.maxTension;
  }

  get isFallingRope(): boolean {
    return this.falling;
  }

  /** Fixed-step simulation + input state machine. */
  update(dt: number, input: ToolInput): void {
    this.time += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.failFlash = Math.max(0, this.failFlash - dt);
    this.messageTimer = Math.max(0, this.messageTimer - dt);
    if (this.messageTimer <= 0) this.message = '';
    if (this.failFlash <= 0 && (this.state === 'broken' || this.state === 'anchorFailed')) {
      this.state = 'ready';
    }

    this.updateRighting(dt, input);

    if (this.car.isRolledOver) {
      if (this.attached) this.release('侧翻，绳已松开', 'rolled');
      this.state = 'rolled';
      this.selected = null;
      this.candidates = [];
      this.reeling = false;
      this.car.setWinchAssist(false);
      this.car.setWinchLoad(0);
      return;
    }
    if (this.state === 'rolled') this.state = 'ready';

    if (this.failFlash > 0 && this.failState !== 'none') {
      this.state = this.failState === 'broken' ? 'broken' : 'anchorFailed';
      this.reeling = false;
      this.candidates = [];
      this.selected = null;
      this.car.setWinchAssist(false);
      this.car.setWinchLoad(0);
      return;
    }

    if (this.state === 'attaching' && this.attached) {
      this.updateAttaching(dt);
      return;
    }

    if (this.attached) {
      this.updateAttached(dt, input);
      return;
    }

    this.updateReady(input);
  }

  /** Render-rate feedback: rope mesh, anchor markers, audio, haptics, HUD. */
  sync(dt: number): void {
    this.syncRope(dt);
    this.syncAnchors(dt);
    this.syncHook();

    const load = clamp(this.tension / this.maxTension, 0, 1);
    this.deps.audio?.updateWinch(load, this.reeling, this.overTension > 0.2);
    this.deps.haptics?.update(this.reeling ? load : 0);
    if (this.deps.effects && this.reeling && this.slipTimer > 0.15) {
      this.deps.effects.winchSlip(
        this.car,
        clamp(this.tension / this.maxTension, 0, 1),
        dt,
      );
    }
    this.deps.hud?.update(this.snapshot);
  }

  get snapshot(): WinchSnapshot {
    return {
      state: this.state,
      status: this.statusText(),
      message: this.message,
      tension: this.tension,
      maxTension: this.maxTension,
      load: clamp(this.tension / this.maxTension, 0, 1.5),
      selected: this.selected,
      candidates: this.candidates,
      hint: this.hint,
      attached: this.attached,
      manual: this.manual,
      cooldown: this.cooldown,
      breakProgress: clamp(this.overTension / WINCH.breakTime, 0, 1),
      stall: this.stallTimer > 0.4,
      slipping: this.slipTimer > 0.2,
      rightingProgress: clamp(this.rightProgress / WINCH.rightingTime, 0, 1),
      reeling: this.reeling,
    };
  }

  /** Debug/test helper: force manual selection of one anchor. */
  selectAnchor(id: string): boolean {
    const candidates = this.computeCandidates();
    const candidate = candidates.find((entry) => entry.anchor.id === id);
    if (!candidate) return false;
    this.candidates = candidates;
    this.manual = true;
    const list = manualCandidates(candidates);
    this.manualIndex = Math.max(
      0,
      list.findIndex((entry) => entry.anchor.id === id),
    );
    this.selected = candidate;
    return true;
  }

  /** Drop every rope and clear run state, e.g. after the car reset. */
  reset(): void {
    this.attached = null;
    this.selected = null;
    this.candidates = [];
    this.hint = '';
    this.state = 'ready';
    this.tension = 0;
    this.overTension = 0;
    this.anchorLoad = 0;
    this.stallTimer = 0;
    this.slipTimer = 0;
    this.bushTimer = 0;
    this.cooldown = 0;
    this.failFlash = 0;
    this.failState = 'none';
    this.falling = false;
    this.fallTimer = 0;
    this.rightProgress = 0;
    this.reeling = false;
    this.manual = false;
    this.manualIndex = 0;
    this.targetLength = 0;
    this.message = '';
    this.messageTimer = 0;
    this.ropeGroup.visible = false;
    this.hookMesh.visible = false;
    this.car.setWinchAssist(false);
    this.car.setWinchLoad(0);
    for (const marker of this.markers.values()) marker.visible = false;
  }

  dispose(): void {
    this.scene.remove(this.ropeGroup);
    this.scene.remove(this.hookMesh);
    this.ropeGeometry.dispose();
    this.ropeMaterial.dispose();
    this.hookMaterial.dispose();
    this.markerGeometry.dispose();
    for (const marker of this.markers.values()) {
      (marker.material as THREE.Material).dispose();
      this.scene.remove(marker);
    }
  }

  private updateRighting(dt: number, input: ToolInput): void {
    if (!this.car.isRolledOver) {
      this.rightProgress = 0;
      return;
    }
    if (!input.right) {
      this.rightProgress = Math.max(0, this.rightProgress - dt * 3);
      return;
    }
    this.rightProgress += dt;
    if (this.rightProgress >= WINCH.rightingTime) {
      this.car.rightAtCurrent();
      this.rightProgress = 0;
      this.message = '已翻正，可以继续';
      this.messageTimer = 2.5;
      this.deps.haptics?.pulse(0.8);
    }
  }

  /**
   * No rope attached: automatically pick and show the best nearby anchor, so
   * hooking is a single G press (the old "hold F to aim" step is gone). X
   * cycles manual anchors, V returns to the automatic pick.
   */
  private updateReady(input: ToolInput): void {
    this.state = 'ready';
    this.reeling = false;
    this.car.setWinchAssist(false);
    this.car.setWinchLoad(0);

    if (this.cooldown > 0) {
      this.selected = null;
      this.candidates = [];
      this.hint = '';
      return;
    }

    this.candidates = this.computeCandidates();

    if (input.cycle) {
      if (!this.manual) {
        this.manual = true;
        this.manualIndex = 0;
      } else {
        this.manualIndex += 1;
      }
    }
    if (input.auto) {
      this.manual = false;
      this.manualIndex = 0;
    }

    const list = manualCandidates(this.candidates);
    if (this.manual && list.length > 0) {
      this.manualIndex %= list.length;
      this.selected = list[this.manualIndex] ?? null;
    } else {
      this.selected = pickAutoCandidate(this.candidates);
    }
    this.hint = this.selected ? '' : this.buildAimHint();

    if (input.hook && this.selected) {
      this.startAttach(this.selected);
    }
  }

  /**
   * Turns "no target" into an actionable sentence: too far, outside the 60°
   * auto cone (press X), occluded, or only a bush. Without this the player sees
   * a close-looking anchor and the generic "12 m / 60° 内没有可选锚点".
   */
  private buildAimHint(): string {
    const visible = this.candidates.filter(
      (candidate) => candidate.visible && candidate.reachable,
    );
    const offCone = visible
      .filter((candidate) => !candidate.inCone)
      .sort((a, b) => b.score - a.score);
    if (offCone.length > 0) {
      const best = offCone[0]!;
      return `锚点在 ${best.distance.toFixed(1)} m、${Math.round(
        best.angleDeg,
      )}° · 按 X 手动选（自动只选前方 60°）`;
    }

    const bush = visible.find((candidate) => !candidate.autoSelectable);
    if (bush) return '细灌木不能自动选 · 按 X 手动选';

    const tooFar = this.candidates
      .filter((candidate) => candidate.visible && !candidate.reachable)
      .sort((a, b) => a.distance - b.distance)[0];
    if (tooFar) {
      return `锚点 ${tooFar.anchor.label} ${tooFar.distance.toFixed(
        1,
      )} m · 超过 10 m 绳长，再靠近`;
    }

    if (this.candidates.some((candidate) => !candidate.visible && candidate.reachable)) {
      return '锚点被地形遮挡 · 换个位置或角度';
    }

    if (visible.length === 0) {
      const hook = this.car.hookPoint;
      let nearest: { anchor: WinchAnchor; distance: number } | null = null;
      for (const anchor of this.anchors) {
        if (anchor.status !== 'ok') continue;
        const distance = anchor.attachPoint.distanceTo(hook);
        if (!nearest || distance < nearest.distance) {
          nearest = { anchor, distance };
        }
      }
      if (nearest && nearest.distance <= 24) {
        return `最近锚点 ${nearest.anchor.label} ${nearest.distance.toFixed(
          1,
        )} m · 再靠近到 12 m 内`;
      }
      return '附近 12 m 内没有锚点';
    }

    return '按 X 手动选锚点';
  }

  private startAttach(candidate: WinchCandidate): void {
    if (candidate.anchor.status !== 'ok') return;
    if (!candidate.reachable) {
      this.message = '够不到：超过 10 m 绳长';
      this.messageTimer = 2;
      return;
    }
    this.attached = candidate.anchor;
    this.selected = candidate;
    this.state = 'attaching';
    this.attachTimer = 0;
    this.attachFrom.copy(this.car.hookPoint);
    this.hookFlight.copy(this.attachFrom);
    this.rope.stretchTo(this.attachFrom, this.attachFrom);
    this.ropeGroup.visible = true;
    this.ropeMaterial.opacity = 1;
  }

  private updateAttaching(dt: number): void {
    const anchor = this.attached;
    if (!anchor) return;
    this.attachTimer += dt;
    if (this.attachTimer >= WINCH.attachTime) {
      this.attachTimer = WINCH.attachTime;
      this.state = 'attached';
      this.hookFlight.copy(anchor.attachPoint);
      this.targetLength = Math.max(
        0.8,
        this.car.hookPoint.distanceTo(anchor.attachPoint),
      );
      this.rope.reset(this.car.hookPoint, anchor.attachPoint, this.targetLength);
      this.deps.audio?.winchHitch();
      this.message = `已挂钩：${anchor.label}`;
      this.messageTimer = 1.6;
      if (anchor.kind === 'bush') this.bushTimer = WINCH.bushDetachTime;
      return;
    }
    const t = clamp(this.attachTimer / WINCH.attachTime, 0, 1);
    const eased = 1 - (1 - t) ** 3;
    this.hookFlight.copy(this.attachFrom).lerp(anchor.attachPoint, eased);
    this.rope.stretchTo(this.car.hookPoint, this.hookFlight);
    this.car.setWinchAssist(false);
    this.car.setWinchLoad(0);
  }

  private updateAttached(dt: number, input: ToolInput): void {
    const anchor = this.attached;
    if (!anchor) return;

    const hook = this.car.hookPoint;
    const delta = anchor.attachPoint.clone().sub(hook);
    const distance = delta.length();
    const direction =
      distance > 1e-4
        ? delta.clone().multiplyScalar(1 / distance)
        : new THREE.Vector3(0, 0, 1);
    this.updateSelected(distance, anchor.attachPoint.y - hook.y);

    if (input.hook) {
      this.release('已松绳', 'ready');
      return;
    }

    if (this.bushTimer > 0) {
      this.bushTimer -= dt;
      this.rope.setRestLength(this.targetLength);
      this.rope.step(dt, hook, anchor.attachPoint, this.groundHeight);
      this.tension = 0;
      this.reeling = false;
      this.car.setWinchAssist(false);
      this.car.setWinchLoad(0);
      if (this.bushTimer <= 0) this.release('挂不住：灌木太细', 'ready');
      return;
    }

    this.reeling = input.winchHeld;
    if (this.reeling) {
      const load = clamp(this.tension / this.maxTension, 0, 1);
      this.targetLength = Math.max(
        0.8,
        this.targetLength - reelSpeedFor(load) * dt,
      );
    } else if (this.targetLength < distance + 0.35) {
      // Spooling out when the key is released: the rope goes slack and the car
      // can slide back, exactly as §2's Release state describes.
      this.targetLength = Math.min(
        distance + 0.35,
        this.targetLength + WINCH.slackPush * dt,
      );
    }

    this.rope.setRestLength(this.targetLength);
    this.rope.step(dt, hook, anchor.attachPoint, this.groundHeight);

    const stretch = Math.max(0, distance - this.targetLength);
    const stretchRatio = stretch / Math.max(0.5, this.targetLength);
    const relativeVelocity = direction.dot(this.car.velocity);
    // Spring plus a velocity damper: closing faster than the spool speed bleeds
    // tension instead of yanking the car past the reel, which keeps the 0.8–2.0
    // m/s "收绳" feel and avoids on/off rope snapping.
    const demand = Math.max(
      0,
      tensionFromStretch(stretchRatio, this.maxTension) +
        relativeVelocity * 2600,
    );
    this.tension = Math.min(demand, this.maxTension);

    this.overTension = accumulateLoadTime(
      this.overTension,
      demand > this.maxTension,
      dt,
    );
    const failForce = anchorFailForce(anchor.strength, this.maxTension);
    this.anchorLoad = accumulateLoadTime(
      this.anchorLoad,
      failForce <= 0 || demand > failForce,
      dt,
    );

    const carSpeed = this.car.velocity.length();
    this.stallTimer = accumulateLoadTime(
      this.stallTimer,
      this.reeling && carSpeed < 0.15 && demand > this.maxTension * 0.25,
      dt,
    );
    this.slipTimer = accumulateLoadTime(
      this.slipTimer,
      this.reeling && this.car.slipSpeed > 2.2 && demand > this.maxTension * 0.2,
      dt,
      1.5,
    );

    if (this.tension > 1) {
      this.car.applyWinchImpulse(
        direction.clone().multiplyScalar(this.tension * dt),
        hook,
      );
    }
    this.car.setWinchAssist(this.tension > 300);
    this.car.setWinchLoad(this.tension / this.maxTension);

    if (this.overTension >= WINCH.breakTime) {
      this.breakRope(direction, hook);
      return;
    }
    if (this.anchorLoad >= WINCH.anchorFailTime) {
      this.failAnchor(anchor, direction);
    }
  }

  private breakRope(direction: THREE.Vector3, hook: THREE.Vector3): void {
    this.car.applyWinchImpulse(
      direction.clone().multiplyScalar(-this.car.mass * WINCH.breakRecoil),
      hook,
    );
    this.deps.audio?.winchBreak();
    this.deps.haptics?.pulse(1);
    this.release('绳断了：张力超过上限 1.2 s', 'broken');
    this.failState = 'broken';
    this.failFlash = FAIL_FLASH_TIME;
  }

  private failAnchor(anchor: WinchAnchor, direction: THREE.Vector3): void {
    anchor.status = 'failed';
    anchor.failTimer = 0;
    anchor.failDirection.copy(direction).negate();

    if (anchor.kind === 'rock' && anchor.rigidBody) {
      anchor.rigidBody.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      anchor.rigidBody.applyImpulse(
        {
          x: -direction.x * 6000,
          y: 1200,
          z: -direction.z * 6000,
        },
        true,
      );
      anchor.rigidBody.applyTorqueImpulse(
        { x: 900, y: 0, z: 900 },
        true,
      );
    }

    this.deps.audio?.anchorCrack();
    this.deps.haptics?.pulse(0.9);
    const message =
      anchor.kind === 'rock'
        ? '锚点脱落：岩石滚落了'
        : anchor.kind === 'stump'
          ? '锚点脱落：木桩断了'
          : '锚点脱落：树干断了';
    this.release(message, 'anchorFailed');
    this.failState = 'anchor';
    this.failFlash = FAIL_FLASH_TIME;
  }

  private release(message: string, state: WinchState): void {
    this.attached = null;
    this.selected = null;
    this.hint = '';
    this.state = state;
    this.reeling = false;
    this.targetLength = 0;
    this.tension = 0;
    this.overTension = 0;
    this.anchorLoad = 0;
    this.stallTimer = 0;
    this.slipTimer = 0;
    this.bushTimer = 0;
    this.cooldown = WINCH.retryCooldown;
    this.message = message;
    this.messageTimer = 2.5;
    this.falling = true;
    this.fallTimer = ROPE_FALL_TIME;
    this.car.setWinchAssist(false);
    this.car.setWinchLoad(0);
  }

  private computeCandidates(): WinchCandidate[] {
    const hook = this.car.hookPoint;
    const forward = this.car.forward;
    forward.y = 0;
    if (forward.lengthSq() < 1e-4) forward.set(0, 0, 1);
    else forward.normalize();

    const result: WinchCandidate[] = [];
    for (const anchor of this.anchors) {
      if (anchor.status !== 'ok') continue;
      const delta = anchor.attachPoint.clone().sub(hook);
      const distance = delta.length();
      if (distance > WINCH.range) continue;

      const horizontal = new THREE.Vector3(delta.x, 0, delta.z);
      const horizontalLength = horizontal.length();
      const signedAngleDeg =
        horizontalLength < 1e-4
          ? 0
          : THREE.MathUtils.radToDeg(
              Math.atan2(
                forward.z * horizontal.x - forward.x * horizontal.z,
                forward.x * horizontal.x + forward.z * horizontal.z,
              ),
            );
      const angleDeg = Math.abs(signedAngleDeg);

      result.push({
        anchor,
        distance,
        angleDeg,
        signedAngleDeg,
        heightDiff: delta.y,
        score: scoreAnchor({
          angleDeg,
          distance,
          heightDiff: delta.y,
          strength: anchor.strength,
        }),
        visible: this.isVisible(anchor, hook),
        inCone: isInAutoCone(angleDeg),
        reachable: distance <= WINCH.ropeLength,
        autoSelectable: ANCHOR_TYPES[anchor.kind].autoSelectable,
      });
    }
    return result;
  }

  private updateSelected(distance: number, heightDiff: number): void {
    if (!this.selected) return;
    const hook = this.car.hookPoint;
    const forward = this.car.forward;
    forward.y = 0;
    if (forward.lengthSq() < 1e-4) forward.set(0, 0, 1);
    else forward.normalize();
    const horizontal = this.selected.anchor.attachPoint.clone().sub(hook);
    horizontal.y = 0;
    const length = horizontal.length();
    const signedAngleDeg =
      length < 1e-4
        ? 0
        : THREE.MathUtils.radToDeg(
            Math.atan2(
              forward.z * horizontal.x - forward.x * horizontal.z,
              forward.x * horizontal.x + forward.z * horizontal.z,
            ),
          );
    const angleDeg = Math.abs(signedAngleDeg);
    this.selected.distance = distance;
    this.selected.angleDeg = angleDeg;
    this.selected.signedAngleDeg = signedAngleDeg;
    this.selected.heightDiff = heightDiff;
    this.selected.score = scoreAnchor({
      angleDeg,
      distance,
      heightDiff,
      strength: this.selected.anchor.strength,
    });
  }

  private isVisible(anchor: WinchAnchor, from: THREE.Vector3): boolean {
    const delta = anchor.attachPoint.clone().sub(from);
    const distance = delta.length();
    if (distance < 0.5) return true;
    delta.multiplyScalar(1 / distance);
    const hit = this.world.castRayAndGetNormal(
      new RAPIER.Ray(
        { x: from.x, y: from.y, z: from.z },
        { x: delta.x, y: delta.y, z: delta.z },
      ),
      Math.max(0.1, distance - 0.25),
      true,
      undefined,
      undefined,
      undefined,
      this.car.rigidBody,
      (collider) => !anchor.colliderHandles.has(collider.handle),
    );
    return hit === null;
  }

  private readonly groundHeight = (x: number, z: number): number => {
    const hit = this.world.castRay(
      new RAPIER.Ray({ x, y: 60, z }, { x: 0, y: -1, z: 0 }),
      120,
      true,
      undefined,
      undefined,
      undefined,
      this.car.rigidBody,
    );
    return hit ? 60 - hit.timeOfImpact : 0;
  };

  private syncRope(dt: number): void {
    if (
      this.attached &&
      (this.state === 'attached' || this.state === 'attaching')
    ) {
      if (this.state === 'attaching') {
        const t = clamp(this.attachTimer / WINCH.attachTime, 0, 1);
        const eased = 1 - (1 - t) ** 3;
        this.hookFlight.copy(this.attachFrom).lerp(this.attached.attachPoint, eased);
        this.rope.stretchTo(this.car.hookPoint, this.hookFlight);
      } else {
        this.rope.points[0]!.copy(this.car.hookPoint);
        this.rope.points[this.rope.segments]!.copy(this.attached.attachPoint);
      }
      const load = clamp(this.tension / this.maxTension, 0, 1);
      this.ropeMaterial.color.setRGB(
        0.72 + load * 0.28,
        0.72 + load * 0.28,
        0.68 + load * 0.32,
      );
      this.ropeMaterial.opacity = 1;
      this.ropeGroup.visible = true;
      this.updateRopeMeshes();
      return;
    }

    if (this.falling) {
      this.fallTimer -= dt;
      this.rope.freeStep(dt, this.car.hookPoint, this.groundHeight);
      this.ropeGroup.visible = this.fallTimer > 0;
      this.ropeMaterial.opacity = clamp(this.fallTimer / ROPE_FALL_TIME, 0, 1);
      this.updateRopeMeshes();
      if (this.fallTimer <= 0) this.falling = false;
      return;
    }

    this.ropeGroup.visible = false;
  }

  private updateRopeMeshes(): void {
    for (let index = 0; index < this.ropeMeshes.length; index += 1) {
      const mesh = this.ropeMeshes[index]!;
      const a = this.rope.points[index]!;
      const b = this.rope.points[index + 1]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const length = Math.hypot(dx, dy, dz);
      if (length < 1e-4) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      mesh.quaternion.setFromUnitVectors(
        UP,
        new THREE.Vector3(dx / length, dy / length, dz / length),
      );
      mesh.scale.set(1, length, 1);
    }
  }

  private syncAnchors(dt: number): void {
    for (const anchor of this.anchors) {
      const marker = this.markers.get(anchor.id);
      const candidate =
        this.candidates.find((entry) => entry.anchor === anchor) ??
        (this.selected?.anchor === anchor ? this.selected : null);
      const active = this.attached === anchor;
      const showMarker =
        anchor.status === 'ok' &&
        candidate !== null &&
        (this.state === 'ready' || this.state === 'attaching' || active);

      if (marker) {
        marker.visible = showMarker;
        if (showMarker && candidate) {
          const bob = Math.sin(this.time * 3) * 0.06;
          marker.position.set(
            anchor.attachPoint.x,
            anchor.attachPoint.y + 0.9 + bob,
            anchor.attachPoint.z,
          );
          const isSelected = candidate === this.selected || active;
          const markerMaterial = marker.material as THREE.MeshBasicMaterial;
          markerMaterial.color.setHex(
            isSelected
              ? candidate.score < WINCH.autoScore
                ? 0xff5544
                : 0xf5d76e
              : 0x8a9a80,
          );
          markerMaterial.opacity = isSelected ? 0.95 : 0.45;
          marker.scale.setScalar(
            isSelected ? 1.2 + Math.sin(this.time * 8) * 0.08 : 0.65,
          );
        }
      }

      const ringMaterial = anchor.ring.material as THREE.MeshBasicMaterial;
      const isSelected = candidate === this.selected || active;
      if (anchor.status === 'failed') {
        ringMaterial.color.setHex(0x553333);
        ringMaterial.opacity = 0.2;
        anchor.ring.scale.setScalar(1);
        if (anchor.labelMesh) anchor.labelMesh.visible = false;
      } else {
        ringMaterial.color.setHex(
          isSelected ? ANCHOR_TYPES[anchor.kind].color : 0x6b7561,
        );
        ringMaterial.opacity = isSelected ? 0.85 : 0.3;
        anchor.ring.scale.setScalar(isSelected ? 1 + Math.sin(this.time * 6) * 0.08 : 1);
      }

      if (anchor.status === 'ok') {
        if (active) {
          const load = clamp(this.tension / this.maxTension, 0, 1);
          anchor.group.rotation.z = Math.sin(this.time * 22) * 0.015 * load;
          anchor.group.rotation.x = Math.sin(this.time * 17) * 0.008 * load;
        } else {
          anchor.group.rotation.z *= 0.9;
          anchor.group.rotation.x *= 0.9;
        }
      } else {
        anchor.failTimer += dt;
        if (anchor.kind === 'rock') {
          if (anchor.rigidBody) {
            const translation = anchor.rigidBody.translation();
            const rotation = anchor.rigidBody.rotation();
            anchor.group.position.set(translation.x, translation.y, translation.z);
            anchor.group.quaternion.set(
              rotation.x,
              rotation.y,
              rotation.z,
              rotation.w,
            );
          }
        } else {
          const fall = clamp(anchor.failTimer / 0.9, 0, 1);
          const sign = anchor.failDirection.z >= 0 ? 1 : -1;
          anchor.group.rotation.x = sign * fall * 1.42;
          anchor.group.rotation.z = 0;
        }
      }
    }
  }

  private syncHook(): void {
    if (this.state === 'attaching') {
      this.hookMesh.visible = true;
      this.hookMesh.position.copy(this.hookFlight);
      return;
    }
    if (this.attached) {
      this.hookMesh.visible = true;
      this.hookMesh.position.copy(this.attached.attachPoint);
      return;
    }
    this.hookMesh.visible = false;
  }

  private statusText(): string {
    if (this.state === 'rolled') {
      if (this.rightProgress > 0) {
        const remaining = WINCH.rightingTime - this.rightProgress;
        return `翻正中 ${remaining.toFixed(1)}s`;
      }
      return '侧翻 · 按住 J 翻正';
    }
    if (this.state === 'broken' || this.failState === 'broken') {
      if (this.failFlash > 0) return '绳断了';
    }
    if (this.state === 'anchorFailed' || this.failState === 'anchor') {
      if (this.failFlash > 0) return '锚点脱落';
    }
    if (this.stallTimer > 0.4) return '拉不动';
    if (this.overTension > 0.15) return '即将断绳';
    if (this.slipTimer > 0.2) return '轮胎打滑';
    if (this.state === 'attaching') return '挂钩中';
    if (this.reeling) return '收绳中';
    if (this.attached) {
      return this.tension > this.maxTension * 0.08 ? '受力' : '绳松';
    }
    if (this.state === 'ready') {
      if (this.cooldown > 0) return `可再挂 ${this.cooldown.toFixed(1)} s`;
      if (this.selected) return this.manual ? '手动选锚' : '自动选锚';
      return '无可用锚点';
    }
    return '绞盘待机';
  }
}
