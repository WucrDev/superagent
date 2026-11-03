import { clamp } from '../core/math';
import { ANCHOR_TYPES } from '../tools/anchorTypes';
import type { WinchSnapshot } from '../tools/winch';
import { WINCH } from '../tools/winchMath';

const MAX_DOTS = 12;

/**
 * W3 #18/#19: optional tension bar + angle ring (design §6 says default off;
 * H toggles it). The small prompt below the car is always available so the
 * player can tell "pull / slip / about to break" without opening the full HUD.
 */
export class WinchHud {
  private readonly root: HTMLElement;
  private readonly stateElement: HTMLElement;
  private readonly anchorElement: HTMLElement;
  private readonly scoreElement: HTMLElement;
  private readonly messageElement: HTMLElement;
  private readonly tensionFill: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly line: SVGLineElement;
  private readonly dots: SVGCircleElement[] = [];
  private visible = false;
  private lastUpdate = 0;

  constructor() {
    this.root = required('#winchHud');
    this.stateElement = required('#winchState');
    this.anchorElement = required('#winchAnchor');
    this.scoreElement = required('#winchScore');
    this.messageElement = required('#winchMessage');
    this.tensionFill = required('#winchTensionFill');
    this.prompt = required('#winchPrompt');
    this.line = required<SVGLineElement>('#winchLine');
    const dotsGroup = required<SVGGElement>('#winchDots');

    for (let index = 0; index < MAX_DOTS; index += 1) {
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('r', '3.4');
      dot.setAttribute('class', 'winch-dot');
      dot.style.display = 'none';
      dotsGroup.appendChild(dot);
      this.dots.push(dot);
    }

    this.setVisible(false);
  }

  get isVisible(): boolean {
    return this.visible;
  }

  toggle(): boolean {
    this.setVisible(!this.visible);
    return this.visible;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.root.hidden = !visible;
  }

  update(snapshot: WinchSnapshot): void {
    this.updatePrompt(snapshot);
    if (!this.visible) return;

    const now = performance.now();
    if (now - this.lastUpdate < 50) return;
    this.lastUpdate = now;

    this.stateElement.textContent = snapshot.status;
    this.stateElement.style.color = statusColor(snapshot);
    this.anchorElement.textContent = snapshot.selected
      ? `${ANCHOR_TYPES[snapshot.selected.anchor.kind].label} · ${snapshot.selected.anchor.label}`
      : '无目标';
    this.scoreElement.textContent = snapshot.selected
      ? `距离 ${snapshot.selected.distance.toFixed(1)} m · 角度 ${Math.round(
          snapshot.selected.angleDeg,
        )}° · 评分 ${Math.round(snapshot.selected.score)}`
      : snapshot.hint || '12 m / 60° 内没有可挂锚点';
    this.scoreElement.classList.toggle(
      'danger',
      snapshot.selected !== null && snapshot.selected.score < WINCH.autoScore,
    );
    this.messageElement.textContent = snapshot.message;

    const load = clamp(snapshot.load, 0, 1);
    this.tensionFill.style.width = `${(load * 100).toFixed(0)}%`;
    this.tensionFill.classList.toggle(
      'danger',
      load > 0.9 || snapshot.breakProgress > 0.2,
    );
    this.tensionFill.classList.toggle('warn', load > 0.62 && load <= 0.9);

    this.updateRing(snapshot);
  }

  private updatePrompt(snapshot: WinchSnapshot): void {
    let text = '';
    let tone = '';
    if (snapshot.state === 'rolled') {
      text =
        snapshot.rightingProgress > 0
          ? `翻正中 ${(WINCH.rightingTime * (1 - snapshot.rightingProgress)).toFixed(
              1,
            )} s · 按住 J`
          : '侧翻 · 按住 J 翻正（10 s）';
      tone = 'warn';
    } else if (snapshot.state === 'broken' || snapshot.state === 'anchorFailed') {
      text = snapshot.message || (snapshot.state === 'broken' ? '绳断了' : '锚点脱落');
      tone = 'danger';
    } else if (snapshot.stall) {
      const remaining = (1 - snapshot.breakProgress) * 1.2;
      text =
        snapshot.breakProgress > 0.15
          ? `拉不动 · 即将断绳 ${remaining.toFixed(1)} s · 松开 F 卸力`
          : '拉不动 · 换个角度/锚点，或踩油门辅助';
      tone = snapshot.breakProgress > 0.15 ? 'danger' : 'warn';
    } else if (snapshot.breakProgress > 0.15) {
      const remaining = (1 - snapshot.breakProgress) * 1.2;
      text = `即将断绳 ${remaining.toFixed(1)} s · 松开 F 卸力`;
      tone = 'danger';
    } else if (snapshot.state === 'attaching') {
      text = '挂钩中…（约 0.3 s）';
    } else if (snapshot.attached) {
      text = `已挂钩 · 继续按住 F 收绳 · G 松绳 · H 张力条${
        snapshot.slipping ? ' · 轮胎打滑' : ''
      }`;
      tone = snapshot.slipping ? 'warn' : '';
    } else if (snapshot.slipping) {
      text = '轮胎打滑 · 力在，但地面抓不住';
      tone = 'warn';
    } else if (snapshot.state === 'aiming') {
      text = snapshot.selected
        ? `按住 F 瞄准 · G 挂钩 · X 换锚 · V 自动 ｜ ${snapshot.selected.anchor.label}（评分 ${Math.round(
            snapshot.selected.score,
          )}）`
        : `按住 F 瞄准 ｜ ${snapshot.hint || '12 m / 60° 内没有可选锚点'}`;
    }

    this.prompt.hidden = text === '';
    this.prompt.textContent = text;
    this.prompt.classList.toggle('warn', tone === 'warn');
    this.prompt.classList.toggle('danger', tone === 'danger');
  }

  private updateRing(snapshot: WinchSnapshot): void {
    const visibleCandidates = snapshot.candidates
      .filter(
        (candidate) =>
          candidate.visible || candidate.anchor === snapshot.attached,
      )
      .slice(0, MAX_DOTS);
    let selectedPlaced = false;
    this.line.style.display = 'none';

    for (let index = 0; index < this.dots.length; index += 1) {
      const dot = this.dots[index]!;
      const candidate = visibleCandidates[index];
      if (!candidate) {
        dot.style.display = 'none';
        continue;
      }
      const selected = candidate === snapshot.selected;
      const rad = (candidate.signedAngleDeg * Math.PI) / 180;
      const radius = 18 + 36 * clamp(candidate.distance / WINCH.range, 0, 1);
      dot.setAttribute('cx', String(Math.sin(rad) * radius));
      dot.setAttribute('cy', String(-Math.cos(rad) * radius));
      dot.style.display = '';
      dot.setAttribute(
        'class',
        `winch-dot${selected ? ' selected' : ''}${
          candidate.score < WINCH.autoScore ? ' danger' : ''
        }`,
      );

      if (selected) {
        this.line.setAttribute('x2', String(Math.sin(rad) * radius));
        this.line.setAttribute('y2', String(-Math.cos(rad) * radius));
        this.line.style.display = '';
        selectedPlaced = true;
      }
    }

    if (!selectedPlaced) this.line.style.display = 'none';
  }
}

function statusColor(snapshot: WinchSnapshot): string {
  if (
    snapshot.state === 'broken' ||
    snapshot.state === 'anchorFailed' ||
    snapshot.breakProgress > 0.2
  ) {
    return '#ffb4a2';
  }
  return '#f0c35a';
}

function required<T extends Element = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`missing element ${selector}`);
  return element;
}
