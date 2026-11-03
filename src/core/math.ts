export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Frame-rate independent exponential smoothing. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

/** Radial deadzone with rescaling so the first movement past the deadzone is smooth. */
export function applyDeadzone(value: number, deadzone: number): number {
  const abs = Math.abs(value);
  if (abs <= deadzone) return 0;
  const scaled = (abs - deadzone) / Math.max(1e-6, 1 - deadzone);
  return Math.sign(value) * Math.min(1, scaled);
}
