import {
  FIRST_RUN_OBJECTIVES,
  formatRunTime,
  type FirstRunSnapshot,
} from '../mission/firstRun';

export interface MissionHudCallbacks {
  /** Start the mission from the intro card. */
  onStart: () => void;
  /** Restart from the in-HUD "重开" button. */
  onRestart: () => void;
  /** Replay from the completion card. */
  onReplay: () => void;
  /** Dismiss the completion card and keep driving. */
  onFree: () => void;
}

/**
 * Directed-run UI: the top-right objective card, the intro card and the
 * completion card (time + photo). It owns no mission rules; main feeds it the
 * pure snapshot from FirstRunMission.
 */
export class MissionHud {
  private readonly hud: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly checklist: HTMLElement;
  private readonly restartButton: HTMLButtonElement;
  private readonly intro: HTMLElement;
  private readonly startButton: HTMLButtonElement;
  private readonly complete: HTMLElement;
  private readonly completeTime: HTMLElement;
  private readonly completeSummary: HTMLElement;
  private readonly photo: HTMLImageElement;
  private readonly replayButton: HTMLButtonElement;
  private readonly freeButton: HTMLButtonElement;
  private lastStatus = '';
  private lastIndex = -1;
  private lastSecond = -1;

  constructor(callbacks: MissionHudCallbacks) {
    this.hud = required('#missionHud');
    this.timer = required('#missionTimer');
    this.objective = required('#missionObjective');
    this.hint = required('#missionHint');
    this.checklist = required('#missionChecklist');
    this.restartButton = required<HTMLButtonElement>('#missionRestart');
    this.intro = required('#missionIntro');
    this.startButton = required<HTMLButtonElement>('#missionStart');
    this.complete = required('#missionComplete');
    this.completeTime = required('#missionCompleteTime');
    this.completeSummary = required('#missionCompleteSummary');
    this.photo = required<HTMLImageElement>('#missionPhoto');
    this.replayButton = required<HTMLButtonElement>('#missionReplay');
    this.freeButton = required<HTMLButtonElement>('#missionFree');

    this.startButton.addEventListener('click', () => callbacks.onStart());
    this.restartButton.addEventListener('click', () => callbacks.onRestart());
    this.replayButton.addEventListener('click', () => callbacks.onReplay());
    this.freeButton.addEventListener('click', () => callbacks.onFree());
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'Enter' || event.repeat) return;
      if (!this.intro.hidden) {
        event.preventDefault();
        callbacks.onStart();
      } else if (!this.complete.hidden) {
        event.preventDefault();
        callbacks.onReplay();
      }
    });
  }

  get introVisible(): boolean {
    return !this.intro.hidden;
  }

  get completeVisible(): boolean {
    return !this.complete.hidden;
  }

  /** Show the "开始第一趟" card on a fresh load. */
  showIntro(snapshot: FirstRunSnapshot): void {
    if (snapshot.status === 'complete') return;
    this.intro.hidden = false;
    document.body.classList.add('mission-overlay');
    this.startButton.focus({ preventScroll: true });
  }

  hideIntro(): void {
    if (this.intro.hidden) return;
    this.intro.hidden = true;
    document.body.classList.remove('mission-overlay');
  }

  showComplete(snapshot: FirstRunSnapshot, photoDataUrl: string | null): void {
    this.completeTime.textContent = formatRunTime(snapshot.elapsedMs);
    if (photoDataUrl) {
      this.photo.src = photoDataUrl;
      this.photo.hidden = false;
      this.photo.alt = '第一趟 · 山脊观景点照片';
    } else {
      this.photo.removeAttribute('src');
      this.photo.hidden = true;
    }
    this.completeSummary.textContent = snapshot.bestMs === null
      ? '本趟已写入木屋检查点。'
      : `本趟 ${formatRunTime(snapshot.elapsedMs)} · 最佳 ${formatRunTime(snapshot.bestMs)} · 已写入木屋检查点。`;
    this.complete.hidden = false;
    document.body.classList.add('mission-overlay');
    this.replayButton.focus({ preventScroll: true });
  }

  hideComplete(): void {
    if (this.complete.hidden) return;
    this.complete.hidden = true;
    document.body.classList.remove('mission-overlay');
  }

  /** Refresh the objective card. Cheap no-ops when nothing changed. */
  update(snapshot: FirstRunSnapshot): void {
    if (snapshot.status === 'idle') {
      this.hud.hidden = true;
      return;
    }
    this.hud.hidden = false;
    const second = Math.floor(snapshot.elapsedMs / 1000);
    if (second !== this.lastSecond) {
      this.lastSecond = second;
      this.timer.textContent = formatRunTime(snapshot.elapsedMs);
    }
    if (snapshot.status === this.lastStatus && snapshot.objectiveIndex === this.lastIndex) return;
    this.lastStatus = snapshot.status;
    this.lastIndex = snapshot.objectiveIndex;

    if (snapshot.status === 'complete') {
      this.objective.textContent = `第一趟完成 · 最佳 ${formatRunTime(snapshot.bestMs ?? snapshot.elapsedMs)}`;
      this.hint.textContent = '本趟已保存到木屋检查点 · 「重开」或完成页「再跑一趟」可以再跑一次';
    } else {
      const total = FIRST_RUN_OBJECTIVES.length;
      this.objective.textContent = `目标 ${snapshot.objectiveIndex + 1}/${total} · ${snapshot.objective.title}`;
      this.hint.textContent = snapshot.objective.hint;
    }

    const rows: HTMLElement[] = [];
    for (const [index, entry] of FIRST_RUN_OBJECTIVES.entries()) {
      const row = document.createElement('div');
      row.className = 'mission-step';
      if (index < snapshot.objectiveIndex) row.classList.add('done');
      else if (index === snapshot.objectiveIndex && snapshot.status === 'active') {
        row.classList.add('current');
      }
      const mark = document.createElement('span');
      mark.className = 'mission-step-mark';
      mark.textContent = index < snapshot.objectiveIndex ? '✓' : index === snapshot.objectiveIndex ? '●' : '○';
      const label = document.createElement('span');
      label.className = 'mission-step-label';
      label.textContent = entry.label;
      row.append(mark, label);
      rows.push(row);
    }
    this.checklist.replaceChildren(...rows);
    this.restartButton.hidden = false;
  }
}

function required<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`missing mission HUD element ${selector}`);
  return element;
}
