/**
 * W5 follow-up: "第一趟" (the first run), the first directed mission.
 *
 * The mission is a pure state machine plus a small set of trigger zones. The
 * browser layer feeds it real vehicle positions and tool/photo events; nothing
 * here touches the DOM, Rapier or Three.js, so objective sequencing, timing and
 * save/restore can be tested without a browser.
 *
 * Route (from a fresh load, no debug placement):
 *   spawn -> W4 pad 2 m ditch (plank) -> rollover ramp + jack (or crash + repair)
 *   -> spawn practice anchor or W3 wet-mud trial (winch recovery) -> ridge (photo)
 *   -> cabin checkpoint (finish).
 */
export const FIRST_RUN_ID = 'first-run';

export type FirstRunStatus = 'idle' | 'active' | 'complete';
export type FirstRunObjectiveId =
  | 'cross-ditch'
  | 'recover'
  | 'winch'
  | 'photo'
  | 'return';

export interface FirstRunObjective {
  id: FirstRunObjectiveId;
  /** Short label used by the checklist and completion notices. */
  label: string;
  /** One-line current-objective HUD title. */
  title: string;
  /** How to do it, in the order the player needs it. */
  hint: string;
}

export const FIRST_RUN_OBJECTIVES: readonly FirstRunObjective[] = [
  {
    id: 'cross-ditch',
    label: '架桥过沟',
    title: '跨过 2 m 沟',
    hint: '向东出闸到 W4 试炼区：停进黄框，按 2 选木板，G 架桥，低速开过 2 m 沟。',
  },
  {
    id: 'recover',
    label: '练一次脱困',
    title: '侧翻后翻正，或撞伤后修好',
    hint: '左轮上侧翻坡，按住 J 3 s 翻正；或低速撞一下，按 4 选维修包、停稳按住 G 2 s 修复。',
  },
  {
    id: 'winch',
    label: '绞盘自救',
    title: '用绞盘把自己拉出来',
    hint: '回出生点旁（或北边 W3 绞盘试炼）：按 1 选绞盘，G 挂「起手锚点」，按住 F 收绳把自己拉出 1–2 m，按 G 松绳。',
  },
  {
    id: 'photo',
    label: '山脊拍照',
    title: '在山脊观景点拍一张',
    hint: '沿缓坡上到「山脊观景点」，按 P 进拍照，空格快门。',
  },
  {
    id: 'return',
    label: '回木屋',
    title: '开回木屋检查点',
    hint: '从山脊南侧下坡，绕到山西侧再回木屋检查点；卡住可按 R 回起点再开回木屋。',
  },
] as const;

interface RectZone {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface CircleZone {
  x: number;
  z: number;
  radius: number;
}

/**
 * Trigger volumes. Ditch/tool-pad rectangles reuse the W4 rework pad; the
 * winch circles cover the existing spawn practice anchor and the W3 wet-mud
 * trial; the ridge/cabin circles match the W5 landmarks so discovery and
 * mission agree.
 */
export const FIRST_RUN_ZONES: {
  ditchApproach: RectZone;
  ditchCrossing: RectZone;
  toolPad: RectZone;
  practiceAnchor: CircleZone;
  winchTrial: CircleZone;
  ridge: CircleZone;
  cabin: CircleZone;
} = {
  ditchApproach: { minX: 25, maxX: 40, minZ: 12, maxZ: 38 },
  ditchCrossing: { minX: 34.7, maxX: 44, minZ: 12, maxZ: 38 },
  toolPad: { minX: 35, maxX: 72, minZ: 8, maxZ: 42 },
  practiceAnchor: { x: 3.5, z: 9, radius: 12 },
  winchTrial: { x: 50, z: 151, radius: 16 },
  ridge: { x: 7, z: 61, radius: 10 },
  cabin: { x: -9.6, z: 4.2, radius: 5.5 },
};

function inRect(zone: RectZone, x: number, z: number): boolean {
  return x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ;
}

function inCircle(zone: CircleZone, x: number, z: number): boolean {
  return Math.hypot(x - zone.x, z - zone.z) <= zone.radius;
}

export function inDitchApproach(x: number, z: number): boolean {
  return inRect(FIRST_RUN_ZONES.ditchApproach, x, z);
}

export function inDitchCrossing(x: number, z: number): boolean {
  return inRect(FIRST_RUN_ZONES.ditchCrossing, x, z);
}

export function inToolPad(x: number, z: number): boolean {
  return inRect(FIRST_RUN_ZONES.toolPad, x, z);
}

export function inWinchRecoveryZone(x: number, z: number): boolean {
  return (
    inCircle(FIRST_RUN_ZONES.practiceAnchor, x, z) ||
    inCircle(FIRST_RUN_ZONES.winchTrial, x, z)
  );
}

export function atRidgeLookout(x: number, z: number): boolean {
  return inCircle(FIRST_RUN_ZONES.ridge, x, z);
}

export function atCabin(x: number, z: number): boolean {
  return inCircle(FIRST_RUN_ZONES.cabin, x, z);
}

export type FirstRunRecoveryKind = 'jack' | 'repair';

export interface FirstRunSaved {
  id: typeof FIRST_RUN_ID;
  status: 'active' | 'complete';
  /** Index of the current objective; equals the objective count when complete. */
  objectiveIndex: number;
  elapsedMs: number;
  bestMs: number | null;
}

export interface FirstRunSnapshot {
  id: typeof FIRST_RUN_ID;
  status: FirstRunStatus;
  objectiveIndex: number;
  objective: FirstRunObjective;
  /** True when every objective is complete (same as status === 'complete'). */
  finished: boolean;
  completedIds: FirstRunObjectiveId[];
  elapsedMs: number;
  bestMs: number | null;
}

export type FirstRunEvent =
  | { type: 'started' }
  | { type: 'objective-complete'; objective: FirstRunObjective; index: number }
  | { type: 'complete'; elapsedMs: number; bestMs: number; isBest: boolean }
  | { type: 'restarted' };

const MAX_ELAPSED_MS = 24 * 60 * 60 * 1000;

function clampMs(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(MAX_ELAPSED_MS, Math.round(value));
}

/** Format a run duration as mm:ss, with hours folded into minutes. */
export function formatRunTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * "第一趟" mission state. One run is strictly linear: only the current
 * objective's trigger can advance it, so an early repair/photo/winch is ignored
 * until the player reaches that step.
 */
export class FirstRunMission {
  private statusValue: FirstRunStatus = 'idle';
  private index = 0;
  private elapsed = 0;
  private best: number | null = null;
  private plankAtDitch = false;
  private readonly events: FirstRunEvent[] = [];

  get status(): FirstRunStatus {
    return this.statusValue;
  }

  get objectiveIndex(): number {
    return this.index;
  }

  get currentObjective(): FirstRunObjective {
    return FIRST_RUN_OBJECTIVES[Math.min(this.index, FIRST_RUN_OBJECTIVES.length - 1)]!;
  }

  get snapshot(): FirstRunSnapshot {
    const finished = this.statusValue === 'complete';
    return {
      id: FIRST_RUN_ID,
      status: this.statusValue,
      objectiveIndex: this.index,
      objective: this.currentObjective,
      finished,
      completedIds: FIRST_RUN_OBJECTIVES.slice(0, this.index).map((objective) => objective.id),
      elapsedMs: this.elapsed,
      bestMs: this.best,
    };
  }

  /** Begin the mission from idle. Returns false if it is already running/done. */
  start(): boolean {
    if (this.statusValue !== 'idle') return false;
    this.statusValue = 'active';
    this.index = 0;
    this.elapsed = 0;
    this.plankAtDitch = false;
    this.events.push({ type: 'started' });
    return true;
  }

  /**
   * Start over at objective 1. Used by the mission card's restart button and
   * the completion screen's "再跑一趟"; the browser layer also resets the car
   * and consumables.
   */
  restart(): void {
    this.statusValue = 'active';
    this.index = 0;
    this.elapsed = 0;
    this.plankAtDitch = false;
    this.events.push({ type: 'restarted' });
  }

  /** Advance time and evaluate the position-driven objectives. */
  tick(dt: number, x: number, z: number): void {
    if (this.statusValue !== 'active') return;
    if (Number.isFinite(dt) && dt > 0) this.elapsed = clampMs(this.elapsed + dt * 1000);

    const objective = this.currentObjective;
    if (objective.id === 'cross-ditch') {
      if (this.plankAtDitch && inDitchCrossing(x, z)) this.advance();
    } else if (objective.id === 'return') {
      if (atCabin(x, z)) this.advance();
    }
  }

  /** Record a successful plank placement near the W4 ditch approach. */
  plankPlaced(x: number, z: number): boolean {
    if (this.statusValue !== 'active' || this.currentObjective.id !== 'cross-ditch') {
      return false;
    }
    if (!inDitchApproach(x, z)) return false;
    this.plankAtDitch = true;
    return true;
  }

  /**
   * Record a recovery in the W4 tool pad: either a completed jack righting or a
   * completed repair. The mission teaches one recovery; both routes count.
   */
  recovered(kind: FirstRunRecoveryKind, x: number, z: number): boolean {
    if (this.statusValue !== 'active' || this.currentObjective.id !== 'recover') {
      return false;
    }
    if (!inToolPad(x, z)) return false;
    if (kind !== 'jack' && kind !== 'repair') return false;
    this.advance();
    return true;
  }

  /** Record a winch recovery at the practice anchor or the W3 trial. */
  winchRecovered(x: number, z: number): boolean {
    if (this.statusValue !== 'active' || this.currentObjective.id !== 'winch') {
      return false;
    }
    if (!inWinchRecoveryZone(x, z)) return false;
    this.advance();
    return true;
  }

  /** Record a shutter press while the car is at the ridge lookout. */
  photoCaptured(x: number, z: number): boolean {
    if (this.statusValue !== 'active' || this.currentObjective.id !== 'photo') {
      return false;
    }
    if (!atRidgeLookout(x, z)) return false;
    this.advance();
    return true;
  }

  /** Drain pending UI notices (objective completed, run finished, ...). */
  drainEvents(): FirstRunEvent[] {
    return this.events.splice(0);
  }

  /** Serialisable progress for the W5 checkpoint save. */
  toSave(): FirstRunSaved | null {
    if (this.statusValue === 'idle') return null;
    return {
      id: FIRST_RUN_ID,
      status: this.statusValue === 'complete' ? 'complete' : 'active',
      objectiveIndex: this.index,
      elapsedMs: this.elapsed,
      bestMs: this.best,
    };
  }

  /**
   * Restore mission progress from a checkpoint. Invalid or foreign snapshots
   * are ignored, and progress is rebuilt from the saved objective index so the
   * checklist can never claim an out-of-order completion.
   */
  restore(saved: FirstRunSaved | null | undefined): boolean {
    if (!saved || saved.id !== FIRST_RUN_ID) return false;
    const index = Number.isFinite(saved.objectiveIndex)
      ? Math.max(0, Math.min(FIRST_RUN_OBJECTIVES.length, Math.round(saved.objectiveIndex)))
      : 0;
    this.index = index;
    this.elapsed = clampMs(saved.elapsedMs);
    this.best = saved.bestMs === null ? null : clampMs(saved.bestMs);
    this.statusValue = saved.status === 'complete' || index >= FIRST_RUN_OBJECTIVES.length
      ? 'complete'
      : 'active';
    if (this.statusValue === 'complete') this.index = FIRST_RUN_OBJECTIVES.length;
    this.plankAtDitch = this.index > 0;
    this.events.length = 0;
    return true;
  }

  private advance(): void {
    const completedIndex = this.index;
    const objective = FIRST_RUN_OBJECTIVES[completedIndex]!;
    this.index = Math.min(FIRST_RUN_OBJECTIVES.length, completedIndex + 1);
    this.events.push({ type: 'objective-complete', objective, index: completedIndex });
    if (this.index >= FIRST_RUN_OBJECTIVES.length) {
      this.statusValue = 'complete';
      const previousBest = this.best;
      const isBest = previousBest === null || this.elapsed < previousBest;
      if (isBest) this.best = this.elapsed;
      this.events.push({
        type: 'complete',
        elapsedMs: this.elapsed,
        bestMs: this.best ?? this.elapsed,
        isBest,
      });
    }
  }
}
