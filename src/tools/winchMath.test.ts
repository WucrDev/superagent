import { describe, expect, it } from 'vitest';
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
  type CandidateFacts,
} from './winchMath';

describe('W3 winch design constants', () => {
  it('keeps the documented ranges and timings', () => {
    expect(WINCH.range).toBe(12);
    expect(WINCH.autoConeDeg).toBe(60);
    expect(WINCH.ropeLength).toBe(10);
    expect(WINCH.segments).toBe(16);
    expect(WINCH.iterations).toBe(4);
    expect(WINCH.maxStretch).toBe(0.08);
    expect(WINCH.breakTime).toBe(1.2);
    expect(WINCH.anchorFailTime).toBe(1.5);
    expect(WINCH.attachTime).toBe(0.3);
    expect(WINCH.autoScore).toBe(25);
    expect(WINCH.bushDetachTime).toBe(0.5);
  });
});

describe('anchor scoring', () => {
  it('matches the §3.2 formula for a tree', () => {
    expect(
      scoreAnchor({ angleDeg: 0, distance: 8, heightDiff: 0, strength: 100 }),
    ).toBeCloseTo(95.2, 3);
    expect(
      scoreAnchor({ angleDeg: 20, distance: 8, heightDiff: 0, strength: 100 }),
    ).toBeCloseTo(55.2, 3);
    expect(
      scoreAnchor({ angleDeg: 0, distance: 5, heightDiff: 3, strength: 100 }),
    ).toBeCloseTo(95.8, 3);
  });

  it('clamps bad geometry to 0 but still allows manual selection', () => {
    expect(
      scoreAnchor({ angleDeg: 80, distance: 2, heightDiff: 0, strength: 100 }),
    ).toBe(0);
    expect(
      scoreAnchor({ angleDeg: 90, distance: 12, heightDiff: 0, strength: 100 }),
    ).toBe(0);
  });

  it('applies the ±15 structural-strength adjustment', () => {
    const tree = scoreAnchor({
      angleDeg: 20,
      distance: 6,
      heightDiff: 0,
      strength: 100,
    });
    const rock = scoreAnchor({
      angleDeg: 20,
      distance: 6,
      heightDiff: 0,
      strength: 120,
    });
    const stump = scoreAnchor({
      angleDeg: 20,
      distance: 6,
      heightDiff: 0,
      strength: 60,
    });
    expect(rock - tree).toBeCloseTo(15, 3);
    expect(tree - stump).toBeCloseTo(15, 3);
  });

  it('marks scores below the 25 auto threshold', () => {
    const bad = scoreAnchor({
      angleDeg: 40,
      distance: 8,
      heightDiff: 0,
      strength: 100,
    });
    expect(bad).toBeLessThan(WINCH.autoScore);
  });
});

describe('tension model', () => {
  it('uses 1.5 × weight as the peak tension', () => {
    expect(maxTensionFor(1500)).toBeCloseTo(22072.5, 1);
  });

  it('maps stretch to tension with an 8 % elastic limit', () => {
    const max = maxTensionFor(1500);
    expect(tensionFromStretch(0, max)).toBe(0);
    expect(tensionFromStretch(0.08, max)).toBeCloseTo(max, 6);
    expect(tensionFromStretch(0.16, max)).toBeCloseTo(max * 2, 6);
  });

  it('slows the reel under load', () => {
    expect(reelSpeedFor(0)).toBeCloseTo(2, 6);
    expect(reelSpeedFor(0.5)).toBeCloseTo(1.4, 6);
    expect(reelSpeedFor(1)).toBeCloseTo(0.8, 6);
  });

  it('puts anchor failure below the rope limit', () => {
    const max = maxTensionFor(1500);
    expect(anchorFailForce(0, max)).toBe(0);
    expect(anchorFailForce(60, max)).toBeLessThan(anchorFailForce(100, max));
    expect(anchorFailForce(100, max)).toBeLessThan(max);
    expect(anchorFailForce(120, max)).toBeCloseTo(max * 0.96, 3);
  });

  it('accumulates over-limit time and drains when unloaded', () => {
    expect(accumulateLoadTime(0, true, 0.4)).toBeCloseTo(0.4, 6);
    expect(accumulateLoadTime(0.4, true, 0.4)).toBeCloseTo(0.8, 6);
    expect(accumulateLoadTime(0.8, false, 0.2)).toBeCloseTo(0.4, 6);
    expect(accumulateLoadTime(0.1, false, 1)).toBe(0);
  });
});

describe('anchor selection', () => {
  const candidates: (CandidateFacts & { id: string })[] = [
    { id: 'tree-best', score: 96, visible: true, inCone: true, reachable: true, autoSelectable: true },
    { id: 'tree-off-cone', score: 70, visible: true, inCone: false, reachable: true, autoSelectable: true },
    { id: 'tree-hidden', score: 99, visible: false, inCone: true, reachable: true, autoSelectable: true },
    { id: 'tree-too-far', score: 80, visible: true, inCone: true, reachable: false, autoSelectable: true },
    { id: 'bush', score: 10, visible: true, inCone: true, reachable: true, autoSelectable: false },
    { id: 'tree-next', score: 60, visible: true, inCone: true, reachable: true, autoSelectable: true },
  ];

  it('auto-picks the best selectable in-cone anchor', () => {
    expect(pickAutoCandidate(candidates)?.id).toBe('tree-best');
  });

  it('manual selection includes bushes and off-cone anchors, sorted by score', () => {
    const manual = manualCandidates(candidates).map((candidate) => candidate.id);
    expect(manual).toEqual(['tree-best', 'tree-too-far', 'tree-off-cone', 'tree-next', 'bush']);
    expect(manual[manual.length - 1]).toBe('bush');
  });

  it('uses a 60° half-angle cone', () => {
    expect(isInAutoCone(0)).toBe(true);
    expect(isInAutoCone(60)).toBe(true);
    expect(isInAutoCone(-60)).toBe(true);
    expect(isInAutoCone(60.5)).toBe(false);
  });
});
