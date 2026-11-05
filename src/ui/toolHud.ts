import {
  TOOL_META,
  TOOL_ORDER,
  type ToolKind,
  type ToolSlotState,
} from '../tools/inventory';

export interface ToolSnapshot {
  active: ToolKind;
  slots: ToolSlotState[];
  health: number;
  healthWarning: string;
  /** Context sentence shown above the winch prompt; empty hides it. */
  prompt: string;
  promptTone: 'info' | 'warn' | 'danger';
  repairProgress: number;
  jackProgress: number;
  wheelOpen: boolean;
  wheelIndex: number;
  wheelNeedsRelease: boolean;
}

const WHEEL_CLASSES = ['slot-top', 'slot-right', 'slot-bottom', 'slot-left'];

/**
 * W4 #18 / issue #24: the always-visible tool strip plus the radial quick ring
 * and the vehicle health bar. The strip means the player never has to open the
 * wheel to know what is selected or how many planks/kits are left; the wheel is
 * the gamepad-friendly selector and shows the same counts.
 */
export class ToolHud {
  private readonly healthFill: HTMLElement;
  private readonly healthText: HTMLElement;
  private readonly damageHint: HTMLElement;
  private readonly strip: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly wheel: HTMLElement;
  private readonly wheelTool: HTMLElement;
  private readonly wheelHint: HTMLElement;
  private readonly stripChips = new Map<ToolKind, HTMLElement>();
  private readonly wheelSlots = new Map<ToolKind, HTMLElement>();
  private lastUpdate = 0;
  private lastHealth = -1;
  private readonly onWheelPick?: (index: number) => void;

  constructor(onWheelPick?: (index: number) => void) {
    this.onWheelPick = onWheelPick;
    this.healthFill = required('#healthFill');
    this.healthText = required('#healthText');
    this.damageHint = required('#damageHint');
    this.strip = required('#toolStrip');
    this.prompt = required('#toolPrompt');
    this.wheel = required('#toolWheel');
    this.wheelTool = required('#wheelTool');
    this.wheelHint = required('#wheelHint');

    for (const kind of TOOL_ORDER) {
      const meta = TOOL_META[kind];
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tool-chip';
      chip.dataset.kind = kind;
      chip.innerHTML = `<span class="tool-key">${meta.key}</span><span class="tool-name">${meta.label}</span><span class="tool-count"></span>`;
      chip.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
      });
      chip.addEventListener('click', (event) => {
        event.stopPropagation();
        this.onWheelPick?.(TOOL_ORDER.indexOf(kind));
      });
      this.strip.appendChild(chip);
      this.stripChips.set(kind, chip);
    }

    for (const kind of TOOL_ORDER) {
      const index = TOOL_ORDER.indexOf(kind);
      const meta = TOOL_META[kind];
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = `wheel-slot ${WHEEL_CLASSES[index]}`;
      slot.dataset.kind = kind;
      slot.innerHTML = `<span class="wheel-key">${meta.key}</span><span class="wheel-name">${meta.label}</span><span class="wheel-count"></span>`;
      slot.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
      });
      slot.addEventListener('click', (event) => {
        event.stopPropagation();
        this.onWheelPick?.(index);
      });
      this.wheel.appendChild(slot);
      this.wheelSlots.set(kind, slot);
    }

    this.wheel.hidden = true;
    this.prompt.hidden = true;
    this.damageHint.hidden = true;
  }

  update(snapshot: ToolSnapshot): void {
    const now = performance.now();
    const healthChanged = Math.round(snapshot.health) !== Math.round(this.lastHealth);
    if (!healthChanged && now - this.lastUpdate < 80) return;
    this.lastUpdate = now;
    this.lastHealth = snapshot.health;

    const health = Math.max(0, Math.min(100, Math.round(snapshot.health)));
    this.healthText.textContent = String(health);
    this.healthFill.style.width = `${health}%`;
    this.healthFill.classList.toggle('low', health < 50 && health >= 25);
    this.healthFill.classList.toggle('critical', health < 25);
    this.healthText.classList.toggle('low', health < 50);

    const warning = snapshot.healthWarning;
    this.damageHint.hidden = warning === '';
    if (warning !== '') this.damageHint.textContent = warning;

    for (const slot of snapshot.slots) {
      const chip = this.stripChips.get(slot.kind);
      const wheelSlot = this.wheelSlots.get(slot.kind);
      const countLabel = slot.unlimited ? '∞' : String(slot.count);
      const active = slot.kind === snapshot.active;
      const empty = !slot.unlimited && slot.count <= 0;
      if (chip) {
        chip.classList.toggle('active', active);
        chip.classList.toggle('empty', empty);
        const count = chip.querySelector<HTMLElement>('.tool-count');
        if (count) count.textContent = countLabel;
      }
      if (wheelSlot) {
        wheelSlot.classList.toggle('active', slot.kind === snapshot.active);
        wheelSlot.classList.toggle(
          'highlight',
          snapshot.wheelOpen && snapshot.wheelIndex === TOOL_ORDER.indexOf(slot.kind),
        );
        wheelSlot.classList.toggle('empty', empty);
        const count = wheelSlot.querySelector<HTMLElement>('.wheel-count');
        if (count) count.textContent = countLabel;
      }
    }

    this.wheel.hidden = !snapshot.wheelOpen;
    if (snapshot.wheelOpen) {
      this.wheelTool.textContent = TOOL_META[snapshot.active].label;
      this.wheelHint.textContent = snapshot.wheelNeedsRelease
        ? '松开确认 · Backspace 丢弃'
        : '方向键/左摇杆选择 · 松开确认';
    }

    this.prompt.hidden = snapshot.prompt === '';
    if (snapshot.prompt !== '') this.prompt.textContent = snapshot.prompt;
    this.prompt.classList.toggle('warn', snapshot.promptTone === 'warn');
    this.prompt.classList.toggle('danger', snapshot.promptTone === 'danger');
  }
}

function required<T extends Element = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`missing element ${selector}`);
  return element;
}
