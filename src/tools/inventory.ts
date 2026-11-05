import { clamp } from '../core/math';

/**
 * W4 #18 / issue #24: the four tool slots and their counts.
 *
 * The winch is always available (count -1), the jack is a reusable single unit,
 * and the two consumables start with a small stack and can be picked up or
 * dropped in the world. The model is intentionally free of DOM and physics so
 * the wheel, HUD and tests share one source of truth.
 */
export type ToolKind = 'winch' | 'plank' | 'jack' | 'repair';

export const TOOL_ORDER: readonly ToolKind[] = ['winch', 'plank', 'jack', 'repair'];

export interface ToolMeta {
  kind: ToolKind;
  /** Short label used by the wheel and the strip. */
  label: string;
  /** Keyboard slot key 1-4. */
  key: string;
  /** One-line help for the active tool. */
  hint: string;
  /** Count shown at the start of a run; -1 means unlimited. */
  start: number;
  /** Stack cap for consumables. */
  max: number;
  /** Consumables are spent when used and can be dropped. */
  consumable: boolean;
}

export const TOOL_META: Record<ToolKind, ToolMeta> = {
  winch: {
    kind: 'winch',
    label: '绞盘',
    key: '1',
    hint: 'G 挂钩/松绳 · 按住 F 收绳 · X 换锚',
    start: -1,
    max: -1,
    consumable: false,
  },
  plank: {
    kind: 'plank',
    label: '木板',
    key: '2',
    hint: 'G 在车前 4 m 架桥（两端都要有支撑）',
    start: 2,
    max: 4,
    consumable: true,
  },
  jack: {
    kind: 'jack',
    label: '千斤顶',
    key: '3',
    hint: '侧翻后按住 J 3 s 翻正（坡度需 < 15°）',
    start: 1,
    max: 1,
    consumable: false,
  },
  repair: {
    kind: 'repair',
    label: '维修包',
    key: '4',
    hint: '停稳后按住 G 2 s 修理（车况 +35）',
    start: 1,
    max: 3,
    consumable: true,
  },
};

export interface ToolSlotState {
  kind: ToolKind;
  label: string;
  key: string;
  /** -1 = unlimited. */
  count: number;
  max: number;
  unlimited: boolean;
}

export class Inventory {
  private readonly counts = new Map<ToolKind, number>();
  private index = 0;

  constructor() {
    this.reset();
  }

  /** Restore a fresh run's starting stack (does not change the selection). */
  reset(): void {
    for (const kind of TOOL_ORDER) {
      this.counts.set(kind, TOOL_META[kind].start);
    }
  }

  get activeIndex(): number {
    return this.index;
  }

  get activeKind(): ToolKind {
    return TOOL_ORDER[this.index]!;
  }

  get slots(): ToolSlotState[] {
    return TOOL_ORDER.map((kind) => {
      const meta = TOOL_META[kind];
      const count = this.counts.get(kind) ?? 0;
      return {
        kind,
        label: meta.label,
        key: meta.key,
        count,
        max: meta.max,
        unlimited: count < 0,
      };
    });
  }

  count(kind: ToolKind): number {
    return this.counts.get(kind) ?? 0;
  }

  has(kind: ToolKind): boolean {
    const count = this.count(kind);
    return count < 0 || count > 0;
  }

  /** Select a slot by index; out-of-range values are ignored. */
  select(index: number): boolean {
    if (!Number.isInteger(index) || index < 0 || index >= TOOL_ORDER.length) {
      return false;
    }
    this.index = index;
    return true;
  }

  selectKind(kind: ToolKind): boolean {
    return this.select(TOOL_ORDER.indexOf(kind));
  }

  /** Cycle the selection; positive = next slot, wrapping around. */
  cycle(delta = 1): void {
    const length = TOOL_ORDER.length;
    this.index = (((this.index + delta) % length) + length) % length;
  }

  /** Add n units; returns how many were actually added after the stack cap. */
  add(kind: ToolKind, amount = 1): number {
    const meta = TOOL_META[kind];
    if (amount <= 0) return 0;
    const current = this.count(kind);
    if (meta.max < 0 || current < 0) return 0;
    const next = Math.min(meta.max, current + amount);
    const added = next - current;
    this.counts.set(kind, next);
    return added;
  }

  /** Spend n units; returns false (and changes nothing) without enough stock. */
  take(kind: ToolKind, amount = 1): boolean {
    if (amount <= 0) return false;
    const meta = TOOL_META[kind];
    if (meta.start < 0) return false;
    const current = this.count(kind);
    if (current < amount) return false;
    this.counts.set(kind, current - amount);
    return true;
  }

  /** Debug/test helper: set an exact count (clamped to the stack rules). */
  setCount(kind: ToolKind, count: number): void {
    const meta = TOOL_META[kind];
    this.counts.set(kind, meta.max < 0 ? -1 : clamp(Math.round(count), 0, meta.max));
  }
}

/**
 * Wheel direction (x right, y down) to slot index. The ring matches the
 * on-screen layout: top = winch, right = plank, bottom = jack, left = repair.
 */
export function slotForWheelDirection(
  x: number,
  y: number,
  deadzone = 0.35,
): number | null {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ax <= deadzone && ay <= deadzone) return null;
  if (ax >= ay) return x > 0 ? 1 : 3;
  return y < 0 ? 0 : 2;
}

export const WHEEL_SLOT_POSITIONS: readonly { x: number; y: number }[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** Slot index for a pointer/touch position relative to the wheel centre. */
export function slotForRingPoint(
  dx: number,
  dy: number,
  radius: number,
): number | null {
  if (Math.hypot(dx, dy) < radius * 0.55) return null;
  return slotForWheelDirection(dx, dy, 0);
}
