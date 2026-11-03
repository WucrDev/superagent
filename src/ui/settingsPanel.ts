import type { InputManager } from '../core/input';
import type { CameraRig } from '../vehicle/cameraRig';

export interface GameSettings {
  deadzone: number;
  steerSensitivity: number;
  chaseFov: number;
  cockpitFov: number;
}

const STORAGE_KEY = 'superagent.settings.v1';

const DEFAULTS: GameSettings = {
  deadzone: 0.15,
  steerSensitivity: 1,
  chaseFov: 65,
  cockpitFov: 75,
};

function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      deadzone: clampNumber(parsed.deadzone, 0, 0.4, DEFAULTS.deadzone),
      steerSensitivity: clampNumber(parsed.steerSensitivity, 0.5, 2, DEFAULTS.steerSensitivity),
      chaseFov: clampNumber(parsed.chaseFov, 60, 80, DEFAULTS.chaseFov),
      cockpitFov: clampNumber(parsed.cockpitFov, 60, 90, DEFAULTS.cockpitFov),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export class SettingsPanel {
  private settings: GameSettings;
  private readonly root: HTMLElement;
  private readonly deadzone: HTMLInputElement;
  private readonly steer: HTMLInputElement;
  private readonly chaseFov: HTMLInputElement;
  private readonly cockpitFov: HTMLInputElement;
  private readonly deadzoneValue: HTMLElement;
  private readonly steerValue: HTMLElement;
  private readonly chaseFovValue: HTMLElement;
  private readonly cockpitFovValue: HTMLElement;

  constructor(
    private readonly input: InputManager,
    private readonly camera: CameraRig,
  ) {
    this.settings = loadSettings();
    this.root = required('#settings');
    this.deadzone = required<HTMLInputElement>('#deadzone');
    this.steer = required<HTMLInputElement>('#steerSensitivity');
    this.chaseFov = required<HTMLInputElement>('#chaseFov');
    this.cockpitFov = required<HTMLInputElement>('#cockpitFov');
    this.deadzoneValue = required('#deadzoneValue');
    this.steerValue = required('#steerValue');
    this.chaseFovValue = required('#chaseFovValue');
    this.cockpitFovValue = required('#cockpitFovValue');

    for (const element of [this.deadzone, this.steer, this.chaseFov, this.cockpitFov]) {
      element.addEventListener('input', this.onRange);
    }
    required('#settingsClose').addEventListener('click', () => this.hide());
    window.addEventListener('keydown', this.onKeyDown);

    this.syncInputs();
    this.apply();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'Escape') return;
    event.preventDefault();
    if (this.root.hidden) this.show();
    else this.hide();
  };

  private readonly onRange = (): void => {
    this.settings = {
      deadzone: Number(this.deadzone.value),
      steerSensitivity: Number(this.steer.value),
      chaseFov: Number(this.chaseFov.value),
      cockpitFov: Number(this.cockpitFov.value),
    };
    this.syncLabels();
    this.apply();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Storage can be unavailable in private mode; settings still apply for the session.
    }
  };

  private show(): void {
    this.root.hidden = false;
  }

  private hide(): void {
    this.root.hidden = true;
  }

  private apply(): void {
    this.input.setSettings({
      deadzone: this.settings.deadzone,
      steerSensitivity: this.settings.steerSensitivity,
    });
    this.camera.setFovs(this.settings.chaseFov, this.settings.cockpitFov);
  }

  private syncInputs(): void {
    this.deadzone.value = String(this.settings.deadzone);
    this.steer.value = String(this.settings.steerSensitivity);
    this.chaseFov.value = String(this.settings.chaseFov);
    this.cockpitFov.value = String(this.settings.cockpitFov);
    this.syncLabels();
  }

  private syncLabels(): void {
    this.deadzoneValue.textContent = this.settings.deadzone.toFixed(2);
    this.steerValue.textContent = this.settings.steerSensitivity.toFixed(2);
    this.chaseFovValue.textContent = `${this.settings.chaseFov.toFixed(0)}°`;
    this.cockpitFovValue.textContent = `${this.settings.cockpitFov.toFixed(0)}°`;
  }
}

function required<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`missing element ${selector}`);
  return element;
}
