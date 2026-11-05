import type { EnvironmentSnapshot } from '../world/environment';

export type NoticeTone = 'info' | 'ok' | 'warn';

/**
 * W5 #20/#22: world clock, weather, headlight state, discovery count and the
 * checkpoint/discovery toast. Kept separate from the driving HUD so the photo
 * mode hide rule can treat them together without coupling their updates.
 */
export class WorldHud {
  private readonly clockElement: HTMLElement;
  private readonly weatherElement: HTMLElement;
  private readonly lightsElement: HTMLElement;
  private readonly discoveriesElement: HTMLElement;
  private readonly noticeElement: HTMLElement;
  private noticeTime = 0;

  constructor() {
    this.clockElement = required('#clock');
    this.weatherElement = required('#weather');
    this.lightsElement = required('#lights');
    this.discoveriesElement = required('#discoveries');
    this.noticeElement = required('#worldNotice');
  }

  update(snapshot: EnvironmentSnapshot, discovered: number, total: number): void {
    this.clockElement.textContent = snapshot.clock;
    this.clockElement.title = `${snapshot.phase} · 1 游戏日 ${snapshot.dayLengthMinutes} 分钟${
      snapshot.fastTime ? ' · 时间加速 ×8' : ''
    }`;
    this.weatherElement.textContent = snapshot.weatherLabel;
    this.weatherElement.className = `weather-${snapshot.weather}`;
    this.lightsElement.hidden = !snapshot.lightsOn;
    this.discoveriesElement.textContent = `发现 ${discovered}/${total}`;
    this.discoveriesElement.title = '已发现目标会随检查点写入存档';
  }

  notice(text: string, tone: NoticeTone = 'info', seconds = 4): void {
    this.noticeElement.hidden = false;
    this.noticeElement.textContent = text;
    this.noticeElement.className = tone;
    this.noticeTime = seconds;
  }

  tick(dt: number): void {
    if (this.noticeTime <= 0) return;
    this.noticeTime -= dt;
    if (this.noticeTime <= 0) {
      this.noticeElement.hidden = true;
      this.noticeTime = 0;
    }
  }
}

function required(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`missing world HUD element ${selector}`);
  return element;
}
