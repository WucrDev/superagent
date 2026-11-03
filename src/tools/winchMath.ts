import { clamp } from '../core/math';

/**
 * W3 winch tuning. Values follow docs/winch-design.md §4, §5, §7 and §9.
 * Everything here is data plus pure formulas so it can be tested without a
 * renderer or a physics world.
 */
export const WINCH = {
  /** Candidate detection range, metres (§2 / §9). */
  range: 12,
  /** Auto-aim half-angle. The design's 60° cone is read as ±60° here so the
   *  design's near/off-angle counterexamples can be steered by score instead
   *  of being impossible to select. */
  autoConeDeg: 60,
  /** Spool length, metres (§9). */
  ropeLength: 10,
  /** PBD segments and solver iterations (§4 / §9). */
  segments: 16,
  iterations: 4,
  /** PBD constraint stiffness and velocity damping (§4). */
  stiffness: 0.6,
  damping: 0.15,
  /** Maximum elastic stretch before the rope reaches its tension limit (§4). */
  maxStretch: 0.08,
  /** Peak tension = 1.5 × vehicle weight (§4). */
  maxTensionFactor: 1.5,
  gravity: 9.81,
  /** Reel speed at zero load / peak load, metres per second (§4 / §9). */
  reelFast: 2.0,
  reelSlow: 0.8,
  /** Over-tension time before the rope snaps (§4 / §7). */
  breakTime: 1.2,
  /** Time a load above an anchor's strength takes to pull it out (§7). */
  anchorFailTime: 1.5,
  /** Hook flight time (§2). */
  attachTime: 0.3,
  /** Score below this is highlighted red but still selectable (§3.2). */
  autoScore: 25,
  /** How long a bush hook stays on before slipping off (§7). */
  bushDetachTime: 0.5,
  /** Minimum delay before re-attaching after release / failure. */
  retryCooldown: 0.8,
  /** Temporary righting action until the W4 jack exists (§7). */
  rightingTime: 10,
  /** Spool-out speed when the reel key is released. */
  slackPush: 2.0,
  /** Recoil speed of the car when the rope snaps, m/s (§4 / §7). */
  breakRecoil: 0.9,
} as const;

export interface AnchorScoreInput {
  /** Angle between the car's expected pull direction and the anchor, degrees. */
  angleDeg: number;
  /** Hook-to-anchor distance, metres. */
  distance: number;
  /** Anchor height minus hook height, metres. */
  heightDiff: number;
  /** Structural strength on the design's 0–120 scale. */
  strength: number;
}

/**
 * docs/winch-design.md §3.2:
 *   score = 100 - 2.0 × angle - 1.2 × max(0, distance - 4)
 *                - 3.0 × max(0, heightDiff - 2) + strengthAdjust
 * Returns 0–100.
 */
export function scoreAnchor(input: AnchorScoreInput): number {
  const strengthAdjust = clamp((input.strength - 100) * 0.75, -15, 15);
  const heightPenalty = 3 * Math.max(0, input.heightDiff - 2);
  const raw =
    100 -
    2 * Math.abs(input.angleDeg) -
    1.2 * Math.max(0, input.distance - 4) -
    heightPenalty +
    strengthAdjust;
  return clamp(raw, 0, 100);
}

/** Peak winch tension for a vehicle mass: 1.5 × m × g. */
export function maxTensionFor(massKg: number): number {
  return WINCH.maxTensionFactor * massKg * WINCH.gravity;
}

/**
 * The force an anchor can take before it starts to fail. Deliberately below the
 * rope limit so a weak stump fails before the rope on the same pull.
 */
export function anchorFailForce(strength: number, maxTension: number): number {
  if (strength <= 0) return 0;
  return (strength / 100) * 0.8 * maxTension;
}

/** Reel speed falls from 2.0 m/s at no load to 0.8 m/s at peak tension. */
export function reelSpeedFor(load: number): number {
  return WINCH.reelFast + (WINCH.reelSlow - WINCH.reelFast) * clamp(load, 0, 1);
}

/** Unclamped tension implied by a rope stretch ratio (max stretch = 8 %). */
export function tensionFromStretch(stretchRatio: number, maxTension: number): number {
  return (Math.max(0, stretchRatio) / WINCH.maxStretch) * maxTension;
}

/** Advance a "load stayed above the limit" timer; drains when no longer loaded. */
export function accumulateLoadTime(
  current: number,
  loaded: boolean,
  dt: number,
  decay = 2,
): number {
  if (loaded) return current + dt;
  return Math.max(0, current - decay * dt);
}

/** Auto-aim only considers the forward cone. */
export function isInAutoCone(angleDeg: number, halfAngleDeg = WINCH.autoConeDeg): boolean {
  return Math.abs(angleDeg) <= halfAngleDeg;
}

export interface CandidateFacts {
  visible: boolean;
  inCone: boolean;
  reachable: boolean;
  autoSelectable: boolean;
  score: number;
}

/** Auto-aim picks the highest score among visible, in-cone, reachable anchors. */
export function pickAutoCandidate<T extends CandidateFacts>(
  candidates: readonly T[],
): T | null {
  let best: T | null = null;
  for (const candidate of candidates) {
    if (!candidate.visible || !candidate.inCone || !candidate.reachable) continue;
    if (!candidate.autoSelectable) continue;
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best;
}

/**
 * Manual aim can select any visible anchor, including bushes and anchors that
 * are visible but beyond the 10 m spool; the hook then reports "too far" so the
 * player learns the rope limit instead of the anchor silently disappearing.
 */
export function manualCandidates<T extends CandidateFacts>(
  candidates: readonly T[],
): T[] {
  return candidates
    .filter((candidate) => candidate.visible)
    .sort((a, b) => b.score - a.score);
}
