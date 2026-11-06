import type { WorldInput } from '../core/input';
import { PHOTO_FILTERS, type PostFx } from '../core/postfx';
import { CAMERA_MODE_LABELS, type CameraRig } from '../vehicle/cameraRig';

export interface PhotoModeOptions {
  rig: CameraRig;
  postFx: PostFx;
  onShutter: () => void;
  onNotice: (text: string, tone?: 'info' | 'ok' | 'warn') => void;
  /** Mission hook: the captured PNG (data URL) and its pixel size. */
  onCapture?: (dataUrl: string, width: number, height: number) => void;
}

/**
 * W5 #19 / issue #25: the photo mode UI and capture flow.
 *
 * Gameplay HUD is hidden by the body class; the canvas itself never contains
 * DOM, so a captured PNG is always HUD-free. The shutter renders through the
 * same composer and filters the player sees, so the saved frame matches the
 * preview exactly.
 */
export class PhotoMode {
  private active = false;
  private stops = 0;
  private filterIndex = 0;
  private readonly root: HTMLElement;
  private readonly cameraLabel: HTMLElement;
  private readonly fovLabel: HTMLElement;
  private readonly exposureLabel: HTMLElement;
  private readonly filterLabel: HTMLElement;

  constructor(private readonly options: PhotoModeOptions) {
    this.root = required('#photoUi');
    this.cameraLabel = required('#photoCamera');
    this.fovLabel = required('#photoFov');
    this.exposureLabel = required('#photoEv');
    this.filterLabel = required('#photoFilterLabel');
    required('#photoShutter').addEventListener('click', () => this.shutter());
    required('#photoExit').addEventListener('click', () => this.exit());
    this.sync();
  }

  get isActive(): boolean {
    return this.active;
  }

  toggle(): void {
    if (this.active) this.exit();
    else this.enter();
  }

  enter(): void {
    if (this.active) return;
    this.active = true;
    this.stops = 0;
    this.filterIndex = 0;
    this.options.rig.setPhotoMode(true);
    this.options.postFx.setPhotoMode(true);
    this.options.postFx.setPhotoStops(0);
    this.options.postFx.setFilter(0);
    document.body.classList.add('photo-mode');
    this.root.hidden = false;
    this.sync();
    this.options.onNotice('拍照模式 · 滚轮 FOV · [ ] 曝光 · 1-5 滤镜 · 空格快门', 'info');
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    this.options.rig.setPhotoMode(false);
    this.options.postFx.setPhotoMode(false);
    this.options.postFx.setPhotoStops(0);
    this.options.postFx.setFilter(0);
    document.body.classList.remove('photo-mode');
    this.root.hidden = true;
  }

  handle(input: WorldInput): void {
    if (!this.active) return;
    if (input.filter !== null) {
      this.filterIndex = input.filter;
      this.options.postFx.setFilter(this.filterIndex);
      this.sync();
    }
    if (input.exposureDown) {
      this.stops = Math.max(-1, this.stops - 1);
      this.options.postFx.setPhotoStops(this.stops);
      this.sync();
    }
    if (input.exposureUp) {
      this.stops = Math.min(1, this.stops + 1);
      this.options.postFx.setPhotoStops(this.stops);
      this.sync();
    }
    if (input.shutter) this.shutter();
  }

  /** Render-free label refresh; called once per rendered frame. */
  sync(): void {
    if (!this.active) return;
    this.cameraLabel.textContent = CAMERA_MODE_LABELS[this.options.rig.mode];
    this.fovLabel.textContent = `${Math.round(this.options.rig.photoFovValue)}°`;
    this.exposureLabel.textContent =
      this.stops === 0 ? '0 EV' : `${this.stops > 0 ? '+' : ''}${this.stops} EV`;
    this.filterLabel.textContent = PHOTO_FILTERS[this.filterIndex]?.label ?? '原片';
  }

  /**
   * Capture the current canvas and trigger a browser download. Returns the PNG
   * data URL so an automated evidence pass can save it without relying on the
   * download prompt.
   */
  shutter(): string {
    const dataUrl = this.options.postFx.capture();
    const size = this.options.postFx.composerSize;
    this.options.onShutter();
    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const link = document.createElement('a');
    link.download = `over-the-hill-${stamp}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    link.remove();
    this.options.onCapture?.(dataUrl, size.width, size.height);
    this.options.onNotice(`照片已保存 · ${size.width}×${size.height}`, 'ok');
    return dataUrl;
  }
}

function required(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`missing photo UI element ${selector}`);
  return element;
}
