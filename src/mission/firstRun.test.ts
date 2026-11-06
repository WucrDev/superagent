import { describe, expect, it } from 'vitest';
import {
  FIRST_RUN_OBJECTIVES,
  FirstRunMission,
  atCabin,
  atRidgeLookout,
  formatRunTime,
  inDitchApproach,
  inToolPad,
  inWinchRecoveryZone,
} from './firstRun';

/** Ditch stop box / crossing points reused from the W4 acceptance run. */
const DITCH_STOP = { x: 28.6, z: 24.1 };
const DITCH_EAST_BANK = { x: 36.2, z: 24.3 };
const RAMP = { x: 53, z: 24.5 };
const WINCH_TRIAL = { x: 50, z: 152 };
const RIDGE = { x: 7, z: 61 };
const CABIN = { x: -9.6, z: 4.2 };

function started(): FirstRunMission {
  const mission = new FirstRunMission();
  expect(mission.start()).toBe(true);
  mission.drainEvents();
  return mission;
}

/** Drive the mission through to the requested objective index (0-based). */
function reach(mission: FirstRunMission, index: number): void {
  if (index > 0) {
    mission.plankPlaced(DITCH_STOP.x, DITCH_STOP.z);
    mission.tick(1 / 60, DITCH_EAST_BANK.x, DITCH_EAST_BANK.z);
  }
  if (index > 1) mission.recovered('jack', RAMP.x, RAMP.z);
  if (index > 2) mission.winchRecovered(WINCH_TRIAL.x, WINCH_TRIAL.z);
  if (index > 3) mission.photoCaptured(RIDGE.x, RIDGE.z);
  mission.drainEvents();
}

describe('first-run mission state', () => {
  it('starts idle, then exposes the five objectives in order', () => {
    const mission = new FirstRunMission();
    expect(mission.status).toBe('idle');
    expect(mission.snapshot.objectiveIndex).toBe(0);
    expect(mission.snapshot.objective.id).toBe('cross-ditch');
    expect(FIRST_RUN_OBJECTIVES.map((objective) => objective.id)).toEqual([
      'cross-ditch',
      'recover',
      'winch',
      'photo',
      'return',
    ]);
    expect(mission.start()).toBe(true);
    expect(mission.status).toBe('active');
    expect(mission.drainEvents()).toEqual([{ type: 'started' }]);
    expect(mission.start()).toBe(false);
  });

  it('does not complete the ditch without a plank, nor from the wrong bank', () => {
    const mission = started();
    mission.tick(0.5, DITCH_EAST_BANK.x, DITCH_EAST_BANK.z);
    expect(mission.objectiveIndex).toBe(0);
    mission.plankPlaced(0, 0);
    mission.tick(0.5, DITCH_EAST_BANK.x, DITCH_EAST_BANK.z);
    expect(mission.objectiveIndex).toBe(0);
    mission.plankPlaced(DITCH_STOP.x, DITCH_STOP.z);
    mission.tick(0.5, DITCH_STOP.x, DITCH_STOP.z);
    expect(mission.objectiveIndex).toBe(0);
    mission.tick(0.5, DITCH_EAST_BANK.x, DITCH_EAST_BANK.z);
    expect(mission.objectiveIndex).toBe(1);
  });

  it('ignores out-of-order events until their objective is current', () => {
    const mission = started();
    expect(mission.recovered('repair', RAMP.x, RAMP.z)).toBe(false);
    expect(mission.winchRecovered(WINCH_TRIAL.x, WINCH_TRIAL.z)).toBe(false);
    expect(mission.photoCaptured(RIDGE.x, RIDGE.z)).toBe(false);
    expect(mission.objectiveIndex).toBe(0);

    reach(mission, 1);
    expect(mission.recovered('repair', 0, 0)).toBe(false);
    expect(mission.recovered('repair', RAMP.x, RAMP.z)).toBe(true);
    expect(mission.objectiveIndex).toBe(2);
    expect(mission.winchRecovered(WINCH_TRIAL.x, WINCH_TRIAL.z)).toBe(true);
    expect(mission.objectiveIndex).toBe(3);
    expect(mission.photoCaptured(RIDGE.x, RIDGE.z)).toBe(true);
    expect(mission.objectiveIndex).toBe(4);
  });

  it('accepts either recovery route and either winch recovery zone', () => {
    const jackRun = started();
    reach(jackRun, 1);
    expect(jackRun.recovered('jack', RAMP.x, RAMP.z)).toBe(true);

    const repairRun = started();
    reach(repairRun, 1);
    expect(repairRun.recovered('repair', 60, 21)).toBe(true);

    reach(jackRun, 2);
    expect(jackRun.winchRecovered(50, 152)).toBe(true);
  });

  it('completes only after the photo and the return to the cabin', () => {
    const mission = started();
    reach(mission, 4);
    expect(mission.objectiveIndex).toBe(4);
    expect(mission.status).toBe('active');
    mission.tick(12.5, RIDGE.x, RIDGE.z);
    expect(mission.status).toBe('active');
    mission.tick(1 / 60, CABIN.x, CABIN.z);
    expect(mission.status).toBe('complete');
    const events = mission.drainEvents();
    expect(events.map((event) => event.type)).toEqual([
      'objective-complete',
      'complete',
    ]);
    const complete = events[1];
    if (complete.type !== 'complete') throw new Error('expected complete event');
    expect(complete.elapsedMs).toBeGreaterThan(12_000);
    expect(complete.bestMs).toBe(complete.elapsedMs);
    expect(complete.isBest).toBe(true);
    expect(mission.snapshot.completedIds).toHaveLength(5);
    expect(mission.snapshot.finished).toBe(true);
  });

  it('records the timer, keeps the best time, and restarts cleanly', () => {
    const mission = started();
    reach(mission, 4);
    mission.tick(30, CABIN.x, CABIN.z);
    expect(mission.status).toBe('complete');
    const firstBest = mission.snapshot.bestMs!;
    expect(firstBest).toBeGreaterThanOrEqual(30_000);
    mission.drainEvents();

    mission.restart();
    expect(mission.status).toBe('active');
    expect(mission.objectiveIndex).toBe(0);
    expect(mission.snapshot.elapsedMs).toBe(0);
    expect(mission.snapshot.bestMs).toBe(firstBest);
    expect(mission.drainEvents()).toEqual([{ type: 'restarted' }]);

    // A slower second run keeps the first best.
    reach(mission, 4);
    mission.tick(45, CABIN.x, CABIN.z);
    const events = mission.drainEvents();
    const complete = events.find((event) => event.type === 'complete');
    if (!complete || complete.type !== 'complete') throw new Error('expected complete event');
    expect(complete.isBest).toBe(false);
    expect(mission.snapshot.bestMs).toBe(firstBest);
  });

  it('round-trips checkpoint progress and never breaks objective order', () => {
    const mission = started();
    reach(mission, 3);
    mission.tick(4, RIDGE.x, RIDGE.z);
    const saved = mission.toSave();
    expect(saved).not.toBeNull();
    expect(saved!.status).toBe('active');
    expect(saved!.objectiveIndex).toBe(3);

    const restored = new FirstRunMission();
    expect(restored.restore(saved)).toBe(true);
    expect(restored.status).toBe('active');
    expect(restored.objectiveIndex).toBe(3);
    expect(restored.snapshot.completedIds).toEqual(['cross-ditch', 'recover', 'winch']);
    expect(restored.photoCaptured(RIDGE.x, RIDGE.z)).toBe(true);
    expect(restored.objectiveIndex).toBe(4);

    const completed = new FirstRunMission();
    expect(completed.restore({ ...saved!, status: 'complete', objectiveIndex: 3 })).toBe(true);
    expect(completed.status).toBe('complete');
    expect(completed.snapshot.objectiveIndex).toBe(5);
    expect(completed.snapshot.completedIds).toHaveLength(5);
  });

  it('rejects a foreign or malformed save and clamps progress consistently', () => {
    const mission = new FirstRunMission();
    expect(mission.restore(null)).toBe(false);
    expect(mission.restore({ ...mission.toSave()!, id: 'other' } as never)).toBe(false);
    expect(mission.status).toBe('idle');
    expect(
      mission.restore({
        id: 'first-run',
        status: 'active',
        objectiveIndex: 99,
        elapsedMs: -10,
        bestMs: -3,
      }),
    ).toBe(true);
    expect(mission.status).toBe('complete');
    expect(mission.objectiveIndex).toBe(5);
    expect(mission.snapshot.elapsedMs).toBe(0);
    expect(mission.snapshot.bestMs).toBe(0);
  });

  it('formats run times as mm:ss', () => {
    expect(formatRunTime(0)).toBe('00:00');
    expect(formatRunTime(9_400)).toBe('00:09');
    expect(formatRunTime(9 * 60_000 + 42_000)).toBe('09:42');
  });
});

describe('first-run trigger zones', () => {
  it('matches the W4 ditch stop box and east bank', () => {
    expect(inDitchApproach(DITCH_STOP.x, DITCH_STOP.z)).toBe(true);
    expect(inDitchApproach(DITCH_EAST_BANK.x, DITCH_EAST_BANK.z)).toBe(true);
    expect(inDitchApproach(0, 0)).toBe(false);
    expect(inToolPad(36.2, 24.3)).toBe(true);
    expect(inToolPad(20, 20)).toBe(false);
  });

  it('includes the practice anchor, the W3 trial, ridge and cabin', () => {
    expect(inWinchRecoveryZone(50, 152)).toBe(true);
    expect(inWinchRecoveryZone(44, 146)).toBe(true);
    expect(inWinchRecoveryZone(0, 0)).toBe(true);
    expect(inWinchRecoveryZone(3.5, 9)).toBe(true);
    expect(inWinchRecoveryZone(DITCH_STOP.x, DITCH_STOP.z)).toBe(false);
    expect(atRidgeLookout(7, 61)).toBe(true);
    expect(atRidgeLookout(3, 61)).toBe(true);
    expect(atRidgeLookout(0, 20)).toBe(false);
    expect(atCabin(-9.6, 4.2)).toBe(true);
    expect(atCabin(0, 0)).toBe(false);
  });
});
